---
title: "delivery.json"
description: "What a delivery folder holds, the render queue's presets, and the manifest that names every file with its hash."
order: 80
---

# delivery.json

> Generated from `@vrmxg/editor-core` (presets), `@vrmxg/export` (`deliveryFiles`) and `apps/creator/src/delivery.js` by `scripts/docs-reference.mjs`. Don't edit it: change the code and run `npm run docs:reference`.

A delivery is a folder the creator's render queue writes into the open project: the film with its sound, subtitles,
a still and a thumbnail per shot, a turntable per character, and `delivery.json`, which names every file with its
hash. The folder is `deliveries/<name>/`.

## Presets

A job is queued at a preset. The film presets render the film alone; the delivery presets write the folder.

| Preset | Label | Size | Frame rate | Codec | Extras | Redraw check |
|---|---|---|---|---|---|---|
| `draft` | Draft 720p H.264 | 720p (1280×720) | the sequence's | H.264 (.mp4) |  |  |
| `review` | Review 1080p H.264 | 1080p (1920×1080) | the sequence's | H.264 (.mp4) |  |  |
| `master` | Master 1080p ProRes 4444 | 1080p (1920×1080) | the sequence's | ProRes 4444 (.mov) |  |  |
| `h264-1080p24` | Delivery 1080p24 H.264 | 1080p (1920×1080) | 24 | H.264 (.mp4) | stills, thumbnails, turntable | on WebGPU |
| `h264-4k24` | Delivery 4K24 H.264 | 4k (3840×2160) | 24 | H.264 (.mp4) | stills, thumbnails, turntable | on WebGPU |
| `hevc-1080p24` | Delivery 1080p24 HEVC | 1080p (1920×1080) | 24 | HEVC (.mp4) | stills, thumbnails, turntable | on WebGPU |
| `hevc-4k24` | Delivery 4K24 HEVC | 4k (3840×2160) | 24 | HEVC (.mp4) | stills, thumbnails, turntable | on WebGPU |
| `prores-1080p24` | Delivery 1080p24 ProRes 4444 with alpha | 1080p (1920×1080) | 24 | ProRes 4444 (.mov) | stills, thumbnails, turntable | on WebGPU |
| `prores-4k24` | Delivery 4K24 ProRes 4444 with alpha | 4k (3840×2160) | 24 | ProRes 4444 (.mov) | stills, thumbnails, turntable | on WebGPU |

Every preset renders with sound and subtitles. A job's state is one of `queued`, `running`, `done`, `failed`, `cancelled`.

## The folder

For a job named `the-order-1080p24-h264`, with two shots and two characters:

```json
{
  "dir": "deliveries/the-order-1080p24-h264",
  "film": "deliveries/the-order-1080p24-h264/the-order-1080p24-h264.mp4",
  "subtitles": "deliveries/the-order-1080p24-h264/the-order-1080p24-h264.srt",
  "stills": [
    "deliveries/the-order-1080p24-h264/stills/the-order-1080p24-h264-s010.png",
    "deliveries/the-order-1080p24-h264/stills/the-order-1080p24-h264-s020.png"
  ],
  "thumbnails": [
    "deliveries/the-order-1080p24-h264/thumbnails/the-order-1080p24-h264-s010.png",
    "deliveries/the-order-1080p24-h264/thumbnails/the-order-1080p24-h264-s020.png"
  ],
  "turntables": [
    "deliveries/the-order-1080p24-h264/turntables/the-order-1080p24-h264-hana-1.mp4",
    "deliveries/the-order-1080p24-h264/turntables/the-order-1080p24-h264-mira.mp4"
  ],
  "manifest": "deliveries/the-order-1080p24-h264/delivery.json"
}
```

## delivery.json

| Field | What |
|---|---|
| `format` | Always `"vrmxg-delivery"`. |
| `version` | Always `1`. |
| `short` | The short's id. |
| `title` | Its title, or null. |
| `preset` | The preset the job was queued at (below), or null. |
| `size` | The frame size, `[width, height]` in pixels. |
| `fps` | The frame rate as a fraction, `[numerator, denominator]`. |
| `codec` | The codec's key (below). |
| `backend` | The renderer that drew the film: `webgpu` or `webgl`. |
| `check` | The redraw check the job ran with: `redraw` (each frame drawn twice and compared) or null. |
| `film` | The film: its path, frame count, a digest of every frame's hash, the sound's hash, timings, the check's counts, and whether it was written to disk. |
| `subtitles` | The `.srt`: its path, line count and hash; null when the film has none. |
| `stills` | One entry per shot: the shot's middle frame as a PNG at the delivery size, kept from the film's own frames. |
| `thumbnails` | The same frames boxed down to 480×270. |
| `turntables` | One entry per character: a movie of the camera going once round the character alone. |
| `ms` | Milliseconds spent on the film, the stills, the turntables and in total. |

**A still or a thumbnail**

| Field | What |
|---|---|
| `shot` | The shot's id. |
| `frame` | The frame of the film it is. |
| `path` | Its path under the project. |
| `bytes` | The file's size. |
| `hash` | FNV-1a over the file's bytes, 8 hex digits. |

**A turntable**

| Field | What |
|---|---|
| `character` | The character's node id. |
| `path` | Its path under the project. |
| `frames` | Frame count. |
| `seconds` | Length. |
| `frameDigest` | A digest of every frame's hash. |
| `framing` | The orbit: its centre, radius and starting angle. |
| `ms` | Timings. |
| `check` | The redraw check's counts. |
| `written` | Whether it was written to disk. |

The format has no schema yet. This is the code that writes it, quoted from `apps/creator/src/delivery.js`:

```js
const manifest = {
  format: 'vrmxg-delivery', version: 1, short: spec.short, title: spec.title ?? null, preset: spec.preset ?? null,
  size: [width, height], fps: [rate.num, rate.den], codec: spec.codec, backend: film.backend, check,
  film: { path: files.film, frames: film.frames, frameDigest: film.hashesDigest, audioHash: film.audioHash ?? null, ms: film.ms ?? null, perFrameMs: film.perFrameMs ?? null, check: film.check ?? null, written: toDisk },
  subtitles: film.subs ? { path: files.subtitles, lines: film.subs.lines, hash: film.subs.text ? hashBytes(new TextEncoder().encode(film.subs.text)) : null } : null,
  stills: [], thumbnails: [], turntables: [], ms: { film: Math.round(tFilm) },
};
manifest.stills.push({ shot: picks[i].shot, frame: picks[i].n, path: files.stills[i], bytes: k.still.length, hash: hashBytes(k.still) });
manifest.thumbnails.push({ shot: picks[i].shot, frame: picks[i].n, path: files.thumbnails[i], bytes: k.thumb.length, hash: hashBytes(k.thumb) });
manifest.turntables.push({ character: id, path, frames: r.frames, seconds: r.seconds, frameDigest: digestOf(hashes), framing: { center: framing.center.map((v) => +v.toFixed(4)), radius: +framing.radius.toFixed(4), start: +framing.start.toFixed(4) }, ms: r.ms, check: r.check, written: toDisk });
```
