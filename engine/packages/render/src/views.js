// What the render host shows for nodes that are presentation only: lights, the Environment, shadow casting
// on characters and models. A view is built when its node enters the tree and dropped when it leaves; its
// three.js objects hang under the node (so they follow the node, interpolated) or under the host's scene,
// all marked `userData.presentation` so interpolation and snapshots skip them. Props are re-applied when
// they change. Nothing here writes to a node.
import {
  AmbientLight, Color, DataTexture, DirectionalLight, EquirectangularReflectionMapping, Fog, FogExp2, Mesh,
  MeshStandardMaterial, Object3D, PlaneGeometry, PointLight, SRGBColorSpace, SpotLight,
  NeutralToneMapping, AgXToneMapping, ACESFilmicToneMapping, NoToneMapping,
} from 'three';

/** Shadow presets: map size and bias. */
export const SHADOW_PRESETS = {
  low: { mapSize: 512, bias: -0.0008, normalBias: 0.04 },
  medium: { mapSize: 1024, bias: -0.0005, normalBias: 0.03 },
  high: { mapSize: 2048, bias: -0.0003, normalBias: 0.02 },
  ultra: { mapSize: 4096, bias: -0.0002, normalBias: 0.015 },
};

export const TONE_MAPPINGS = { neutral: NeutralToneMapping, agx: AgXToneMapping, aces: ACESFilmicToneMapping, none: NoToneMapping };

/** What the scene looks like with no Environment node. */
export const DEFAULT_ENVIRONMENT = {
  background: 'color', backgroundColor: '#c9d3df', skyTopColor: '#6f9bd1', skyHorizonColor: '#dfe7ef',
  environment: 'room', environmentIntensity: 0.4, ambientColor: '#ffffff', ambientIntensity: 0.6,
  fog: 'none', fogColor: '#c9d3df', fogNear: 10, fogFar: 60, fogDensity: 0.02,
  toneMapping: 'neutral', exposure: 1, ground: false, groundColor: '#9aa3ad', groundSize: 40,
};

const mark = (o) => { o.userData.presentation = true; return o; };
const deg = Math.PI / 180;

function applyShadow(light, props, presetDefault = 'medium') {
  light.castShadow = !!props.castShadow;
  const pr = SHADOW_PRESETS[props.shadowPreset ?? presetDefault] ?? SHADOW_PRESETS.medium;
  if (light.shadow.mapSize.x !== pr.mapSize) { light.shadow.mapSize.set(pr.mapSize, pr.mapSize); light.shadow.map?.dispose(); light.shadow.map = null; }
  light.shadow.bias = pr.bias; light.shadow.normalBias = pr.normalBias;
  light.shadow.autoUpdate = (props.shadowUpdate ?? 'always') === 'always';
  light.shadow.needsUpdate = true;
}

class LightView {
  constructor(node) {
    this.node = node; this.key = '';
    const T = node.type;
    this.light = mark(T === 'DirectionalLight' ? new DirectionalLight() : T === 'SpotLight' ? new SpotLight() : new PointLight());
    this.light.name = `${node.id}:light`;
    node.object3d.add(this.light);
    if (this.light.target) { this.target = mark(new Object3D()); node.object3d.add(this.target); this.light.target = this.target; }
    this.matrixKey = '';
  }
  update() {
    const p = this.node.props, key = JSON.stringify(p);
    const L = /** @type {any} */ (this.light);
    if (key !== this.key) {
      this.key = key;
      L.color.set(p.color ?? '#ffffff');
      L.intensity = p.intensity ?? (L.isDirectionalLight ? 2 : L.isSpotLight ? 10 : 1);
      if (L.isDirectionalLight) {
        const e = p.shadowExtent ?? 8, cam = L.shadow.camera;
        L.position.set(0, 0, e * 2); this.target.position.set(0, 0, 0); // along the node's -Z, box centred on the node
        cam.left = -e; cam.right = e; cam.top = e; cam.bottom = -e; cam.near = 0.1; cam.far = e * 4; cam.updateProjectionMatrix();
      } else {
        L.position.set(0, 0, 0); L.distance = p.range ?? 10; L.decay = 2; // three starts spot lights 1 m up
        if (L.isSpotLight) { L.angle = (p.angle ?? 30) * deg; L.penumbra = p.penumbra ?? 0.2; this.target.position.set(0, 0, -1); }
        L.shadow.camera.near = 0.05; L.shadow.camera.far = p.range || 10;
      }
      applyShadow(L, { castShadow: p.castShadow ?? L.isDirectionalLight, shadowPreset: p.shadowPreset, shadowUpdate: p.shadowUpdate });
    }
    // A frozen map is re-rendered when the light moves.
    if (!L.shadow.autoUpdate) {
      const e = this.node.object3d.matrixWorld.elements, mk = e.join(',');
      if (mk !== this.matrixKey) { this.matrixKey = mk; L.shadow.needsUpdate = true; }
    }
  }
  dispose() { this.light.shadow?.map?.dispose(); this.light.removeFromParent(); this.target?.removeFromParent(); this.light.dispose(); }
}

/** A vertical gradient as an equirectangular background: top colour overhead, horizon colour from the horizon down. */
function gradientTexture(top, horizon) {
  const h = 64, data = new Uint8Array(h * 4), a = new Color(top), b = new Color(horizon);
  for (let y = 0; y < h; y++) {
    const v = y / (h - 1);                    // 0 = top row
    const t = Math.min(1, v * 2);             // the upper half blends top → horizon
    const c = a.clone().lerp(b, t);
    data.set([Math.round(c.r * 255), Math.round(c.g * 255), Math.round(c.b * 255), 255], y * 4);
  }
  const tex = new DataTexture(data, 1, h);
  tex.flipY = false; tex.mapping = EquirectangularReflectionMapping; tex.colorSpace = SRGBColorSpace; tex.needsUpdate = true;
  return tex;
}

