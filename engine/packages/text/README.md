# @vrmxg/text

M3 W6 (AB-T-0545). Text inside the canvas: speech bubbles and name tags in the world, drawn with troika-three-text
0.53.1. That was the text spike's verdict (AB-T-0536, `spike-text/`): a seventh to an eleventh of Slug's GPU time,
shaping for Japanese and Latin, and frames bit-identical in Chromium and WKWebView. Our own HarfBuzz + Slug renderer
comes later, for 4K title cards and WebGPU.

```js
import { TextLayer } from '@vrmxg/text';
const text = new TextLayer({ font: 'fonts/NotoSansJP-Regular.ttf', bold: 'fonts/NotoSansJP-Bold.ttf', unicodeFontsURL: 'fonts/' }).attach(host);
text.bubbles = true; text.nameTags = false;
```

**It is presentation.**
- It reads the world: the voice service's captions, the brains' director flags and the characters' heads.
- It writes nothing back. Its group hangs in the render host's scene, outside the tree, so world hashes never see it.
- The render host updates it as each frame is presented, with the blend applied (`host.overlays`).
- An offline frame (`frameAt`) waits for its typesetting (`settle()`), so an export never depends on when a glyph
  atlas finished.

**Speech bubbles:**
- Each line being said shows on a rounded card with a tail, over the speaker's head, facing the camera.
- Spoken words are in ink and the rest are dim, with the line's punctuation kept.
- A character whose director is waiting on the model shows "…".
- They draw over the scene (no depth test). They scale with distance between 1× and 1.5×.
- A speaker out of view gets no bubble; the caption still says the line.

**Name tags:** outlined names above the characters (`nameTags`), hidden while that character speaks.

The spike's conditions are kept:
- static Regular and Bold fonts (`content/sample/fonts/`, made by `tools/make-fonts.py`). A variable font renders only
  its default instance, which is Thin for Noto Sans JP (AB-L-0368);
- a local `unicodeFontsURL`, so a missing glyph never fetches a fallback font from a CDN;
- typesetting settled before an offline frame draws.

The sample's fonts are subset to Latin, kana and punctuation (about 290 KB each). `make-fonts.py --cjk` keeps every
kanji, at about 5 MB each, for a local build.

Checked in headless Chromium by `acceptance/m3/dialogue-chromium.mjs`:
- the bubble shows "…" then the line;
- a frame with a bubble hashes the same drawn twice and on another load;
- the world hashes the same with the bubbles on and off.

Not yet:
- subtitles burned into exports (exports carry an `.srt`), and title cards;
- a WebGPU path (troika is GLSL-only: a port is 3–5 days, per the spike).
