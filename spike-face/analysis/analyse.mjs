// The spike's analysis (M4 W9): what each detector gives a face take, from results/vision.json and
// results/mediapipe.json over the synthetic faces (results/faces.json).
//   node spike-face/analysis/analyse.mjs            → results/summary.json, and the README's tables on stdout
// Both detectors' output is first made the take's own face sample (@vrmxg/takes: faceFromFeatures for the shell's
// Vision path, faceFromBlendshapes for MediaPipe), so they are compared as a take would use them.
//   response   the change in a pose's own value from that person's neutral picture (blink, jaw, smile, brows 0…1; the
//              head in radians, in the person's own sense)
//   crosstalk  the largest change in any *other* expression value in that picture: what would move on her face that
//              the person didn't do
//   noise      how much a value moves between copies of one picture nudged by a pixel or two (standard deviation)
//   the take   each person's pictures played as a session (a second of neutral, then each pose held half a second)
//              through the take's FaceFilter: the weight her expression reaches for the pose, and the largest other one
import fs from 'node:fs';
import path from 'node:path';
import { installPortableMath } from '@vrmxg/dmath';
import { faceFromFeatures, faceFromBlendshapes, FaceFilter } from '@vrmxg/takes';

installPortableMath();
const here = import.meta.dirname, res = (f) => path.join(here, '../results', f);
const faces = JSON.parse(fs.readFileSync(res('faces.json'), 'utf8'));
const vision = JSON.parse(fs.readFileSync(res('vision.json'), 'utf8')), mediapipe = JSON.parse(fs.readFileSync(res('mediapipe.json'), 'utf8'));
/** Pictures whose edit didn't do what was asked (looked at by eye: results/faces-review.json), left out of the scores. */
const review = fs.existsSync(res('faces-review.json')) ? JSON.parse(fs.readFileSync(res('faces-review.json'), 'utf8')) : { bad: {} };

// each detector's picture → the take's face sample (the person's own eyes and head; null when no face was found)
const SAMPLE = {
  // the shell's own conversion (CameraMethods.swift): Vision's yaw is the person's, its pitch and roll the other way
  vision: (p) => (p.found && p.shape ? faceFromFeatures({ face: { shape: { ...p.shape, yaw: p.vision.yaw, pitch: -p.vision.pitch, roll: -p.vision.roll } } }) : null),
  // the matrix's angles turn the same way as Vision's
  mediapipe: (p) => (p.found ? faceFromBlendshapes(p.blendshapes, { yaw: p.matrix?.yaw ?? 0, pitch: -(p.matrix?.pitch ?? 0), roll: -(p.matrix?.roll ?? 0) }) : null),
};
const DATA = { vision, mediapipe };
const EXPR = ['blink', 'jaw', 'smile', 'browUp', 'browDown'];
/** A sample's values as the analysis names them (blink: both eyes; wink: one eye past the other). */
const values = (s) => ({ blink: Math.min(s.blinkL, s.blinkR), wink: Math.abs(s.blinkL - s.blinkR), jaw: s.jaw, smile: s.smile, browUp: s.browUp, browDown: s.browDown, yaw: s.yaw, pitch: s.pitch, roll: s.roll });
/** The value each pose is about, and the sign it should move in. */
const TARGET = { blink: ['blink', 1], wink: ['wink', 1], jaw: ['jaw', 1], smile: ['smile', 1], browUp: ['browUp', 1], browDown: ['browDown', 1], left15: ['yaw', -1], right15: ['yaw', 1], left: ['yaw', -1], right: ['yaw', 1], up: ['pitch', 1], down: ['pitch', -1], tilt: ['roll', 1] };
const mean = (a) => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : null);
const sd = (a) => { if (a.length < 2) return null; const m = mean(a); return Math.sqrt(mean(a.map((x) => (x - m) * (x - m)))); };
const r3 = (v) => (v === null || v === undefined ? null : Math.round(v * 1000) / 1000);

