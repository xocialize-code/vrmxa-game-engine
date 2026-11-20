// A cart on the pavement outside the cafe (M3 W8, AB-T-0547): items/cart.vrmxi added to the sample scene, facing −x
// along the pavement, with Mira beside its driver's door (no behaviours changed: she is the player). Shared by the
// vehicle's test, its acceptance check and the playground's ?cart. The cafe scene itself is unchanged.

/** Where the cart stands (its origin, on the pavement) and which way it faces (yaw −π/2: its front towards −x). */
export const CART = { p: [4, 0, 10.5], yaw: -Math.PI / 2 };
/** Mira beside the driver's door (the cart's left is +z when it faces −x), facing the cart. */
export const MIRA_AT = { p: [4.15, 0, 11.9], yaw: Math.PI };

const q = (yaw) => [0, Math.sin(yaw / 2), 0, Math.cos(yaw / 2)];

/** The sample scene with the cart, and Mira beside it. @param {any} doc the cafe's document */
export function withCart(doc) {
  const assets = doc.assets.some((a) => a.id === 'cart') ? doc.assets : [...doc.assets, { id: 'cart', type: 'vrmxi', ref: 'items/cart.vrmxi' }];
  const nodes = doc.nodes.map((n) => (n.id === 'mira' ? { ...n, transform: { p: MIRA_AT.p, q: q(MIRA_AT.yaw) } } : n));
  return { ...doc, assets, nodes: [...nodes, { id: 'cart', type: 'Item', parent: 'root', name: 'Cart', asset: 'cart', transform: { p: CART.p, q: q(CART.yaw) } }] };
}

/**
 * The drive the test and the acceptance check play, in steps: [from, to, keys held]. E gets in at step 30; W drives
 * along the pavement; A then D change lane (the pavement is 8 m deep: a wider turn leaves it); S brakes; E gets out.
 */
export const DRIVE_ROUTE = [[30, 31, ['KeyE']], [150, 220, ['KeyW']], [220, 250, ['KeyW', 'KeyA']], [250, 280, ['KeyW', 'KeyD']], [280, 300, ['KeyW']], [300, 340, ['KeyS']], [420, 421, ['KeyE']]];

/** Press and release a device's keys for step k of a route. @param {any} dev a VirtualDevice @param {Set<string>} held */
export function routeKeys(route, k, dev, held) {
  const want = new Set(route.filter(([a, b]) => k >= a && k < b).flatMap(([, , keys]) => keys));
  for (const key of held) if (!want.has(key)) dev.release(key);
  for (const key of want) if (!held.has(key)) dev.press(key);
  return want;
}
