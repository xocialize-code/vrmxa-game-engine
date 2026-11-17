// Procedural hard-edged sprite atlas (4 x 2 tiles, 128 px each) built from pixel math, so it is
// identical in Node and the browser and needs no image files. Tiles are white unless noted; the
// particle colour tints them. Edges are hard (one-pixel smoothstep): anime look, not smoke.
export const TILES = { dot: 0, star4: 1, spark: 2, flash: 3, ring: 4, line: 5, drop: 6, diamond: 7 };
export const ATLAS_COLS = 4, ATLAS_ROWS = 2, TILE = 128;

const clamp01 = (x) => Math.max(0, Math.min(1, x));
const edge = (d, px) => clamp01(0.5 - d / px); // d: signed distance in tile units (neg inside)

function shade(tile, x, y) { // x,y in [-1,1]; returns [r,g,b,a] in 0..1
  const px = 2 / TILE * 1.2;
  const r = Math.hypot(x, y);
  switch (tile) {
    case TILES.dot: return [1, 1, 1, edge(r - 0.8, px)];
    case TILES.star4: { // four-point glint: two crossed thin diamonds plus a small core
      const a = Math.abs(x), b = Math.abs(y);
      const d1 = a / 0.16 + b / 0.95 - 1, d2 = a / 0.95 + b / 0.16 - 1;
      const d = Math.min(d1, d2) * 0.16;
      return [1, 1, 1, Math.max(edge(d, px), edge(r - 0.18, px))];
    }
    case TILES.spark: { // horizontal streak: blunt head at u = 0 (x = -1), thin tail at u = 1, which is
      // how three.quarks lays a stretched billboard along the velocity
      const w = 0.26 * Math.sqrt(clamp01((1 - x) / 2)); const d = Math.abs(y) - w;
      return [1, 1, 1, edge(d, px) * edge(Math.abs(x) - 0.97, px)];
    }
    case TILES.flash: { // 8-spike starburst with uneven spike lengths
      const ang = Math.atan2(y, x);
      const k = Math.abs(Math.cos(ang * 4));
      const len = 0.42 + 0.56 * Math.pow(k, 5) * (0.6 + 0.4 * Math.abs(Math.cos(ang * 2)));
      return [1, 1, 1, edge(r - len, px)];
    }
    case TILES.ring: return [1, 1, 1, edge(Math.abs(r - 0.86) - 0.035, px)];
    case TILES.line: { // horizontal speed line, thin and tapered
      // the line fills the tile's height: the particle size sets the on-screen thickness
      const w = 0.7 * Math.sqrt(clamp01(1 - x * x)); const d = Math.abs(y) - w;
      return [1, 1, 1, edge(d, px)];
    }
    case TILES.drop: { // sweat drop: light-blue teardrop, white rim, white highlight
      const yy = y; // y is up (GL texture space): tip at the top
      const body = Math.hypot(x, yy + 0.25) - 0.55;
      const tip = Math.abs(x) - 0.55 * clamp01((0.95 - yy) / 1.2) * (yy > -0.25 ? 1 : 0) ; // cone up to the tip
      const d = Math.min(body, yy > -0.25 && yy < 0.95 ? tip : 9);
      const outer = edge(d, px), inner = edge(d + 0.09, px);
      const hl = edge(Math.hypot(x + 0.2, yy + 0.1) - 0.12, px);
      const fill = [0.55, 0.85, 1.0];
      const c = fill.map((f) => f * inner + (1 - inner) * 1);
      return [c[0] + (1 - c[0]) * hl, c[1] + (1 - c[1]) * hl, c[2] + (1 - c[2]) * hl, outer];
    }
    case TILES.diamond: { const d = (Math.abs(x) + Math.abs(y)) - 0.8; return [1, 1, 1, edge(d * 0.7, px)]; }
  }
  return [0, 0, 0, 0];
}

export function buildAtlasPixels() {
  const W = ATLAS_COLS * TILE, H = ATLAS_ROWS * TILE;
  const data = new Uint8Array(W * H * 4);
  for (let t = 0; t < ATLAS_COLS * ATLAS_ROWS; t++) {
    // three.quarks counts tiles from the top-left of the image; with flipY=false data row 0 is the
    // bottom (v = 0), so tile row r lives at data rows (ROWS - 1 - r).
    const tx = (t % ATLAS_COLS) * TILE, ty = (ATLAS_ROWS - 1 - Math.floor(t / ATLAS_COLS)) * TILE;
    for (let j = 0; j < TILE; j++) for (let i = 0; i < TILE; i++) {
      const x = ((i + 0.5) / TILE) * 2 - 1, y = ((j + 0.5) / TILE) * 2 - 1;
      const [r, g, b, a] = shade(t, x, y);
      const o = ((ty + j) * W + tx + i) * 4;
      data[o] = r * 255; data[o + 1] = g * 255; data[o + 2] = b * 255; data[o + 3] = a * 255;
    }
  }
  return { data, width: W, height: H };
}

/** One tile as its own pixel block, top row first (canvas/image order), for libraries without atlas tiling. */
export function buildTilePixels(tile, size = TILE) {
  const data = new Uint8Array(size * size * 4);
  for (let j = 0; j < size; j++) for (let i = 0; i < size; i++) {
    const [r, g, b, a] = shade(tile, ((i + 0.5) / size) * 2 - 1, ((j + 0.5) / size) * 2 - 1);
    const o = ((size - 1 - j) * size + i) * 4; data[o] = r * 255; data[o + 1] = g * 255; data[o + 2] = b * 255; data[o + 3] = a * 255;
  }
  return { data, width: size, height: size };
}

export function atlasTexture(THREE) {
  const { data, width, height } = buildAtlasPixels();
  const tex = new THREE.DataTexture(data, width, height, THREE.RGBAFormat);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.generateMipmaps = true; tex.minFilter = THREE.LinearMipmapLinearFilter; tex.magFilter = THREE.LinearFilter;
  tex.flipY = false; tex.needsUpdate = true;
  return tex;
}

/** Canvas-backed texture for a single tile (nebula's GPURenderer packs textures with a 2D canvas). */
export function tileCanvasTexture(THREE, tile, size = TILE) {
  const { data } = buildTilePixels(tile, size);
  const c = document.createElement('canvas'); c.width = size; c.height = size;
  const ctx = c.getContext('2d'); ctx.putImageData(new ImageData(new Uint8ClampedArray(data.buffer), size, size), 0, 0);
  const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace; return tex;
}
