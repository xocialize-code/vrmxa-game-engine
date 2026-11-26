// The starter items: what each is (VRMXI §2), its model, states, joints, verbs, seats and spawn point. Read by
// make-items.mjs (which writes them) and by the starter's tests and the playground's ?mode=starter (which do every
// item's verb: `try` says what doing it shows).
//
// Every model's origin is on the floor with its front towards +Z, so an item placed in a scene sits on the floor
// facing the way its node faces. Ids are fixed: re-running the tool gives the same items. Metals stay at metalness 0.5
// to 0.8: a fully metallic part draws black in a scene without an environment map.

const C = { wood: '#8a5a3b', dark: '#5a3c28', light: '#b9875c', trim: '#6b4a33', metal: '#9aa0a6', brass: '#c9a13b', red: '#c0392b', green: '#3fae5a', lampOff: '#4a4a4a', glass: '#a9cfe0', iron: '#55595e', cloth: '#3f6f73', gold: '#e2b84a' };
const HALF = 0.7071068;
const DOWN = [-HALF, 0, 0, HALF]; // a prop's up (+Y) laid along -Z, its thin side (+Z) up: it lies flat
const OFF = [0.1494381, 0, 0, 0.9887711]; // the lever 0.3 rad about X (q = [sin(0.15), 0, 0, cos(0.15)])
const ON = [0.841471, 0, 0, 0.5403023];   // and 2 rad (q = [sin(1), 0, 0, cos(1)])

/**
 * @typedef {{ file: string, id: string, name: string, type: string, tags: string[], model: (k: any) => { roots: string[], nodes: any[], from?: any },
 *   joints?: any[], states?: any[], verbs?: any[], seat?: any, spawn?: any,
 *   try: { verb?: string, expect: 'state' | 'inventory' | 'seated' | 'still' | 'spawn', to?: string, part?: string } }} StarterItem
 */

/** A mesh2motion prop lying flat on the floor as a pickup, with a collider around it and a reach sensor. */
function pickupOf(propName, rootName) {
  return ({ prop, box3, sphere3 }) => {
    const p = prop(propName), [x0, y0, z0] = p.mesh.min, [x1, y1, z1] = p.mesh.max;
    // laid down: x stays, y becomes -z, z becomes y; lifted so its lowest point is on the floor
    const size = [x1 - x0, z1 - z0, y1 - y0].map((v) => +v.toFixed(4)), lift = +(-z0).toFixed(4);
    const centre = [+((x0 + x1) / 2).toFixed(4), +((z1 - z0) / 2).toFixed(4), +(-(y0 + y1) / 2).toFixed(4)];
    return {
      roots: [rootName], from: p.from,
      nodes: [
        { name: rootName, children: ['Mesh', 'Body', 'Reach'] },
        { name: 'Mesh', t: [0, lift, 0], r: DOWN, mesh: p.mesh },
        { name: 'Body', t: centre, collider: box3(size) },
        { name: 'Reach', t: [0, 0.5, 0], trigger: sphere3(0.9) },
      ],
    };
  };
}

