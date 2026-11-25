// The camera preview (M5 W5, AB-T-0604): what the selected Camera or VirtualCamera would show, drawn picture in
// picture in a corner of the edit view. The edit view is never stepped, so a camera's rig hasn't placed it: the
// preview evaluates the rig once (a Camera's stepRig, a VirtualCamera's step, both with no time passing, no input and no
// physics) and puts the node's state back exactly as it was (getState / setState, the transform), so nothing in the
// edit world changes and its hash doesn't move. What it shows is the shot at rest: no damping, noise or spring arm.
import { verticalFov } from '@vrmxg/camera';

/** The preview's place in the viewport (CSS pixels from the bottom right) for a viewport of w × h. */
export function pipRect(w, h, { aspect = 16 / 9, fraction = 0.3, margin = 12, min = 160 } = {}) {
  const pw = Math.round(Math.min(w - 2 * margin, Math.max(min, w * fraction)));
  const ph = Math.round(pw / aspect);
  return { right: margin, bottom: margin, width: pw, height: ph, x: w - margin - pw, y: margin }; // x, y: from the bottom left (renderViews)
}

/** Is this runtime node one the preview shows? */
export function previewable(node) { return !!node && (node.type === 'Camera' || node.type === 'VirtualCamera'); }

/**
 * Put `out` (a PerspectiveCamera) where the camera node would look from, at `aspect`. → true, or false for a node it
 * can't show.
 * @param {any} node a Camera or VirtualCamera of the edit tree @param {any} out @param {number} aspect
 */
export function previewPose(node, out, aspect) {
  const o = node?.object3d;
  if (!o || !previewable(node)) return false;
  const p = o.position.clone(), q = o.quaternion.clone();
  if (node.type === 'Camera') {
    const s = node.getState();
    try {
      node.stepRig(0, null, null);
      o.updateWorldMatrix(true, false);
      o.matrixWorld.decompose(out.position, out.quaternion, out.scale);
    } finally { node.setState(s); o.position.copy(p); o.quaternion.copy(q); o.updateWorldMatrix(true, false); }
    const pr = node.props;
    out.fov = verticalFov(pr.focalLength ?? 50, node.sensor, aspect, pr.gateFit ?? 'fill');
    out.near = pr.near ?? 0.1; out.far = pr.far ?? 500;
  } else {
    const s = node.getState(), pose = { p: node.pose.p.clone(), q: node.pose.q.clone(), focalLength: node.pose.focalLength, fStop: node.pose.fStop, focusDistance: node.pose.focusDistance, dutch: node.pose.dutch };
    try {
      node.step(0, null, aspect);
      out.position.copy(node.pose.p); out.quaternion.copy(node.pose.q); out.scale.set(1, 1, 1);
      out.fov = verticalFov(node.pose.focalLength || 50, node.settings().lens.sensor ?? 'super35', aspect, 'fill');
    } finally {
      node.setState(s);
      node.pose.p.copy(pose.p); node.pose.q.copy(pose.q);
      Object.assign(node.pose, { focalLength: pose.focalLength, fStop: pose.fStop, focusDistance: pose.focusDistance, dutch: pose.dutch });
      o.position.copy(p); o.quaternion.copy(q); o.updateWorldMatrix(true, false);
    }
    out.near = 0.05; out.far = 500;
  }
  out.aspect = aspect;
  out.updateProjectionMatrix();
  out.updateMatrixWorld(true);
  return true;
}
