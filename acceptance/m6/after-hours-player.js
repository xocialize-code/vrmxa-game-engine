// A scripted player for the second game, "After Hours" (M6 W10, AB-T-0651): what a person does with a gamepad, decided
// each frame from what is on screen. It reads the world (Mira, the lost things, the staff door, the dialogue, the game
// state) and answers with a stick, the interact button and a dialogue choice; the caller turns that into a device's
// state (a stand-in gamepad in the game app, a VirtualDevice in Node). It never touches the simulation, so a session it
// plays is an ordinary recorded session: the input the app recorded replays it.
//
// The same file runs in Node (imported) and in a page (after-hours-driver.mjs injects it as a script: no imports, and
// `export` is its only module syntax).
//
// plan.briefing: the briefing's choice; plan.hint: the hint asked at the counter first (none: no hint asked);
// plan.shelves: the order it visits the shelves in; plan.wrong: put only the scarf on these shelves (each a mistake),
// in this order, instead of shelving anything right.

/** Where things are, as the level has them (content/sample/tools/after-hours-plan.mjs). */
export const AFTER_HOURS = {
  // the lost things: their node, the VRMXI id the inventory keeps, the spot Mira takes them from, and their shelf
  things: [
    { key: 'scarf', id: 'b2c41d6e-7a3f-4e58-9b10-af7e0a0d0c01', at: 'scarf', shelf: 'coats' },
    { key: 'phone', id: 'b2c41d6e-7a3f-4e58-9b10-af7e0a0d0c02', at: 'phone', shelf: 'phones' },
    { key: 'book', id: 'b2c41d6e-7a3f-4e58-9b10-af7e0a0d0c03', at: 'book', shelf: 'books' },
  ],
  // the waypoints Mira walks between (clear of the tables, the counter and the walls), and the straight lines between
  // them she can walk
  points: {
    start: [1, -2.6], counter: [-1.2, -3.15], mid: [0, -0.5], west: [-4.5, -0.5], east: [4.5, -0.5], hall: [4.5, -3], byCounter: [2, -3.1],
    doorway: [5.4, -3], backRoom: [6.9, -3], book: [7.75, -4.3], switch: [5.3, -4.2], scarf: [-2, 1], phone: [2, -2],
    phones: [4.2, -4.9], books: [-5.1, -3.2], coats: [-5.1, 3.5],
  },
  edges: [
    ['start', 'counter'], ['start', 'mid'], ['start', 'phone'], ['counter', 'scarf'], ['counter', 'mid'], ['mid', 'west'], ['mid', 'east'],
    ['mid', 'scarf'], ['mid', 'phone'], ['west', 'books'], ['west', 'coats'], ['east', 'hall'], ['hall', 'doorway'], ['hall', 'phones'],
    ['hall', 'switch'], ['doorway', 'backRoom'], ['backRoom', 'book'], ['doorway', 'switch'], ['doorway', 'phones'], ['phone', 'byCounter'],
    ['byCounter', 'switch'], ['byCounter', 'hall'],
  ],
};

/**
 * @param {{ briefing?: string, hint?: string | null, shelves?: string[], wrong?: string[], think?: number }} [plan]
 *   think: frames spent reading a question before answering it (40)
 */
