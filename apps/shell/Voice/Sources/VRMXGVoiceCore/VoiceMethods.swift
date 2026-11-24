import AppKit
import Foundation
import VRMXGShell

// The shell's voice methods (M3 W3, AB-T-0542): the shapes the page's providers already speak (`@vrmxg/voice`
// live.js shellTTS, listen.js shellSTT and shellListen, `@vrmxg/director` model.js shellModel), over a VoiceBackend.
//
//   voice.status → { prepared, preparing, models, backends: { tts, llm, stt } }   backends: the parts this app took
//   voice.chooseModels → { path }            a folder panel; the choice is remembered (security-scoped bookmark)
//   voice.prepare → { prepared, models, ms } loads the app's models (once; later calls answer at once)
//   voice.release → { released, busy? }      unloads them, for work that wants the memory (the creator's render queue);
//                         the next call that needs them loads them again. busy: a call is running, nothing was unloaded
//   tts.speak { text, voice? } → { wav (base64 16-bit mono WAV), sampleRate, duration, words: [{ text, start, duration }], ms }
//                         lines past ~400 characters are spoken in pieces at sentence ends and joined, timings offset
//   llm.respond { messages: [{ role, content }], maxTokens?, temperature?, seed?, json? } → { text, toolCalls: [], model, ms }
//                         json: true constrains the reply to one JSON object (the split turn's verdict, AB-D-0265);
//                         a request with tools is refused: the split turn needs none
//   stt.transcribe { wav (base64 WAV) } → { text, ms }   one utterance, any rate (the page's own VAD endpointed it)
//   stt.listen → { listening: true }; stt.stop { cancel? } → { listening: false }
//                         the native microphone with VAD endpointing: `stt.event` events
//                         { type: listening | speechStarted | partial | discarded | speechEnded | final | cancelled | failed, text? }
//
// An app takes the parts it uses (`parts`): the creator takes speech out alone, so it registers tts.speak, loads Kokoro
// and nothing else (AB-T-0614). The models live in a folder the person picks once (voice.chooseModels), or
// VRMXG_SHELL_MODELS: an absolute path outside the sandbox, or a path relative to the app's temporary folder (its
// container's, in the sandbox), as the shell's other hooks read theirs.

/// The parts of the voice product: speech out (tts.speak), the director's model (llm.respond), speech in (stt.*).
public enum VoicePart: String, Sendable, CaseIterable { case tts, llm, stt }

public struct VoiceMessage: Sendable, Equatable {
    public let role: String
    public let content: String
    public init(role: String, content: String) { self.role = role; self.content = content }
}

public struct VoiceWord: Sendable, Equatable {
    public let text: String
    public let start: Double
    public let duration: Double
    public init(text: String, start: Double, duration: Double) { self.text = text; self.start = start; self.duration = duration }
}

/// Synthesized speech: raw 16-bit little-endian mono PCM (no header), its rate, and word timings from its first sample.
public struct VoiceAudio: Sendable {
    public let pcm16: Data
    public let sampleRate: Int
    public let words: [VoiceWord]
    public init(pcm16: Data, sampleRate: Int, words: [VoiceWord]) { self.pcm16 = pcm16; self.sampleRate = sampleRate; self.words = words }
    public var duration: Double { Double(pcm16.count / 2) / Double(sampleRate) }
}

public enum VoiceListenEvent: Sendable, Equatable {
    case listening, speechStarted, discarded, speechEnded, cancelled
    case partial(String), final(String), failed(String)
}

