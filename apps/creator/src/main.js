import { createApp } from 'vue';
import App from './App.vue';
window.__errors = [];
addEventListener('error', (e) => window.__errors.push(`${e.message} @${e.filename}:${e.lineno}`));
addEventListener('unhandledrejection', (e) => window.__errors.push(`unhandled: ${e.reason?.stack ?? e.reason}`));
createApp(App).mount('#app');
