// Loading VRMs and .vrma clips from ArrayBuffers, identically in Node and in a browser.
// Textures are replaced by empty THREE.Texture objects: nothing in the pose depends on pixels, it
// keeps Node free of image decoding, and every runtime runs exactly the same load path.
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { VRMLoaderPlugin, VRMUtils } from '@pixiv/three-vrm';
import { VRMAnimationLoaderPlugin } from '@pixiv/three-vrm-animation';

class StubTextures {
  constructor(parser) { this.parser = parser; this.name = 'SPIKE_stub_textures'; }
  loadTexture(index) { const t = new THREE.Texture(); t.name = `stub-${index}`; return Promise.resolve(t); }
}

export async function parseVRM(buffer, { stubTextures = true } = {}) {
  const loader = new GLTFLoader();
  if (stubTextures) loader.register((p) => new StubTextures(p));
  loader.register((p) => new VRMLoaderPlugin(p));
  const gltf = await loader.parseAsync(buffer.slice(0), '');
  const vrm = gltf.userData.vrm;
  VRMUtils.rotateVRM0(vrm);
  vrm.scene.traverse((o) => { if (o.isMesh) o.frustumCulled = false; });
  return vrm;
}

export async function parseVRMA(buffer) {
  const loader = new GLTFLoader();
  loader.register((p) => new VRMAnimationLoaderPlugin(p));
  const gltf = await loader.parseAsync(buffer.slice(0), '');
  return gltf.userData.vrmAnimations[0];
}
