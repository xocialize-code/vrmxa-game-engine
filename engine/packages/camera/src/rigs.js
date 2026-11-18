// Rig presets (research/cinematics.md §1.2): each one a VirtualCamera's body / aim / lens / noise defaults, so the
// editor, MCP and sequences use the same building blocks. A VirtualCamera's own props override any part.
//   { "type": "VirtualCamera", "props": { "rig": "overShoulder", "body": { "target": "mira" }, "aim": { "target": "hana-1" } } }
// shotReverse is placed by the rig's own geometry (shotReverse()), on one side of the 180° line between two characters.

export const RIGS = {
  fixed: { body: { type: 'fixed' }, aim: { type: 'lookAt' }, lens: { focalLength: 35 } },
  security: { body: { type: 'fixed' }, aim: { type: 'none' }, lens: { focalLength: 18 } },
  follow: { body: { type: 'follow', offset: [0, 1.7, -3.4], damping: 0.25 }, aim: { type: 'composer', screen: [0, 0.1], damping: 0.3 }, lens: { focalLength: 35 } },
  thirdPerson: { body: { type: 'thirdPerson', shoulder: 0.45, arm: 2.4 }, aim: { type: 'composer', screen: [0.15, 0.1], damping: 0.25 }, lens: { focalLength: 32 } },
  overShoulder: { body: { type: 'thirdPerson', shoulder: 0.4, arm: 1.3, collide: false }, aim: { type: 'composer', screen: [0.25, 0.15], deadZone: [0.05, 0.05], damping: 0.3 }, lens: { focalLength: 45 } },
  firstPerson: { body: { type: 'firstPerson' }, aim: { type: 'none' }, lens: { focalLength: 24 } },
  topDown: { body: { type: 'follow', offset: [0, 9, -0.01], space: 'world', damping: 0.3 }, aim: { type: 'lookAt', eyes: false }, lens: { focalLength: 35 } },
  orbit: { body: { type: 'orbit', radius: 4, pitch: 15 }, aim: { type: 'lookAt' }, lens: { focalLength: 40 } },
  turntable: { body: { type: 'orbit', radius: 3, pitch: 8, yawSpeed: 20 }, aim: { type: 'lookAt' }, lens: { focalLength: 60 } },
  dolly: { body: { type: 'dolly', pathDamping: 0.3 }, aim: { type: 'composer', screen: [0, 0.1], damping: 0.4 }, lens: { focalLength: 40 } },
  crane: { body: { type: 'dolly', pathDamping: 0.5 }, aim: { type: 'composer', screen: [0, 0], damping: 0.6 }, lens: { focalLength: 28 } },
  closeUp: { body: { type: 'follow', offset: [0, 1.55, 0.9], damping: 0.15 }, aim: { type: 'composer', screen: [0, 0.18], deadZone: [0.04, 0.04], damping: 0.2 }, lens: { focalLength: 85, fStop: 1.8 } },
  twoShot: { body: { type: 'fixed' }, aim: { type: 'groupFraming', size: 0.75 }, lens: { focalLength: 35 } },
  handheld: { body: { type: 'fixed' }, aim: { type: 'lookAt' }, lens: { focalLength: 35 }, noise: { profile: 'handheldLight' } },
  shotReverse: { body: { type: 'fixed' }, aim: { type: 'composer', screen: [0.2, 0.15], deadZone: [0.04, 0.04], damping: 0.2 }, lens: { focalLength: 50 } },
};

/** A rig's defaults (an unknown or missing rig: fixed, looking at its target). */
export function rigDefaults(name) {
  const r = RIGS[name] ?? RIGS.fixed;
  return { body: { ...r.body }, aim: { ...r.aim }, lens: { ...r.lens }, noise: r.noise ? { ...r.noise } : null };
}

/**
 * Shot / reverse shot on the 180° line between characters `a` and `b`: the shot is over a's shoulder looking at b, the
 * reverse (`reverse: true`) over b's shoulder looking at a, both on `side` (+1 or −1) of the line from a to b, which
 * keeps them on one side of it (the 180° rule). → { p: [x, y, z], at: [x, y, z] } (world, eye height `height`).
 */
export function shotReverse(a, b, { side = 1, reverse = false, back = 1.1, shoulder = 0.45, height = 1.55 } = {}) {
  const dx = b[0] - a[0], dz = b[2] - a[2], len = Math.sqrt(dx * dx + dz * dz) || 1;
  const lx = -(dz / len) * side, lz = (dx / len) * side;  // the side of the a→b line both cameras keep to
  const from = reverse ? b : a, to = reverse ? a : b;
  const fx = (to[0] - from[0]) / len, fz = (to[2] - from[2]) / len;
  return { p: [from[0] - fx * back + lx * shoulder, from[1] + height, from[2] - fz * back + lz * shoulder], at: [to[0], to[1] + height - 0.05, to[2]] };
}
