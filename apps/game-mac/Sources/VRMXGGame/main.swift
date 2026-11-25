import Foundation
import VRMXGShell

// A game on the shared shell (M5 W1, AB-D-0286). The web content is one game build (Resources/web: the game app as its
// runtime, the project's files under project/, vrmxg-build.json); scripts/build.sh puts it there and names the bundle
// after the game, so each game has its own container: its saves (saves.*) and its settings (settings.*, shell 0.11.0).
// Closing the window or quitting asks the page first (shell 0.9.0): a game with progress since its last save asks the
// player. Loopback by default; VRMXG_ORIGIN=scheme for the custom scheme; VRMXG_QUERY adds a query (renderer=webgl).
let name = Bundle.main.object(forInfoDictionaryKey: "CFBundleName") as? String ?? "VRMXG Game"
ShellApp.run(ShellConfiguration(appName: name, scheme: "vrmxg-game", size: NSSize(width: 1280, height: 760), asksBeforeClosing: true))
