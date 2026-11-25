// Focus inside a menu (M5 W1): the arrows, a gamepad's d-pad and its A and B do what Tab, Enter and Escape do, over the
// menu's real controls. The decisions are nav.js's (tested in Node); this is the part that touches the DOM.
import { nextIndex } from './nav.js';

const FOCUSABLE = 'button:not([disabled]), select:not([disabled]), input:not([disabled]), [tabindex]:not([tabindex="-1"])';

/** The controls focus moves through, in order. */
export const controlsOf = (root) => /** @type {HTMLElement[]} */ ([...root.querySelectorAll(FOCUSABLE)].filter((e) => !e.closest('[hidden]') && /** @type {HTMLElement} */ (e).offsetParent !== null));

/** Focus a menu's first control (or `selector`'s, when it is there). */
export function focusFirst(root, selector = null) {
  const target = (selector && root.querySelector(selector)) || controlsOf(root)[0];
  /** @type {HTMLElement | undefined} */ (target)?.focus();
}

/** Move focus by `step` among a menu's controls; wraps round. */
export function moveFocus(root, step) {
  const list = controlsOf(root), i = list.indexOf(/** @type {HTMLElement} */ (document.activeElement));
  list[nextIndex(i, list.length, step)]?.focus();
}

/** Change the focused select or slider one notch (a gamepad's left and right), as the person would have. */
export function nudge(el, step) {
  if (el instanceof HTMLSelectElement) {
    const n = el.options.length;
    if (!n) return;
    let i = el.selectedIndex;
    for (let k = 0; k < n; k++) { i = (((i + step) % n) + n) % n; if (!el.options[i].disabled) break; }
    el.selectedIndex = i;
    el.dispatchEvent(new Event('change', { bubbles: true }));
  } else if (el instanceof HTMLInputElement && el.type === 'range') {
    if (step > 0) el.stepUp(); else el.stepDown();
    el.dispatchEvent(new Event('input', { bubbles: true }));
    el.dispatchEvent(new Event('change', { bubbles: true }));
  }
}

/**
 * A command in a menu, from the keyboard (keyCommand) or a gamepad (PadNavigator). → true when it was used.
 * @param {HTMLElement} root the menu @param {string} command @param {{ back: () => void }} o
 */
export function menuCommand(root, command, { back }) {
  const el = /** @type {HTMLElement} */ (document.activeElement), inside = root.contains(el);
  const adjustable = inside && (el instanceof HTMLSelectElement || (el instanceof HTMLInputElement && el.type === 'range'));
  switch (command) {
    case 'up': moveFocus(root, -1); return true;
    case 'down': moveFocus(root, 1); return true;
    case 'first': controlsOf(root)[0]?.focus(); return true;
    case 'last': controlsOf(root).at(-1)?.focus(); return true;
    case 'left': case 'right':
      if (adjustable) { nudge(el, command === 'right' ? 1 : -1); return true; }
      moveFocus(root, command === 'right' ? 1 : -1); return true;
    case 'confirm':
      if (!inside) { focusFirst(root); return true; }
      if (el instanceof HTMLButtonElement) { el.click(); return true; }
      return false;
    case 'back': back(); return true;
    default: return false;
  }
}
