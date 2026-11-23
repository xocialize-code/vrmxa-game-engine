// @vrmxg/cast — M4 W6 (AB-T-0578). Casting for the anime creator: the roles a script gives a sequence, each cast from
// a .vrmxa (vrmxa-core, injected), with its voice and allowed expressions from the persona and its wardrobe through the
// closet; recasting swaps the character, keeps the role's performance byte for byte and lists its lines to re-bake in
// the new voice (W7's hook). Each cast is one undoable edit. Pure data in, data out: the same inputs give the same
// sequence bytes in every engine.
export { readCharacter, cardOf, resolveVoice, allowedExpressions, pickWardrobe, KOKORO, KOKORO_PRESETS, EXPRESSIONS } from './card.js';
export { rolesOf, roleOf, ROLE_TYPE } from './roles.js';
export { castRole, withBake, clipFor, voicesFor, linesToBake, expressionsUsed, applyOps } from './cast.js';
export { applyCast } from './editor.js';
export { dressCast } from './dress.js';
