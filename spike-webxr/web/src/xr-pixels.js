// Spot pixels from an XR session's WebGL layer, read in the frame callback right after the draw.
/** A 5 x 5 grid of RGBA pixels inside each eye's viewport of the session's WebGL layer, and what they say. */
export function readEyes(renderer, session, pose, f) {
  const gl = renderer.backend?.gl, layer = session.renderState.baseLayer;
  if (!gl || !layer) return { frame: f, error: `no ${gl ? 'base layer' : 'WebGL context'}` };
  const prev = gl.getParameter(gl.READ_FRAMEBUFFER_BINDING);
  gl.bindFramebuffer(gl.READ_FRAMEBUFFER, layer.framebuffer ?? null);
  const px = new Uint8Array(4), eyes = {};
  for (const v of pose.views) {
    const vp = layer.getViewport(v), grid = [];
    for (let j = 1; j <= 5; j++) for (let i = 1; i <= 5; i++) { gl.readPixels(vp.x + Math.floor((vp.width * i) / 6), vp.y + Math.floor((vp.height * j) / 6), 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px); grid.push([...px]); }
    const lum = grid.map((p) => (p[0] + p[1] + p[2]) / 3);
    eyes[v.eye] = { viewport: [vp.x, vp.y, vp.width, vp.height], distinct: new Set(grid.map((p) => p.join(','))).size, meanLum: +(lum.reduce((a, b) => a + b, 0) / lum.length).toFixed(1), allBlackOrClear: grid.every((p) => p[0] + p[1] + p[2] === 0), grid };
  }
  gl.bindFramebuffer(gl.READ_FRAMEBUFFER, prev);
  const L = eyes.left?.grid, R = eyes.right?.grid;
  return { frame: f, eyes, leftRightDiffer: !!(L && R) && L.some((p, k) => p.join() !== R[k].join()), framebuffer: layer.framebuffer ? 'layer' : 'default' };
}

