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
    this.aspect = 16 / 9;
  }

  register(cam) {
    this.cameras.push(cam);
    cam.applyLens(this.aspect);
    if (!this.current) this.current = cam;
  }
  unregister(cam) {
    this.cameras = this.cameras.filter((c) => c !== cam);
    if (this.current === cam) this.current = this.cameras[0] ?? null;
  }
  setCurrent(cam) { this.current = cam; this.tree.emit?.(cam, 'madeCurrent', {}); }

  /** The cameras part of a world snapshot: which camera is current (each camera keeps its own rig state). */
  getState() { return { current: this.current?.id ?? null }; }
  setState(s) { this.current = s.current === null ? null : this.cameras.find((c) => c.id === s.current) ?? this.current; }

  /** The output's aspect changed (canvas resize, export size). */
  setAspect(aspect) { this.aspect = aspect; for (const c of this.cameras) c.applyLens(aspect); }

  afterNodes(dt) {
    const input = this.tree.services.get('input');
    const physics = this.tree.services.get('physics');
    if (input && this.current && input.pressed('camera_next')) this.current.nextPreset();
    for (const cam of this.cameras) {
      if (this.tree.scaleOf(cam) === 0) continue;
      const look = input && cam === this.current ? { lookX: input.axis('look_x'), lookY: input.axis('look_y'), zoom: input.axis('zoom') } : null;
      cam.stepRig(dt * this.tree.scaleOf(cam), look, physics);
    }
  }
}
