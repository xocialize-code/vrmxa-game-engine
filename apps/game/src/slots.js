// The save-slot menu's rows (M5 W1), as plain functions over a store's listing (@vrmxg/save: list() →
// [{ slot, name, savedAt, step, seconds, scene, bytes }]), so they are tested in Node.
//
// The player has six slots, slot-1 to slot-6. Slots that start with "auto-" are the game's own checkpoints
// (@vrmxg/game writes a Checkpoint node's slot there): the menu lists them and loads them, and never writes them.
import { CHECKPOINT_PREFIX } from '@vrmxg/game';

export const PLAYER_SLOTS = ['slot-1', 'slot-2', 'slot-3', 'slot-4', 'slot-5', 'slot-6'];

/** Seconds of play as m:ss (or h:mm:ss). */
export function formatPlayed(seconds) {
  if (typeof seconds !== 'number' || !Number.isFinite(seconds) || seconds < 0) return '';
  const s = Math.floor(seconds), h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), r = s % 60;
  const two = (n) => String(n).padStart(2, '0');
  return h ? `${h}:${two(m)}:${two(r)}` : `${m}:${two(r)}`;
}

/** A scene's name for a person: its file name without the folder or the extension. */
export const sceneName = (ref) => (typeof ref === 'string' ? ref.split('/').pop().replace(/\.vrmxs$/, '') : '');

/**
 * The name a save is given: what the player was doing, so a slot list reads without opening anything.
 * @param {{ title?: string, view?: any, scene?: string | null }} o view: the flow's view (its goal, its score)
 */
export function saveName({ title = '', view = null, scene = null } = {}) {
  const where = sceneName(view?.scene ?? scene);
  const doing = view?.outcome === 'won' ? 'Won' : view?.outcome === 'lost' ? 'Lost' : view?.goal?.text ?? null;
  return [title, where, doing].filter(Boolean).join(' · ') || 'Save';
}

/** When a save was made, for a row: the stamp's date and time to the minute, as written (no time zone maths here). */
export function formatSavedAt(savedAt) {
  const m = typeof savedAt === 'string' ? /^(\d{4}-\d{2}-\d{2})T(\d{2}:\d{2})/.exec(savedAt) : null;
  return m ? `${m[1]} ${m[2]}` : '';
}

/**
 * A save another build of the game made (another export: every export of a game shares its saves folder). It can't be
 * loaded (GameSession refuses it), so a menu shows it as such and Continue never offers it. With no build to compare
 * with (null), nothing is another build's.
 * @param {{ build?: string | null }} e a listing's entry @param {string | null} build this build's digest
 */
export const otherBuild = (e, build) => !!build && e.build !== build;

/**
 * @param {Array<{ slot: string, name?: string, savedAt?: string | null, step?: number | null, seconds?: number | null, scene?: string | null, build?: string | null }>} list
 * @param {{ build?: string | null }} [o] build: this build's digest (the manifest's): saves another build made are marked `other`
 * @returns {{ player: any[], checkpoints: any[] }} player: every one of the six slots, in order, `empty` where the
 *   store has nothing; checkpoints: the game's own, newest first. Each row: { slot, label, empty, other, name, detail,
 *   text } (`text` is the row read out whole: its accessible name; `other`: made with another version, not loadable)
 */
export function slotRows(list, { build = null } = {}) {
  const by = new Map((list ?? []).map((e) => [e.slot, e]));
  const row = (slot, label, e) => {
    if (!e) return { slot, label, empty: true, other: false, name: 'Empty', detail: '', text: `${label}: empty` };
    if (otherBuild(e, build)) {
      const detail = [formatPlayed(e.seconds), formatSavedAt(e.savedAt)].filter(Boolean).join(' · ');
      return { slot, label, empty: false, other: true, name: 'Made with another version', detail, savedAt: e.savedAt ?? null, step: e.step ?? null, text: `${label}: made with another version of the game, can't be loaded${detail ? `, ${detail}` : ''}` };
    }
    const name = e.name && e.name !== slot ? e.name : sceneName(e.scene) || 'Saved game';
    // where it is, when the name doesn't say; how long was played; when it was saved
    const detail = [name.includes(sceneName(e.scene)) ? '' : sceneName(e.scene), formatPlayed(e.seconds), formatSavedAt(e.savedAt)].filter(Boolean).join(' · ');
    return { slot, label, empty: false, other: false, name, detail, savedAt: e.savedAt ?? null, step: e.step ?? null, text: `${label}: ${name}${detail ? `, ${detail}` : ''}` };
  };
  const player = PLAYER_SLOTS.map((slot, i) => row(slot, `Slot ${i + 1}`, by.get(slot)));
  const checkpoints = (list ?? []).filter((e) => e.slot.startsWith(CHECKPOINT_PREFIX)).sort(newestFirst)
    .map((e) => row(e.slot, e.slot === `${CHECKPOINT_PREFIX}checkpoint` ? 'Checkpoint' : `Checkpoint ${e.slot.slice(CHECKPOINT_PREFIX.length)}`, e));
  return { player, checkpoints };
}

// newest by the stamp; saves with no stamp after those with one, by how far they got; then by name, so the order is one order
function newestFirst(a, b) {
  const ta = a.savedAt ?? '', tb = b.savedAt ?? '';
  if (ta !== tb) return ta < tb ? 1 : -1;
  if ((a.step ?? -1) !== (b.step ?? -1)) return (b.step ?? -1) - (a.step ?? -1);
  return a.slot < b.slot ? -1 : a.slot > b.slot ? 1 : 0;
}

/**
 * What Continue loads: the newest save the store has that this menu knows (a player slot or a checkpoint) and this build
 * made, or null.
 * @param {Array<{ slot: string, savedAt?: string | null, step?: number | null, build?: string | null }>} list
 * @param {{ build?: string | null }} [o] build: this build's digest
 */
export function latestSave(list, { build = null } = {}) {
  const known = (list ?? []).filter((e) => (PLAYER_SLOTS.includes(e.slot) || e.slot.startsWith(CHECKPOINT_PREFIX)) && !otherBuild(e, build));
  return known.sort(newestFirst)[0] ?? null;
}
