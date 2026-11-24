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
/// **A page that doesn't answer.** One that answers nothing within `timeout` seconds isn't answering: hung, or busy
/// (a world being built, an export frame). While the page says the person is deciding, the shell keeps checking that
/// it is alive (`ping`, a round trip through its JavaScript every `timeout` seconds), and two checks in a row with no
/// reply count the same. What happens then depends on what the page said last about its work (`window.setEdited`,
/// `shell.js`'s `setEdited`): with nothing unsaved the shell goes on, so a hung page can't block quitting; with
/// unsaved work it asks the person itself (`confirm`, an alert of the shell's own: Wait, or Close Anyway), because a
/// busy page mustn't lose work without a question. Wait asks the page again.
///
/// **A question that never ends.** Asking again while the page's own question is up (⌘W or ⌘Q a second time) brings
/// the same alert (Go Back, or Close Anyway): however the page behaves, the person has a way out, and the page is
/// never closed over their head. Asking again before the page has answered sends the question again; a quit that
/// arrives then makes the open question a quit. A page that reloads or whose process ends while a question is open
/// has nothing left to save: the shell goes on. `shell.js`'s `onClosing(decide)` does the page's side.
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

    /// Why the shell asks the person itself.
    enum Stuck: String {
        /// The page hasn't answered (busy or hung), and it holds unsaved work.
        case notAnswering
        /// The person asked again while the page's own question is up.
        case stillAsking
    }

    private(set) var pending: Pending?
    /// The page's last word on whether the window holds unsaved work (`window.setEdited`). false until it says so.
    var unsaved = false
    /// The shell's own alert is up (`confirm` hasn't called back yet).
    private(set) var confirming: Stuck?
    private var confirmation = 0
    let timeout: TimeInterval
    /// Sends the page an event.
    let emit: (String, [String: Any]) -> Void
    /// Asks the page's JavaScript for any reply at all (is it alive?) and calls back when it comes. nil: not checked.
    let ping: ((@escaping @MainActor () -> Void) -> Void)?
    /// Asks the person, in an alert of the shell's own, whether to go on anyway; calls back with true to go on. nil:
    /// the shell never asks (a page that isn't answering is closed, and asking again only sends the question again).
    let confirm: ((Stuck, Reason, @escaping @MainActor (Bool) -> Void) -> Void)?
    /// Takes the shell's alert down (the page answered meanwhile).
    let dismiss: (() -> Void)?
    /// The outcome of a question: its reason, and whether to go on (close the window, quit).
    let decided: (Reason, Bool) -> Void
    /// Waits `timeout` seconds (the answer's deadline, and the time between pings). The tests pass their own, which
    /// returns when they say so, so none of them depends on how busy the machine is.
    let sleep: @MainActor (TimeInterval) async -> Void
    private var asked = 0

    init(timeout: TimeInterval, emit: @escaping (String, [String: Any]) -> Void, ping: ((@escaping @MainActor () -> Void) -> Void)? = nil,
         confirm: ((Stuck, Reason, @escaping @MainActor (Bool) -> Void) -> Void)? = nil, dismiss: (() -> Void)? = nil,
         sleep: @escaping @MainActor (TimeInterval) async -> Void = { try? await Task.sleep(for: .seconds($0)) },
         decided: @escaping (Reason, Bool) -> Void) {
        self.timeout = timeout; self.emit = emit; self.ping = ping; self.confirm = confirm; self.dismiss = dismiss; self.sleep = sleep; self.decided = decided
    }

    /// The window is asked to close, or the app to quit. The page is asked. Asked again before the page has answered,
    /// the question is sent again (a quit then makes the open question a quit); asked again while the page's own
    /// question is up, the person is asked by the shell (their way out of a question that never ends).
    func ask(_ reason: Reason) {
        if confirming != nil { return } // the shell's alert is up: that decides
        if var p = pending {
            if p.waiting, confirm != nil { askPerson(.stillAsking); return }
            if reason == .quit { p.reason = .quit }
            pending = p
            send()
        } else {
            asked += 1
            pending = Pending(id: "close-\(asked)", reason: reason)
            send(first: true)
        }
    }

    /// Send the open question to the page (again), and give it `timeout` seconds to answer.
    private func send(first: Bool = false) {
        guard var p = pending else { return }
        if !first { p.waiting = false; p.round += 1; pending = p }
        emit("window.closing", ["id": p.id, "reason": p.reason.rawValue])
        let (id, round) = (p.id, p.round)
        Task { @MainActor [weak self, sleep, timeout] in
            await sleep(timeout)
            guard let self, let now = self.pending, now.id == id, now.round == round, !now.waiting else { return }
            self.notAnswering("the page didn't answer window.closing in \(self.timeout) s")
        }
    }

    /// The page isn't answering. With unsaved work the person is asked (Wait, or Close Anyway); with none, go on.
    private func notAnswering(_ what: String) {
        guard pending != nil, confirming == nil else { return }
        if unsaved, confirm != nil { print("[shell] \(what), and it has unsaved work: asking"); askPerson(.notAnswering); return }
        print("[shell] \(what): closing")
        finish(true)
    }

    /// The shell's own question. Go on: the close goes on. Otherwise: a page that wasn't answering is asked again
    /// (Wait); a page that is still asking keeps its question (Go Back).
    private func askPerson(_ why: Stuck) {
        guard let p = pending, let confirm else { return }
        confirming = why
        confirmation += 1
        let (id, mine) = (p.id, confirmation)
        confirm(why, p.reason) { [weak self] goOn in
            guard let self, self.confirmation == mine, self.confirming != nil else { return } // taken down meanwhile
            self.confirming = nil
            guard let now = self.pending, now.id == id else { return }
            if goOn { self.finish(true) } else if why == .notAnswering { self.send() }
        }
    }

    /// The shell's alert isn't needed any more (the page answered): take it down, and ignore its answer.
    private func standDown() {
        guard confirming != nil else { return }
        confirming = nil
        confirmation += 1
        dismiss?()
    }

    /// The page's answer. An answer to a question that is no longer open (it timed out, or was already answered) does
    /// nothing: `{ pending: false }`.
    func answer(id: String, answer: String) throws -> [String: Any] {
        guard ["wait", "close", "cancel"].contains(answer) else { throw BridgeError("bad_params", "answer is \"wait\", \"close\" or \"cancel\"") }
        guard let p = pending, p.id == id else { return ["pending": false] }
        switch answer {
        case "wait":
            pending?.waiting = true
            if confirming == .notAnswering { standDown() } // it answers after all: its own question is up now
            watch(id: p.id, round: p.round)
        case "close": finish(true)
        default: finish(false)
        }
        return ["pending": pending != nil]
    }

    /// While the person decides, check that the page is still alive: a ping every `timeout` seconds, and after two in
    /// a row with no reply the page isn't answering (`notAnswering`). Ends with the question (or its round).
    private func watch(id: String, round: Int) {
        guard let ping else { return }
        Task { @MainActor [weak self, sleep, timeout] in
            var missed = 0
            while missed < 2 {
                final class Reply { var came = false }
                let reply = Reply()
                ping { reply.came = true }
                await sleep(timeout)
                guard let self, let now = self.pending, now.id == id, now.round == round, now.waiting else { return }
                missed = reply.came ? 0 : missed + 1
            }
            self?.notAnswering("the page stopped answering while it was asking (\(2 * (self?.timeout ?? 0)) s)")
        }
    }

    /// The page went (a reload, its process ended) with a question open: there is nothing left to ask, so go on.
    func pageGone() { if pending != nil { finish(true) } }

    private func finish(_ goOn: Bool) {
        guard let p = pending else { return }
        pending = nil
        standDown()
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
        // The page says whether the window holds unsaved work: the close button's dot, and what the shell goes by
        // when the page can't answer a close in time.
        router.register("window.setEdited") { [unowned self] p in
            guard let edited = p.bool("edited") else { throw BridgeError("bad_params", "missing boolean parameter \"edited\"") }
            self.window.isDocumentEdited = edited
            self.closing.unsaved = edited
            return ["edited": edited]
        }
    }

    /// `sleep`: the question's clock (a test passes its own).
    func makeCloseQuestion(sleep: (@MainActor (TimeInterval) async -> Void)? = nil) -> CloseQuestion {
        // weak: a question's timers can outlive a delegate made for a test
        CloseQuestion(timeout: config.closeTimeout, emit: { [weak self] name, payload in self?.emit(name, payload) }, ping: { [weak self] reply in
            self?.webView.evaluateJavaScript("1") { _, _ in reply() } // any reply: the page's JavaScript is running
        }, confirm: { [weak self] why, reason, done in
            guard let self else { return }
            self.confirmStuck(why, reason, done)
        }, dismiss: { [weak self] in
            guard let self, let alert = self.closeAlert else { return }
            self.closeAlert = nil
            self.window.endSheet(alert.window)
        }, sleep: sleep ?? { try? await Task.sleep(for: .seconds($0)) }, decided: { [weak self] reason, goOn in
            guard let self else { return }
            if goOn { self.closeApproved = true }
            switch reason {
            case .close: if goOn { self.window.close() }
            case .quit: self.replyToTerminate(goOn)
            }
        })
    }

    /// The shell's own alert, on the window: the page isn't answering and has unsaved work (Wait, or Close Anyway), or
    /// the person asked again while the page's question is up (Go Back, or Close Anyway).
    func presentStuckAlert(_ why: CloseQuestion.Stuck, _ reason: CloseQuestion.Reason, _ done: @escaping @MainActor (Bool) -> Void) {
        let verb = reason == .quit ? "Quit" : "Close"
        let alert = NSAlert()
        alert.alertStyle = .warning
        switch why {
        case .notAnswering:
            alert.messageText = "\(config.appName) has unsaved changes and isn’t answering."
            alert.informativeText = "It may be busy. You can wait for it, or \(verb.lowercased()) now and lose the changes."
            alert.addButton(withTitle: "Wait")
        case .stillAsking:
            alert.messageText = "\(config.appName) is waiting for your answer in its window."
            alert.informativeText = "Answer the question there, or \(verb.lowercased()) now and lose any unsaved changes."
            alert.addButton(withTitle: "Go Back")
        }
        alert.addButton(withTitle: "\(verb) Anyway")
        alert.window.setAccessibilityIdentifier("shell-close-alert")
        closeAlert = alert
        if !window.isVisible || window.isMiniaturized { showWindow() }
        alert.beginSheetModal(for: window) { [weak self] response in
            MainActor.assumeIsolated {
                if self?.closeAlert === alert { self?.closeAlert = nil }
                done(response == .alertSecondButtonReturn)
            }
        }
    }

    /// Quit from the menu bar or the status item. A quit that is already waiting for the page can't be asked of
    /// AppKit twice, so asking again goes straight to the question (the person's way out); anything else is a quit.
    @objc func menuQuit(_ sender: Any?) {
        if config.asksBeforeClosing, closing.pending?.reason == .quit { closing.ask(.quit) } else { NSApp.terminate(sender) }
    }
}
