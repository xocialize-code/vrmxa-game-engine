// The dialogue UI's decisions (M5 W3): the box, the choices and the captions, as plain data from the dialogue service's
// view (@vrmxg/voice) and the voice captions. A choice is handed to the simulation as a recorded input (choose()):
// nothing here changes the world.
import { CHOOSE, ADVANCE } from '@vrmxg/voice';

/**
 * The dialogue box as plain data, or null when no conversation is going on.
 * @param {any} view dialogue.view() @param {Array<{ actor: string, words: string[], spoken: number }>} [captions] voice.captions()
 * @returns {null | { name: string | null, text: string, words: string[], spoken: number, asking: boolean, canAdvance: boolean,
 *   label: string, choices: Array<{ id: string, text: string, n: number, key: string | null, label: string }> }}
 */
export function dialogueModel(view, captions = []) {
  if (!view) return null;
  const said = view.speaker ? captions.find((c) => c.actor === view.speaker && c.words?.length) : null;
  const words = String(view.text).trim().split(/\s+/).filter(Boolean);
  // words appear as they are said, while the speaker's caption is this line; the whole line once it is said
  const spoken = view.phase === 'choice' || !said ? words.length : Math.min(words.length, said.spoken ?? words.length);
  const asking = view.phase === 'choice';
  return {
    name: view.name, text: view.text, words, spoken, asking,
    canAdvance: !asking && view.skippable,
    label: `${view.name ? `${view.name}: ` : ''}${view.text}`,
    choices: asking ? view.choices.map((c, i) => ({ id: c.id, text: c.text, n: i + 1, key: i < 9 ? String(i + 1) : null, label: `Choice ${i + 1} of ${view.choices.length}: ${c.text}` })) : [],
  };
}

/**
 * The captions to show: what each speaker is saying now (voice.captions()), without the line the dialogue box already
 * shows.
 * @param {Array<{ actor: string, name: string, text: string, words: string[], spoken: number }>} captions @param {any} [view] dialogue.view()
 */
export function captionsModel(captions = [], view = null) {
  return captions
    .filter((c) => !(view && view.speaker === c.actor && view.phase === 'line'))
    .map((c) => ({ actor: c.actor, name: c.name, text: c.text, label: `${c.name}: ${c.text}` }));
}

/** Answer the conversation: the choice's id goes to the next step as a recorded input. → whether it was taken */
export const choose = (input, id) => input.choose(CHOOSE, id);
/** End the line being said (a skippable conversation): a recorded input too. */
export const advance = (input) => input.choose(ADVANCE, true);

/** The choice a digit key picks ("Digit2" → the second), or null. */
export function choiceForKey(model, code) {
  const m = /^(?:Digit|Numpad)([1-9])$/.exec(String(code));
  if (!m || !model?.asking) return null;
  return model.choices[Number(m[1]) - 1] ?? null;
}
