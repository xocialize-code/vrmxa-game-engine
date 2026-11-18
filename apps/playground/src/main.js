// In acceptance mode the runners read console errors and warnings back (window.__errors, __warnings).
window.__errors = []; window.__warnings = [];
if (new URLSearchParams(location.search).get('mode') === 'acceptance') {
  const e0 = console.error, w0 = console.warn;
  console.error = (...a) => { window.__errors.push(a.map(String).join(' ')); e0(...a); };
  console.warn = (...a) => { window.__warnings.push(a.map(String).join(' ')); w0(...a); };
  addEventListener('error', (e) => window.__errors.push(`${e.message} @${e.filename}:${e.lineno}`));
  addEventListener('unhandledrejection', (e) => window.__errors.push(`unhandled: ${e.reason?.stack ?? e.reason}`));
}
import { createApp } from 'vue';
import App from './App.vue';
createApp(App).mount('#app');
