import VRMXGShell

// The editor on the shared shell. Edit › Undo / Redo go to the page (the editor's own history); File › Open Project…
// mounts a project folder at /project/, Save writes the scene back into it.
ShellApp.run(ShellConfiguration(appName: "VRMXG Editor", scheme: "vrmxg-editor", pageUndo: true))
