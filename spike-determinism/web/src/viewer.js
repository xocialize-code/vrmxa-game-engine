// A small WebGL viewer for eyeballing the scripted shot: the same Character as the tests, with real
// textures, stepped at a fixed 1/60 s from an accumulator and rendered at display rate.
import * as THREE from 'three';
import { parseVRM, parseVRMA } from './char/load.js';
import { Character, DT, STEPS } from './char/character.js';

export class Viewer {
  constructor(canvas, { onStats = () => {} } = {}) { this.canvas = canvas; this.onStats = onStats; this.acc = 0; }

  async start(vrmBuf, clipBufs) {
    this.vrmBuf = vrmBuf;
    this.anims = {};
    for (const [k, b] of Object.entries(clipBufs)) this.anims[k] = await parseVRMA(b);
    const r = new THREE.WebGLRenderer({ canvas: this.canvas, antialias: true, preserveDrawingBuffer: true });
    r.setPixelRatio(Math.min(devicePixelRatio, 2));
    this.renderer = r;
    this.camera = new THREE.PerspectiveCamera(40, 1, 0.05, 100);
    await this.#reset();
    this.resize();
    this.ro = new ResizeObserver(() => this.resize());
    this.ro.observe(this.canvas);
    this.last = performance.now();
    this.raf = requestAnimationFrame(this.#frame);
  }

  async #reset() {
    const vrm = await parseVRM(this.vrmBuf, { stubTextures: false });
    this.ch = new Character(vrm, this.anims, {});
    const s = this.ch.scene;
    s.background = new THREE.Color(0xa9c7e0);
    s.add(new THREE.HemisphereLight(0xdfefff, 0x56604f, 1.2));
    const sun = new THREE.DirectionalLight(0xffffff, 2.2);
    sun.position.set(2, 4, 3);
    s.add(sun);
    const grid = new THREE.GridHelper(20, 20, 0x667788, 0x8899aa);
    s.add(grid);
    const target = new THREE.Mesh(new THREE.SphereGeometry(0.04), new THREE.MeshBasicMaterial({ color: 0xff3366 }));
    this.ch.target.add(target);
  }

  resize() {
    const { clientWidth: w, clientHeight: h } = this.canvas;
    if (!w || !h) return;
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  }

  #frame = async (t) => {
    this.raf = requestAnimationFrame(this.#frame);
    this.acc = Math.min(this.acc + (t - this.last) / 1000, 0.25);
    this.last = t;
    let simMs = 0;
    while (this.acc >= DT) {
      if (this.ch.k >= STEPS) { await this.#reset(); }
      const t0 = performance.now();
      this.ch.step();
      simMs = performance.now() - t0;
      this.acc -= DT;
    }
    const p = this.ch.root.position;
    this.camera.position.set(p.x + 2.2, 1.6, p.z + 3.2);
    this.camera.lookAt(p.x, 1.0, p.z);
    this.renderer.render(this.ch.scene, this.camera);
    if (this.ch.k % 15 === 0) this.onStats({ k: this.ch.k, simMs: simMs.toFixed(3), springs: this.ch.joints.length, version: this.ch.vrm.meta?.metaVersion });
  };

  dispose() { cancelAnimationFrame(this.raf); this.ro?.disconnect(); this.renderer?.dispose(); }
}
