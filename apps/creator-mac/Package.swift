// swift-tools-version: 6.2
// The VRMXG anime creator for the Mac (M4 W5): the creator's web build on the shared shell (apps/shell, AB-D-0253), with
// the speaking part of the shell's voice product (apps/shell/Voice): tts.speak on MLXEngine, in process, so a recast or
// a re-voiced line needs no server beside the app (AB-T-0614).
// Build with scripts/build.sh (`swift build --build-system swiftbuild`, which ships MLX's metallib).
import PackageDescription

let package = Package(
    name: "VRMXGCreator",
    platforms: [.macOS(.v26)],
    dependencies: [
        .package(path: "../shell"),
        .package(path: "../shell/Voice"),
        // The root must name the fleet's mlx-swift fork, or the root wins with the build that aborts on M5 (AB-D-0264).
        .package(url: "https://github.com/xocialize/mlx-swift", from: "0.33.1"),
    ],
    targets: [.executableTarget(name: "VRMXGCreator", dependencies: [
        .product(name: "VRMXGShell", package: "shell"),
        .product(name: "VRMXGShellVoice", package: "Voice"),
    ])]
)
