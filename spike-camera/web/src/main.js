// VRMXG camera spike (M3 W5, AB-T-0544), the page side: MediaPipe tasks-vision 1.2.2 in the page, run on a video file
// (timings, headless) or the camera (getUserMedia, live). Every detector frame becomes a feature frame, the format the
// native Vision path (mac/) emits too:
//   { t: ms, face: { x, y, w, yaw, pitch, roll } | null, hands: [{ side, wrist: [x, y], tips: [[x, y] ×5], pips: [[x, y] ×5] }] }
// Coordinates are mirrored (as a selfie preview: the person's right is +x), y up; x runs −1…1 across the image and y
// uses the same unit (pixels / half the width); w is the face's width in that unit; angles in radians (yaw + to the person's left as seen in the mirror, pitch + up).
//   ?probe[&gum=1]                       secure context, mediaDevices, and (gum=1) whether getUserMedia gives a stream
//   ?bench&clip=clips/x.mp4&frames=300   timings per detector on a video file, frame by frame
//   ?camera                              live: the camera, the features and their log (window.__features)
// Results in window.__result, window.READY = true when done (the harness and Playwright read them).
import { FilesetResolver, FaceLandmarker, GestureRecognizer, PoseLandmarker } from '@mediapipe/tasks-vision';

const q = new URLSearchParams(location.search);
const out = document.getElementById('out');
const errors = (window.__errors = []), warnings = (window.__warnings = []);
addEventListener('error', (e) => errors.push(String(e.message)));
addEventListener('unhandledrejection', (e) => errors.push(String(e.reason?.message ?? e.reason)));
const done = (result) => { window.__result = result; out.textContent = JSON.stringify(result, null, 1); window.READY = true; };

const TIP = [4, 8, 12, 16, 20], PIP = [3, 6, 10, 14, 18];
/** mirrored coordinates (x −1…1, y in the same unit) from MediaPipe's 0…1 image coordinates (x right, y down, unmirrored) */
let ASPECT = 1; // height / width of the frames being read
const m = (p) => [+(1 - 2 * p.x).toFixed(4), +((1 - 2 * p.y) * ASPECT).toFixed(4)];

/** yaw, pitch, roll from MediaPipe's facial transformation matrix (column-major 4×4) */
function angles(mx) {
  const d = mx.data; // r00 r10 r20 . r01 r11 r21 . r02 r12 r22
  const r20 = d[2], r21 = d[6], r22 = d[10], r10 = d[1], r00 = d[0];
  return { yaw: -Math.asin(Math.max(-1, Math.min(1, -r20))), pitch: Math.atan2(r21, r22), roll: -Math.atan2(r10, r00) };
}

function featureFrame(t, face, hands) {
  const f = { t: +t.toFixed(1), face: null, hands: [] };
  const lm = face?.faceLandmarks?.[0];
  if (lm) {
    let x0 = 1, x1 = 0, y0 = 1, y1 = 0;
    for (const p of lm) { x0 = Math.min(x0, p.x); x1 = Math.max(x1, p.x); y0 = Math.min(y0, p.y); y1 = Math.max(y1, p.y); }
    const [x, y] = m({ x: (x0 + x1) / 2, y: (y0 + y1) / 2 });
    const a = face.facialTransformationMatrixes?.[0] ? angles(face.facialTransformationMatrixes[0]) : { yaw: 0, pitch: 0, roll: 0 };
    f.face = { x, y, w: +(2 * (x1 - x0)).toFixed(4), yaw: +a.yaw.toFixed(4), pitch: +a.pitch.toFixed(4), roll: +a.roll.toFixed(4) };
  }
  (hands?.landmarks ?? []).forEach((l, i) => {
    // MediaPipe names handedness as if the image were mirrored; ours is the camera's, so its "Left" is the person's right
    const side = hands.handedness?.[i]?.[0]?.categoryName === 'Left' ? 'right' : 'left';
    f.hands.push({ side, wrist: m(l[0]), tips: TIP.map((k) => m(l[k])), pips: PIP.map((k) => m(l[k])), mp: hands.gestures?.[i]?.[0]?.categoryName ?? null });
  });
  return f;
}

async function detectors(which, mode) {
  const files = await FilesetResolver.forVisionTasks('./wasm');
  const base = (model) => ({ baseOptions: { modelAssetPath: `./models/${model}`, delegate: q.get('delegate') ?? 'GPU' }, runningMode: mode });
  const d = {};
  if (which.includes('face')) d.face = await FaceLandmarker.createFromOptions(files, { ...base('face_landmarker.task'), numFaces: 1, outputFacialTransformationMatrixes: true });
  if (which.includes('gesture')) d.gesture = await GestureRecognizer.createFromOptions(files, { ...base('gesture_recognizer.task'), numHands: 2 });
  if (which.includes('pose')) d.pose = await PoseLandmarker.createFromOptions(files, { ...base('pose_landmarker_full.task'), numPoses: 1 });
  return d;
}

