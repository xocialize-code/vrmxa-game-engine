// M5 W10 (AB-T-0620): the frame-rate run's numbers (acceptance/m5/rush-frames.sh): the app's own frame-time readout,
// read every five seconds (readout.log: cumulative frames, how many over 25 ms, the canvas), and the web processes'
// memory once a second (footprint.json). Each five-second window is classed as steady or as one that held a scene
// change (the readout counts them), so a world being built isn't mistaken for the game not keeping up.
//   node acceptance/m5/rush-frames-summary.mjs <folder>     → <folder>/summary.json
import fs from 'node:fs';
import path from 'node:path';

const dir = process.argv[2];
const rows = fs.readFileSync(path.join(dir, 'readout.log'), 'utf8').trim().split('\n').map((l) => {
  const m = l.match(/^(\d+) (\d+) frames in (\d+) s: ([\d.]+) fps, p99 ([\d.]+) ms, max ([\d.]+) ms, (\d+) over 25 ms, at (\d+)×(\d+); (\d+) replays played, (\d+) scene changes/);
  return m && { unix: +m[1], frames: +m[2], seconds: +m[3], fps: +m[4], p99: +m[5], max: +m[6], over25: +m[7], width: +m[8], height: +m[9], replays: +m[10], scenes: +m[11] };
}).filter(Boolean);
const windows = [];
for (let i = 1; i < rows.length; i++) {
  const a = rows[i - 1], b = rows[i], dt = b.unix - a.unix;
  if (b.frames < a.frames) break; // the page started over
  if (b.frames === a.frames && b.seconds >= 590) break; // the replays are over: nothing steps any more
  windows.push({ at: b.seconds, seconds: dt, frames: b.frames - a.frames, fps: (b.frames - a.frames) / dt, over25: b.over25 - a.over25, sceneChange: b.scenes !== a.scenes || b.replays !== a.replays });
}
const steady = windows.filter((w) => !w.sceneChange), changes = windows.filter((w) => w.sceneChange);
const sum = (l, k) => l.reduce((x, w) => x + w[k], 0);
const fp = JSON.parse(fs.readFileSync(path.join(dir, 'footprint.json'), 'utf8'));
const web = fp.series.map((s) => s.WebContent ?? 0).filter((x) => x > 0), gb = (b) => +(b / 2 ** 30).toFixed(2);
const sorted = web.slice().sort((x, y) => x - y);
const last = rows.at(-1);
const out = {
  check: 'M5 exit check 10 (the sample game): ten minutes of play in the Mac game app at 1080p; the web process\'s memory once a second (AB-T-0620)',
  canvas: `${last.width}×${last.height}`, seconds: last.seconds, frames: last.frames, fps: last.fps, p99: last.p99, max: last.max, over25: last.over25, replays: last.replays, sceneChanges: last.scenes,
  steady: { windows: steady.length, seconds: sum(steady, 'seconds'), frames: sum(steady, 'frames'), fps: +(sum(steady, 'frames') / sum(steady, 'seconds')).toFixed(2), over25: sum(steady, 'over25'), fewestFramesInAWindow: Math.min(...steady.map((w) => w.frames)), note: 'the poller stamps whole seconds, so a window is 4 to 6 s long: a single window\'s rate is not exact, the steady total is', framesOver25PerMille: +((1000 * sum(steady, 'over25')) / sum(steady, 'frames')).toFixed(2) },
  sceneChangeWindows: { windows: changes.length, over25: sum(changes, 'over25'), fps: changes.map((w) => +w.fps.toFixed(1)) },
  memory: { samples: web.length, firstGB: gb(web[0]), medianGB: gb(sorted[Math.floor(sorted.length / 2)]), peakGB: gb(sorted.at(-1)), lastGB: gb(web.at(-1)), gpuPeakGB: fp.peakGB.GPU },
  windows,
};
fs.writeFileSync(path.join(dir, 'summary.json'), `${JSON.stringify(out, null, 1)}\n`);
const { windows: _w, ...brief } = out;
console.log(JSON.stringify(brief, null, 1));
