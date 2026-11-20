// Writes items/cart.vrmxi (M3 W8, AB-T-0547): a small two-seat cart, a VRMXI `vehicle` (the section proposed for VRMXI
// §8.4): a 250 kg chassis on four raycast wheels (front ones steer, back ones drive), a driver's seat on its left and a
// passenger's on its right with exits beside them, a Reach sensor around it that moves with it, and a "Get in" verb.
// Boxes with flat colours, as the sample's other generated items; W12 brings a proper model.
// Checked by the specification's VRMXI checker when VRMXA_Specification (with the VRMXI draft) is beside the repo.
//   node content/sample/tools/make-vehicle.mjs
import fs from 'node:fs';
import path from 'node:path';
import { writeGLBTree } from '@vrmxg/model';
import { packItem } from '@vrmxg/item';

const root = path.resolve(import.meta.dirname, '..');
const GEN = 'VRMXG sample content (content/sample/tools/make-vehicle.mjs)';
const box3 = (size) => ({ type: 'box', box: { size } });
const C = { body: '#c8553d', trim: '#2f3437', seat: '#3f6f73', tyre: '#1f2124', rim: '#c9c3b6', glass: '#a9cfe0' };

// The item's frame: origin on the floor under the middle, front +z, left +x. The chassis' node is 0.45 m up; the
// wheels' centres 0.28 m up (their radius), so it settles a little on its springs.
const wheel = (name, x, z) => [
  { name, t: [x, -0.17, z], children: [`${name} tyre`, `${name} hub`] },
  { name: `${name} tyre`, box: { size: [0.14, 0.52, 0.52], color: C.tyre, roughness: 0.9 } },
  { name: `${name} hub`, t: [x > 0 ? 0.075 : -0.075, 0, 0], box: { size: [0.02, 0.22, 0.22], color: C.rim, metalness: 0.7, roughness: 0.3 } },
];
const model = () => writeGLBTree({ name: 'Cart', generator: GEN, roots: ['Cart'], nodes: [
  { name: 'Cart', children: ['Chassis'] },
  { name: 'Chassis', t: [0, 0.45, 0], motion: { mass: 250 }, children: ['Body', 'Hood', 'Seat bench', 'Seat back', 'Dash', 'Steering wheel', 'Rear deck', 'Driver', 'Passenger', 'Driver exit', 'Passenger exit', 'Wheel FL', 'Wheel FR', 'Wheel BL', 'Wheel BR', 'Reach'] },
  { name: 'Body', t: [0, 0.05, 0], box: { size: [1.2, 0.18, 2.1], color: C.body, roughness: 0.5 }, collider: box3([1.2, 0.3, 2.1]) },
  { name: 'Hood', t: [0, 0.22, 0.75], box: { size: [1.1, 0.18, 0.55], color: C.body, roughness: 0.5 }, collider: box3([1.1, 0.18, 0.55]) },
  { name: 'Seat bench', t: [0, 0.22, -0.2], box: { size: [1.0, 0.12, 0.5], color: C.seat } },
  { name: 'Seat back', t: [0, 0.48, -0.47], box: { size: [1.0, 0.45, 0.08], color: C.seat }, collider: box3([1.0, 0.45, 0.08]) },
  { name: 'Dash', t: [0, 0.42, 0.45], box: { size: [1.0, 0.2, 0.1], color: C.trim } },
  { name: 'Steering wheel', t: [0.28, 0.55, 0.32], box: { size: [0.3, 0.3, 0.03], color: C.trim } },
  { name: 'Rear deck', t: [0, 0.2, -0.82], box: { size: [1.1, 0.14, 0.45], color: C.body, roughness: 0.5 } },
  // where the hips go, facing +z (VRMXI §8.2): the driver on the left (+x), behind the wheel
  { name: 'Driver', t: [0.28, 0.32, -0.15] },
  { name: 'Passenger', t: [-0.28, 0.32, -0.15] },
  // where each gets out to: on the ground beside the cart (the chassis is 0.45 m up)
  { name: 'Driver exit', t: [1.15, -0.45, -0.15] },
  { name: 'Passenger exit', t: [-1.15, -0.45, -0.15] },
  ...wheel('Wheel FL', 0.66, 0.72), ...wheel('Wheel FR', -0.66, 0.72), ...wheel('Wheel BL', 0.66, -0.72), ...wheel('Wheel BR', -0.66, -0.72),
  // close enough to get in: around the whole cart, moving with it
  { name: 'Reach', t: [0, 0.4, 0], trigger: box3([2.8, 1.8, 3.2]) },
] });

const manifest = {
  format: 'vrmxi', version: 1, id: '3f9a7c21-6b4d-4e8a-9c5f-1d2e3f4a5b6c', revision: 1, name: 'Cart',
  generator: GEN, type: 'vehicle', tags: ['vehicle:cart'], model: { file: 'model.glb' },
  vehicle: {
    body: 'Chassis',
    wheels: [
      { node: 'Wheel FL', radius: 0.26, steer: true, drive: false },
      { node: 'Wheel FR', radius: 0.26, steer: true, drive: false },
      { node: 'Wheel BL', radius: 0.26, steer: false, drive: true },
      { node: 'Wheel BR', radius: 0.26, steer: false, drive: true },
    ],
    suspension: { rest: 0.2, travel: 0.12, stiffness: 40, compression: 2.6, relaxation: 3.4 },
    grip: { friction: 2.5, side: 1 },
    engine: { force: 500, reverse: 250, brake: 20, maxSpeed: 6, maxSteer: 0.5, steerSpeed: 2 },
    driver: 0,
  },
  seat: { points: [{ node: 'Driver', exit: 'Driver exit' }, { node: 'Passenger', exit: 'Passenger exit' }] },
  verbs: [{ verb: 'sit', prompt: 'Get in', reach: 'Reach' }],
  takeable: false, extensions: {},
  meta: { version: '1.0', authors: ['Xocialize LLC'], licenseUrl: 'https://vrm.dev/licenses/1.0/', commercialUsage: 'corporation', creditNotation: 'unnecessary', allowRedistribution: true, modification: 'allowModificationRedistribution' },
  listing: null, origin: { made: 'authored', source: 'content/sample/tools/make-vehicle.mjs' }, madeWith: null, thumbnail: null, files: [],
};

const { vrmxaCore } = await import(path.join(root, '../../engine/packages/character/test/fixtures.mjs'));
const bytes = await packItem({ manifest, model: model(), vrmxaCore: await vrmxaCore() });
const { SPEC, specChecker } = await import(path.join(root, '../../engine/packages/item/test/fixtures.mjs'));
if (SPEC) {
  const found = (await specChecker())(bytes);
  const errors = found.filter((p) => p.severity === 'error');
  if (errors.length) throw new Error(`items/cart.vrmxi: ${JSON.stringify(errors)}`);
  console.log(`valid items/cart.vrmxi (VRMXI checker${found.length ? `, ${found.length} notes: ${found.map((p) => p.code).join(', ')}` : ''})`);
}
fs.writeFileSync(path.join(root, 'items/cart.vrmxi'), bytes);
console.log(`wrote items/cart.vrmxi (${bytes.length} bytes)`);