const summary = { made: new Date().toISOString().slice(0, 10), faces: { identities: faces.identities.length, pictures: faces.files.length, left_out: review.bad }, detectors: {} };
for (const [name, data] of Object.entries(DATA)) {
  const byFile = new Map(data.pictures.map((p) => [p.file, p]));
  const sampleOf = (file) => { const p = byFile.get(file); return p ? SAMPLE[name](p) : null; };
  const found = faces.files.filter((f) => byFile.get(f.file)?.found).length;
  const rows = [], noise = Object.fromEntries([...EXPR, 'yaw', 'pitch', 'roll'].map((k) => [k, []]));
  for (const f of faces.files) {
    const p = byFile.get(f.file);
    if (!p?.found) continue;
    // noise: this picture's nudged copies
    const copies = (p.jitter ?? []).map((j) => SAMPLE[name](j)).filter(Boolean).map(values);
    for (const k of Object.keys(noise)) { const s = sd(copies.map((c) => c[k])); if (s !== null) noise[k].push(s); }
    if (f.pose === 'neutral') continue;
    const here_ = sampleOf(f.file), rest = sampleOf(`${f.identity}-neutral.png`);
    if (!here_ || !rest) continue;
    const a = values(here_), b = values(rest), [key, sign] = TARGET[f.pose];
    const others = EXPR.filter((k) => k !== key && !(key === 'wink' && k === 'blink')).map((k) => [k, a[k] - b[k]]).sort((x, y) => Math.abs(y[1]) - Math.abs(x[1]));
    rows.push({ file: f.file, identity: f.identity, pose: f.pose, bad: review.bad[f.file] ?? null, target: key, response: r3((a[key] - b[key]) * sign), value: r3(a[key]), rest: r3(b[key]), crosstalk: { of: others[0][0], by: r3(others[0][1]) } });
  }
  const good = rows.filter((r) => !r.bad);
  const poses = Object.fromEntries(Object.keys(TARGET).map((pose) => {
    const rs = good.filter((r) => r.pose === pose);
    return [pose, { n: rs.length, response: r3(mean(rs.map((r) => r.response))), least: r3(rs.length ? Math.min(...rs.map((r) => r.response)) : null), crosstalk: r3(mean(rs.map((r) => Math.abs(r.crosstalk.by)))), worst: rs.length ? rs.reduce((w, r) => (Math.abs(r.crosstalk.by) > Math.abs(w.crosstalk.by) ? r : w)).crosstalk : null }];
  }));
  const floor = Object.fromEntries(Object.entries(noise).map(([k, v]) => [k, r3(mean(v))]));

  // the take: each person's pictures as a session through the take's filter
  const take = {};
  for (const who of faces.identities) {
    const copiesOf = (pose) => { const p = byFile.get(`${who.id}-${pose}.png`); return p?.found ? [SAMPLE[name](p), ...(p.jitter ?? []).map((j) => SAMPLE[name](j))].filter(Boolean) : []; };
    const rest = copiesOf('neutral');
    if (!rest.length) continue;
    const f = new FaceFilter({}), session = [];
    let step = 0;
    // 30 samples a second; `settled` marks a hold's second half (a rest is judged there, past the last pose's fall)
    const hold = (pose, n, list) => { for (let i = 0; i < n; i++) { session.push({ pose, settled: i >= n / 2, step, ...list[i % list.length] }); step += 2; } };
    hold('neutral', 30, rest);
    for (const pose of Object.keys(TARGET)) { const list = copiesOf(pose); if (!list.length || review.bad[`${who.id}-${pose}.png`]) continue; hold(pose, 15, list); hold('neutral', 15, rest); }
    const peak = {};
    for (const s of session) {
      f.push(s);
      if (!f.ready) continue;
      const v = f.values(), e = v.expressions;
      const flat = { blink: e.blink, wink: Math.max(e.blinkLeft, e.blinkRight), aa: e.aa, happy: e.happy, surprised: e.surprised, angry: e.angry, yaw: v.head[0], pitch: v.head[1], roll: v.head[2] };
      if (s.pose === 'neutral' && !s.settled) continue;
      const pk = (peak[s.pose] ??= {});
      for (const [k, x] of Object.entries(flat)) if (pk[k] === undefined || Math.abs(x) > Math.abs(pk[k])) pk[k] = x;
    }
    take[who.id] = peak;
  }
  const HER = { blink: 'blink', wink: 'wink', jaw: 'aa', smile: 'happy', browUp: 'surprised', browDown: 'angry', left15: 'yaw', right15: 'yaw', left: 'yaw', right: 'yaw', up: 'pitch', down: 'pitch', tilt: 'roll' };
  const onHer = Object.fromEntries(Object.keys(TARGET).map((pose) => {
    const own = HER[pose], ids = Object.keys(take).filter((id) => take[id][pose]);
    const got = ids.map((id) => take[id][pose][own]);
    const stray = ids.map((id) => Object.entries(take[id][pose]).filter(([k]) => !['yaw', 'pitch', 'roll', own].includes(k) && !(own === 'wink' && k === 'blink') && !(own === 'blink' && k === 'wink')).sort((x, y) => y[1] - x[1])[0]);
    return [pose, { n: ids.length, her: own, reaches: r3(mean(got)), least: r3(got.length ? got.reduce((w, x) => (Math.abs(x) < Math.abs(w) ? x : w)) : null), stray: stray.length ? { of: stray.sort((x, y) => y[1] - x[1])[0][0], by: r3(stray[0][1]), mean: r3(mean(stray.map((s) => s[1]))) } : null }];
  }));
  const restStray = Object.keys(take).map((id) => Object.entries(take[id].neutral ?? {}).filter(([k]) => !['yaw', 'pitch', 'roll'].includes(k)).sort((x, y) => y[1] - x[1])[0]).filter(Boolean);

  summary.detectors[name] = {
    detector: data.detector, os: data.os, size: data.size, found: `${found} of ${faces.files.length}`, ms: data.ms, cpuMsPerFrame: data.cpuMsPerFrame,
    noise: floor, poses, take: { onHer, atRest: restStray.length ? { of: restStray.sort((x, y) => y[1] - x[1])[0][0], by: r3(restStray[0][1]) } : null }, pictures: rows,
  };
}
fs.writeFileSync(res('summary.json'), JSON.stringify(summary, null, 1) + '\n');

