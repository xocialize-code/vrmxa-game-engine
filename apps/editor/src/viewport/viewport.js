// The edit view's aids (M5 W5, AB-T-0604 and AB-T-0605): the selection outline, shape handles, the transform gizmo and
// the selection box, a picture-in-picture preview of the selected camera, the view cube, and rectangle select.
//
// Nothing here is in the world or the render host's scene. The aids that are drawn (outline, handles, gizmo, box) live
// in an overlay scene drawn after the edit view's frame, as the operator's vue-three-inspector draws its own
// (core/viewport.ts); the preview draws the host's scene through a camera of its own in a corner, after that. Exports,
// stills and the play world use other hosts or other frames, so no aid reaches an exported frame, the play world or a
// world hash. The view cube, the preview's frame and the rectangle are page content over the canvas.
//
// Presses on a handle or with ⌘ (Ctrl) are taken before the camera controls and the gizmo see them (a capturing
// listener on the canvas's parent). A handle's drag is shown live in the overlay and written once, on release, through
// the session (one undo step, the props the inspector edits).
import { Box3, Matrix3, Matrix4, PerspectiveCamera, Quaternion, Raycaster, Scene, Vector2, Vector3 } from 'three';
import { renderViews } from '@vrmxg/post';
import { topmost } from '@vrmxg/editor-core';
import { SelectionOutline } from './outline.js';
import { ShapeHandles } from './handles.js';
import { shapeOf, dragShape, closestOnLine } from './shapes.js';
import { normRect, isDrag, screenBox, rectSelect } from './rect.js';
import { makeViewCube, viewAngles } from './cube.js';
import { pipRect, previewable, previewPose } from './preview.js';
import { FrameComposite } from './composite.js';

const _m = new Matrix4(), _p = new Vector3(), _q = new Quaternion(), _s = new Vector3(), _v = new Vector3(), _box = new Box3(), _b2 = new Box3();
const ONE = new Vector3(1, 1, 1);

export class ViewportAids {
  /** @param {any} ed the EditorHost */
  constructor(ed) {
    this.ed = ed;
    this.scene = new Scene(); this.scene.name = 'editor-overlay';
    this.outline = new SelectionOutline();
    this.composite = new FrameComposite(); // WebGPU through the post stack: the frame and the aids drawn to the canvas together (composite.js)
    this.handles = new ShapeHandles();
    this.scene.add(this.handles.group);
    /** Which aids are on (the toolbar's switches). */
    this.show = { outline: true, preview: true, handles: true };
    /** Box select (M5 W5): a plain drag on the viewport draws the selection rectangle instead of turning the view. */
    this.boxSelect = false;
    this.pipCamera = new PerspectiveCamera(40, 16 / 9, 0.1, 500);
    this.ray = new Raycaster();
    /** A drag in progress: { kind: 'handle', ... } | { kind: 'rect', ... } | null */ this.drag = null;
    /** The camera node the preview shows, or null (what the status and AppProbe read). */ this.previewing = null;
    this._sel = null; this._edit = null; this._n = 0;
    if (typeof document !== 'undefined') this.mountPage();
  }

  // ---------------------------------------------------------------- page content: the layer, the cube, the preview's frame, the rectangle