/// What does the work: MLXEngine in the app (VRMXGVoice), a fake in tests.
@MainActor
public protocol VoiceBackend: AnyObject {
    /// Package names for voice.status: tts, llm, stt.
    var names: [String: String] { get }
    /// Load and warm these parts' models. Called again after `release`.
    func prepare(models: URL, parts: Set<VoicePart>) async throws
    /// Unload every model that is loaded.
    func release() async
    func speak(_ text: String, voice: String) async throws -> VoiceAudio
    func respond(_ messages: [VoiceMessage], maxTokens: Int, temperature: Double, seed: UInt64?, json: Bool) async throws -> (text: String, model: String)
    /// One utterance, mono Float32 at 16 kHz.
    func transcribe(_ samples: [Float]) async throws -> String
    func startListening(_ onEvent: @escaping @MainActor (VoiceListenEvent) -> Void) async throws
    func stopListening(cancel: Bool)
}

@MainActor
public final class VoiceMethods {
    let backend: VoiceBackend
    let parts: Set<VoicePart>
    let defaults: UserDefaults
    let env: [String: String]
    let emit: @MainActor (String, [String: Any]) -> Void
    var prepared: URL?
    var preparing: Task<Void, Error>?
    /// Calls into the backend that haven't answered: voice.release leaves the models alone while there are any.
    var running = 0
    static let modelsKey = "vrmxg.shell.voice.models"
    /// Characters per TTS call: Kokoro takes at most 510 phoneme tokens (~450–500 characters) in one call.
    public static let pieceLength = 400

    public init(backend: VoiceBackend, parts: Set<VoicePart> = Set(VoicePart.allCases), defaults: UserDefaults = .standard,
                env: [String: String] = ProcessInfo.processInfo.environment, emit: @escaping @MainActor (String, [String: Any]) -> Void) {
        self.backend = backend; self.parts = parts; self.defaults = defaults; self.env = env; self.emit = emit
    }

    /// Register on an app's shell: `ShellConfiguration(…, setUp: { VoiceMethods(…).install(on: $0) })` keeps it for the app's life.
    public func install(on shell: ShellAppDelegate) {
        register(on: shell.router)
        shell.keepAlive.append(self)
    }

    public func register(on router: BridgeRouter) {
        router.register("voice.status") { [unowned self] _ in
            ["prepared": self.prepared != nil, "preparing": self.preparing != nil, "models": (self.modelsFolder()?.path).map { $0 as Any } ?? NSNull(),
             "backends": self.backend.names.filter { name in VoicePart(rawValue: name.key).map(self.parts.contains) ?? false }]
        }
        router.register("voice.chooseModels") { [unowned self] _ in try self.chooseModels() }
        router.register("voice.prepare") { [unowned self] _ in try await self.prepare() }
        router.register("voice.release") { [unowned self] _ in await self.release() }
        if parts.contains(.tts) { router.register("tts.speak") { [unowned self] p in try await self.speak(p) } }
        if parts.contains(.llm) { router.register("llm.respond") { [unowned self] p in try await self.respond(p) } }
        if parts.contains(.stt) {
            router.register("stt.transcribe") { [unowned self] p in try await self.transcribe(p) }
            router.register("stt.listen") { [unowned self] _ in try await self.listen() }
            router.register("stt.stop") { [unowned self] p in
                self.backend.stopListening(cancel: p.bool("cancel") ?? false); return ["listening": false]
            }
        }
    }

    // MARK: models

    func modelsFolder() -> URL? {
        if let v = env["VRMXG_SHELL_MODELS"], !v.isEmpty {
            return v.hasPrefix("/") ? URL(fileURLWithPath: v, isDirectory: true)
                : URL(fileURLWithPath: NSTemporaryDirectory(), isDirectory: true).appendingPathComponent(v, isDirectory: true)
        }
        guard let data = defaults.data(forKey: Self.modelsKey) else { return nil }
        var stale = false
        let url = (try? URL(resolvingBookmarkData: data, options: .withSecurityScope, relativeTo: nil, bookmarkDataIsStale: &stale))
            ?? (try? URL(resolvingBookmarkData: data, options: [], relativeTo: nil, bookmarkDataIsStale: &stale))
        if let url { _ = url.startAccessingSecurityScopedResource() } // held for the app's life
        return url
    }

