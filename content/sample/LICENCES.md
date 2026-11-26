# Sample content: licences

Every file in `content/sample/` and where it comes from. Nothing ships without a row here:
`node content/sample/tools/check-licences.mjs` fails on any file this table doesn't list (CI runs it).

"Xocialize original" means made for this repository by Xocialize LLC (by hand or by the scripts in `tools/`), and
released under [CC0 1.0](https://creativecommons.org/publicdomain/zero/1.0/): use, change and ship it with no credit
needed. The scripts in `tools/` are code, under the repository's MIT OR Apache-2.0.

## Scenes, scripts and data

| File | Licence | Source |
|---|---|---|
| `cafe.vrmxs` | Xocialize original | The sample cafe scene, written for M0 (W8, AB-T-0509) |
| `cafe-talk.vrmxs` | Xocialize original | The cafe with Hana as a conversation partner who notices the person at the camera (M3 W12, AB-T-0551), written by `tools/make-scenes.mjs` |
| `cafe-follow.vrmxs` | Xocialize original | The cafe with Hana following Mira (the follower preset), written by `tools/make-scenes.mjs`; the scene of `takes/follow.json` |
| `cafe-stairs.vrmxs` | Xocialize original | The cafe with the stairs outside and Mira and Hana on the landing (M3 W7's fall), written by `tools/make-scenes.mjs` |
| `cafe-cart.vrmxs` | Xocialize original | The cafe with the cart on the pavement (M3 W8), written by `tools/make-scenes.mjs` |
| `cafe-split.vrmxs` | Xocialize original | The cafe for two players in split screen (M3 W9), written by `tools/make-scenes.mjs` |
| `sequences/morning.vrmxs` | Xocialize original | The sample sequence (M2 W1, AB-T-0524): four shots of Mira arriving and Hana welcoming her, filmed in `cafe.vrmxs` |
| `sequences/cafe-morning.vrmxs` | Xocialize original | "Morning at the cafe" (M2 W11, AB-T-0534): 45 s, five shots, four baked lines, a music cue, the espresso steam and the morning look; Hana and Mira cast with the brains below |
| `personas.json` | Xocialize original | The project's app personas (M3 W1, AB-T-0540), keyed by VRMXA id: Hana's and Mira's stories, role profiles and goals |
| `personas/hana.persona.json` | Xocialize original | Hana's core persona in VRMXA's exchange form (§10.1), since her bundle carries none |
| `takes/conversation.json` | Xocialize original | A two-minute take of Mira talking with Hana (M3 W4, AB-T-0543): scene, cast, input and the director's ai log, made by `tools/make-conversation.mjs` with a scripted model; acceptance check 17 |
| `takes/follow.json` | Xocialize original | A 70-second take of a conversation with a follower (M3 W12): Hana waits by the door when asked, shrugs, follows Mira in, laughs; made by `tools/make-follow-take.mjs` with a scripted model; replayed by the director's fixture test |
| `performances/the-regular/take-1.json` | Xocialize original (CC0) | A puppet take of Mira over "The Regular" (M4 W9, AB-T-0581): the log only (keys pressed on a virtual keyboard and the camera yaw), recorded by `tools/make-takes.mjs`; not kept in the film. The tests and acceptance check `acceptance/m4/takes.mjs` replay it |
| `performances/the-regular/take-2.json` | Xocialize original (CC0) | A director take of Hana over "The Regular" (M4 W9): the ai log of two directions answered by a scripted model (a line with a smile and a wave, then a goal), recorded by `tools/make-takes.mjs` |
| `performances/the-regular/take-3.json` | Xocialize original (CC0) | A face take of Mira over "The Regular" (M4 W9): a synthetic face session as numbers, no images (blinks, a smile, brows, talking, a wink, a head turn), recorded by `tools/make-takes.mjs` |
| `input/camera-demo.json` | Xocialize original (CC0) | A synthetic camera session as feature frames, no images (M3 W5, AB-T-0544): appears, waves, nods, shakes, points, leaves; made by `tools/make-camera-demo.mjs`; the playground's `?camera&frames=` |
| `items/cart.vrmxi` | Xocialize original | A two-seat cart, a VRMXI `vehicle` (M3 W8, AB-T-0547): a chassis on four raycast wheels, driver's and passenger's seats, made by `tools/make-vehicle.mjs` |
| `sequences/conversation.vrmxs` | Xocialize original | That take baked into a sequence (`takeToSequence`): her lines as dialogue clips, the person's on Mira, a decisions track, an input track |
| `scripts/cafe-order.fountain` | Xocialize original | "The Order" (M4 W4, AB-T-0576): a short script for Mira and Hana at the cafe counter in our Fountain subset (seven lines, tags and parentheticals, a dissolve) |
| `scripts/cafe-marks.json` | Xocialize original | Marks in the cafe for the sample scripts (behind the counter, in front of it, the window table), placed as Marker nodes by the build |
| `sequences/cafe-order.vrmxs` | Xocialize original | That script built into a sequence over `cafe.vrmxs` by `@vrmxg/script` (11 shots, a dialogue track per speaker, look-at, talk, gestures and faces), written by `tools/make-script-sequence.mjs` |
| `park.vrmxs` | Xocialize original | The park (M4 W12, AB-T-0584): the sample's second set, made with Gaea: a paved square with hedges, lawns, a bench, a street lamp, a tree in a planter and a vending machine, Mira and Hana, a camera; written and validated by `tools/make-park.mjs` |
| `scripts/park-marks.json` | Xocialize original | Marks in the park for scripts filmed there (by the bench, beside it, by the machine, on the path) |
| `scripts/the-regular.fountain` | Xocialize original | "The Regular" (M4 W12, AB-T-0584): the M4 sample short, a one-minute script for Mira and Hana at the cafe in our Fountain subset (13 lines, a move to the window table) |
| `sequences/the-regular.vrmxs` | Xocialize original | That script built into a sequence over `cafe.vrmxs` by `@vrmxg/script` with `@vrmxg/coverage`'s cameras by rule (`tools/make-script-sequence.mjs`), cast by `tools/cast-short.mjs`, voiced and fitted by `tools/bake-lines.mjs --fit`, and a hand-keyed take by `tools/make-short-take.mjs` |
| `game.json` | Xocialize original | The cafe as a game (M5 W0, AB-T-0615): the game document Export Game reads (`@vrmxg/bundle`): the scene it starts in, its behaviours, animation sets and personas, the engine's default action map, and the recorded walk as an extra file |
| `shorts.json` | Xocialize original | The sample project's shorts for the creator (M4 W12): "The Order" with the script's default cameras, "The Regular" with cameras by rule |
| `brains/hana.json` | Xocialize original | Hana's behaviour tree for the film (M2 W11): serving, as a `vrmxg-brain` document |
| `brains/customer.json` | Xocialize original | The customer's behaviour tree (M2 W11), a `vrmxg-brain` document |
| `effects/espresso-steam.json` | Xocialize original | The espresso machine's steam wand (M2 W11), a `vrmxg-effect` document |
| `looks/morning.cube` | Xocialize original | The film's colour look, a 17³ 3D LUT generated by `tools/make-lut.mjs` |
| `voice/lines.json` | Xocialize original | The voice lines `tools/make-voice.py` bakes (id, Kokoro voice, text) |
| `prefabs/door.vrmxs` | Xocialize original | A hinged door with its frame and trigger |
| `prefabs/double-door.vrmxs` | Xocialize original | Two doors, the right one mirrored |
| `behaviours.js` | Xocialize original | The project's `wander` behaviour |
| `input/walk-in.json` | Xocialize original | Generated by `tools/make-input.mjs` |
| `input/play-items.json` | Xocialize original | Generated by `tools/make-take.mjs`: the take with items (M1 W10) |
| `tools/make-content.mjs` | Xocialize original | Generates the GLBs and clips, copies the characters, validates the scenes |
| `tools/make-takes.mjs` | Xocialize original | Records the three sample performance takes over "The Regular" in Node with the real recorder (`@vrmxg/takes`) and writes their logs to `performances/the-regular/` (`--check` compares) |
| `tools/make-conversation.mjs` | Xocialize original | Writes `takes/conversation.json` (and, with `--sequence`, `sequences/conversation.vrmxs`) |
| `tools/make-script-sequence.mjs` | Xocialize original | Builds each short in `shorts.json` (its script into its sequence, with its cameras; re-scripting in place keeps hand edits; `--check` for CI) |
| `tools/cast-short.mjs` | Xocialize original | Casts a short's roles from the project's `.vrmxa` files with `@vrmxg/cast` (M4 W12) |
| `tools/make-short-take.mjs` | Xocialize original | Adds "The Regular"'s hand-keyed performance take (M4 W12) |
| `tools/replay-short.mjs` | Xocialize original | Replays a short in Node twice, in two processes, and compares the hashes (M4 W12) |
| `tools/make-camera-demo.mjs` | Xocialize original | Writes `input/camera-demo.json` from @vrmxg/sense's synthetic test script |
| `tools/make-vehicle.mjs` | Xocialize original | Writes `items/cart.vrmxi` |
| `tools/make-stairs.mjs` | Xocialize original | Writes `sets/stairs.glb` |
| `tools/make-carry.mjs` | Xocialize original | Writes `animations/clips/carry.vrma`, the carried-tray pose for a character's upper-body layer (M5 W7; `--check` compares) |
| `tools/make-scenes.mjs` | Xocialize original | Writes the M3 scenes (`cafe-talk`, `cafe-follow`, `cafe-stairs`, `cafe-cart`, `cafe-split`), validated |
| `tools/make-follow-take.mjs` | Xocialize original | Writes `takes/follow.json` |
| `fonts/NotoSansJP-Regular.ttf` | SIL OFL 1.1 (`fonts/OFL.txt`) | Noto Sans JP (Google, the Noto project), the static wght 400 instance subset to Latin, kana and punctuation by `tools/make-fonts.py` from the variable font the text spike downloaded (M3 W6) |
| `fonts/NotoSansJP-Bold.ttf` | SIL OFL 1.1 (`fonts/OFL.txt`) | The same at wght 700 |
| `fonts/OFL.txt` | SIL OFL 1.1 | The fonts' licence |
| `tools/make-fonts.py` | Xocialize original | Makes the static font instances (fonttools) |
| `tools/make-input.mjs` | Xocialize original | Writes `input/walk-in.json` |
| `tools/make-take.mjs` | Xocialize original | Writes `input/play-items.json` (an autopilot plays the cafe and its input is recorded) |
| `tools/generate-prop.mjs` | Xocialize original | Asks the local Gaea for the espresso machine |
| `tools/check-licences.mjs` | Xocialize original | This table's checker |
| `LICENCES.md` | Xocialize original | This file |
| `README.md` | Xocialize original | What the sample project holds |

## Models

| File | Licence | Source |
|---|---|---|
| `sets/cafe.glb` | Xocialize original | Generated by `tools/make-content.mjs` with `@vrmxg/model`'s GLB writer: boxes, flat colours, KHR_physics colliders |
| `sets/stairs.glb` | Xocialize original | The stairs outside the cafe (M3 W12): generated by `tools/make-stairs.mjs` with `@vrmxg/model`'s GLB writer: boxes, flat colours, KHR_physics colliders |
| `props/door-frame.glb` | Xocialize original | Generated the same way |
| `items/cafe-door.vrmxi` | Xocialize original | A VRMXI game item (the cafe's doors): generated by `tools/make-content.mjs` with `@vrmxg/model`'s tree writer and `@vrmxg/item`'s packer, checked by the VRMXI checker |
| `items/sword-pickup.vrmxi` | Xocialize original (VRM Public License 1.0, per its `meta`) | The specification's VRMXI fixture `fixtures-vrmxi/items/sword-pickup.vrmxi` (generated by its `tools/make-vrmxi-fixtures/make.mjs`), copied byte for byte by `tools/make-content.mjs`: a takeable pickup embedding the pinned "Short sword" wearable |
| `items/switch.vrmxi` | Xocialize original (VRM Public License 1.0, per its `meta`) | The specification's VRMXI fixture `fixtures-vrmxi/items/switch.vrmxi`, copied byte for byte by `tools/make-content.mjs`: the counter lights' switch (off / on) |
| `items/stool.vrmxi` | Xocialize original (VRM Public License 1.0, per its `meta`) | The specification's VRMXI fixture `fixtures-vrmxi/items/stool.vrmxi`, copied byte for byte by `tools/make-content.mjs`: the cafe's stools (a seat: sit, one seat point, an exit) |
| `items/cupboard.vrmxi` | Xocialize original | A VRMXI container (a cupboard with a hinged door, closed / open, a mug on its shelf): generated by `tools/make-content.mjs` with `@vrmxg/model`'s tree writer and `@vrmxg/item`'s packer, checked by the VRMXI checker |
| `sounds/*.wav` | CC0-1.0 | Synthesised by `tools/make-sounds.mjs` (seeded noise, sines and a filtered buzz; no recordings): the doors, the switch, the room tone, the music loop |
| `voice/*.wav` | Kokoro-82M output (model Apache-2.0; its built-in `af_heart`, `af_bella` and `af_sky` voices, no one's real voice) | Hana's and Mira's lines, made by `tools/make-voice.py` through mlx-audio (the films' by `tools/bake-lines.mjs`: "Morning at the cafe" and the conversation take's sequence; since M4 W7 the script's `cafe-order` lines too, and since M4 W12 the sample short's (`the-regular`), voiced through `tools/tts-server.py` and named by line, voice and words) |
| `voice/*.timings.json` | CC0-1.0 | The lines' word timings, from Kokoro's own predicted durations (`tools/make-voice.py`, and `tools/bake-lines.mjs` since M4 W7) |
| `tools/make-sounds.mjs` | Xocialize original | Synthesises the sounds |
| `tools/make-voice.py` | Xocialize original | Bakes the lines in `voice/lines.json` and their word timings with Kokoro (mlx-audio) |
| `tools/kokoro_tts.py` | Xocialize original | Kokoro through mlx-audio: a line to PCM and word timings (shared by the two scripts beside it) |
| `tools/tts-server.py` | Xocialize original | A loopback TTS server for live lines while playing (M2 W10) |
| `tools/voice-server.py` | Xocialize original | The loopback voice stand-in (M3 W3, AB-T-0542): LLM chat with tools (LFM2.5 through mlx-lm; LFM3 and Qwen3-VL through mlx-vlm, several at once for the model evaluation), speech-to-text (whisper through mlx-whisper) and Kokoro speech, for the director and browsers until MLXEngine's calls exist |
| `tools/bake-lines.mjs` | Xocialize original | Voices a sequence's lines (M2 W10's bake, on M4 W7's voicing layer in `@vrmxg/voice`) |
| `tools/make-lut.mjs` | Xocialize original | Writes `looks/morning.cube` |
| `props/door-panel.glb` | Xocialize original | Generated the same way: the panel you see; its collider is the prefab's |
| `props/espresso-machine.glb` | TRELLIS.2: MIT; its DINOv3 conditioner: [DINOv3 License](https://ai.meta.com/resources/models-and-libraries/dinov3-license/), commercial use allowed. **Credit "Built with DINOv3" wherever it ships.** | Generated 2026-11-17 by `tools/generate-prop.mjs` on the local Gaea (gaea-plugin-trellis2, model `trellis2-512`, seed 5, 40,000 faces, 1024 px texture) from `props/sources/espresso-machine.png` |
| `props/sources/espresso-machine.png` | Z-Image-Turbo: Apache-2.0 (the model's weights; the prompt is ours) | Generated by the same script on the local Gaea (`z-image-turbo`, seed 11); the prompt, effective parameters and both offers' licences are in `props/sources/espresso-machine.json` |
| `props/sources/espresso-machine.json` | Xocialize original | The generation record |
| `props/bench.glb` | TRELLIS.2: MIT; its DINOv3 conditioner: [DINOv3 License](https://ai.meta.com/resources/models-and-libraries/dinov3-license/), commercial use allowed. **Credit "Built with DINOv3" wherever it ships.** | The park's props (M4 W12, AB-T-0584): generated 2026-11-23 by `tools/generate-park.mjs` on the local Gaea 1.9.3 (gaea-plugin-trellis2, model `trellis2-512`, seed 7, 40,000 faces, 1024 px texture, scaled by Gaea to each prop's size) from the pictures below |
| `props/street-lamp.glb` | TRELLIS.2: MIT; its DINOv3 conditioner: [DINOv3 License](https://ai.meta.com/resources/models-and-libraries/dinov3-license/), commercial use allowed. **Credit "Built with DINOv3" wherever it ships.** | The park's props (M4 W12, AB-T-0584): generated 2026-11-23 by `tools/generate-park.mjs` on the local Gaea 1.9.3 (gaea-plugin-trellis2, model `trellis2-512`, seed 7, 40,000 faces, 1024 px texture, scaled by Gaea to each prop's size) from the pictures below |
| `props/planter-tree.glb` | TRELLIS.2: MIT; its DINOv3 conditioner: [DINOv3 License](https://ai.meta.com/resources/models-and-libraries/dinov3-license/), commercial use allowed. **Credit "Built with DINOv3" wherever it ships.** | The park's props (M4 W12, AB-T-0584): generated 2026-11-23 by `tools/generate-park.mjs` on the local Gaea 1.9.3 (gaea-plugin-trellis2, model `trellis2-512`, seed 7, 40,000 faces, 1024 px texture, scaled by Gaea to each prop's size) from the pictures below |
| `props/vending-machine.glb` | TRELLIS.2: MIT; its DINOv3 conditioner: [DINOv3 License](https://ai.meta.com/resources/models-and-libraries/dinov3-license/), commercial use allowed. **Credit "Built with DINOv3" wherever it ships.** | The park's props (M4 W12, AB-T-0584): generated 2026-11-23 by `tools/generate-park.mjs` on the local Gaea 1.9.3 (gaea-plugin-trellis2, model `trellis2-512`, seed 7, 40,000 faces, 1024 px texture, scaled by Gaea to each prop's size) from the pictures below |
| `props/sources/bench.png` | Z-Image-Turbo: Apache-2.0 (the model's weights; the prompts are ours) | Generated by the same script on the local Gaea (`z-image-turbo`, seeds 21 to 24); each prompt, the effective parameters and both offers' licences are in the record beside it |
| `props/sources/street-lamp.png` | Z-Image-Turbo: Apache-2.0 (the model's weights; the prompts are ours) | Generated by the same script on the local Gaea (`z-image-turbo`, seeds 21 to 24); each prompt, the effective parameters and both offers' licences are in the record beside it |
| `props/sources/planter-tree.png` | Z-Image-Turbo: Apache-2.0 (the model's weights; the prompts are ours) | Generated by the same script on the local Gaea (`z-image-turbo`, seeds 21 to 24); each prompt, the effective parameters and both offers' licences are in the record beside it |
| `props/sources/vending-machine.png` | Z-Image-Turbo: Apache-2.0 (the model's weights; the prompts are ours) | Generated by the same script on the local Gaea (`z-image-turbo`, seeds 21 to 24); each prompt, the effective parameters and both offers' licences are in the record beside it |
| `props/sources/bench.json` | Xocialize original | The generation records |
| `props/sources/street-lamp.json` | Xocialize original | The generation records |
| `props/sources/planter-tree.json` | Xocialize original | The generation records |
| `props/sources/vending-machine.json` | Xocialize original | The generation records |
| `sets/park.glb` | Xocialize original | The park's ground, lawns, kerbs and hedges, and an invisible box collider for each prop: generated by `tools/make-park.mjs` with `@vrmxg/model`'s GLB writer |
| `tools/generate-park.mjs` | Xocialize original | Asks the local Gaea for the park's props |
| `tools/make-park.mjs` | Xocialize original | Writes `sets/park.glb`, `park.vrmxs` and `scripts/park-marks.json` |

## Characters

Both bundles are `vrmxa-core`'s own test fixtures ([xocialize-code/vrmxa-core](https://github.com/xocialize-code/vrmxa-core), `fixtures/characters/`),
made by its fixture script. Their `avatar.vrm` is **Spec**, the VRMXA base model.

| File | Licence | Source |
|---|---|---|
| `characters/mira.vrmxa` | Bundle: Xocialize original (vrmxa-core, Xocialize LLC). `avatar.vrm` (Spec): [VRM Public License 1.0](https://vrm.dev/licenses/1.0/): everyone may use it, corporate commercial use, modification and redistribution allowed, no credit needed (`VRMXA_Specification/assets/spec/README.md`). Its voice clips are synthetic hums made by the script, no one's voice | `full.vrmxa` ("Mira": closet with a top and a stowed sword, an idle clip, a voice, a persona database) |
| `characters/hana.vrmxa` | The same terms | `minimal.vrmxa` (Spec named "Minimal": manifest, avatar, thumbnail) |

## Animation

| File | Licence | Source |
|---|---|---|
| `animations.json` | CC0-1.0 | The animation set document (default set: idle, walk, run, jump, fall, land; a "sword" set with its own idle) |
| `animations/clips/*.vrma` | CC0-1.0 | Generated by our own code (`engine/packages/character/test/fixtures.mjs`), written with vrmxa-core's `.vrma` writer (the M2 W11 emotes too: nod, cheer, sip; M5 W7's carried-tray pose, `carry.vrma`, by `tools/make-carry.mjs`, in the sample game's own set `game/animations.json` and not in `animations.json`): simple procedural cycles (walk and run with root motion), no motion capture |

## The sample game: "The Morning Rush" (`game/`, M5 W10)

The cafe as a game (AB-T-0620, design AB-D-0293): a title, the level, a won and a lost ending. Everything here but the
voice clips and `game/behaviours.js` (written by hand) is written by `tools/make-game.mjs`; the clips by
`tools/make-game-voice.py`. Export it with
`node engine/packages/bundle/src/cli.js content/sample <out> --game game/game.json`.

| File | Licence | Source |
|---|---|---|
| `game/game.json` | Xocialize original | The game document (`vrmxg-game`, id `morning-rush`): title → level → won or lost → title, the game's behaviours and animation set, the sample's personas and action map |
| `game/title.vrmxs` | Xocialize original | The cafe from the street; interact or jump opens the cafe, or six seconds pass |
| `game/level.vrmxs` | Xocialize original | The cafe at nine: three regulars come in and sit, Mira takes each order in a dialogue choice, carries the tray Hana makes to the right table and closes the till; rules, a 240 s clock, two goals, a checkpoint; lost on time or on two wrong orders |
| `game/won.vrmxs` | Xocialize original | Hana's closing lines after a win (one for a clean run, one with a mix-up), then the title as a new game |
| `game/lost.vrmxs` | Xocialize original | Hana's closing line after a loss (out of time, or two wrong orders), then the title as a new game |
| `game/behaviours.js` | Xocialize original | The sample's behaviours, and the game's `pressToStart` and `tableZone` |
| `game/brains/regular.json` | Xocialize original | The regulars' behaviour tree (`vrmxg-brain`): wait outside, walk in, sit, wait to be served, react, then stay and sip |
| `game/items/order-*.vrmxi` | Xocialize original | The three order trays, VRMXI pickups (waiting → ready, a take verb that carries), boxes with flat colours |
| `game/items/till.vrmxi` | Xocialize original | The till, a VRMXI switch (locked → open → closed), boxes with flat colours |
| `game/animations.json` | Xocialize original (CC0 clips) | The sample's animation set with the carry clip (`animations/clips/carry.vrma`) and a `carry` slot added; the sample's own `animations.json` is unchanged |
| `game/voice/lines.json` | Xocialize original | The game's lines and their voices |
| `game/voice/*.wav` | Kokoro-82M output (model Apache-2.0; its built-in `af_heart`, `af_bella` and `af_sky` voices, no one's real voice) | Hana's and the regulars' lines, made by `tools/make-game-voice.py` through mlx-audio on 2026-11-25 |
| `game/voice/*.timings.json` | CC0-1.0 | The lines' word timings, from Kokoro's own predicted durations (`tools/make-game-voice.py`) |
| `tools/make-game.mjs` | Xocialize original | Writes the sample game (above) |
| `tools/make-game-voice.py` | Xocialize original | Voices the sample game's lines |

## Not here, on purpose

- The VRoid sample models the spikes used (`vroid10.vrm` and others): their terms don't clearly allow redistribution.
- Motion-capture clips (mesh2motion and others, PRD Q9): a better animation set is a follow-up, with each clip's licence
  recorded here when it arrives.