  mountPage() {
    const stage = this.ed.canvas.parentElement;
    const layer = document.createElement('div');
    layer.className = 'viewport-aids';
    layer.style.cssText = 'position:absolute;inset:0;pointer-events:none;overflow:hidden;';
    stage.append(layer);
    this.layer = layer;
    this.rectEl = document.createElement('div');
    this.rectEl.id = 'rect-select'; this.rectEl.setAttribute('aria-hidden', 'true');
    this.rectEl.style.cssText = 'position:absolute;display:none;border:1px solid rgba(255,255,255,.85);background:rgba(100,150,255,.15);';
    this.pipEl = document.createElement('figure');
    this.pipEl.id = 'camera-preview'; this.pipEl.setAttribute('role', 'img');
    this.pipEl.style.cssText = 'position:absolute;display:none;margin:0;border:1px solid rgba(255,255,255,.7);box-shadow:0 2px 10px rgba(0,0,0,.4);';
    this.pipCaption = document.createElement('figcaption');
    this.pipCaption.style.cssText = 'position:absolute;left:0;top:0;padding:2px 6px;font:11px/1.4 system-ui,sans-serif;color:#fff;background:rgba(0,0,0,.55);';
    this.pipEl.append(this.pipCaption);
    layer.append(this.rectEl, this.pipEl);
    // two named marks near the viewport's corners, inset a little, where a scripted Box select drag starts and ends
    // (AppProbe aims at what the page names, never at coordinates it works out); they take no pointer events
    for (const [id, label, css] of [['viewport-near-top-left', 'Near the viewport\'s top left corner', 'left:4%;top:6%;'], ['viewport-near-bottom-right', 'Near the viewport\'s bottom right corner', 'right:4%;bottom:6%;']]) {
      const m = document.createElement('span');
      m.id = id; m.setAttribute('role', 'img'); m.setAttribute('aria-label', label);
      m.style.cssText = `position:absolute;${css}width:10px;height:10px;pointer-events:none;`;
      layer.append(m);
    }
    this.cube = makeViewCube(layer, (id) => this.viewFrom(id));
    const canvas = this.ed.canvas;
    this._listeners = [
      [stage, 'pointerdown', (e) => this.onDown(e)],
      [stage, 'pointermove', (e) => this.onMove(e)],
      [stage, 'pointerup', (e) => this.onUp(e)],
      [stage, 'pointercancel', (e) => this.onUp(e, true)],
      [stage, 'lostpointercapture', (e) => this.onUp(e, true)], // a release the page never heard (another app took the pointer)
      [window, 'keydown', (e) => { if (e.key === 'Escape' && this.drag) { e.preventDefault(); this.cancelDrag(); } }], // Escape drops a drag
    ];
    for (const [el, ev, fn] of this._listeners) el.addEventListener(ev, fn, { capture: true });
    this.canvas = canvas;
  }

  /** Hide the page content (the view isn't the edit view: playing, the timeline's preview). */
  setPageShown(on) {
    if (!this.layer) return;
    this.cube.show(on);
    if (!on) { this.pipEl.style.display = 'none'; this.rectEl.style.display = 'none'; this.previewing = null; this.markHandles(null); }
  }

  // ---------------------------------------------------------------- the frame

  /** In the edit view, after the host drew the frame: outline, overlay, preview, cube. */
  draw() {
    const ed = this.ed, renderer = ed.host.renderer, camera = ed.camera;
    this.setPageShown(true);
    const editing = ed.session?.mode === 'editing' && !!ed.edit;
    // the outline's stand-ins follow the selection and the edit view they were made from
    const sel = editing ? ed.session.selection.join('\n') : '';
    if (sel !== this._sel || ed.edit !== this._edit) {
      this._sel = sel; this._edit = ed.edit;
      const objects = editing ? ed.session.selection.map((id) => ed.edit.tree.find(id)?.object3d).filter(Boolean) : [];
      this.outline.setObjects(objects, ++this._n);
    }
    camera.updateMatrixWorld();
    this.updateHandles(editing);
    // WebGPU through the post stack: the frame went into the composite's target (beginFrame); the aids go into another,
    // and both are drawn to the canvas together (composite.js)
    const via = this.composite.active;
    if (via) this.composite.beginAids(renderer);
    try { this.drawAids(renderer, camera, editing); } finally { if (via) this.composite.present(renderer); }
    this.cube?.update(camera.quaternion.toArray());
  }

  /**
   * Before the host draws the edit view's frame: on WebGPU with the post stack active, the frame is drawn into the
   * composite's target, to go to the canvas with the aids in one pass (draw()). Call abortFrame if the frame fails.
   */
  beginFrame() {
    const r = this.ed.host.renderer;
    return r.isWebGPURenderer && !!this.ed.host.post?.active ? this.composite.beginFrame(r) : false;
  }

