// The README's tables from a run's rows: node web/scripts/table.mjs results/pages/chromium.json results/pages/wkwebview.json
import fs from 'node:fs';
const rows = process.argv.slice(2).flatMap((f) => JSON.parse(fs.readFileSync(f, 'utf8')));
const where = (r) => r.origin === 'chromium-loopback' ? 'Chromium' : `WKWebView ${r.origin}`;
const d = (x) => x ? `${x.pixels} px / ${x.maxChannel}` : '—';
console.log('\nstereo: runtime | case | L vs mono | R vs mono | R vs R alone at x=W | no shadows L / R vs mono | outlines L / R | shadows L / R | post per eye L / R(same frame)');
for (const r of rows.filter((r) => r.result?.page === 'stereo')) {
  const x = r.result;
  console.log([where(r), r.case, d(x.stereo.leftVsMono), d(x.stereo.rightVsMono), d(x.stereo.rightVsRightAloneAtSameOffset), `${d(x.stereoNoShadows.leftVsMono)}, ${d(x.stereoNoShadows.rightVsMono)}`, `${x.outlines.left.pixels} / ${x.outlines.right.pixels}`, `${x.shadows.left.pixels} / ${x.shadows.right.pixels}`, x.postPerEye ? `${d(x.postPerEye.leftVsMono)}, ${d(x.postPerEye.rightSameFrameVsMonoRight)}` : '—', `errors ${r.errors.length}`].join(' | '));
}
console.log('\npresent: runtime | hashes interp/plain/stereo | headless final | steps/frame | cv interp/plain/stereo | still interp/plain | mm/frame | renderMs p50/p95 interp, plain, stereo | display Hz');
for (const r of rows.filter((r) => r.result?.page === 'present')) {
  const x = r.result, s = x.smoothness, m = x.renderMs;
  console.log([where(r), `${x.hashes.interpolatedSame}/${x.hashes.plainSame}/${x.hashes.stereoSame}`, x.hashes.headlessFinal, JSON.stringify(x.frames.stepsPerFrame), `${s.interpolated.cv}/${s.plain.cv}/${s.stereo.cv}`, `${s.interpolated.stillFrames}/${s.plain.stillFrames}`, `${s.interpolated.meanMm} (plain ${s.plain.sample.slice(0, 3).join(', ')})`, `${m.interpolated.p50}/${m.interpolated.p95}, ${m.plain.p50}/${m.plain.p95}, ${m.stereo.p50}/${m.stereo.p95}`, x.display.displayHz, `errors ${r.errors.length}`].join(' | '));
}
console.log('\nxr: runtime | case | supported vr/ar | features | rates, target | views | sources | joints | pinches | choices | rec frames/bytes | replay same | hands moved world | frame p50 ms');
for (const r of rows.filter((r) => r.result?.page === 'xr')) {
  const x = r.result;
  if (x.failed) { console.log(where(r), r.case, 'FAILED', x.failed); continue; }
  console.log([where(r), r.case, `${x.supported['immersive-vr']}/${x.supported['immersive-ar']}`, x.session.enabledFeatures.join(','), `${x.session.supportedFrameRates} → ${x.session.targetFrameRate.got}`, x.frames.firstViews[0].map((v) => `${v.eye} x=${v.x} p=${v.projection}`).join('; '), x.hands.inputSources.join(', '), x.hands.jointsPerHand, x.hands.rightPinches, x.hands.choices.map((c) => `${c.target}@${c.step}`).join(' '), `${x.hands.recording.frames}/${x.hands.recording.bytes}`, `${x.replay.sameEveryStep} (${x.replay.steps})`, x.replay.handsChangedTheWorld, x.frames.intervalMs.p50, `errors ${r.errors.length}`].join(' | '));
}
