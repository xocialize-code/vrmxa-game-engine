// The interactive stage: the level (from the same arrays as the colliders and the navmesh input),
// the navmesh debug draw, and a crowd whose agents drive Rapier character controllers (capsules).
// Nothing here is Vue-reactive: the App keeps the Stage in a plain variable and gets plain numbers.
import * as THREE from 'three';
import { groundMesh, fixedBoxes } from '../sim/level.js';
import { navInput, DOOR_BLOCK, AGENT } from '../sim/geometry.js';
import { createRecastBackend } from '../sim/nav-recast.js';
import { createNavcatBackend } from '../sim/nav-navcat.js';
import { loadRapier, createCoupled, DT } from '../sim/coupled.js';

const COLORS = { ground: 0x6f8f72, wall: 0xb9b2a5, stair: 0x9a8f80, ramp: 0x8d8579, door: 0x7a5236, agent: 0x3d7bd9, nav: 0x22c3ee };

export class Stage {
  constructor(canvas, { backend = 'recast', agents = 50, draw = 'ours', door = false, cam = 'overview', onStats = () => {} } = {}) {
    Object.assign(this, { canvas, backendName: backend, n: agents, draw, onStats, startDoor: door });
    this.cam = { yaw: 0.6, pitch: 0.85, dist: 34, target: new THREE.Vector3(0, 0, -2) };
    if (cam === 'door') this.cam = { yaw: 0.9, pitch: 0.75, dist: 13, target: new THREE.Vector3(-2, 0, -4) };
    this.acc = 0;
    this.crowdTimes = [];
    this.physTimes = [];
    this.frameTimes = [];
    this.door = false;
    this.doorMs = 0;
  }

