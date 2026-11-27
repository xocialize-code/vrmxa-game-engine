# mesheditor: what VRMXG could use

*2026-11-26. The operator asked for a review of [peer2p/mesheditor](https://github.com/peer2p/mesheditor) for things
VRMXG could take. This is a reading of its source at one commit. Nothing was installed, built, run or timed.*

## Summary

- **Verdict: take ideas and a little maths. Don't depend on it, and don't embed it.**
  - It is a Babylon.js app built around one 10,553-line service class.
  - Much of its heavy lifting is Babylon's: booleans, decimation, the exporters, the gizmos, the terrain material.
  - Ported to three.js, those would become libraries we pick ourselves.
- **What is its own and worth having** is plain-array geometry code:
  - a coplanar-overlap (z-fighting) checker;
  - a guard around decimation that keeps small parts intact and rolls back when a part collapses;
  - a signed-distance part list with a surface-nets mesher;
  - parametric building pieces: walls with openings, stairs, arches, columns and roofs.
- **Several features are weaker than their names say.**
  - The "LSCM" unwrap is a planar projection.
  - The "quad cage" is a triangulated sphere shrunk onto the mesh.
  - "Loop cut" splits one face.
  - Shrinkwrap and baking test every triangle.
  - Terrain heights are 8-bit.
  - Its undo is a stack of closures. Ours is document-level and covers MCP edits.
- **Its agent layer is the opposite of ours.**
  - By default it sends 20 core function schemas on every request, about 12,000 tokens. With every tool on it sends
    53, roughly 25,000 to 28,000 tokens.
  - One of its tools runs model-written JavaScript, and that tool is in the default set.
  - Our MCP lists hold 21 tools at about 1,958 tokens (22 at 2,087 in the editor).
  - A few rules from its skills are worth copying into ours.
- **The code is Apache-2.0, apart from two credits whose terms aren't confirmed. The bundled assets are not.**
  - The default font's metadata says CC BY-SA 3.0.
  - No source is recorded for the decal images or the demo models, and some models are named after Mario and GTA.
  - Take no assets.
- **There is no VRMXI editor in VRMXG yet.** The PlayCanvas review only sketched one
  (`research/playcanvas-comparison.md:191`). So the recommendations land in what exists: `@vrmxg/model`, `@vrmxg/mcp`,
  `content/*/tools/` and the `vrmxg` skill.

## What was reviewed

A shallow clone in `reference/mesheditor/` (git-ignored), commit `f724541`, 2026-11-26, package version 1.7.0.

| | |
|---|---|
| Maintainer | GitHub user `peer2p`, the only contributor (149 commits) |
| Age and pace | Created 2026-10-28. Ten releases from 2026-11-15 (v1.1.0) to 2026-11-23 (v1.7.0); last push 2026-11-26 |
| Interest | 4 stars, 2 forks, 0 open issues |
| Size | 88,000 lines of TypeScript in `src/`, plus 10,400 of CSS and 17,000 of tests. The clone is 135 MB: 69 MB of demo models and screenshots in `docs/`, and 55 MB of git |
| Stack | `@babylonjs/core` 9.29.0 (Apache-2.0); three 0.187.0, used only to convert Collada; earcut, dat.gui, lucide, marked, tippy.js. Webpack, plus Electron 45 for the desktop build |
| WASM, threads | No workers and no `SharedArrayBuffer`. The only WASM is Manifold, which Babylon's CSG2 fetches at runtime (below) |
| Tests | 370 cases in 28 files: Vitest against Babylon's `NullEngine` in jsdom, and one Playwright spec on SwiftShader. CI runs type-check, Vitest and both builds, but not Playwright (`reference/mesheditor/.github/workflows/ci.yml:43`) |
| Docs | A 900-line README; `AGENTS.md`, its UI-language and tool-authoring rules; nine skills and a README in `skills/` |

Lines by area, roughly:

| Area | Lines | Where |
|---|---|---|
| Core service, app, agent | 17,400 | `src/MeshEditorService.ts`, `MeshEditorApp.ts`, `AIAgentService.ts`, `Neural3DGeneratorService.ts` |
| UI services and tool panels | 16,800 | `src/services/`, `src/tools/editor/` |
| Agent tools | 8,200 | `src/tools/builtin/` (53 tools) |
| Painting, sculpting, rigging | 10,100 | `src/painting/`, `src/sculpting/`, `src/rigging/` |
| Geometry, SDF, CAD, sweeps | 12,700 | `src/geometry/`, `src/sdf/`, `src/minicad/`, `src/pathExtrusion/` |
| UV, baking, compression | 4,500 | `src/uv/`, `src/baking/`, `src/compression/` |
| Terrain | 3,000 | `src/heightmap/` |
| Splats, voxels, decals, text, textures | 10,000 | `src/splatting/`, `src/voxel/`, `src/decals/`, `src/textMesh/`, `src/textures/` |

## Licence and third-party terms

- **The code is Apache-2.0.**
  - `reference/mesheditor/LICENSE` is the stock Apache 2.0 text word for word. Its appendix placeholder,
    `[yyyy] [name of copyright owner]`, is left unfilled.
  - The README and `package.json` agree.
  - GitHub's API now reports `apache-2.0`. The brief said it detected none; it does today.
- **There is no NOTICE file and no per-file licence header.**
  - A port carries the Apache-2.0 text and marks our changes (§4(a), §4(b)). There is no NOTICE to carry.
  - Ported files stay Apache-2.0 inside our MIT OR Apache-2.0 packages. The README lists them as it lists navcat and
    fdlibm.
- **Two credits come with no licence text.**
  - `reference/mesheditor/src/tools/textureUtils.ts:226`, `:1294` and `:1383` say "adapted from img2threejs", and `:248`, `:638`, `:649` and `:1169` mention it too. A GitHub
    search finds an `img2threejs/img2threejs` repo marked Apache-2.0. I didn't confirm it is the source.
  - `reference/mesheditor/src/sdf/sdfPrimitives.ts:79` and `:119` credit Inigo Quilez's distance functions, with no
    licence named.
  - Don't port either file as code until its source and terms are confirmed. Write ours from the published formulas.
- **The fonts.** `reference/mesheditor/src/textMesh/TextMeshController.ts:16-18` bundles three.
  - Kenney Future (`reference/mesheditor/src/assets/fonts/Kenney_Future_Regular.json`) is the default. Its metadata
    says CC BY-SA 3.0, and the repo gives no attribution.
  - The two Droid Sans files say Apache-2.0, copyright Google.
- **No file records a source or licence for these assets:**
  - the 13 decal PNGs in `reference/mesheditor/src/assets/textures/decals/`, also shipped as data URLs in
    `src/decals/decalAssetUrls.ts`;
  - 27 GLBs, one `.babylon` and one `.splat` in `reference/mesheditor/docs/models/`. Every GLB names "Babylon.js
    v9.29.0" as its generator, which suggests they were exported from the app;
  - the screenshots, and `reference/mesheditor/src/promptImages/`.
  - Names include `mario_level`, `mario_bell`, `gta_tower`, `building_gta` and `mario_tpose.png`.
- **Dependencies** are Apache-2.0, MIT or ISC by the lockfile. Transitive dependencies weren't checked.
- **Neural generators.** The app calls TRELLIS 2, Hunyuan3D and Hi3D endpoints but ships no weights. If we used that
  path, each model's own licence would apply.

## Candidates

Each candidate gives what it is, what it would do for us, port or dependency, the licence, and a size. S is about a
day; M is a few days. They are numbered as in the recommendations.

### Worth taking

**1. A guard around decimation.** `reference/mesheditor/src/compression/ModelCompressor.ts:547-640`,
`reference/mesheditor/src/sculpting/SculptController.ts:1933`.
- **What it is.** The decimator itself is Babylon's `QuadraticErrorSimplification` (`ModelCompressor.ts:520`). The
  guard around it is the useful part:
  - it simplifies each submesh or loose island on its own, so edges never collapse across parts;
  - it leaves parts under 60 to 80 faces alone, so eyes, buttons and rims survive;
  - after each run it checks the bounding box, a minimum face count and that every position is finite. If a check
    fails it retries once at a gentler ratio, then restores the original.
  - mesheditor makes no LOD chains and has no convex decomposition.
- **What it would do for us.**
  - Our five TRELLIS props in `content/sample/props/` are 35,000 to 40,000 triangles each, counted from their GLBs.
  - The PRD has meshopt compression for props (§5.19) and a `LOD` node (§5.3), both P1. Neither simplifies meshes.
- **Port or dependency:** no new dependency.
  - three r187 already ships meshoptimizer 1.1's simplifier (MIT) in `examples/jsm/libs/meshopt_simplifier.module.js`.
    It is one WASM instance, with no workers.
  - three's `SimplifyModifier` uses it, and normals and UVs count in its error.
  - We'd rewrite the guard around it, about 100 lines.
- **Licence:** idea only. Nothing to carry unless we copy its lines.
- **Size:** M.
- **Caution:** run it on props and sets only. It would touch a VRM's geometry under its skin and morph data.

**2. Coplanar-overlap (z-fighting) check.** `reference/mesheditor/src/geometry/zFightingDetector.ts:341`
(`detectZFighting`, in a 745-line file).
- **What it is.**
  - It buckets triangles from every mesh on a 0.2 m grid (`:357`).
  - It pairs triangles that are near-coplanar within a plane and an angle tolerance.
  - It clips each pair in 2D with Sutherland–Hodgman (`:207`) and measures the overlap.
  - It groups issues by mesh pair, with a severity, face ids and a suggested fix.
  - From Babylon it imports only `Mesh`, `Material`, `MultiMaterial`, `Vector3` and `VertexBuffer` (`:1`).
- **What it would do for us.**
  - It finds flicker in sets and generated items before a person sees it.
  - It fits MCP's `game op=validate` and the content tools' checks.
  - Agents already act on our errors, and this one names faces and the fix.
- **Port or dependency:** port to plain arrays. It runs editor-side, so `Math.*` is fine.
- **Licence:** the Apache-2.0 text goes beside the port; mark our changes.
- **Size:** M.

**3. Signed-distance parts and a surface-nets mesher.** `reference/mesheditor/src/sdf/sdfPrimitives.ts` (620 lines),
`reference/mesheditor/src/sdf/surfaceNets.ts:54` (463 lines).
- **What it is.**
  - A shape is a JSON list of parts.
  - A part is one of nine shapes, combined by union, subtract or intersect, with a smooth blend radius, rotation,
    `mirrorX` and a colour.
  - The mesher samples a grid of at most 136 cells a side, with a two-cell margin.
  - It keeps one shared vertex per cell (`surfaceNets.ts:138-226`), so the mesh comes out welded, with vertex colours.
- **What it would do for us.**
  - Agents and content tools get a compact way to describe rounded, blended props.
  - Those suit the toon look better than the boxes and cylinders `content/starter/tools/glb.mjs:21-34` makes today.
  - The output is a GLB, so `@vrmxg/item` needs no change.
- **Port or dependency:** write our own from the published distance formulas and the surface-nets algorithm. Use
  theirs as a reference for the part schema. The credit question above makes a straight port the slower path.
- **Licence:** none if written fresh.
- **Size:** M.

**4. Parametric building pieces.** `reference/mesheditor/src/geometry/architecture.ts:182-1185`.
- **What it is.**
  - Walls with openings (rect, arch or round, each with an optional frame), a plinth and a cornice.
  - Arches, columns, stairs and roofs, and mouldings from profile presets.
  - Walls are polygons with holes, extruded through earcut.
- **What it would do for us.** Quick sets for templates without a boolean engine: walls, doorways, stairs and roofs.
  The PRD lists "Blockout primitives" as P2, under Rendering and environment (§5.3).
- **Port or dependency:** port the parameter shapes onto three's `Shape` with holes and `ExtrudeGeometry`. three's
  examples already have `RoundedBoxGeometry`.
- **Licence:** carry the Apache-2.0 text if we port code. The parameter design alone carries nothing.
- **Size:** M.
- **Determinism:** bake to a GLB at author time. The file calls `Math.sin`, `Math.cos` and the like on 33 lines. A node
  that built colliders at load time would need `dmath`.

**5. Rules from its agent skills.**
- **What it is.** Four rules, from `reference/mesheditor/skills/procedural-modeler.md` and `six-pass-pipeline.md`:
  - plan the part hierarchy and a triangle budget before making geometry (`procedural-modeler.md:260`,
    `src/tools/builtin/PlanModelTool.ts`);
  - stand objects on Y = 0 (`procedural-modeler.md:17`);
  - make touching parts overlap by 0.02 to 0.05, so nothing floats (`six-pass-pipeline.md:39`);
  - offset flush panels and run the overlap check after assembly (`procedural-modeler.md:205-208`).
- **What it would do for us.** These suit an agent that builds levels or items through our MCP tools.
- **Port or dependency:** text, into the `vrmxg` skill (`skills/`). It adds no tool, so it costs nothing against the
  token budget.
- **Licence:** idea only.
- **Size:** S.

### Weaker than what we have, or not useful

All paths in this table are under `reference/mesheditor/`.

| Area | What it is | Verdict |
|---|---|---|
| Mesh editing (extrude, inset, bevel, loop cut) | No topology persists between operations. A "facet" is one triangle, or two that pair into a quad (`src/MeshEditorService.ts:4439`). Extrude appends vertices and side faces to the index buffer (`:5005`). "Loop cut" calls `knifeSplitFacet` on one face (`:5863-5869`). Bevel welds vertices by position to find sharp edges (`src/geometry/bevelModifier.ts:132`) | Not a base for mesh editing. If we ever edit meshes, start from a real topology library |
| Subdivision | Catmull-Clark (`src/geometry/organicGeometry.ts:512`). It pairs near-coplanar triangles into quads, welds positions, and keeps UV charts and material slots apart | Sound, but we have no use for it now. Note it if items ever need smoothing at author time |
| Retopology | `decimate` is candidate 1's decimator. `quad_cage` is a 14 × 16 UV sphere, sized to the bounding box and shrinkwrapped, all in triangles (`src/sculpting/SculptController.ts:2407-2480`). `quad_strip` draws a strip along a stroke | Not retopology in the usual sense |
| Shrinkwrap, baking | Closest point tests every triangle (`src/sculpting/SculptController.ts:2526-2545`). The baker's raycast is a linear scan with an AABB reject (`src/baking/TextureBaker.ts:759`). Its AO is a cavity estimate | `three-mesh-bvh`, which `@vrmxg/camera` already uses, does both properly |
| UV unwrapping | The header says LSCM (`src/uv/UVUnwrapController.ts:59`). The code floods charts by angle and projects each onto the plane of its average normal (`:600-603`, `:648-654`), then relaxes interiors twice (`:697`). Overlap means `uvSurfaceArea > 1.05` (`:1214`). Packing is by shelves (`:1002`) | Use xatlas (MIT) when lightmaps arrive (P2). Its report fields (islands, coverage, texel density in px/m) make a fair checklist |
| Sculpting | Seven brushes (`src/sculpting/SculptController.ts:30-37`). Each dab scans every vertex, with no dynamic topology and X symmetry only | No use. Characters arrive finished as VRMXA |
| Booleans | Babylon's CSG2, which wraps Manifold, with the old CSG as fallback (`src/MeshEditorService.ts:3564-3600`). It calls `InitializeCSG2Async()` with no arguments (`:475`). In Babylon 9.29.0, that fetches `https://unpkg.com/manifold-3d@3.4.0` at runtime | If booleans are ever planned (the PRD's CSG row, P2, plans only blockout primitives), bundle manifold-3d (Apache-2.0) or three-bvh-csg (MIT) ourselves. A runtime CDN fetch fails offline and in our hardened app |
| Terrain | A painted heightmap and a three-layer RGB splat map on Babylon's `TerrainMaterial`. Heights are one grey byte per pixel (`src/heightmap/HeightmapController.ts:1122-1126`), so 256 levels. The presets use a seeded integer hash noise (`:844-848`); a path tool carves roads (`:1349`) | 8-bit heights terrace. Not now (see Watch) |
| Import and export | Babylon's loaders and serializers for GLB, OBJ and STL. `.ply` is accepted (`src/services/InputAndFileService.ts:189`) and handed to Babylon's loaders. Collada goes through three's `ColladaLoader` and `GLTFExporter` (`src/loaders/ColladaConverter.ts:1-3`) | three r187 has the OBJ, STL, PLY, FBX, Collada and 3MF loaders and the OBJ, STL, PLY and glTF exporters |
| Rigging | Envelope weights, inverse distance to the fourth power (`src/rigging/WeightPaintController.ts:553`, `:629`), on its own humanoid, quadruped and spine skeletons | Not VRM humanoid. VRMXW wearables use the character's rig |
| Undo | Closures holding full vertex snapshots, capped at 100 steps (`src/MeshEditorService.ts:230`, `:1712-1750`; `src/types.ts:18`) | Ours is document-level, also undoes MCP edits, and is tested through MCP |
| Gizmos, viewport | Babylon's `GizmoManager`, a highlight layer, marquee select, and touch controls (one-finger orbit, a Touch Bar) | M5 W5 gave us the same set. Touch matters only if the editor reaches iPad |
| Web Component | `<mesh-editor>`, with `openModel`, `exportGLB` and plugins (`src/web-component/MeshEditorElement.ts:248-333`). A host adapter adds "Save to Host App" (`src/adapters/HostAppAdapter.ts:5-45`) | Embedding it brings Babylon, the CDN fetch, the eval tool and the LLM key settings. Unknown: whether its GLB export keeps the `KHR_physics_*` extensions our `door-frame.glb` uses |
| Tests | Vitest on `NullEngine` in jsdom. Playwright on SwiftShader, not run in CI | The same shape as our Node tests and Chromium acceptance. Ours add three runtimes, hashes and AppProbe |
| Splats, voxels, decals, 3D text, texture paint | Babylon features in thin wrappers | Splats stay on the PlayCanvas review's watch list. three has `DecalGeometry` and `TextGeometry` |

