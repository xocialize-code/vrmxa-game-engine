// The view cube (M5 W5, AB-T-0604): the six axis ends drawn in a corner of the viewport, turned as the edit camera
// turns; click one to look along it. It is page content (buttons over an SVG), not something rendered, so it is the
// same on WebGPU and WebGL, never in a frame, and each end is a button with a name (AppProbe can press "View from top").
// Its maths are plain functions tested in Node. Modelled on PlayCanvas's ViewCube (engine/src/extras/gizmo/view-cube.js);
// written here for three's camera and camera-controls, no code taken from it.

/** The six ends: axis, the label drawn, the accessible name, and the colour. */
export const ENDS = [
  { id: 'px', axis: [1, 0, 0], label: 'X', name: 'View from the right (+X)', color: '#e5484d' },
  { id: 'nx', axis: [-1, 0, 0], label: '', name: 'View from the left (−X)', color: '#e5484d' },
  { id: 'py', axis: [0, 1, 0], label: 'Y', name: 'View from the top (+Y)', color: '#46a758' },
  { id: 'ny', axis: [0, -1, 0], label: '', name: 'View from below (−Y)', color: '#46a758' },
  { id: 'pz', axis: [0, 0, 1], label: 'Z', name: 'View from the front (+Z)', color: '#3e63dd' },
  { id: 'nz', axis: [0, 0, -1], label: '', name: 'View from the back (−Z)', color: '#3e63dd' },
];

/** Rotate v by the inverse of quaternion q ([x, y, z, w]): a world direction into the camera's frame. */
export function intoCamera(q, v) {
  const [x, y, z, w] = [-q[0], -q[1], -q[2], q[3]];
  // v' = q* v q (t = 2 (q.xyz × v); v' = v + w t + q.xyz × t)
  const tx = 2 * (y * v[2] - z * v[1]), ty = 2 * (z * v[0] - x * v[2]), tz = 2 * (x * v[1] - y * v[0]);
  return [v[0] + w * tx + (y * tz - z * ty), v[1] + w * ty + (z * tx - x * tz), v[2] + w * tz + (x * ty - y * tx)];
}

/**
 * Where each end sits: [{ ...end, x, y, depth }], x right and y down in -1…1 of the cube's radius, depth towards the
 * viewer (draw the farthest first).
 * @param {number[]} q the camera's world quaternion [x, y, z, w]
 */
export function layout(q) {
  return ENDS.map((e) => { const c = intoCamera(q, e.axis); return { ...e, x: c[0], y: -c[1], depth: c[2] }; }).sort((a, b) => a.depth - b.depth);
}

const TAU = 2 * Math.PI, EPS = 1e-4;
const wrap = (a) => a - TAU * Math.floor((a + Math.PI) / TAU);

/**
 * The camera-controls angles that look along an end towards the target: { azimuth, polar } (camera-controls measures
 * azimuth about +Y from +Z, polar from +Y). The azimuth is the nearest turn to `current` (no spin the long way round);
 * looking straight down or up keeps the current azimuth, rounded to a quarter turn.
 * @param {string} id one of ENDS' ids @param {number} [current] the camera's azimuth now
 */
export function viewAngles(id, current = 0) {
  const quarter = Math.round(current / (Math.PI / 2)) * (Math.PI / 2);
  const want = { px: [Math.PI / 2, Math.PI / 2], nx: [-Math.PI / 2, Math.PI / 2], pz: [0, Math.PI / 2], nz: [Math.PI, Math.PI / 2], py: [quarter, EPS], ny: [quarter, Math.PI - EPS] }[id];
  if (!want) throw new Error(`no view cube end "${id}"`);
  return { azimuth: current + wrap(want[0] - current), polar: want[1] };
}

/**
 * The cube as page content in `parent`: an SVG of the axis lines and a button per end. `onPick(id)` when one is pressed.
 * update(q) turns it. → { el, update, show, dispose }
 * @param {HTMLElement} parent @param {(id: string) => void} onPick @param {{ size?: number }} [o]
 */
export function makeViewCube(parent, onPick, { size = 96 } = {}) {
  const el = document.createElement('div');
  el.className = 'view-cube'; el.setAttribute('role', 'group'); el.setAttribute('aria-label', 'View cube');
  el.style.cssText = `position:absolute;top:10px;right:10px;width:${size}px;height:${size}px;pointer-events:none;user-select:none;`;
  const ns = 'http://www.w3.org/2000/svg', svg = document.createElementNS(ns, 'svg');
  svg.setAttribute('width', String(size)); svg.setAttribute('height', String(size)); svg.setAttribute('aria-hidden', 'true');
  svg.style.cssText = 'position:absolute;inset:0;overflow:visible;';
  el.append(svg);
  const lines = new Map(), buttons = new Map();
  for (const e of ENDS) {
    if (e.label) { const l = document.createElementNS(ns, 'line'); l.setAttribute('stroke', e.color); l.setAttribute('stroke-width', '2'); svg.append(l); lines.set(e.id, l); }
    const b = document.createElement('button');
    b.type = 'button'; b.id = `view-${e.id}`; b.textContent = e.label; b.title = e.name; b.setAttribute('aria-label', e.name);
    const r = e.label ? 10 : 7;
    b.style.cssText = `position:absolute;width:${2 * r}px;height:${2 * r}px;margin:${-r}px 0 0 ${-r}px;padding:0;border-radius:50%;border:${e.label ? 0 : 2}px solid ${e.color};background:${e.label ? e.color : 'rgba(20,22,26,.65)'};color:#fff;font:600 11px/1 system-ui,sans-serif;cursor:pointer;pointer-events:auto;`;
    b.addEventListener('pointerdown', (ev) => ev.stopPropagation()); // not a camera drag or a pick
    b.addEventListener('click', () => onPick(e.id));
    el.append(b); buttons.set(e.id, b);
  }
  parent.append(el);
  const half = size / 2, reach = half - 12;
  let lastKey = '';
  return {
    el,
    update(q) {
      const key = q.map((v) => v.toFixed(4)).join(',');
      if (key === lastKey) return;
      lastKey = key;
      layout(q).forEach((p, i) => {
        const x = half + p.x * reach, y = half + p.y * reach, b = buttons.get(p.id);
        b.style.left = `${x}px`; b.style.top = `${y}px`; b.style.zIndex = String(i + 1); b.style.opacity = p.depth < -0.2 ? '0.75' : '1';
        const l = lines.get(p.id);
        if (l) { l.setAttribute('x1', String(half)); l.setAttribute('y1', String(half)); l.setAttribute('x2', String(x)); l.setAttribute('y2', String(y)); }
      });
    },
    show(on) { el.style.display = on ? '' : 'none'; },
    dispose() { el.remove(); },
  };
}
