// Bone masks for layered animation (M2 W8; proposed to VRMXA as G10, "a mask per clip or slot"). A masked clip is the
// clip with only its mask's tracks: the humanoid bones listed here (VRM 1.0 names), by their normalized nodes. `face`
// also keeps tracks that drive no humanoid bone (expressions, look-at).

const FINGERS = ['Thumb', 'Index', 'Middle', 'Ring', 'Little'].flatMap((f) => ['Proximal', 'Intermediate', 'Distal', 'Metacarpal'].map((p) => `${f}${p}`));
const side = (s, list) => list.map((b) => `${s}${b}`);
const HANDS = [...side('left', ['Hand', ...FINGERS]), ...side('right', ['Hand', ...FINGERS])];
const ARMS = [...side('left', ['Shoulder', 'UpperArm', 'LowerArm']), ...side('right', ['Shoulder', 'UpperArm', 'LowerArm']), ...HANDS];
const HEAD = ['neck', 'head', 'leftEye', 'rightEye', 'jaw'];

export const MASKS = {
  fullBody: null, // every track
  upperBody: ['spine', 'chest', 'upperChest', ...HEAD, ...ARMS],
  lowerBody: ['hips', ...side('left', ['UpperLeg', 'LowerLeg', 'Foot', 'Toes']), ...side('right', ['UpperLeg', 'LowerLeg', 'Foot', 'Toes'])],
  arms: ARMS,
  hands: HANDS,
  face: HEAD,
};

/** The node names a mask keeps on a VRM (normalized humanoid nodes), or null for fullBody. */
export function maskNodes(vrm, mask) {
  if (!(mask in MASKS)) throw new Error(`unknown mask "${mask}" (${Object.keys(MASKS).join(', ')})`);
  const bones = MASKS[mask];
  if (!bones) return null;
  const names = new Set();
  for (const b of bones) { const n = vrm.humanoid?.getNormalizedBoneNode(b); if (n?.name) names.add(n.name); }
  return names;
}

/** A clip cut down to a mask's tracks (three's AnimationClip with the same name and duration plus "|mask"). */
export function maskClip(clip, vrm, mask) {
  const keep = maskNodes(vrm, mask);
  if (!keep) return clip;
  const humanoid = maskNodes(vrm, 'upperBody'), lower = maskNodes(vrm, 'lowerBody');
  const tracks = clip.tracks.filter((t) => {
    const node = t.name.split('.')[0];
    if (keep.has(node)) return true;
    return mask === 'face' && !humanoid.has(node) && !lower.has(node); // expressions, look-at
  });
  return new clip.constructor(`${clip.name}|${mask}`, clip.duration, tracks);
}

/** The (clip, mask) pairs an animation document's slots name with a mask (fullBody left out). */
export function maskedEntries(doc) {
  const out = new Set();
  for (const s of doc?.sets ?? []) for (const list of Object.values(s.slots ?? {})) for (const e of list ?? []) if (e.mask && e.mask !== 'fullBody') out.add(`${e.clip}|${e.mask}`);
  return [...out].sort();
}
