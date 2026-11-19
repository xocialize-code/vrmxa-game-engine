// @vrmxg/persona — M3 W1 (AB-T-0540). VRMXA personas for the engine: the core persona from the bundle (or its exchange
// form), the app persona from the project (keyed by VRMXA id), the persona in effect, the role profile that weights
// utility, and app memory as a provider. The engine writes none of it into a bundle.
import { PersonaService } from './service.js';
export { PersonaService, FORMAT } from './service.js';
export { corePersona, layer } from './core.js';
export { TRAITS, profileFromTraits, clampProfile, deriveProfile } from './profile.js';

/**
 * The "persona" service. Install after the characters (it reads the library) and before the director; `await
 * personas.prepare()` before play.
 * @param {any} tree @param {ConstructorParameters<typeof PersonaService>[1]} [opts]
 */
export function installPersonas(tree, opts) { return tree.addService('persona', new PersonaService(tree, opts)); }
