// swift-tools-version: 6.2
// A VRMXG game for the Mac (M5 W1, AB-D-0286): one game build's folder as the web content of the shared shell
// (apps/shell). The executable is the same for every game; scripts/build.sh wraps a build and names the app after it.
import PackageDescription

let package = Package(
    name: "VRMXGGame",
    platforms: [.macOS(.v26)],
    dependencies: [.package(path: "../shell")],
    targets: [.executableTarget(name: "VRMXGGame", dependencies: [.product(name: "VRMXGShell", package: "shell")])]
)
