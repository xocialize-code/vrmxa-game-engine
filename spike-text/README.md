# spike-text

AB-T-0536: text inside the canvas, for VRMXG's speech bubbles, name tags, captions, subtitles burned into exports, and
4K title cards. The spike compares three paths on three r187, in Chromium and in a sandboxed WKWebView:

- **troika**: troika-three-text 0.53.1. It draws text from an SDF atlas and typesets with Typr.
- **slug**: three-slug 1.1.4, JSlug as published. It is a WebGL2 port of Eric Lengyel's Slug: quadratic curves and
  band lists live in textures, and the shader computes coverage per pixel. opentype.js parses the font.
- **hbslug**: our own path on JSlug's shader. HarfBuzz-wasm (harfbuzzjs 1.6.4, HarfBuzz 15.0.0) shapes the text and
  draws the outlines at the chosen weight. three-slug's curve and band builder takes those outlines, keyed by glyph
  id instead of code point, and its shader draws them.

The font is Noto Sans JP, variable (wght 100–900), with TrueType outlines (glyf + gvar).

## Verdict

**For in-world text (speech bubbles, name tags, captions) use troika-three-text now, in M3 W6.**
- It needs a seventh to an eleventh of Slug's GPU time.
- It does the shaping you need for Japanese and Latin, and it has outlines for captions.
- Its frames are bit-identical across Chromium and WKWebView, over both origins, run after run.
- Its worker runs inside the shell's scheme origin.

Three conditions for using it:
- **Ship static Regular and Bold instances of Noto Sans JP.** A variable font renders only its default instance, and
  for this font that is Thin (wght 100).
- **Set `unicodeFontsURL` to a local path.** Otherwise a missing glyph fetches a fallback font from a CDN.
- **Sync the texts of an export one after another.** The atlas layout follows the order in which asynchronous
  typesetting results arrive. No run here varied, but an export shouldn't depend on that.

**For 4K title cards, and later for all text, build our own renderer on Slug.** It would combine three things:
- HarfBuzz-wasm for shaping, outlines at any weight, vertical text and features;
- curve and band data built from those outlines, keyed by glyph id;
- a shader ported from Lengyel's MIT reference shaders (https://github.com/EricLengyel/Slug).

Don't use JSlug as published. It has three faults (details under "Findings"):
- It draws tofu for common kanji.
- Its shader drops thin strokes at subtitle sizes.
- It keys glyphs by code point, so shaped output can't reach it.

The hbslug path shows what the replacement looks like: its 4K title card is exact at any size, renders bold from the
variable font, and is bit-identical everywhere.

The Slug renderer is the one to port to WebGPU. Its shader is one fragment function plus instanced quads, and r187's
TSL has every operation it uses (2–3 days). troika is GLSL-only and deeply tied to WebGL: a forked port is 3–5 days.

Until our renderer exists, title cards can use troika too, with `sdfGlyphSize` 64. At 230 px glyphs, the stroke ends
show slight SDF lumps, which 128 doesn't fix.

Receipts: AB-R-1023 (troika-three-text 0.53.1), AB-R-1024 (three-slug 1.1.4), AB-R-1025 (harfbuzzjs 1.6.4 and the hbslug path). Lesson AB-L-0368 (variable fonts render their default instance).

## Findings (Mac Studio M5 Max, Chromium 156 / ANGLE Metal, WKWebView macOS 27; Release builds)

### 4K title-card frames, hashed (FNV-1a of the RGBA8 read-back, as `@vrmxg/export`)

Each run draws the frame twice, then rebuilds everything (a new renderer and new text) and draws it twice more. Every
case ran twice in a row in each runtime: in Chromium, and in WKWebView over the scheme origin and over loopback. That
gives 6 runs and 24 frames per library.

| Path | Frame hash, every run in every runtime | Identical everywhere |
|---|---|---|
| troika, GPU-generated SDF (the default) | `a5647fbd1827be4e` | **yes** |
| troika, JS-generated SDF (`gpuAccelerateSDF=false`) | `a5647fbd1827be4e` | **yes** |
| troika, `sdfGlyphSize` 128 | `1ad37fc6357ac823` | **yes** |
| slug (three-slug) | `52f64758d9b05751` | **yes** |
| hbslug, wght 700 | `7193bec3f938c51f` | **yes** |

