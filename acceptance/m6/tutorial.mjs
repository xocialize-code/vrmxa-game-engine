// M6 W9 (AB-T-0650): the game builder's tutorial (docs/guide/tutorial.md), "Coin Run", held to the app. Three uses:
//
//   import { tutorialSteps, tutorialFiles } from './tutorial.mjs'     the page's steps and the files it has you write
//   node acceptance/m6/tutorial.mjs files <projects folder> <trigger folder>
//       the scenario's text editor: an AppProbe scenario can't run a command, so this waits beside it. When the scenario
//       writes a screenshot named write-behaviour.png into the trigger folder, this saves the page's behaviours.js into
//       <projects folder>/Coin Run/ (a new file moved into place, as an editor saves) and adds the page's licence row to
//       the end of its LICENCES.md table. Exits after that, or after 30 minutes.
//   node acceptance/m6/tutorial.mjs twin
//       writes the scenario's WebGL twin (-webgl.scenario.md) from the WebGPU scenario: its title, env (WebGL forced, its
//       own folders), renderer line and trigger folder are the only lines that differ.
//   node acceptance/m6/tutorial.mjs play <build> [--still <png>]
//       step 12, outside the app: the build the scenario exported, whole, then played in Node and by the game app in
//       headless Chromium on WebGPU and on WebGL, through its title menu with W held: the three coins collected (the
//       counter at 3, each glint stopped by its connection, Hana's line), the goals in order, the game won and its ending.
//       Draws, so it takes the GPU lock. Writes acceptance/results/m6-tutorial-game.json; exit 1 when a check fails.
//       --still keeps a picture of the game app with the HUD (the guide's).
//
// The behaviour and the licence row come from the page itself (its step 5), so the tutorial's code is what the scenario
// runs and the page can't drift from it. acceptance/test/tutorial.test.mjs checks the page against the scenario.
import fs from 'node:fs';
import os from 'node:os';
import http from 'node:http';
import path from 'node:path';
import { createRequire } from 'node:module';

const here = import.meta.dirname, root = path.join(here, '../..');
export const PAGE = path.join(root, 'docs/guide/tutorial.md');
export const SCENARIO = path.join(root, 'apps/editor-mac/docs/hand-test/HAND-TEST-M6-TUTORIAL.scenario.md');
/** The project the tutorial makes: its title (the folder New Project names) and its game's id. */
export const PROJECT = { title: 'Coin Run', id: 'coin-run' };
export const TRIGGER = 'write-behaviour.png';

/** The page's numbered steps, `## 1. Make the project…`: [{ n, title, body }]. */
export function tutorialSteps(text = fs.readFileSync(PAGE, 'utf8')) {
  const out = [], re = /^## (\d+)\. (.+)$/gm;
  const heads = [...text.matchAll(re)];
  heads.forEach((m, i) => out.push({ n: Number(m[1]), title: m[2].trim(), body: text.slice(m.index + m[0].length, heads[i + 1]?.index ?? text.length) }));
  return out;
}

/** What step 5 has you write: behaviours.js (its js block) and the LICENCES.md row (its text block). */
export function tutorialFiles(text = fs.readFileSync(PAGE, 'utf8')) {
  const step = tutorialSteps(text).find((s) => /^Write the coin behaviour$/.test(s.title));
  if (!step) throw new Error('docs/guide/tutorial.md has no step "Write the coin behaviour"');
  const block = (lang) => {
    const m = step.body.match(new RegExp('^```' + lang + '\\n([\\s\\S]*?)^```$', 'm'));
    if (!m) throw new Error(`the tutorial's step ${step.n} has no ${lang} block`);
    return m[1];
  };
  const row = block('text').trim();
  if (!/^\| `behaviours\.js` \|/.test(row) || row.includes('\n')) throw new Error('the tutorial\'s licence row is one table row for behaviours.js');
  return { behaviours: block('js'), licenceRow: row };
}

/** LICENCES.md with `row` added at the end of its (last) table. */
export function withLicenceRow(text, row) {
  const lines = text.replace(/\n+$/, '').split('\n');
  let last = -1;
  lines.forEach((l, i) => { if (l.startsWith('|')) last = i; });
  if (last < 0) throw new Error('LICENCES.md has no table');
  if (lines.includes(row)) return `${lines.join('\n')}\n`;
  lines.splice(last + 1, 0, row);
  return `${lines.join('\n')}\n`;
}

