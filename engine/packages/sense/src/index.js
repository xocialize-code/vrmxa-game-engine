// @vrmxg/sense — M3 W5 (AB-T-0544). The person in front of the camera as part of the world: presence, where their face
// is, a wave, a nod, a head shake and a point, detected from feature frames outside the step (detect.js), applied on a
// step and logged by the "sense" service (service.js), heard by brains as stimuli, and answered by characters with the
// noticeViewer behaviour. Capture runs in the Mac shell (spike-camera/README.md); frames never reach the page, only numbers.
import { SenseService } from './service.js';
import { NoticeViewerBehaviour } from './behaviour.js';

export { GestureDetector, handShape, DEFAULTS } from './detect.js';
export { SenseService, TYPES } from './service.js';
export { NoticeViewerBehaviour } from './behaviour.js';
export { shellCamera, recordedFrames, connectCamera } from './sources.js';

/**
 * Give a SceneTree the camera: the "sense" service and the noticeViewer behaviour. Install it before the ai service's
 * brains step (services step in install order, before the nodes). Install it only when a camera is used or a take
 * carries camera events: a world without it is the world it was.
 * @param {import('@vrmxg/core').SceneTree} tree @param {{ viewer?: string, reach?: number[] }} [opts]
 * @returns {SenseService}
 */
export function installSense(tree, opts = {}) {
  tree.behaviourClasses.set('noticeViewer', NoticeViewerBehaviour);
  return tree.addService('sense', new SenseService(tree, opts));
}

/** A scene with the viewer node (a Marker at the origin; the service stands it at the camera). @param {any} doc */
export function withViewer(doc, { id = 'viewer', parent = doc.nodes[0]?.id } = {}) {
  if (doc.nodes.some((n) => n.id === id)) return doc;
  return { ...doc, nodes: [...doc.nodes, { id, type: 'Marker', parent, name: 'You (the camera)' }] };
}

/**
 * A scene with the camera in it: the viewer node, and the noticeViewer behaviour on the characters in `notice` (its
 * params: answers, say, smile). @param {any} doc @param {{ notice?: string[], params?: any, viewer?: string }} [o]
 */
export function withCamera(doc, { notice = [], params = {}, viewer = 'viewer' } = {}) {
  const d = withViewer(doc, { id: viewer });
  return { ...d, nodes: d.nodes.map((n) => (notice.includes(n.id) && !(n.behaviours ?? []).some((b) => b.use === 'noticeViewer') ? { ...n, behaviours: [...(n.behaviours ?? []), { use: 'noticeViewer', ...params }] } : n)) };
}
