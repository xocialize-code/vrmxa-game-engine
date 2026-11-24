// @vrmxg/game-ui — M5 W3 (AB-T-0618, AB-D-0287). The player-facing overlays over the canvas: DOM with accessible names
// (AppProbe and a screen reader read them), driven from the keyboard and a gamepad by input actions. By path:
//   import GameOverlay from '@vrmxg/game-ui/GameOverlay.vue';       // the root an app mounts over its canvas
//   import VolumeControls from '@vrmxg/game-ui/VolumeControls.vue'; // inside the app's own settings menu
//   import RebindList from '@vrmxg/game-ui/RebindList.vue';
//   (and Hud.vue, DialogueBox.vue, Captions.vue, use-nav.js on their own)
// This entry holds what they decide, as plain functions with no Vue or DOM.
export { keyName, describeBinding, clock, timerText, isUrgent, GAMEPAD_BUTTONS } from './format.js';
export { hudModel, keysFor, promptLabel, Notices, HudBinding, NOTICE_STEPS } from './hud.js';
export { dialogueModel, captionsModel, choose, advance, choiceForKey } from './dialogue-ui.js';
export { UI_ACTIONS, NavPad, keyAction, navTarget } from './nav.js';
export { OverlayBinding } from './overlay.js';
export { GameSettings, readSettings, memorySettingsStore, volumeRows, rebindRows, applyCapture, captureKey, captureButton, conflicts, VOLUME_BUSES, SETTINGS_VERSION } from './settings.js';
