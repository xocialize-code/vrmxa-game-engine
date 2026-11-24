// Keyboard and gamepad navigation for an overlay (M5 W3): a Vue composable over nav.js. Controls are the elements under
// the root with a `data-nav` attribute, in DOM order. The keyboard arrives as key events on the root (a focused
// button's Enter and Space stay the browser's own click; a slider keeps its own arrows); the gamepad is polled once a
// frame through input.peek(), and acts while focus is inside the root or while `grab()` says the overlay has it.
import { onMounted, onBeforeUnmount } from 'vue';
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
  const inside = () => !!root.value && typeof document !== 'undefined' && root.value.contains(document.activeElement);

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
    if (paused()) return;
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
    if (!fired.length || !(inside() || grab())) return;
    for (const a of fired) apply(a);
  }

  onMounted(() => { root.value?.addEventListener('keydown', onKeydown); if (typeof requestAnimationFrame !== 'undefined') raf = requestAnimationFrame(poll); });
  onBeforeUnmount(() => { root.value?.removeEventListener('keydown', onKeydown); if (raf) cancelAnimationFrame(raf); });

  /** Focus the first control (when an overlay opens, or a conversation asks). */
  const focusFirst = () => { const first = /** @type {any} */ (controls()[0]); first?.focus(); return !!first; };
  return { focusFirst, apply, controls };
}
