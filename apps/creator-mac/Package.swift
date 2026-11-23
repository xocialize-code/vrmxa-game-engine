// swift-tools-version: 6.0
// The VRMXG anime creator for the Mac (M4 W5): the creator's web build on the shared shell (apps/shell, AB-D-0253).
import PackageDescription

let package = Package(
    name: "VRMXGCreator",
    platforms: [.macOS(.v15)],
    dependencies: [.package(path: "../shell")],
    targets: [.executableTarget(name: "VRMXGCreator", dependencies: [.product(name: "VRMXGShell", package: "shell")])]
)
