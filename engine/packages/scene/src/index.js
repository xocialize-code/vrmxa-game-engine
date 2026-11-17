// @vrmxg/scene — .vrmxs scene documents (AB-D-0246): schema generated from the registry, canonical
// line-stable serialization, validation and lint, prefab flattening, and undoable edits. Lifted from
// spike-registry (AB-R-0933).
export { documentSchema, nodeSchema, behaviourSchema, describeType, describeBehaviour } from './schema.js';
export { createValidator, serialize, parse, innerIds } from './doc.js';
export { flatten } from './instance.js';
export { createEditor } from './edit.js';
export { changedLines } from './linediff.js';
