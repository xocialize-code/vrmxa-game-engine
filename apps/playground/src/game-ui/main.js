// The game UI demo (M5 W3, AB-T-0618): @vrmxg/game-ui's overlay over a small game, without the game app (W1) and without
// models, on its own page (game-ui.html) so the playground's own page and checks don't move. It imports engine packages
// only, so it builds without vrmxa-core beside the repository.
import { createApp } from 'vue';
import GameUiDemo from './GameUiDemo.vue';

window.__errors = [];
addEventListener('error', (e) => window.__errors.push(`${e.message} @${e.filename}:${e.lineno}`));
addEventListener('unhandledrejection', (e) => window.__errors.push(`unhandled: ${e.reason?.stack ?? e.reason}`));
createApp(GameUiDemo).mount('#app');
