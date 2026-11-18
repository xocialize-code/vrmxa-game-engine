// swift-tools-version: 6.0
// The shared Mac shell for every VRMXG app (AB-D-0253): a sandboxed WKWebView around an app's web build, served
// over loopback or a custom scheme, with a typed native bridge, file and project panels, and standard menus.
import PackageDescription

let package = Package(
    name: "VRMXGShell",
    platforms: [.macOS(.v15)],
    products: [.library(name: "VRMXGShell", targets: ["VRMXGShell"])],
    targets: [
        .target(name: "VRMXGShell"),
        .testTarget(name: "VRMXGShellTests", dependencies: ["VRMXGShell"]),
    ]
)
