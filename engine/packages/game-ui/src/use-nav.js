// Keyboard and gamepad navigation for an overlay (M5 W3): a Vue composable over nav.js. Its root is marked
// `data-nav-root`; controls are the elements under it with a `data-nav` attribute, in DOM order. The keyboard arrives as
// key events on the root (a focused button's Enter and Space stay the browser's own click; a slider keeps its own
// arrows); the gamepad is polled once a frame through input.peek().
//
// One scope acts at a time: the OUTERMOST nav root around the focused control. So components that navigate on their
// own (VolumeControls, RebindList) become one list when an app's settings menu wraps them in its own useNav root, and a
// gamepad moves across all of them. With focus in no root (the canvas, the page), a root whose `grab()` says so acts:
// the game overlay while a conversation is on screen.
import { onMounted, onBeforeUnmount, watch } from 'vue';
import { ActionMap } from '@vrmxg/input';
import { UI_ACTIONS, NavPad, keyAction, navTarget } from './nav.js';

const kindOf = (el) => (el?.type === 'range' ? 'range' : el && (el.tagName === 'BUTTON' || el.type === 'checkbox') ? 'button' : el ? 'other' : null);

/**
 * @param {{ value: HTMLElement | null }} root
 * @param {{ input?: () => any, onBack?: (() => void) | null, grab?: () => boolean, paused?: () => boolean, onKey?: (e: KeyboardEvent) => boolean | void }} [o]
 *   input: the input service whose devices the gamepad is read through; paused: navigation stops (a rebinding waits for
 *   a key); onKey: the component's own keys first (a digit picks a choice), true when it handled one
 */
export function useNav(root, { input = () => null, onBack = null, grab = () => false, paused = () => false, onKey = null } = {}) {
  const map = new ActionMap(UI_ACTIONS), pad = new NavPad();
  let raf = 0;
  const controls = () => (root.value ? [...root.value.querySelectorAll('[data-nav]')].filter((e) => !(/** @type {any} */ (e).disabled) && !e.closest('[hidden]')) : []);
  // the outermost nav root around an element, or null
  const scopeOf = (el) => { let scope = null; for (let n = el?.closest?.('[data-nav-root]'); n; n = n.parentElement?.closest('[data-nav-root]')) scope = n; return scope; };
  const active = () => (typeof document !== 'undefined' ? document.activeElement : null);
  /** Does this root act for focus on `el`? */
  const mine = (el) => { const scope = scopeOf(el); return scope ? scope === root.value : grab(); };

  function apply(action) {
    const list = controls(), el = /** @type {any} */ (typeof document !== 'undefined' ? document.activeElement : null);
    const index = list.indexOf(el);
    const t = navTarget(action, { count: list.length, index, kind: index >= 0 ? kindOf(el) : null });
    if (!t) return false;
    if ('back' in t) onBack?.();
    else if ('focus' in t) /** @type {any} */ (list[t.focus]).focus();
    else if ('step' in t) { if (t.step > 0) el.stepUp(); else el.stepDown(); el.dispatchEvent(new Event('input', { bubbles: true })); }
    else if ('click' in t) el.click();
    return true;
  }

  function onKeydown(e) {
    if (e.defaultPrevented || !root.value?.contains(e.target) || paused() || !mine(e.target)) return;
    if (onKey?.(e)) { e.preventDefault(); return; }
    const action = keyAction(map, e.code);
    if (!action) return;
    const kind = kindOf(e.target);
    if (action === 'ui_accept' && kind !== 'other') return;                                   // the browser clicks it
    if ((action === 'ui_left' || action === 'ui_right') && kind === 'range' && e.code.startsWith('Arrow')) return; // the slider's own
    if (apply(action)) e.preventDefault();
  }

  function poll() {
    raf = requestAnimationFrame(poll);
    if (paused()) { pad.reset(); return; }
    const state = input()?.peek?.() ?? null;
    const fired = pad.update(state);
    if (!fired.length || !root.value || !mine(active())) return;
    for (const a of fired) apply(a);
  }

  // the root may come and go (a menu shown with v-if): it is marked whenever it appears, and keys are heard on the document
  watch(root, (el) => el?.setAttribute('data-nav-root', ''), { immediate: true, flush: 'post' });
  onMounted(() => { document.addEventListener('keydown', onKeydown); if (typeof requestAnimationFrame !== 'undefined') raf = requestAnimationFrame(poll); });
  onBeforeUnmount(() => { document.removeEventListener('keydown', onKeydown); if (raf) cancelAnimationFrame(raf); });

  /** Focus the first control (when an overlay opens, or a conversation asks). */
  const focusFirst = () => { const first = /** @type {any} */ (controls()[0]); first?.focus(); return !!first; };
  return { focusFirst, apply, controls };
}