### Its agent layer against our MCP

| | mesheditor | VRMXG |
|---|---|---|
| Protocol | OpenAI function calling, from the app to an LLM of the user's choice (`reference/mesheditor/src/tools/ToolInterface.ts:6-13`). No MCP server | MCP over stdio, headless or in the editor |
| Tools sent | Every enabled tool, on every request (`reference/mesheditor/src/AIAgentService.ts:1462-1464`, `:2462`). By default that is the 20 core tools (`:123-146`, `:172`, `:1415-1426`), the code-running tool among them. The "all" preset (`:1448-1453`) sends 53: 49 `modeler_*` and 4 `cad_*`. The z-fighting tool sits behind a setting (`:1416`) | 21 headless and 22 in the editor, all generic. `describe` gives a type's schema on demand |
| Size | About 12,000 tokens for the 20 default tools, and 25,000 to 28,000 for all 53: the tools' description and parameter text divided by four, not serialised JSON. `modeler_create_sdf_mesh` alone is about 1,900 | About 1,958 headless and 2,087 in the editor. `engine/packages/mcp/test/mcp.test.mjs` holds them under 2,000 and 2,200 |
| Code execution | `modeler_execute_babylon_code` builds an `AsyncFunction` from the model's output (`reference/mesheditor/src/tools/builtin/ExecuteBabylonCodeTool.ts:237-238`) | None. Builds run under a CSP with no `unsafe-eval` |
| Agent edits and undo | Recorded like any other action | One undo step per edit, marked, shared with the person |

