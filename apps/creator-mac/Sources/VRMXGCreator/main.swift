import VRMXGShell
import VRMXGVoice
import VRMXGVoiceCore

// The anime creator on the shared shell (M4 W5). Edit › Undo / Redo go to the page (the short's history, re-scripts
// included); File › Open… takes a script, a character or a set through the shell's binary open (AB-A-0314), and so does
// the Finder (Open Documents, shell 0.7.0); File › Open Project… mounts a project folder at /project/; Save writes the
// short (its sequence, its script and shorts.json) back into it. Closing the window or quitting asks the page first
// (shell 0.9.0, AB-T-0593), so unsaved changes get the creator's sheet.
// Voicing (AB-T-0614): the speaking part of the shell's voice product alone. tts.speak loads Kokoro on the first line
// that has no take, from the folder chosen with voice.chooseModels (VRMXG_SHELL_MODELS for a hand test); the page asks
// voice.release before a render queue job, so a 4K render doesn't share the memory with the voice.
ShellApp.run(ShellConfiguration(
    appName: "VRMXG Creator", scheme: "vrmxg-creator", pageUndo: true, setUp: VoiceMethods.mlx(parts: [.tts]),
    fileItems: [
        ShellMenuItem("New Short", event: "newShort", key: "n"),
        .separator,
        ShellMenuItem("Open Script…", event: "openScript"),
        ShellMenuItem("Open Character…", event: "openCharacter"),
        ShellMenuItem("Open Set…", event: "openSet"),
        .separator,
        ShellMenuItem("Export…", event: "export", key: "e"),
    ],
    menus: [
        ShellMenu("Short", [
            ShellMenuItem("Apply Script", event: "applyScript", key: "\r"),
            ShellMenuItem("Render Queue", event: "renderQueue", key: "r", modifiers: [.command, .option]),
        ]),
    ],
    openTypes: ["fountain", "vrmxa", "vrmxs", "glb"],
    asksBeforeClosing: true
))
