# Character layers (M5 W7, AB-T-0609): the design note

PRD §5.4's P1 "Blend trees" row and open issue G10, modelled on PlayCanvas's anim layers (a layer has a weight, a
mask and a blend type, overwrite or additive; `research/playcanvas-comparison.md`, recommendation 11) without their
limits: our layers are scene data and an API a behaviour, an interaction, a director and a sequence all reach, not only
code; a layer plays a clip or a VRMXA slot, so an equipped set can change what it plays; the travel root motion stays
the base layer's.

## What there was (M2 W8)

M2 added two **slot layers** inside the locomotion graph (`graph.js`): a set's `hold` slot over every state, and a
masked one-shot (`startAction('greet')`) over locomotion. Both are masked subclips blended by the mixer, weighted
B·f/(1−f) against the full-body weight. They stay exactly as they are: changing their maths would move the replay of
everything that holds a sword or waves through a masked slot (the sample's sword set, the M3 conversations' gestures,
the companion's idle gestures), and the rule for this work is that nothing that doesn't use the new layers moves.

## What W7 adds: named character layers

A **character layer** is a pose pass after the mixer, on the normalized humanoid bones, in order, each over the result
of the ones before it:

```
graph + mixer (base: locomotion, actions, M2's slot layers, a sequence's full-body animation)
  → character layers, in order (this note)
  → travel root motion off the hips → getting up from a ragdoll → IK (feet, reach) → look-at, vrm.update
```

**Which layers ship.** Without a `layers` prop a character has four, applied in this order:

| Layer | Mask | Blend | For |
|---|---|---|---|
| `upperBody` | `upperBody` (spine, chest, neck, head, arms, hands) | overwrite | carrying a tray, a wave, holding a cup up while walking |
| `arms` | `arms` (shoulders, arms, hands) | overwrite | an arm gesture over a carried pose's spine, or over the upper body's |
| `face` | `face` (neck, head, eyes, jaw) | overwrite | a nod or a head turn over anything below |
| `additive` | `fullBody` | additive | breathing, a flinch, a lean added to any pose |

A `layers` prop on the Character node (scene data: the editor and MCP see and set it) replaces the list:
`[{ name, mask, blend, weight }]`. `mask` is a name from `masks.js` (`fullBody`, `upperBody`, `lowerBody`, `arms`,
`hands`, `face`) or a list of VRM 1.0 humanoid bone names; `blend` is `overwrite` (the default) or `additive`; `weight`
(0 to 1, default 1) scales whatever plays on it, so a scene can tone a layer down. The prop has no default value, so a
scene that doesn't write it is the same document, the same snapshot and the same hashes as before. The prop is read by
value, so a track keying `props.layers.0.weight` takes effect on a scene that writes the prop (a restored world, which
gets a fresh copy of the props, agrees); what plays on a layer the list drops stops at once, and a restored state that
names a layer the list lacks drops it the same way. A bad value never throws inside the step: keyed onto a scene with no
`layers` prop (which makes an object, not a list) the defaults play; an entry that is wrong is left out; a weight is
clamped to [0, 1] (an ease overshooting). The character says what was wrong once, as a warning (presentation, never
simulation), and scene validation reports an authored prop against the registry's schema. A track on a layer the
character doesn't have plays nowhere and is said once the same way.

**Masks** are VRM humanoid bone groups (`masks.js`, already G10's vocabulary). A layer writes the rotations of the
masked bones it has tracks for, and the hips' position only when `hips` is in its mask. Expressions and look-at are not
layered: a face's expressions stay with emotes, takes and expression tracks.

**Overwrite and additive.** Overwrite slerps each masked bone from the pose below towards the layer's by its weight:
`q = slerp(q_below, q_layer, w)`, the hips' position by lerp. Additive adds the layer's difference from the rest pose,
scaled by its weight. On VRM's normalized bones the rest rotation is the identity, so the difference is the layer's own
rotation: `q = q_below · slerp(1, q_layer, w)`, and the hips' position `p = p_below + w·(p_layer − p_rest)`. Every
slerp, the keyframe sampling's included, is our own through `@vrmxg/dmath`'s `acos` and `sin` (`layers.js`), not
three's `slerpFlat`, so the layer pass doesn't depend on the patched `Math` being installed.

## What drives a layer

| Who | How |
|---|---|
| A behaviour, a brain, a script, MCP | `character.playLayer({ layer, clip \| slot, loop, rate, fade, weight, offset })`, `stopLayer({ layer, fade })`, `layerWeight({ layer, weight, fade })` (one argument, as every Character action takes; `layer` defaults to `upperBody`); the same three are registry actions on Character, so scripts, sequence event keys and MCP's `call` reach them |
| VRMXA animation sets and slots | `slot` plays the slot as the character's equipped sets resolve it now, picking among its entries by weight from the character's random stream (as the graph does), so an item's set can bring its own carry or wave clip. The layer's mask wins over an entry's `mask` |
| `@vrmxg/interact` (carry) | a `take` verb with `carry` (a slot or a clip name; `carryLayer`, default `upperBody`) puts the item in the inventory **and** plays `carry` looped on that layer; `interact.release(actor, itemId)` (the item's own id, as the inventory keeps it) takes it out of the inventory and stops the layer when nothing carried is left; a scene connection calls the Character's `releaseCarry({ item? })` action for it (without `item`, the last thing she carries). A scene change carries the inventory (GameFlow), and the next world's interaction service holds each carried pose again, at once, on its first step (`carryTo` marks the entries, so a save on the boundary restores the same). The sample game's "carry an order to a table" is that verb plus a connection to `releaseCarry` |
| A sequence or an AnimationPlayer | an `animation` track with `layer: '<name>'` plays its clips on that layer instead of taking over the body: its clips cross-fade as they do today, and its blendIn and blendOut ramp the layer in and out. The track's sample is set on the character every step (`trackLayers`), a pure function of the frame, so a scrub lands on the same pose. "Wave on the upper body" in a film is one such track |
| A director | its gesture calls keep M2's masked slots; a director that wants a layer calls `playLayer` |

A layer plays one clip at a time. Playing another clip on a playing layer cross-fades from the old clip (which keeps
running) to the new one over `fade`; during a cross-fade, from whichever of the two weighs more then (the other drops
out: a small step in the pose, the price of one clip at a time). The loop already playing, asked for again without an
`offset`, goes on from where it is (a second tray doesn't restart the carry). A one-shot (`loop: false`, `rate` above 0)
fades out by itself over its last `fade` seconds of playback and the layer goes idle. Weights move by whole steps
(`fade` seconds × 60 steps, linear), not by accumulated seconds. A carry that can't play (no such layer or clip, an empty slot, or a slot naming a clip she doesn't have)
refuses the take before anything changes.

Every clip a layer plays is one of the mixer's clips, so every bone a layer writes is bound in the mixer, and the mixer
writes it back to rest on any step no clip weights it: nothing a layer wrote outlives the step it was written on, and
the layers' state needs nothing but what plays.

## State, and where it lives

| What | Where | In the snapshot |
|---|---|---|
| The layer list (mask, blend, scale) | the node's `layers` prop | yes, with every node's props (core state) |
| Per layer playing: clip (sha256), slot, loop, rate, time, weight, the fade (from, to, steps left, steps), the clip it fades from (clip, time) | `character.getState().layers`, keyed by layer name | yes, under the character's own state, **only while a layer is not idle**: a character that never plays a layer has exactly the state, and the hashes, it had |
| A sequence's layer sample | `character.trackLayers` | no: the sequence's frame is state, and the sample a function of it |

Times and weights advance in `physicsProcess` from the fixed step (`dt` = 1/60), beside the graph. While the character
is knocked down and lying, its layers hold (they advance again once it gets up). A restored world takes the layers'
state back exactly, so a save taken mid-fade loads into the unbroken run's following hashes.

## Not in W7

- 1D and 2D blend spaces inside a layer (the base layer's walk/run blend is the only blend space): a later blend tree
  node can play a blend where a layer plays a clip.
- Moving M2's slot layers onto character layers: possible once a re-bless of the sword and gesture replays is wanted.
- Proposing `carry` on VRMXI's `take` verb and a `carry` slot to VRMXA §8.2 (the owners' call; until then both are
  engine-side names).