    func chooseModels() throws -> Any? {
        let panel = NSOpenPanel()
        panel.title = "Choose the folder that holds (or will hold) the voice models"
        panel.canChooseFiles = false; panel.canChooseDirectories = true; panel.canCreateDirectories = true; panel.allowsMultipleSelection = false
        guard panel.runModal() == .OK, let url = panel.url else { throw BridgeError("cancelled", "no folder was chosen") }
        let data: Data
        if let scoped = try? url.bookmarkData(options: .withSecurityScope, includingResourceValuesForKeys: nil, relativeTo: nil) { data = scoped }
        else { data = try url.bookmarkData(options: [], includingResourceValuesForKeys: nil, relativeTo: nil) }
        defaults.set(data, forKey: Self.modelsKey)
        return ["path": url.path]
    }

    func prepare() async throws -> Any? {
        let t0 = Date()
        if let prepared { return ["prepared": true, "models": prepared.path, "ms": 0] }
        guard let folder = modelsFolder() else {
            throw BridgeError("no_models", "no model folder: call voice.chooseModels (or set VRMXG_SHELL_MODELS)")
        }
        // counted as running, so voice.release leaves the models alone until every caller waiting here has its answer
        running += 1; defer { running -= 1 }
        let task = preparing ?? Task { try await backend.prepare(models: folder, parts: parts) }
        preparing = task
        defer { if preparing == task { preparing = nil } } // a later prepare's task isn't this caller's to clear
        do { try await task.value } catch { throw BridgeError("failed", "the voice models didn't load: \(error)") }
        prepared = folder
        return ["prepared": true, "models": folder.path, "ms": ms(since: t0)]
    }

    func requirePrepared() async throws {
        if prepared == nil { _ = try await prepare() }
    }

    /// voice.release: the models leave memory; the folder stays chosen, and the next call that needs them loads them.
    func release() async -> Any? {
        if running > 0 || preparing != nil { return ["released": false, "busy": true] }
        let was = prepared != nil
        prepared = nil
        await backend.release() // asked even when nothing is marked loaded: a prepare that threw midway may have loaded a part
        return ["released": was]
    }

    // MARK: tts.speak

    func speak(_ p: BridgeParams) async throws -> Any? {
        let text = try p.require("text").trimmingCharacters(in: .whitespacesAndNewlines)
        guard !text.isEmpty else { throw BridgeError("bad_params", "text is empty") }
        running += 1; defer { running -= 1 }
        try await requirePrepared()
        let t0 = Date()
        var parts: [VoiceAudio] = []
        for piece in Self.pieces(text) { parts.append(try await backend.speak(piece, voice: p.string("voice") ?? "af_heart")) }
        let joined = Self.join(parts)
        return Self.encode(joined, ms: ms(since: t0))
    }

    /// The reply the page decodes (live.js shellTTS): a WAV, its rate and length, and word timings.
    public static func encode(_ a: VoiceAudio, ms: Double) -> [String: Any] {
        ["wav": wav(a.pcm16, rate: a.sampleRate).base64EncodedString(), "sampleRate": a.sampleRate, "duration": a.duration,
         "words": a.words.map { ["text": $0.text, "start": $0.start, "duration": $0.duration] as [String: Any] }, "ms": ms]
    }

