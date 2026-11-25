// What the game app asks before progress would be lost (M5 W1): the window closing or the app quitting (the Mac shell's
// close question, shell 0.9.0), Quit to Title, and loading another save over a game in progress. Plain functions over
// the session, so they are tested in Node with a store whose write fails.
//
// Progress counts as kept only once the store has it (GameSession.safeStep moves after a save's write succeeds, or a
// checkpoint's). So a save that fails keeps the question: the next close asks again.

/**
 * The question to ask before `what` would drop a game in progress, or null when nothing would be lost.
 * @param {{ active: boolean, dirty: boolean, unsavedSteps: number }} session
 * @param {{ what: 'close' | 'quit' | 'title' | 'load', lastSlot?: string | null, slotLabel?: (slot: string) => string }} o
 *   lastSlot: the slot the player saved into last in this session (offered as "Save and …")
 */
export function leaveQuestion(session, { what, lastSlot = null, slotLabel = (s) => s }) {
  if (!session?.active || !session.dirty) return null;
  const secs = Math.round(session.unsavedSteps / 60);
  const since = secs >= 60 ? `${Math.floor(secs / 60)} min ${secs % 60} s` : secs >= 1 ? `${secs} s` : 'Less than a second';
  const verb = { close: 'Close', quit: 'Quit', title: 'Quit to Title', load: 'Load' }[what];
  const title = what === 'load' ? 'Load over this game?' : `${verb} without saving?`;
  const text = `${since} of play since the last save will be lost.`;
  const options = [{ id: 'cancel', label: 'Keep Playing' }];
  if (lastSlot && what !== 'load') options.push({ id: 'save', label: `Save to ${slotLabel(lastSlot)} and ${verb === 'Quit to Title' ? 'Quit' : verb}` });
  options.push({ id: 'discard', label: what === 'load' ? 'Load Anyway' : `${verb} Without Saving` });
  return { title, text, options };
}

/**
 * Decide whether to go on: ask the question if there is one, save first when asked to. → true to go on. A save that
 * fails keeps the game and says why (onError), so nothing is lost without a word.
 * @param {any} session a GameSession
 * @param {{ what: 'close' | 'quit' | 'title' | 'load', ask: (title: string, text: string, options: any[]) => Promise<string>,
 *   asking?: () => boolean, lastSlot?: string | null, slotLabel?: (slot: string) => string, save?: (slot: string) => Promise<any>, onError?: (e: any) => void, quitting?: boolean }} o
 *   asking: a question is up already (that one first); save: how "Save and …" saves (the app's own save, which names
 *   the save; by default the session's); quitting: the page itself asked to quit (Quit on the title menu)
 */
export async function mayLeave(session, { what, ask, asking = () => false, lastSlot = null, slotLabel, save = (slot) => session.saveSlot(slot), onError = () => {}, quitting = false }) {
  if (quitting) return true;
  if (asking()) return false;
  const q = leaveQuestion(session, { what, lastSlot, slotLabel });
  if (!q) return true;
  const c = await ask(q.title, q.text, q.options);
  if (c === 'discard') return true;
  if (c !== 'save') return false;
  try { await save(lastSlot); return true; } catch (e) { onError(e); return false; }
}