/** The scenario's WebGL twin, from the WebGPU scenario's text. */
export function webglTwin(text) {
  const out = text
    .replace(/^(# .*AppProbe scenario)$/m, '$1, WebGL forced')
    .replace(/^env: \{(.*)\}$/m, (_, body) => `env: {"VRMXG_QUERY": "renderer=webgl", ${body.replace('"w9-projects/"', '"w9-projects-webgl/"').replace('"w9-builds/coin-run"', '"w9-builds-webgl/coin-run"').replace('"w9-settings.json"', '"w9-settings-webgl.json"').replace('"w9-cache"', '"w9-cache-webgl"')}}`)
    .replace('Renderer WebGPU', 'Renderer WebGL')
    .replaceAll('/tmp/vrmxg-w9-tutorial/', '/tmp/vrmxg-w9-tutorial-webgl/');
  if (out === text) throw new Error('the scenario has none of the lines its twin changes');
  return out;
}

// ---------------------------------------------------------------- the scenario's text editor

async function files(projects, triggers) {
  const { behaviours, licenceRow } = tutorialFiles();
  fs.mkdirSync(triggers, { recursive: true });
  fs.rmSync(path.join(triggers, TRIGGER), { force: true });
  console.log(`watching ${triggers} for ${TRIGGER}; then writing behaviours.js into ${path.join(projects, PROJECT.title)}`);
  const until = Date.now() + 30 * 60 * 1000;
  for (;;) {
    if (fs.existsSync(path.join(triggers, TRIGGER))) break;
    if (Date.now() > until) { console.error('no trigger in 30 minutes'); process.exit(1); }
    await new Promise((r) => setTimeout(r, 200));
  }
  const dir = path.join(projects, PROJECT.title);
  if (!fs.existsSync(path.join(dir, 'game.json'))) { console.error(`${dir} is not the tutorial's project (no game.json)`); process.exit(1); }
  const save = (name, text) => { const f = path.join(dir, name), tmp = `${f}.tutorial-tmp`; fs.writeFileSync(tmp, text); fs.renameSync(tmp, f); };
  save('behaviours.js', behaviours);
  save('LICENCES.md', withLicenceRow(fs.readFileSync(path.join(dir, 'LICENCES.md'), 'utf8'), licenceRow));
  console.log(`${new Date().toISOString()} saved behaviours.js and its licence row in ${dir}`);
}

// ---------------------------------------------------------------- step 12: the build, played

async function play(dir, still) {
  const { checkFolder, openFolder, behavioursImporter } = await import('@vrmxg/bundle/node');
  const { acquireGpuLock, sayWaiting } = await import('../gpu-lock.mjs');
  const { PATHS } = await import('../../engine/packages/character/test/fixtures.mjs');
  const checks = [], say = (name, ok, detail) => { checks.push({ name, ok, detail }); console.log(`${ok ? 'ok  ' : 'FAIL'} ${name}${detail ? `: ${detail}` : ''}`); };
  if (!fs.existsSync(PATHS.core)) { console.error('needs vrmxa-core beside the repository: the level has characters'); process.exit(1); }
  const whole = checkFolder(dir), build = await openFolder(dir), game = build.game;
  say(`the build is whole, every file as its manifest says (${game.id})`, whole.ok && game.id === PROJECT.id, `${whole.state}, ${build.manifest.files.length} files, digest ${build.manifest.digest.slice(0, 16)}`);
  say('the build carries behaviours.js, named by game.json', game.behaviours === 'behaviours.js' && build.manifest.files.some((f) => f.path === 'project/behaviours.js'), `behaviours ${game.behaviours}`);
  const results = { build: path.basename(dir), game: game.id, digest: build.manifest.digest, runs: [] };

  // Node first: the same game, no renderer
  const node = await playInNode({ game, bytes: build.bytes, behaviours: await build.behaviours(behavioursImporter(dir)), actions: await build.actions() });
  say('Node: three coins, each glint stopped by its connection, the goals in order, won, then the ending', node.ok, JSON.stringify(node.trace));
  results.runs.push({ where: 'node', ...node.trace });

  let pw;
  try { pw = createRequire(path.join(root, 'spike-determinism/web/package.json'))('playwright-core'); } catch { pw = createRequire(path.join(here, '../../../../../spike-determinism/web/package.json'))('playwright-core'); }
  const exe = path.join(os.homedir(), 'Library/Caches/ms-playwright/chromium-1248/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing');
  const types = { '.html': 'text/html', '.js': 'text/javascript', '.json': 'application/json', '.wasm': 'application/wasm', '.css': 'text/css' };
  const release = await acquireGpuLock({ who: 'acceptance/m6/tutorial.mjs', onWait: sayWaiting('acceptance/m6/tutorial.mjs') });
  const server = http.createServer((req, res) => {
    const url = decodeURIComponent(new URL(req.url, 'http://x').pathname);
    const f = path.join(dir, url === '/' ? '/index.html' : url);
    if (!f.startsWith(dir + path.sep) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { res.writeHead(404); res.end(); return; }
    res.writeHead(200, { 'content-type': types[path.extname(f)] ?? 'application/octet-stream' }); res.end(fs.readFileSync(f));
  });
  await new Promise((r) => server.listen(0, '127.0.0.1', () => r(null)));
  try {
    const browser = await pw.chromium.launch({ executablePath: exe, headless: true, args: ['--enable-unsafe-webgpu'] });
    for (const renderer of ['webgpu', 'webgl']) {
      const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
      const errors = [];
      page.on('pageerror', (e) => errors.push(e.message)); page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
      const until = (fn, arg, timeout = 120000) => page.waitForFunction(fn, arg, { timeout, polling: 50 });
      const view = () => page.evaluate(() => { const w = /** @type {any} */ (window).__game, v = w.host().session.view(), t = w.host().session.tree; return { step: v.step, coins: v.counters?.coins, goal: v.goal?.text ?? null, outcome: v.outcome, stopped: [1, 2, 3].map((i) => !!t?.find(`glint-${i}`)?.systems?.every((x) => x.emitEnded)), captions: [...document.querySelectorAll('[class*=caption]')].map((e) => e.textContent?.trim()).filter(Boolean) }; });
      try {
        await page.goto(`http://127.0.0.1:${/** @type {any} */ (server.address()).port}/index.html?renderer=${renderer}`);
        await until(() => { const s = /** @type {any} */ (window).__game?.state(); return s?.ready && s.stack.at(-1) === 'title' && !s.loading; }, null);
        const title = await page.evaluate(() => document.title);
        await page.keyboard.press('Enter'); // New Game, the title menu's first item
        await until(() => { const s = /** @type {any} */ (window).__game?.state(); return s?.stack.length === 0 && !s.loading && s.step > 0; }, null);
        const backend = (await page.evaluate(() => /** @type {any} */ (window).__game.state().backend));
        say(`${renderer}: the game app opens on its title menu, New Game starts the level`, /coin run/i.test(title) && backend === renderer, `"${title}", ${backend}`);
        await page.waitForSelector('#hud-goal', { timeout: 30000 });
        await until(() => /** @type {any} */ (window).__game.host().session.view()?.counters?.coins === 1, null, 30000); // the coin at the spawn
        const first = await view();
        const goal = (await page.textContent('#hud-goal'))?.trim();
        if (still && renderer === 'webgpu') { await page.waitForTimeout(600); await page.screenshot({ path: still }); }
        say(`${renderer}: the coin at the spawn is collected at once, its glint stopped, Hana's line; the HUD shows the first goal`, first.stopped[0] && first.captions.some((c) => c.includes('A coin! Keep going, Mira.')) && goal === 'Goal: Collect the three coins', `step ${first.step}, HUD "${goal}", captions ${JSON.stringify(first.captions)}`);
        await page.keyboard.down('KeyW');
        await until(() => /** @type {any} */ (window).__game.host().session.view()?.counters?.coins === 3, null, 60000);
        const three = await view();
        await until(() => /** @type {any} */ (window).__game.host().session.view()?.outcome === 'won', null, 60000);
        const won = await view();
        await page.keyboard.up('KeyW');
        await until((e) => /** @type {any} */ (window).__game.state().scene !== e, game.entry, 30000);
        const s = await page.evaluate(() => /** @type {any} */ (window).__game.state());
        say(`${renderer}: three coins collected, every glint stopped, "Get to the counter" next, won, then the ending`, three.stopped.every(Boolean) && three.goal === 'Get to the counter' && won.outcome === 'won' && s.scene === 'ending.vrmxs', `3 coins at step ${three.step}, won at ${won.step}, then ${s.scene}`);
        say(`${renderer}: no errors in the page`, errors.length === 0, errors.slice(0, 3).join(' | '));
        results.runs.push({ where: `chromium-${renderer}`, title, first: first.step, three: three.step, won: won.step, ending: s.scene });
      } catch (e) {
        say(`${renderer}: played in the game app`, false, `${e.message} ${errors.slice(0, 3).join(' | ')}`);
      } finally { await page.close(); }
    }
    await browser.close();
  } finally { server.close(); release(); }
  fs.mkdirSync(path.join(root, 'acceptance/results'), { recursive: true });
  fs.writeFileSync(path.join(root, 'acceptance/results/m6-tutorial-game.json'), `${JSON.stringify({ checks, results }, null, 1)}\n`);
  return checks.every((c) => c.ok);
}

/** The build played in Node, the stick held forward from step 30: when each coin is collected and its glint stopped, and the result. */
export async function playInNode(g) {
  const { installPortableMath } = await import('@vrmxg/dmath');
  const { loadRapier } = await import('@vrmxg/physics');
  const { VirtualDevice } = await import('@vrmxg/input');
  const { GameFlow } = await import('@vrmxg/game');
  const { vrmxaCore } = await import('../../engine/packages/character/test/fixtures.mjs');
  const { gameScenes, worldLoader, freeWorld } = await import('../../apps/game/src/world.js');
  installPortableMath();
  const scenes = gameScenes(g.bytes, g.game), docs = await scenes.documents();
  const load = worldLoader({ R: await loadRapier(), scenes, behaviours: g.behaviours, actions: g.actions, physics: g.game.physics ?? null, vrmxaCore: await vrmxaCore(), options: () => ({ stubTextures: true }) });
  const pad = new VirtualDevice();
  const flow = new GameFlow({ load, unload: freeWorld, seed: 1, scenes: docs.scenes, prefabs: docs.prefabs, onWorld: (tree) => tree.services.get('input').addDevice(pad) });
  await flow.start(g.game.entry);
  flow.tree.services.get('input').addDevice(pad);
  const trace = { coins: [], goals: [], won: null, ending: null };
  let last = 0, goal = null;
  for (let s = 0; s < 60 * 40; s++) {
    if (s >= 30) pad.setGamepad([0, -1, 0, 0], new Array(17).fill(0));
    while (!flow.step()) await flow.settle();
    const v = flow.view();
    if (v.scene === g.game.entry) {
      if ((v.counters?.coins ?? 0) !== last) { last = v.counters.coins; trace.coins.push({ step: v.step, coins: last, stopped: [1, 2, 3].map((i) => !!flow.tree.find(`glint-${i}`)?.systems?.every((x) => x.emitEnded)) }); }
      if ((v.goal?.text ?? null) !== goal) { goal = v.goal?.text ?? null; trace.goals.push(goal); }
    }
    if (!trace.won && v.outcome) trace.won = { result: v.outcome, step: v.step };
    if (trace.won && !trace.ending && v.scene !== g.game.entry) { trace.ending = v.scene; break; }
  }
  flow.dispose();
  const ok = trace.coins.length === 3 && trace.coins.every((c, i) => c.coins === i + 1 && c.stopped.slice(0, i + 1).every(Boolean) && !c.stopped.slice(i + 1).some(Boolean))
    && trace.coins[0].step < 30 && JSON.stringify(trace.goals) === JSON.stringify(['Collect the three coins', 'Get to the counter', null])
    && trace.won?.result === 'won' && trace.ending === 'ending.vrmxs';
  return { ok, trace };
}

if (process.argv[1] === import.meta.filename) {
  const [mode, ...rest] = process.argv.slice(2);
  if (mode === 'twin') fs.writeFileSync(SCENARIO.replace(/\.scenario\.md$/, '-webgl.scenario.md'), webglTwin(fs.readFileSync(SCENARIO, 'utf8')));
  else if (mode === 'files' && rest.length === 2) await files(path.resolve(rest[0]), path.resolve(rest[1]));
  else if (mode === 'play' && rest[0]) {
    const at = rest.indexOf('--still');
    process.exit((await play(path.resolve(rest[0]), at >= 0 ? path.resolve(rest[at + 1]) : null)) ? 0 : 1);
  } else { console.error('usage: tutorial.mjs twin | files <projects folder> <trigger folder> | play <build> [--still <png>]'); process.exit(2); }
}
