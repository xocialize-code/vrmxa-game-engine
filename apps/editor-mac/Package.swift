// swift-tools-version: 6.0
// The VRMXG editor for the Mac: the editor's web build on the shared shell (apps/shell, AB-D-0253).
import PackageDescription

let package = Package(
    name: "VRMXGEditor",
    platforms: [.macOS(.v15)],
    dependencies: [.package(path: "../shell")],
    targets: [.executableTarget(name: "VRMXGEditor", dependencies: [.product(name: "VRMXGShell", package: "shell")])]
)
