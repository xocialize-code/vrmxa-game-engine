// Shape handles' drawing and picking (M5 W5, AB-T-0605): the selected node's shape as a wireframe and a dot per handle,
// in the viewport's overlay scene (never the world's). The maths is shapes.js; the drag is the viewport's (viewport.js).
// The frame is the node's world position and rotation without scale, where physics puts the shape.
import { BufferAttribute, BufferGeometry, Group, LineBasicMaterial, LineSegments, Matrix4, Mesh, MeshBasicMaterial, Quaternion, SphereGeometry, Vector3 } from 'three';
import { handlesOf, shapeLines } from './shapes.js';

const COLORS = { x: 0xe5484d, y: 0x46a758, z: 0x3e63dd, r: 0xffc53d, range: 0xffc53d, angle: 0xff8b3e };
const colorOf = (id) => COLORS[id] ?? COLORS[id[0] === 'r' ? 'r' : id[0]] ?? 0xffffff;
const _p = new Vector3(), _q = new Quaternion(), _s = new Vector3(), _w = new Vector3(), _c = new Vector3();

export class ShapeHandles {
  constructor() {
    this.group = new Group(); this.group.name = 'shape-handles'; this.group.visible = false;
    this.group.matrixAutoUpdate = false;
    this.lines = new LineSegments(new BufferGeometry(), new LineBasicMaterial({ color: 0xffc53d, depthTest: false, depthWrite: false, transparent: true, opacity: 0.9, toneMapped: false, fog: false }));
    this.lines.renderOrder = 9990; this.lines.frustumCulled = false;
    this.group.add(this.lines);
    this.dotGeometry = new SphereGeometry(1, 12, 8);
    /** @type {Mesh[]} */ this.dots = [];
    this.handles = [];
    this.linesKey = '';
    this.hover = null;
    this.frame = new Matrix4();
  }

  /**
   * Show a shape in a frame (a Matrix4 with no scale), its dots `px` CSS pixels across for `camera` on a viewport `h` pixels tall.
   * @param {any} shape @param {Matrix4} frame @param {any} camera @param {number} h
   */
  show(shape, frame, camera, h, px = 11) {
    if (!shape) { this.hide(); return; }
    this.group.visible = true;
    this.frame.copy(frame);
    this.group.matrix.copy(frame); this.group.matrixWorld.copy(frame);
    const key = JSON.stringify(shape);
    if (key !== this.linesKey) {
      this.linesKey = key;
      this.lines.geometry.dispose();
      const g = new BufferGeometry(); g.setAttribute('position', new BufferAttribute(new Float32Array(shapeLines(shape)), 3));
      this.lines.geometry = g;
    }
    this.handles = handlesOf(shape);
    while (this.dots.length < this.handles.length) {
      const m = new Mesh(this.dotGeometry, new MeshBasicMaterial({ color: 0xffffff, depthTest: false, depthWrite: false, toneMapped: false, fog: false }));
      m.renderOrder = 9991; m.frustumCulled = false; this.group.add(m); this.dots.push(m);
    }
    frame.decompose(_p, _q, _s);
    this.handles.forEach((hd, i) => {
      const m = this.dots[i];
      m.visible = true;
      m.position.fromArray(hd.at);
      _w.fromArray(hd.at).applyMatrix4(frame);
      const r = worldPerPixel(camera, _w, h) * (px / 2) * (this.hover === hd.id ? 1.35 : 1);
      m.scale.setScalar(r);
      m.material.color.setHex(this.hover === hd.id ? 0xffffff : colorOf(hd.id));
      m.userData.handle = hd.id;
    });
    for (let i = this.handles.length; i < this.dots.length; i++) this.dots[i].visible = false;
    this.group.updateMatrixWorld(true);
  }

  hide() { this.group.visible = false; this.handles = []; this.hover = null; }

  /** The handle under a ray (a three Raycaster), or null. */
  pick(raycaster) {
    if (!this.group.visible) return null;
    const hits = raycaster.intersectObjects(this.dots.filter((d) => d.visible), false);
    return hits.length ? this.handles.find((h) => h.id === hits[0].object.userData.handle) ?? null : null;
  }

  /** A handle's point and outward axis in world space: { point: Vector3, axis: Vector3 }. */
  worldAxis(handle) {
    const point = new Vector3().fromArray(handle.at).applyMatrix4(this.frame);
    this.frame.decompose(_p, _q, _s);
    return { point, axis: new Vector3().fromArray(handle.axis).applyQuaternion(_q).normalize() };
  }

  dispose() {
    this.lines.geometry.dispose(); this.lines.material.dispose(); this.dotGeometry.dispose();
    for (const d of this.dots) d.material.dispose();
  }
}

/** World units per CSS pixel at a point, for a perspective camera on a viewport `h` pixels tall. */
export function worldPerPixel(camera, point, h) {
  if (camera.isOrthographicCamera) return (camera.top - camera.bottom) / camera.zoom / h;
  const d = Math.max(1e-3, _c.setFromMatrixPosition(camera.matrixWorld).distanceTo(point));
  return (2 * d * Math.tan((camera.fov * Math.PI) / 360)) / h;
}
