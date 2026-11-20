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

    public let names: [String: String]

    /// - Parameters: `llm` the Qwen3.5 size and quantisation (4B 4-bit by default, as measured); `sttRightContext`
    ///   Nemotron's look-ahead in 80 ms frames (3 = 320 ms, the measured default).
    public init(llm: QwenModel = QwenModel(size: .b4, quant: .int4), sttRightContext: Int = 3) {
        llmModel = llm; self.sttRightContext = sttRightContext
        names = ["tts": "Kokoro-82M (mlx-kokoro-tts-swift)", "llm": "Qwen3.5-4B-4bit (mlx-qwen-llm-swift)", "stt": "Nemotron 3.5 ASR 0.6B (mlx-nemotron-stt-swift)"]
    }

    public func prepare(models: URL) async throws {
        await engine.useModelStore(ModelStore(root: models))
        try await engine.register(KokoroTTSPackage.registration, configuration: KokoroConfiguration())
        try await engine.register(NemotronSTTPackage.registration, configuration: NemotronSTTConfiguration(attContextSize: [56, sttRightContext]))
        try await engine.register(QwenLLMPackage.registration, configuration: QwenLLMConfiguration(model: llmModel))
        try await engine.prepare(.tts)
        try await engine.prepare(.stt)
        try await engine.prepare(.llm)
        // Warm each path once, so the first spoken turn isn't the one that pays for compilation.
        _ = try? await speak("Hello.", voice: "af_heart")
        _ = try? await respond([VoiceMessage(role: "user", content: "Say hi.")], maxTokens: 4, temperature: 0, seed: 1, json: false)
        _ = try? await transcribe([Float](repeating: 0, count: 16_000))
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
    public static func mlx(on shell: ShellAppDelegate) {
        VoiceMethods(backend: MLXVoiceBackend(), emit: { [unowned shell] name, payload in shell.emit(name, payload) }).install(on: shell)
    }
}
