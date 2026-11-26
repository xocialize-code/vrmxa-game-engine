// Target 1 (and 2's page): does this browser expose WebXR? No emulator and no engine here, so what it reports is the
// browser's own navigator.xr. Run it in WKWebView over the custom scheme and over loopback, with WebKit's feature flags as
// they ship and with the XR ones turned on (the Mac wrapper does that), in Chromium, and in Safari on visionOS.
import { run } from './report.js';

const MODES = ['inline', 'immersive-vr', 'immersive-ar'];
const GLOBALS = ['XRSystem', 'XRSession', 'XRFrame', 'XRView', 'XRWebGLLayer', 'XRWebGLBinding', 'XRGPUBinding', 'XRHand', 'XRInputSource',
  'XRRigidTransform', 'XRMediaBinding', 'XRProjectionLayer', 'XRLayer', 'XRReferenceSpace', 'XRTransientInputHitTestSource'];

const settle = (p, ms = 3000) => Promise.race([p.then((v) => ({ ok: v }), (e) => ({ error: `${e?.name ?? 'Error'}: ${e?.message ?? e}` })), new Promise((r) => setTimeout(() => r({ error: `no answer in ${ms} ms` }), ms))]);

run('probe', async () => {
  const xr = /** @type {any} */ (navigator).xr;
  const r = {
    isSecureContext: self.isSecureContext, crossOriginIsolated: self.crossOriginIsolated,
    xrInNavigator: 'xr' in navigator, xrType: typeof xr,
    globals: Object.fromEntries(GLOBALS.map((g) => [g, typeof self[g]])),
    permissionsPolicy: null, sessionSupported: {}, inlineSession: null, webgpu: null, webgl: null,
  };
  const pp = /** @type {any} */ (document).permissionsPolicy ?? /** @type {any} */ (document).featurePolicy;
  if (pp?.allowsFeature) r.permissionsPolicy = { 'xr-spatial-tracking': pp.allowsFeature('xr-spatial-tracking') };
  if (xr) {
    for (const m of MODES) r.sessionSupported[m] = await settle(xr.isSessionSupported(m));
    // an inline session needs no user activation and no device: if the API is there at all, this should work
    const s = await settle(xr.requestSession('inline'));
    if (s.ok) {
      const session = s.ok, info = { granted: true, enabledFeatures: session.enabledFeatures ?? null, visibilityState: session.visibilityState, frameRate: session.frameRate ?? null, supportedFrameRates: session.supportedFrameRates ? [...session.supportedFrameRates] : null };
      info.viewerSpace = await settle(session.requestReferenceSpace('viewer').then((x) => typeof x));
      info.localSpace = await settle(session.requestReferenceSpace('local').then((x) => typeof x));
      await settle(session.end());
      r.inlineSession = info;
    } else r.inlineSession = s;
  }
  // WebGPU: an adapter, and whether it takes xrCompatible (WebXR/WebGPU binding's request option)
  const gpu = /** @type {any} */ (navigator).gpu;
  if (gpu) {
    const a = await settle(gpu.requestAdapter());
    const ax = await settle(gpu.requestAdapter({ xrCompatible: true }));
    r.webgpu = { adapter: !!a.ok, adapterXrCompatible: ax.ok ? true : ax.error ?? false, features: a.ok ? [...a.ok.features].sort() : null, info: a.ok?.info ? { vendor: a.ok.info.vendor, architecture: a.ok.info.architecture } : null };
  } else r.webgpu = { adapter: false, navigatorGpu: false };
  // WebGL: the xrCompatible context attribute and makeXRCompatible
  const gl = /** @type {any} */ (document.createElement('canvas').getContext('webgl2', { xrCompatible: true }));
  r.webgl = { webgl2: !!gl, xrCompatibleAttr: gl ? gl.getContextAttributes().xrCompatible ?? null : null, makeXRCompatible: gl ? typeof gl.makeXRCompatible : null };
  if (gl?.makeXRCompatible) r.webgl.makeXRCompatibleResult = await settle(gl.makeXRCompatible().then(() => 'resolved'));
  return r;
});
