---
title: "The editor"
description: "A guide to the editor for building games: projects, the tree, the inspector and its widgets, behaviours and connections, prefabs and overrides, the assets panel, the viewport's aids, Play in place, hot reload, saving, and Export Game."
order: 8
---

# The editor

The editor builds games: their scenes, the behaviours on their nodes and the connections between them, and the build
you hand to players. This page goes through it panel by panel. For a first game from start to finish, follow the
[tutorial](./tutorial); [Running the apps](./running#as-mac-apps) has how to build and open the editor.

The editor runs as a Mac app and in a browser tab. Everything here is the Mac app. In a browser it opens the sample
project read-only: it can't open a folder, save or export a build.

![The editor with the tutorial's level: the tree on the left, the viewport, the inspector on the right](/guide/images/editor-window.jpg)

## Projects

A **project** is a folder: its scenes (`.vrmxs`), its assets (models, characters, items, sounds), its behaviours
module, `game.json` (the game: its first scene, the scenes it can reach, its controls) and `LICENCES.md` (every file
and its licence).

- **File › New Project…** (⇧⌘N) makes a project from a template, in a new folder you name, and opens its first scene.
  The templates are **Empty game** (one scene with a light, ground and a camera) and **One level** (a level in the cafe
  that plays at once, with a player, a goal and an ending). Every file a template copies in has its licence row.
- **File › Open Project…** (⇧⌘O) opens a folder; **File › Open Recent** reopens one with no panel, even after a
  relaunch.
- **File › Project Settings…** (⇧⌘P) edits `game.json` without typing JSON: the game's title, id and version, its
  **behaviours** module, the scene it starts in and the scenes it can reach, the **controls** (every action's key and
  gamepad button: press a control's button, then the new key; a key another action has asks before it moves), and the
  **physics layers** with a matrix of which layers collide. Each change is one undo step and is saved at once. While
  the panel is open, Edit › Undo and Redo are the panel's.

![Project Settings](/guide/images/tutorial-settings.jpg)

## The tree

The left panel is the open scene's tree: every node, under its parent.

- **Click** a row to select it; the inspector shows it. Drag a row onto another to move it under that node, or onto the
  empty space below to move it to the top.
- **Add** a node from the top of the panel: pick a type in the menu beside **Add**, and press **Add**. Types that
  need a file (a model, a character, an item, a prefab) come from the assets panel instead.
- **Search** narrows the tree: by name or id, `type:Light` for a type, `is:overridden` for prefab instances you have
  changed.
- A **prefab instance** (a door placed from `prefabs/door.vrmxs`) folds open to show the prefab's own nodes, named
  `door-1/hinge`. They are edited as the instance's overrides (below).
- **Delete** (⌫), **Duplicate** (⌘D), **Copy** and **Paste** (⌘C, ⌘V) work on the selection. A copy takes its
  children, its connections and the files it uses with it; every reference to a copied node follows the copy, so
  duplicating a coin wired to stop its own glint gives a coin wired to stop *its* glint.

The panels' edges can be dragged, and each panel folds to a rail. Their sizes are kept between launches.

## The inspector

The right panel edits the selected node. It is generated from the node type's schema, so every prop of every node
type has a field, and nothing is typed as JSON. The [node reference](../reference/nodes) lists every type and prop.

- **Id**: the name connections, behaviours and other props use for the node. Change it and every reference in the
  scene follows. A node another file depends on by its id (a sequence that films the scene, a scene that places this
  one as a prefab) can't be renamed: the refusal names the files. A counter, timer or goal another scene's condition
  reads keeps its old id as its `key`, so the condition still finds it.
- **Name, Parent, Before** (its place among its siblings, which is the order the scene runs them in).
- **Position, rotation** (degrees) **and scale**.
- **Every prop by its widget.** Numbers are dragged (drag the field sideways), stepped with ↑ and ↓ (⇧ ×0.1, ⌥ ×10)
  or typed, arithmetic included: `4*60` is 240. Vectors have a field per axis; colours a picker; a node prop a menu of
  the scene's nodes; a file prop takes a file dragged from the assets panel; lists and maps add and remove rows; a
  choice between shapes (a condition's test) has a menu for its kind.
- **Defaults and pins.** A prop that isn't set shows its default. The pin writes the default into the scene, so the
  scene keeps it even if the engine's default changes; the reset takes a set prop back out.
- **Props that don't apply are hidden or greyed out**: a box collider shows its size, not a radius.
- **Several nodes at once.** The **Also select…** menu and the **All 3 Area** button (every node of the selected
  type) select more without a modifier key. A field where the nodes differ shows **—** (or *mixed*); typing a value
  sets it on all of them, as one undo step.
- **Copy and paste a value**: the ⧉ and ⎘ buttons beside a prop copy its value and paste it into the same prop of
  another node (and the transform's, its position, rotation and scale).

Every change is one step of **Edit › Undo**; the toolbar's Undo button names the step in its tooltip ("Undo Set
coins.label"). A drag is one step, however long it lasts.

## Behaviours and connections

Under the props are two panels that make a scene a game.

![The Behaviours panel: the coin behaviour and its params](/guide/images/tutorial-behaviour.jpg)

**Behaviours.** A behaviour is code attached to a node. The **Add a behaviour…** menu lists the behaviours that attach to
the node's type: the engine's own (`player`, `wander`, `brain`, `pickup`, …, in the
[behaviours reference](../reference/behaviours)) and the project's. Each behaviour on the node shows its params, edited
like props, by their schema. Its **×** takes it off.

A project's own behaviours come from its **behaviours module**: a JavaScript file the project names in Project
Settings, usually `behaviours.js`. A class declares its params, the signals it sends and the state it keeps with a
`static describe`, which is how the panel knows its fields. The [tutorial](./tutorial#_5-write-the-coin-behaviour)
writes one, and [Project behaviours](../reference/behaviours#project-behaviours) has every key.

When the editor reads the module:

- when the project opens;
- when you choose another module in Project Settings › Behaviours;
- before each Play, if its text has changed since it was read (and while it plays, when you save it: hot reload).

A module file you add to the folder while the project is open isn't seen until you open the project again (File ›
Open Recent): the editor lists a project's files when it opens it.

**Connections.** A connection says: *when this node sends this signal, call this action on that node, with these
arguments*. The panel lists the selected node's outgoing connections. To add one, pick a **signal** (the node type's
and its behaviours'), a **target** node and an **action** (the target's type's and its behaviours'), and press
**Connect**.
The action's arguments then show as fields, by their schema. A connection is data in the scene: behaviours send
signals without knowing who listens, so the same coin stops its glint, adds a score or opens a door depending on how it is
wired.

![The coin's two connections](/guide/images/tutorial-connections.jpg)

## Prefabs and overrides

A **prefab** is a scene placed inside another as one node: an **Instance**. The sample's door (`prefabs/door.vrmxs`) is
one: a frame, a hinged leaf and a trigger area, placed as many times as the cafe has doors.

- **Place** one from the assets panel (prefabs are listed with the scenes' other files).
- **Fold it open** in the tree to see its nodes (`door-1/hinge`). Selecting one edits it as an **override** of that
  instance only: a dot marks each overridden prop, and its tooltip gives the prefab's own value. Click the dot to
  revert.
- The instance's **Overrides** list in the inspector has every override it carries. **Revert** takes one out;
  **Apply** writes it into the prefab's own file instead, so every instance gets it. The editor names the file and its
  other instances before it applies, and Apply is one undo step across both files. Save writes the prefab too.

![A door's hinge with an overridden mass: the dot and the prefab's value](/guide/images/editor-override.jpg)

## The assets panel

The bottom panel lists the project's files that can be placed: models, characters, items, prefabs, sounds,
animations.

- **Thumbnails** are drawn by the editor and kept between launches.
- **Type filters, search and folders** narrow the list.
- **Drag** a file onto the viewport to place it where it lands (on a floor or a table top), or press its **Add** to
  place it where the view looks. Drag one onto an inspector field that takes a file (a model's asset, a sound) to set
  it.

![The assets panel](/guide/images/editor-assets.jpg)

## The viewport

The middle of the window is the scene as it will look, drawn with WebGPU where the Mac has it, else WebGL (the status
bar says which).

- **Orbit** (drag), **pan** (right-drag) and **dolly** (scroll), or switch the toolbar to **Fly** (WASD, R and F up
  and down, the arrows to turn). **F** frames the selection.
- **Click** selects; ⇧-click adds; ⌘-drag selects everything inside a rectangle.
- **Gizmos**: **W** move, **E** rotate, **R** scale, with **Snap** in the toolbar (0.25 m, 15°, 0.1). A drag is one undo
  step on release.

The toolbar's **Outline, Handles** and **Preview** switch the viewport's aids. None of them is part of the scene: they
are drawn over the frame and never reach an export, a still or the game.

- **Outline**: a line round the selected nodes.
- **Handles**: on a selected collider or area, a handle on each face of its box (or a sphere's radius, a capsule's
  height and radius); on a light, its range and cone. Drag one and the opposite face stays put; ⌥ grows both sides.
  The props change as you drag, one undo step on release.
- **Preview**: a picture in picture of what the selected Camera sees.
- **The view cube** turns the view to look along an axis.

![An area's handles in the viewport](/guide/images/editor-handles.jpg)

![The selected camera's picture in picture](/guide/images/editor-preview.jpg)

**Help › Keyboard Shortcuts** (⌘/) lists every key.

## Play in place

**Play** runs the open scene in the viewport: physics, characters, the behaviours and connections, with the game's
controls and physics layers from `game.json`. It runs the scene, not the whole game: the game's rules (counters,
flags, timers, goals, winning and losing, scene changes) run in the game app, so play an exported build to try them
(Export Game, below). A behaviour that uses the game's state should allow for its absence here.

WASD walks, the mouse turns the camera, **E** interacts, and a gamepad works too. The status shows the step it is on.

Press **Play** again to stop. Stopping puts the scene back as it was before Play, and the status says so ("Stopped:
scene as before Play"): nothing that happens while playing changes the scene. A behaviours module that won't load, or
declarations the engine refuses, are shown in a box over the viewport, and the scene still plays: without the module's
behaviours, or with the refused ones running as code only.

![Play in place: Hana calls out the coin](/guide/images/tutorial-play.jpg)

## Hot reload

While the game plays, the Mac editor watches the project's behaviours module and every file it imports. Save a change
in your text editor and the editor loads it again **without restarting the scene**, on the boundary between two steps:

- A behaviour whose declared state is the same shape keeps its state: its new code runs with the values the old code
  had. One whose state changed shape starts again on its node.
- A change that doesn't load (a syntax error, a declaration the engine refuses, code that throws as it starts) leaves
  the old code running and shows the error over the viewport. Fix it and save again.
- The status line says what is watched and what each reload kept or restarted.

A play that was reloaded can't be exported as a video or replayed: its recording is marked. An exported game never
reloads anything. In a browser tab there is no hot reload.

## Saving

- **Save** (⌘S) writes the open scene into the project; **Save As…** (⇧⌘S) writes it under another name. The status
  says when the scene has unsaved changes, and **Reopen & compare** reads the saved file back to check it is the same.
- Closing the window or quitting with unsaved changes asks first: Save, Don't Save or Cancel. A save that fails (a
  full disk) says why and keeps the window open.
- Project Settings save as you change them.

**The game's saves, across updates.** Players save their games in the game app (six slots, and checkpoints). When you
export a new version of your game with the same engine, a player's earlier saves still load if nothing a restore reads
changed:

| Still loads | Refused, and the game app says why |
|---|---|
| A model's textures and materials, a sound, a line of dialogue's audio, a key or button rebound, a reworded description in a behaviour's `describe` | Any edit to a scene or a prefab; a changed item or character; a model's nodes, meshes or animations; a behaviour's declared state changing shape; any edit to a behaviour that declares no state; an action added, removed or renamed; a new version of the engine |

A behaviour's `describe.state` decides it, which is why declaring it matters. A project behaviour the game's scenes
use that declares no `state` is counted by the text of the whole behaviours module (and what it imports): while any
such behaviour is attached, any edit to the module, a reworded description included, refuses earlier saves. When every
project behaviour the scenes use declares its state, only a change to a state's shape does. Replays (a recorded
session played back) compare the whole build, so any change refuses those.

## Export Game

**File › Export Game…** (⇧⌘E) makes the build players get. It opens the **Export** panel, whose line says what
happened. The editor checks everything first and only then asks for a folder, so a refused export changes nothing:

- every file the game uses has a row in `LICENCES.md`;
- every file a scene names is in the project, with the same case;
- the behaviours module loads and its declarations are valid, and it is the module `game.json` names (Project Settings
  › Behaviours): one that only Play runs would leave the build without it, so the export refuses it.

Then it asks for a folder: choose or create an empty one (or the folder of an earlier build, which it
replaces; a folder holding anything else is refused). It writes the game app, the project's files under `project/`,
and `vrmxg-build.json`, which lists every file with its SHA-256 and licence. The Export panel's line says how many
files and bytes it wrote, or what was refused and why. The build is made from the saved files: unsaved changes in the
open scene aren't in it, and the line says so.

A build plays:

- **in a browser**, from any static web host, or locally with `node apps/game/scripts/play.mjs <build folder>`.
  `vrmxg-export --worker <build folder> <out> [--name <worker>]` turns a finished build into a folder ready for a
  Cloudflare Worker; putting a game on the web is yours to do;
- **as a Mac app**: `apps/game-mac/scripts/build.sh <build folder>` makes `apps/game-mac/build/<game id>.app`, named
  after the game, with its own saves. It is ready to be signed with a Developer ID and notarised; signing and
  notarising are steps for whoever publishes the game.

The same build comes from Node: `vrmxg-export <project folder> <out>` writes the same bytes the editor does, once
`game.json` names the behaviours module. (Unlike the editor, `vrmxg-export` doesn't yet refuse a root `behaviours.js`
that `game.json` doesn't name: it leaves it out.)
