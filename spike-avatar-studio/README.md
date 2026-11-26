# Spike: moving the Avatar Studio onto the engine

*2026-11-19. The question: what would it take to move VRMXA Avatar Studio (`../vrmxa-avatar-studio`) onto VRMXG, so
that we can make the `.vrmxa` characters M4 casts ([M4-PLAN.md](../M4-PLAN.md), checks 2 and 12)?*

## The UI (added 2026-11-19, after the operator's correction)

The question was about the studio's **UI**, not what it can do underneath. The library, its CLI and the studio's
command registry (`app/src/probe/commands.js`, about 123 commands, the "one path" its PRD's MCP-3 asks for) can build
a character already (below). The question is whether a person can, by hand.

**Walking through it** (the studio's dev server, `New character`, 1440×900):
- Face and Body are finished and polished: shape sliders, head shapes, colours, a live stage with undo.
- **Then there is nothing to put on her.** Hair and the closet both start empty ("The closet is empty. Add an item
  (.vrmxw) to put it on."). Every hair piece and garment has to come from a `.vrmxw` file the person already has, or
  from "Import a VRM". Home's library of characters and items is designed but still demo data (`app/src/demo/library.js`).
- Hair by hand means drawing strokes one at a time from a blank head. Hair locks (the `hair-locks` package, 2,470 lines,
  isn't wired in) and hair from a picture are "Coming later".
- Eye states and mouth states, Make with Gaea (an item from a picture), and the agent drawer are "Coming later". Item
  Material and Paint have no screen.

**The UI gaps, in the order that gets a person to a usable character:**

| # | Gap | Size | Notes |
|---|---|---|---|
| U1 | **A real library:** characters and items on Home, and pickers in Hair and Closet, read from a library folder and seeded with a starter wardrobe and hair pieces | M, plus the content | The minimum: with U1 and a starter set, a person can make a dressed character by hand. The content is the same need as before (licensed pieces from the importer, or Gaea) |
| U2 | **The MCP server and the agent drawer** (PRD §16.1, MCP-1 to MCP-11) | S–M | The registry is already the one path. The engine's pattern carries over: `vrmxg-mcp --editor` on loopback, the page polls it and runs each call through the same commands, and each edit lands on the app's undo marked as the agent's (`apps/editor/src/mcp.js`, `engine/packages/mcp`) |
| U3 | Hair locks: wire `hair-locks` into the Locks tab | M | Much faster than strokes for anime hair |
| U4 | Item Material and Paint: recolour and repaint worn items | M | Variety from a small wardrobe |
| U5 | Eye and mouth states (EYE, MTH) | M–L | Layered eye and mouth art; the 14 VRM expressions cover M4 until then |
| U6 | Make with Gaea: an item from a picture | L | Waits on Gaea's pipelines; the biggest lever on content later |

**Does moving onto the engine close them?** No. The studio's UI is Vue 3.5 on three r187, the same stack as the
engine's apps, so the screens would move across unchanged and the gaps would move with them. Only U2 gets cheaper with
the engine: its MCP plumbing exists and works (AB-R-1027). The shell (step 1 below) and the stage (step 2) bring a
shared Mac app and the game's look, not the missing screens.

**So:** close U1 and U2 in the studio first. A library with a starter wardrobe lets a person make a character by hand,
and MCP lets an agent do the same through the same commands. Take U3 to U6 as the studio's own phases. The move onto
the engine stays a later, separate step.

## Verdict on the move

**The studio doesn't have to move for M4: it can already make characters the engine plays. What M4 lacks is characters
worth casting, which means content (hair and clothes) and a voice the engine can speak with. Do those first, in the
studio as it is. Then move it onto the engine in two cheap steps that M4 builds anyway:**
1. the shell's document features, which the anime creator's Mac app needs too (M4 W5);
2. the WebGPU render host (M4 W0), which the studio's stage can then use.

What was measured:
- **The studio's tool makes a character headlessly** (`scripts/build-character.sh`, about 6 s). Starting from the
  specification's minimal fixture, it applies body and face edits, adds and wears a hair piece, a fitted top and
  fitted trousers, adds the 30 starter clips in 3 sets, imports a persona card and sets the details. The result,
  "Aiko", passes `vrmxa validate` with 0 errors, 0 warnings and 0 notes.
- **The engine casts her as she is** (`scripts/cast.mjs`, `results/cast-*.json`). In Mira's place in the cafe, acceptance
  check 3's walk works:
  - she idles, walks, runs to 4 m/s and jumps 1.02 m (fall/idle/jump/land/move);
  - her worn tags (`top:fitted`, `bottoms:fitted`) pick her animation sets;
  - her own clips add 11 slots to the cafe's 24 (sprint, sneak, strafe, dance, hit, roll and more);
  - a snapshot re-runs exactly, and a rebuilt Aiko gives the same final hash (237165fd692725f8).
- **The studio's live edits drive the engine's character** (`scripts/live.mjs`, `results/live-edits.json`). vrmxa-core's
  `createLiveEdits` on the engine's own `Character.vrm` applies a body and face edit in 9.6 ms (bone inverses change, as
  in the studio). So a studio stage built on the engine can keep its live editing.

Not measured: how Aiko looks. Only fixture items exist to dress her in (below), so a picture would show the
specification's test pieces, not a character.

## What the studio already does

Phases 0–8 are built (studio PRD §21; `Docs/RELEASE-PLAN-0.1.md`). A notarized `0.1.0-preview.1` is waiting on its hand
test, and `main` has moved on since (VRMXA 0.35, Quick Look). What it covers:
- face (about 20 shapes, head shapes, iris, 8 colour roles), body (17 sliders and presets);
- hair, as a piece or drawn strokes;
- the closet: items, outfits, states, `.vrmxw`, the importer, Spec-fit;
- animation sets: 30 starter clips, a checker, corrections;
- voice (Gaea, ZONOS3 on MLX), persona (VRMXA §10.1 with character cards), details and licences;
- save with a thumbnail and measurements.

The app is Vue 3 on Vite 8, with three r187 and three-vrm 3.5.5 pinned exactly, and vrmxa-core by a source alias:
11,470 lines in `app/src`. The Mac app is a hand-built Xcode app of about 1,940 Swift lines, with two Quick Look
extensions.

**Missing for characters M4 can cast:**

| Gap | Today | Needed for M4? |
|---|---|---|
| **Hair and clothes to dress a character in** | The release ships only Spec and the starter motions (`RELEASE-PLAN-0.1.md:45`). The only items are the specification's fixtures and the studio's test samples. A wardrobe comes from the importer (another VRM's pieces, licence permitting) or from the Make screen, which is "Coming later" | **Yes: this is the gap.** Two cast characters that don't look like test pieces |
| **A voice the engine can use** | In VRMXA, `voice_id` names a voice in the bundle: reference clips the studio clones with ZONOS3. The engine's shell speaks Kokoro presets (`af_heart` …). Aiko's persona says "voice none" | **Yes.** Either the shell gets ZONOS3 (the studio's `Zonos3Speech.swift` moved into `apps/shell/Voice`), or VRMXA gains a preset voice the engine maps to Kokoro. The second is a spec question for the VRMXA spec's owner |
| Eye and mouth states, custom expressions | "Coming later". Spec carries VRM's 14 expressions; custom ones wait on the spec (G12) | No: the 14 cover M4's emotions and visemes |
| Drawn hair swinging in the saved model | It sways on the studio's stage only | No: hair pieces swing |
| Item material and paint, shoes by Spec-fit | Not built | No |
| The engine's sample cast on VRMXA 0.35 | The engine still ships the 0.34 fixtures as Mira and Hana | Yes, when M4's content is made (W12) |

## Costing the move

| Step | What it means | Size | What it gives | What it costs |
|---|---|---|---|---|
| **0. Interop** (today) | The studio writes; the engine reads. Proven above | none | Characters for the engine now | Nothing |
| **1. The shell** | The studio's Mac app on `apps/shell` instead of its own Xcode app | L, 1–2 weeks; most of it is M4 W5 work | One shell for every app; the studio's ZONOS3 voice becomes the engine's (it fills the voice gap) | The shell needs about 12 document-app features (below). SwiftPM can't build a Quick Look `.appex`, so the extensions stay an Xcode target that embeds the shell's app. The Gaea proxy and streamed speech need GET routes |
| **2. The stage** | `app/src/stage/engine.js` (633 lines) replaced by the engine's `RenderHost` and `Character`, as the companion consumes them (by path, no copies) | M, about a week, after M4 W0 | The studio looks exactly like the game (WebGPU, the post stack, the same MToon patch). "Try her in the cafe" becomes a mode, not an export | Thumbnails go through `@vrmxg/export`. The Quick Look viewer carries the engine. It goes against the studio PRD's "three.js unmodified" and "a plain-browser reference" (ENV-1, ENV-7, REF-1), so the engine's stage must stay optional for the web build |
| 3. One repository | The studio as `apps/studio` in this repo | not recommended | — | The studio is the VRMXA reference app, with its own release and its own library (AB-D-0249). Merging would tie the format's reference to the engine's cadence |

**The shell features step 1 needs** (from the wrapper comparison; the creator's Mac app needs most of them too):
- opening from Finder or the Dock, held until the page is ready;
- shared document-type declarations (`.vrmxa`, `.vrmxw`, `.vrm`);
- a recents list with bookmarks and the Dock menu;
- the unsaved-changes sheet on quit, close and replace;
- `<a download>` as a save panel;
- JS alert and confirm;
- a navigation policy (external links open in the browser);
- menus set per app (New, a Notices window);
- native → page calls with a reply;
- GET and streamed routes (the Gaea proxy, speech);
- reading files off the main thread (models are 11–19 MB);
- a ZONOS3 backend in Voice;
- an optional read-only model-store exception;
- an optional probe product;
- a shared release script with extension checks.

## Recommendation

1. **Now, in the studio as it is:** finish and tag `0.1.0-preview.1`. Then work on content and voice:
   - dress two characters for M4 from licensed sources: the importer on VRoid Hub models whose licence allows it
     (the licence filter from AB-T-0553's sample), and Gaea for what can be generated;
   - settle the voice: ask the VRMXA spec owner whether a persona may name a preset voice. Either way, plan ZONOS3 for
     the shell.
2. **M4 W5 builds the shell's document features** for the creator's Mac app, and the studio moves onto the shell then
   (step 1), keeping its Quick Look extensions in Xcode.
3. **After M4 W0, the studio's stage moves onto the engine's render host** (step 2), behind a switch so the web build
   still runs on plain three.js.
4. **The studio gets a bridge area and a `CLAUDE.md` contract.** It has neither, so asks about it have nowhere to go.

## Run it

```sh
spike-avatar-studio/scripts/build-character.sh                 # → spike-avatar-studio/out/aiko.vrmxa (git-ignored)
node spike-avatar-studio/scripts/cast.mjs spike-avatar-studio/out/aiko.vrmxa   # the walk with Aiko as Mira
node spike-avatar-studio/scripts/cast.mjs                       # the same with the sample's Mira
node spike-avatar-studio/scripts/live.mjs                       # the studio's live edits on the engine's character
```

They need `vrmxa-core`, `vrmxa-avatar-studio` (`build-character.sh` takes its sample items) and `VRMXA_Specification` beside this
repository.
