// @vrmxg/editor-ui — M4 W5 (AB-T-0577). The Vue components the editor and the creator share, by path:
//   import Timeline from '@vrmxg/editor-ui/Timeline.vue';            // transport, ruler, lanes, side panel (M2 W5's)
//   import StoryboardStrip from '@vrmxg/editor-ui/StoryboardStrip.vue';
//   import RenderQueue from '@vrmxg/editor-ui/RenderQueue.vue';
//   import NumberField from '@vrmxg/editor-ui/NumberField.vue';      // M5 W4: drag, arrow keys, typed arithmetic
//   import ValueField from '@vrmxg/editor-ui/ValueField.vue';        // M5 W4: a prop's editor from its JSON Schema
//   import AssetsPanel from '@vrmxg/editor-ui/AssetsPanel.vue';      // M5 W6: thumbnails, type filters, search, folders, typed drags
// This entry holds what they decide, as plain functions with no Vue or DOM.
export { TARGET_TRACKS, TRACK_TYPES, EASES, needsTarget, parseValue, itemLabel, selectionOf, isSelected, moveCommand, removeCommand, fieldCommand, trackSpec, clipSpec, keyCommand, nudgeCommand, timelineKey } from './timeline-ui.js';
export { storyCards, jobStatus, queueSpec, checkTicked } from './storyboard-ui.js';
export { closingQuestion } from './closing-ui.js'; // before a window closes or the app quits (M5 W8)
export { questions } from './questions.js'; // a window's sheet: one question at a time, and every one answered
export { DRAG_THRESHOLD, evalArithmetic, roundTo, constrain, parseNumber, stepMultiplier, stepBy, dragTo, formatNumber, fillOf } from './numbers.js'; // the number field (M5 W4)
export {
  plain, matches, resolveSchema, branchesOf, branchIndex, isCurve, widgetOf, schemaOfValue, defaultFor, setIn, getIn, listAdd, listRemove, listMove, rowActions,
  mapRename, mapAdd, mapRemove, freshKey, structRows, fitBranch, rowTitle, curvePoints, nextCurveKey, idPart, childOf, inspectorFields, shownValue, sharedFields, sharedAxes, fieldName,
} from './fields.js'; // the inspector's fields (M5 W4)
export { ASSET_FILTERS, fileKind, assetCategory, folderOf, assetEntries, filterAssets, filterCounts, assetFolders, ASSET_MIME, NODE_MIME, NODE_DRAG_ALLOWED, ASSET_DRAG_ALLOWED, dropEffectFor, effectPermits, dragTypes, draggedKind, dropVerdict, dropVerdictFor } from './assets-ui.js'; // the assets panel (M5 W6)
export { parseTreeQuery, rowMatches, filterTree, foldTree } from './tree-ui.js'; // tree search and folding (M5 W6)
export { EDITOR_PANELS, FOLDED, KEY_STEP, KEY_STEP_BIG, defaultLayout, clampSize, readLayout, resize, toggle, splitterKey, shownSize, writeLayout } from './panels.js'; // panels you resize (M5 W6)
export { fieldType, copyField, copyTransform, copyPart, pasteVerdict } from './fieldclip.js'; // per-field copy and paste (M5 W6)
