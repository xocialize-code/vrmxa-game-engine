// Keyboard and gamepad navigation for an overlay (M5 W3): a Vue composable over nav.js. Its root is marked
// `data-nav-root`; controls are the elements under it with a `data-nav` attribute, in DOM order. The keyboard arrives as
// key events on the root (a focused button's Enter and Space stay the browser's own click; a slider keeps its own
// arrows); the gamepad is polled once a frame through input.peek().
//
// One scope acts at a time: the OUTERMOST nav root around the focused control. So components that navigate on their
// own (VolumeControls, RebindList) become one list when an app's settings menu wraps them in its own useNav root, and a
// gamepad moves across all of them. With focus in no root (the canvas, the page), a root whose `grab()` says so acts,
// for the keys and the gamepad: the game overlay while it holds the devices. Nothing acts while focus is inside an
// element marked `data-nav-paused` (a rebinding waiting for its key or button), in any scope.
import { onMounted, onBeforeUnmount, watch } from 'vue';
import { ActionMap } from '@vrmxg/input';
import { UI_ACTIONS, NavPad, keyAction, navTarget, ActivationGuard } from './nav.js';

// One guard for the page (ActivationGuard), installed with the first useNav in the capture phase. It judges only the
// overlays' own controls (under a nav root: the overlay, and an app menu that uses useNav), never a text field, and never
// a pointer click (a keyboard's click has no click count: event.detail is 0).
let guard = null;
const TEXT = new Set(['text', 'search', 'email', 'url', 'tel', 'password', 'number', 'date', 'time', 'datetime-local', 'month', 'week']);
const isTextField = (el) => !!el && (el.isContentEditable || el.tagName === 'TEXTAREA' || el.tagName === 'SELECT' || (el.tagName === 'INPUT' && TEXT.has(String(el.type).toLowerCase())));
const scopedTarget = (el) => !!el?.closest?.('[data-nav-root]') && !isTextField(el);
function installGuard() {
  if (guard || typeof document === 'undefined') return;
  guard = new ActivationGuard();
  document.addEventListener('keydown', (e) => { if (guard.keydown(e.code, e.repeat, e.target, scopedTarget(e.target))) { e.preventDefault(); e.stopImmediatePropagation(); } }, true);
  document.addEventListener('keyup', (e) => guard.keyup(e.code), true);
  document.addEventListener('click', (e) => { if (guard.click(e.target, { keyboard: e.detail === 0, scoped: scopedTarget(e.target) })) { e.preventDefault(); e.stopImmediatePropagation(); } }, true);
  addEventListener('blur', () => guard.clear());
}

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
  const frozen = (el) => !!el?.closest?.('[data-nav-paused]');

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
    if (e.defaultPrevented || e.repeat || !root.value || paused() || frozen(e.target) || !mine(e.target)) return; // a held key acts once
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
    // the pad is read every frame, paused or not: a button held through a pause (the one a rebinding took) isn't a
    // fresh press when the pause ends
    const fired = pad.update(input()?.peek?.() ?? null);
    if (!fired.length || paused() || !root.value || frozen(active()) || !mine(active())) return;
    for (const a of fired) apply(a);
  }

  // the root may come and go (a menu shown with v-if): it is marked whenever it appears, and keys are heard on the document
  watch(() => root.value, (el) => el?.setAttribute('data-nav-root', ''), { immediate: true, flush: 'post' });
  onMounted(() => { installGuard(); document.addEventListener('keydown', onKeydown); if (typeof requestAnimationFrame !== 'undefined') raf = requestAnimationFrame(poll); });
  onBeforeUnmount(() => { document.removeEventListener('keydown', onKeydown); if (raf) cancelAnimationFrame(raf); });

  /** Focus the first control (when an overlay opens, or a conversation asks). */
  const focusFirst = () => { const first = /** @type {any} */ (controls()[0]); first?.focus(); return !!first; };
  return { focusFirst, apply, controls };
}
