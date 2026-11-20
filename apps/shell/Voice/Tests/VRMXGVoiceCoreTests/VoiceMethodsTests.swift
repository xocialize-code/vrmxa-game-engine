import Foundation
import Testing
@testable import VRMXGShell
@testable import VRMXGVoiceCore

/// A backend that answers from scripts: what the page sees is the bridge methods' encoding (AB-T-0542's first acceptance row).
@MainActor
final class FakeBackend: VoiceBackend {
    let names = ["tts": "fake-tts", "llm": "fake-llm", "stt": "fake-stt"]
    var prepares = 0, spoken: [String] = [], asked: [(messages: [VoiceMessage], json: Bool, seed: UInt64?)] = [], heard: [[Float]] = []
    var onEvent: (@MainActor (VoiceListenEvent) -> Void)?
    func prepare(models: URL) async throws { prepares += 1 }
    func speak(_ text: String, voice: String) async throws -> VoiceAudio {
        spoken.append(text)
        // 0.5 s at 1 kHz per piece, one word at 0.1 s
        return VoiceAudio(pcm16: Data(repeating: 1, count: 1000), sampleRate: 1000, words: [VoiceWord(text: String(text.prefix(5)), start: 0.1, duration: 0.2)])
    }
    func respond(_ messages: [VoiceMessage], maxTokens: Int, temperature: Double, seed: UInt64?, json: Bool) async throws -> (text: String, model: String) {
        asked.append((messages, json, seed))
        return (json ? "{\"emotion\":null}" : "Hello there.", "fake-llm")
    }
    func transcribe(_ samples: [Float]) async throws -> String { heard.append(samples); return " two coffees please " }
    func startListening(_ onEvent: @escaping @MainActor (VoiceListenEvent) -> Void) async throws {
        self.onEvent = onEvent
        onEvent(.listening); onEvent(.speechStarted); onEvent(.partial("two cof")); onEvent(.speechEnded); onEvent(.final(" two coffees "))
    }
    func stopListening(cancel: Bool) { onEvent?(cancel ? .cancelled : .final("")) }
}

@Suite @MainActor struct VoiceMethodTests {
    func setUp(_ env: [String: String] = ["VRMXG_SHELL_MODELS": "/tmp/models"]) -> (BridgeRouter, FakeBackend, VoiceMethods, () -> [(String, [String: Any])]) {
        let backend = FakeBackend()
        var events: [(String, [String: Any])] = []
        let suite = "vrmxg-voice-test-\(UUID().uuidString)"
        let methods = VoiceMethods(backend: backend, defaults: UserDefaults(suiteName: suite)!, env: env, emit: { events.append(($0, $1)) })
        let router = BridgeRouter(); methods.register(on: router)
        return (router, backend, methods, { events })
    }

    @Test func prepareOnceAndStatus() async throws {
        let (router, backend, methods, _) = setUp()
        let s0 = try #require(await router.handle(body: ["method": "voice.status"]).0 as? [String: Any])
        #expect(s0["prepared"] as? Bool == false && s0["models"] as? String == "/tmp/models" && (s0["backends"] as? [String: String])?["llm"] == "fake-llm")
        _ = await router.handle(body: ["method": "voice.prepare"])
        _ = await router.handle(body: ["method": "voice.prepare"])
        #expect(backend.prepares == 1)
        let s1 = try #require(await router.handle(body: ["method": "voice.status"]).0 as? [String: Any])
        #expect(s1["prepared"] as? Bool == true)
        withExtendedLifetime(methods) {}
    }

    @Test func noModelFolderIsAnError() async {
        let (router, _, methods, _) = setUp([:])
        let r = await router.handle(body: ["method": "tts.speak", "params": ["text": "Hi."]])
        #expect(r.1?.contains("no_models") == true)
        withExtendedLifetime(methods) {}
    }

    @Test func speakEncodesWavRateDurationAndWords() async throws {
        let (router, _, methods, _) = setUp()
        let r = try #require(await router.handle(body: ["method": "tts.speak", "params": ["text": "Hello.", "voice": "am_adam"]]).0 as? [String: Any])
        let wav = try #require(Data(base64Encoded: r["wav"] as? String ?? ""))
        #expect(wav.count == 44 + 1000 && String(data: wav.prefix(4), encoding: .ascii) == "RIFF")
        let (samples, rate) = try VoiceMethods.decodeWav(wav)
        #expect(samples.count == 500 && rate == 1000)
        #expect(r["sampleRate"] as? Int == 1000 && r["duration"] as? Double == 0.5)
        let words = try #require(r["words"] as? [[String: Any]])
        #expect(words.count == 1 && words[0]["text"] as? String == "Hello" && words[0]["start"] as? Double == 0.1 && words[0]["duration"] as? Double == 0.2)
        withExtendedLifetime(methods) {}
    }

