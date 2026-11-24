// @vrmxg/editor-ui — M4 W5 (AB-T-0577). The Vue components the editor and the creator share, by path:
//   import Timeline from '@vrmxg/editor-ui/Timeline.vue';            // transport, ruler, lanes, side panel (M2 W5's)
//   import StoryboardStrip from '@vrmxg/editor-ui/StoryboardStrip.vue';
//   import RenderQueue from '@vrmxg/editor-ui/RenderQueue.vue';
// This entry holds what they decide, as plain functions with no Vue or DOM.
export { TARGET_TRACKS, TRACK_TYPES, EASES, needsTarget, parseValue, itemLabel, selectionOf, isSelected, moveCommand, removeCommand, fieldCommand, trackSpec, clipSpec, keyCommand, nudgeCommand } from './timeline-ui.js';
export { storyCards, jobStatus, queueSpec, checkTicked } from './storyboard-ui.js';
export { closingQuestion } from './closing-ui.js'; // before a window closes or the app quits (M5 W8)