One tool per feature costs about six times our budget by default, and twelve to fourteen times with every tool on.
It grows with every feature. Our generic design
stands. Take the check-then-fix loop and the skill rules (candidate 5).

## Fit and risk

- **Babylon or three.js.** No Babylon code transfers as is. The candidates use Babylon only for vectors, vertex
  arrays and mesh handles. A port turns those into plain arrays or three types.
- **Determinism.** Every candidate runs at author time or in the editor, and its output is baked into a GLB. So
  `Math.sin` and wall clocks don't matter there. Two guards still apply:
  - nothing generated at load time may feed physics unless it goes through `dmath`;
  - generated or decimated files change the glTF structure, which W5's save fingerprint counts.
- **WKWebView.** No candidate needs threads. Run decimation in Node first, as a content tool. Try three's simplifier
  in the scheme origin only when the editor needs it.
- **Bundle size.**
  - The ports add a few hundred lines each.
  - Depending on mesheditor would bring in Babylon. Its npm package is 28.9 MB unpacked, and `@babylonjs/core` is
    74 MB unpacked. Those are not bundle sizes, and I didn't build either.
- **Maintenance.**
  - One maintainer, about a release a day, files up to 10,000 lines long.
  - Comments name algorithms the code doesn't implement, so read the code, not the names.
  - Port once, keep the licence text with the port, and don't track upstream.

