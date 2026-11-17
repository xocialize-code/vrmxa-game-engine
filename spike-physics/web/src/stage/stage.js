// The interactive stage: three.js renders the Rapier sim from src/sim, a VRM rides the character
// capsule, spring bones and animation advance in the fixed physics step. Nothing here is Vue-reactive:
// the App keeps the Stage in a plain variable (markRaw) and receives plain-number stats.
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { VRMLoaderPlugin, VRMUtils } from '@pixiv/three-vrm';
import { VRMAnimationLoaderPlugin, createVRMAnimationClip } from '@pixiv/three-vrm-animation';
import { loadRapier, createSim, DT } from '../sim/rapier-scene.js';
import { groundMesh, fixedBoxes, dynamicBoxes, DOOR, CLOTH, PLAYER } from '../sim/level.js';

const COLORS = { ground: 0x6f8f72, wall: 0xb9b2a5, stair: 0x9a8f80, ramp: 0x8d8579, box: 0xd9a066, door: 0x7a5236, cloth: 0xc0392b };

export class Stage {
  constructor(canvas, { variant = 'deterministic', avatar = null, motions = {}, onStats = () => {} } = {}) {
    this.canvas = canvas;
    this.variant = variant;
    this.avatarUrl = avatar;
    this.motionUrls = motions;
    this.onStats = onStats;
    this.keys = new Set();
    this.cam = { yaw: 0, pitch: 0.35, dist: 6 };
    this.acc = 0;
    this.stepTimes = [];
    this.frameTimes = [];
    this.running = false;
    this.facing = 0;
  }

  async start() {
    const { R, version } = await loadRapier(this.variant);
    this.R = R;
    this.rapierVersion = version;
    this.sim = createSim(R, { boxes: 300, cloth: true, player: true, door: true });
    this.#setupThree();
    this.#buildMeshes();
    this.#bindInput();
    if (this.avatarUrl) await this.#loadAvatar().catch((e) => console.error('[stage] avatar failed', e));
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
  }

  // ---------------------------------------------------------------- three setup

