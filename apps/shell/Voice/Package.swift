// swift-tools-version: 6.2
// The shell's optional voice product (M3 W3, AB-T-0542): tts.speak, llm.respond and stt.* bridge methods over one
// in-process MLXServeEngine (Kokoro TTS with word timings, a Qwen3.5 LLM until LFM3-Omni-2B has a Swift package
// (AB-A-0320), Nemotron live STT), and VoiceChatKit's VoiceListening for the native microphone (AB-A-0312).
// Its own package, so the shell and the apps that don't speak link no MLX. Build apps with it through
// `swift build --build-system swiftbuild` (the native build system ships no default.metallib).
import PackageDescription

let package = Package(
    name: "VRMXGShellVoice",
    platforms: [.macOS(.v26)],
    products: [.library(name: "VRMXGShellVoice", targets: ["VRMXGVoice", "VRMXGVoiceCore"])],
    dependencies: [
        .package(path: ".."),
        .package(url: "https://github.com/xocialize/mlx-engine-swift", from: "0.82.1"),
        .package(url: "https://github.com/xocialize/mlx-kokoro-tts-swift", from: "0.6.0"),
        .package(url: "https://github.com/xocialize/mlx-nemotron-stt-swift", from: "0.4.0"),
        .package(url: "https://github.com/xocialize/mlx-qwen-llm-swift", from: "0.7.0"),
        // The root must name the fleet's mlx-swift fork, or the root wins with the build that aborts on M5 (AB-D-0264).
        .package(url: "https://github.com/xocialize/mlx-swift", from: "0.33.1"),
        .package(url: "https://github.com/xocialize/voice-chat-kit", from: "0.5.0"),
    ],
    targets: [
        // The bridge methods and their encoding, over a VoiceBackend: no MLX, so its tests run anywhere.
        .target(name: "VRMXGVoiceCore", dependencies: [.product(name: "VRMXGShell", package: "shell")]),
        // The MLXEngine backend.
        .target(name: "VRMXGVoice", dependencies: [
            "VRMXGVoiceCore",
            .product(name: "MLXServeCore", package: "mlx-engine-swift"),
            .product(name: "MLXToolKit", package: "mlx-engine-swift"),
            .product(name: "MLXKokoroTTS", package: "mlx-kokoro-tts-swift"),
            .product(name: "MLXNemotronSTT", package: "mlx-nemotron-stt-swift"),
            .product(name: "MLXQwenLLM", package: "mlx-qwen-llm-swift"),
            .product(name: "VoiceListening", package: "voice-chat-kit"),
        ]),
        .testTarget(name: "VRMXGVoiceCoreTests", dependencies: ["VRMXGVoiceCore"]),
    ]
)
