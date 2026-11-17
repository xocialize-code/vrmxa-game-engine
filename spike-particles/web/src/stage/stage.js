// The showcase stage: a VRM with MToon, a flat anime-style backdrop, and one effect from one library,
// stepped at a fixed 1/60 s. Frames are reached by stepping from 0 (or seeking, for stateless), so
// a shot is reproducible: ?shot=impact&lib=quarks&frame=5 renders the same image every time.
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { VRMLoaderPlugin, VRMUtils } from '@pixiv/three-vrm';
import { VRMAnimationLoaderPlugin, createVRMAnimationClip } from '@pixiv/three-vrm-animation';
import { GPURenderer } from 'three-nebula';
import * as quarks from '../libs/quarks.js';
import * as nebula from '../libs/nebula.js';
import * as stateless from '../libs/stateless.js';

const DT = 1 / 60;

// Where each effect sits relative to the character (metres, character at the origin facing +Z).
export const PLACEMENT = {
  impact: { pos: [0.32, 1.22, 0.42], frame: 5 },
  sparkles: { pos: [0, 1.35, 0.05], frame: 150 },
  speedlines: { pos: [1.4, 1.0, 0.1], frame: 90 },
  sweatdrop: { bone: 'head', pos: [0.13, 0.12, 0.06], frame: 40 },
};
export const LIB_EFFECTS = {
  quarks: Object.keys(quarks.effects),
  nebula: Object.keys(nebula.effects),
  stateless: Object.keys(stateless.effects),
};

export class Stage {
  constructor(canvas, { preserve = false } = {}) {
    this.canvas = canvas;
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, preserveDrawingBuffer: preserve });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x6f86b8);
    this.camera = new THREE.PerspectiveCamera(30, 1, 0.05, 50);
    this.camera.position.set(0.25, 1.3, 3.1);
    this.camera.lookAt(0.15, 1.15, 0);
    this.scene.add(new THREE.HemisphereLight(0xffffff, 0x8899bb, 1.4));
    const sun = new THREE.DirectionalLight(0xffffff, 2.2);
    sun.position.set(1.5, 3, 2.5);
    this.scene.add(sun);
    // a simple backdrop: a soft radial floor disc and a darker horizon band for contrast
    const floor = new THREE.Mesh(new THREE.CircleGeometry(3, 48), new THREE.MeshBasicMaterial({ color: 0x9fb2d8 }));
    floor.rotation.x = -Math.PI / 2;
    this.scene.add(floor);
    this.fx = new THREE.Group();
    this.scene.add(this.fx);
    this.world = null;
    this.resize();
  }

  resize(w = this.canvas.clientWidth || 1280, h = this.canvas.clientHeight || 800) {
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  }

  async loadAvatar(url, idleUrl) {
    const loader = new GLTFLoader();
    loader.register((p) => new VRMLoaderPlugin(p));
    loader.register((p) => new VRMAnimationLoaderPlugin(p));
    const gltf = await loader.loadAsync(url);
    const vrm = gltf.userData.vrm;
    VRMUtils.removeUnnecessaryVertices(vrm.scene);
    VRMUtils.rotateVRM0(vrm);
    vrm.scene.traverse((o) => { o.frustumCulled = false; });
    this.holder = new THREE.Group(); // position/facing go on a parent (spike-physics gotcha 3)
    this.holder.rotation.y = 0.35; // three-quarter view, turned toward the impact side
    this.holder.add(vrm.scene);
    this.scene.add(this.holder);
    this.vrm = vrm;
    if (idleUrl) {
      const a = await loader.loadAsync(idleUrl);
      const vrma = a.userData.vrmAnimations?.[0];
      if (vrma) {
        this.mixer = new THREE.AnimationMixer(vrm.scene);
        this.mixer.clipAction(createVRMAnimationClip(vrma, vrm)).play();
      }
    }
    this.poseAt(0);
    return vrm;
  }

  /** Deterministic pose: the idle clip at a fixed time, spring bones settled by fixed steps. */
  poseAt(t) {
    if (!this.vrm) return;
    if (this.mixer) this.mixer.setTime(t);
    this.vrm.update(0);
    for (let i = 0; i < 90; i++) this.vrm.springBoneManager?.update(DT);
    this.vrm.scene.updateMatrixWorld(true);
  }

  clearEffect() {
    this.world?.dispose();
    this.world = null;
    this.fx.clear();
  }

  /** Build `effect` from `lib` at its placement. Returns the adapter world. */
  setEffect(lib, effect, seed = 1) {
    this.clearEffect();
    const place = PLACEMENT[effect];
    const anchor = new THREE.Group();
    anchor.position.set(...place.pos);
    if (place.bone && this.vrm) {
      const bone = this.vrm.humanoid.getNormalizedBoneNode(place.bone) ?? this.vrm.humanoid.getRawBoneNode(place.bone);
      bone.add(anchor);
    } else {
      this.holder ? this.holder.add(anchor) : this.fx.add(anchor);
    }
    this.anchor = anchor;
    if (lib === 'quarks') {
      const w = quarks.createWorld({ seed, seeding: 'frame', scene: this.scene });
      w.add(quarks.effects[effect](w), anchor);
      this.world = w;
    } else if (lib === 'nebula') {
      const w = nebula.createWorld({ seed, scene: this.scene, renderer: new GPURenderer(this.scene, THREE) });
      const ems = nebula.effects[effect](w);
      this.scene.updateMatrixWorld(true);
      const p = anchor.getWorldPosition(new THREE.Vector3());
      for (const e of ems) { e.position.x += p.x; e.position.y += p.y; e.position.z += p.z; }
      w.add(ems);
      this.world = w;
    } else {
      const w = stateless.createWorld({ seed, scene: this.scene });
      w.add(stateless.effects[effect](), anchor);
      this.world = w;
    }
    return this.world;
  }

  /** Step from frame 0 to `frame` (stateless seeks). */
  goTo(frame) {
    if (!this.world) return;
    if (this.world.lib === 'stateless') { this.world.seek(frame, DT); return; }
    while (this.world.frame < frame) this.world.step(DT);
  }

  render() {
    this.renderer.render(this.scene, this.camera);
    return this.renderer.info.render.calls;
  }
}