troika's two SDF generators give different atlases (`5727a372…` from the GPU, `25904d72…` from JS). Each atlas is the
same in every runtime, and both give the same title frame. The prior WebGL cafe frames differed between engines
(spike-webgpu-render, gotcha 10). These text frames don't: both engines compile WebGL through ANGLE to Metal on the
same GPU. A different Mac's GPU may give different bytes, but the shell exports in one engine, so exports repeat.

### Frame cost

The cost is a frame with the text minus the same frame without it. Two measurements agree:
- **back-to-back**: 60 frames with one sync at the end, the median of 6 rounds;
- **synced**: a sync after every frame, the median of 120. Its resolution is 0.1 ms in Chromium and 0.02 ms in
  WKWebView over loopback.

Chromium's `EXT_disjoint_timer_query_webgl2` on ANGLE Metal gave 5 to 14 ms for the same 1 ms frame, so those
figures aren't used. WebKit has no timer query. The table shows back-to-back / synced, in ms:

| Case | troika | slug | hbslug (wght 700) |
|---|---|---|---|
| Title card, 4K, 89 glyphs (Chromium / WKWebView) | 0.013 / 0.011 | 0.15 / 0.13 | 0.16 / 0.14 |
| Two glyphs filling a 4K frame (worst case per pixel) | 0.105 / 0.104 | 0.86 / 0.85 | 1.00 / 0.97 |
| 2,000 glyphs, 1080p, 22 px | 0.089 / 0.10 | 0.63 / 0.43 | 0.62 / 0.40 |
| 2,000 glyphs, 4K, 44 px | 0.12 / 0.13 | 0.95 / 0.77 | 0.98 / 0.70 |

Slug costs 7–11 times what troika does, because it loops over curves where troika takes one texture sample. Both
stay well under a millisecond for anything a scene shows. The weight barely matters: hbslug at wght 100 costs about
what three-slug does.

### Japanese TrueType font

The file is 9,589,900 bytes, with 17,936 glyphs and 16,732 code points. Its tables include glyf, gvar, HVAR, GSUB and
GPOS. The fvar default is wght 100.

| Path | 3,000-character set | Whole font |
|---|---|---|
| slug | 2,941 glyphs (59 lost, see below), 11.8 MB of textures (4.1 MB curves RGBA32F + 7.7 MB bands RG32UI), 127–155 ms | 16,089 glyphs (1,847 have no `unicode` in opentype.js and are skipped), 75.5 MB, 0.63–0.79 s |
| hbslug, wght 400 | 2,999 glyphs, 11.4 MB, 160–171 ms (78 ms of it outlines) | **all 17,936 glyphs**, 80.0 MB, 1.0–1.3 s (0.5–0.6 s outlines) |
| troika, SDF 64 | 2,998 glyphs, a 2048×2048 RGBA8 atlas (16.8 MB), 365–625 ms | not tried: about 133 rows of 64 px, so a 2048×16384 atlas (134 MB) |

- The 3,000-character set is printable ASCII, CJK punctuation, kana and full-width forms, then ideographs in
  code-point order up to 3,000. It is not ordered by frequency.
- Everything builds and renders in both engines. A 312-glyph sample hashes the same in Chromium and WKWebView for each
  path: slug `6d8ee279…`, hbslug `db7d724c…`, troika `531bffaa…`.
- No glyph has cubic curves. The TrueType font avoids JSlug's quadratic-only limit. A CFF/OTF Japanese font wouldn't.
- three-slug stores band entries as 32-bit pairs. The reference format packs them in 16 bits, which would halve the
  bands texture.
- A real scene builds only the glyphs it uses. The title card needs 59–61 glyphs, about 160 KB, built in 7–35 ms.

### HarfBuzz-wasm, single-threaded

harfbuzzjs is a single-threaded Emscripten build: it has no pthreads and doesn't need `SharedArrayBuffer`. The
shell's scheme origin reports `crossOriginIsolated: true` but has no `SharedArrayBuffer`, as AB-L-0346 says, and
HarfBuzz runs there unchanged.

