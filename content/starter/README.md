# Starter content

M6 W4 (AB-T-0647, plan AB-P-0020, decision AB-D-0297 item 7). Content a game builder can ship without a licence
question: **a default animation set** for any VRMXA or VRM character, and **a starter item pack** as VRMXI. Everything a
game uses from here is **CC0 1.0**. Each file's source is in [LICENCES.md](LICENCES.md), and the full provenance is in
`animations/provenance.json` and `items/provenance.json`. New Project's templates (W3) and the second game (W10) build
on it.

Asset refs are paths under this folder (`items/door.vrmxi`, `animations/clips/walk.vrma`), the same layout as
`content/sample/`, so a project can copy the folder in as it is.

## The default animation set

`animations.json` is a VRMXA animations document (§8.4) with 37 clips in `animations/clips/`. They are mesh2motion's CC0
human clips, retargeted onto the VRM humanoid. Give it to a character as its project animations (`installCharacters`'
`projectAnimations`, or a game's animation sets) or in place of a character's own (`library.setAnimations(ref, set)`).

| Set | Requires | Slots |
|---|---|---|
| `default` | | Movement: `idle` (two idles, weighted 3 : 1), `walk` (0.81 m/s), `run` (4.49 m/s), `jump`, `fall`, `land`. Posture: `sit`, `sitIdle`, `stand`, `getUp`. Conversation: `talk`, `listen`, `think`. Gestures (masked, so they play over walking): `greet` and `wave`, `nod`, `clap`, `cheer`, `sip`, `emote.happy`, `emote.angry`. Items: `use`, `equip` (VRMXI's take), `carry` (the upper body, for a carried tray). The app's own slots: `x-vrmxg.crouch`, `crouchWalk`, `pickUp`, `push`, `dance`, `hit`, `death`, `punch`, `kick` |
| `sword` | `held:sword` | A sword in hand (VRMXA §8.3): `idle` with the sword up, `hold` (the upper body while moving), `use` is a swing, `x-vrmxg.block` |
| `chest` | `container:chest` | While a character opens a chest (VRMXI §8.1: the item's tags count), `use` plays the chest-opening clip |

How the engine plays them: locomotion by input; the actions (`use`, `take` → `equip`, `talk`, `sit`, `sitIdle`,
`stand`, `getUp`) and the masked gestures by `startAction(slot)`; anything else on a character layer,
`playLayer({ layer, slot })`. `carry` goes on `upperBody`. The full-body `x-vrmxg.*` slots need a full-body overwrite
layer in the Character's `layers` prop, `{ name: 'body', mask: 'fullBody', blend: 'overwrite' }`, which is what the
check below does.

Ground speeds are measured on Spec, as VRMXA §8.4 has them, by vrmxa-core's clip checker. The walk/run blend plays the
clips at the rate that matches the character's speed. vrmxa-core's checker still flags some clips, as mesh2motion made
them: idles turned 13° from ahead, a few loop seams that jolt, a crouch's or seat's feet a few centimetres below the
floor. `animations/provenance.json` lists each clip's notes.

**How the clips are made** (`tools/make-animations.mjs`): mesh2motion's human rig is a T-pose facing +Z, as VRM 1.0's
rest is. So each bone's world rotation away from rest carries straight over to the normalized humanoid. Clips are sampled
on their own 24 fps keys, fingers included. Each clip is then lifted so Spec's soles touch the floor on the frames she
stands (her legs are longer for her hips than mesh2motion's). A check fails the tool when any limb posed on Spec by the
written `.vrma` points more than 1° from mesh2motion's (worst today: 0.016°).

## The starter item pack

17 items in `items/`, each valid by the VRMXI checker with nothing to report. Each item's origin is on the floor, with
its front towards +Z.

| Item | `type` | What doing it shows |
|---|---|---|
| `door.vrmxi` | `door` | A frame and a leaf on a hinge joint with a motor: Open / Close (and a `locked` state that offers nothing) |
| `chest.vrmxi` | `container` | A kinematic lid moved by its own `LidOpen` / `LidClose` animations, coins inside: Open / Close. Tagged `container:chest`, so the starter set's `chest` set plays the chest clip |
| `lever.vrmxi` | `switch` | A wall lever thrown by animation, a lamp shown by state: Pull / Push back |
| `button.vrmxi` | `switch` | A push button on a post, its cap up or down by state: Press |
| `chair.vrmxi`, `bench.vrmxi` | `seat` | One seat point, and two on the bench, each with an exit: Sit |
| `coin.vrmxi`, `key.vrmxi`, `mug.vrmxi` | `pickup` | Taken into the game's inventory (not takeable into a closet, so no VRMXW): Pick up / Take |
| `sword.vrmxi`, `axe.vrmxi`, `hammer.vrmxi` | `pickup` | mesh2motion's CC0 weapon props (with their texture) lying flat: Pick up |
| `shelf.vrmxi`, `table.vrmxi` | `x-vrmxg.prop` | Static furniture with colliders, no verbs |
| `crate.vrmxi`, `barrel.vrmxi` | `x-vrmxg.prop` | Dynamic bodies a character can push. The barrel has a flat footing inside its cylinder, because a cylinder alone rocks on its rim when it lands |
| `spawn.vrmxi` | `spawnPoint` | Where the player starts (`spawn:player`) |

`x-vrmxg.prop` is a vendor type (VRMXI §2) for plain furniture and props. VRMXI's M1 types don't include them yet.

Two lessons from building these. A hinge motor lifting a part against gravity in Rapier needs careful tuning: with a
stiffness of 60 a 3 kg lid doesn't move at all, and at 600 it flips open even at its closed target. So the chest and the
lever move by animation on kinematic bodies, as the specification's own chest and switch fixtures do. Also, three's
loader turns spaces in node names into underscores, so code that finds a part by name must try both.

## Checks

- `node content/starter/tools/check-licences.mjs` checks that every file has a row and every content file is CC0. It runs
  in CI and in `npm test` (`test/licences.test.mjs`, which also checks that LICENCES.md is what
  `tools/make-licences.mjs` writes).
- `test/set.test.mjs` checks that the set is whole: each clip's SHA-256, its VRMA extension, CC0, every slot naming a
  clip, and the slots the engine plays. It runs everywhere.
- `test/starter.test.mjs` runs `apps/playground/src/starter-check.js` in Node. Mira (the sample's VRMXA) is cast with
  the default set in place of her own, and every slot of every set is played: each moves her, every bone stays finite,
  and the starter's clip is the one that plays. Every item is then used through `@vrmxg/interact` as its type says:
  the door swings 1.6 rad, the chest lid and the lever turn 1.7 rad, the button turns on, both seats seat her in
  `sitIdle`, every pickup leaves the world for the inventory, the props stand still, and the spawn point has its node.
  The run is the same twice. It needs vrmxa-avatar-studio beside the repository.
- The playground's `?mode=starter` runs the same check in a browser (`window.__result`), from the build's `starter/`
  folder. `acceptance/m6/starter.mjs` runs it in Node and in headless Chromium and requires the same results from both
  (`acceptance/results/m6-starter.json`: PASS, Chromium's results identical to Node's).
- `tools/make-stills.mjs` draws two contact sheets in Chromium: Spec posed by every clip
  (`acceptance/results/m6-starter-set.png`) and every item's model (`m6-starter-items.png`). They are for looking at;
  nothing compares their pixels.
- `test/tools.test.mjs` checks that the tools remake every committed file byte for byte. It needs mesh2motion,
  vrmxa-avatar-studio and VRMXA_Specification with the VRMXI draft.

## Remaking it

```bash
node content/starter/tools/make-animations.mjs   # the clips, animations.json, animations/provenance.json
node content/starter/tools/make-items.mjs        # the items, items/provenance.json (checked by the VRMXI checker)
node content/starter/tools/make-licences.mjs     # LICENCES.md from both provenance files
node content/starter/tools/make-stills.mjs       # the contact sheets (optional; takes the GPU lock)
```

Each tool takes `--check`, which writes nothing and fails on a difference. The first two read
`reference/mesh2motion-app-main`, which is git-ignored (in a worktree they find the main checkout's) or comes from
`--source <dir>`. They refuse to run if mesh2motion's `LICENSE-CC0.MD` stops putting its animations and models under
CC0. **Never run gltf-transform on a `.vrma`**: it drops the `VRMC_*` extensions. To change which clips or items there
are, edit `tools/starter-clips.mjs` or `tools/starter-items.mjs`.
