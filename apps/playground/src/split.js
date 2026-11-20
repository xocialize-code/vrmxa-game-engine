// Two players in split screen (M3 W9, AB-T-0548): Mira is player 1 (keyboard left and mouse), Hana player 2 (arrows and
// the keys beside them, or the gamepad), each with a follow camera of their own, drawn side by side. Added to the sample
// scene by withTwoPlayers; the world installs the two-player action map (buildWorld's players: 2). Shared by the test,
// the acceptance check and the playground's ?split. The cafe scene itself is unchanged.

/** Left half player 1's camera, right half player 2's (y from the bottom, fractions of the output). */
export const SPLIT_LAYOUT = [{ camera: 'cam', x: 0, y: 0, w: 0.5, h: 1 }, { camera: 'cam-2', x: 0.5, y: 0, w: 0.5, h: 1 }];

/** Hana beside Mira on the pavement, both facing the cafe (−z). */
export const HANA_AT = [0.8, 0, 9.5];

/** The sample scene for two players. @param {any} doc the cafe's document */
export function withTwoPlayers(doc) {
  const facing = [0, 1, 0, 0];
  const nodes = doc.nodes.map((n) => {
    if (n.id === 'hana-1') return { ...n, transform: { p: HANA_AT, q: facing }, behaviours: [{ use: 'player', player: 2 }] };
    if (n.id === 'cam') return { ...n, props: { ...n.props, player: 1 } };
    return n;
  });
  // drop data connections that would steer Hana as an NPC
  const connections = (doc.connections ?? []).filter((c) => c.to !== 'hana-1');
  const cam = doc.nodes.find((n) => n.id === 'cam');
  return {
    ...doc, connections,
    nodes: [...nodes, { id: 'cam-2', type: 'Camera', parent: cam?.parent ?? 'root', name: 'Player 2', transform: { p: [HANA_AT[0], 1.6, HANA_AT[2] + 3] }, props: { ...(cam?.props ?? {}), target: 'hana-1', player: 2 } }],
  };
}

/** Hold a route's keys on a device for step k: [[from, to, keys]] (as vehicle.js's routeKeys). */
export { routeKeys } from './vehicle.js';

/**
 * Both players' moves for the test and the acceptance check, in steps: each walks a second towards the cafe, then runs
 * sideways along the pavement away from the other (Mira left, Hana right: their follow cameras look into the cafe, so
 * left is −x); then Hana jumps.
 */
export const TWO_PLAYER_ROUTE = [[20, 80, ['KeyW']], [80, 150, ['KeyA', 'ShiftLeft']], [30, 90, ['ArrowUp']], [90, 160, ['ArrowRight', 'ShiftRight']], [200, 201, ['ControlRight']]];