  /** The frame failed after beginFrame: back to the canvas. */
  abortFrame() { this.composite.abort(this.ed.host.renderer); }

  /** The outline, the overlay and the preview, over what the current target holds. */
  drawAids(renderer, camera, editing) {
    if (this.show.outline && editing) this.outline.render(renderer, camera);
    // the overlay: handles, gizmo, selection box, over the frame without clearing it or redrawing shadows
    const auto = renderer.autoClear, shadows = renderer.shadowMap?.autoUpdate;
    try {
      renderer.autoClear = false;
      if (renderer.shadowMap) renderer.shadowMap.autoUpdate = false;
      renderer.render(this.scene, camera);
    } finally { renderer.autoClear = auto; if (renderer.shadowMap) renderer.shadowMap.autoUpdate = shadows; }
    this.drawPreview(editing);
  }

  /** The handles of the primary selection's shape (a drag's shape while dragging). */
  updateHandles(editing) {
    const ed = this.ed, id = ed.session?.primary;
    const node = editing && this.show.handles && id ? ed.session.node(id) : null;
    const shape = node ? shapeOf(node, ed.registry) : null;
    const frame = shape ? this.frameOf(id) : null;
    if (!shape || !frame) { this.handles.hide(); this.markHandles(null); return; }
    const d = this.drag?.kind === 'handle' && this.drag.id === id ? this.drag : null;
    if (d?.result) frame.multiply(_m.makeTranslation(d.result.shift[0], d.result.shift[1], d.result.shift[2]));
    this.handles.show(d?.result?.shape ?? shape, frame, ed.camera, this.canvas?.clientHeight || 600);
    this.markHandles(id);
  }

  /**
   * A named mark on the page where each handle is (`handle-x-plus`, "Handle x+ of box"): the handles are drawn, so
   * AppProbe finds where to press and drag through these. They take no pointer events.
   */
  markHandles(id) {
    if (!this.layer) return;
    this.marks ??= new Map();
    const seen = new Set();
    if (id && this.handles.group.visible) {
      const w = this.canvas.clientWidth, h = this.canvas.clientHeight;
      // each handle, and half a metre out from it along the way it drags (where a scripted drag goes to)
      const put = (elId, label, at) => {
        seen.add(elId);
        let el = this.marks.get(elId);
        if (!el) {
          el = document.createElement('span');
          el.id = elId; el.setAttribute('role', 'img');
          el.style.cssText = 'position:absolute;width:14px;height:14px;margin:-7px 0 0 -7px;pointer-events:none;';
          this.layer.append(el); this.marks.set(elId, el);
        }
        const v = _v.fromArray(at).applyMatrix4(this.handles.frame).project(this.ed.camera);
        if (el.getAttribute('aria-label') !== label) el.setAttribute('aria-label', label);
        el.style.display = v.z > 1 ? 'none' : 'block';
        el.style.left = `${(((v.x + 1) / 2) * w).toFixed(1)}px`; el.style.top = `${(((1 - v.y) / 2) * h).toFixed(1)}px`;
      };
      for (const hd of this.handles.handles) {
        const elId = `handle-${hd.id.replace(/\+/g, '-plus').replace(/-$/, '-minus')}`;
        put(elId, `Handle ${hd.id} of ${id}`, hd.at);
        put(`${elId}-out`, `Half a metre out from handle ${hd.id} of ${id}`, hd.at.map((v, i) => v + hd.axis[i] * 0.5));
      }
    }
    for (const [k, el] of this.marks) if (!seen.has(k)) { el.remove(); this.marks.delete(k); }
  }

  /**
   * A node's shape frame: its world position and rotation without scale, from its parent in the edit view and its own
   * transform in the document (so it is right at once after an edit, before the edit view is rebuilt). → Matrix4 or null
   */
  frameOf(id) {
    const ed = this.ed, n = ed.session.node(id), o = ed.edit?.tree.find(id)?.object3d;
    if (!n || !o) return null;
    const t = n.transform ?? {};
    const local = new Matrix4().compose(_p.fromArray(t.p ?? [0, 0, 0]), _q.fromArray(t.q ?? [0, 0, 0, 1]), ONE);
    if (o.parent) { o.parent.updateWorldMatrix(true, false); local.premultiply(o.parent.matrixWorld); }
    local.decompose(_p, _q, _s);
    return new Matrix4().compose(_p, _q, ONE);
  }

