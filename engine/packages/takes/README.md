# @vrmxg/takes

M4 W9 (AB-T-0581; M4 check 5; receipts AB-R-1085 and AB-R-1086, decision AB-D-0281). Performance takes: one character's performance, recorded over a sequence while it
plays, kept as ordinary tracks, and replayed exactly from its log. Three kinds:

| Kind | The person | The log (the take's only input) | The tracks it becomes |
|---|---|---|---|
| `puppet` | drives her with the keyboard or a gamepad | the input recording (`@vrmxg/input`, the puppet's own action map) and the camera yaw her walking was relative to | her walk as a `move` track, her eyes as a property track on `props.gaze`, her gestures as clips on an animation track |
| `director` | talks to her through `@vrmxg/director` | the ai service's log for her: each request, and each decision the model's reply became | her lines as dialogue clips, her expression as expression keys, her gestures as animation clips, who she looks at as lookAt clips, and a goal (or going somewhere, using something) as a `decisions` key |
| `face` | shows their face to the camera | the face samples the capture gave: blink, jaw, smile, brows and the head's angles, as measured | an expression track (`blink`, `aa`, `happy`, `surprised`, `angry`, and winks) and a property track on `props.head` |

```js
import { startTake, takeWorldDoc, takeTracks, keepTake, removeTake, replayDoc } from '@vrmxg/takes';

// record: a take world is the film's world on the step the take starts at
const rec = startTake(world.tree, { kind: 'puppet', target: 'mira', id: 'take-1', fps: 24, devices: [keyboard, gamepad] });
// … the host steps the world in real time; a face take's camera calls rec.pushFace(sample) …
const take = rec.stop();                    // the take document: a log, stamped with steps

takeTracks(take);                           // { tracks, cast }: pure, the same in Node, Chromium and WKWebView
keepTake(session, take, { name: 'Mira' });  // ONE undo step: "Take 1: Mira, puppet (8.7 s)"
removeTake(session, 'take-1');              // one more
replayDoc(filmDoc, take);                   // the film the take replays as: the document it was performed over + its tracks
```

## Design

**A take is a log first.** The take document (`vrmxg-performance`, `take.js`) holds what came from outside the
simulation, each entry stamped with the step it applies on, and nothing derived: no positions, no poses, no keys. The
director's replies are in it (as the decisions they became), so nothing ever asks a model again; the face samples are
numbers, never an image.

**Tracks are a pure function of the log.** `takeTracks(take)` reads only the take document. It uses `+ − × ÷`,
comparisons and `@vrmxg/dmath`, in a fixed order, so the same log gives the same tracks byte for byte everywhere
(`acceptance/m4/takes.mjs` hashes them in three runtimes). A value applied on step *s* is keyed at the frame that step
arrives at (`frameOfStep`: (s + 1) · fps / 60, the sequence service's own arithmetic), so a key lands on exactly the
step it was performed on. Samples taken every step or every camera frame are thinned to keys a person can edit
(`reduce.js`: Ramer–Douglas–Peucker against the linear blend the tracks evaluate; 0.01 rad for eyes, 0.03 for
expression weights, 0.012 rad for the head).

**Where logs live.** In the project, beside the film: `performances/<sequence id>/<take id>.json` (`takeRef`). The
creator writes it when the take is kept. The film never reads it to play: it is the record a take can be re-derived
from (after a change to the thinning, say) and the thing an agent or another machine applies.

**A kept take is its own tracks.** Each track is marked `take: "take-3"` and `by: "puppet"`, goes after the film's
other tracks, and is *released* (`@vrmxg/tracks`): it holds its character only from its first key to its last, and an
animation track plays over the one before it. So:
- a take covers its own span, and the script's performance or an earlier take keeps the rest;
- a later take plays over an earlier one;
- nothing is merged into another track, so removing a take removes exactly what keeping it added;
- `@vrmxg/script` treats the tracks as the person's own (its rule 5): a re-script keeps them and moves them with the
  beats they fall in;
- they are rows on the timeline like any others: move a key, trim a clip, delete a track.

The list of takes in a film is read from its tracks (`takesOf`); there is no second record to drift.

**Undo.** `keepTake` puts the take's tracks (and, for a director take that gave her a goal, her brain: below) into the
sequence as one `setDoc` op through the session's command log: one undo step, named for the take. Undo gives back the
exact bytes. `removeTake` is one step too. Discarding a recorded take changes nothing, because nothing was changed.

**What the snapshot needs: nothing new.** Everything a take's tracks drive is already world state:
- her walking intent is the character's `input.move` (in her state);
- her eyes and head are node props (`gaze`, `head`: core state);
- her expressions are the character's;
- a released animation track is evaluated afresh every step (`beginTracks` clears what the last step left).

So a film with takes scrubs from snapshots like any other (`SequencePlayer`), and the acceptance restores a snapshot
taken mid-walk into a fresh world that plays on to the same end.

**The live take plays through the same tracks.** While recording, the recorder is a service just before the sequence
service. Each step it latches what the performer is doing and writes it into *live tracks* of the take world's own
sequence, which the sequence service then plays in that same step. Her walk and her gestures are the kept take's keys
and clips exactly, so in the kept film she is where the live take had her on every step, bit for bit (tested). Her eyes
and face are the kept take's keys before thinning, so the film stays within the thinning's tolerance of what was seen.
A director take's performer is her brain (the take world casts her with the `actor` preset, `takeWorldDoc`), and the
film replays her decisions through a `decisions` track on the same steps.

**Replay.** Replaying a take is building the film it was performed over with `takeTracks(log)` added, and playing it:
no device, model or camera. `apps/playground/src/takes-check.js` does that with the sample's three logs and hashes the
world on every step; Node, Chromium and WKWebView (scheme and loopback) give the same hashes.

## What each kind derives

**Puppet** (`puppet.js`). `PUPPET_ACTIONS` is the puppet's own map: W A S D or the left stick walks (Shift or the right
trigger runs, Space or A jumps), the arrow keys or the right stick turn her eyes (R or a click of the stick gives them
back), 1 to 6 (X, Y, B and the d-pad) play gestures (`greet`, `nod`, `shrug`, `point`, `laugh`, `cheer`, or the setup's
own). `PuppetState` turns a step's latched actions into her intent: forward is away from the camera she is seen
through, as the player controller has it, which is why the log carries the camera's yaw.
- **Walk:** a `move` track (`@vrmxg/sequence`) with a key where her intent changes and a last key that stops her. Her
  own controller walks her, so collisions, turning and the walk animation are the simulation's.
- **Eyes:** `props.gaze` as `[yaw, pitch]` from her facing, in runs that each end with a `null` key (her eyes go back
  to the film's look-at).
- **Gestures:** a clip per press, as long as its slot (the recorder reads the lengths from the character).

**Director** (`director.js`). From each decision in the ai log:
- `say` becomes a dialogue clip with the words (voiced later like any line, `@vrmxg/voicing`);
- `emote` becomes expression keys: up over a third of a second, held for the line, down again;
- `gesture` becomes an animation clip, and `lookAt` a lookAt clip until she looks elsewhere or the take ends;
- a goal, or `goTo`, `follow`, `interact`, `wait`, becomes a key on a `decisions` track, which her brain takes on the
  same step in the film. Only then does the film need her to have a brain. If she has none, `keepTake` casts her with
  the `actor` preset (`@vrmxg/ai`: she stands where she is and does only what she is directed to) and marks the take's
  decisions track `cast: "actor"`. `removeTake` takes away only a brain a take gave her, once no other take's
  decisions need it; a brain she already had stays.

**Face** (`face.js`). A face sample is `{ step, blinkL, blinkR, jaw, smile, browUp, browDown, yaw, pitch, roll }`: 0 to 1
and radians, the person's own left and right. Which capture made it doesn't matter: `faceFromFeatures` reads the Mac
shell's `camera.frame` (`face.shape`, Vision's landmarks: `spike-face/README.md` has the verdict), and
`faceFromBlendshapes` reads MediaPipe's 52 scores. `FaceFilter` makes her face from them one sample at a time, never
looking ahead:
- **a resting face:** the median of the first 15 samples (hold still as the take starts), taken out of every value,
  the eyes included;
- **smoothing** with a time constant in steps (the same curve whatever rate the camera ran at), a dead zone and a gain
  per value;
- **blinks through a soft threshold**, so an eye is open or shut and the squint of a smile stays open; both eyes
  together are `blink`, and only what one eye does beyond the other is a wink;
- **mirrored** by default, as a mirror shows the person: their left eye is her right, and she turns the way their head
  turns on screen. `setup.mirror: false` makes her them;
- **channels:** `setup.channels` picks among `blink`, `mouth`, `smile`, `brows` and `head`. Inside the take's span a
  recorded mouth is hers, over the lip sync of a line; leave `mouth` out to keep the lip sync.

Every channel starts from rest and is back at rest 8 steps after the last sample. `syntheticFace()` is a deterministic
session (blinks, a smile, brows up and down, talking, a wink, a head turn, a nod) for tests, the acceptance and the
creator's `?face=synthetic`.

## What it needed elsewhere

| Where | What |
|---|---|
| `@vrmxg/tracks` | `release: true` on a track: it holds its target only between its keys (an expression track: per channel), and a released animation track plays over the track before it (`overAnimation`, `beginTracks`) |
| `@vrmxg/sequence` | the `move` track: `[frame, [vx, vz, jump?]]`, held, her `input.move` from its first key to its last. A walk begun after a transform cut owns her place until the next cut (a script's `[[NAME at: mark]]` would otherwise put her back every step). A lookAt track that ends hands her eyes back to another lookAt track with a clip live there |
| `@vrmxg/character` | `props.gaze` (`[yaw, pitch]` from her facing, before the look-at target) and `props.head` (`[yaw, pitch, roll]` over the animation, half on the neck and half on the head) |
| `@vrmxg/ai` | the `actor` preset |
| `@vrmxg/director` | a director with no `user` node can speak (the split turn's line and verdict required a listener in the scene) |
| `apps/shell` 0.8.0 | `camera.start { face: true }` adds `face.shape` to each frame (`FaceShape.swift`) |

## Tests

`npm test` (the in-world ones need `vrmxa-core` beside the repo):
- **`takes.test.mjs`**, no world: key thinning; step and frame arithmetic; each kind's derivation from a small scripted
  log; the sample's three logs against their golden track hashes (`golden.json`); keeping two takes in the sample short
  as two undo steps, exact bytes on undo, removing one.
- **`world.test.mjs`**, in the film's world: recording the sample's takes again gives the committed logs byte for byte;
  the kept film has Mira exactly where the live puppet take had her on every step; the film says Hana's directed lines
  and walks her over; Mira's face stays within the thinning's tolerance of the live take's; and the replay check
  itself (twice the same, a snapshot inside a take restored, every take performed).

The sample logs are made by `node content/sample/tools/make-takes.mjs` (`--check` compares). Acceptance:
`acceptance/m4/takes.mjs` (Node and Chromium) and `acceptance/m4/takes-wkwebview.sh`.

## Not yet

- A take is one character. Two people puppeting two characters at once would be two recorders on one world.
- The mouse doesn't turn her eyes (it would need pointer lock on the viewport).
- The thinning's tolerances and the face filter's gains are set on synthetic faces: the operator's camera session
  (AB-T-0557) is what tunes them on a real one. A kept take can be made again from its log after they change.