export function createAfterHoursPlayer(plan = {}) {
  const P = AFTER_HOURS.points, shelves = plan.shelves ?? ['phones', 'books', 'coats'];
  let lastPress = -1000, chosen = null, asked = null, hinted = !plan.hint, route = null;
  const neighbours = new Map(Object.keys(P).map((k) => [k, []]));
  for (const [a, b] of AFTER_HOURS.edges) { neighbours.get(a).push(b); neighbours.get(b).push(a); }
  const dist = (a, b) => Math.sqrt((a[0] - b[0]) * (a[0] - b[0]) + (a[1] - b[1]) * (a[1] - b[1]));
  /** The waypoints from the one nearest `here` to `goal` (Dijkstra over the graph). */
  function path(here, goal) {
    let start = null, best = Infinity;
    for (const [k, p] of Object.entries(P)) { const d = dist(here, p); if (d < best) { best = d; start = k; } }
    const cost = new Map([[start, 0]]), prev = new Map(), open = new Set([start]);
    while (open.size) {
      let u = null;
      for (const k of open) if (u === null || cost.get(k) < cost.get(u)) u = k;
      open.delete(u);
      if (u === goal) break;
      for (const v of neighbours.get(u)) {
        const c = cost.get(u) + dist(P[u], P[v]);
        if (c < (cost.get(v) ?? Infinity)) { cost.set(v, c); prev.set(v, u); open.add(v); }
      }
    }
    if (!cost.has(goal)) throw new Error(`no way from ${start} to ${goal}`);
    const out = [goal];
    while (out[0] !== start) out.unshift(prev.get(out[0]));
    return out;
  }

  /**
   * One frame's decision.
   * @param {any} tree the world being played (its step, services and nodes)
   * @returns {{ stick: [number, number], interact: boolean, choose: string | null, task: string }} stick: [right, forward]
   *   on a unit circle, camera-relative as the player behaviour reads move_x and move_y
   */
  function decide(tree) {
    const idle = (task) => ({ stick: /** @type {[number, number]} */ ([0, 0]), interact: false, choose: null, task });
    if (!tree) return idle('no world');
    const step = tree.clock.step, game = tree.services.get('game'), view = game?.view();
    if (!view || view.scene !== 'after-hours/level.vrmxs') return idle(`in ${view?.scene ?? 'none'}`);
    if (view.outcome) return idle(`game ${view.outcome}`);
    const dialogue = tree.services.get('dialogue')?.view() ?? null;
    if (dialogue) {
      if (dialogue.phase !== 'choice') return idle(`listening (${dialogue.node})`);
      let want = dialogue.node === 'briefing' ? (plan.briefing ?? 'ready') : dialogue.node === 'hints' ? (hinted ? 'fine' : plan.hint) : null;
      const id = dialogue.choices.some((c) => c.id === want) ? want : dialogue.choices.at(-1)?.id ?? null;
      const key = `${dialogue.node}:${dialogue.since}`;
      if (chosen === key) return idle(`chose ${id}`);
      // a person reads the choices first: answer `think` frames (40) after the question appears
      if (asked?.key !== key) asked = { key, frames: 0 };
      if (++asked.frames < (plan.think ?? 40)) return idle(`reading (${dialogue.node})`);
      chosen = key;
      if (dialogue.node === 'hints') hinted = true;
      return { ...idle(`choose ${id}`), choose: id };
    }
    const mira = tree.find('mira'), inventory = tree.services.get('inventory');
    if (!mira) return idle('no Mira');
    const p = mira.object3d.position, here = [p.x, p.z];
    const holds = (id) => !!inventory?.has('mira', id);
    /** Walk to waypoint `goal` (by the graph), then: press interact once the prompt is for `item`, or every half second (`press`) while `until` hasn't happened. */
    const go = (goal, task, { item = null, press = false } = {}) => {
      if (route?.goal !== goal) route = { goal, list: path(here, goal), at: 0 };
      while (route.at < route.list.length - 1 && dist(here, P[route.list[route.at]]) < 0.3) route.at++;
      const to = P[route.list[route.at]], last = route.at === route.list.length - 1;
      const d = dist(here, to);
      if (last && d <= 0.2) {
        if (item) {
          const prompt = tree.services.get('interact')?.prompts().find((f) => f.actor === 'mira');
          if (prompt?.item === item && step - lastPress > 20) { lastPress = step; return { ...idle(`${task}: interact`), interact: true }; }
          return idle(`${task} (waiting for the prompt)`);
        }
        if (press && step - lastPress > 30) { lastPress = step; return { ...idle(`${task}: interact`), interact: true }; }
        return idle(`${task} (there)`);
      }
      const cam = tree.services.get('cameras')?.forPlayer?.(1);
      const yaw = cam?.rigYaw ?? 0, fx = Math.sin(yaw), fz = Math.cos(yaw), rx = -fz, rz = fx;
      const ux = (to[0] - here[0]) / d, uz = (to[1] - here[1]) / d, slow = last && d < 0.6 ? 0.55 : 1;
      return { stick: [(ux * rx + uz * rz) * slow, (ux * fx + uz * fz) * slow], interact: false, choose: null, task };
    };
    if (!hinted) return go('counter', `ask Hana where the ${plan.hint} is`);
    const things = AFTER_HOURS.things;
    if (plan.wrong) { // the scarf only, then onto the wrong shelves, one mistake each
      if (tree.find('scarf')) return go('scarf', 'pick up the scarf', { item: 'scarf' });
      const shelf = plan.wrong[view.counters?.mistakes ?? 0];
      if (shelf) return go(shelf, `put the scarf on the ${shelf} shelf`, { press: true });
      return go('mid', 'wait');
    }
    for (const t of things) {
      if (!tree.find(t.at)) continue;
      if (t.key === 'book' && tree.find('staff-door')?.current !== 'open') return go('switch', 'open the back room', { item: 'switch' });
      return go(t.at, `pick up the ${t.key}`, { item: t.at });
    }
    for (const s of shelves) {
      const t = things.find((x) => x.shelf === s);
      if (holds(t.id)) return go(s, `put the ${t.key} on its shelf`, { press: true });
    }
    return go('mid', 'wait');
  }
  return { decide };
}
