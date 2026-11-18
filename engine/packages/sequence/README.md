# @vrmxg/sequence

M2 W1 (AB-T-0524; decision AB-D-0257). Sequences: a `.vrmxs` of its own that films a set scene, with shots, shot
overrides, markers and tracks, played **inside the simulation step** so a shot replays and exports bit for bit; exact
scrubbing from snapshots; baking a simulation span to a pose cache; SRT subtitles (`research/cinematics.md` §1.1–1.2).

```js
// content/sample/sequences/morning.vrmxs
{ "format": "vrmxs", "version": 1, "id": "morning", "set": "cafe.vrmxs",
  "nodes": [ { "id": "brain", "type": "CameraBrain", "props": { "camera": "cam" } }, { "id": "vc-hana", "type": "VirtualCamera", … } ],
  "sequence": { "fps": 24, "duration": 288, "shots": [ { "id": "s2", "start": 120, "end": 192, "overrides": { "counter-light": { "props": { "intensity": 30 } } } } ],
    "tracks": [ { "type": "camera", "clips": [ { "start": 120, "end": 192, "camera": "vc-hana" } ] },
                { "type": "dialogue", "target": "hana-1", "clips": [ { "start": 126, "end": 246, "clip": "voice/hana-welcome.wav", "text": "Oh, hi! …" } ] } ] } }

const sample = await loadSample(bytes, 'sequences/morning.vrmxs');  // world.js composes it with its set
const W = await buildWorld(R, sample, opts);                       // installs the "sequence" service when doc.sequence exists
const player = new SequencePlayer(W.tree, { every: 120 });          // a snapshot every 2 s
await player.seek(130); host.frameAt(...)                           // the exact world of frame 130
```

| Piece | What |
|---|---|
| The include | `set` names the set's file; `composeSequence(seq, set)` adds the sequence's nodes, assets and connections to the set's, **unprefixed**: the set's nodes keep their ids, so tracks and the sequence's own nodes say `"mira"`, and every reference inside the set (behaviour targets, connections, camera targets) keeps working. A sequence node may not reuse a set id; one without a parent goes under the set's root. One set, many sequences; editing shots never touches the set's file |
| Time | After s steps the sequence is at frame from + (s − startStep) · fps / 60, the frame `frameToStep` maps an export frame to. `stepOf(frame)` is the inverse |
| Tracks | The `@vrmxg/tracks` types (property, transform, expression, event, audio, animation) plus `camera` (which VirtualCamera a CameraBrain shows: `override`, with a per-clip blend in frames), `lookAt` (a character's eyes on a node, or `"camera"`), `dialogue` (a voice line: audio, visemes from its word timings, a subtitle), `post` (keyed post-stack values: presentation, no hash change), `simulation` (spans `live` or `baked`) |
| Shots | `{ id, name, start, end, camera?, overrides }`: overrides `{ nodeId: { transform?, props? } }` apply while the shot is live and are put back when it ends (anime cheats continuity). Signals `shotChanged`, `sequenceFinished`, `event` on the root |
| The service | Runs before the nodes: tracks applied, events and lines fired on the step that crosses them, the camera override set, eyes pointed, overrides applied; the cameras service and the nodes then step with it in place. Its playback, the live shot's saved values and the lookAt state are in the snapshot. The last frame holds (shot, camera, looks) |
| Scrubbing | `SequencePlayer.seek(frame)` restores the nearest snapshot at or before the frame's step and steps the rest, so the world is exactly a straight play's; `invalidate(fromFrame)` after an edit |
| Baking | `bake(tree, { targets })` records, every step of the baked spans, each target's transform, rigid body pose and velocities, and node state; inside a `baked` clip the service writes them after the nodes and physics, and after the span the simulation carries on from the take. `bakeToJSON` / `bakeFromJSON` for a cache file beside the sequence |
| `checkSequence` | Problems as messages: overlapping shots, overrides of missing nodes, unknown track types, missing targets or cameras, empty dialogue clips |
| `subtitles(seq, names)` | SRT from the dialogue tracks |

Determinism: inside the boundary (`"vrmxg": { "determinism": "simulation" }`). Restores at step 0 are exact too:
W1 fixed three gaps that made a world restored at step 0 step differently from a fresh one (the first step now starts
from current world matrices; a CameraBrain claims its camera at `ready`; the character's mixer writes every binding
every step instead of skipping values it thinks unchanged).

Measured (`tools/scrub-bench.mjs`, `results/scrub.json`; Node 26, M5 Max, the morning sequence stretched to 60 s, two
characters, stub textures): a cold seek (no snapshots yet) 372 ms to 30 s and 579 ms to 60 s (0.16 ms a step); with a
snapshot every 2 s, random seeks over the minute median 10.7 ms, p90 19.8, max 27.6; the next frame on 0.5 ms; 31
snapshots, 96 KB each (2.8 MB). In the browsers (acceptance check 12) the same seeks take 3–19 ms after the first.

Tests (`npm test`):
- composing, checks, clips, post values, subtitles (no characters);
- a world with physics: the camera track switching the brain, events on their step, shots overriding and putting back,
  post values at α, scrubbing (backwards, forwards, from snapshots) equal to straight play, a snapshot mid-shot, baking;
- on the cafe (needs vrmxa-avatar-studio): the morning sequence twice the same, cameras, Mira's walk, eyes, Hana's line
  on frame 126, the cheated light, and scrubbing exact.
