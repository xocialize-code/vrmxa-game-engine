// A deterministic "anime shot": a VRM walking (.vrma), spring-bone hair and clothes, MToon, shadows,
// a moving camera and some props. Time never comes from the wall clock: renderFrame(n, fps) advances a
// fixed-step simulation (SIM_HZ) to t = n / fps and renders. Frames must be rendered in order from
// reset(), because spring bones carry state from step to step (random access means re-simulating).
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { VRMLoaderPlugin, VRMUtils } from '@pixiv/three-vrm';
import { VRMAnimationLoaderPlugin, createVRMAnimationClip } from '@pixiv/three-vrm-animation';

/** Simulation rate: animation, spring bones and MToon all advance in steps of 1/SIM_HZ s. 120 divides 24, 30, 60 and 120. */
export const SIM_HZ = 120;

export class Shot {
  constructor(canvas) {
    this.canvas = canvas;
    this.step = 0;
    this.width = 0;
    this.height = 0;
    this.alpha = false;
  }

  async load({ avatar = 'models/vroid10.vrm', motion = 'models/walk.vrma' } = {}) {
    // alpha: true so a transparent clear survives into readPixels / VideoFrame; preserveDrawingBuffer is
    // NOT needed because every reader runs in the same task as the render.
    const r = new THREE.WebGLRenderer({ canvas: this.canvas, antialias: true, alpha: true, powerPreference: 'high-performance' });
    r.setPixelRatio(1);
    r.shadowMap.enabled = true;
    r.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer = r;
    this.gl = r.getContext();

    const scene = (this.scene = new THREE.Scene());
    this.camera = new THREE.PerspectiveCamera(35, 16 / 9, 0.05, 100);
    scene.add(this.camera);

    scene.add(new THREE.HemisphereLight(0xeaf2ff, 0x6a5f55, 1.4));
    const sun = new THREE.DirectionalLight(0xffffff, 2.6);
    sun.position.set(3, 6, 4);
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    Object.assign(sun.shadow.camera, { left: -6, right: 6, top: 6, bottom: -6, near: 0.5, far: 20 });
    sun.shadow.bias = -0.0005;
    scene.add(sun, sun.target);
    this.sun = sun;

    // Sky: a vertex-coloured dome (kept out of the alpha export).
    const skyGeo = new THREE.SphereGeometry(40, 32, 16);
    const col = [];
    const pos = skyGeo.attributes.position;
    for (let i = 0; i < pos.count; i++) {
      const k = THREE.MathUtils.clamp(pos.getY(i) / 40, 0, 1);
      const c = new THREE.Color(0xfbd3b4).lerp(new THREE.Color(0x5b8fd6), Math.sqrt(k));
      col.push(c.r, c.g, c.b);
    }
    skyGeo.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
    this.sky = new THREE.Mesh(skyGeo, new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.BackSide, fog: false }));
    scene.add(this.sky);

    // Ground: a generated, high-frequency checker + noise texture (integer hash, no Math.random).
    const N = 512;
    const tex = new Uint8Array(N * N * 4);
    for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
      let h = (x * 374761393 + y * 668265263) >>> 0; h = ((h ^ (h >>> 13)) * 1274126177) >>> 0;
      const check = ((x >> 5) + (y >> 5)) & 1;
      const v = (check ? 190 : 120) + (h & 31) - 16;
      const i = (y * N + x) * 4;
      tex[i] = v; tex[i + 1] = v * 0.92; tex[i + 2] = v * 0.8; tex[i + 3] = 255;
    }
    const groundTex = new THREE.DataTexture(tex, N, N);
    groundTex.colorSpace = THREE.SRGBColorSpace;
    groundTex.wrapS = groundTex.wrapT = THREE.RepeatWrapping;
    groundTex.repeat.set(8, 8);
    groundTex.magFilter = THREE.LinearFilter;
    groundTex.minFilter = THREE.LinearMipmapLinearFilter;
    groundTex.generateMipmaps = true;
    groundTex.anisotropy = 8;
    groundTex.needsUpdate = true;
    const ground = new THREE.Mesh(new THREE.PlaneGeometry(30, 30), new THREE.MeshStandardMaterial({ map: groundTex, roughness: 0.9 }));
    ground.rotation.x = -Math.PI / 2;
    ground.receiveShadow = true;
    this.ground = ground;
    scene.add(ground);

    // Props: a ring of boxes that spin with t.
    this.props = [];
    for (let i = 0; i < 12; i++) {
      const m = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.3, 0.3), new THREE.MeshStandardMaterial({ color: new THREE.Color().setHSL(i / 12, 0.6, 0.55) }));
      const a = (i / 12) * Math.PI * 2;
      m.position.set(Math.cos(a) * 3.2, 0.4, Math.sin(a) * 3.2);
      m.castShadow = m.receiveShadow = true;
      scene.add(m);
      this.props.push(m);
    }

    // A/V sync marker: a white square glued to the camera's lower-right corner, lit only on frames
    // that start a whole second (n % fps == 0). The audio track beeps at the same instants.
    this.flash = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial({ color: 0xffffff, depthTest: false, depthWrite: false, fog: false }));
    this.flash.renderOrder = 999;
    this.flash.frustumCulled = false;
    this.camera.add(this.flash);

    // The avatar.
    const loader = new GLTFLoader();
    loader.register((p) => new VRMLoaderPlugin(p));
    loader.register((p) => new VRMAnimationLoaderPlugin(p));
    const gltf = await loader.loadAsync(avatar);
    const vrm = gltf.userData.vrm;
    VRMUtils.removeUnnecessaryVertices(vrm.scene);
    VRMUtils.combineSkeletons(vrm.scene);
    VRMUtils.rotateVRM0(vrm);
    vrm.scene.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.frustumCulled = false; } });
    this.avatarRoot = new THREE.Group();
    this.avatarRoot.add(vrm.scene);
    scene.add(this.avatarRoot);
    this.vrm = vrm;
    this.hips = vrm.humanoid.getNormalizedBoneNode('hips');

    const a = await loader.loadAsync(motion);
    this.mixer = new THREE.AnimationMixer(vrm.scene);
    this.action = this.mixer.clipAction(createVRMAnimationClip(a.userData.vrmAnimations[0], vrm));
    this.info = {
      vrmVersion: vrm.meta?.metaVersion ?? '?',
      springJoints: vrm.springBoneManager?.joints?.size ?? 0,
      clipSeconds: this.action.getClip().duration,
      three: THREE.REVISION,
      simHz: SIM_HZ,
    };
    this.reset();
  }

  /** Output size and background. The canvas's drawing buffer is the export resolution; its CSS size is independent. */
  configure({ width, height, alpha = false }) {
    if (width !== this.width || height !== this.height) {
      this.renderer.setSize(width, height, false);
      this.width = width; this.height = height;
      this.camera.aspect = width / height;
      this.camera.updateProjectionMatrix();
      // Flash square: 6% of the frame height, lower-right, 1 unit in front of the camera.
      const hh = Math.tan(THREE.MathUtils.degToRad(this.camera.fov / 2)), hw = hh * this.camera.aspect, s = hh * 0.12;
      this.flash.scale.set(s, s, 1);
      this.flash.position.set(hw - s * 0.75, -hh + s * 0.75, -1);
    }
    this.alpha = alpha;
    this.sky.visible = !alpha;
    this.ground.visible = !alpha;
    this.renderer.setClearColor(alpha ? 0x000000 : 0x808080, alpha ? 0 : 1);
  }

  /** Back to t = 0: animation time, spring bones, step counter. */
  reset() {
    this.step = 0;
    this.mixer.stopAllAction();
    this.action.reset().play();
    this.mixer.setTime(0);
    this.vrm.update(0);
    this.vrm.springBoneManager?.reset();
  }

  /** Fixed-step advance to the step that contains `t` (exact for fps dividing SIM_HZ). */
  advanceTo(t) {
    const target = Math.round(t * SIM_HZ);
    const dt = 1 / SIM_HZ;
    if (target < this.step) throw new Error(`advanceTo(${t}): cannot go back from step ${this.step}; reset() first`);
    while (this.step < target) {
      this.mixer.update(dt);
      this.vrm.update(dt); // humanoid → expressions → look-at → spring bones → MToon time
      this.step++;
    }
  }

  /** Everything that is a pure function of t (camera, props, flash) is set here, not integrated. */
  #pose(n, fps) {
    const t = this.step / SIM_HZ;
    this.vrm.scene.updateMatrixWorld(true);
    const hp = new THREE.Vector3();
    this.hips.getWorldPosition(hp);
    const ang = 0.6 + 0.35 * t;
    this.camera.position.set(hp.x + Math.sin(ang) * 3.0, 1.35 + 0.15 * Math.sin(t * 0.8), hp.z + Math.cos(ang) * 3.0);
    this.camera.lookAt(hp.x, 1.0, hp.z);
    this.sun.position.set(hp.x + 3, 6, hp.z + 4);
    this.sun.target.position.set(hp.x, 0, hp.z);
    this.props.forEach((m, i) => { m.rotation.set(t * (0.5 + i * 0.07), t * 0.9, 0); m.position.y = 0.4 + 0.2 * Math.sin(t * 2 + i); });
    this.flash.visible = n % fps === 0;
  }

  /** Simulate to frame n at `fps` and draw it into the canvas's drawing buffer. */
  renderFrame(n, fps) {
    this.advanceTo(n / fps);
    this.#pose(n, fps);
    this.renderer.render(this.scene, this.camera);
  }

  /** Asynchronous readback, WebGL2 style: readPixels into a pixel-pack buffer now, copy it out a frame later. */
  readToPBO(slot) {
    const gl = this.gl, size = this.width * this.height * 4;
    this.pbos ??= [];
    let p = this.pbos[slot];
    if (!p || p.size !== size) {
      if (p) gl.deleteBuffer(p.buf);
      p = this.pbos[slot] = { buf: gl.createBuffer(), size, fence: null };
      gl.bindBuffer(gl.PIXEL_PACK_BUFFER, p.buf);
      gl.bufferData(gl.PIXEL_PACK_BUFFER, size, gl.STREAM_READ);
    }
    gl.bindBuffer(gl.PIXEL_PACK_BUFFER, p.buf);
    gl.readPixels(0, 0, this.width, this.height, gl.RGBA, gl.UNSIGNED_BYTE, 0);
    gl.bindBuffer(gl.PIXEL_PACK_BUFFER, null);
    p.fence = gl.fenceSync(gl.SYNC_GPU_COMMANDS_COMPLETE, 0);
    gl.flush();
  }

  fromPBO(slot, out) {
    const gl = this.gl, p = this.pbos[slot];
    gl.clientWaitSync(p.fence, 0, 0);
    gl.deleteSync(p.fence);
    gl.bindBuffer(gl.PIXEL_PACK_BUFFER, p.buf);
    gl.getBufferSubData(gl.PIXEL_PACK_BUFFER, 0, out);
    gl.bindBuffer(gl.PIXEL_PACK_BUFFER, null);
    return out;
  }

  /** Synchronous readback of the default framebuffer: RGBA8, bottom-up rows, premultiplied when alpha. */
  readPixels(out) {
    const gl = this.gl;
    gl.readPixels(0, 0, this.width, this.height, gl.RGBA, gl.UNSIGNED_BYTE, out);
    return out;
  }
}