// the README's tables
const D = summary.detectors, cell = (v) => (v === null || v === undefined ? '—' : String(v));
console.log('| Pose | Value | Vision: change | least | crosstalk | MediaPipe: change | least | crosstalk |\n|---|---|---|---|---|---|---|---|');
for (const pose of Object.keys(TARGET)) {
  const v = D.vision.poses[pose], m = D.mediapipe.poses[pose], x = (p) => (p.worst ? `${cell(p.crosstalk)} (worst ${p.worst.of} ${cell(p.worst.by)})` : '—');
  console.log(`| ${pose} (${v.n}) | ${TARGET[pose][0]} | ${cell(v.response)} | ${cell(v.least)} | ${x(v)} | ${cell(m.response)} | ${cell(m.least)} | ${x(m)} |`);
}
console.log('\n| Noise (sd) | blink | jaw | smile | browUp | browDown | yaw | pitch | roll |\n|---|---|---|---|---|---|---|---|---|');
for (const n of ['vision', 'mediapipe']) console.log(`| ${n} | ${['blink', 'jaw', 'smile', 'browUp', 'browDown', 'yaw', 'pitch', 'roll'].map((k) => cell(D[n].noise[k])).join(' | ')} |`);
console.log('\n| Pose | On her | Vision: reaches | least | stray | MediaPipe: reaches | least | stray |\n|---|---|---|---|---|---|---|---|');
for (const pose of Object.keys(TARGET)) {
  const v = D.vision.take.onHer[pose], m = D.mediapipe.take.onHer[pose], x = (p) => (p.stray ? `${p.stray.of} ${cell(p.stray.by)}` : '—');
  console.log(`| ${pose} (${v.n}) | ${v.her} | ${cell(v.reaches)} | ${cell(v.least)} | ${x(v)} | ${cell(m.reaches)} | ${cell(m.least)} | ${x(m)} |`);
}
console.log(`\nat rest, the largest stray weight: Vision ${cell(D.vision.take.atRest?.of)} ${cell(D.vision.take.atRest?.by)}, MediaPipe ${cell(D.mediapipe.take.atRest?.of)} ${cell(D.mediapipe.take.atRest?.by)}`);
console.log(`\nfound: Vision ${D.vision.found}, MediaPipe ${D.mediapipe.found}`);
console.log(`ms per frame (median / p90): Vision rectangle ${D.vision.ms.rect.median} / ${D.vision.ms.rect.p90}, with landmarks ${D.vision.ms.rectAndLandmarks.median} / ${D.vision.ms.rectAndLandmarks.p90}; MediaPipe frame by frame ${D.mediapipe.ms.image.median} / ${D.mediapipe.ms.image.p90}, as video ${D.mediapipe.ms.video.median} / ${D.mediapipe.ms.video.p90}`);
console.log(`CPU ms per frame: Vision rectangle ${D.vision.cpuMsPerFrame.rect}, with landmarks ${D.vision.cpuMsPerFrame.rectAndLandmarks}; MediaPipe frame by frame ${D.mediapipe.cpuMsPerFrame.image}, as video ${D.mediapipe.cpuMsPerFrame.video}`);
