// What each peer's player does, and how one player's input travels.
//
// A player's input for one step is six bytes: move_x, move_y, look_x as signed bytes (value / 127; look scaled by
// LOOK), and a byte of buttons (jump, run, interact, camera_next). The simulation is fed the decoded value on every
// peer, the local one included, so what travels is exactly what is simulated.
//
// The bots are seeded (mulberry32), so a run is the same run every time: a direction held for 20 to 60 steps, sometimes
// running, a jump now and then, the camera turned a little.

export const LOOK = 0.02;
export const BUTTONS = ['jump', 'run', 'interact', 'camera_next'];
export const INPUT_BYTES = 4;

/** @param {number} seed */
export function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** A bot's input per step, packed: [mx, my, lx, buttons] as bytes (signed in the first three). */
export function makeBot(seed) {
  const rnd = mulberry32(seed);
  let hold = 0, mx = 0, my = 0, run = 0, lx = 0;
  return (step) => {
    void step;
    if (hold-- <= 0) {
      hold = 20 + Math.floor(rnd() * 40);
      const dir = Math.floor(rnd() * 9); // 8 directions and standing still
      mx = dir === 8 ? 0 : [127, 90, 0, -90, -127, -90, 0, 90][dir];
      my = dir === 8 ? 0 : [0, 90, 127, 90, 0, -90, -127, -90][dir];
      run = rnd() < 0.35 ? 1 : 0;
      lx = rnd() < 0.3 ? Math.floor(rnd() * 61) - 30 : 0;
    }
    const jump = rnd() < 0.012 ? 1 : 0;
    return [mx, my, lx, (jump ? 1 : 0) | (run ? 2 : 0)];
  };
}

export const NEUTRAL = [0, 0, 0, 0];

/** Bytes of one player's input. */
export function packInput(i, out = new Uint8Array(INPUT_BYTES), at = 0) {
  out[at] = i[0] & 0xff; out[at + 1] = i[1] & 0xff; out[at + 2] = i[2] & 0xff; out[at + 3] = i[3] & 0xff;
  return out;
}
const s8 = (b) => (b > 127 ? b - 256 : b);
export function unpackInput(bytes, at = 0) { return [s8(bytes[at]), s8(bytes[at + 1]), s8(bytes[at + 2]), bytes[at + 3]]; }
export const sameInput = (a, b) => a[0] === b[0] && a[1] === b[1] && a[2] === b[2] && a[3] === b[3];

/**
 * The input service's frame for one step from both players' inputs: [axes in the map's order, button bits].
 * @param {{ axes: string[], buttons: string[] }} rec @param {number[][]} players inputs of player 1, 2, …
 */
export function frameOf(rec, players) {
  const axes = new Array(rec.axes.length).fill(0);
  let bits = 0;
  players.forEach((inp, k) => {
    const pre = k === 0 ? '' : `p${k + 1}.`;
    const set = (name, v) => { const i = rec.axes.indexOf(pre + name); if (i >= 0) axes[i] = v; };
    set('move_x', inp[0] / 127); set('move_y', inp[1] / 127); set('look_x', (inp[2] / 127) * LOOK);
    BUTTONS.forEach((b, j) => { if (inp[3] & (1 << j)) { const i = rec.buttons.indexOf(pre + b); if (i >= 0) bits |= 1 << i; } });
  });
  return [axes, bits >>> 0];
}

/** Each player's input per step at an input delay: the bot's (s − delay)th value, neutral before. */
export function playerInputs(seed, delay, steps) {
  const bot = makeBot(seed), out = [];
  for (let s = 0; s < steps + 600; s++) out.push(s < delay ? NEUTRAL : bot(s - delay));
  return out;
}
