// The sprite atlas (4 × 2 tiles, 128 px each), drawn from pixel maths so it is the same in Node and every browser and
// ships no image files (from spike-particles, AB-R-0926). Tiles are white; the particle colour tints them. Presentation:
// nothing in the simulation reads these pixels.
export const TILES = { dot: 0, puff: 1, spark: 2, flash: 3, ring: 4, line: 5, drop: 6, star: 7 };
export const ATLAS_COLS = 4, ATLAS_ROWS = 2, TILE = 128;

const clamp01 = (x) => Math.max(0, Math.min(1, x));
const edge = (d, px) => clamp01(0.5 - d / px); // d: signed distance in tile units (negative inside)

/** One pixel of a tile: x, y in [-1, 1]; [r, g, b, a] in 0…1. */
function shade(tile, x, y) {
  const px = (2 / TILE) * 1.2, r = Math.sqrt(x * x + y * y);
  switch (tile) {
    case TILES.dot: return [1, 1, 1, edge(r - 0.8, px)];
    case TILES.puff: { // a soft round puff for steam and dust: smooth falloff, a slightly lumpy rim
      const lump = 0.08 * Math.cos(5 * Math.atan2(y, x)) + 0.05 * Math.cos(9 * Math.atan2(y, x) + 1.3);
      const t = clamp01(1 - r / (0.92 + lump));
      return [1, 1, 1, t * t * (3 - 2 * t) * 0.85];
    }
    case TILES.spark: { // a streak: blunt head at x = −1, thin tail at x = 1 (how a stretched billboard lies along its velocity)
      const w = 0.26 * Math.sqrt(clamp01((1 - x) / 2)), d = Math.abs(y) - w;
      return [1, 1, 1, edge(d, px) * edge(Math.abs(x) - 0.97, px)];
    }
    case TILES.flash: { // an 8-spike starburst
      const ang = Math.atan2(y, x), k = Math.abs(Math.cos(ang * 4));
      const len = 0.42 + 0.56 * Math.pow(k, 5) * (0.6 + 0.4 * Math.abs(Math.cos(ang * 2)));
      return [1, 1, 1, edge(r - len, px)];
    }
    case TILES.ring: return [1, 1, 1, edge(Math.abs(r - 0.86) - 0.035, px)];
    case TILES.line: { const w = 0.7 * Math.sqrt(clamp01(1 - x * x)); return [1, 1, 1, edge(Math.abs(y) - w, px)]; }
    case TILES.drop: { const body = Math.sqrt(x * x + (y + 0.25) * (y + 0.25)) - 0.55; return [0.75, 0.92, 1, edge(body, px)]; }
    case TILES.star: {
      const a = Math.abs(x), b = Math.abs(y), d = Math.min(a / 0.16 + b / 0.95 - 1, a / 0.95 + b / 0.16 - 1) * 0.16;
      return [1, 1, 1, Math.max(edge(d, px), edge(r - 0.18, px))];
    }
  }
  return [0, 0, 0, 0];
}

/** The atlas as RGBA bytes, bottom row first (a DataTexture with flipY false; quarks counts tiles from the top left). */
export function atlasPixels() {
  const W = ATLAS_COLS * TILE, H = ATLAS_ROWS * TILE, data = new Uint8Array(W * H * 4);
  for (let t = 0; t < ATLAS_COLS * ATLAS_ROWS; t++) {
    const tx = (t % ATLAS_COLS) * TILE, ty = (ATLAS_ROWS - 1 - Math.floor(t / ATLAS_COLS)) * TILE;
    for (let j = 0; j < TILE; j++) for (let i = 0; i < TILE; i++) {
      const [r, g, b, a] = shade(t, ((i + 0.5) / TILE) * 2 - 1, ((j + 0.5) / TILE) * 2 - 1);
      const o = ((ty + j) * W + tx + i) * 4;
      data[o] = r * 255; data[o + 1] = g * 255; data[o + 2] = b * 255; data[o + 3] = a * 255;
    }
  }
  return { data, width: W, height: H };
}
