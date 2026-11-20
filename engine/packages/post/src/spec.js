// The post stack as scene data (research/cinematics.md §1.3): an Environment node's `post` is a list of effects, or a
// preset name. Order in the list doesn't matter: the stack always runs the anime order (edges → DOF → one merged pass of
// bloom, grade, LUT, tone mapping, vignette, grain and the anime overlays → chromatic aberration → SMAA without MSAA).
//   "post": "anime"
//   "post": [{ "effect": "bloom", "intensity": 1.2 }, { "effect": "vignette" }, { "effect": "anime", "speedLines": 0 }]
// Lengths are in pixels at 1080p and scale with the output's height.

/** Every effect, its defaults and what it is. */
export const EFFECTS = {
  edges: { thickness: 1, colour: '#0d080a', strength: 1, about: 'Screen-space depth + normal edges on sets and props (characters masked: they keep MToon\'s outline). thickness in px at 1080p' },
  dof: { auto: true, focusDistance: 3, focusRange: 2, bokehScale: 2, about: 'Depth of field. auto: from the current Camera\'s lens (focal length, f-stop, focus: thin-lens maths); else the numbers given (m, px at 1080p)' },
  bloom: { intensity: 1, threshold: 0.9, smoothing: 0.03, radius: 0.6, about: 'Bloom on what is brighter than threshold (emissive, lights)' },
  grade: { saturation: 0, hue: 0, brightness: 0, contrast: 0, about: 'Colour grade: saturation, hue (radians), brightness, contrast (−1…1)' },
  lut: { file: null, intensity: 1, about: 'A 3D LUT (.cube) from the project' },
  toneMapping: { mode: null, about: 'Tone mapping mode (default: the Environment\'s toneMapping); the renderer\'s own is off while the stack runs' },
  vignette: { offset: 0.3, darkness: 0.55 },
  grain: { amount: 0.25, about: 'Film grain, its pattern from the frame time (deterministic in exports)' },
  anime: { speedLines: 0, focusLines: 0, impact: 0, seed: 3, centre: [0.5, 0.5], about: 'Speed lines, focus lines and impact frames (0…1 each); seed changes the streaks (key it on twos)' },
  chromaticAberration: { offset: 1.2, about: 'Chromatic aberration, offset in px at 1080p, radial' },
  smaa: { about: 'SMAA when multisampling is off' },
};

/** The presets a scene can name instead of a list. */
export const PRESETS = {
  anime: [
    { effect: 'edges' }, { effect: 'dof' }, { effect: 'bloom', intensity: 0.9 }, { effect: 'grade', saturation: 0.12, contrast: 0.06 },
    { effect: 'toneMapping' }, { effect: 'vignette' }, { effect: 'grain', amount: 0.18 }, { effect: 'anime' }, { effect: 'chromaticAberration', offset: 0.8 },
  ],
  clean: [{ effect: 'bloom', intensity: 0.6 }, { effect: 'toneMapping' }],
};

/** The layer characters are on for the edge mask (the render host enables it on Character subtrees). */
export const CHARACTER_LAYER = 2;

export const ORDER = ['edges', 'dof', 'bloom', 'grade', 'lut', 'toneMapping', 'vignette', 'grain', 'anime', 'chromaticAberration', 'smaa'];

/**
 * A post spec in canonical form: [{ effect, ...params }] in the stack's order, defaults filled in, unknown effects refused.
 * @param {string | any[] | null | undefined} post
 */
export function normalizePost(post) {
  if (!post) return [];
  const list = typeof post === 'string' ? PRESETS[post] : post;
  if (!list) throw new Error(`unknown post preset "${post}" (${Object.keys(PRESETS).join(', ')})`);
  const out = [];
  for (const e of list) {
    const d = EFFECTS[e.effect];
    if (!d) throw new Error(`unknown post effect "${e.effect}" (${Object.keys(EFFECTS).join(', ')})`);
    const { about: _about, ...defaults } = d; void _about;
    if (e.enabled === false) continue;
    out.push({ ...defaults, ...e });
  }
  return out.sort((a, b) => ORDER.indexOf(a.effect) - ORDER.indexOf(b.effect));
}

/** The structure of a spec (which effects, in order): a change here rebuilds the passes; a change of values doesn't. */
export const structureOf = (spec) => spec.map((e) => `${e.effect}${e.effect === 'lut' ? `:${e.file}` : ''}`).join('|');