| | Chromium | WKWebView scheme | WKWebView loopback |
|---|---|---|---|
| wasm load | 5–8 ms | 6–9 ms | 7–8 ms |
| shape 2,000 glyphs | 0.3 ms | <1 ms (the timer resolves 1 ms) | 0.26 ms |
| glyph ids + positions hash | `864f5ac7a082fcd6` | same | same |

The hash covers glyph id, cluster, advances and offsets.

HarfBuzz returns positioned glyph ids that the hbslug path draws directly. It also gives:
- **GPOS kerning:** "AVATAR To" is 4,620 units wide against 4,795 with `-kern`.
- **`palt`** (proportional CJK punctuation): 「はじまり」、喫茶店。 shrinks from 11,000 to 8,628 units.
- **Vertical text** (`TTB`): 4 of 7 glyphs become their vertical forms, with no cmap entry, which a code-point keyed
  renderer can't reach. The run advances −7,000 in y.
- **Variations:** "Café 喫茶" is 4,170 / 4,290 / 4,410 / 4,477 units wide at wght 100 / 400 / 700 / 900, and
  `glyphToPath` returns the outlines at that weight.

harfbuzzjs 1.6.4 also ships `harfbuzz-subset.wasm`, but it has no JavaScript wrapper. Instancing static TTFs from the
variable font is better done offline.

### Faults found in three-slug 1.1.4

1. **Tofu for common kanji.** three-slug maps code points through opentype.js's single `glyph.unicode`. Ideographs
   whose glyph is shared with a Kangxi radical or a compatibility code point therefore fall back to .notdef: 一, 文,
   入, 八, 儿, 冂 and 冖, and also the ideographic space U+3000. See `results/shots/chromium-title-slug-4k.png` and
   `chromium-font-slug.png`.
2. **Thin strokes vanish at subtitle sizes.** At 22 px, ー and 一 disappear in the Thin weight. It isn't the data:
   hbslug at wght 100 (`chromium-dense-hbslug-w100-1080p.png`) drops them the same way, and at wght 700 they draw.
   The shader doesn't dilate the quads, so a stroke thinner than a pixel can miss every pixel centre. It also measures
   anti-aliasing in units of the glyph's box rather than the em, and clamps it to between 1 and 200 pixels, so very
   flat glyphs and glyphs larger than 200 px are wrong. Lengyel's reference shaders dilate the quads and work in em
   space.
3. **It keys glyphs by code point and lays out by advance width only.** It has no kerning, no features, no vertical
   forms and no shaping. A missing code point draws .notdef rather than nothing.
4. **It has no outline or stroke** for burned-in subtitles. The spike puts a translucent box behind the caption
   instead.
5. **Its licence is unclear.** The npm tarball has no LICENSE file, and package.json says ISC. The review read MIT and
   Apache-2.0 on GitHub. Our own renderer should be written fresh against Lengyel's MIT code and keep his notice. The
   patent is in the public domain (2026-03-17, per the review).

### troika notes

- It renders the variable font's default instance (Thin). Typr ignores gvar.
- Its typesetter narrows CJK punctuation on its own: compare the caption crops.
- Its worker typesets fine over the `vrmxg-spike://` scheme origin. The 9.6 MB font loads and parses in its worker in 8–10 ms there, and in 12–15 ms over loopback and in Chromium.
- At 4K, stroke ends of 230 px glyphs show SDF lumps, at `sdfGlyphSize` 64 and 128 alike
  (`chromium-crop-title-troika-*.png`). Slug's are exact.
- `configureTextBuilder` works only before the first text. Call it once, at startup.

### What VRMXG needs it for

- **Subtitles burned into exports.** Every path draws deterministically, so a burned-in subtitle exports as exactly as
  the scene does.
  - troika is the practical choice today: outlines, shaping, a light cost, and clean 22 px text at 1080p
    (`chromium-dense-troika-1080p.png`).
  - Slug needs the dilation fix before it can be trusted at that size.
  - Keep the `.srt` sidecar either way.
- **Speech bubbles and name tags** (billboards that face the camera, readable at 1080p and 4K). troika is a `Mesh`
  that a billboard rotates each frame. The SDF holds up under minification and costs little.
  - Slug is exact when magnified, but without dilation it can drop strokes when minified.
  - This is judged from the 2D measurements above. The spike drew no 3D billboard.
