# @vrmxg/persona

M3 W1 (AB-T-0540). Who each character is, for the director and the brains, from VRMXA §10–§11:
- **The core persona** travels with the character: its bundle's `character.sqlite`. A bundle without one can use the
  exchange form (`{ "format": "vrmxa-persona", … }`), named by the app persona.
- **The app persona** is the project's own, keyed by the character's VRMXA id (§10.2): story, framing, overrides, and
  for VRMXG the role profile, goals and gestures.
- **What the app remembers** (§11) comes from a provider the app sets.

The engine stores none of it, and never writes any of it into a bundle.

```js
import { installPersonas, deriveProfile } from '@vrmxg/persona';
const personas = installPersonas(tree, { resolve, library: lib, doc: projectPersonas }); // after installCharacters' prepare
await personas.prepare();                       // reads exchange-form core personas the app personas name
personas.memory = (vrmxaId) => appMemory.summary(vrmxaId);
installDirector(tree, { model, persona: (id) => personas.forDirector(id), memory: (id) => personas.memoryOf(id) });
// a utility consideration on a trait: { "input": "trait", "name": "talkativeness", "curve": { "type": "linear" } }
const { profile } = await deriveProfile(personas.personaOf('hana-1'), model); personas.setProfile('hana-1', profile);
```

| Piece | What |
|---|---|
| `corePersona(src)` | A core persona from a bundle's database data (vrmxa-core's `readCharacterDb`: JSON columns as text, examples as rows) or the exchange form. Traits, languages and allowed expressions are parsed; examples become `{ user, character }`; tags and extensions are left out (not for the model) |
| `layer(core, app)` | The persona in effect: the core with the app's `overrides` laid over it, plus its `story`. The core is not changed |
| The project document | `personas.json`: `{ "format": "vrmxg-personas", "version": 1, "characters": { <vrmxa id>: { label, core?, overrides?, story?, framing?, profile?, goals?, gestures? } } }` |
| The role profile | Seven traits, 0…1, 0.5 neutral (`TRAITS`): sociability, curiosity, boldness, energy, talkativeness, personalSpace, patience (research/npc-ai.md §6). Derived once, then the author's to edit:<br>• `deriveProfile(persona, model)` asks a director LanguageModel and falls back to `profileFromTraits` if the answer is out of shape;<br>• `profileFromTraits` reads a small word list over the persona's traits and personality |
| `PersonaService` (`persona`) | For each Character node: `vrmxaIdOf`, `coreOf` (the bundle's, else the exchange file), `appOf`, `personaOf`, `profileOf`, `memoryOf`. `forDirector(id)` is the director's provider: the persona's text, its `allowedExpressions` (allowed_expressions without neutral), goals, gestures and framing. `setProfile` changes the project's document (`document()` to save), never the bundle |
| In the brains | `@vrmxg/ai`'s utility input `trait` reads `ai.trait(id, name)`: the persona service's profile, or 0.5 without one |
| In the director | A persona's `framing` replaces the director's default rules for that character |

**Personas are project data, not simulation state.** They are like a scene or an asset: not in the snapshot or the
hash. A run replays with the data it was recorded with. Editing a profile changes what later runs do, as editing a
scene does.

The character library (`@vrmxg/character`) now keeps each prepared character's VRMXA id and its bundle's database data
(`library.characters`).

The sample project (`content/sample/`):
- `personas.json` gives Hana and Mira stories and profiles, and gives Hana the goal `takeOrder`, the one the server tree
  answers to;
- `personas/hana.persona.json` is Hana's core persona, since her bundle has none;
- Mira's core persona is in her bundle.

Tests (`npm test`):
- core personas from both forms, with the app laid over;
- profiles from traits (the same every time), clamped, and from a model, with the fallback;
- a trait deciding a utility choice: talkative chats, reserved works;
- on the cafe (needs `vrmxa-avatar-studio`):
  - each character's id and personas;
  - the director's prompt in §11's order, with her examples, her faces only and her goals;
  - `setProfile` changing the document and the trait, never the bundle;
  - the cafe stepping to the same world with and without personas.

Not yet:
- reading the app persona from an app other than the sample project (the companion app has its own store, W11);
- the editor's persona inspector and MCP editing (W10);
- voices from `voice_id` (W3).
