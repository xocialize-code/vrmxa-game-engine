import Foundation
import MLXKokoroTTS
import MLXNemotronSTT
import MLXQwenLLM
import MLXServeCore
import MLXToolKit
import VoiceListening
import VRMXGShell
import VRMXGVoiceCore

// The voice backend on one in-process MLXServeEngine. Adapted from mlx-engine-swift's
// Examples/app-voice-client/AppVoiceClient.swift (MIT, Xocialize; AB-A-0308, AB-A-0311), whose measurements are
// receipts AB-R-1033 to 1036: Kokoro-82M (speech with word timings), Qwen3.5-4B 4-bit (the director's line and its JSON
// verdict, until LFM3-Omni-2B has a Swift package, AB-A-0320), Nemotron 3.5 ASR streaming 0.6B (one-shot and live).
// The native microphone is VoiceChatKit's VoiceListener (VoiceListening, v0.5.0, AB-A-0312): capture, EnergyVAD
// endpointing and the live plane, no playback. One microphone at a time: the page's getUserMedia or this, never both.

@MainActor
public final class MLXVoiceBackend: VoiceBackend {
    public let engine = MLXServeEngine()
    let llmModel: QwenModel
    let sttRightContext: Int
    var listener: VoiceListener?
    /// The parts whose packages the engine knows (registered once: eviction keeps a registration) and the ones loaded.
    var registered: Set<VoicePart> = [], resident: Set<VoicePart> = []

    public let names: [String: String]

    /// - Parameters: `llm` the Qwen3.5 size and quantisation (4B 4-bit by default, as measured); `sttRightContext`
    ///   Nemotron's look-ahead in 80 ms frames (3 = 320 ms, the measured default).
    public init(llm: QwenModel = QwenModel(size: .b4, quant: .int4), sttRightContext: Int = 3) {
        llmModel = llm; self.sttRightContext = sttRightContext
        names = ["tts": "Kokoro-82M (mlx-kokoro-tts-swift)", "llm": "Qwen3.5-4B-4bit (mlx-qwen-llm-swift)", "stt": "Nemotron 3.5 ASR 0.6B (mlx-nemotron-stt-swift)"]
    }

    public func prepare(models: URL, parts: Set<VoicePart>) async throws {
        // The store's root is stamped into each registration, so the folder is the one of the first prepare: a folder
        // chosen later takes effect at the next launch.
        if registered.isEmpty {
            await engine.useModelStore(ModelStore(root: models))
            Self.keepHubCacheReachable(models: models)
        }
        for part in [VoicePart.tts, .stt, .llm] where parts.contains(part) && !registered.contains(part) {
            switch part {
            case .tts: try await engine.register(KokoroTTSPackage.registration, configuration: KokoroConfiguration())
            case .stt: try await engine.register(NemotronSTTPackage.registration, configuration: NemotronSTTConfiguration(attContextSize: [56, sttRightContext]))
            case .llm: try await engine.register(QwenLLMPackage.registration, configuration: QwenLLMConfiguration(model: llmModel))
            }
            registered.insert(part)
        }
        for part in [VoicePart.tts, .stt, .llm] where parts.contains(part) {
            try await engine.prepare(Self.capability(part))
            resident.insert(part)
        }
        // Warm each path once, so the first spoken turn isn't the one that pays for compilation.
        if parts.contains(.tts) { _ = try? await speak("Hello.", voice: "af_heart") }
        if parts.contains(.llm) { _ = try? await respond([VoiceMessage(role: "user", content: "Say hi.")], maxTokens: 4, temperature: 0, seed: 1, json: false) }
        if parts.contains(.stt) { _ = try? await transcribe([Float](repeating: 0, count: 16_000)) }
    }

    /// Every loaded model leaves memory (the engine's evict: unload, and its budget back); the registrations stay.
    /// Every registered part is evicted, not only the ones this class saw load: evicting what isn't loaded does nothing,
    /// and a prepare that threw midway, or a run the engine admitted by itself, is then covered too.
    public func release() async {
        listener?.cancel(); listener = nil
        for part in registered { await engine.evict(Self.capability(part)) }
        resident = []
    }

