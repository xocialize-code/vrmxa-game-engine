# VRMXG shell voice

M3 W3 (AB-T-0542). The shell's optional voice product: speech in and out for a talking character, in the app's own
process through one `MLXServeEngine`. It is its own Swift package, so the shell, and apps that don't speak, link no MLX.

| Bridge method | What | Backer |
|---|---|---|
| `voice.status` | `{ prepared, preparing, models, backends }` | |
| `voice.chooseModels` | a folder panel; remembered as a security-scoped bookmark | |
| `voice.prepare` | loads and warms the app's models (once) | |
| `voice.release` | `{ released, busy? }`: unloads them (the engine's `evict`), for work that wants the memory. The next call that needs them loads them again. With a call still running it unloads nothing and answers `busy` | |
| `tts.speak { text, voice? }` | `{ wav (base64 16-bit mono), sampleRate, duration, words: [{ text, start, duration }], ms }`; lines over 400 characters are spoken in pieces cut at sentence ends and joined, with word starts offset | Kokoro-82M, `mlx-kokoro-tts-swift` 0.6.0 (word timings, contract 1.65.0) |
| `llm.respond { messages, maxTokens?, temperature?, seed?, json? }` | `{ text, toolCalls: [], model, ms }`. `json: true` constrains the reply to one JSON object (the director's verdict). A request with tools is refused, because the director's split turn needs none (AB-D-0265) | Qwen3.5-4B 4-bit, `mlx-qwen-llm-swift` 0.7.0, until LFM3-Omni-2B has a Swift package (AB-A-0320) |
| `stt.transcribe { wav }` | `{ text, ms }`: one utterance at any rate (resampled to 16 kHz) | Nemotron 3.5 ASR 0.6B, `mlx-nemotron-stt-swift` 0.4.0 |
| `stt.listen`, `stt.stop { cancel? }` | the native microphone with VAD endpointing; `stt.event` events `{ type: listening, speechStarted, partial, discarded, speechEnded, final, cancelled or failed, text? }` | VoiceChatKit `VoiceListening` 0.5.0 (AB-A-0312) on Nemotron's live plane |

The page's providers already speak these shapes:
- `@vrmxg/voice`: `shellTTS`, `shellSTT`, `shellListen`.
- `@vrmxg/director`: `shellModel`.

## Using it in an app

```swift
// Package.swift: .package(path: "../shell/Voice"), and the root must also name the fleet's mlx-swift fork
// (.package(url: "https://github.com/xocialize/mlx-swift", from: "0.33.1"), AB-D-0264); link product VRMXGShellVoice.
import VRMXGShell
import VRMXGVoice
import VRMXGVoiceCore
ShellApp.run(ShellConfiguration(appName: "VRMXG Playground", scheme: "vrmxg-playground", setUp: VoiceMethods.mlx))
```

**An app that takes some of the parts** (AB-T-0614): `setUp: VoiceMethods.mlx(parts: [.tts])` registers `tts.speak`
with the `voice.*` methods and loads Kokoro alone; `llm.respond` and `stt.*` aren't registered, and it needs no
microphone entitlement. The creator's Mac app does this, and its page calls `voice.release` before a render queue job.

- **Build:** use `swift build --build-system swiftbuild`. The native build system ships no `default.metallib` (AB-L-0319). Copy the products' `*.bundle` folders into `Contents/Resources`, as `apps/playground-mac/scripts/build.sh` does.
- **Entitlements:** `device.audio-input` and `NSMicrophoneUsageDescription`; `files.bookmarks.app-scope` for the model folder; `network.client`.
- **Model folder:** on first use, `voice.chooseModels` asks for it. The Mac Studio's is `/Volumes/DEV_VOL1/Models`, about 4.5 GB.
  `VRMXG_SHELL_MODELS` names it instead: an absolute path outside the sandbox, or a path relative to the app's temporary
  folder (its container's `Data/tmp`, in the sandbox), which is how a hand test gives a sandboxed app its models.
- **Launching:** launch the app through LaunchServices (`open`), or macOS answers the microphone request with its launcher's permission (AB-L-0370).
- **Known gap AB-A-0321 (mlx-audio):** Kokoro fetches its ~9 MB G2P model on every prepare, into the model folder.

**Microphone in the Mac app:** use `stt.listen`, not the page's `getUserMedia`. In WKWebView, getUserMedia gave a live track and a running AudioContext but delivered no frames to an AudioWorklet (measured 2026-11-19, with AirPods). The native path has no echo cancellation: use headphones, or stop listening while the character speaks.

## Measured

On the M5 Max, Release, with all three models resident: receipt AB-R-1037, raw results in `engine/packages/voice/results/shell-turns.json`. The playground's `?director=shell&tts=shell&measure=voice` runs it.

| Over 10 steady spoken turns in the Mac app | Median | Max |
|---|---|---|
| End of speech → her first audio (the detector's 450 ms wait included) | 1263 ms | 1429 ms |
| Detector end → first audio | 813 ms | 979 ms |
| `stt.transcribe` | 250 ms | 308 ms |
| Line (`llm.respond`) | 322 ms | 391 ms |
| `tts.speak` | 218 ms | 287 ms |
| Verdict (`llm.respond`, `json`), while she speaks | 500 ms | 555 ms |

On the first launch after the models were chosen, prepare took 17 s, and two early turns were slow (7.3 s and 1.5 s; `shell-turns-first-launch.json`). On the next launch, prepare took 1.2 s.

Tests: `swift test --filter VRMXGVoiceCoreTests` checks the methods' encoding over a scripted backend, with no MLX: WAV, rate, duration and words; long lines split with offset timings; the line and the JSON verdict; tools refused; transcription resampled; listening events; an app that only speaks registers and loads the voice alone; release unloads, leaves a line that is being spoken alone, and the next line loads again; a relative models folder.
