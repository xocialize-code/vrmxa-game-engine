// A flight of stairs outside the cafe (M3 W7, AB-T-0546): a landing 0.9 m up and four 18 cm steps down towards −x,
// added to the sample scene so the ragdoll's test, its acceptance check and the playground's ?fall share one place. Since
// W12 (AB-T-0551) it is a model, sets/stairs.glb (tools/make-stairs.mjs: the same boxes, drawn, with a side wall and a
// handrail, its colliders in the GLB). The cafe scene itself is unchanged.

/** Where the landing and steps are: the landing spans x 2.5 … 4.5, the steps go down to x 1.3; z 8.3 … 10.7. */
export const STAIRS = { top: 0.9, rise: 0.18, tread: 0.3, edge: 2.5, z: 9.5, width: 2.4 };

/** Two characters on the landing, facing down the stairs (−x), 1 m apart. */
export const FALL_SPOTS = { mira: [2.75, STAIRS.top, 9.0], 'hana-1': [2.75, STAIRS.top, 10.0] };
export const FALL_YAW = -Math.PI / 2;

/** The stairs' node for a scene document: the model, its origin at the landing's edge on the ground. */
export function stairNodes(parent = 'root') {
  return [{ id: 'stairs', type: 'Model', parent, name: 'Stairs', asset: 'stairs', transform: { p: [STAIRS.edge, 0, STAIRS.z] } }];
}
export const STAIRS_ASSET = { id: 'stairs', type: 'glb', ref: 'sets/stairs.glb' };

/** The playground's camera on the stairs (?fall): from up the street, looking at the foot of the flight. */
export const FALL_CAMERA = { p: [-2.6, 2.3, 14.6], q: [-0.0948, -0.3518, -0.0358, 0.9306] };

/**
 * The sample scene with the stairs, and Mira and Hana on the landing facing down them, with no behaviours (no one
 * walks them off it). @param {any} doc the cafe's document @param {{ camera?: boolean }} [o] camera: point `cam` at them
 */
export function withStairs(doc, { camera = false } = {}) {
  const q = [0, Math.sin(FALL_YAW / 2), 0, Math.cos(FALL_YAW / 2)];
  const nodes = doc.nodes.map((n) => (FALL_SPOTS[n.id] ? { ...n, behaviours: [], transform: { p: FALL_SPOTS[n.id], q } } : camera && n.id === 'cam' ? { ...n, transform: { ...n.transform, ...FALL_CAMERA }, props: { ...n.props, preset: 'fixed' } } : n));
  const assets = doc.assets.some((a) => a.id === 'stairs') ? doc.assets : [...doc.assets, STAIRS_ASSET];
  return { ...doc, assets, nodes: [...nodes, ...stairNodes()] };
}

/** Knock the characters on the landing down the stairs (N·s on each torso). @param {any} tree */
export function knockDownStairs(tree, impulse = [-45, 0, 0]) {
  for (const id of Object.keys(FALL_SPOTS)) /** @type {any} */ (tree.find(id))?.knockDown({ impulse });
}
