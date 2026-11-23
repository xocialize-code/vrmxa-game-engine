import VRMXGShell

// The anime creator on the shared shell (M4 W5). Edit › Undo / Redo go to the page (the short's history, re-scripts
// included); File › Open… takes a script, a character or a set through the shell's binary open (AB-A-0314), and so does
// the Finder (Open Documents, shell 0.7.0); File › Open Project… mounts a project folder at /project/; Save writes the
// short (its sequence, its script and shorts.json) back into it.
ShellApp.run(ShellConfiguration(
    appName: "VRMXG Creator", scheme: "vrmxg-creator", pageUndo: true,
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
    ]
))