    /// Kokoro's G2P model comes through the hub client, whose cache follows HF_HUB_CACHE (else HF_HOME/hub, else the
    /// app's own caches folder), not the model store. An app launched from a shell inherits those variables, and in the
    /// sandbox they can name a folder it can't write to: the load then fails on the hub's lock file (AB-T-0614's hand
    /// test). Only then is the cache moved, into the models folder, which the app can reach. A cache that works is left
    /// where it is, so an app's earlier download is still found. Called before the hub client is first used.
    static func keepHubCacheReachable(models: URL, env: [String: String] = ProcessInfo.processInfo.environment) {
        guard let inherited = env["HF_HUB_CACHE"] ?? env["HF_HOME"].map({ $0 + "/hub" }), !inherited.isEmpty else { return }
        let path = NSString(string: inherited).expandingTildeInPath
        var dir = URL(fileURLWithPath: path)
        // the nearest folder that exists: the hub client makes the rest
        while !FileManager.default.fileExists(atPath: dir.path), dir.path != "/" { dir.deleteLastPathComponent() }
        if !FileManager.default.isWritableFile(atPath: dir.path) { setenv("HF_HUB_CACHE", models.path, 1) }
    }

    static func capability(_ part: VoicePart) -> Capability {
        switch part { case .tts: .tts; case .llm: .llm; case .stt: .stt }
    }

    public func speak(_ text: String, voice: String) async throws -> VoiceAudio {
        let request = TTSRequest(text: text, voice: VoiceSelector(.named(voice)), timingDetail: .words)
        guard let response = try await engine.run(request) as? TTSResponse else { throw PackageError.unsupportedCapability(.tts) }
        let data = response.audio.data
        let rate = response.audio.sampleRate ?? 24_000
        // the engine's WAV: a 44-byte header, then 16-bit mono PCM
        let pcm = data.count > 44 ? data.subdata(in: 44..<data.count) : Data()
        let words = (response.timings?.words ?? []).map { VoiceWord(text: $0.text, start: $0.start, duration: $0.duration) }
        return VoiceAudio(pcm16: pcm, sampleRate: rate, words: words)
    }

    public func respond(_ messages: [VoiceMessage], maxTokens: Int, temperature: Double, seed: UInt64?, json: Bool) async throws -> (text: String, model: String) {
        let chat = messages.map { ChatMessage(role: ChatMessage.Role(rawValue: $0.role) ?? .user, content: $0.content) }
        let request = LLMRequest(messages: chat, parameters: LLMParameters(temperature: temperature, maxTokens: maxTokens, seed: seed),
                                 mode: .direct, responseFormat: json ? .json(container: .object) : nil)
        guard let response = try await engine.run(request) as? LLMResponse else { throw PackageError.unsupportedCapability(.llm) }
        return (response.text, "qwen3.5-4b-4bit")
    }

    public func transcribe(_ samples: [Float]) async throws -> String {
        var pcm = Data(capacity: samples.count * 2)
        for s in samples { withUnsafeBytes(of: Int16(max(-1, min(1, s)) * 32767).littleEndian) { pcm.append(contentsOf: $0) } }
        let request = STTRequest(audio: Audio(format: .wav, data: VoiceMethods.wav(pcm, rate: 16_000), sampleRate: 16_000, channels: 1), language: "en")
        guard let response = try await engine.run(request) as? STTResponse else { throw PackageError.unsupportedCapability(.stt) }
        return response.text
    }

    public func startListening(_ onEvent: @escaping @MainActor (VoiceListenEvent) -> Void) async throws {
        let l = listener ?? VoiceListener(engine: engine)
        listener = l
        l.onEvent = { e in
            switch e {
            case .listening: onEvent(.listening)
            case .speechStarted: onEvent(.speechStarted)
            case .discarded: onEvent(.discarded)
            case .partial(let t): onEvent(.partial(t))
            case .speechEnded: onEvent(.speechEnded)
            case .final(let t): onEvent(.final(t))
            case .cancelled: onEvent(.cancelled)
            case .failed(let why, _): onEvent(.failed(why))
            }
        }
        do { try await l.start() } catch { throw BridgeError("failed", "the microphone didn't open: \(error.localizedDescription)") }
    }

    public func stopListening(cancel: Bool) { cancel ? listener?.cancel() : listener?.stop() }
}

extension VoiceMethods {
    /// The voice methods on MLXEngine, for an app's `ShellConfiguration(setUp:)`.
    public static func mlx(on shell: ShellAppDelegate) { mlx(parts: Set(VoicePart.allCases))(shell) }

    /// The same for an app that takes some of the parts: `setUp: VoiceMethods.mlx(parts: [.tts])` registers tts.speak
    /// and loads Kokoro alone (the creator, AB-T-0614).
    public static func mlx(parts: Set<VoicePart>) -> @MainActor (ShellAppDelegate) -> Void {
        { shell in
            VoiceMethods(backend: MLXVoiceBackend(), parts: parts, emit: { [unowned shell] name, payload in shell.emit(name, payload) }).install(on: shell)
        }
    }
}
