import VRMXGShell

// The editor on the shared shell. Edit › Undo / Redo go to the page (the editor's own history); File › Open Project…
// mounts a project folder at /project/, Save writes the scene back into it. Closing the window or quitting asks the
// page first (shell 0.9.0, AB-T-0593), so unsaved changes get the editor's sheet.
ShellApp.run(ShellConfiguration(appName: "VRMXG Editor", scheme: "vrmxg-editor", pageUndo: true, asksBeforeClosing: true))