/** @type {StarterItem[]} */
export const ITEMS = [
  // ------------------------------------------------------------------ door: a frame and a hinged leaf
  {
    file: 'door.vrmxi', id: '0c5d2a10-7f3e-4b41-9a6c-1e2f3a4b5c01', name: 'Wooden door', type: 'door', tags: ['door:wood'],
    model: ({ box3 }) => ({ roots: ['Door'], nodes: [
      { name: 'Door', children: ['Post left', 'Post right', 'Head', 'Leaf', 'Reach'] },
      { name: 'Post left', t: [-0.53, 1.1, 0], box: { size: [0.06, 2.2, 0.16], color: C.trim }, collider: box3([0.06, 2.2, 0.16]) },
      { name: 'Post right', t: [0.53, 1.1, 0], box: { size: [0.06, 2.2, 0.16], color: C.trim }, collider: box3([0.06, 2.2, 0.16]) },
      { name: 'Head', t: [0, 2.2, 0], box: { size: [1.12, 0.1, 0.16], color: C.trim }, collider: box3([1.12, 0.1, 0.16]) },
      { name: 'Leaf', t: [0, 1.0, 0], motion: { mass: 12 }, children: ['Panel', 'Inset', 'Handle'] },
      { name: 'Panel', box: { size: [0.88, 2, 0.04], color: C.wood, roughness: 0.6 }, collider: box3([0.88, 2, 0.04]) },
      { name: 'Inset', t: [0, 0.35, 0.022], box: { size: [0.6, 0.8, 0.01], color: C.light, roughness: 0.6 } },
      { name: 'Handle', t: [0.34, 0, 0.04], box: { size: [0.12, 0.03, 0.08], color: C.brass, metalness: 0.5, roughness: 0.35 } },
      { name: 'Reach', t: [0, 1.0, 0], trigger: box3([1.2, 2.0, 2.4]) },
    ] }),
    joints: [{ name: 'hinge', type: 'hinge', body: 'Leaf', to: null, anchor: [-0.45, 1.0, 0], axis: [0, 1, 0], limits: { min: -1.75, max: 1.75 }, motor: { target: 0, stiffness: 400, damping: 60 } }],
    states: [
      { name: 'closed', tags: ['door:closed'], joints: { hinge: 0 } },
      { name: 'open', tags: ['door:open'], joints: { hinge: 1.6 } },
      { name: 'locked', tags: ['door:locked'], joints: { hinge: 0 } },
    ],
    verbs: [
      { verb: 'open', prompt: 'Open', states: ['closed'], to: 'open', reach: 'Reach' },
      { verb: 'open', prompt: 'Close', states: ['open'], to: 'closed', reach: 'Reach' },
    ],
    try: { verb: 'open', expect: 'state', to: 'open', part: 'Leaf' },
  },
  // ------------------------------------------------------------------ chest: a lid on its back edge, moved by animation
  // (VRMXI §7.1: a kinematic lid, as the specification's chest; a motor lifting a lid against gravity in Rapier needs
  // careful tuning and a lid driven past its limit flips open by itself)
  {
    file: 'chest.vrmxi', id: '0c5d2a10-7f3e-4b41-9a6c-1e2f3a4b5c02', name: 'Chest', type: 'container', tags: ['container:chest'],
    model: ({ box3 }) => ({ roots: ['Chest'], nodes: [
      { name: 'Chest', children: ['Base', 'Front', 'Back', 'Side left', 'Side right', 'Coins', 'Lid pivot', 'Reach'] },
      { name: 'Base', t: [0, 0.03, 0], box: { size: [0.8, 0.06, 0.5], color: C.dark }, collider: box3([0.8, 0.06, 0.5]) },
      { name: 'Front', t: [0, 0.22, 0.24], box: { size: [0.8, 0.38, 0.02], color: C.wood }, collider: box3([0.8, 0.38, 0.02]) },
      { name: 'Back', t: [0, 0.22, -0.24], box: { size: [0.8, 0.38, 0.02], color: C.wood }, collider: box3([0.8, 0.38, 0.02]) },
      { name: 'Side left', t: [-0.39, 0.22, 0], box: { size: [0.02, 0.38, 0.46], color: C.wood }, collider: box3([0.02, 0.38, 0.46]) },
      { name: 'Side right', t: [0.39, 0.22, 0], box: { size: [0.02, 0.38, 0.46], color: C.wood }, collider: box3([0.02, 0.38, 0.46]) },
      { name: 'Coins', t: [0, 0.09, 0], cylinder: { radius: 0.15, height: 0.04, color: C.gold, metalness: 0.5, roughness: 0.35 } },
      { name: 'Lid pivot', t: [0, 0.44, -0.25], motion: { isKinematic: true, mass: 3 }, children: ['Lid', 'Band', 'Latch'] },
      { name: 'Lid', t: [0, 0, 0.25], box: { size: [0.82, 0.05, 0.52], color: C.wood, roughness: 0.6 }, collider: box3([0.82, 0.05, 0.52]) },
      { name: 'Band', t: [0, 0.027, 0.25], box: { size: [0.06, 0.006, 0.52], color: C.iron, metalness: 0.7, roughness: 0.4 } },
      { name: 'Latch', t: [0, -0.04, 0.515], box: { size: [0.08, 0.08, 0.02], color: C.brass, metalness: 0.5, roughness: 0.35 } },
      { name: 'Reach', t: [0, 0.6, 0.7], trigger: box3([1.2, 1.4, 1.0]) },
    ], animations: [ // the lid up and back 1.7 rad about X (q = [sin(-0.85), 0, 0, cos(0.85)]), and down again
      { name: 'LidOpen', channels: [{ node: 'Lid pivot', path: 'rotation', times: [0, 0.6], values: [[0, 0, 0, 1], [-0.7512804, 0, 0, 0.6599831]] }] },
      { name: 'LidClose', channels: [{ node: 'Lid pivot', path: 'rotation', times: [0, 0.4], values: [[-0.7512804, 0, 0, 0.6599831], [0, 0, 0, 1]] }] },
    ] }),
    states: [
      { name: 'closed', tags: ['chest:closed'], play: 'LidClose' },
      { name: 'open', tags: ['chest:open'], play: 'LidOpen' },
    ],
    verbs: [
      { verb: 'open', prompt: 'Open', states: ['closed'], to: 'open', reach: 'Reach' },
      { verb: 'open', prompt: 'Close', states: ['open'], to: 'closed', reach: 'Reach' },
    ],
    try: { verb: 'open', expect: 'state', to: 'open', part: 'Lid pivot' },
  },
  // ------------------------------------------------------------------ lever: a wall lever thrown by animation, a lamp by state
  {
    file: 'lever.vrmxi', id: '0c5d2a10-7f3e-4b41-9a6c-1e2f3a4b5c03', name: 'Lever', type: 'switch', tags: ['switch:lever'],
    model: ({ box3, cyl3 }) => ({ roots: ['Lever'], nodes: [
      { name: 'Lever', t: [0, 1.1, 0], children: ['Plate', 'Arm', 'Lamp off', 'Lamp on', 'Reach'] },
      { name: 'Plate', t: [0, 0, 0.02], box: { size: [0.16, 0.26, 0.04], color: C.iron, metalness: 0.6, roughness: 0.5 }, collider: box3([0.16, 0.26, 0.04]) },
      // the rod leans a little towards you when off and is thrown forward and down when on, never back into the plate
      { name: 'Arm', t: [0, 0, 0.06], r: OFF, motion: { isKinematic: true, mass: 0.4 }, children: ['Rod', 'Grip'] },
      { name: 'Rod', t: [0, 0.08, 0], box: { size: [0.025, 0.16, 0.025], color: C.metal, metalness: 0.8, roughness: 0.3 }, collider: box3([0.025, 0.16, 0.025]) },
      { name: 'Grip', t: [0, 0.17, 0], cylinder: { radius: 0.025, height: 0.06, color: C.red, roughness: 0.4 }, collider: cyl3(0.025, 0.06) },
      { name: 'Lamp off', t: [0, -0.18, 0.02], box: { size: [0.05, 0.05, 0.03], color: C.lampOff, roughness: 0.3 } },
      { name: 'Lamp on', t: [0, -0.18, 0.02], box: { size: [0.05, 0.05, 0.03], color: C.green, roughness: 0.2 } },
      { name: 'Reach', t: [0, -0.3, 0.6], trigger: box3([1.0, 1.8, 1.0]) },
    ], animations: [
      { name: 'Pull', channels: [{ node: 'Arm', path: 'rotation', times: [0, 0.3], values: [OFF, ON] }] },
      { name: 'Push back', channels: [{ node: 'Arm', path: 'rotation', times: [0, 0.3], values: [ON, OFF] }] },
    ] }),
    states: [
      { name: 'off', tags: ['switch:off'], play: 'Push back', show: ['Lamp off'] },
      { name: 'on', tags: ['switch:on'], play: 'Pull', show: ['Lamp on'] },
    ],
    verbs: [
      { verb: 'use', prompt: 'Pull', states: ['off'], to: 'on', reach: 'Reach' },
      { verb: 'use', prompt: 'Push back', states: ['on'], to: 'off', reach: 'Reach' },
    ],
    try: { verb: 'use', expect: 'state', to: 'on', part: 'Arm' },
  },
  // ------------------------------------------------------------------ button: a push button on a post, lit by state
  {
    file: 'button.vrmxi', id: '0c5d2a10-7f3e-4b41-9a6c-1e2f3a4b5c04', name: 'Button', type: 'switch', tags: ['switch:button'],
    model: ({ box3, cyl3 }) => ({ roots: ['Button'], nodes: [
      { name: 'Button', children: ['Post', 'Housing', 'Cap up', 'Cap down', 'Reach'] },
      { name: 'Post', t: [0, 0.5, 0], box: { size: [0.12, 1.0, 0.12], color: C.iron, metalness: 0.5, roughness: 0.5 }, collider: box3([0.12, 1.0, 0.12]) },
      { name: 'Housing', t: [0, 1.03, 0], box: { size: [0.2, 0.06, 0.2], color: C.metal, metalness: 0.7, roughness: 0.4 }, collider: box3([0.2, 0.06, 0.2]) },
      { name: 'Cap up', t: [0, 1.085, 0], cylinder: { radius: 0.06, height: 0.05, color: C.red, roughness: 0.3 }, collider: cyl3(0.06, 0.05) },
      { name: 'Cap down', t: [0, 1.07, 0], cylinder: { radius: 0.06, height: 0.02, color: C.green, roughness: 0.3 } },
      { name: 'Reach', t: [0, 0.9, 0.5], trigger: box3([1.0, 1.8, 1.2]) },
    ] }),
    states: [
      { name: 'off', tags: ['switch:off'], show: ['Cap up'] },
      { name: 'on', tags: ['switch:on'], show: ['Cap down'] },
    ],
    verbs: [
      { verb: 'use', prompt: 'Press', states: ['off'], to: 'on', reach: 'Reach' },
      { verb: 'use', prompt: 'Press', states: ['on'], to: 'off', reach: 'Reach' },
    ],
    try: { verb: 'use', expect: 'state', to: 'on' },
  },
  // ------------------------------------------------------------------ seats: a chair and a two-seat bench
  {
    file: 'chair.vrmxi', id: '0c5d2a10-7f3e-4b41-9a6c-1e2f3a4b5c05', name: 'Chair', type: 'seat', tags: ['seat:chair'],
    model: ({ box3 }) => ({ roots: ['Chair'], nodes: [
      { name: 'Chair', children: ['Seat', 'Back', 'Leg fl', 'Leg fr', 'Leg bl', 'Leg br', 'Sit', 'Stand', 'Reach'] },
      { name: 'Seat', t: [0, 0.45, 0], box: { size: [0.44, 0.04, 0.44], color: C.wood }, collider: box3([0.44, 0.04, 0.44]) },
      { name: 'Back', t: [0, 0.72, -0.2], box: { size: [0.44, 0.5, 0.04], color: C.wood }, collider: box3([0.44, 0.5, 0.04]) },
      { name: 'Leg fl', t: [-0.19, 0.215, 0.19], box: { size: [0.04, 0.43, 0.04], color: C.dark }, collider: box3([0.04, 0.43, 0.04]) },
      { name: 'Leg fr', t: [0.19, 0.215, 0.19], box: { size: [0.04, 0.43, 0.04], color: C.dark }, collider: box3([0.04, 0.43, 0.04]) },
      { name: 'Leg bl', t: [-0.19, 0.215, -0.19], box: { size: [0.04, 0.43, 0.04], color: C.dark }, collider: box3([0.04, 0.43, 0.04]) },
      { name: 'Leg br', t: [0.19, 0.215, -0.19], box: { size: [0.04, 0.43, 0.04], color: C.dark }, collider: box3([0.04, 0.43, 0.04]) },
      { name: 'Sit', t: [0, 0.47, 0.02] },
      { name: 'Stand', t: [0, 0, 0.5] },
      { name: 'Reach', t: [0, 0.6, 0.3], trigger: box3([1.1, 1.4, 1.3]) },
    ] }),
    verbs: [{ verb: 'sit', prompt: 'Sit', reach: 'Reach', at: 'Stand' }],
    seat: { points: [{ node: 'Sit', exit: 'Stand' }] },
    try: { verb: 'sit', expect: 'seated' },
  },
  {
    file: 'bench.vrmxi', id: '0c5d2a10-7f3e-4b41-9a6c-1e2f3a4b5c06', name: 'Bench', type: 'seat', tags: ['seat:bench'],
    model: ({ box3 }) => ({ roots: ['Bench'], nodes: [
      { name: 'Bench', children: ['Board', 'Back rest', 'End left', 'End right', 'Sit left', 'Sit right', 'Stand left', 'Stand right', 'Reach'] },
      { name: 'Board', t: [0, 0.44, 0], box: { size: [1.4, 0.05, 0.42], color: C.light }, collider: box3([1.4, 0.05, 0.42]) },
      { name: 'Back rest', t: [0, 0.75, -0.19], box: { size: [1.4, 0.3, 0.04], color: C.light }, collider: box3([1.4, 0.3, 0.04]) },
      { name: 'End left', t: [-0.66, 0.21, 0], box: { size: [0.06, 0.42, 0.42], color: C.iron, metalness: 0.5 }, collider: box3([0.06, 0.42, 0.42]) },
      { name: 'End right', t: [0.66, 0.21, 0], box: { size: [0.06, 0.42, 0.42], color: C.iron, metalness: 0.5 }, collider: box3([0.06, 0.42, 0.42]) },
      { name: 'Sit left', t: [-0.35, 0.465, 0.02] },
      { name: 'Sit right', t: [0.35, 0.465, 0.02] },
      { name: 'Stand left', t: [-0.35, 0, 0.5] },
      { name: 'Stand right', t: [0.35, 0, 0.5] },
      { name: 'Reach', t: [0, 0.6, 0.3], trigger: box3([1.8, 1.4, 1.3]) },
    ] }),
    verbs: [{ verb: 'sit', prompt: 'Sit', reach: 'Reach' }],
    seat: { points: [{ node: 'Sit left', exit: 'Stand left' }, { node: 'Sit right', exit: 'Stand right' }] },
    try: { verb: 'sit', expect: 'seated' },
  },
  // ------------------------------------------------------------------ props: things that stand or get pushed about
  {
    file: 'shelf.vrmxi', id: '0c5d2a10-7f3e-4b41-9a6c-1e2f3a4b5c07', name: 'Shelf', type: 'x-vrmxg.prop', tags: ['prop:shelf'],
    model: ({ box3 }) => ({ roots: ['Shelf'], nodes: [
      { name: 'Shelf', children: ['Side left', 'Side right', 'Back', 'Board 1', 'Board 2', 'Board 3', 'Board 4', 'Jar', 'Books'] },
      { name: 'Side left', t: [-0.49, 0.9, 0], box: { size: [0.02, 1.8, 0.35], color: C.wood }, collider: box3([0.02, 1.8, 0.35]) },
      { name: 'Side right', t: [0.49, 0.9, 0], box: { size: [0.02, 1.8, 0.35], color: C.wood }, collider: box3([0.02, 1.8, 0.35]) },
      { name: 'Back', t: [0, 0.9, -0.165], box: { size: [0.96, 1.8, 0.02], color: C.dark }, collider: box3([0.96, 1.8, 0.02]) },
      ...[0.05, 0.6, 1.15, 1.7].map((y, i) => ({ name: `Board ${i + 1}`, t: [0, y, 0], box: { size: [0.96, 0.03, 0.33], color: C.light }, collider: box3([0.96, 0.03, 0.33]) })),
      { name: 'Jar', t: [-0.25, 0.7, 0], cylinder: { radius: 0.06, height: 0.17, color: C.glass, roughness: 0.15 } },
      { name: 'Books', t: [0.2, 1.27, -0.02], box: { size: [0.3, 0.21, 0.22], color: C.cloth } },
    ] }),
    try: { expect: 'still' },
  },
  {
    file: 'table.vrmxi', id: '0c5d2a10-7f3e-4b41-9a6c-1e2f3a4b5c08', name: 'Table', type: 'x-vrmxg.prop', tags: ['prop:table'],
    model: ({ box3 }) => ({ roots: ['Table'], nodes: [
      { name: 'Table', children: ['Top', 'Leg fl', 'Leg fr', 'Leg bl', 'Leg br'] },
      { name: 'Top', t: [0, 0.74, 0], box: { size: [1.2, 0.05, 0.8], color: C.wood, roughness: 0.6 }, collider: box3([1.2, 0.05, 0.8]) },
      ...[[-0.54, 0.34], [0.54, 0.34], [-0.54, -0.34], [0.54, -0.34]].map(([x, z], i) => ({ name: ['Leg fl', 'Leg fr', 'Leg bl', 'Leg br'][i], t: [x, 0.36, z], box: { size: [0.06, 0.72, 0.06], color: C.dark }, collider: box3([0.06, 0.72, 0.06]) })),
    ] }),
    try: { expect: 'still' },
  },
  {
    file: 'crate.vrmxi', id: '0c5d2a10-7f3e-4b41-9a6c-1e2f3a4b5c09', name: 'Crate', type: 'x-vrmxg.prop', tags: ['prop:crate'],
    model: ({ box3 }) => ({ roots: ['Crate'], nodes: [
      { name: 'Crate', children: ['Box'] },
      { name: 'Box', t: [0, 0.25, 0], motion: { mass: 8 }, children: ['Planks', 'Slat front', 'Slat back'] },
      { name: 'Planks', box: { size: [0.5, 0.5, 0.5], color: C.light, roughness: 0.9 }, collider: box3([0.5, 0.5, 0.5]) },
      { name: 'Slat front', t: [0, 0, 0.252], box: { size: [0.5, 0.08, 0.01], color: C.wood } },
      { name: 'Slat back', t: [0, 0, -0.252], box: { size: [0.5, 0.08, 0.01], color: C.wood } },
    ] }),
    try: { expect: 'still', part: 'Box' },
  },
  {
    file: 'barrel.vrmxi', id: '0c5d2a10-7f3e-4b41-9a6c-1e2f3a4b5c10', name: 'Barrel', type: 'x-vrmxg.prop', tags: ['prop:barrel'],
    // a cylinder alone rocks on its rim when it lands (Rapier): a flat footing inside it gives it a face to stand on
    model: ({ cyl3, box3 }) => ({ roots: ['Barrel'], nodes: [
      { name: 'Barrel', children: ['Drum'] },
      { name: 'Drum', t: [0, 0.45, 0], motion: { mass: 20 }, children: ['Staves', 'Footing', 'Hoop top', 'Hoop bottom'] },
      { name: 'Footing', t: [0, -0.44, 0], collider: box3([0.38, 0.02, 0.38]) },
      { name: 'Staves', cylinder: { radius: 0.28, height: 0.9, color: C.wood, roughness: 0.8 }, collider: cyl3(0.28, 0.9) },
      { name: 'Hoop top', t: [0, 0.3, 0], cylinder: { radius: 0.285, height: 0.04, color: C.iron, metalness: 0.7, roughness: 0.4 } },
      { name: 'Hoop bottom', t: [0, -0.3, 0], cylinder: { radius: 0.285, height: 0.04, color: C.iron, metalness: 0.7, roughness: 0.4 } },
    ] }),
    try: { expect: 'still', part: 'Drum' },
  },
  // ------------------------------------------------------------------ pickups: taken into the game's inventory
  {
    file: 'coin.vrmxi', id: '0c5d2a10-7f3e-4b41-9a6c-1e2f3a4b5c11', name: 'Coin', type: 'pickup', tags: ['pickup:coin'],
    model: ({ sphere3, cyl3 }) => ({ roots: ['Coin'], nodes: [
      { name: 'Coin', children: ['Disc', 'Reach'] },
      { name: 'Disc', t: [0, 0.004, 0], cylinder: { radius: 0.04, height: 0.008, color: C.gold, metalness: 0.5, roughness: 0.35 }, collider: cyl3(0.04, 0.008) },
      { name: 'Reach', t: [0, 0.5, 0], trigger: sphere3(0.9) },
    ] }),
    verbs: [{ verb: 'take', prompt: 'Pick up', reach: 'Reach' }],
    try: { verb: 'take', expect: 'inventory' },
  },
  {
    file: 'key.vrmxi', id: '0c5d2a10-7f3e-4b41-9a6c-1e2f3a4b5c12', name: 'Key', type: 'pickup', tags: ['pickup:key'],
    model: ({ sphere3, box3 }) => ({ roots: ['Key'], nodes: [
      { name: 'Key', children: ['Bow', 'Shank', 'Bit', 'Reach'] },
      { name: 'Bow', t: [-0.05, 0.006, 0], cylinder: { radius: 0.025, height: 0.012, color: C.brass, metalness: 0.5, roughness: 0.35 }, collider: box3([0.05, 0.012, 0.05]) },
      { name: 'Shank', t: [0.02, 0.006, 0], box: { size: [0.09, 0.008, 0.012], color: C.brass, metalness: 0.5, roughness: 0.35 } },
      { name: 'Bit', t: [0.055, 0.006, 0.012], box: { size: [0.02, 0.008, 0.02], color: C.brass, metalness: 0.5, roughness: 0.35 } },
      { name: 'Reach', t: [0, 0.5, 0], trigger: sphere3(0.9) },
    ] }),
    verbs: [{ verb: 'take', prompt: 'Pick up', reach: 'Reach' }],
    try: { verb: 'take', expect: 'inventory' },
  },
  {
    file: 'mug.vrmxi', id: '0c5d2a10-7f3e-4b41-9a6c-1e2f3a4b5c13', name: 'Mug', type: 'pickup', tags: ['pickup:mug'],
    model: ({ sphere3, cyl3 }) => ({ roots: ['Mug'], nodes: [
      { name: 'Mug', children: ['Cup', 'Handle', 'Reach'] },
      { name: 'Cup', t: [0, 0.05, 0], cylinder: { radius: 0.04, height: 0.1, color: '#e8e4dc', roughness: 0.4 }, collider: cyl3(0.04, 0.1) },
      { name: 'Handle', t: [0.05, 0.05, 0], box: { size: [0.02, 0.06, 0.012], color: '#e8e4dc', roughness: 0.4 } },
      { name: 'Reach', t: [0, 0.5, 0], trigger: sphere3(0.9) },
    ] }),
    verbs: [{ verb: 'take', prompt: 'Take', reach: 'Reach' }],
    try: { verb: 'take', expect: 'inventory' },
  },
  {
    file: 'sword.vrmxi', id: '0c5d2a10-7f3e-4b41-9a6c-1e2f3a4b5c14', name: 'Sword', type: 'pickup', tags: ['pickup:sword'],
    model: pickupOf('sword_A', 'Sword'),
    verbs: [{ verb: 'take', prompt: 'Pick up', reach: 'Reach' }],
    try: { verb: 'take', expect: 'inventory' },
  },
  {
    file: 'axe.vrmxi', id: '0c5d2a10-7f3e-4b41-9a6c-1e2f3a4b5c15', name: 'Axe', type: 'pickup', tags: ['pickup:axe'],
    model: pickupOf('axe_A', 'Axe'),
    verbs: [{ verb: 'take', prompt: 'Pick up', reach: 'Reach' }],
    try: { verb: 'take', expect: 'inventory' },
  },
  {
    file: 'hammer.vrmxi', id: '0c5d2a10-7f3e-4b41-9a6c-1e2f3a4b5c16', name: 'Hammer', type: 'pickup', tags: ['pickup:hammer'],
    model: pickupOf('hammer_A', 'Hammer'),
    verbs: [{ verb: 'take', prompt: 'Pick up', reach: 'Reach' }],
    try: { verb: 'take', expect: 'inventory' },
  },
  // ------------------------------------------------------------------ where the player starts
  {
    file: 'spawn.vrmxi', id: '0c5d2a10-7f3e-4b41-9a6c-1e2f3a4b5c17', name: 'Player start', type: 'spawnPoint', tags: ['spawn:player'],
    model: () => ({ roots: ['Spawn'], nodes: [{ name: 'Spawn' }] }),
    spawn: { node: 'Spawn' },
    try: { expect: 'spawn' },
  },
];
