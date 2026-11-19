// Picks the three.js build by ?three=: r187 (default, the repo root's node_modules) or dev (a three.js checkout that
// serve.mjs serves at /__three-dev/ when THREE_DEV is set). Must run before any module script.
// For an upstream report, replace this with a plain import map to a CDN build.
(() => {
  const which = new URLSearchParams(location.search).get('three') ?? 'r187';
  const imports = which === 'dev'
    ? { three: '/__three-dev/src/Three.WebGPU.js', 'three/webgpu': '/__three-dev/src/Three.WebGPU.js', 'three/tsl': '/__three-dev/src/Three.TSL.js', 'three/addons/': '/__three-dev/examples/jsm/' }
    : { three: '/node_modules/three/build/three.webgpu.js', 'three/webgpu': '/node_modules/three/build/three.webgpu.js', 'three/tsl': '/node_modules/three/build/three.tsl.js', 'three/addons/': '/node_modules/three/examples/jsm/' };
  const s = document.createElement('script');
  s.type = 'importmap';
  s.textContent = JSON.stringify({ imports });
  document.currentScript.after(s);
  window.THREE_BUILD = which;
  // Capture console errors and warnings (three reports WGSL and pipeline errors there).
  window.__log = [];
  for (const k of ['error', 'warn']) { const o = console[k].bind(console); console[k] = (...a) => { window.__log.push(`${k}: ${a.map(String).join(' ')}`.slice(0, 400)); o(...a); }; }
  addEventListener('error', (e) => window.__log.push(`pageerror: ${e.message}`));
  addEventListener('unhandledrejection', (e) => window.__log.push(`rejection: ${e.reason?.message ?? e.reason}`));
  // Every page ends with report(): prints PASS/FAIL and its observation, and hands the result to chromium.mjs.
  window.report = (result) => {
    result = { three: which, ...result, log: window.__log.slice(0, 6).map((l) => l.slice(0, 200)) };
    const pre = document.createElement('pre');
    pre.style.cssText = `font:13px ui-monospace,monospace;white-space:pre-wrap;color:${result.pass ? '#060' : '#a00'}`;
    pre.textContent = `${result.pass ? 'PASS' : 'FAIL'} (three ${which})\n${result.observation}\n\n${JSON.stringify(result, null, 1)}`;
    document.body.prepend(pre);
    window.__result = result; window.__shots = []; window.READY = true;
  };
})();
