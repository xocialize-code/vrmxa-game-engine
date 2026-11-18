// swift-tools-version: 6.0
// The VRMXG playground for the Mac: the playground's web build on the shared shell (apps/shell, AB-D-0253).
import PackageDescription

let package = Package(
    name: "VRMXGPlayground",
    platforms: [.macOS(.v15)],
    dependencies: [.package(path: "../shell")],
    targets: [.executableTarget(name: "VRMXGPlayground", dependencies: [.product(name: "VRMXGShell", package: "shell")])]
)
