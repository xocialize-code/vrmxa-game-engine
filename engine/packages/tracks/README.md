# @vrmxg/tracks

M2 W0 (AB-T-0523). The track core: keyed tracks evaluated as a **pure function of the frame**, and the
`AnimationPlayer` node that plays them inside the simulation step. Sequences (W1) build on the same evaluation
(`research/cinematics.md` §1.1).

```js
import { installTracks, evaluateTrack, sampleAnimation } from '@vrmxg/tracks';
installTracks(tree);   // after audio: the AnimationPlayer node type and the "tracks" service
// in a scene: { "type": "AnimationPlayer", "props": { "fps": 30, "autoplay": true, "tracks": [
//   { "type": "property", "target": "counter-light", "path": "props.intensity", "keys": [[0, 18], [45, 2, "easeInOut"]] },
//   { "type": "event", "keys": [[15, { "target": "door-1", "call": "enterState", "args": { "state": "open" } }]] },
//   { "type": "animation", "target": "hana-1", "clips": [{ "start": 10, "end": 70, "slot": "talk", "blendIn": 8, "blendOut": 8 }] } ] } }
```

| Piece | What |
|---|---|
| Keys | `[frame, value, ease?]`, sorted by frame. A key's ease shapes the segment *arriving* at it: `linear`, `easeIn`, `easeOut`, `easeInOut`, a bezier `[x1, y1, x2, y2]` (solved by 30 fixed bisections), or `step` (hold until the key). `interp: 'step'` holds every key. Numbers, number arrays and `#rrggbb` colours blend; anything else holds |
| Holds | `step: 2` or `3` floors the frame to a multiple before evaluation: a character on twos while the camera moves on ones |
| Release (M4 W9) | `release: true`: the track holds its target only from its first key to its last (an expression track: each channel over its own keys), and leaves it alone outside them. A released animation track plays *over* the animation track before it, by its own weight, instead of replacing it (`overAnimation`), and sets nothing between its clips; `beginTracks` clears a character's track animation before a step's tracks apply, so it never plays over the last step's. A performance take's tracks (`@vrmxg/takes`) are released: a take covers its own span and the film's other tracks keep the rest |
| Track types | `property` (target + path: `visible`, `props.<name>`), `transform` (`{ p, q, s }`: q by slerp), `expression` (per expression name), `event` (`{ target, call, args }` or `{ emit }`, fired as playback crosses the frame, never on a jump), `audio` (clips of `.wav` assets, heard through the audio service as a provider), `animation` (clips naming a slot or a clip, with blend-in / blend-out, speed, offset, loop) |
| Animation on characters | `sampleAnimation` gives `{ weight, clips }`: overlapping clips cross-fade by their blend-ins, and the track's weight against the character's own locomotion ramps over the first clip's blend-in and the last's blend-out. The character mixes it over its graph (`trackAnimation`), the graph keeps stepping underneath, and control goes back to it when the track lets go. Clips are named by slot, by clip name or by sha256 |
| `AnimationPlayer` | Plays its tracks on the step clock: frame = from + (step − startStep) · fps · speed / 60. Actions `play { from }`, `stop`, `seek { frame }`; signals `started`, `finished`, `event`; `loop`, `autoplay`, `length` (default: the last key or clip). Its playback state is in the snapshot |
| `tracks` service | Advances every player before the nodes step, so what a player sets (a prop, a pose, an expression) is there when those nodes step, in the same step |
| `checkTrack` | Problems as messages: an unknown type, a missing target or path, keys out of order, a clip that ends before it starts, an animation clip with both or neither of slot and clip |

Determinism: inside the boundary (`"vrmxg": { "determinism": "simulation" }`). Eases use only `+ − × ÷`; slerp goes
through three's `slerpFlat` with `@vrmxg/dmath` installed. Jumping to a frame and playing to it give the same values.

Tests (`npm test`):
- keys, eases, holds, colours, transforms and expressions;
- animation weights, events and checks;
- release: a property and an expression track outside their keys, an animation track over another;
- a player in a tree: props, transforms on twos, events once, finish, loop, seek, jump = play, snapshot and restore;
- on the cafe: an AnimationPlayer added to the scene opens the staff door by an event (step 31), fades the counter
  light and plays Hana's `talk` clip over her locomotion. Two runs are identical, a snapshot mid-clip replays
  identically, and she gets her locomotion back at the end.