    /// A line in pieces of at most `limit` characters, cut at sentence ends, else at commas, else at spaces.
    public static func pieces(_ text: String, limit: Int = pieceLength) -> [String] {
        func cut(_ s: Substring, at breaks: [Character]) -> [Substring] {
            var out: [Substring] = [], start = s.startIndex, i = s.startIndex
            while i < s.endIndex {
                let next = s.index(after: i)
                if breaks.contains(s[i]), next == s.endIndex || s[next] == " " { out.append(s[start..<next]); start = next }
                i = next
            }
            if start < s.endIndex { out.append(s[start...]) }
            return out
        }
        var units: [String] = []
        for sentence in cut(Substring(text), at: [".", "!", "?", "…"]) {
            if sentence.count <= limit { units.append(String(sentence)); continue }
            for clause in cut(sentence, at: [",", ";", ":"]) {
                if clause.count <= limit { units.append(String(clause)); continue }
                var word = ""
                for w in clause.split(separator: " ") {
                    if !word.isEmpty, word.count + 1 + w.count > limit { units.append(word); word = "" }
                    word += word.isEmpty ? String(w) : " " + w
                }
                if !word.isEmpty { units.append(word) }
            }
        }
        var out: [String] = [], current = ""
        for u in units.map({ $0.trimmingCharacters(in: .whitespaces) }) where !u.isEmpty {
            if !current.isEmpty, current.count + 1 + u.count > limit { out.append(current); current = "" }
            current += current.isEmpty ? u : " " + u
        }
        if !current.isEmpty { out.append(current) }
        return out
    }

    /// Pieces back into one line: audio end to end, each piece's word starts offset by the audio before it.
    public static func join(_ parts: [VoiceAudio]) -> VoiceAudio {
        guard let first = parts.first else { return VoiceAudio(pcm16: Data(), sampleRate: 24_000, words: []) }
        var pcm = Data(), words: [VoiceWord] = [], offset = 0.0
        for p in parts {
            pcm.append(p.pcm16)
            words += p.words.map { VoiceWord(text: $0.text, start: $0.start + offset, duration: $0.duration) }
            offset += p.duration
        }
        return VoiceAudio(pcm16: pcm, sampleRate: first.sampleRate, words: words)
    }

    // MARK: llm.respond

    func respond(_ p: BridgeParams) async throws -> Any? {
        if let tools = p.raw["tools"] as? [Any], !tools.isEmpty {
            throw BridgeError("unsupported", "the shell's model takes no tools: use the director's split turn (AB-D-0265)")
        }
        guard let raw = p.raw["messages"] as? [[String: Any]], !raw.isEmpty else { throw BridgeError("bad_params", "messages is a non-empty list of { role, content }") }
        let messages = try raw.map { m -> VoiceMessage in
            guard let role = m["role"] as? String, ["system", "user", "assistant"].contains(role) else { throw BridgeError("bad_params", "a message's role is system, user or assistant") }
            return VoiceMessage(role: role, content: m["content"] as? String ?? "")
        }
        running += 1; defer { running -= 1 }
        try await requirePrepared()
        let t0 = Date()
        let seed = p.number("seed").map { UInt64(max(0, $0)) }
        let r = try await backend.respond(messages, maxTokens: Int(p.number("maxTokens") ?? 160), temperature: p.number("temperature") ?? 0.6,
                                          seed: seed, json: p.bool("json") ?? false)
        return ["text": r.text, "toolCalls": [Any](), "model": r.model, "ms": ms(since: t0)]
    }

    // MARK: stt

    func transcribe(_ p: BridgeParams) async throws -> Any? {
        guard let data = Data(base64Encoded: try p.require("wav")) else { throw BridgeError("bad_params", "wav does not decode") }
        let (samples, rate) = try Self.decodeWav(data)
        running += 1; defer { running -= 1 }
        try await requirePrepared()
        let t0 = Date()
        let text = try await backend.transcribe(Self.resample(samples, from: rate, to: 16_000))
        return ["text": text.trimmingCharacters(in: .whitespacesAndNewlines), "ms": ms(since: t0)]
    }

    func listen() async throws -> Any? {
        try await requirePrepared()
        try await backend.startListening { [weak self] e in self?.emit("stt.event", Self.encode(e)) }
        return ["listening": true]
    }

