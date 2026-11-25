// A scripted player for the sample game, "The Morning Rush" (M5 W10, AB-T-0620): what a person does with a gamepad,
// decided each frame from what is on screen. It reads the world (Mira, the regulars, the trays, the till, the dialogue,
// the game state) and answers with a stick, the interact button and a dialogue choice; the caller turns that into a
// device's state (a stand-in gamepad in the game app, a VirtualDevice in Node). It never touches the simulation, so a
// session it plays is an ordinary recorded session: the input the app recorded replays it.
//
// The same file runs in Node (imported) and in a page (acceptance/m5/rush.mjs injects it as a script: no imports, and
// `export` is its only module syntax).
//
// plan.orders: per table, 'right' or 'wrong' (which choice to make); plan.briefing: the briefing's choice id.

/** The tables, as the level has them (content/sample/tools/make-game.mjs TABLES). */
export const RUSH_TABLES = [
  { n: 1, customer: 'aoi', zone: [-1.45, 1], tray: 'tray-1', trayAt: [-0.9, -3.25], item: '6f1c2a3e-4b5d-4e6f-8a7b-1c2d3e4f5a61', right: 'latte', wrong: 'espresso' },
  { n: 2, customer: 'ren', zone: [1.45, 1], tray: 'tray-2', trayAt: [-0.1, -3.25], item: '6f1c2a3e-4b5d-4e6f-8a7b-1c2d3e4f5a62', right: 'iced-tea', wrong: 'chocolate' },
  { n: 3, customer: 'yuki', zone: [1.45, -2], tray: 'tray-3', trayAt: [0.6, -3.25], item: '6f1c2a3e-4b5d-4e6f-8a7b-1c2d3e4f5a63', right: 'green-tea', wrong: 'coffee' },
];
const TILL_AT = [-1.65, -3.25], WAIT_AT = [-0.2, -2.4];

/**
 * @param {{ orders?: Array<'right' | 'wrong'>, briefing?: string, think?: number }} [plan] think: frames spent reading a
 *   question before answering it (40)
 */
export function createRushPlayer(plan = {}) {
  const orders = plan.orders ?? ['right', 'right', 'right'];
  let lastPress = -1000, chosen = null, phase = 'level', asked = null;
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
    if (!view || view.scene !== 'game/level.vrmxs') { phase = view?.scene ?? 'none'; return idle(`in ${phase}`); }
    if (view.outcome) return idle(`game ${view.outcome}`);
    const dialogue = tree.services.get('dialogue')?.view() ?? null;
    if (dialogue) {
      if (dialogue.phase !== 'choice') return idle(`listening (${dialogue.node})`);
      const t = RUSH_TABLES.find((x) => `order-${x.n}` === dialogue.node);
      const want = t ? (orders[t.n - 1] === 'wrong' ? t.wrong : t.right) : (plan.briefing ?? 'ready');
      const id = dialogue.choices.some((c) => c.id === want) ? want : dialogue.choices[0]?.id ?? null;
      const key = `${dialogue.node}:${dialogue.since}`;
      if (chosen === key) return idle(`chose ${id}`);
      // a person reads the choices first: answer `think` frames (40) after the question appears
      if (asked?.key !== key) asked = { key, frames: 0 };
      if (++asked.frames < (plan.think ?? 40)) return idle(`reading (${dialogue.node})`);
      chosen = key;
      return { ...idle(`choose ${id}`), choose: id };
    }
    const mira = tree.find('mira'), inventory = tree.services.get('inventory');
    if (!mira) return idle('no Mira');
    const p = mira.object3d.position, here = [p.x, p.z];
    const flag = (k) => view.flags?.[k] === true;
    const carrying = RUSH_TABLES.find((t) => inventory?.has('mira', t.item));
    const go = (to, task, { press = null, within = 0.2 } = {}) => {
      const dx = to[0] - here[0], dz = to[1] - here[1], d = Math.sqrt(dx * dx + dz * dz);
      if (d <= within) {
        if (!press) return idle(`${task} (there)`);
        const prompt = tree.services.get('interact')?.prompts().find((f) => f.actor === 'mira');
        if (prompt?.item === press && step - lastPress > 20) { lastPress = step; return { ...idle(`${task}: interact`), interact: true }; }
        return idle(`${task} (waiting for the prompt)`);
      }
      const cam = tree.services.get('cameras')?.forPlayer?.(1);
      const yaw = cam?.rigYaw ?? 0, fx = Math.sin(yaw), fz = Math.cos(yaw), rx = -fz, rz = fx;
      const ux = dx / d, uz = dz / d, slow = d < 0.6 ? 0.55 : 1;
      return { stick: [(ux * rx + uz * rz) * slow, (ux * fx + uz * fz) * slow], interact: false, choose: null, task };
    };
    if (carrying) return go(RUSH_TABLES[carrying.n - 1].zone, `carry table ${carrying.n}'s order`, { within: 0.25 });
    for (const t of RUSH_TABLES) {
      const c = tree.find(t.customer);
      if (!flag(`ordered${t.n}`) && c?.ctrl?.seat && c.graph?.state === 'sitIdle') return go(t.zone, `take table ${t.n}'s order`, { within: 0.25 });
    }
    for (const t of RUSH_TABLES) {
      const tray = tree.find(t.tray);
      if (tray?.current === 'ready') return go(t.trayAt, `fetch table ${t.n}'s order`, { press: t.tray, within: 0.2 });
    }
    if (tree.find('till')?.current === 'open') return go(TILL_AT, 'close the till', { press: 'till', within: 0.2 });
    return go(WAIT_AT, 'wait by the counter', { within: 0.3 });
  }
  return { decide };
}
