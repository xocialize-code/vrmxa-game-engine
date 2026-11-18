// Parsing VRMs and .vrma clips from bytes, the same way in Node and in a browser. With stubTextures,
// textures become empty THREE.Texture objects (the determinism spike's loader): nothing in the pose
// depends on pixels, and headless runs need no image decoding.
import { Texture } from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { VRMLoaderPlugin, VRMUtils } from '@vrmxg/three-vrm';
import { VRMAnimationLoaderPlugin } from '@pixiv/three-vrm-animation';

class StubTextures {
  constructor(parser) { this.parser = parser; this.name = 'VRMXG_stub_textures'; }
  loadTexture(index) { const t = new Texture(); t.name = `stub-${index}`; return Promise.resolve(t); }
}

const toBuffer = (bytes) => (bytes instanceof ArrayBuffer ? bytes.slice(0) : bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength));

/**
 * @param {Uint8Array | ArrayBuffer} bytes a .vrm (0.x is turned to face +Z like 1.0)
 * @param {{ stubTextures?: boolean }} [opts]
 */
export async function parseVRM(bytes, { stubTextures = false } = {}) {
  const loader = new GLTFLoader();
  if (stubTextures) loader.register((p) => new StubTextures(p));
  loader.register((p) => new VRMLoaderPlugin(p));
  const gltf = await loader.parseAsync(toBuffer(bytes), '');
  const vrm = gltf.userData.vrm;
  if (!vrm) throw new Error('not a VRM: no VRMC_vrm or VRM extension');
  VRMUtils.rotateVRM0(vrm); // facing goes on the parent node, never on vrm.scene (spike gotcha 3)
  vrm.scene.traverse((o) => { if (o.isMesh) o.frustumCulled = false; });
  return vrm;
}

/** @param {Uint8Array | ArrayBuffer} bytes a .vrma */
export async function parseVRMA(bytes) {
  const loader = new GLTFLoader();
  loader.register((p) => new VRMAnimationLoaderPlugin(p));
  const gltf = await loader.parseAsync(toBuffer(bytes), '');
  const anim = gltf.userData.vrmAnimations?.[0];
  if (!anim) throw new Error('not a .vrma: no VRMC_vrm_animation');
  return anim;
}
