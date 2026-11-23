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
| Baked | `bakePlan(doc, { voices })` lists a sequence's text-only dialogue (and text-only `say` connections), each with the clip it becomes (`voice/<scene>-<track>-<n>.wav`); `applyBake(doc, plan)` points the dialogue at the clips, the text kept as the caption, and records on each dialogue clip the `voice` it was baked in (`@vrmxg/cast` reads it to know whether a recast must re-bake the line; a cast role is baked from the cast's list, whose files are named by voice and words). `content/sample/tools/bake-lines.mjs` runs both around `make-voice.py` (Kokoro-82M through mlx-audio, `voice/lines.json`), so a shot replays and exports with the voice it was cut to |
| Live | `voice.useLive(provider, { voices, now })`: text-only lines are heard while playing, as presentation only. The simulation runs a text line on its estimated timings with or without a provider (length, mouth, `lineEnded`), so replays, snapshots and exports don't change; the clip, when it arrives, plays from the speaker's head from the step it arrived on (nothing cut off). While the audio service records (an export), live clips are left out. A provider that fails three times is given up |
| Providers | `httpTTS(url)`: a loopback TTS server (`content/sample/tools/tts-server.py`, Kokoro). `shellTTS(native)`: the Mac shell's `tts.speak`, an MLXEngine endpoint asked of the mlx-engine area (AB-A-0308); until it exists, use the loopback server. Both answer `{ wav (base64), sampleRate, words }`. The playground takes `?tts=<url>` or `?tts=shell` |

Measured (`tools/tts-bench.mjs`, `results/live-tts.json`, M5 Max, Kokoro-82M bf16 over loopback HTTP): 28 short NPC
lines in two voices, median 38 ms, p90 89 ms (3 and 6 steps late at 60 Hz), real-time factor 0.019, every word timed.
In Chromium a live line asked for at step 176 was heard from step 180. Tests (`test/live.test.mjs`): the same hashes
step by step with and without a provider, heard from its arrival step in the speaker's voice, nothing while recording,
a failing provider given up, httpTTS's request and decoding, bakePlan / applyBake.

## Voicing a sequence (M4 W7, AB-T-0579)

M2's line bake, made into the creator's voicing layer (`src/voicing.js`, `src/sounds.js`). A line is voiced in its
role's voice: the cast's (`sequence.roles`, `@vrmxg/cast`), else a role → voice map. Its audio, visemes and subtitle
go into the dialogue track. Regenerating one line, or every line of one character, is one undo step.

```js
import { voiceLines, rebakeWith, addSound, shellTTS, httpTTS } from '@vrmxg/voice';
const tts = inShell ? shellTTS({ call }) : httpTTS('http://127.0.0.1:5190/speak');   // Kokoro through the shell, or the loopback stand-in
const io = { tts, write: (ref, bytes) => project.write(ref, bytes), read: (ref) => project.bytes(ref) };
await voiceLines(session, {}, { ...io, presets });                                  // every line still to voice: one step
await voiceLines(session, { line: 'cafe-order-mira-says-2' }, { ...io, voice: 'af_sky' }); // one line: one step
await voiceLines(session, { role: 'HANA' }, io);                                    // one character's lines: one step
await applyCast(session, 'HANA', card, { rebake: rebakeWith(io) });                 // a recast and its re-bake: one step
addSound(session, { ref: 'sounds/music.wav', start: 0, end: 720 });                 // music on its bus: one step
```