  #setupThree() {
    const r = new THREE.WebGLRenderer({ canvas: this.canvas, antialias: true });
    r.setPixelRatio(Math.min(devicePixelRatio, 2));
    r.shadowMap.enabled = true;
    r.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer = r;
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0xa9c7e0);
    this.scene.fog = new THREE.Fog(0xa9c7e0, 25, 60);
    this.camera = new THREE.PerspectiveCamera(55, 1, 0.05, 200);
    this.scene.add(new THREE.HemisphereLight(0xdfefff, 0x56604f, 1.6));
    const sun = new THREE.DirectionalLight(0xffffff, 2.4);
    sun.position.set(8, 14, 6);
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    Object.assign(sun.shadow.camera, { left: -16, right: 16, top: 16, bottom: -16, near: 1, far: 40 });
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

  #buildMeshes() {
    const std = (color, extra = {}) => new THREE.MeshStandardMaterial({ color, roughness: 0.85, ...extra });

    const g = groundMesh();
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(g.vertices, 3));
    geo.setIndex(new THREE.BufferAttribute(g.indices, 1));
    geo.computeVertexNormals();
    const ground = new THREE.Mesh(geo, std(COLORS.ground, { flatShading: true }));
    ground.receiveShadow = true;
    this.scene.add(ground);

    for (const b of fixedBoxes()) {
      if (b.kind === 'bound') continue;
      const m = new THREE.Mesh(new THREE.BoxGeometry(b.half.x * 2, b.half.y * 2, b.half.z * 2), std(COLORS[b.kind]));
      m.position.set(b.pos.x, b.pos.y, b.pos.z);
      m.quaternion.set(b.rot.x, b.rot.y, b.rot.z, b.rot.w);
      m.castShadow = m.receiveShadow = true;
      this.scene.add(m);
    }

    const boxes = dynamicBoxes(this.sim.handles.boxes.length);
    this.boxScales = boxes.map((b) => new THREE.Vector3(b.half.x * 2, b.half.y * 2, b.half.z * 2));
    this.boxMesh = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), std(COLORS.box), boxes.length);
    this.boxMesh.castShadow = this.boxMesh.receiveShadow = true;
    this.boxMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.scene.add(this.boxMesh);

    const he = DOOR.halfExtents;
    this.doorMesh = new THREE.Mesh(new THREE.BoxGeometry(he.x * 2, he.y * 2, he.z * 2), std(COLORS.door));
    this.doorMesh.castShadow = true;
    this.scene.add(this.doorMesh);
    const sensor = DOOR.sensor;
    this.sensorMesh = new THREE.Mesh(
      new THREE.BoxGeometry(sensor.halfExtents.x * 2, sensor.halfExtents.y * 2, sensor.halfExtents.z * 2),
      new THREE.MeshBasicMaterial({ color: 0x44ff88, wireframe: true, transparent: true, opacity: 0.25 }),
    );
    this.sensorMesh.position.set(sensor.center.x, sensor.center.y, sensor.center.z);
    this.scene.add(this.sensorMesh);

    // Cloth: work out the generator's particle order from the positions, then index a grid.
    const sb = this.sim.world.getSoftBody(this.sim.handles.cloth);
    if (sb) {
      const p0 = sb.particlePosition(0), p1 = sb.particlePosition(1);
      const alongU = Math.abs(p1.x - p0.x - CLOTH.du.x) + Math.abs(p1.y - p0.y - CLOTH.du.y) + Math.abs(p1.z - p0.z - CLOTH.du.z) < 1e-4;
      const idx = (i, j) => (alongU ? j * CLOTH.nu + i : i * CLOTH.nv + j);
      const indices = [];
      for (let j = 0; j < CLOTH.nv - 1; j++) {
        for (let i = 0; i < CLOTH.nu - 1; i++) {
          indices.push(idx(i, j), idx(i, j + 1), idx(i + 1, j), idx(i + 1, j), idx(i, j + 1), idx(i + 1, j + 1));
        }
      }
      const cg = new THREE.BufferGeometry();
      cg.setAttribute('position', new THREE.BufferAttribute(new Float32Array(sb.particlePositions()), 3));
      cg.setIndex(indices);
      this.clothMesh = new THREE.Mesh(cg, std(COLORS.cloth, { side: THREE.DoubleSide }));
      this.clothMesh.castShadow = true;
      this.scene.add(this.clothMesh);
      const bar = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, CLOTH.du.x * (CLOTH.nu - 1) + 0.3), std(0x444444));
      bar.rotation.z = Math.PI / 2;
      bar.position.set(CLOTH.origin.x + (CLOTH.du.x * (CLOTH.nu - 1)) / 2, CLOTH.origin.y + 0.03, CLOTH.origin.z);
      this.scene.add(bar);
    }

    // The character capsule (shown until an avatar loads, and as an outline after).
    const capGeo = new THREE.CapsuleGeometry(PLAYER.radius, PLAYER.halfHeight * 2, 6, 12);
    this.capsule = new THREE.Mesh(capGeo, new THREE.MeshStandardMaterial({ color: 0x3355cc }));
    this.capsule.castShadow = true;
    this.scene.add(this.capsule);

    this.hitMarker = new THREE.Mesh(new THREE.SphereGeometry(0.06), new THREE.MeshBasicMaterial({ color: 0xff2266 }));
    this.hitMarker.visible = false;
    this.scene.add(this.hitMarker);
  }

  async #loadAvatar() {
    const loader = new GLTFLoader();
    loader.register((p) => new VRMLoaderPlugin(p));
    loader.register((p) => new VRMAnimationLoaderPlugin(p));
    const gltf = await loader.loadAsync(this.avatarUrl);
    const vrm = gltf.userData.vrm;
    VRMUtils.removeUnnecessaryVertices(vrm.scene);
    VRMUtils.combineSkeletons?.(vrm.scene);
    VRMUtils.rotateVRM0(vrm); // no-op for 1.0; turns 0.x models to face +Z like 1.0 (sets vrm.scene.rotation.y)
    vrm.scene.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.frustumCulled = false; } });
    // Position and facing go on a parent, never on vrm.scene: writing vrm.scene.rotation would undo
    // rotateVRM0 and leave 0.x models walking backwards (found in this spike).
    this.avatarRoot = new THREE.Group();
    this.avatarRoot.add(vrm.scene);
    this.scene.add(this.avatarRoot);
    this.vrm = vrm;
    this.vrmMeta = { version: vrm.meta?.metaVersion ?? '?', name: vrm.meta?.name ?? vrm.meta?.title ?? '', springJoints: vrm.springBoneManager?.joints?.size ?? 0 };
    this.capsule.material = new THREE.MeshBasicMaterial({ color: 0x3355cc, wireframe: true, transparent: true, opacity: 0.15 });
    this.capsule.castShadow = false;

    this.mixer = new THREE.AnimationMixer(vrm.scene);
    this.actions = {};
    for (const [key, url] of Object.entries(this.motionUrls)) {
      try {
        const a = await loader.loadAsync(url);
        const vrma = a.userData.vrmAnimations?.[0];
        if (!vrma) continue;
        const action = this.mixer.clipAction(createVRMAnimationClip(vrma, vrm));
        action.play();
        action.setEffectiveWeight(key === 'idle' ? 1 : 0);
        this.actions[key] = action;
      } catch (e) {
        console.warn('[stage] motion failed', key, e);
      }
    }
    this.walkWeight = 0;
  }

  // ---------------------------------------------------------------- input

  #bindInput() {
    const kd = (e) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLSelectElement) return;
      this.keys.add(e.code);
      if (['Space', 'ArrowUp', 'ArrowDown'].includes(e.code)) e.preventDefault();
    };
    const ku = (e) => this.keys.delete(e.code);
    let drag = null;
    const pd = (e) => { drag = { x: e.clientX, y: e.clientY, moved: 0 }; this.canvas.setPointerCapture(e.pointerId); };
    const pm = (e) => {
      if (!drag) return;
      const dx = e.clientX - drag.x, dy = e.clientY - drag.y;
      drag.moved += Math.abs(dx) + Math.abs(dy);
      drag.x = e.clientX; drag.y = e.clientY;
      this.cam.yaw -= dx * 0.005;
      this.cam.pitch = Math.min(1.3, Math.max(-0.2, this.cam.pitch + dy * 0.005));
    };
    const pu = (e) => {
      if (drag && drag.moved < 4) this.#poke(e);
      drag = null;
    };
    const wh = (e) => { this.cam.dist = Math.min(20, Math.max(2, this.cam.dist * (1 + Math.sign(e.deltaY) * 0.1))); e.preventDefault(); };
    addEventListener('keydown', kd);
    addEventListener('keyup', ku);
    this.canvas.addEventListener('pointerdown', pd);
    this.canvas.addEventListener('pointermove', pm);
    this.canvas.addEventListener('pointerup', pu);
    this.canvas.addEventListener('wheel', wh, { passive: false });
    this.unbind = () => {
      removeEventListener('keydown', kd);
      removeEventListener('keyup', ku);
      this.canvas.removeEventListener('pointerdown', pd);
      this.canvas.removeEventListener('pointermove', pm);
      this.canvas.removeEventListener('pointerup', pu);
      this.canvas.removeEventListener('wheel', wh);
      this.ro?.disconnect();
    };
  }

  /** Click: a Rapier ray cast from the camera; a dynamic body that is hit gets an impulse. */
  #poke(e) {
    const rect = this.canvas.getBoundingClientRect();
    const ndc = new THREE.Vector2(((e.clientX - rect.left) / rect.width) * 2 - 1, -((e.clientY - rect.top) / rect.height) * 2 + 1);
    const rc = new THREE.Raycaster();
    rc.setFromCamera(ndc, this.camera);
    const { origin: o, direction: d } = rc.ray;
    const { R, world, handles } = this.sim;
    const hit = world.castRay(new R.Ray(o, d), 100, true, undefined, undefined, world.getCollider(handles.playerCollider));
    if (!hit) return;
    const p = o.clone().addScaledVector(d, hit.timeOfImpact);
    this.hitMarker.position.copy(p);
    this.hitMarker.visible = true;
    this.hitAt = performance.now();
    const body = hit.collider.parent();
    if (body?.isDynamic()) {
      const m = body.mass();
      body.applyImpulseAtPoint({ x: d.x * 6 * m, y: (d.y + 0.3) * 6 * m, z: d.z * 6 * m }, p, true);
    }
    // Rapier handles are bit-cast floats: show the kind of body, not the handle.
    const kind = !body ? 'none' : body.isDynamic() ? 'dynamic' : body.isKinematic() ? 'kinematic' : 'fixed';
    this.lastPoke = { kind, dynamic: kind === 'dynamic', toi: +hit.timeOfImpact.toFixed(2) };
  }

  #input() {
    const k = this.keys;
    let f = 0, s = 0;
    if (k.has('KeyW') || k.has('ArrowUp')) f += 1;
    if (k.has('KeyS') || k.has('ArrowDown')) f -= 1;
    if (k.has('KeyD') || k.has('ArrowRight')) s += 1;
    if (k.has('KeyA') || k.has('ArrowLeft')) s -= 1;
    const sy = Math.sin(this.cam.yaw), cy = Math.cos(this.cam.yaw);
    let x = -sy * f + cy * s, z = -cy * f - sy * s;
    const len = Math.hypot(x, z);
    if (len > 0) { x /= len; z /= len; }
    return { x, z, jump: k.has('Space') };
  }

  // ---------------------------------------------------------------- loop

  #frame = (now) => {
    if (!this.running) return;
    const dt = Math.min(0.1, (now - this.last) / 1000);
    this.last = now;
    this.frameTimes.push(dt);
    this.acc += dt;
    const input = this.#input();
    let steps = 0;
    while (this.acc >= DT && steps < 5) {
      const t0 = performance.now();
      this.sim.step(input);
      this.stepTimes.push(performance.now() - t0);
      // Animation and spring bones advance in the same fixed step (VRMXA: deterministic 60 Hz).
      this.#updateAvatar(input);
      this.acc -= DT;
      steps++;
    }
    if (steps === 5) this.acc = 0; // fell behind: drop time rather than spiral
    this.#respawnIfLost();
    this.#sync();
    this.#updateCamera();
    this.renderer.render(this.scene, this.camera);
    if (now - this.statsAt > 250) this.#emitStats(now);
    this.raf = requestAnimationFrame(this.#frame);
  };

  /** Safety net for the interactive stage only (the sim itself stays a pure function of input). */
  #respawnIfLost() {
    const body = this.sim.world.getRigidBody(this.sim.handles.player);
    if (body.translation().y > -10) return;
    body.setTranslation(PLAYER.start, true);
    this.sim.js.vy = 0;
  }

  #updateAvatar(input) {
    if (!this.vrm) return;
    const moving = input.x !== 0 || input.z !== 0;
    if (moving) {
      const target = Math.atan2(input.x, input.z);
      let d = target - this.facing;
      d = Math.atan2(Math.sin(d), Math.cos(d));
      this.facing += d * 0.25;
    }
    if (this.actions?.walk && this.actions?.idle) {
      this.walkWeight += ((moving && this.sim.grounded ? 1 : 0) - this.walkWeight) * 0.15;
      this.actions.walk.setEffectiveWeight(this.walkWeight);
      this.actions.idle.setEffectiveWeight(1 - this.walkWeight);
    }
    this.mixer?.update(DT);
    this.vrm.update(DT);
  }

  #sync() {
    const { world, handles: h } = this.sim;
    const m = new THREE.Matrix4(), q = new THREE.Quaternion(), p = new THREE.Vector3();
    h.boxes.forEach((id, i) => {
      const b = world.getRigidBody(id);
      const t = b.translation(), r = b.rotation();
      m.compose(p.set(t.x, t.y, t.z), q.set(r.x, r.y, r.z, r.w), this.boxScales[i]);
      this.boxMesh.setMatrixAt(i, m);
    });
    this.boxMesh.instanceMatrix.needsUpdate = true;

    const door = world.getRigidBody(h.door);
    const dt = door.translation(), dr = door.rotation();
    this.doorMesh.position.set(dt.x, dt.y, dt.z);
    this.doorMesh.quaternion.set(dr.x, dr.y, dr.z, dr.w);
    this.doorAngle = 2 * Math.atan2(dr.y, dr.w);
    this.sensorMesh.material.color.set(this.sim.js.doorOpen ? 0xffcc33 : 0x44ff88);

    if (this.clothMesh) {
      const sb = world.getSoftBody(h.cloth);
      const attr = this.clothMesh.geometry.attributes.position;
      attr.array.set(sb.particlePositions());
      attr.needsUpdate = true;
      this.clothMesh.geometry.computeVertexNormals();
    }

    const pt = world.getRigidBody(h.player).translation();
    this.capsule.position.set(pt.x, pt.y, pt.z);
    if (this.vrm) {
      this.avatarRoot.position.set(pt.x, pt.y - (PLAYER.halfHeight + PLAYER.radius + 0.02), pt.z);
      this.avatarRoot.rotation.y = this.facing;
    }
    if (this.hitMarker.visible && performance.now() - this.hitAt > 600) this.hitMarker.visible = false;
  }

  #updateCamera() {
    const pt = this.capsule.position;
    const target = new THREE.Vector3(pt.x, pt.y + 0.5, pt.z);
    const { yaw, pitch, dist } = this.cam;
    this.camera.position.set(target.x + Math.sin(yaw) * Math.cos(pitch) * dist, target.y + Math.sin(pitch) * dist, target.z + Math.cos(yaw) * Math.cos(pitch) * dist);
    this.camera.lookAt(target);
  }

  #emitStats(now) {
    const st = this.stepTimes, ft = this.frameTimes;
    const mean = (a) => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : 0);
    let awake = 0;
    this.sim.world.bodies.forEach((b) => { if (b.isDynamic() && !b.isSleeping()) awake++; });
    this.onStats({
      stepMs: +mean(st).toFixed(3),
      stepMaxMs: +(st.length ? Math.max(...st) : 0).toFixed(3),
      fps: ft.length ? Math.round(1 / mean(ft)) : 0,
      awake,
      bodies: this.sim.world.bodies.len(),
      grounded: this.sim.grounded,
      doorOpen: this.sim.js.doorOpen,
      doorAngle: +(this.doorAngle ?? 0).toFixed(2),
      step: this.sim.js.step,
      rapier: `${this.rapierVersion} (${this.variant})`,
      avatar: this.vrmMeta ?? null,
      lastPoke: this.lastPoke ?? null,
    });
    this.stepTimes = [];
    this.frameTimes = [];
    this.statsAt = now;
  }
}
