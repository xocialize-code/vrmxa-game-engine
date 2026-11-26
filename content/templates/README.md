# Project templates

M6 W3 (AB-T-0646). What the editor's **File › New Project…** makes a game from. Each folder is one template:

| Template | What a new project holds |
|---|---|
| [`empty/`](empty/) "Empty game" | One scene (`main.vrmxs`: an environment, a sun, ground and a fixed camera), `game.json` with the engine's default controls, `LICENCES.md` |
| [`level/`](level/) "One level" | `level.vrmxs`: the sample cafe, Mira to play (the `player` behaviour, a follow camera), Hana at the counter, a goal (get to the counter: an `Area` sets a flag, a `GameGoal` reads it), a score, and a change to `ending.vrmxs` two seconds after the game is won; `ending.vrmxs`: Hana for eight seconds, then the level again as a new game. With the cafe set, Mira, Hana, the sample's animation set and two sounds copied in |

A template folder has a `template.json` (format `vrmxg-template`, version 1: its id, title, description, order, and the
content it copies in), the files it adds of its own, and a `LICENCES.md` that lists **every file of the project it
makes**, its own and those it copies (`apps/editor/test/new-project.test.mjs` fails on a file without a row, or a row
without a file). `templates.js` reads them (shared by the editor's build, `tools/new-project.mjs` and MCP later);
`copy` entries are paths under `content/` (`sample/sets/cafe.glb`, `sample/animations/clips/*.vrma`), placed at the path
without their first folder unless `to` says otherwise. Nothing is duplicated in the repository: a project gets its own
copy when it is made.

**Built on the sample content for now.** The starter content (M6 W4, AB-T-0647: a CC0 animation set and an item pack)
isn't merged yet. When it is, a template switches by changing its `copy` list (and its `LICENCES.md` rows) to
`starter/…` paths; the editor's build serves anything under `content/` that isn't the sample at `templates/content/`.

```sh
node content/templates/tools/new-project.mjs --list
node content/templates/tools/new-project.mjs level ~/Games/cafe-dash --title "Cafe Dash"   # a project folder, as New Project makes one
node acceptance/m6/templates-node.mjs                                                      # each template made and played in Node
```

In the editor (`apps/editor`): the New Project sheet lists the templates from `templates/index.json`, which
`vite.config.js` writes into the editor's web content with every file's place there; the Mac shell's `project.create`
(shell 0.14.0) copies them into a folder the person names, with `game.json` written as the new game's (its id and
title). The new project opens on its game's entry scene.