/** The scene's environment from an Environment node's props (or the defaults). */
export class EnvironmentView {
  /** @param {import('./host.js').RenderHost} host */
  constructor(host) {
    this.host = host; this.key = '';
    this.ambient = mark(new AmbientLight());
    this.ambient.name = 'environment:ambient';
    host.scene.add(this.ambient);
    this.ground = null; this.gradient = null; this.gradientKey = '';
  }
  update(props) {
    const p = { ...DEFAULT_ENVIRONMENT, ...props }, key = JSON.stringify(p);
    if (key === this.key) return;
    this.key = key;
    const { scene, renderer } = this.host;
    renderer.toneMapping = TONE_MAPPINGS[p.toneMapping] ?? NeutralToneMapping;
    renderer.toneMappingExposure = p.exposure;
    // the post stack (M2 W3): the scene's `post` effects; while it runs it does the tone mapping itself
    this.host.post?.configure(p.post ?? null, { toneMapping: p.toneMapping, exposure: p.exposure });
    const env = p.environment === 'room' ? this.host.roomEnvironment() : null;
    scene.environment = env;
    scene.environmentIntensity = p.environmentIntensity;
    if (p.background === 'color') scene.background = new Color(p.backgroundColor);
    else if (p.background === 'gradient') {
      const gk = p.skyTopColor + p.skyHorizonColor;
      if (gk !== this.gradientKey) { this.gradient?.dispose(); this.gradient = gradientTexture(p.skyTopColor, p.skyHorizonColor); this.gradientKey = gk; }
      scene.background = this.gradient;
    } else if (p.background === 'environment') scene.background = env;
    else scene.background = null;
    this.ambient.color.set(p.ambientColor); this.ambient.intensity = p.ambientIntensity;
    scene.fog = p.fog === 'linear' ? new Fog(p.fogColor, p.fogNear, p.fogFar) : p.fog === 'exponential' ? new FogExp2(p.fogColor, p.fogDensity) : null;
    if (p.ground && !this.ground) {
      this.ground = mark(new Mesh(new PlaneGeometry(1, 1), new MeshStandardMaterial({ roughness: 0.95 })));
      this.ground.name = 'environment:ground';
      this.ground.rotation.x = -Math.PI / 2; // presentation object, not simulated
      this.ground.receiveShadow = true;
      scene.add(this.ground);
    }
    if (this.ground) {
      this.ground.visible = !!p.ground;
      this.ground.scale.set(p.groundSize, p.groundSize, 1);
      /** @type {any} */ (this.ground.material).color.set(p.groundColor);
    }
  }
  dispose() {
    this.ambient.removeFromParent(); this.gradient?.dispose();
    if (this.ground) { this.ground.removeFromParent(); this.ground.geometry.dispose(); /** @type {any} */ (this.ground.material).dispose(); }
  }
}

/** Keeps a view per presentation node in step with the tree. */
export class Views {
  /** @param {import('./host.js').RenderHost} host */
  constructor(host) {
    this.host = host;
    /** @type {Map<any, LightView>} */ this.lights = new Map();
    /** @type {Set<any>} */ this.shadowed = new Set();
    this.environment = new EnvironmentView(host);
    this.envNode = null;
    this.version = -1;
    this.tree = null;
  }
  /** Drop every node view (attaching another tree). The environment view stays: it belongs to the host. */
  reset() { for (const v of this.lights.values()) v.dispose(); this.lights.clear(); this.shadowed.clear(); this.envNode = null; this.version = -1; this.tree = null; }

  sync(tree) {
    if (tree !== this.tree) { this.reset(); this.tree = tree; }
    if (tree.structureVersion === this.version) return;
    this.version = tree.structureVersion;
    const live = new Set(tree.all());
    for (const [n, v] of this.lights) if (!live.has(n)) { v.dispose(); this.lights.delete(n); }
    for (const n of this.shadowed) if (!live.has(n)) this.shadowed.delete(n);
    this.envNode = null;
    for (const n of live) {
      if ((n.type === 'DirectionalLight' || n.type === 'PointLight' || n.type === 'SpotLight') && !this.lights.has(n)) this.lights.set(n, new LightView(n));
      else if (n.type === 'Environment' && !this.envNode) this.envNode = n;
      else if ((n.type === 'Character' || n.type === 'Model' || n.type === 'Item') && !this.shadowed.has(n)) {
        this.shadowed.add(n);
        const cast = n.props.castShadow ?? true, receive = n.props.receiveShadow ?? true;
        n.object3d.traverse((o) => { if (o.isMesh && !o.userData.presentation) { o.castShadow = cast; o.receiveShadow = receive; if (o.isSkinnedMesh) o.frustumCulled = false; } });
      }
    }
  }
  update(tree) {
    this.sync(tree);
    for (const v of this.lights.values()) v.update();
    this.environment.update(this.envNode?.props ?? {});
    if (this.host.post) this.markCharacters(tree);
  }
  /** Characters on the post stack's mask layer (2), so screen-space edges skip them (they keep MToon's outline). */
  markCharacters(tree) {
    for (const n of tree.all()) {
      const any = /** @type {any} */ (n);
      if (n.type !== 'Character' || !any.vrm || any._maskedVrm === any.vrm) continue;
      any._maskedVrm = any.vrm;
      n.object3d.traverse((o) => o.layers.enable(2));
    }
  }

  dispose() { for (const v of this.lights.values()) v.dispose(); this.lights.clear(); this.environment.dispose(); }
}
