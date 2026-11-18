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