- **4K title cards.** Exact edges and real bold weights from the variable font call for hbslug. troika is acceptable
  meanwhile (Thin until static weights ship, slight SDF lumps).

### WebGPU / TSL port effort

- **Slug, our own:** the fragment function is about 100 lines: texel fetches from a float and an unsigned-integer
  texture, uint shifts and masks, two loops over curves, `dFdx`/`dFdy`, and flat varyings. r187's TSL has each of these
  (`textureLoad`, `Loop`, `bitAnd`/`shiftRight`, `dFdx`/`fwidth`, `varying(...).setInterpolation('flat')`, and integer
  textures in both the WGSL and GLSL builders). The vertex side is instanced quads with dilation. Estimate 2–3 days,
  including a `NodeMaterial` that works on both backends.
- **troika:** its material is a `createDerivedMaterial` string injection over a built-in material, plus its vertex
  logic (glyph bounds from a texture) and its SDF and outline sampling. It's a GLSL-only library, so a port is a fork
  of a few hundred lines of shader and material code. Its SDF generator can stay as it is (a canvas texture producer).
  Estimate 3–5 days, and we would own the fork.
- **three-msdf-text-utils 1.5.0 (ISC)** already has a WebGPU node material. MSDF needs atlases generated offline,
  though, and a Japanese atlas big enough for free text is large and fixed. It's worth knowing about for Latin-only
  UI, not for VRMXG's dialogue. It isn't in this spike: it wasn't on the approved download list.

## Run it

```bash
fonts/fetch.sh                                          # Noto Sans JP variable TTF (9.6 MB, git-ignored) + OFL.txt
cd web && npm install --legacy-peer-deps --ignore-scripts   # the three libraries; three r187 and vite come from the repo root
npm run build                                           # vite build → web/dist (the font is copied in)
node scripts/chromium.mjs 'mode=title&lib=hbslug' title-hbslug   # Chromium → ../results/chromium-<name>.json, ../results/shots/
../mac/scripts/build.sh                                 # vite build + swiftc -O → mac/build/TextSpike.app (ad hoc, sandboxed)
../mac/scripts/run.sh                                   # every default case (main.swift), scheme + loopback, fresh web view each
RUN=2 SPIKE_CASES='mode=title&lib=slug;mode=hb' ../mac/scripts/run.sh   # a second run, JSON suffixed -run2
node scripts/summary.mjs                                # ../results/summary.json
```

Cases, set by query string:
- `mode=title|bench|font|hb`
- `lib=troika|slug|hbslug`
- `sdf=js`: troika generates its SDF in JS
- `sdfSize=128`: troika's glyph SDF size
- `worker=0`: troika typesets on the main thread
- `wght=100…900`: hbslug's weight
- `w`, `h`: the title card's size

Timings come from loopback in a fresh `WKWebView` per case (AB-L-0346). Title hashes and HarfBuzz ran over both
origins.

## Files

- `web/src/libs.js`: the three paths behind one `build(items)` interface.
- `web/src/content.js`: the title card, the full-frame fill, the 2,000-glyph block and the 3,000-character set. The
  text is original.
- `web/src/main.js`: the modes, read-back and hashing, and timing.
- `mac/`: the wrapper from `spike-webgpu-render/mac` (originally spike-physics), renamed TextSpike, with `font/ttf`
  added to the scheme handler.
- `fonts/`: `fetch.sh`, which fetches the font, and `OFL.txt`. The TTF is git-ignored.
  - Source: google/fonts, `ofl/notosansjp/NotoSansJP[wght].ttf`, fetched 2026-11-19.
  - sha256: `c2f3b4d463500a2ddcd3849cded1fceeb9fd6d1c32e6cbecd568453ba50fc68f`.
  - Licence: SIL Open Font License 1.1. Copyright 2014–2021 Adobe, with Reserved Font Name "Source".
- `results/`: raw JSON per case and runtime, `summary.json`, and `shots/`.
  - Shots are Chromium's, because WKWebView's frames hash the same; one WKWebView title is kept as a check.
  - Title cards are downscaled to 1920×1080. The crops are 1:1 at 4K.
