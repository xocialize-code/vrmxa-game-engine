// What mesh2motion's own records say about where the starter's sources come from. Read from GitHub on 2026-11-25 (public
// history, read only) and written down here, so the tools stay offline and the provenance doesn't change by itself.
// make-animations.mjs and make-items.mjs copy it into the provenance files; make-licences.mjs into LICENCES.md.

/**
 * The snapshot read. Every file the tools read (37 clip GLBs, the skeleton, 3 props, LICENSE-CC0.MD, README.md and both
 * manifests) is byte-identical (git blob SHA) to mesh2motion-app at this commit; the checkout's code (src/) is a few
 * commits newer and none of it is used.
 */
export const PIN = {
  repo: 'Mesh2Motion/mesh2motion-app',
  commit: '7963d4c6f760152c41d60a8bdf52fc75d0d34925',
  date: '2026-11-07',
  message: 'update static assets from latest assets repo',
  archive: 'https://github.com/Mesh2Motion/mesh2motion-app/archive/7963d4c6f760152c41d60a8bdf52fc75d0d34925.zip',
  checked: 'every file read is byte-identical (git blob SHA) to this commit, checked 2026-11-25',
  assets: { repo: 'Mesh2Motion/mesh2motion-assets', commit: '5fda3d2430f3e9f0dd18f6a86cad7ac4a03d05d0', note: 'the .blend sources and the vendored CC0 packs (CC0-packs/Quaternius, CC0-packs/Kaykit) with their licence files, before the 2026-10-31 restructure' },
};

/** Clips mesh2motion tags `quaternius`: Quaternius' Universal Animation Library. */
export const QUATERNIUS = { author: 'Quaternius (quaternius.com), Universal Animation Library', licence: 'CC0-1.0', evidence: 'mesh2motion\'s manifest tags the clip "quaternius"; mesh2motion credits Quaternius for its base human model, rig and animations (src/lib/Generators.ts); Quaternius\' CC0 licence is vendored at mesh2motion-assets CC0-packs/Quaternius/License.txt' };

/**
 * The clips without the tag: no author is recorded anywhere mesh2motion says. Every commit that touches their .blend
 * sources (in mesh2motion-app before 2025-11-19, then mesh2motion-assets) is by its maintainer, Scott Petrovic; none
 * names a third party, pack or capture, and none is one of mesh2motion's motion captures (motion-capture/, the
 * maintainer's own mocopi takes). A commit's author isn't the work's author, so these stay "author unrecorded":
 * CC0 rests on mesh2motion's blanket statement (LICENSE-CC0.MD, README).
 */
const UNRECORDED = 'unrecorded (CC0 per mesh2motion\'s blanket statement, author unrecorded)';
const MAINTAINER = 'every commit by mesh2motion\'s maintainer Scott Petrovic';
export const UNTAGGED = {
  // first in mesh2motion-app's static/blender/rigs/human/ (commits by the maintainer, no source named), moved to
  // mesh2motion-assets in its first import (6a3fa3c, 2025-11-19) and renamed there since
  'idle-listening': `${MAINTAINER}: first added in mesh2motion-app e71cd83 (2025-11-14, "A few more simple human animations"), then ff452e5; moved to mesh2motion-assets 6a3fa3c (2025-11-19)`,
  confused: `${MAINTAINER}: first added in mesh2motion-app f841f52 (2025-11-12, "Add some human animations"); moved 6a3fa3c (2025-11-19), touched up 094fbbd (2025-11-21)`,
  'head-nod': `${MAINTAINER}: first added in mesh2motion-app f841f52 (2025-11-12, "Add some human animations"), then ff452e5; moved 6a3fa3c (2025-11-19)`,
  victory: `${MAINTAINER}: first added in mesh2motion-app f841f52 (2025-11-12, "Add some human animations"), then ff452e5; moved 6a3fa3c (2025-11-19)`,
  angry: `${MAINTAINER}: first added in mesh2motion-app 2882d36 (2025-11-13, "Add couple more human animations"); moved 6a3fa3c (2025-11-19), fixed up 094fbbd and 8a2c14b`,
  greeting: `${MAINTAINER}: first added in mesh2motion-assets c48ce1f (2026-03-13, "Add a couple more human animations")`,
  'victory-fist-pump': `${MAINTAINER}: first added in mesh2motion-assets c48ce1f (2026-03-13, "Add a couple more human animations")`,
  'death-a': `${MAINTAINER}: first added in mesh2motion-assets 3e7261f (2026-06-28, "Add a few death animations"), touched 14fb74a and 8a2c14b`,
  // no history before the squashed restructure: first published there, added (not renamed), no source named
  clapping: `${MAINTAINER}: first published in the squashed restructure, mesh2motion-assets cd9c0c3 (2026-10-31, added, no earlier history), retimed e4ba3d3 (2026-11-06)`,
  'pick-up': `${MAINTAINER}: first published in the squashed restructure, mesh2motion-assets cd9c0c3 (2026-10-31, added, no earlier history), retimed e4ba3d3 (2026-11-06)`,
  'kick-front': `${MAINTAINER}: first published in the squashed restructure, mesh2motion-assets cd9c0c3 (2026-10-31, added, no earlier history), retimed e4ba3d3 (2026-11-06)`,
};
export const untagged = (src) => (UNTAGGED[src] ? { author: UNRECORDED, licence: 'CC0-1.0', evidence: `not tagged quaternius; ${UNTAGGED[src]}` } : null);

/**
 * mesh2motion's weapon props are KayKit's: Props-MASTER.blend (mesh2motion-assets 78b954d, 2026-09-27) brought in the
 * vendored pack, and each prop is the pack's mesh re-exported (the same index count and extents, turned 90° about Y).
 */
const KAYKIT = { author: 'Kay Lousberg (www.kaylousberg.com), KayKit: Fantasy Weapons Bits 1.0', licence: 'CC0-1.0', evidence: 'vendored at mesh2motion-assets CC0-packs/Kaykit/KayKit_FantasyWeaponsBits_1.0_FREE (License.txt: Creative Commons Zero, CC0; credit not mandatory); mesh2motion\'s prop has the pack\'s mesh (same index count and extents) and its weapons_bits_texture.png' };
export const PROPS = {
  sword_A: { ...KAYKIT, pack: 'Assets/sword_A.glb (876 indices)' },
  axe_A: { ...KAYKIT, pack: 'Assets/axe_A.glb (3618 indices)' },
  hammer_A: { ...KAYKIT, pack: 'Assets/hammer_A.glb (1572 indices)' },
};
