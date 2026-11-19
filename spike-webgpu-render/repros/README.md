# three.js r187 WebGPU repros (from AB-T-0554)

*2026-11-19. These are minimal standalone repros of the three.js issues that `spike-webgpu-render/` found. Each page uses plain three (r187 from the repo root's `node_modules`, or three's `dev` branch) and nothing from the engine. Every page prints PASS or FAIL with what it saw. They were checked in Chrome for Testing 156, headless on Metal (M5 Max, macOS 27.3), through `web/scripts/chromium.mjs`, against r187 and against `dev` at `577fb27` (2026-11-19). Raw results are in `results/`.*

**Nothing here has been posted upstream.** Filing an issue needs the operator's explicit OK.

| Repro | r187 | dev `577fb27` | Upstream | What to do |
|---|---|---|---|---|
| [1-dof-first-frame.html](1-dof-first-frame.html) | FAIL | FAIL | No existing issue found | File draft 1 (once the operator approves) |
| [2-mrtnode-no-mrt.html](2-mrtnode-no-mrt.html) | FAIL (canvas, render target) | PASS | [#35373](https://github.com/mrdoob/three.js/issues/35373), fixed by [#35376](https://github.com/mrdoob/three.js/pull/35376) on 2026-11-08, after r187 | Don't file. The fix ships in r188 |
| [3-offline-nodeframe.html](3-offline-nodeframe.html) | FAIL | FAIL | No existing issue found | File draft 3 (once the operator approves) |
| First-renderer WGSL order (spike gotcha 6) | not reproduced | not tried | none | Kept out (see the end of this file) |

### What changed from the spike's account

- **Issue 1 is not about the second `dof()`, and `_quadMesh` is not the cause.** Every newly built `dof()` pipeline draws **one flat first frame**, the first one too. Frame 2 onwards is correct. The spike only saw this after a rebuild because it grabbed a single frame right after rebuilding. The cached pipeline it fell back on had already drawn frames. A cheaper workaround is to call `scenePass.setSize(w, h)` when building the pipeline, or to throw away the first frame after a rebuild.
- **Issue 2 doesn't touch shadow maps.** Shadow passes draw with an override material, so a mesh's `mrtNode` never reaches them. The page checks this with PCF, VSM and a `colorNode`, and all pass on r187. What breaks is the canvas (the framebuffer target) and any render target without MRT. Spike gotcha 5 should read that way. The layer-pass mask stays the right call for r187.

## Run

```bash
node spike-webgpu-render/repros/serve.mjs                    # repo root on http://127.0.0.1:5242/
SPIKE_BASE=http://127.0.0.1:5242/spike-webgpu-render/repros/1-dof-first-frame.html node spike-webgpu-render/web/scripts/chromium.mjs 'three=r187'
```

To compare against three's `dev`, use a sparse clone. Then start the server with `THREE_DEV` and add `?three=dev` to a page (`run.sh` does both builds):

```bash
git clone --depth 1 --filter=blob:none --sparse https://github.com/mrdoob/three.js.git /tmp/three-dev && git -C /tmp/three-dev sparse-checkout set src examples/jsm
THREE_DEV=/tmp/three-dev node spike-webgpu-render/repros/serve.mjs
THREE_DEV=/tmp/three-dev sh spike-webgpu-render/repros/run.sh    # every page × {r187, dev} → results/<page>-<build>.json
```

`three-map.js` writes the import map for `?three=` and collects console errors. It also defines `report()`. For an upstream issue, replace it with a CDN import map (the drafts below do).

---

## Draft 1: DepthOfFieldNode: the first frame of a new `dof()` is one flat colour

> **Description**
>
> The first frame a `RenderPipeline` draws with a newly built `dof()` comes out as one flat colour, which is the scene pass's background. From the second frame on it's correct. Every new `dof()` does this, so an app that rebuilds its pipeline (a settings change, a post preset switch) flashes a solid frame, and a single-frame capture right after a rebuild is wrong.
>
> `DepthOfFieldNode.updateBefore()` sizes its render targets from its input, `this.textureNode.value.image`. When the input is a `pass()` texture, on the first frame that is still the `PassNode`'s initial 1×1 target. The pipeline's own output graph never samples the pass, since only DOF's internal quad materials do. So the pass's `updateBefore()` runs for the first time *inside* DOF's `updateBefore()`, during the CoC quad render, after DOF has already called `setSize( 1, 1 )`. Recorded order on frame 1: `dof:begin → pass → dof:end`, with DOF's input at `1x1`. On frame 2 the input is `320x180`. Every DOF target is 1×1 for that frame, so the composite is one texel.
>
> `gaussianBlur()` sizes itself the same way but isn't affected, because its output samples the pass, so the pass runs first (`pass → blur:begin → blur:end`). `BloomNode` sizes from `renderer.getDrawingBufferSize()` and isn't affected either.
>
> Calling `scenePass.setSize( w, h )` before the first frame avoids it. Possible fixes: size DOF from the drawing buffer as `BloomNode` does, or set the size again after the internal passes have pulled the input in.
>
> **Reproduction steps**
>
> 1. Build `pass( scene, camera )` → `dof( output, scenePass.getViewZNode(), … )` → a `RenderPipeline`.
> 2. Draw one frame and read the canvas: the image is one colour.
> 3. Draw a second frame: correct. Build the same pipeline again: its first frame is flat again.
>
> **Code**
>
> ```html
> <script type="importmap">{ "imports": { "three/webgpu": "https://cdn.jsdelivr.net/npm/three@0.187.0/build/three.webgpu.js", "three/tsl": "https://cdn.jsdelivr.net/npm/three@0.187.0/build/three.tsl.js", "three/addons/": "https://cdn.jsdelivr.net/npm/three@0.187.0/examples/jsm/" } }</script>
> <script type="module">
> import * as THREE from 'three/webgpu';
> import { pass, uniform } from 'three/tsl';
> import { dof } from 'three/addons/tsl/display/DepthOfFieldNode.js';
>
> const renderer = new THREE.WebGPURenderer();
> renderer.setSize( 320, 180 );
> document.body.appendChild( renderer.domElement );
> await renderer.init();
>
> const scene = new THREE.Scene();
> scene.background = new THREE.Color( 0x335577 );
> scene.add( new THREE.HemisphereLight( 0xffffff, 0x444444, 2 ) );
> for ( let i = 0; i < 6; i ++ ) {
> 	const mesh = new THREE.Mesh( new THREE.BoxGeometry(), new THREE.MeshStandardNodeMaterial( { color: new THREE.Color().setHSL( i / 6, 0.7, 0.5 ) } ) );
> 	mesh.position.set( - 3 + i * 1.2, 0, - i * 2 );
> 	scene.add( mesh );
> }
> const camera = new THREE.PerspectiveCamera( 50, 320 / 180, 0.1, 100 );
> camera.position.set( 0, 1, 5 );
>
> const scenePass = pass( scene, camera );
> const pipeline = new THREE.RenderPipeline( renderer, dof( scenePass.getTextureNode(), scenePass.getViewZNode(), uniform( 6 ), uniform( 3 ), uniform( 2 ) ) );
>
> const ctx = new OffscreenCanvas( 320, 180 ).getContext( '2d' );
> let frame = 0;
> renderer.setAnimationLoop( () => {
> 	pipeline.render();
> 	ctx.drawImage( renderer.domElement, 0, 0 );
> 	const d = ctx.getImageData( 0, 0, 320, 180 ).data, colours = new Set();
> 	for ( let i = 0; i < d.length; i += 4 ) colours.add( ( d[ i ] << 16 ) | ( d[ i + 1 ] << 8 ) | d[ i + 2 ] );
> 	console.log( `frame ${ ++ frame }: ${ colours.size } colours` ); // frame 1: 1 colours, frame 2: ~1400
> 	if ( frame === 3 ) renderer.setAnimationLoop( null );
> } );
> </script>
> ```
>
> **Live example**: (to add: a jsfiddle of the code above)
>
> **Version**: r187, and `dev` at 577fb27
>
> **Device / Browser / OS**: Desktop, Chrome 156, macOS (Apple M5 Max, Metal)

## Draft 2: not to file (already fixed upstream)

[#35373](https://github.com/mrdoob/three.js/issues/35373) reports the same failure with `ReflectorNode`. [#35376](https://github.com/mrdoob/three.js/pull/35376) fixed it (`MRTNode.isCompatible()`: a material's MRT is used only when the target has a texture for each of its outputs), and it was merged on 2026-11-08, nine days after r187. On `dev` all three cases pass. Until r188, avoid `material.mrtNode` wherever the material could be drawn to the canvas or to a target without MRT. The spike's layer-pass mask already does.

r187 results (`results/2-mrtnode-no-mrt-r187.json`):
- **canvas:** `struct OutputType {}` (WGSL: "structures must have at least one member"), and the pipeline fails. The red box is missing: 0 red pixels against 2564 in the control.
- **rt:** the same error, 0 red pixels against 498.
- **shadow:** passes, identical to the control, with no errors.

## Draft 3: WebGPURenderer: no public way to advance the node frame, so passes and shadow maps freeze in offline rendering

> **Description**
>
> Nodes with `updateBeforeType = NodeUpdateType.FRAME` update once per `nodeFrame.frameId`. That covers every `PassNode` in a `RenderPipeline`, shadow maps (`ShadowNode`) and effect nodes such as `DepthOfFieldNode`. Only the renderer's internal `requestAnimationFrame` loop (`Animation.js`) advances `frameId`, and `render()` advances only `renderId`.
>
> An app that renders several frames in one task, without yielding to rAF, gets the first frame's passes and shadow maps on every frame. Examples are an offline video export, a frame-by-frame capture, a test or a benchmark loop. The pipeline's final quad is drawn again, but over stale pass textures. In the repro, 5 frames of a moving box drawn in one task produce **1 distinct image**, through a `RenderPipeline` and through a plain `render()` with a shadow-casting light alike. `frameId` stays at 2 the whole time. Drawn one per rAF, the same 5 frames are all different.
>
> The only way around it is the private `renderer._nodes.nodeFrame.update()` before each frame, which makes the offline frames equal to the rAF ones exactly.
>
> Could there be a public way to start a new frame? For example, `renderer.advanceFrame()` (or a documented `renderer.nodes.nodeFrame`). It would also help if `NodeFrame.update()` could take an explicit delta. It derives `deltaTime` and `time` from `performance.now()`, so TSL `time` (and anything driven by it, such as `film()`) can't be deterministic in an offline export even with the frame advanced. #35278 and #35279 recently moved when the internal loop starts. The per-frame update it does is exactly what an offline loop is missing.
>
> **Reproduction steps**
>
> 1. Draw one warm-up frame normally, so the internal loop has run.
> 2. In one task, without awaiting rAF, move an object and call `pipeline.render()` (or `renderer.render()` with shadows) 5 times, copying the canvas after each.
> 3. The 5 copies are identical. With `renderer._nodes.nodeFrame.update()` before each render, they differ as expected.
>
> **Code**
>
> ```js
> import * as THREE from 'three/webgpu';
> import { pass } from 'three/tsl';
>
> const renderer = new THREE.WebGPURenderer();
> renderer.setSize( 256, 144 );
> document.body.appendChild( renderer.domElement );
> await renderer.init();
>
> const scene = new THREE.Scene();
> scene.add( new THREE.AmbientLight( 0xffffff, 0.5 ), new THREE.DirectionalLight( 0xffffff, 3 ) );
> const box = new THREE.Mesh( new THREE.BoxGeometry(), new THREE.MeshStandardNodeMaterial( { color: 0xff3030 } ) );
> scene.add( box );
> const camera = new THREE.PerspectiveCamera( 50, 256 / 144, 0.1, 100 );
> camera.position.set( 0, 3, 7 );
> camera.lookAt( 0, 0.5, 0 );
> const pipeline = new THREE.RenderPipeline( renderer, pass( scene, camera ).getTextureNode() );
>
> await new Promise( ( r ) => renderer.setAnimationLoop( () => { renderer.setAnimationLoop( null ); pipeline.render(); r(); } ) ); // warm-up
>
> const ctx = new OffscreenCanvas( 256, 144 ).getContext( '2d' ), frames = [];
> for ( let i = 1; i <= 5; i ++ ) { // an offline export loop: one task, no rAF
> 	box.position.x = - 3 + i;
> 	// renderer._nodes.nodeFrame.update(); // ← the private workaround
> 	pipeline.render();
> 	ctx.drawImage( renderer.domElement, 0, 0 );
> 	frames.push( ctx.getImageData( 0, 0, 256, 144 ).data.join() );
> }
> console.log( 'distinct frames:', new Set( frames ).size ); // 1; with the workaround: 5
> ```
>
> **Live example**: (to add: a jsfiddle of the code above)
>
> **Version**: r187, and `dev` at 577fb27
>
> **Device / Browser / OS**: Desktop, Chrome 156, macOS (Apple M5 Max, Metal)

---

## Not kept: the first renderer's WGSL order (spike gotcha 6)

In the spike's particle view, the first `WebGPURenderer` in the page declares the set material's environment cube binding and `radiance`/`iblIrradiance` privates **before** the shadow map and `shadowPositionWorld`. Later renderers declare them after. That causes 2–7 pixels off by 1. A Chromium run of the spike (`?mode=particles&renderer=webgpu&wgsl=1`) confirmed the diff is still there.

A small scene didn't reproduce it, so there's no page for it. The scene was three renderers in one page, each with a PMREM of `RoomEnvironment`, a shadowed `DirectionalLight` and a `#9b9a96` standard material. Their WGSL and pixels were identical, with node or classic (`GLTFLoader`-style) materials, with fog, with the sample cafe's lights (ambient, sun with shadow, spot), and with `content/sample/sets/cafe.glb` loaded through plain `GLTFLoader`. What's still missing from those attempts is everything else in the spike's particle view: the characters' TSL stand-in material and outline, the three.quarks TSL batches, the gradient background and the engine's `RenderHost`. Bisecting those is the next step if this one matters. The spike's warm-up renderer workaround stands.