  /** The picture in picture of the selected Camera or VirtualCamera, bottom right. */
  drawPreview(editing) {
    const ed = this.ed, id = editing && this.show.preview ? ed.session.primary : null;
    const node = id ? ed.edit.tree.find(id) : null;
    if (!previewable(node) || !this.canvas) { this.previewing = null; if (this.pipEl) this.pipEl.style.display = 'none'; return; }
    const w = this.canvas.clientWidth, h = this.canvas.clientHeight;
    const r = pipRect(w, h);
    if (r.width < 32 || r.height < 18 || r.x < 0) { this.previewing = null; if (this.pipEl) this.pipEl.style.display = 'none'; return; } // no room (a window being laid out)
    if (!previewPose(node, this.pipCamera, r.width / r.height)) return;
    // renderViews' y runs up from the bottom on WebGL; WebGPU's viewport runs down from the top
    const y = ed.host.renderer.isWebGPURenderer ? (h - r.y - r.height) / h : r.y / h;
    // cleared inside its rectangle: the WebGL post stack leaves autoClear off for good, which would draw the preview over
    // the frame and over depth left from earlier frames
    const renderer = ed.host.renderer, auto = renderer.autoClear;
    // into the composite's target (WebGPU through the post stack): a target draws through its own viewport, not the
    // renderer's, so the preview is drawn whole into one of its own and placed in its corner
    if (this.composite.active) this.composite.drawInset(renderer, ed.host.scene, this.pipCamera, r, w, h);
    else {
      try { renderer.autoClear = true; renderViews(renderer, ed.host.scene, [{ camera: this.pipCamera, x: r.x / w, y, w: r.width / w, h: r.height / h }]); }
      finally { renderer.autoClear = auto; }
    }
    this.previewing = id;
    if (this.pipEl) {
      Object.assign(this.pipEl.style, { display: 'block', right: `${r.right}px`, bottom: `${r.bottom}px`, width: `${r.width}px`, height: `${r.height}px` });
      const label = `Camera preview: ${node.name ?? id}`;
      if (this.pipCaption.textContent !== label) { this.pipCaption.textContent = label; this.pipEl.setAttribute('aria-label', label); }
    }
  }

  // ---------------------------------------------------------------- the view cube

  /** Look along one of the view cube's ends (px, nx, py, ny, pz, nz) at what the view centres on. */
  viewFrom(end) {
    const ed = this.ed;
    if (ed.cameraMode === 'orbit') {
      const { azimuth, polar } = viewAngles(end, ed.orbit.azimuthAngle);
      ed.orbit.rotateTo(azimuth, polar, true);
    } else {
      const axis = { px: [1, 0, 0], nx: [-1, 0, 0], py: [0, 1, 0], ny: [0, -1, 0], pz: [0, 0, 1], nz: [0, 0, -1] }[end];
      const c = ed.camera, at = c.position.clone().sub(_v.fromArray(axis));
      _m.lookAt(c.position, at, Math.abs(axis[1]) > 0.5 ? new Vector3(0, 0, -1) : new Vector3(0, 1, 0));
      c.quaternion.setFromRotationMatrix(_m);
    }
    this.lastView = end;
    ed.changed();
  }

  // ---------------------------------------------------------------- pointer: handles and rectangle select

  setRay(e) {
    const r = this.canvas.getBoundingClientRect();
    this.ray.setFromCamera(new Vector2(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1), this.ed.camera);
  }

  canEdit() { const ed = this.ed; return !!ed.session && ed.session.mode === 'editing' && ed.view === 'edit' && !!ed.edit; }

  /** Take a press away from the camera controls, the gizmo and the click pick. */
  take(e) {
    e.stopPropagation(); e.preventDefault();
    this.ed._downAt = null;
    try { this.canvas.setPointerCapture(e.pointerId); } catch { /* a synthetic event has no pointer to capture */ }
  }

