# @vrmxg/voice

M1 W6 (AB-T-0518). Characters say lines, blink and glance. The lip sync is AB-T-0490's spike
(`mlxengine-3d/DEV/VRMLipSync`) moved into the engine: TalkingHead's word branch and English viseme rules (MIT, Mika
Suominen; `src/vendor/lipsync-en.js` keeps the notice) mapped onto VRM 1.0's `aa ih ou ee oh`.

```js
import { installVoice } from '@vrmxg/voice';
const voice = installVoice(tree, { resolve: bytesOf });   // after installAudio and installCharacters
await voice.prepare(doc);                                  // reads the clips the scene names, and their timings
hana.say({ clip: 'voice/hana-welcome.wav' });              // or a scene connection / behaviour calling say
voice.captions();                                          // [{ name: 'Hana', words, word, spoken }]
```

| Piece | What |
|---|---|
| Lines | `say({ text, clip })` starts a line on this step: `spoke` now, `lineEnded` after the clip. Each step the mouth is sampled from the line's word timings at (step − start) / 60 s and written to the VRM's vowels before the characters step: lip sync is simulation (polynomials only), in the snapshot, the same in every engine. A line with only text mouths estimated timings |
| Timings | Beside the clip: `voice/<line>.timings.json`, `{ words: [{ text, start, duration }], offset? }`. `offset` corrects the timing source: the sample's Kokoro lines carry +0.03 s (Kokoro's own durations run ~30 ms early against a forced aligner, AB-R-0888). Asked of the VRMXA spec as an optional file beside a voice clip |
| Heard | The clip plays from the speaker's head on the voice bus, through `@vrmxg/audio` (a provider): presentation |
| Faces | Blinks every 2 to 6 s (0.15 s, from the face's own random stream); while a character looks at something, a small glance offset every 0.5 to 2 s. Look-at aims at a character's head (it aimed at the feet before) and the eyes return forward when the target is more than ~100° from the facing |
| Captions | `captions(alpha)`: who, the words, the one being said, how many have begun; the playground and the editor draw them |

Measured (the spike's measure, best lag of mouth openness against the clip's 20 ms RMS): Hana's welcome line +20 ms
(mouth leads), her sword line −10 ms; live, what is heard sits 0–5 ms from the step being drawn. Tests (`node --test
test/`, a spec.vrm character): a scene connection starts the line and the mouth follows the timings step by step; the
lag within ±50 ms; a run with dialogue identical twice and restored from a snapshot mid-line; blinks and glances.

## Lines from text (M2 W10, AB-T-0533)

| Piece | What |
|---|---|
| Baked | `bakePlan(doc, { voices })` lists a sequence's text-only dialogue (and text-only `say` connections), each with the clip it becomes (`voice/<scene>-<track>-<n>.wav`); `applyBake(doc, plan)` points the dialogue at the clips, the text kept as the caption, and records on each dialogue clip the `voice` it was baked in (`@vrmxg/cast` reads it to know whether a recast must re-bake the line; a cast role is baked from the cast's list, whose files are named by voice and words). `content/sample/tools/bake-lines.mjs` ran both around `make-voice.py` (Kokoro-82M through mlx-audio, `voice/lines.json`), so a shot replays and exports with the voice it was cut to. Since M4 W7 the tool runs `@vrmxg/voicing` (it still uses `bakePlan` / `applyBake` for a scene's `say` connections) |
| Live | `voice.useLive(provider, { voices, now })`: text-only lines are heard while playing, as presentation only. The simulation runs a text line on its estimated timings with or without a provider (length, mouth, `lineEnded`), so replays, snapshots and exports don't change; the clip, when it arrives, plays from the speaker's head from the step it arrived on (nothing cut off). While the audio service records (an export), live clips are left out. A provider that fails three times is given up |
| Providers | `httpTTS(url)`: a loopback TTS server (`content/sample/tools/tts-server.py`, Kokoro). `shellTTS(native)`: the Mac shell's `tts.speak`, an MLXEngine endpoint asked of the mlx-engine area (AB-A-0308); until it exists, use the loopback server. Both answer `{ wav (base64), sampleRate, words }`. The playground takes `?tts=<url>` or `?tts=shell` |

Measured (`tools/tts-bench.mjs`, `results/live-tts.json`, M5 Max, Kokoro-82M bf16 over loopback HTTP): 28 short NPC
lines in two voices, median 38 ms, p90 89 ms (3 and 6 steps late at 60 Hz), real-time factor 0.019, every word timed.
In Chromium a live line asked for at step 176 was heard from step 180. Tests (`test/live.test.mjs`): the same hashes
step by step with and without a provider, heard from its arrival step in the speaker's voice, nothing while recording,
a failing provider given up, httpTTS's request and decoding, bakePlan / applyBake.

## Baked lines play from the track (M4 W7, AB-T-0579)

Voicing a sequence is authoring, so it lives in `@vrmxg/voicing`, which this package doesn't import. What this package
does is play the result. `@vrmxg/sequence` hands a baked dialogue clip's `words`, `visemes` and `audio` to
`preload(clip, baked)`. The service then samples the mouth from the baked visemes and ends the line at the baked length:
it reads no timings file, and neither the WAV's decoder nor the lip-sync rules run at play time. So a replay from the
track gives the same hashes everywhere. Providers say what timing offset they have already applied (`offsetApplied`):
the loopback stand-ins add Kokoro's 0.03 s, and the shell's `tts.speak` adds nothing.

## Listening (M3 W3, AB-T-0542)

The person's voice into a conversation, outside the step:
- **Detector:** microphone frames go through an energy voice-activity detector.
- **Start of speech:** the director is told (`director.speaking`), so the character listens and holds a line until
  the person stops.
- **End of speech:** the utterance goes to a speech-to-text provider, and its text goes to `director.talk`.

Only the director touches the simulation, and it logs what it does, so a conversation replays with no microphone, STT or
model.

```js
import { listenTo, microphone, httpSTT } from '@vrmxg/voice';
const ear = listenTo({ director, agent: 'hana-1', stt: httpSTT('http://127.0.0.1:5191/transcribe') });
const stop = await microphone((frame) => ear.feed(frame));   // off until called: getUserMedia
```

| Piece | What |
|---|---|
| `EnergyVAD` | 20 ms frames:<br>• the first 300 ms only learn the room's noise floor;<br>• speech starts after 80 ms above the threshold (noise × 3, never below 0.006 RMS) and ends after 450 ms of quiet;<br>• an utterance keeps 200 ms of audio from before its start;<br>• one with less than 250 ms of speech is flagged `short` and not transcribed;<br>• 15 s at most.<br>It counts frames and reads no clock |
| `listenTo({ director, agent, stt })` | `feed(frame)`: start → `speaking(agent, true)`; end → `speaking(agent, false)`, then the WAV to the STT provider and its text to `talk`. Whisper's tags for silence (`[BLANK_AUDIO]`) are dropped |
| STT providers | `httpSTT(url)` posts the WAV to the loopback stand-in's `/transcribe`. `shellSTT(native)` calls the Mac shell's `stt.transcribe` (MLXEngine's live plane, asked as AB-A-0311; not in the shell yet) |
| `microphone(onFrame)` | getUserMedia (echo cancellation and noise suppression on), an AudioWorklet, frames resampled to 16 kHz |
| `encodeWav` | Mono float → 16-bit PCM WAV |

The loopback stand-in is `content/sample/tools/voice-server.py`, on one port (5191), with every answer's server time:
- `/v1/chat/completions`: the director's model, LFM3-Omni-2B 4-bit by default (AB-D-0265); `--llm` loads others
  (LFM2.5, LFM3-1.7B, Qwen3-VL-4B), and a request's `model` picks one;
- `/transcribe`: Omni's own ASR when it is loaded, else whisper-large-v3-turbo;
- `/speak`: Kokoro (or `tts-server.py`, when the server's venv lacks Kokoro's `misaki`).

The director's spoken turn through it is measured in `@vrmxg/director` (`scripts/measure-turn.mjs`).

Tests (`test/listen.test.mjs`):
- the detector on synthetic frames: start, end, pre-roll, blips, a noisy room;
- the WAV encoder;
- both STT providers' wire shapes;
- `listenTo` driving a director.

Not yet:
- the Mac shell's microphone: the WKWebView media permission and the entitlement;
- the shell's `stt.*`, `llm.respond` and `tts.speak`, which wait on `mlx-engine` (AB-A-0308, AB-A-0311) and
  `mlx-solutions` (AB-A-0312);
- streaming speech-to-text partials;
- barge-in, which would stop her line when the person talks over it.


## Conversations with choices (M5 W3, AB-T-0618, AB-D-0287)

A conversation is scene data: a `Dialogue` node (in the registry, so the schema validates it, the editor's inspector
edits it and MCP describes it). The `dialogue` service runs it inside the step, says its lines through this package's
voice service (heard, lip-synced, captioned, a speech bubble), and waits for a choice that arrives as a recorded input.

```js
import { installDialogue } from '@vrmxg/voice';
installDialogue(tree);                // after input, voice and game: the Dialogue node's class and the "dialogue" service
// the UI: input.choose('dialogue.choose', choiceId)   (@vrmxg/game-ui's overlay does it)
dialogue.view();                       // { name, text, phase: 'line' | 'choice', choices: [{ id, text }], … } or null
```

```json
{ "id": "order", "type": "Dialogue", "props": { "autostart": true, "lines": [
  { "speaker": "hana", "text": "Good morning! What can I get you?", "clip": "voice/hana-order.wav", "choices": [
    { "id": "latte", "text": "A latte, please.", "to": "latte", "set": { "order": "latte" } },
    { "id": "usual", "text": "The usual.", "to": "usual", "when": { "test": "state", "key": "flags.regular" } } ] },
  { "id": "latte", "speaker": "hana", "text": "One latte, coming up.", "next": "end" },
  { "id": "usual", "speaker": "hana", "text": "Of course." } ] } }
```

| Piece | What |
|---|---|
| Which hosts install it | Every host that builds a world a conversation runs in: the game runtime, the editor's Play and MCP's engine. Today only `@vrmxg/game-ui`'s test game does. The playground's `world.js` (which the editor's Play and `bundle/runtime/play.js` build on) and `engine/packages/mcp/src/engine.js` are AB-T-0630, and W1 installs it in the game app. Install it **only for a scene that has a `Dialogue` node**: a service with state is in the world hashes, and no existing scene's may move |
| A line | `text` (the caption, and the line itself without a clip), `speaker` (a node's id: a Character is heard and lip-synced; any other node gets the caption and a bubble; none: a caption only), `clip`, `seconds` (its length), `pause` (seconds after it), `id`, `next` (the line after it when it offers no choice: an id, `end`, or by default the next in the list), `when` (said only when it holds; otherwise passed over to the next in the list), `set` (game flags to set as it starts), `choices` |
| A choice | `text`, `id` (what the recording carries; default its place, `"0"`), `to` (the branch: a line's id or `end`; default the next line), `when` (offered only when it holds), `set` |
| Conditions and flags | `@vrmxg/game`'s conditions over the game state (`{ test: 'state', key: 'flags.regular' }`), and its flags: a conversation reads and changes the game the way every other rule does. A flag the game refuses is said as its `refused` event, never thrown in the step |
| A line's length | From data every runtime has, never from the decoded clip (the audio service knows a WAV's length only where it is installed, and a line must end on the same step everywhere): the line's `seconds`; else its clip's word timings (a baked line's stored length, or its last word plus `VOICED_TAIL`, 0.25 s); else its text's estimated timings. The voice line is said for that long too (`say({ …, seconds })`), so it ends on the same step with or without audio. Give `seconds` to keep a clip's longer tail |
| The step | A line starts on a step and is over after its length, counted in steps. A line that offers choices then waits (`phase: 'choice'`) for `input.choice('dialogue.choose')` to name one on offer; any other value leaves the question standing. `dialogue.advance` ends a line early when `skippable` (default true). One conversation at a time; `start { at }` and `stop` are the node's actions; `autostart` starts on the world's first step (not at `ready`, so after a scene change its conditions read the state the game carried in) |
| Signals | `started`, `line { line, index, speaker, text }`, `asked { choices }`, `chose { line, choice, text }`, `ended` |
| Checked | `readDialogue` / `checkDialogue(props)`: a `next` or `to` naming no line, a duplicate id, `end` used as an id, a choice without text, a flag that isn't a boolean, number or string, a malformed condition: each named with its path. A node whose conversation can't be right is refused when it enters, and leaves nothing behind |
| In the snapshot | The conversation going on (node, line, phase, the step it started, its length, what is on offer) and the conversations waiting to autostart |

Tests (`test/dialogue.test.mjs`, no models: speakers are plain nodes): reading and checking; lines in order, the
question waiting, a choice off offer ignored, the branch and its flags; conditions on choices and lines; skipping;
autostart on the first step; one at a time, stop, a node leaving; a voiced line (its WAV three times longer than its words) ending on the same step, to the same hashes, with and without the audio service; lines edited under a question; a played conversation replayed from its recording to
the same per-step hashes (and the other answer to another run); a snapshot taken while it waits for an answer.