const stats = (a) => { const s = [...a].sort((x, y) => x - y); return s.length ? { median: +s[s.length >> 1].toFixed(2), p90: +s[Math.floor(s.length * 0.9)].toFixed(2), mean: +(s.reduce((x, y) => x + y, 0) / s.length).toFixed(2) } : null; };

async function probe() {
  const r = { origin: location.origin, secure: self.isSecureContext, mediaDevices: typeof navigator.mediaDevices, getUserMedia: typeof navigator.mediaDevices?.getUserMedia, ua: navigator.userAgent };
  try { r.devices = (await navigator.mediaDevices?.enumerateDevices())?.map((d) => d.kind); } catch (e) { r.devicesError = String(e.message ?? e); }
  if (q.has('gum')) {
    try { const s = await navigator.mediaDevices.getUserMedia({ video: { width: 640, height: 480 } }); const t = s.getVideoTracks()[0]; r.gum = { ok: true, label: t.label, settings: t.getSettings() }; s.getTracks().forEach((x) => x.stop()); }
    catch (e) { r.gum = { ok: false, error: `${e.name}: ${e.message}` }; }
  }
  done(r);
}

async function bench() {
  const which = (q.get('models') ?? 'face,gesture,pose').split(',');
  const video = Object.assign(document.createElement('video'), { muted: true, playsInline: true, src: q.get('clip') ?? 'clips/clip.mp4' });
  document.body.append(video);
  await new Promise((r, j) => { video.onloadeddata = r; video.onerror = () => j(new Error(`can't load ${video.src}`)); });
  ASPECT = video.videoHeight / video.videoWidth;
  const fps = +(q.get('fps') ?? 25), frames = Math.min(+(q.get('frames') ?? 300), Math.floor(video.duration * fps));
  const t0 = performance.now(), d = await detectors(which, 'VIDEO'), initMs = performance.now() - t0;
  const ms = Object.fromEntries(which.map((k) => [k, []])), features = [];
  let faces = 0, hands = 0;
  for (let i = 0; i < frames; i++) {
    video.currentTime = i / fps;
    await new Promise((r) => (video.onseeked = r));
    const ts = (i * 1000) / fps;
    const time = (f) => { const a = performance.now(); const v = f(); return [v, performance.now() - a]; };
    const [face, fm] = d.face ? time(() => d.face.detectForVideo(video, ts)) : [null, 0];
    const [hand, gm] = d.gesture ? time(() => d.gesture.recognizeForVideo(video, ts)) : [null, 0];
    const [, pm] = d.pose ? time(() => d.pose.detectForVideo(video, ts)) : [null, 0];
    if (i >= 5) { if (d.face) ms.face.push(fm); if (d.gesture) ms.gesture.push(gm); if (d.pose) ms.pose.push(pm); } // the first frames warm the GPU
    const f = featureFrame(ts, face, hand);
    if (f.face) faces++;
    hands += f.hands.length;
    features.push(f);
  }
  done({ clip: video.src.split('/').pop(), size: [video.videoWidth, video.videoHeight], frames, initMs: +initMs.toFixed(1), delegate: q.get('delegate') ?? 'GPU', ms: Object.fromEntries(Object.entries(ms).map(([k, v]) => [k, stats(v)])), faceFrames: faces, handsSeen: hands, sample: features.slice(0, 3) });
}

async function camera() {
  const which = (q.get('models') ?? 'face,gesture').split(',');
  const video = Object.assign(document.createElement('video'), { muted: true, playsInline: true, autoplay: true });
  video.style.cssText = 'width:480px;transform:scaleX(-1)';
  document.body.append(video);
  video.srcObject = await navigator.mediaDevices.getUserMedia({ video: { width: 640, height: 480 } });
  await video.play();
  ASPECT = video.videoHeight / video.videoWidth;
  const d = await detectors(which, 'VIDEO'), log = (window.__features = []), lat = [];
  const tick = (now) => {
    const a = performance.now();
    const f = featureFrame(now, d.face?.detectForVideo(video, now), d.gesture?.recognizeForVideo(video, now));
    lat.push(performance.now() - a);
    log.push(f);
    out.textContent = JSON.stringify({ frames: log.length, ms: stats(lat.slice(-120)), last: f }, null, 1);
    video.requestVideoFrameCallback(tick);
  };
  video.requestVideoFrameCallback(tick);
  window.__stop = () => { video.srcObject.getTracks().forEach((t) => t.stop()); return { frames: log.length, ms: stats(lat) }; };
  window.READY = true;
}

(q.has('probe') ? probe() : q.has('bench') ? bench() : q.has('camera') ? camera() : probe()).catch((e) => { errors.push(String(e?.stack ?? e)); done({ error: String(e?.message ?? e) }); });
