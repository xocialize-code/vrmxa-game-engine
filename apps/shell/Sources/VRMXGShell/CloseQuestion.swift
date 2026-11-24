import AppKit
import WebKit

/// Asking the page before the window closes or the app quits (shell 0.9.0, AB-T-0593), for an app whose
/// `ShellConfiguration` sets `asksBeforeClosing`. Without it the shell closes and quits without consulting the page, as
/// before.
///
/// File › Close Window, the close button and Quit don't act at once. The page hears
///   `window.closing { id, reason: "close" | "quit" }`
/// and answers with the bridge method
///   `window.closeReply { id, answer: "wait" | "close" | "cancel" }` → `{ pending }`
/// - `"wait"`: the page heard the question and is asking the person (its unsaved-changes sheet). The shell then waits
///   as long as the person takes.
/// - `"close"`: go on (nothing unsaved, or the person chose Save and it saved, or Don't Save).
/// - `"cancel"`: keep the window and the app.
///
/// A page that answers nothing within `timeout` seconds is taken to be hung, and the shell goes on closing: a hung
/// page can't block quitting. While the page says the person is deciding, the shell keeps checking that the page is
/// alive (`ping`, a round trip through its JavaScript every `timeout` seconds): two checks in a row with no reply and
/// it goes on, so a page that said "wait" and then hung can't block quitting either (AppKit disables Quit while a quit
/// waits, so the person couldn't ask again). Asking again while a question is open (⌘W twice, or ⌘Q while a close is
/// being decided) sends the same question again, and the page has to answer again within the timeout. A page that
/// reloads or whose process ends while a question is open has nothing left to save: the shell goes on.
/// `shell.js`'s `onClosing(decide)` does the page's side.
@MainActor
final class CloseQuestion {
    enum Reason: String { case close, quit }

    struct Pending {
        let id: String
        var reason: Reason
        /// The page said the person is deciding: no timeout until the question is asked again.
        var waiting = false
        /// Counts the times this question was sent: a timer only acts for the round that armed it.
        var round = 0
    }

    private(set) var pending: Pending?
    let timeout: TimeInterval
    /// Sends the page an event.
    let emit: (String, [String: Any]) -> Void
    /// Asks the page's JavaScript for any reply at all (is it alive?) and calls back when it comes. nil: not checked.
    let ping: ((@escaping @MainActor () -> Void) -> Void)?
    /// The outcome of a question: its reason, and whether to go on (close the window, quit).
    let decided: (Reason, Bool) -> Void
    private var asked = 0

    init(timeout: TimeInterval, emit: @escaping (String, [String: Any]) -> Void, ping: ((@escaping @MainActor () -> Void) -> Void)? = nil,
         decided: @escaping (Reason, Bool) -> Void) {
        self.timeout = timeout; self.emit = emit; self.ping = ping; self.decided = decided
    }

    /// The window is asked to close, or the app to quit: the page is asked (again, if a question is already open; a
    /// quit that arrives while a close is being decided makes the open question a quit).
    func ask(_ reason: Reason) {
        if var p = pending {
            if reason == .quit { p.reason = .quit }
            p.waiting = false; p.round += 1
            pending = p
        } else {
            asked += 1
            pending = Pending(id: "close-\(asked)", reason: reason)
        }
        guard let p = pending else { return }
        emit("window.closing", ["id": p.id, "reason": p.reason.rawValue])
        let (id, round) = (p.id, p.round)
        Task { @MainActor [weak self] in
            try? await Task.sleep(for: .seconds(self?.timeout ?? 0))
            guard let self, let now = self.pending, now.id == id, now.round == round, !now.waiting else { return }
            print("[shell] the page didn't answer window.closing in \(self.timeout) s: closing")
            self.finish(true)
        }
    }

    /// The page's answer. An answer to a question that is no longer open (it timed out, or was already answered) does
    /// nothing: `{ pending: false }`.
    func answer(id: String, answer: String) throws -> [String: Any] {
        guard ["wait", "close", "cancel"].contains(answer) else { throw BridgeError("bad_params", "answer is \"wait\", \"close\" or \"cancel\"") }
        guard let p = pending, p.id == id else { return ["pending": false] }
        switch answer {
        case "wait":
            pending?.waiting = true
            watch(id: p.id, round: p.round)
        case "close": finish(true)
        default: finish(false)
        }
        return ["pending": pending != nil]
    }

    /// While the person decides, check that the page is still alive: a ping every `timeout` seconds, and after two in
    /// a row with no reply the page is taken to be hung and the close goes on. Ends with the question (or its round).
    private func watch(id: String, round: Int) {
        guard let ping else { return }
        Task { @MainActor [weak self] in
            var missed = 0
            while missed < 2 {
                final class Reply { var came = false }
                let reply = Reply()
                ping { reply.came = true }
                try? await Task.sleep(for: .seconds(self?.timeout ?? 0))
                guard let self, let now = self.pending, now.id == id, now.round == round, now.waiting else { return }
                missed = reply.came ? 0 : missed + 1
            }
            guard let self else { return }
            print("[shell] the page stopped answering while it was asking (\(2 * self.timeout) s): closing")
            self.finish(true)
        }
    }

    /// The page went (a reload, its process ended) with a question open: there is nothing left to ask, so go on.
    func pageGone() { if pending != nil { finish(true) } }

    private func finish(_ goOn: Bool) {
        guard let p = pending else { return }
        pending = nil
        decided(p.reason, goOn)
    }
}

extension ShellAppDelegate {
    /// Is the page asked before a close or a quit? Only for an app that opted in, with a page to ask, and not once the
    /// page has already said to go on (closing the last window quits the app: that quit isn't asked again).
    var asksPage: Bool { config.asksBeforeClosing && pageLoaded && !closeApproved }

    func registerCloseMethods() {
        guard config.asksBeforeClosing else { return }
        router.register("window.closeReply") { [unowned self] p in
            try self.closing.answer(id: try p.require("id"), answer: try p.require("answer"))
        }
    }

    func makeCloseQuestion() -> CloseQuestion {
        // weak: a question's timers can outlive a delegate made for a test
        CloseQuestion(timeout: config.closeTimeout, emit: { [weak self] name, payload in self?.emit(name, payload) }, ping: { [weak self] reply in
            self?.webView.evaluateJavaScript("1") { _, _ in reply() } // any reply: the page's JavaScript is running
        }, decided: { [weak self] reason, goOn in
            guard let self else { return }
            if goOn { self.closeApproved = true }
            switch reason {
            case .close: if goOn { self.window.close() }
            case .quit: self.replyToTerminate(goOn)
            }
        })
    }
}
