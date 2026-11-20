import VRMXGShell
import VRMXGVoice
import VRMXGVoiceCore

// The playground on the shared shell: loopback by default (VRMXG_ORIGIN=scheme for the custom scheme),
// VRMXG_QUERY for an extra query (e.g. mode=acceptance). The voice methods (M3 W3) load their models on first use
// from the folder chosen with voice.chooseModels (VRMXG_SHELL_MODELS outside the sandbox).
ShellApp.run(ShellConfiguration(appName: "VRMXG Playground", scheme: "vrmxg-playground", setUp: VoiceMethods.mlx))
