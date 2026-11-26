// The smallest app on the render host (AB-A-0335): RenderHost.create, the host's MToon class and captureStill, as the
// avatar studio's Quick Look viewer uses them. No post stack and no particles. `node size.mjs` builds it and reports
// what loads at start and what the build ships; nothing here runs in a check.
import { RenderHost, backendFromQuery } from '@vrmxg/render';
import { captureStill } from '@vrmxg/export';
import { Mesh, SphereGeometry, DirectionalLight } from 'three';

const canvas = /** @type {HTMLCanvasElement} */ (document.getElementById('view'));
const host = await RenderHost.create({ canvas, backend: backendFromQuery(location.search) });
const MToon = host.mtoonMaterial;
const ball = new Mesh(new SphereGeometry(0.5, 32, 16), MToon ? new MToon({}) : undefined);
host.scene.add(ball, new DirectionalLight(0xffffff, 2));
// a tree that never steps: captureStill draws the host's scene through its fallback camera
const tree = { root: { object3d: ball.parent }, services: new Map(), clock: { step: 1 }, find: () => null };
/** @type {any} */ (host).tree = tree;
const still = await captureStill(host, { width: 64, height: 64 });
document.title = `still ${still.width}×${still.height}`;