  onDown(e) {
    if (e.target !== this.canvas || e.button !== 0 || !this.canEdit()) return;
    if (this.show.handles && this.handles.group.visible) {
      this.setRay(e);
      const h = this.handles.pick(this.ray);
      if (h) {
        const id = this.ed.session.primary, node = this.ed.session.node(id);
        const { point, axis } = this.handles.worldAxis(h);
        const t0 = closestOnLine(this.ray.ray.origin.toArray(), this.ray.ray.direction.toArray(), point.toArray(), axis.toArray()) ?? 0;
        this.drag = { kind: 'handle', id, handle: h, shape: shapeOf(node, this.ed.registry), point, axis, t0, result: null };
        this.take(e);
        return;
      }
    }
    // ⌘ (Ctrl) draws the rectangle; with Box select on, so does a plain press, except on the gizmo
    const cmd = e.metaKey || e.ctrlKey;
    if (cmd || (this.boxSelect && !this.ed.gizmo.axis)) {
      this.drag = { kind: 'rect', x0: e.clientX, y0: e.clientY, x1: e.clientX, y1: e.clientY, add: e.shiftKey, cmd };
      this.take(e);
      this.showRect();
    }
  }

  onMove(e) {
    const d = this.drag;
    if (!d) { this.hoverAt(e); return; }
    if (e.buttons === 0) { this.onUp(e, true); return; } // the button came up where the page didn't hear it: the drag is dropped
    e.stopPropagation();
    if (d.kind === 'rect') { d.x1 = e.clientX; d.y1 = e.clientY; this.showRect(); return; }
    this.setRay(e);
    const t = closestOnLine(this.ray.ray.origin.toArray(), this.ray.ray.direction.toArray(), d.point.toArray(), d.axis.toArray());
    if (t === null) return;
    d.result = dragShape(d.shape, d.handle.id, t - d.t0, { snap: this.ed.snap, symmetric: e.altKey });
  }

  /** Drop the drag in progress (Escape): nothing is written, a handle's shape goes back to the document's. */
  cancelDrag() {
    const d = this.drag;
    if (!d) return;
    this.drag = null;
    if (this.rectEl) this.rectEl.style.display = 'none';
  }

  onUp(e, cancelled = false) {
    const d = this.drag;
    if (!d) return;
    e.stopPropagation();
    this.drag = null;
    try { this.canvas.releasePointerCapture(e.pointerId); } catch { /* not captured */ }
    if (d.kind === 'rect') { this.rectEl && (this.rectEl.style.display = 'none'); if (!cancelled) this.finishRect(d); return; }
    if (!cancelled && d.result) this.commitHandle(d);
  }

  /** The cursor over a handle (and the handle lit). */
  hoverAt(e) {
    if (e.target !== this.canvas || e.buttons || !this.canEdit() || !this.handles.group.visible) { if (this.handles.hover) { this.handles.hover = null; this.canvas.style.cursor = ''; } return; }
    this.setRay(e);
    const h = this.handles.pick(this.ray)?.id ?? null;
    if (h !== this.handles.hover) { this.handles.hover = h; this.canvas.style.cursor = h ? 'grab' : ''; }
  }

  /**
   * A handle let go: the props it changed and (one side moved) the node's position, through the session as one undo step.
   * The shift is in the node's frame; the position is in its parent's, so it goes through the parent's inverse.
   */
  commitHandle(d) {
    const ed = this.ed, n = ed.session.node(d.id);
    if (!n) return;
    const same = Object.entries(d.result.props).every(([k, v]) => JSON.stringify(v) === JSON.stringify(shapeValue(d.shape, k)));
    if (same) return;
    let p;
    if (d.result.shift.some((v) => v !== 0)) {
      const frame = this.frameOf(d.id), o = ed.edit.tree.find(d.id)?.object3d;
      frame.decompose(_p, _q, _s);
      const world = new Vector3().fromArray(d.result.shift).applyQuaternion(_q);
      if (o?.parent) world.applyMatrix3(new Matrix3().setFromMatrix4(new Matrix4().copy(o.parent.matrixWorld).invert()));
      p = new Vector3().fromArray(n.transform?.p ?? [0, 0, 0]).add(world).toArray();
    }
    try { ed.session.resizeShape(d.id, d.result.props, p ? { p } : {}); } catch (err) { ed.error = String(err?.message ?? err); ed.changed(); }
  }