| Piece | What |
|---|---|
| `voicingPlan(doc, select, o)` | The lines to voice: `{ line }` (by id, `<sequence>-<track>-<n>`, or `{ track, index }`), `{ role }` (node id or cue), `{ all: true }`, or by default those not yet baked in their role's voice. A line baked in a voice nobody recorded (an older bake) is left alone, as `@vrmxg/cast` leaves it. Each line names its clip with `clipFor` (line, voice and words): `voice/cafe-order-hana-1-says-1-af-heart-47e63ab2.wav` |
| `bakeLines(lines, { tts, write, read })` | Speaks each line and writes `<clip>.wav` and `<clip>.timings.json`. It answers each line's bake fields (`@vrmxg/script`'s `BAKE_FIELDS`): `clip`, `timings`, `voice`, `words` (offset applied), `visemes` (`[viseme, t0, t1, t2, level]`, from the words) and `audio` (`{ duration, sampleRate }`). With `read`, a take already in the project under that name is baked from its files, not spoken again. **Kokoro's audio differs a little from run to run** (its words and lengths don't), so speaking a line again would write other bytes over a file an undo step points at |
| `applyVoicing(doc, lines, bakes)` | The pure edit: one `setDoc sequence`. A clip's old bake goes first |
| `voiceLines(session, select, o)` | The editor op that W5 (the creator) and W11 (MCP) call: plan, speak, then one `session.run`. Nothing is applied if the TTS fails, and the voicing is refused if the document changes while it speaks. `{ line, text }` also gives the line new words, in the same step |
| `rebakeWith(io)` | `applyCast`'s re-bake hook (M4 W6): the recast role's lines spoken in the new voice, inside the cast's own step |
| Timing offsets | Kokoro's timings run ~30 ms early (AB-R-0888). `TIMING_OFFSETS['kokoro-82m']` is 0.03. A provider says what it has applied already (`offsetApplied`): the loopback stand-ins 0.03, the shell's `tts.speak` 0 |
| Buses | `placeSound` / `addSound`: music, sound effects and ambience each go on an audio track per bus (`music`, `sfx`, `ambience`, with its `bus`). `busFor(ref)` guesses one from the file name. Lines are heard on the voice bus through the dialogue track, so an audio clip on `voice` is refused, and `soundProblems(doc)` lists one already there |

**What plays is the track.** `@vrmxg/sequence` hands a baked clip's `words`, `visemes` and `audio` to the voice service
(`preload(clip, baked)`). The service samples the mouth from the baked visemes and ends the line at the baked length:
no timings file is read, and neither the WAV's decoder nor the lip-sync rules run at play time. So a replay from the
track gives the same hashes everywhere. A change to the lip-sync rules changes only lines baked after it, and the WAV is
presentation. A bake never moves a clip's start or end, since the script's merge would take that as a hand edit. A
line longer than its clip still plays to its end, and its subtitle (`subtitles`) runs to the end of its audio.

`content/sample/tools/bake-lines.mjs` runs the same layer from the command line. It starts `tools/tts-server.py` (or
takes `--tts <url>`), with `--line`, `--role`, `--all` and `--voice`. The sample's script sequence
(`sequences/cafe-order.vrmxs`) is voiced with it: Hana in `af_heart`, Mira in `af_bella`, 7 lines. Re-running it changes
nothing, and the files of an older bake (`voice/<line>.wav`, `lines.json`, `make-voice.py`) stay as they were.

Tests (`test/voicing.test.mjs`, a stand-in TTS so they run offline):
- the plan;
- the bake's files and fields, and the offsets;
- in the editor, each of these is one undo step, with exact bytes on undo and redo and no file written over: every
  line, one line in another voice, one character in another voice;
- the take reused rather than spoken again;
- the editor op against the pure path, byte for byte;
- new words;
- a failing TTS, and an edit made while it speaks;
- a recast with `rebakeWith` as one step;
- a re-script keeps every unchanged line's bake;
- the voice service plays the baked visemes and length;
- subtitles;
- sounds on their buses.

M4 check 3 (`acceptance/m4/voicing.mjs`, `voicing-wkwebview.sh`): the voiced sample plays from its track, 1,903 steps,
with the same final world hash and the same hash of both mouths at every step in Node, Chromium and WKWebView (scheme and
loopback, two loads each). A snapshot taken mid-line restores to the same end.

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

