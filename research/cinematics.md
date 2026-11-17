# VRMXG cinematics layer: sequencer, virtual cameras, post stack, viewports

*Research pass, 2026-11-17. Inputs: `VRMXG-PRD.md` §3, §4.1, §5.3, §5.4, §5.8, §5.16; the `vrm` and
`threejs-postprocessing` skills; the Godot 4.8 source in `reference/godot-master`; the AgentBridge
index (DesignScaffold's `Docs/Timeline.md` and ask AB-A-0031); npm and GitHub, read on this date;
and a small spike, `spike-cinematics/`, run on three r187 + three-vrm 3.5.5 in headless Chromium
(ANGLE Metal, Apple M5 Max).*

---

## 1. Recommendations

### 1.1 Sequencer: build it on the engine's own track system, don't adopt Theatre.js

**Build.** One track-evaluation core serves both the `AnimationPlayer` node (§5.4: doors, items,
UI, small cutscenes) and a `Sequence` for multi-shot anime work, the way Godot uses
`AnimationPlayer` for both and Unreal uses Sequencer for both. Theatre.js is the wrong base:

- **Licence.** `@theatre/core` is Apache-2.0, but the editor, `@theatre/studio`, is
  **AGPL-3.0-only**. The studio is the part we would need, inside a shipped anime creator, and
  AGPL would put the whole app's source under it.
- **Dormant.** The last npm release is 0.7.2 (2024-05-19). The last public commit is 2024-04-11
  and the last push 2024-08-14. The README still says development "temporarily moved to a private
  repo" and that "1.0 is around the corner". 141 issues are open. Nothing has shipped in 2½ years.
- **Wrong model.** Theatre animates props on sheet objects with keyframes. It knows nothing of
  animation clips and their blending, VRM expressions, look-at targets, dialogue with visemes,
  camera cuts and blends, our node ids, or re-simulating physics. Its project state is its own
  JSON, not our scene document. We would keep only the keyframe curves, and those are the
  easiest part to write.

No other web library fits either (§2.3). A GSAP or anime.js timeline is a playback clock, not a
data model. React timeline editors bring React into a Vue app. The Swift `DesignScaffoldTimeline`
is native-only, but **its design carries over** to the Vue timeline UI: one geometry value
(`pointsPerSecond` + `visibleStart`) drives the ruler, headers and lanes, so they can't drift
apart, and snapping takes pluggable sources (`DesignScaffold/Docs/Timeline.md`).

**Rules for the sequencer** (they come from §3 principle 3 and Unity Timeline's playable model):

1. **Evaluation is a pure function of the frame for everything authored.** `evaluate(seq,
   frame)` sets camera, transforms, expressions, look-at targets, visemes, post parameters and
   clip weights straight from the data. No `crossFadeTo`, no tweens left running, no clock. Clip
   blends are weights computed from how clips overlap. Then `action.time` and `action.weight` are
   set and the mixer runs with `mixer.update(0)`.
2. **Simulation is re-simulated, never "evaluated".** Physics, spring bones, AI, particles and
   cloth are stepped at a fixed 60 Hz from the nearest snapshot (§5.6: 1.27 MB, 2–3.5 ms). The
   snapshot has to include **spring-bone state**: three-vrm keeps the previous and current tail
   positions inside each joint, and Rapier's snapshot doesn't hold them. A **bake** command turns
   a simulated span into keys (bones and transforms per frame), so it scrubs instantly and renders
   identically. This is Unreal's "bake to keys" and an Alembic cache, done in JSON.
3. **Integer frames at the sequence rate** (24 fps by default for anime). The 60 Hz simulation is
   sampled at t = frame / fps, using the fixed-step interpolation from §5.1. Integer frames keep
   cuts and keys exact across edits and different export rates.
4. **Anime timing is first-class.** A per-track `step` ("on ones / twos / threes") holds a
   character's pose for 2 or 3 frames while the camera moves on ones. Held keys, smear frames and
   impact frames are events. This is what makes shots read as anime rather than as CG.
5. **Continuity is optional, as anime cheats it.** World time runs continuously across cuts by
   default (Unreal-style). A shot may carry **shot overrides**: per-shot transforms or props on
   nodes ("cheat her 30 cm left in shot 020"), applied only while that shot is live.
6. **Everything is document data and MCP-addressable.** Tracks target nodes by id and properties
   by registry path (§4.1), so "add a happy key at frame 40 on `hana-1`" is a JSON patch.

**Minimal data model.** This lives in `.vrmxs` beside `nodes`. A sequence can also be a `.vrmxs`
of its own that instances the set scene, so one set can be filmed by many sequences.

```json
"sequences": [{
  "id": "seq-ep1-a", "name": "Ep1 A-part", "fps": 24, "duration": 1440,
  "simHz": 60, "seed": 1234, "snapshotEvery": 48,
  "shots": [
    { "id": "sh-010", "name": "010", "start": 0,  "end": 96,  "camera": "vc-wide" },
    { "id": "sh-020", "name": "020", "start": 96, "end": 180, "camera": "vc-ots-hana",
      "overrides": { "kai-1": { "transform": { "p": [0.3, 0, -1.2] } } } }
  ],
  "tracks": [
    { "id": "t-cam", "type": "camera",
      "clips": [ { "start": 0, "end": 96, "camera": "vc-wide" },
                 { "start": 96, "end": 180, "camera": "vc-ots-hana", "blend": { "frames": 0 } } ] },
    { "id": "t-hana-body", "type": "animation", "target": "hana-1", "layer": "base", "step": 2,
      "clips": [ { "start": 0, "end": 120, "slot": "idle" },
                 { "start": 110, "end": 200, "clip": "anims/wave.vrma", "blendIn": 10, "speed": 1 } ] },
    { "id": "t-hana-face", "type": "expression", "target": "hana-1",
      "keys": { "happy": [[0, 0], [12, 1, "easeOut"], [90, 1], [100, 0]], "blink": "auto" } },
    { "id": "t-hana-look", "type": "lookAt", "target": "hana-1",
      "clips": [ { "start": 0, "end": 110, "at": "camera" },
                 { "start": 110, "end": 200, "at": "kai-1#head", "blendIn": 6 } ] },
    { "id": "t-hana-vo", "type": "dialogue", "target": "hana-1",
      "clips": [ { "start": 30, "end": 110, "line": "ep1-003", "text": "…",
                   "audio": "vo-ep1-003", "visemes": "vo-ep1-003.visemes" } ] },
    { "id": "t-door", "type": "property", "target": "door-1", "path": "hinge.open",
      "interp": "step", "keys": [[150, false], [151, true]] },
    { "id": "t-events", "type": "event",
      "keys": [ [151, { "target": "door-1", "call": "open" }],
                [160, { "fx": "impactFrame", "frames": 2 }] ] },
    { "id": "t-music", "type": "audio", "bus": "music",
      "clips": [ { "start": 0, "end": 1440, "asset": "bgm-01", "offset": 0, "gainDb": -6 } ] },
    { "id": "t-post", "type": "post",
      "keys": { "speedLines.strength": [[158, 0], [160, 1, "step"], [176, 0]] } },
    { "id": "t-sim", "type": "simulation",
      "clips": [ { "start": 0, "end": 1440, "mode": "live" } ] }
  ],
  "markers": [ { "frame": 96, "name": "cut: OTS" } ]
}]
```

Track types, mapped to Godot's `Animation::TrackType` (`scene/resources/animation.h`):
`property` = VALUE/BEZIER; transforms = POSITION/ROTATION/SCALE_3D; `expression` = BLEND_SHAPE,
expressed through VRM expressions instead of raw morphs; `event` = METHOD; `audio` = AUDIO;
`animation` = ANIMATION. Godot has no equivalent of the ones we add: `camera`, `lookAt`,
`dialogue` (audio, visemes, subtitle and the speaker's look-at together), `post` and
`simulation`. Keys are `[frame, value, ease?]`. Interpolation is step, linear or bezier. Godot's
update modes (continuous, discrete, capture) apply per track.

**Dialogue and lip sync.** A dialogue clip points to a **viseme key file** (`aa ih ou ee oh` plus
silence), made at import from TTS timing (VRMXA voice, §5.10) or offline audio analysis (Rhubarb
Lip Sync's A–H/X mouth cues mapped onto the five VRM visemes). The visemes are keys, so they are
deterministic and editable. Live analysis such as wawa-lipsync (MIT, 0.0.2) belongs to the
companion app, not to rendering. For offline export, audio is mixed in an `OfflineAudioContext`
from the audio and dialogue tracks, and the WAV is muxed by AVFoundation (§5.16).

### 1.2 Cameras: a physical `Camera`, Cinemachine-style `VirtualCamera`s, and a `CameraBrain` per output

**Three node types, all data:**

| Node | What it holds |
|---|---|
| `Camera` (the real one) | `focalMm`, `sensorMm: [w, h]` (presets: Super 35 24.89×18.66, full frame 36×24, anime "standard" 16:9), `gateFit: fill/overscan`, `focus: { mode: manual/track, distanceM, target }`, `fStop`, `cocMm` (default sensor diagonal / 1500), `near/far`, `dutchDeg`, `shutterDeg` (motion blur, later), `projection: perspective/ortho` |
| `VirtualCamera` | `priority`, `channel` (which output it competes for), `lens` (overrides the Camera's), `body` (position), `aim` (rotation), `noise`, `impulse`, `blendHints`, `standby: never/always/roundRobin` |
| `CameraBrain` | One per output (main view, PiP, each split-screen player, each render job): picks the live vcam (highest priority, most recently activated wins ties), blends with a `defaultBlend` plus a table of per-pair blends (`cut`, `easeInOut`, `linear`, duration in seconds or frames), and writes the result to its three.js camera. **Inside a sequence, the `camera` track overrides priority**, as Cinemachine's Timeline track does |

Plus `Path3D` (Catmull-Rom or Bezier, three's `CatmullRomCurve3`) for dollies and rails, and the
§5.6 `SpringArm` (a Rapier shape cast) for camera collision.

**Bodies** (where the camera is): `fixed`, `follow` (offset and damping), `orbit` (radius,
yaw/pitch, input-driven), `thirdPerson` (shoulder offset, arm length, SpringArm collision),
`firstPerson` (head bone, VRM `firstPerson` layers), `dolly` (path id, a position or "closest to
target", damping), `hardLock`. **Aims** (where it looks): `none`, `lookAt` (hard),
`composer` (target and screen point, dead zone, soft zone, damping: Cinemachine's Rotation
Composer), `groupFraming` (fit several targets: two-shots), `panTilt` (input). **Noise**: a seeded
Perlin profile (`handheldLight`, `handheldHeavy`, `vehicle`) with amplitude and frequency.
**Impulse**: trauma shake and zoom punch, seeded and keyed in sequences. All damping is
frame-rate independent, stepped at the fixed 60 Hz, so a camera move re-simulates identically.

**Physical lens → three and → DOF.** `camera.filmGauge = sensorMm[0]` and
`camera.setFocalLength(focalMm)`. three applies the gauge to the larger axis, so the engine does
gate fit itself when the export aspect differs from the sensor's. DOF follows thin-lens optics
(the spike's `thinLens()`):
H = f²/(N·c) + f; near = s(H−f)/(H+s−2f); far = s(H−f)/(H−s) when s < H, otherwise ∞;
CoC(d) = |d−s|/d · f²/(N(s−f)). At 50 mm, f/1.8, 3.9 m on Super 35, the sharp zone is about
3.65–4.19 m. **No library takes an f-stop.** pmndrs' DOF uses a symmetric, artistic
`smoothstep(0, focusRange, |d − focusDistance|)`, three's `BokehPass` uses
`focus/aperture/maxblur`, and TSL `dof()` uses `focusDistance/focalLength/bokehScale`. So the
engine owns the lens maths and maps it onto the backend: `focusDistance = s`,
`focusRange = far − near`, and `bokehScale` from the CoC at infinity in pixels. A physical CoC
pass is P2: real thin-lens CoC per pixel, with near-field blur growing faster than far-field, fed
to the backend's bokeh blur.

**Rig presets** (each one a `VirtualCamera` with a body/aim/noise preset, so the editor, MCP and
sequences all use the same building blocks):

| Rig | Body + aim | For |
|---|---|---|
| Third-person orbit | orbit + composer, SpringArm | Game |
| Over the shoulder | thirdPerson + composer | Game, dialogue |
| First person | firstPerson + panTilt | Game |
| Top-down / isometric | follow (high, fixed pitch) + hardLook, optional ortho | Game |
| Fixed / security | fixed + lookAt or none | Game, set coverage |
| Rail / dolly | dolly on `Path3D` + composer | Game, cinematic |
| Follow / chase | follow + composer, damping | Game, vehicles |
| Orbit showcase / turntable | orbit, scripted yaw | Thumbnails, product spots (§5.16 turntables) |
| Two-shot | fixed or dolly + groupFraming (2 targets) | Anime dialogue |
| Shot / reverse shot | a pair of over-the-shoulder rigs generated on one side of the 180° line between two characters | Anime dialogue |
| Close-up / extreme close-up | follow (head bone) + composer at eye line | Anime |
| Crane / jib | dolly on a vertical path + composer | Anime establishing shots |
| Handheld | any + `handheldLight` noise | Anime, documentary feel |

**camera-controls** (yomotsu, MIT, 3.1.2, 2025-11-17; repo pushed 2026-10-21) is the right
**editor viewport** navigation and the input layer for `orbit` bodies in the game app (dolly vs
zoom, `fitToBox`, boundaries, collider meshes, `toJSON`, transitions that return promises). It is
not the virtual-camera model: it has no priority, blends, composition or noise, and its damping
is only deterministic when `update()` gets a fixed delta. No three.js port of Cinemachine was
found, so we write the brain (about 1–2 kLOC).

### 1.3 Post stack: pmndrs `postprocessing` 6.39.x on WebGL now, behind an engine `PostStack` adapter; TSL later

- **Pick: `postprocessing` 6.39.6** (Zlib; released 2026-11-01, four releases since July; peer
  `three >=0.168.0 <0.188.0`, so it covers r187). The spike ran it with MToon and no errors or
  warnings (§3.4). It merges effects into few fullscreen passes (65 draw calls against 88 for
  three's own composer with the same effects, and 2.1 against 2.7 ms at 1080p). It offers MSAA
  (`multisampling: 4`) on HalfFloat buffers, Neutral and AgX tone mapping, and every effect we
  need, and a custom `Effect` is about 20 lines: the spike's speed lines and impact frame are one.
- **Not v7.** 7.0.0-beta.16 (2026-02-19) pins `three >=0.179 <0.184`. Watch it.
- **Fallback:** three's own `EffectComposer` and r187's `renderer.setEffects()` both worked with
  MToon in the spike, and stay as the fallback.
- **Later: TSL `RenderPipeline` on WebGPU**, once three-vrm's `MToonNodeMaterial` loads on r187
  (issue pixiv/three-vrm#1889; PR #1890 is still open and unmerged on 2026-11-17). The TSL node
  set already covers our list (bloom, dof, outline, smaa, lut3D, film, chromaticAberration, GTAO,
  TRAA, motion blur, Sobel).
- **Make the stack data:** `environment.post = [{ "effect": "bloom", ... }, ...]` in the scene,
  keyable from a sequence's `post` track. A pmndrs adapter now and a TSL adapter later
  (principle 6). Parameters are **resolution-independent**: widths in "px at 1080p" scaled by
  output height, so a 4K export looks like the 1080p preview.

**The anime stack, in order:** RenderPass (MSAA 4×, HalfFloat) → [screen-space edges, sets only]
→ DOF → one merged pass: selective bloom → colour grade (LUT3D, hue/saturation,
brightness/contrast) → tone mapping (Neutral) → vignette → grain → anime overlays (speed lines,
impact frame, focus lines) → chromatic aberration (a convolution effect, so it needs its own
pass) → SMAA only when MSAA is off.

**Outlines:** keep MToon's inverted-hull outline for characters. Use screen-space depth+normal
edges only for sets and props, with characters masked out. **Never stack the two on the same
mesh** (§3.4). **AO:** off by default. Screen-space AO greys toon faces. For sets, use baked AO,
or n8ao (ISC, 2.1.0, 2026-11-15) with characters excluded. **Hard shadows** are lighting, not post:
a high-resolution shadow map, low PCF radius, and MToon's own shading ramp.

### 1.4 Viewports: one renderer, scissored viewports and render targets

- **Split screen, picture in picture, multi-angle preview:** one `WebGLRenderer` and one canvas,
  with `setViewport` + `setScissor` per view, each view driven by its own `CameraBrain`
  (Cinemachine's channel). Measured: 1 view 1.2 ms / 64 calls; 4 views 3.3 ms / 233 calls, which
  drops to 2.9 ms / 146 calls when the shadow map is rendered once per frame instead of once per
  view; 9 views 4.9 ms (shadows off). CPU draw calls grow linearly. GPU skinning also repeats per
  view, but animation and spring bones are updated once.
- **Monitors in the set:** a render target (512×288, MSAA) on a screen mesh. 1.0 → 1.7 ms.
  Hide the screen mesh while rendering into it.
- **Never a second `WebGLRenderer`** for a second view. Contexts can't share textures, so every
  VRM's textures would upload twice. For DOM-placed previews, use one full-window canvas behind
  the Vue layout (three's `webgl_multiple_elements` pattern).
- **Post per view** needs its own composer and buffers. Run small previews without post or with a
  cheap stack, and the full stack only on the hero view and on export.

### 1.5 What the PRD rows should say

**§5.3 Rendering and environment**

| Feature | Godot | VRMXG | Pri |
|---|---|---|---|
| Post-processing | glow, SSAO, SSR, DOF, `CompositorEffect` | Post stack as scene data (`environment.post`), keyable from sequences, behind an adapter: pmndrs `postprocessing` 6.39 (Zlib) on WebGL now, TSL `RenderPipeline` when MToon runs on WebGPU. MSAA 4× on HalfFloat buffers, Neutral tone mapping, resolution-independent parameters | P1 |
| Anime look | (none) | Selective bloom (emissive or layer), LUT colour grade, vignette, grain, chromatic aberration, physical DOF from the camera node; speed lines, focus lines and impact frames as custom effects; MToon hull outlines on characters and screen-space edges on sets only; AO off on characters | P1 |
| Hard shadows | shadow settings | Toon shadow preset: high-resolution map, low PCF radius, frozen for static sets | P1 |

**§5.8 Cameras and viewports**

| Feature | Godot | VRMXG | Pri |
|---|---|---|---|
| Cameras | `Camera3D`, `CameraAttributesPhysical` | Camera node with focal length (mm), sensor (mm) and gate fit, focus distance or tracked focus target, f-stop → thin-lens DOF the engine computes, dutch angle | P0 |
| Game cameras | (built by users) | Rig presets built from `VirtualCamera` bodies and aims: third-person orbit, over the shoulder, first person, top-down, fixed, rail/dolly on `Path3D`, follow, orbit showcase. camera-controls (MIT) for editor navigation and orbit input | P0 |
| Virtual cameras and blends | `make_current` only | `VirtualCamera` (priority, channel, body/aim/noise) and a `CameraBrain` per output with default and per-pair blends. Sequences override priority. Deterministic damping at 60 Hz | P1 |
| Cinematic rigs | none | Two-shot (group framing), shot / reverse shot on the 180° line, close-up, crane, handheld | P1 |
| Shake and effects | (built by users) | Seeded noise profiles and impulses (trauma shake, zoom punch), keyable | P1 |
| Viewports | `SubViewport`, `ViewportTexture` | One renderer: scissored viewports (split screen, PiP, multi-angle preview) and render-target monitors; one brain per viewport; shadow map rendered once per frame | P1 |

**§5.16 Capture and cinematics**

| Feature | Godot | VRMXG | Pri |
|---|---|---|---|
| Shot sequencer | `AnimationPlayer` tracks | `sequences` in `.vrmxs`, built on the same track core as `AnimationPlayer`: shots, camera track, animation (slot or clip, blend-in, on twos), expression, look-at, dialogue (audio + visemes + subtitle), property, event, audio, post and simulation tracks; markers; shot overrides. Built in-house, not Theatre.js (studio is AGPL, no release since 2024) | P1 |
| Timeline scrubbing | none | Authored tracks evaluated from the frame number alone; simulation re-run from snapshots (physics **and spring bones**) every N frames; bake a simulated span to keys | P0 |
| Lip sync for shots | none | Viseme keys baked from TTS timing or offline analysis, editable | P1 |
| Offline render | `MovieWriter` | Frames at any fps and resolution; time-driven post (grain, glitch) takes its time from the frame number; audio mixed in an `OfflineAudioContext` and muxed by AVFoundation | P0 |

---

## 2. Sequencer: detail

### 2.1 What an anime shot sequencer needs

| Need | Why | Where in the model |
|---|---|---|
| Shots and cuts | Anime is cut-heavy (2–4 s shots); storyboard numbering (010, 020) | `shots[]`, `camera` track |
| Camera blends as well as cuts | Pans, push-ins, follow moves within a shot | `camera` clip `blend`; vcam body/aim |
| Character performance | Animation slots (VRMXA `idle`, `walk` …) or explicit `.vrma` clips, layers (G10) | `animation` track with `layer` |
| Limited animation | On twos/threes for characters, camera on ones | `step` per track |
| Faces | Expression keys, auto-blink with overrides, eye and mouth states (VRMXA) | `expression` track |
| Gaze | Look at the camera, the other speaker, an object; blend between targets | `lookAt` track |
| Dialogue | Audio, subtitle, visemes and the speaker's look-at tied together | `dialogue` track |
| World and props | Doors, lights, items: properties and verbs | `property`, `event` tracks |
| Audio | Music, SFX and ambience, in sync | `audio` track (buses from §5.10) |
| Effects | Speed lines, impact frames, colour changes per shot | `post` track, `event` |
| Scrubbing | Jump to any frame and see the exact final image | §1.1 rules 1–3 |
| Continuity cheats | Reposition per shot without breaking the world | `shots[].overrides` |
| Agents | Block a scene from a script through MCP | JSON patches on ids |

### 2.2 Reference designs

| System | Model | Take |
|---|---|---|
| **Unity Timeline + Cinemachine** | Timeline asset of tracks (Animation, Activation, Audio, Control, Signal, Cinemachine); clips with ease in/out and blends by overlap; PlayableDirector evaluates at any time; under Timeline, vcam priority is ignored | Blend by clip overlap; signals as events; a camera track overriding priority; evaluating at a given time |
| **Unreal Sequencer** | Level Sequence; bindings (possessables, spawnables); tracks per binding; Camera Cuts track; Shots track of sub-sequences with takes; Cine Camera Actor (filmback, focal length, aperture, tracked focus); Rail and Crane rigs; bake to keys | Shots as sub-ranges, takes later; physical camera fields; baking; rail and crane rigs |
| **Blender** | Timeline markers bound to cameras switch the active camera; VSE strips for edit and audio | Markers; camera switching by marker is the simplest cut model |
| **Godot AnimationPlayer** | Tracks for any property (by NodePath), transforms, blend shapes, method calls, Bezier, audio, nested animations; update modes continuous/discrete/capture | One track core for gameplay and cutscenes; property-path addressing; update modes |
| **Theatre.js** | Sheets → objects → props, keyframed sequences, audio attach, studio UI | Bezier key editing in the UI is worth imitating; nothing to adopt |

### 2.3 Libraries considered

| Package | Version / last release | Licence | Verdict |
|---|---|---|---|
| `@theatre/core` | 0.7.2, 2024-05-19 | Apache-2.0 | Dormant; wrong model |
| `@theatre/studio` | 0.7.2, 2024-05-19 | **AGPL-3.0-only** | Not usable in a shipped app |
| `animation-timeline-js` | 2.3.5, 2024-07-21 | MIT | Canvas timeline UI only; stale |
| `@xzdarcy/react-timeline-editor` | 1.0.0, 2026-01-25 | MIT | React; we use Vue |
| `gsap` | 3.15.1, 2026-11-11 | GSAP "no charge" standard licence | A playback clock, not a data model; licence isn't OSI |
| `animejs` | 4.5.0, 2026-11-02 | MIT | Same: a playback clock |
| `DesignScaffoldTimeline` (ours, Swift) | — | private | Design reference for the Vue timeline UI |

---

## 3. Post-processing: detail

### 3.1 Pipelines compared

| | pmndrs `postprocessing` 6.39.6 | three `EffectComposer` (r187) | r187 `renderer.setEffects()` | TSL `RenderPipeline` (WebGPU) |
|---|---|---|---|---|
| Works with three-vrm MToon on r187 | **Yes (spike)** | Yes (spike) | Yes (spike) | **No**: `MToonNodeMaterial` fails to link on r187 (#1889) |
| Merges effects | Yes, into one `EffectPass` per group | No, one fullscreen pass each | No | Node graph, compiled together |
| MSAA in post buffers | `multisampling: N` | Your own RT with `samples` | `antialias: true` | `antialias: true` |
| Tone mapping | `ToneMappingEffect` (Neutral, AgX, ACES …); renderer stays `NoToneMapping` | `OutputPass` | Automatic, after effects | Automatic, or `renderOutput` |
| DOF | Bokeh, world-unit focus/range (symmetric) | `BokehPass` (focus/aperture/maxblur) | `BokehPass` | `dof()` |
| Bloom | Mipmap bloom, `SelectiveBloomEffect`, luminance threshold | `UnrealBloomPass` (+ layer trick for selective) | `UnrealBloomPass` | `bloom()`, selective through an emissive MRT |
| Outline | `OutlineEffect` (selection) | `OutlinePass` (selection) | — | `outline()`, `sobel` |
| AA | SMAA, FXAA effects | `SMAAPass`, `FXAAPass` | MSAA | `smaa`, `fxaa`, `traa` |
| Colour grading | LUT3D/LUT1D, hue/saturation, brightness/contrast | `LUTPass`, `ColorCorrectionShader` | — | `lut3D` |
| Film | Vignette, ChromaticAberration, Noise, Scanline, Glitch | `FilmPass`, `RGBShiftShader`, `VignetteShader`, `GlitchPass` | — (FilmPass gets no delta) | `film`, `chromaticAberration`, `rgbShift` |
| AO | SSAO; n8ao plugs in | SSAO, SAO, GTAO | — | `ao()` (GTAO), SSGI |
| Status | Active: 6.39.3–6.39.6 between Jul and Nov 2026; v7 beta pins three < 0.184 | Ships with three | Ships with three (new in r18x) | Ships with three; blocked for us |

### 3.2 Effect by effect for an anime look

| Effect | Choice | Notes |
|---|---|---|
| Outlines | MToon hull on characters; screen-space edges on sets | See §3.4. Authored MToon widths are thin: Spec's 0.0008 m world outline nearly vanishes at 4 m. Anime wants screen-coordinate mode or a per-shot width multiplier |
| Bloom | Selective (emissive or layer) by default | With a 0.9 threshold in linear HDR, lit MToon skin and white shirts bloom (spike `builtin` and `three` shots: hazy). Threshold above 1, or selective bloom |
| DOF | pmndrs DOF, driven by the engine's thin-lens maths | Transparent MToon (BLEND without z-write: eyelashes, brows, iris) takes the depth of whatever is behind it. On a face that is the face. On hair cards in front of the background, they blur like the background. Use `transparentWithZWrite` on hair |
| Colour grade | LUT3D per shot or sequence, plus hue/sat/contrast | Keyable from the `post` track |
| Tone mapping | Neutral | Keeps MToon's authored colours (vrm skill); AgX is the alternative. Never adaptive (temporal) |
| AA | MSAA 4× in the composer; SMAA if MSAA is off | FXAA blurs line art. TAA/TRAA ghosts on thin outlines and needs re-warming after every scrub |
| AO | Off on characters | n8ao on sets with a character mask, or baked AO |
| Vignette, CA, grain | pmndrs effects | Grain must take time from the frame number (pmndrs `NoiseEffect` uses `rand(uv*(1+time))`, and the time comes from `composer.render(delta)`); set it explicitly on scrub and export |
| Speed lines, focus lines, impact frames | Custom pmndrs `Effect` (the spike has one) | Seeded by frame and keyed in the `post` track; an impact frame is a 1–3 frame event (posterised, inverted, held) |
| Hard shadows | Lighting preset | High-res map, low PCF radius; MToon's shading toony factor gives the hard terminator |

### 3.3 MToon facts that constrain the stack (from the vrm skill and the spike)

- MToon's outline is a second material on the same mesh (`isOutline`), drawn as an inverted hull.
  It lives in the colour and depth buffers like any geometry, and **writes depth**.
- Render order is authored (`renderQueueOffsetNumber` → `renderOrder`). Don't reset it.
- Override-material passes (pmndrs `NormalPass`, three `BokehPass`'s depth pass) draw the outline
  group without extrusion, so it doesn't appear in their buffers. This was harmless in the spike.
- Use `NeutralToneMapping` (or none) to keep authored toon colours. With pmndrs, the renderer
  stays at `NoToneMapping` and a `ToneMappingEffect` closes the chain.
- MToon has a directional key light requirement (the vrm skill's lighting section). Post can't
  fix flat lighting.

### 3.4 Spike results (`spike-cinematics/`, headless Chromium, ANGLE Metal, M5 Max)

Scene: Spec (VRM 1.0, 2 outlined materials, 5 BLEND) and a VRoid 1.0 model (3 BLEND), a toon set,
an emissive lantern, and a 50 mm f/1.8 lens on Super 35 at 3.9 m. Median of 60–200 frames,
GPU-synced with a 1-pixel `readPixels`.

| Case | 1280×720 | 1920×1080 | Draw calls | Errors |
|---|---|---|---|---|
| No post (`renderer.render`, MSAA) | 1.0 ms | 1.0 ms | 35 | 0 |
| r187 `setEffects([bloom, bokeh])` | 1.8 ms | — | 85 | 0 |
| three composer: bokeh, bloom, RGB shift, Output, vignette, film | 2.1 ms | 2.7 ms | 88 | 0 |
| **pmndrs: DOF, merged (bloom, hue/sat, contrast, Neutral, vignette, noise), CA** | **1.8 ms** | **2.1 ms** | **65** | **0** |
| pmndrs + custom speed lines | 1.5 ms (DOF off) | — | 53 | 0 |
| pmndrs + depth/normal edge pass (`NormalPass`) | 1.6 ms | — | 68 | 0 |

*Shadows were off in this table; with the shadow map on, no post is 1.2 ms / 64 calls and pmndrs is
2.1 ms / 94 calls at 720p.*

What it settled:

1. **pmndrs 6.39.6 + three r187 + three-vrm 3.5.5 MToon: no console errors or warnings**, with
   MSAA, HalfFloat buffers, a DOF pass, a six-effect merged pass and chromatic aberration in a
   pass of its own. MToon outlines and BLEND materials render correctly through it.
2. **Outlines: MToon hull versus screen-space edges.** Spec's head, cropped (`shots/outline_compare.png`):
   - The authored 0.0008 m outline is almost invisible at 4 m.
   - MToon at 0.004 m gives a smooth silhouette in the material's outline colour, without inner lines.
   - Screen-space edges alone give a 1-pixel silhouette plus inner lines (ear, nose, chin), with
     stray marks where the face mesh has normal seams, all in one colour.
   - **Both together: a thick, two-tone, doubled line.** The edge filter finds the hull's own
     depth silhouette and draws outside it.
   - **So:** characters use the MToon outline, and sets use screen-space edges with characters
     masked out (stencil or a layer pass). An inner-line pass for characters, if wanted, has to
     key on normals only and skip the hull.
3. **Bloom threshold:** at 0.9 in linear HDR (three composer and `setEffects`), lit MToon skin
   and white cloth glow. pmndrs' luminance threshold with smoothing was usable, but selective
   bloom is the safe default.
4. **Custom anime effects are cheap to write.** Speed lines and the impact frame are one ~20-line
   `Effect` merged into the existing pass. No extra fullscreen pass.
5. **WKWebView: checked 2026-11-17 (AB-R-0929).** Every case above ran in the sandboxed wrapper
   (`spike-cinematics/mac/`), through the custom scheme and through loopback: **no errors, no
   warnings, no timeouts in 36 runs**, with pmndrs' multisampled HalfFloat targets included. The
   frames match Chromium: with shadows matched, SSIM 0.99997 and PSNR 69–74 dB for no post and for
   the full pmndrs stack, at 720p and 1080p (`shots/crop_pmndrs_chromium_vs_wkwebview.png`).
   Costs are the same as in Chromium (loopback, shadows off, median over 60 frames): no post
   0.84 / 1.0 ms, pmndrs 1.76 / 1.86 ms at 720p / 1080p, 35 and 65 draw calls. With shadows on,
   pmndrs is 1.72 ms (mean 1.94) at 720p in 94 calls. Raw numbers are in
   `web/results/wkwebview-shots.json`. Still untested: WebGPU/TSL, which is blocked by #1889.

---

## 4. Viewports: detail

| Approach | How | Cost (spike, 720p, M5 Max) | Use |
|---|---|---|---|
| Scissored viewports | `setViewport` + `setScissor` + `setScissorTest(true)`, one render per camera | 1 → 2 → 4 → 9 views: 1.0 → 1.7 → 2.7 → 4.9 ms; calls 35 → 62 → 117 → 262 (shadows off). With shadows, 4 views: 3.3 ms / 233 calls, or **2.9 ms / 146 calls** when the shadow map is rendered once (`shadowMap.autoUpdate = false`, `needsUpdate` on the first view) | Split screen, PiP, multi-angle preview |
| Render-target monitor | `WebGLRenderTarget(512, 288, { samples: 4 })` on a mesh, sRGB texture, `toneMapped: false` | 1.0 → 1.7 ms | Screens in the set, mirrors, security cams, VRMXI "screen / display" items |
| Second canvas via the same renderer | Render into an RT, or the main canvas, then `drawImage` / `transferToImageBitmap` into a 2D canvas | One copy per view | Detached preview windows |
| Second `WebGLRenderer` | Separate context | Duplicates every texture and program | Avoid |

Notes: draw calls (CPU) are what scales. Shadow maps should be rendered once per frame, not once
per view. Spring bones, mixers and AI update once per step, never per view. Each view with post
needs its own composer and buffers, so multi-angle previews run without post. Web Audio has one
listener, so split-screen audio follows player 1 or a mid-point.

---

## 5. Package status (npm and GitHub, read 2026-11-17)

| Package | Latest | Released | Licence | three range | Notes |
|---|---|---|---|---|---|
| `three` | 0.187.0 | 2026-10 | MIT | — | Engine baseline |
| `@pixiv/three-vrm` | 3.5.5 | 2026 | MIT | — | `MToonNodeMaterial` broken on r187 (#1889; PR #1890 open) |
| `postprocessing` | 6.39.6 | 2026-11-01 | Zlib | `>=0.168.0 <0.188.0` | **Pick.** v7.0.0-beta.16 (2026-02-19) needs `<0.184` |
| `n8ao` | 2.1.0 | 2026-11-15 | ISC | `>=0.137`, pmndrs `>=6.30` | Optional set AO |
| `camera-controls` | 3.1.2 | 2025-11-17 | MIT | `>=0.126.1` | Editor navigation, orbit input; repo active (2026-10-21) |
| `@theatre/core` | 0.7.2 | 2024-05-19 | Apache-2.0 | — | Last commit 2024-04-11 |
| `@theatre/studio` | 0.7.2 | 2024-05-19 | AGPL-3.0-only | — | Editor UI |
| `three-mesh-bvh` | 0.9.18 | 2026-11-03 | MIT | `>=0.159` | Focus-target picking on skinned VRMs |
| `wawa-lipsync` | 0.0.2 | 2025-11-07 | MIT | — | Live viseme estimate; companion only |
| Rhubarb Lip Sync (CLI) | 1.14.0 | 2025-04-03 | MIT (GitHub shows NOASSERTION; check bundled deps) | — | Offline mouth cues for dialogue import |
| `animejs` / `gsap` | 4.5.0 / 3.15.1 | 2026-11 | MIT / GSAP standard | — | Not needed |

---

## 6. Risks

| Risk | Impact | Mitigation |
|---|---|---|
| pmndrs v6 caps three at `<0.188` | A three upgrade waits on a pmndrs release | Pin both; they have tracked three monthly in 2026; the adapter allows falling back to three's composer |
| WebGPU stays blocked by `MToonNodeMaterial` | No TSL post, no TRAA/SSGI | WebGL is the P0 path; vendor PR #1890 if WebGPU is needed early, and compare renders against WebGL first |
| Spring-bone state missing from snapshots | Scrubbed frames differ from played frames: hair "pops" | Serialise three-vrm joint tails with the physics snapshot, or settle from `reset()` for a fixed warm-up; test played-versus-scrubbed frame equality |
| Time-driven post isn't frame-pure | Grain, glitch and adaptive tone mapping differ between preview and export | Feed every time uniform from the frame number; ban temporal effects (adaptive tone mapping, TAA) in export, or re-warm them over N frames |
| Physical DOF mapped onto an artistic CoC | Near-field blur too weak; a lens doesn't match a real lens | Own CoC pass at P2; until then the thin-lens mapping in §1.2 |
| Outline width doesn't scale with export resolution | A 4K export has hairline outlines | Resolution-independent parameters (px at 1080p); MToon screen-coordinate mode for anime |
| Doubled outlines | Characters get thick two-tone lines | Mask characters out of the edge pass |
| WKWebView/Safari quirks with multisampled HalfFloat targets | Black or aliased frames in the wrapper | **Retired 2026-11-17:** the spike page ran clean in the wrapper and matches Chromium (§3.4 item 5, AB-R-0929). Re-run `spike-cinematics/mac` after macOS or pmndrs upgrades |
| Building the sequencer is real work | UI, data, evaluation, MCP | It shares the track core with `AnimationPlayer` (P0 anyway); the timeline UI follows DesignScaffold's single-geometry design |

---

## 7. Sources

**Local**
- `VRMXG-PRD.md` §3, §4.1, §5.1, §5.3, §5.4, §5.6, §5.8, §5.16
- `reference/godot-master/scene/resources/animation.h` (`TrackType`, `UpdateMode`)
- `DesignScaffold/Docs/Timeline.md`; AgentBridge ask AB-A-0031
- `~/.claude/skills/vrm/references/three-vrm.md` (MToon, #1889), `references/scenes-and-games.md` (lighting, outlines)
- `VRMXA_Specification/reference/vrm-specification-master/specification/VRMC_materials_mtoon-1.0/README.md` (outline, render queue)
- `spike-cinematics/web/src/main.js`, `scripts/shots.mjs`, `results/shots.json`, `shots/*.png`
- `node_modules/postprocessing/build/index.js` (CoC shader, `EffectAttribute.CONVOLUTION`, `NoiseEffect`, `ToneMappingMode`)

**Web**
- Theatre.js repo and licence split: https://github.com/theatre-js/theatre
- npm: https://www.npmjs.com/package/@theatre/core, https://www.npmjs.com/package/@theatre/studio
- pmndrs postprocessing: https://github.com/pmndrs/postprocessing, https://www.npmjs.com/package/postprocessing
- n8ao: https://github.com/N8python/n8ao
- camera-controls: https://github.com/yomotsu/camera-controls
- three-vrm WebGPU break: https://github.com/pixiv/three-vrm/issues/1889, https://github.com/pixiv/three-vrm/pull/1890
- Cinemachine 3.1 CinemachineCamera: https://docs.unity3d.com/Packages/com.unity.cinemachine@3.1/manual/CinemachineCamera.html
- Cinemachine Brain: https://docs.unity3d.com/Packages/com.unity.cinemachine@3.1/api/Unity.Cinemachine.CinemachineBrain.html
- Cinemachine blending: https://docs.unity3d.com/Packages/com.unity.cinemachine@2.9/manual/CinemachineBlending.html
- Unity Timeline: https://docs.unity3d.com/Packages/com.unity.timeline@1.8/manual/index.html
- Unreal Sequencer: https://dev.epicgames.com/documentation/en-us/unreal-engine/cinematics-and-sequencer-in-unreal-engine
- Unreal cinematic cameras (Cine Camera Actor, rail, crane): https://dev.epicgames.com/documentation/en-us/unreal-engine/cinematic-cameras-in-unreal-engine
- Godot AnimationPlayer: https://docs.godotengine.org/en/stable/classes/class_animationplayer.html
- Godot animation track types: https://docs.godotengine.org/en/stable/tutorials/animation/animation_track_types.html
- Blender markers (camera binding): https://docs.blender.org/manual/en/latest/animation/markers.html
- three.js PerspectiveCamera (`filmGauge`, `setFocalLength`): https://threejs.org/docs/#api/en/cameras/PerspectiveCamera
- three.js multiple views and elements: https://threejs.org/examples/#webgl_multiple_views, https://threejs.org/examples/#webgl_multiple_elements
- Rhubarb Lip Sync: https://github.com/DanielSWolf/rhubarb-lip-sync
- wawa-lipsync: https://github.com/wass08/wawa-lipsync
