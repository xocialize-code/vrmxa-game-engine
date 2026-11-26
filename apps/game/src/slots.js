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
 * This build as a slot list compares saves with it: its digest, and its save-compatibility fingerprint (the manifest's
 * `compat`, M6 W5). A string is a digest alone (a build from before M6).
 * @typedef {string | { digest: string, game?: string | null, compat?: { format?: string, version?: number, digest?: string, parts?: Record<string, string> } | null } | null} ThisBuild
 */
const asBuild = (build) => (!build ? null : typeof build === 'string' ? { digest: build, game: null, compat: null } : build);

/**
 * A save this build can't restore, by the rules GameSession.buildProblems loads by: another game's (when the listing
 * names one), or another export's whose fingerprint differs or that has none (every export of a game shares its saves
 * folder). GameSession refuses it, so a menu shows it as such and Continue never offers it. A save another export made
 * with the same fingerprint is this build's as far as loading goes. With no build to compare with (null), nothing is
 * another build's.
 * @param {{ build?: string | null, game?: string | null, compat?: { format?: string | null, version?: number | null, digest?: string | null } | null }} e a listing's entry @param {ThisBuild} build
 */
export const otherBuild = (e, build) => {
  const b = asBuild(build);
  if (!b) return false;
  if (!e.build) return true; // names no build
  if (e.game && b.game && e.game !== b.game) return true;
  if (e.build === b.digest) return false;
  const a = e.compat, c = b.compat;
  return !(a?.digest && c?.digest && (a.format ?? c.format) === c.format && a.version === c.version && a.digest === c.digest);
};

const PART_WORDS = { scenes: 'its scenes', assets: 'its items, characters, models, brains or animations', behaviours: 'its behaviours', input: 'its controls', engine: 'the engine' };
/**
 * What changed since another build's save, in a few words for its row ("its scenes and its behaviours changed"), or ''
 * when the listing can't say (a save or a build from before M6, or another kind of fingerprint).
 * @param {{ compat?: { version?: number, parts?: Record<string, string> } | null }} e @param {ThisBuild} build
 */
export function otherWhy(e, build) {
  const b = asBuild(build), a = e?.compat?.parts, c = b?.compat?.parts;
  if (e?.game && b?.game && e.game !== b.game) return 'from another game';
  if (!a || !c || e.compat.version !== b.compat.version) return '';
  const parts = Object.keys(PART_WORDS).filter((p) => a[p] !== c[p]).map((p) => PART_WORDS[p]);
  if (!parts.length) return '';
  const words = parts.length === 1 ? parts[0] : `${parts.slice(0, -1).join(', ')} and ${parts[parts.length - 1]}`;
  return `${words} changed`;
}

/**
 * @param {Array<{ slot: string, name?: string, savedAt?: string | null, step?: number | null, seconds?: number | null, scene?: string | null, build?: string | null }>} list
 * @param {{ build?: ThisBuild }} [o] build: this build (its digest and fingerprint): saves it can't restore are marked `other`
 * @returns {{ player: any[], checkpoints: any[] }} player: every one of the six slots, in order, `empty` where the
 *   store has nothing; checkpoints: the game's own, newest first. Each row: { slot, label, empty, other, name, detail,
 *   text } (`text` is the row read out whole: its accessible name; `other`: made with another version this one can't
 *   restore, not loadable, with `why` saying what changed when the listing knows)
 */
export function slotRows(list, { build = null } = {}) {
  const by = new Map((list ?? []).map((e) => [e.slot, e]));
  const row = (slot, label, e) => {
    if (!e) return { slot, label, empty: true, other: false, name: 'Empty', detail: '', text: `${label}: empty` };
    if (otherBuild(e, build)) {
      const detail = [formatPlayed(e.seconds), formatSavedAt(e.savedAt)].filter(Boolean).join(' · '), why = otherWhy(e, build);
      return { slot, label, empty: false, other: true, why, name: 'Made with another version', detail, savedAt: e.savedAt ?? null, step: e.step ?? null, text: `${label}: made with another version of the game, can't be loaded${why ? ` (${why})` : ''}${detail ? `, ${detail}` : ''}` };
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
 * can restore, or null.
 * @param {Array<{ slot: string, savedAt?: string | null, step?: number | null, build?: string | null }>} list
 * @param {{ build?: ThisBuild }} [o] build: this build (its digest and fingerprint)
 */
export function latestSave(list, { build = null } = {}) {
  const known = (list ?? []).filter((e) => (PLAYER_SLOTS.includes(e.slot) || e.slot.startsWith(CHECKPOINT_PREFIX)) && !otherBuild(e, build));
  return known.sort(newestFirst)[0] ?? null;
}
