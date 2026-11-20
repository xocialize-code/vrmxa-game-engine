import AVFoundation
import Foundation
import WebKit

/// The microphone's permission (M3 W3, AB-T-0542). The page captures audio itself (`@vrmxg/voice` listen.js
/// `microphone()`, getUserMedia in the web view); a native capture path (VoiceChatKit, AB-A-0312) will use the same
/// permission. These methods let the page ask for it, and read its state, before it opens the microphone.
///   microphone.status → { available, authorization, usageDescription }
///   microphone.request → { authorization }   (macOS asks the person the first time; afterwards it answers at once)
/// An app that uses it needs `com.apple.security.device.audio-input` in its entitlements and NSMicrophoneUsageDescription
/// in its Info.plist; without the description microphone.request refuses instead of the system ending the app.
///
/// macOS asks only when the app is its own responsible process: launched by LaunchServices (Finder, the Dock, `open`).
/// Started as another process's child (AppProbe's `launch`, a shell running the binary), the request is refused with no
/// prompt and the status stays notDetermined (AB-L-0370, measured for the camera and the microphone).
@MainActor
public final class MicrophoneMethods {
    public init() {}

    public func register(on router: BridgeRouter) {
        router.register("microphone.status") { _ in Self.status() }
        router.register("microphone.request") { _ in try await Self.request() }
    }

    static func status() -> [String: Any] {
        ["available": AVCaptureDevice.default(for: .audio) != nil, "authorization": authorization(),
         "usageDescription": hasUsageDescription]
    }

    static var hasUsageDescription: Bool { Bundle.main.object(forInfoDictionaryKey: "NSMicrophoneUsageDescription") != nil }

    static func authorization() -> String {
        switch AVCaptureDevice.authorizationStatus(for: .audio) {
        case .authorized: return "authorized"
        case .denied: return "denied"
        case .restricted: return "restricted"
        case .notDetermined: return "notDetermined"
        @unknown default: return "unknown"
        }
    }

    static func request() async throws -> [String: Any] {
        guard hasUsageDescription else {
            throw BridgeError("unavailable", "this app has no NSMicrophoneUsageDescription: it can't use the microphone")
        }
        _ = await AVCaptureDevice.requestAccess(for: .audio)
        return ["authorization": authorization()]
    }

    /// The web view's getUserMedia: our own pages (the loopback origin and the app's scheme) get the microphone and
    /// camera when the app declares them, so WebKit doesn't ask a second time on every launch after macOS has; macOS's
    /// own permission still applies. Anything else is denied.
    static func mediaDecision(host: String, scheme: String, appScheme: String, type: WKMediaCaptureType) -> WKPermissionDecision {
        let ours = (scheme == "http" && (host == "127.0.0.1" || host == "localhost")) || scheme == appScheme
        guard ours else { return .deny }
        let mic = Bundle.main.object(forInfoDictionaryKey: "NSMicrophoneUsageDescription") != nil
        let cam = Bundle.main.object(forInfoDictionaryKey: "NSCameraUsageDescription") != nil
        switch type {
        case .microphone: return mic ? .grant : .deny
        case .camera: return cam ? .grant : .deny
        case .cameraAndMicrophone: return mic && cam ? .grant : .deny
        @unknown default: return .deny
        }
    }
}
