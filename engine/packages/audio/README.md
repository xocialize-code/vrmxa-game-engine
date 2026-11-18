# @vrmxg/audio

M1 W5 (AB-T-0517). Sound for VRMXG: what plays is simulation, what is heard is presentation (AB-D-0248).

```js
import { installAudio, AudioOutput } from '@vrmxg/audio';
const output = new AudioOutput();               // one per app: a Web Audio context with its buses
output.unlockOn(window);                        // browsers start it suspended until a gesture
const audio = installAudio(tree, { resolve: bytesOf, output });   // no output: silent, the same simulation
await audio.prepare(doc); tree.instantiate(doc);
output.setBus('music', { volume: 0.4 }); output.setBus('ambience', { muted: true });
```

| Piece | What |
|---|---|
| Nodes | `AudioPlayer` (heard everywhere: music, room tone) and `AudioPlayer3D` (from where it is: doors, switches), with `bus` (music, sfx, voice, ambience), `volume`, `loop`, `autoplay`, and for 3D `refDistance`, `maxDistance`, `rolloff`. Actions `play`, `stop`; signals `started`, `finished`. Their state is `{ playing, startStep }`; the clip's length (from its WAV header, exact) ends it on a step, so `finished` can drive a scene and snapshots restore a sound mid-clip |
| Service (`audio`) | Every frame (`present`, a new service hook in the core) it makes Web Audio match the simulation: a sound starts at the offset the step clock gives plus the output's latency, is restarted if it drifts more than 80 ms (a hitch), stops when the simulation says so; positional sounds and the listener (the current camera) move with the scene. Other systems add sounds through `addProvider` (a character's voice line, `@vrmxg/voice`) |
| Output | `AudioOutput`: the context, the four buses into a master, volume and mute per bus (listener settings, not simulation), `unlockOn(target)`, `latency` |
| Recorder | `audio.record()` then `audio.recording()`: per step, what plays (key, clip, start step, gain, bus, position) and where the listener is, as plain data |
| Offline mix | `mixOffline(recording, library)`: each sound rendered in its own OfflineAudioContext and summed in key order (Web Audio sums simultaneous sources in no promised order, and float addition isn't associative), so a mix is the same samples every time. For W8's export. `hashSamples` compares renders |
| WAV | `wavInfo`, `wavSamples`, `writeWav`: the clip's length for the simulation, samples for tests and measurements |

Clips are WAV (PCM or float) for now: the simulation needs their length without decoding. Tests (`node --test test/`,
a stand-in AudioContext): players start and finish on the right steps; the same run hashes the same with an output and
without; a snapshot restores a sound mid-clip; live offsets and positions; the recorder. In browsers the acceptance
(check 7) runs the cafe's walk through a real output (hashes as silent) and mixes its recording twice (same samples).