    @Test func longLinesAreSpokenInPiecesWithOffsetTimings() async throws {
        let (router, backend, methods, _) = setUp()
        let sentence = "This sentence is about sixty characters long, more or less. "
        let text = String(repeating: sentence, count: 12) // ~720 characters
        let r = try #require(await router.handle(body: ["method": "tts.speak", "params": ["text": text]]).0 as? [String: Any])
        #expect(backend.spoken.count == 2 && backend.spoken.allSatisfy { $0.count <= VoiceMethods.pieceLength })
        #expect(backend.spoken.joined(separator: " ") == text.trimmingCharacters(in: .whitespaces), "nothing lost or reordered")
        let words = try #require(r["words"] as? [[String: Any]])
        #expect(words.map { $0["start"] as? Double } == [0.1, 0.6], "the second piece starts after the first's 0.5 s")
        #expect(r["duration"] as? Double == 1.0)
        withExtendedLifetime(methods) {}
    }

    @Test func piecesCutAtSentencesThenClausesThenWords() {
        #expect(VoiceMethods.pieces("Short one. Another!", limit: 400) == ["Short one. Another!"])
        #expect(VoiceMethods.pieces("Aaaa bbbb. Cccc dddd.", limit: 12) == ["Aaaa bbbb.", "Cccc dddd."])
        #expect(VoiceMethods.pieces("one, two, three", limit: 9) == ["one, two,", "three"], "clauses packed up to the limit")
        #expect(VoiceMethods.pieces("aaa bbb ccc ddd", limit: 7) == ["aaa bbb", "ccc ddd"])
        #expect(VoiceMethods.pieces("Version 1.5 is out. Yes.", limit: 400) == ["Version 1.5 is out. Yes."], "a dot inside a number isn't a sentence end")
    }

    @Test func respondLineAndJsonVerdict() async throws {
        let (router, backend, methods, _) = setUp()
        let line = try #require(await router.handle(body: ["method": "llm.respond", "params": [
            "messages": [["role": "system", "content": "You are Hana."], ["role": "user", "content": "Hi!"]], "tools": [Any](), "maxTokens": 90, "seed": 7]]).0 as? [String: Any])
        #expect(line["text"] as? String == "Hello there." && (line["toolCalls"] as? [Any])?.isEmpty == true && line["model"] as? String == "fake-llm")
        #expect(backend.asked[0].messages.map(\.role) == ["system", "user"] && backend.asked[0].json == false && backend.asked[0].seed == 7)
        let verdict = try #require(await router.handle(body: ["method": "llm.respond", "params": ["messages": [["role": "user", "content": "Fill in…"]], "json": true]]).0 as? [String: Any])
        #expect(verdict["text"] as? String == "{\"emotion\":null}" && backend.asked[1].json == true)
        let tools = await router.handle(body: ["method": "llm.respond", "params": ["messages": [["role": "user", "content": "x"]], "tools": [["name": "goTo"]]]])
        #expect(tools.1?.contains("unsupported") == true)
        let bad = await router.handle(body: ["method": "llm.respond", "params": ["messages": [["role": "tool", "content": "x"]]]])
        #expect(bad.1?.contains("bad_params") == true)
        withExtendedLifetime(methods) {}
    }

    @Test func transcribeResamplesToSixteenKilohertz() async throws {
        let (router, backend, methods, _) = setUp()
        // 0.5 s of a 48 kHz 16-bit WAV
        let pcm = Data((0..<24_000).flatMap { i -> [UInt8] in let v = Int16(Double(i % 100) * 100); return [UInt8(truncatingIfNeeded: v), UInt8(truncatingIfNeeded: v >> 8)] })
        let r = try #require(await router.handle(body: ["method": "stt.transcribe", "params": ["wav": VoiceMethods.wav(pcm, rate: 48_000).base64EncodedString()]]).0 as? [String: Any])
        #expect(r["text"] as? String == "two coffees please")
        #expect(backend.heard[0].count == 8000, "0.5 s at 16 kHz")
        let bad = await router.handle(body: ["method": "stt.transcribe", "params": ["wav": Data("nope".utf8).base64EncodedString()]])
        #expect(bad.1?.contains("not a WAV") == true)
        withExtendedLifetime(methods) {}
    }

    @Test func listenSendsEventsToThePage() async throws {
        let (router, _, methods, events) = setUp()
        _ = await router.handle(body: ["method": "stt.listen"])
        #expect(events().map { $0.0 } == Array(repeating: "stt.event", count: 5))
        #expect(events().map { $0.1["type"] as? String } == ["listening", "speechStarted", "partial", "speechEnded", "final"])
        #expect(events().last?.1["text"] as? String == "two coffees")
        _ = await router.handle(body: ["method": "stt.stop", "params": ["cancel": true]])
        #expect(events().last?.1["type"] as? String == "cancelled")
        withExtendedLifetime(methods) {}
    }
}