  showRect() {
    const d = this.drag; if (!d || !this.rectEl) return;
    const s = this.layer.getBoundingClientRect(), r = normRect(d.x0, d.y0, d.x1, d.y1);
    Object.assign(this.rectEl.style, { display: isDrag(r) ? 'block' : 'none', left: `${r.left - s.left}px`, top: `${r.top - s.top}px`, width: `${r.right - r.left}px`, height: `${r.bottom - r.top}px` });
  }

  /** The nodes wholly inside the rectangle, topmost only (a group, not its children too): selected, or added with ⇧. */
  finishRect(d) {
    const ed = this.ed, rect = normRect(d.x0, d.y0, d.x1, d.y1);
    if (!isDrag(rect)) { // a click: ⌘ adds what is under it; in Box select it picks as a plain click does (⇧ adds)
      const id = ed.pick(d.x0, d.y0);
      if (d.cmd) { if (id) ed.session.select([id], { add: true }); } else ed.session.select(id ? [id] : [], { add: d.add });
      return;
    }
    const ids = rectSelect(rect, this.screenItems());
    ed.session.select(topmost(ed.session.doc, ids), { add: d.add });
  }

  /** Every node of the document with its screen box (client pixels): its world bounds, or its origin when it draws nothing. */
  screenItems() {
    const ed = this.ed, cam = ed.camera, r = this.canvas.getBoundingClientRect();
    const root = ed.session.defaultParent();
    const project = (v) => { const ndc = v.clone().project(cam); return { x: r.left + ((ndc.x + 1) / 2) * r.width, y: r.top + ((1 - ndc.y) / 2) * r.height, behind: ndc.z > 1 || ndc.z < -1 }; };
    cam.updateMatrixWorld();
    const out = [];
    for (const n of ed.session.doc.nodes) {
      if (n.id === root) continue; // the scene's root holds everything; the rectangle picks what is in it
      const o = ed.edit.tree.find(n.id)?.object3d;
      if (!o || !SelectionOutline.shown(o)) continue; // a hidden node isn't picked
      visibleBounds(o, _box);
      const pts = _box.isEmpty() ? [o.getWorldPosition(new Vector3())]
        : [0, 1, 2, 3, 4, 5, 6, 7].map((i) => new Vector3(i & 1 ? _box.max.x : _box.min.x, i & 2 ? _box.max.y : _box.min.y, i & 4 ? _box.max.z : _box.min.z));
      out.push({ id: n.id, box: screenBox(pts.map(project)) });
    }
    return out;
  }

  dispose() {
    for (const [el, ev, fn] of this._listeners ?? []) el.removeEventListener(ev, fn, { capture: true });
    this.cube?.dispose(); this.layer?.remove();
    this.outline.dispose(); this.handles.dispose(); this.composite.dispose();
  }
}

/** The world bounds of what is shown under `root` (hidden parts left out). */
function visibleBounds(root, box) {
  box.makeEmpty();
  root.updateWorldMatrix(true, false);
  const walk = (o) => {
    if (!o.visible) return;
    if (o.isMesh || o.isLine || o.isPoints) { if (o.geometry) { o.geometry.boundingBox ?? o.geometry.computeBoundingBox(); if (o.geometry.boundingBox) box.union(_b2.copy(o.geometry.boundingBox).applyMatrix4(o.matrixWorld)); } }
    for (const c of o.children) walk(c);
  };
  walk(root);
  return box;
}

/** A shape's value for a prop a drag writes (to tell a drag that changed nothing). */
function shapeValue(shape, k) { return shape[k]; }