  async start() {
    const { R } = await loadRapier();
    this.be = this.backendName === 'navcat' ? createNavcatBackend() : createRecastBackend();
    await this.be.init();
    this.bakeInfo = this.be.bake(navInput());
    this.sim = createCoupled(R, this.be, this.n, { mode: 'sync', seed: 1234 });
    this.#setupThree();
    this.#buildLevel();
    await this.#buildNavDraw();
    this.#buildAgents();
    this.#bindInput();
    if (this.startDoor) this.toggleDoor();
    this.running = true;
    this.last = performance.now();
    this.statsAt = this.last;
    this.raf = requestAnimationFrame(this.#frame);
  }

  dispose() {
    this.running = false;
    cancelAnimationFrame(this.raf);
    this.unbind?.();
    this.renderer?.dispose();
    this.sim?.free();
    this.be?.destroy();
  }

  toggleDoor() {
    this.door = !this.door;
    this.doorMs = +this.sim.setDoor(this.door).ms.toFixed(3);
    this.doorMesh.visible = this.door;
    this.#refreshNavDraw();
  }

  #setupThree() {
    const r = new THREE.WebGLRenderer({ canvas: this.canvas, antialias: true, preserveDrawingBuffer: true });
    r.setPixelRatio(Math.min(devicePixelRatio, 2));
    this.renderer = r;
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0xa9c7e0);
    this.camera = new THREE.PerspectiveCamera(50, 1, 0.1, 300);
    this.scene.add(new THREE.HemisphereLight(0xdfefff, 0x56604f, 1.8));
    const sun = new THREE.DirectionalLight(0xffffff, 2.2);
    sun.position.set(8, 14, 6);
    this.scene.add(sun);
    this.resize();
    this.ro = new ResizeObserver(() => this.resize());
    this.ro.observe(this.canvas);
  }

  resize() {
    const { clientWidth: w, clientHeight: h } = this.canvas;
    if (!w || !h) return;
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  }

  #buildLevel() {
    const std = (color, extra = {}) => new THREE.MeshStandardMaterial({ color, roughness: 0.9, ...extra });
    const g = groundMesh();
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(g.vertices, 3));
    geo.setIndex(new THREE.BufferAttribute(g.indices, 1));
    geo.computeVertexNormals();
    this.ground = new THREE.Mesh(geo, std(COLORS.ground, { flatShading: true }));
    this.scene.add(this.ground);
    for (const b of fixedBoxes()) {
      if (b.kind === 'bound') continue;
      const m = new THREE.Mesh(new THREE.BoxGeometry(b.half.x * 2, b.half.y * 2, b.half.z * 2), std(COLORS[b.kind]));
      m.position.set(b.pos.x, b.pos.y, b.pos.z);
      m.quaternion.set(b.rot.x, b.rot.y, b.rot.z, b.rot.w);
      this.scene.add(m);
    }
    const d = DOOR_BLOCK;
    this.doorMesh = new THREE.Mesh(new THREE.BoxGeometry(d.half.x * 2, d.half.y * 2, 0.08), std(COLORS.door));
    this.doorMesh.position.set(d.center.x, d.center.y, d.center.z);
    this.doorMesh.visible = false;
    this.scene.add(this.doorMesh);
  }

  // The navmesh debug draw. 'ours' builds one BufferGeometry from the backend's navmesh triangles
  // (what an engine-side, library-agnostic helper would do); 'library' uses the library's own
  // three.js helper (@recast-navigation/three NavMeshHelper, navcat/three createNavMeshHelper).
  async #buildNavDraw() {
    this.navGroup = new THREE.Group();
    this.scene.add(this.navGroup);
    if (this.draw === 'library') {
      if (this.backendName === 'navcat') {
        const { createNavMeshHelper } = await import('navcat/three');
        this.libHelper = () => createNavMeshHelper(this.be.raw().navMesh);
      } else {
        const { NavMeshHelper } = await import('@recast-navigation/three');
        this.libHelper = () => ({ object: new NavMeshHelper(this.be.raw().navMesh), dispose() {} });
      }
    }
    this.#refreshNavDraw();
  }

  #refreshNavDraw() {
    for (const c of [...this.navGroup.children]) { this.navGroup.remove(c); c.traverse((o) => { o.geometry?.dispose(); }); }
    this.libObj?.dispose?.();
    if (this.libHelper) {
      this.libObj = this.libHelper();
      this.libObj.object.position.y += 0.03;
      this.navGroup.add(this.libObj.object);
      return;
    }
    const { positions, indices } = this.be.debugTriangles();
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geo.setIndex(new THREE.BufferAttribute(indices, 1));
    const fill = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color: COLORS.nav, transparent: true, opacity: 0.35, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, side: THREE.DoubleSide }));
    const wire = new THREE.LineSegments(new THREE.WireframeGeometry(geo), new THREE.LineBasicMaterial({ color: 0x0b4f63, transparent: true, opacity: 0.5 }));
    fill.position.y = wire.position.y = 0.03;
    this.navGroup.add(fill, wire);
  }

  #buildAgents() {
    const capsule = new THREE.CapsuleGeometry(AGENT.radius, AGENT.height - AGENT.radius * 2, 4, 10);
    this.agentMesh = new THREE.InstancedMesh(capsule, new THREE.MeshStandardMaterial({ color: COLORS.agent, roughness: 0.6 }), this.n);
    this.agentMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.scene.add(this.agentMesh);
    this.m4 = new THREE.Matrix4();
  }

  #bindInput() {
    let drag = null;
    const ray = new THREE.Raycaster();
    const pd = (e) => { drag = { x: e.clientX, y: e.clientY, moved: false }; this.canvas.setPointerCapture(e.pointerId); };
    const pm = (e) => {
      if (!drag) return;
      const dx = e.clientX - drag.x, dy = e.clientY - drag.y;
      if (Math.abs(dx) + Math.abs(dy) > 3) drag.moved = true;
      this.cam.yaw -= dx * 0.005; this.cam.pitch = Math.min(1.45, Math.max(0.1, this.cam.pitch + dy * 0.005));
      drag.x = e.clientX; drag.y = e.clientY;
    };
    const pu = (e) => {
      if (drag && !drag.moved) {
        const r = this.canvas.getBoundingClientRect();
        ray.setFromCamera(new THREE.Vector2(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1), this.camera);
        const hit = ray.intersectObject(this.ground)[0];
        const p = hit && this.be.closestPoint([hit.point.x, hit.point.y, hit.point.z]);
        if (p) for (let i = 0; i < this.n; i++) this.sim.sendTo(i, p);
      }
      drag = null;
    };
    const wh = (e) => { e.preventDefault(); this.cam.dist = Math.min(80, Math.max(4, this.cam.dist * (1 + e.deltaY * 0.001))); };
    const kd = (e) => { if (e.key === 'd' || e.key === 'D') this.toggleDoor(); };
    this.canvas.addEventListener('pointerdown', pd);
    this.canvas.addEventListener('pointermove', pm);
    this.canvas.addEventListener('pointerup', pu);
    this.canvas.addEventListener('wheel', wh, { passive: false });
    addEventListener('keydown', kd);
    this.unbind = () => {
      this.canvas.removeEventListener('pointerdown', pd); this.canvas.removeEventListener('pointermove', pm);
      this.canvas.removeEventListener('pointerup', pu); this.canvas.removeEventListener('wheel', wh);
      removeEventListener('keydown', kd); this.ro?.disconnect();
    };
  }

  #frame = (now) => {
    if (!this.running) return;
    const dt = Math.min(0.1, (now - this.last) / 1000);
    this.last = now;
    this.frameTimes.push(dt);
    this.acc += dt;
    let lastStep = null;
    while (this.acc >= DT) { // fixed 60 Hz step
      lastStep = this.sim.run(1);
      this.crowdTimes.push(lastStep.timing.crowd.mean);
      this.physTimes.push(lastStep.timing.controllersAndPhysics.mean);
      this.acc -= DT;
    }
    const c = this.sim.chars;
    for (let i = 0; i < this.n; i++) {
      const t = c[i].body.translation();
      this.m4.makeTranslation(t.x, t.y, t.z);
      this.agentMesh.setMatrixAt(i, this.m4);
    }
    this.agentMesh.instanceMatrix.needsUpdate = true;
    const { yaw, pitch, dist, target } = this.cam;
    this.camera.position.set(target.x + Math.sin(yaw) * Math.cos(pitch) * dist, target.y + Math.sin(pitch) * dist, target.z + Math.cos(yaw) * Math.cos(pitch) * dist);
    this.camera.lookAt(target);
    this.renderer.render(this.scene, this.camera);
    if (lastStep) this.lastDrift = lastStep.drift.lastMean;
    if (now - this.statsAt > 500) {
      const avg = (a) => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : 0);
      this.onStats({
        bakeMs: +this.bakeInfo.ms.toFixed(1), polys: this.bakeInfo.polys, tiles: this.bakeInfo.tiles,
        crowdMs: avg(this.crowdTimes).toFixed(3), physicsMs: avg(this.physTimes).toFixed(3),
        fps: Math.round(1 / avg(this.frameTimes)), door: this.door, doorMs: this.doorMs, drift: this.lastDrift,
      });
      this.crowdTimes = []; this.physTimes = []; this.frameTimes = [];
      this.statsAt = now;
    }
    this.raf = requestAnimationFrame(this.#frame);
  };
}
