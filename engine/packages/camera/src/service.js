// The cameras service ("cameras"): knows every Camera node and which one is current, steps the rigs once
// per simulation step in the afterNodes phase (install it after physics, so rigs see this step's
// character positions and the spring arm this step's world), feeds look input to the current camera only,
// and cycles its preset on the camera_next action.
export class CameraService {
  /** @param {import('@vrmxg/core').SceneTree} tree */
  constructor(tree) {
    this.tree = tree;
    /** @type {any[]} */ this.cameras = [];
    /** @type {any} */ this.current = null;
    /** @type {any[]} */ this.virtual = [];   // VirtualCameras (M2 W2)
    /** @type {any[]} */ this.brains = [];    // CameraBrains
    this.aspect = 16 / 9;
    /** @type {number | undefined} the aspect the world fixed (fixAspect), or undefined: it follows the output */
    this.fixed = undefined;
  }

  registerVirtual(v) { this.virtual.push(v); }
  unregisterVirtual(v) { this.virtual = this.virtual.filter((x) => x !== v); }
  registerBrain(b) { this.brains.push(b); }
  unregisterBrain(b) { this.brains = this.brains.filter((x) => x !== b); }

  register(cam) {
    this.cameras.push(cam);
    cam.applyLens(this.aspect);
    if (!this.current) this.current = cam;
  }
  unregister(cam) {
    this.cameras = this.cameras.filter((c) => c !== cam);
    if (this.current === cam) this.current = this.cameras[0] ?? null;
  }
  /**
   * Player n's camera (M3 W9, split screen): the Camera whose `player` prop is n; for player 1 with none, the current one.
   * @param {number} n
   */
  forPlayer(n = 1) { return this.cameras.find((c) => c.props.player === n) ?? (n === 1 ? this.current : null); }
  setCurrent(cam) { this.current = cam; this.tree.emit?.(cam, 'madeCurrent', {}); }

  /** The cameras part of a world snapshot: which camera is current (each camera keeps its own rig state). */
  getState() { return { current: this.current?.id ?? null }; }
  setState(s) { this.current = s.current === null ? null : this.cameras.find((c) => c.id === s.current) ?? this.current; }

  /**
   * The output's aspect changed (canvas resize, export size). Every lens refits for drawing. The aspect the virtual
   * cameras frame with in the step (a composer's screen position, a group's framing) follows it too, unless the world
   * fixed it (fixAspect).
   */
  setAspect(aspect) { if (this.fixed === undefined) this.aspect = aspect; for (const c of this.cameras) c.applyLens(aspect); }

  /**
   * Fix the aspect the simulation frames with, whatever the window does: a sequence world, which must step the same
   * whether it is shown in a viewport, a still or an export (a scrub restores snapshots taken at this aspect).
   */
  fixAspect(aspect) { this.fixed = aspect; this.aspect = aspect; }

  afterNodes(dt) {
    const input = this.tree.services.get('input');
    const physics = this.tree.services.get('physics');
    if (input && this.current && input.pressed('camera_next') && !this.current.drivenBy) this.current.nextPreset();
    // split screen (M3 W9): a camera for player 2 or later cycles on that player's camera_next
    for (const cam of this.cameras) { const n = cam.props.player; if (n > 1 && input?.pressed(`p${n}.camera_next`) && !cam.drivenBy) cam.nextPreset(); }
    // virtual cameras first (their shots), then the cameras' own rigs, then the brains (they win on the cameras they drive)
    for (const v of this.virtual) if (this.tree.scaleOf(v) > 0) v.step(dt * this.tree.scaleOf(v), physics, this.aspect);
    for (const cam of this.cameras) {
      if (this.tree.scaleOf(cam) === 0 || cam.drivenBy) continue;
      // look input: the current camera's from player 1; a camera that names a player (split screen) from that player
      const n = cam.props.player, pre = n > 1 ? `p${n}.` : '';
      const looks = input && (n ? true : cam === this.current);
      const look = looks ? { lookX: input.axis(`${pre}look_x`), lookY: input.axis(`${pre}look_y`), zoom: n > 1 ? 0 : input.axis('zoom') } : null;
      cam.stepRig(dt * this.tree.scaleOf(cam), look, physics);
    }
    for (const b of this.brains) if (this.tree.scaleOf(b) > 0) b.step(this.virtual);
  }
}
