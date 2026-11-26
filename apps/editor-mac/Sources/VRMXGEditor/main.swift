import VRMXGShell

// The editor on the shared shell. Edit › Undo / Redo go to the page (the editor's own history); File › Open Project…
// mounts a project folder at /project/, Save writes the scene back into it. Closing the window or quitting asks the
// page first (shell 0.9.0, AB-T-0593), so unsaved changes get the editor's sheet. File › Export Game… (M5 W0) sends
// the page `menu.exportGame`: the open project as a game build, written through the shell's `build.*` methods. Edit ›
// Duplicate (M5 W5, shell 0.12.0) sends `menu.duplicate`; Edit › Copy and Paste stay WebKit's, and the page takes them
// as clipboard events when nodes rather than text are selected. Help › Keyboard Shortcuts (M5 W6, shell 0.13.0) sends
// `menu.shortcuts`: the sheet of every shortcut, drawn from apps/editor/src/shortcuts.js (which lists these menu keys).
// M6 W3 (AB-T-0646, shell 0.14.0): File › New Project… (`menu.newProject`: a game from a template, made through the
// shell's project.create), File › Open Recent (the shell's recent projects, `menu.openRecent { path }`) and File ›
// Project Settings… (`menu.projectSettings`). Recent projects are bookmarks, so the app has the app-scope bookmarks
// entitlement. M6 W2 (AB-T-0645, shell 0.15.0): the project watch (`watchesProject`), so a project's behaviours module
// reloads while the editor plays; no other app asks for it.
ShellApp.run(ShellConfiguration(appName: "VRMXG Editor", scheme: "vrmxg-editor", pageUndo: true,
                                fileItems: [ShellMenuItem("New Project…", event: "newProject", key: "n", modifiers: [.command, .shift]),
                                            ShellMenuItem("Project Settings…", event: "projectSettings", key: "p", modifiers: [.command, .shift]), .separator,
                                            ShellMenuItem("Export Game…", event: "exportGame", key: "e", modifiers: [.command, .shift])],
                                editItems: [ShellMenuItem("Duplicate", event: "duplicate", key: "d")],
                                asksBeforeClosing: true,
                                helpItems: [ShellMenuItem("Keyboard Shortcuts", event: "shortcuts", key: "/")],
                                recentProjects: true, watchesProject: true))
