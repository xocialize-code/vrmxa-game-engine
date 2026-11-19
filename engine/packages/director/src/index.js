// @vrmxg/director — M3 W0 (AB-T-0539). The LLM director: persona-driven decisions made outside the 60 Hz step, through
// one LanguageModel adapter and @vrmxg/ai's action vocabulary, logged so a conversation replays without the model.
import { Director } from './director.js';
export { Director, EMOTIONS, toInject } from './director.js';
export { toolsFor, validate, check, MAX_CALLS } from './schema.js';
export { buildMessages, describeMoment, promptHash, FRAMING } from './prompt.js';
export { shellModel, httpModel, scriptedModel, replayModel } from './model.js';
export { LINE_FRAMING, lineRequest, verdictRequest, parseVerdict, cleanLine, isGoodbye, splitCalls, normalizeVerdict, salvage, verdictParts } from './split.js';

/**
 * A director for a tree that has the ai service. The host calls `director.pump()` after each step.
 * @param {any} tree @param {ConstructorParameters<typeof Director>[1]} opts
 */
export function installDirector(tree, opts) { return new Director(tree, opts); }
