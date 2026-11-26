// @vrmxg/editor-core — M1 W7 (AB-T-0519), M2 W5 (AB-T-0528). The editor's model without UI.
export { EditorSession } from './session.js';
export { assetList, assetType, nodeTypeFor, slug, uniqueId } from './assets.js';
export { TimelineGeometry, timecode, rowsOf, keysOf, clipLabel, snapTargets, snapFrame, SNAP_PX, CLIP_TRACKS, CHANNEL_TRACKS } from './timeline.js';
export { SequenceCommands, newSequenceDoc } from './sequence.js';
export { RenderQueue, stubRunner, PRESETS, JOB_STATES, DELIVERY_EXTRAS, JOB_BACKENDS, JOB_CHECKS, resolveCheck } from './queue.js';
export { copyNodes, pasteOps, isClip, freshId, topmost, refPaths, mapRefs, CLIP_FORMAT, CLIP_LIMIT } from './clipboard.js'; // M5 W5
export { referencesElsewhere } from './elsewhere.js'; // M6 W1: where other files name a scene's nodes (an id change refuses)
export { baseOf, refPaths as nodeRefPaths, mapNodeRefs, mapArgRefs, behaviourRefKeys } from './refs.js';
