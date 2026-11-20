// swift-tools-version: 6.2
// The VRMXG playground for the Mac: the playground's web build on the shared shell (apps/shell, AB-D-0253), with the
// shell's voice product (apps/shell/Voice, M3 W3): tts.speak, llm.respond and stt.* on MLXEngine, in process.
// Build with scripts/build.sh (`swift build --build-system swiftbuild`, which ships MLX's metallib).
import PackageDescription

let package = Package(
    name: "VRMXGPlayground",
    platforms: [.macOS(.v26)],
    dependencies: [
        .package(path: "../shell"),
        .package(path: "../shell/Voice"),
        // The root must name the fleet's mlx-swift fork, or the root wins with the build that aborts on M5 (AB-D-0264).
        .package(url: "https://github.com/xocialize/mlx-swift", from: "0.33.1"),
    ],
    targets: [.executableTarget(name: "VRMXGPlayground", dependencies: [
        .product(name: "VRMXGShell", package: "shell"),
        .product(name: "VRMXGShellVoice", package: "Voice"),
    ])]
)