## Recommendations

Sizes: S is about a day, M a few days. The operator approved all five on 2026-11-26; each is filed as a bridge task:
1 is AB-T-0674, 2 is AB-T-0675, 3 is AB-T-0676, 4 is AB-T-0677 and 5 is AB-T-0678.

| # | What | Lands in | Size | Approval | Why |
|---|---|---|---|---|---|
| 1 | **Decimate generated props at import.** Wrap the meshoptimizer simplifier three already ships in mesheditor's per-part guard and rollback, rewritten. A content tool first, then LOD levels for the P1 `LOD` node | `@vrmxg/model`, `content/sample/tools/` | M | Yes: the props' bytes change, and so do saves' asset fingerprints | The five TRELLIS props are 35,000 to 40,000 triangles each |
| 2 | **Coplanar-overlap check.** Port `detectZFighting` to plain arrays; report it from `game op=validate` and the content tools' checks | `@vrmxg/model`, `@vrmxg/mcp` | M | Yes: a port under Apache-2.0, and validate reports something new | Catches flicker in sets and generated items, in a form agents can act on |
| 3 | **SDF prop generator.** A JSON part list (shapes, smooth union and subtract, mirror, colour) meshed by surface nets, written fresh | `content/starter/tools/` | M | Yes: a new way to make starter content | Rounder starter items than boxes and cylinders, and easy for an agent to write |
| 4 | **Building pieces.** Walls with openings, stairs, arches, columns and roofs on three's `ExtrudeGeometry`, baked to GLB | `@vrmxg/model` (a generator), later a blockout node in the editor | M | Yes: brings a P2 item forward | Quick sets for templates and the next game |
| 5 | **Skill rules.** Plan before building, stand on Y = 0, overlap touching parts, check then fix | `skills/` (the `vrmxg` skill) | S | No | Better agent-built levels at no token cost |

### Watch, not build

- **xatlas** for lightmap UVs, once baked lighting comes (P2). mesheditor's UV report fields are a checklist for it.
- **Terrain**, if it is ever planned. It would need 16-bit or float heights and a Rapier heightfield. Take
  mesheditor's path carving and integer hash noise as ideas.
- **Shrinkwrap on `three-mesh-bvh`.** It might fit a VRMXW garment that clips the body. Unproven, so a spike if
  anything.

## Not checked

- Nothing was installed, built or run, so there are no bundle sizes, timings or quality comparisons.
- The token figure is an estimate from source text, not a measured serialisation.
- Whether Babylon's GLB export keeps `KHR_physics_rigid_bodies` and `KHR_implicit_shapes`.
- Where the decals and demo models came from, and whether the img2threejs and Inigo Quilez credits carry terms.
- Transitive dependency licences.
- How a mesh `.ply`, as opposed to a splat `.ply`, loads.