    public static func encode(_ e: VoiceListenEvent) -> [String: Any] {
        switch e {
        case .listening: return ["type": "listening"]
        case .speechStarted: return ["type": "speechStarted"]
        case .discarded: return ["type": "discarded"]
        case .speechEnded: return ["type": "speechEnded"]
        case .cancelled: return ["type": "cancelled"]
        case .partial(let t): return ["type": "partial", "text": t]
        case .final(let t): return ["type": "final", "text": t.trimmingCharacters(in: .whitespacesAndNewlines)]
        case .failed(let why): return ["type": "failed", "text": why]
        }
    }

    // MARK: audio

    /// A 16-bit PCM mono WAV around raw samples.
    public static func wav(_ pcm16: Data, rate: Int) -> Data {
        var d = Data()
        func u32(_ v: UInt32) { withUnsafeBytes(of: v.littleEndian) { d.append(contentsOf: $0) } }
        func u16(_ v: UInt16) { withUnsafeBytes(of: v.littleEndian) { d.append(contentsOf: $0) } }
        d.append(contentsOf: Array("RIFF".utf8)); u32(UInt32(36 + pcm16.count)); d.append(contentsOf: Array("WAVEfmt ".utf8))
        u32(16); u16(1); u16(1); u32(UInt32(rate)); u32(UInt32(rate * 2)); u16(2); u16(16)
        d.append(contentsOf: Array("data".utf8)); u32(UInt32(pcm16.count)); d.append(pcm16)
        return d
    }

    /// A PCM WAV (16-bit integer or 32-bit float, any channels: the first is taken) → samples and rate.
    public static func decodeWav(_ d: Data) throws -> ([Float], Int) {
        let b = [UInt8](d)
        func u16(_ i: Int) -> Int { Int(b[i]) | Int(b[i + 1]) << 8 }
        func u32(_ i: Int) -> Int { u16(i) | u16(i + 2) << 16 }
        guard b.count >= 12, String(bytes: b[0..<4], encoding: .ascii) == "RIFF", String(bytes: b[8..<12], encoding: .ascii) == "WAVE" else {
            throw BridgeError("bad_params", "not a WAV")
        }
        var i = 12, format = 0, channels = 1, rate = 16_000, bits = 16
        while i + 8 <= b.count {
            let id = String(bytes: b[i..<i + 4], encoding: .ascii) ?? "", size = u32(i + 4), body = i + 8
            if id == "fmt ", body + 16 <= b.count {
                format = u16(body); channels = max(1, u16(body + 2)); rate = u32(body + 4); bits = u16(body + 14)
            } else if id == "data" {
                let end = min(b.count, body + size), frame = channels * bits / 8
                guard frame > 0 else { break }
                var out: [Float] = []; out.reserveCapacity((end - body) / frame)
                var j = body
                while j + frame <= end {
                    if format == 1, bits == 16 { out.append(Float(Int16(bitPattern: UInt16(u16(j)))) / 32768) }
                    else if format == 3, bits == 32 { out.append(Float(bitPattern: UInt32(u32(j)))) }
                    else { throw BridgeError("bad_params", "a WAV of 16-bit PCM or 32-bit float, please (format \(format), \(bits) bits)") }
                    j += frame
                }
                return (out, rate)
            }
            i = body + size + (size & 1)
        }
        throw BridgeError("bad_params", "the WAV has no data")
    }

    /// Linear resampling (speech into a recogniser; nothing here needs better).
    public static func resample(_ x: [Float], from: Int, to: Int) -> [Float] {
        guard from != to, !x.isEmpty, from > 0 else { return x }
        let n = Int((Double(x.count) * Double(to) / Double(from)).rounded(.down)), step = Double(from) / Double(to)
        return (0..<n).map { k in
            let pos = Double(k) * step, i = Int(pos), t = Float(pos - Double(i))
            return i + 1 < x.count ? x[i] * (1 - t) + x[i + 1] * t : x[min(i, x.count - 1)]
        }
    }

    func ms(since t: Date) -> Double { (Date().timeIntervalSince(t) * 10_000).rounded() / 10 }
}
