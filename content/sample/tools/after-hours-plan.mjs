// "After Hours" (M6 W10, AB-T-0651, AB-D-0297 item 8): the game as the editor builds it. One plan, two readers:
//   - tools/make-after-hours.mjs applies it to the editor's own EditorSession, headless, the ops the inspector's panels
//     call (add from the toolbar or the assets panel, the Id field, name, parent, position and rotation fields, props,
//     the Behaviours and Connections panels, Copy and Paste), and writes what the session saves: the committed scenes;
//   - acceptance/m6/after-hours-scenario.mjs turns the same plan into the AppProbe scenario that builds them by hand in
//     the Mac editor (apps/editor-mac/docs/hand-test/HAND-TEST-M6-AFTER-HOURS.scenario.md).
// So the committed scenes are what the editor makes, ids included, and the scenario can be held to their bytes.
//
// The game: in the sample cafe after closing, Mira finds what the day's customers left behind (a scarf and a phone on the
// tables, a book in the back room behind the locked staff door, which the light switch beside it opens) and puts each on
// its shelf before Hana locks up. The inventory carries more than one thing; the shelf (behaviours.js, written by hand)
// checks what is put on it; Hana gives hints at the counter. Lost when the clock runs out or after two wrong shelves.
//
// Paths are the project's: the sample's layout, which the "One level" template copies the cafe, the characters, the
// animations and the sounds into, so a new project built from the template has the same refs.

/** The scenes' folder in the project, and each scene's file. */
export const DIR = 'after-hours';
export const SCENE = { title: `${DIR}/title.vrmxs`, level: `${DIR}/level.vrmxs`, won: `${DIR}/won.vrmxs`, lost: `${DIR}/lost.vrmxs` };

/** The lost things (VRMXI pickups made by tools/make-after-hours.mjs), the shelves they go on and where they are found. */
export const LOST = [
  { key: 'scarf', id: 'b2c41d6e-7a3f-4e58-9b10-af7e0a0d0c01', name: 'Scarf', shelf: 'coats', found: { p: [-3, 0.775, 1], r: [0, 30, 0] }, color: '#b8323a' },
  { key: 'phone', id: 'b2c41d6e-7a3f-4e58-9b10-af7e0a0d0c02', name: 'Phone', shelf: 'phones', found: { p: [3, 0.775, -2], r: [0, -20, 0] }, color: '#1e2328' },
  { key: 'book', id: 'b2c41d6e-7a3f-4e58-9b10-af7e0a0d0c03', name: 'Book', shelf: 'books', found: { p: [7.75, 1.165, -5.02] }, color: '#2f5d8a' },
];
/**
 * The lost-property shelves (the starter content's shelf, CC0): where each stands, the area in front of it that the
 * shelf behaviour watches, and where the thing shows once it is on it (board 2, beside the jar).
 */
export const SHELVES = [
  { key: 'coats', name: 'Coats and scarves', p: [-5.82, 0, 3.5], r: [0, 90, 0], zone: [-5.1, 1, 3.5], size: [0.9, 2, 1.2], shows: { p: [-5.82, 0.615, 3.3], r: [0, 90, 0] }, refused: 'Not on the coat shelf, Mira!' },
  { key: 'phones', name: 'Phones and keys', p: [4.2, 0, -5.82], zone: [4.2, 1, -5.1], size: [1.2, 2, 0.9], shows: { p: [4.4, 0.615, -5.82] }, refused: 'That doesn\'t go with the phones.' },
  { key: 'books', name: 'Books', p: [-5.82, 0, -3.2], r: [0, 90, 0], zone: [-5.1, 1, -3.2], size: [0.9, 2, 1.2], shows: { p: [-5.82, 0.615, -3.4], r: [0, 90, 0] }, refused: 'The bookshelf is for books!' },
];
/** The back room's own shelf, where the book is found. */
export const STORE_SHELF = { p: [8, 0, -5.02] };
/** The staff door, the switch that opens it, Hana's counter area, and where Mira starts. */
export const DOOR = { p: [6.1, 0, -3], r: [0, 90, 0] };
export const SWITCH = { p: [5.95, 0, -4.2], r: [0, -90, 0] };
export const COUNTER = { p: [-1.2, 1, -3.15], size: [1.2, 2, 0.7] };
export const MIRA = [1, 0, -2.6];
export const HANA = [0.6, 0, -4.95];
export const CLOCK_SECONDS = 180;

const F = (path) => `after-hours/${path}`;
/** The project files the scenes place (refs as the sample and the template have them). */
export const FILES = {
  cafe: 'sets/cafe.glb', backRoom: F('props/back-room.glb'), ambience: 'sounds/cafe-ambience.wav',
  mira: 'characters/mira.vrmxa', hana: 'characters/hana.vrmxa', door: 'items/cafe-door.vrmxi', switch: 'items/switch.vrmxi',
  shelf: F('items/shelf.vrmxi'), scarf: F('items/scarf.vrmxi'), phone: F('items/phone.vrmxi'), book: F('items/book.vrmxi'),
};

// ---------------------------------------------------------------- the plan's vocabulary
// A scene: { ref, root (its root's name), steps }. A step is one of
//   { node: { from: <file ref> | type: <node type>, id, name?, parent?, p?, r?, props?, behaviours? } }   add, then set
//   { copy: [ids] }   the toolbar's Copy (in the scene built before)        { paste: { <pasted id>: <id it gets> } }
//   { connect: { from, signal, to, call, args? } }
// `r` is a rotation in degrees (the inspector's fields, Euler YXZ); `props` are set in their order; a behaviour entry is
// { use, ...params }. Every prop the scene keeps is set even when it equals its default (the inspector's pin).
const node = (o) => ({ node: o });
const connect = (from, signal, to, call, args) => ({ connect: { from, signal, to, call, ...(args ? { args } : {}) } });

const ENV = { type: 'Environment', id: 'env', props: { background: 'gradient', skyTopColor: '#141a2e', skyHorizonColor: '#3a4258', environmentIntensity: 0.2, ambientIntensity: 0.35, exposure: 0.9 } };
const MOON = { type: 'DirectionalLight', id: 'moon', name: 'Moonlight', r: [-50, 40, 0], props: { color: '#b9c6ff', intensity: 0.7, shadowExtent: 10, shadowPreset: 'high' } };
const LAMP = { type: 'SpotLight', id: 'counter-lamp', name: 'Counter lamp', p: [0, 2.9, -3.2], r: [-80, 0, 0], props: { color: '#ffd59a', intensity: 16, range: 7, angle: 40 } };
const AMBIENCE = { from: FILES.ambience, id: 'ambience', name: 'Room tone', props: { autoplay: true, bus: 'ambience', loop: true, volume: 0.4 } };
/** What every scene shares, built once in the level and copied into the others (the toolbar's Copy and Paste). */
export const SHARED = ['env', 'cafe', 'moon', 'counter-lamp', 'ambience'];

const cond = {
  ge: (key, value) => ({ key, op: 'ge', test: 'state', value }),
  lt: (key, value) => ({ key, op: 'lt', test: 'state', value }),
  eq: (key, value) => ({ key, op: 'eq', test: 'state', value }),
  state: (key) => ({ key, test: 'state' }),
};

// ---------------------------------------------------------------- the level
const level = {
  ref: SCENE.level, root: 'Level', steps: [
    node(ENV),
    node({ from: FILES.cafe, id: 'cafe' }),
    node({ from: FILES.backRoom, id: 'back-room', name: 'Back room' }),
    node(MOON), node(LAMP),
    node({ type: 'PointLight', id: 'back-room-bulb', name: 'Back room bulb', p: [7.8, 2.5, -3], props: { color: '#ffe2b0', intensity: 5, range: 6 } }),
    node(AMBIENCE),
    // the front doors locked for the night; the staff door locked until the switch opens it
    node({ from: FILES.door, id: 'front-left', name: 'Front door (left)', p: [-0.5, 0, 6.1], props: { state: 'locked' } }),
    node({ from: FILES.door, id: 'front-right', name: 'Front door (right)', p: [0.5, 0, 6.1], r: [0, 180, 0], props: { state: 'locked' } }),
    node({ from: FILES.door, id: 'staff-door', name: 'Staff door', p: DOOR.p, r: DOOR.r, props: { state: 'locked' } }),
    node({ from: FILES.switch, id: 'switch', name: 'Back room switch', p: SWITCH.p, r: SWITCH.r }),
    ...SHELVES.map((s) => node({ from: FILES.shelf, id: `shelf-${s.key}`, name: s.name, p: s.p, ...(s.r ? { r: s.r } : {}) })),
    node({ from: FILES.shelf, id: 'shelf-store', name: 'Store shelf', p: STORE_SHELF.p }),
    ...LOST.map((l) => node({ from: FILES[l.key], id: l.key, name: l.name, p: l.found.p, ...(l.found.r ? { r: l.found.r } : {}) })),
    // each thing again, on its shelf, out of sight until it is put there
    ...LOST.map((l) => { const s = SHELVES.find((x) => x.key === l.shelf); return node({ from: FILES[l.key], id: `${l.key}-shelved`, name: `${l.name} (on its shelf)`, p: s.shows.p, ...(s.shows.r ? { r: s.shows.r } : {}), props: { state: 'away' } }); }),
    node({ from: FILES.mira, id: 'mira', name: 'Mira', p: MIRA, behaviours: [{ use: 'player' }] }),
    node({ from: FILES.hana, id: 'hana', name: 'Hana', p: HANA, props: { controller: 'npc' } }),
    node({ type: 'Marker', id: 'look-at', p: [1.6, 0, -0.8] }),
    node({ type: 'Camera', id: 'cam', p: [1.6, 10.5, 8.2], props: { focalLength: 20, preset: 'fixed', target: 'look-at' } }),
    // the shelves' areas, each with the game's own behaviour, and the counter where Hana gives hints
    ...SHELVES.map((s) => node({ type: 'Area', id: `zone-${s.key}`, name: `${s.name} (in front)`, p: s.zone, props: { shape: 'box', size: s.size }, behaviours: [{ use: 'shelf', item: LOST.find((l) => l.shelf === s.key).id }] })),
    node({ type: 'Area', id: 'counter', name: 'At the counter', p: COUNTER.p, props: { shape: 'box', size: COUNTER.size } }),
    node({ type: 'GameRules', id: 'rules', props: { lose: { test: 'any', of: [cond.state('timers.clock.done'), cond.ge('counters.mistakes', 2)] } } }),
    node({ type: 'GameCounter', id: 'shelved', parent: 'rules', props: { label: 'On their shelves', max: 3 } }),
    node({ type: 'GameCounter', id: 'mistakes', parent: 'rules', props: { label: 'Wrong shelves' } }),
    node({ type: 'GameTimer', id: 'clock', parent: 'rules', props: { label: 'Until Hana locks up', seconds: CLOCK_SECONDS } }),
    // all three on their shelves, and not by way of a second wrong shelf (that step loses the game)
    node({ type: 'GameGoal', id: 'tidy', parent: 'rules', props: { text: 'Put the scarf, the phone and the book on their shelves', when: { test: 'all', of: [cond.ge('counters.shelved', 3), cond.lt('counters.mistakes', 2)] } } }),
    node({ type: 'Checkpoint', id: 'cp-first', parent: 'rules', props: { slot: 'first-shelved', label: 'First thing on its shelf', once: true, when: cond.ge('counters.shelved', 1) } }),
    node({ type: 'Dialogue', id: 'briefing', name: 'Hana\'s briefing', props: { autostart: true, lines: [
      { speaker: 'hana', text: 'That\'s the last customer gone, and they\'ve left things behind again: a scarf, a phone and a book. Put each one on its shelf before I lock up.', choices: [{ id: 'ready', text: 'Leave it to me.', to: 'ready' }, { id: 'how', text: 'How do I shelve them?', to: 'how' }] },
      { id: 'ready', speaker: 'hana', text: 'Thanks, Mira. Come to the counter if you want a hint.', next: 'end' },
      { id: 'how', speaker: 'hana', text: 'Stand at the right shelf and press E. The right shelf, mind!' },
    ] } }),
    node({ type: 'Dialogue', id: 'hints', name: 'Hana\'s hints', props: { lines: [
      { speaker: 'hana', text: 'Need a hand?', choices: [{ id: 'scarf', text: 'Where does the scarf go?', to: 'scarf' }, { id: 'phone', text: 'And the phone?', to: 'phone' }, { id: 'book', text: 'Where is the book?', to: 'book' }, { id: 'fine', text: 'I\'m fine, thanks.', to: 'end' }] },
      { id: 'scarf', speaker: 'hana', text: 'Scarves and coats go on the shelf by the front door.', next: 'end' },
      { id: 'phone', speaker: 'hana', text: 'Phones by the staff door, where people come and ask for them.', next: 'end' },
      { id: 'book', speaker: 'hana', text: 'Someone left it in the back room. The switch by the staff door opens it.' },
    ] } }),
    connect('rules', 'ready', 'hana', 'lookAt', { target: 'mira' }),
    connect('counter', 'bodyEntered', 'hints', 'start'),
    connect('switch', 'verb', 'staff-door', 'enterState', { state: 'open' }),
    ...SHELVES.flatMap((s) => {
      const l = LOST.find((x) => x.shelf === s.key);
      return [
        connect(`zone-${s.key}`, 'placed', 'shelved', 'add'),
        connect(`zone-${s.key}`, 'placed', `${l.key}-shelved`, 'enterState', { state: 'shelved' }),
        connect(`zone-${s.key}`, 'refused', 'mistakes', 'add'),
        connect(`zone-${s.key}`, 'refused', 'hana', 'say', { text: s.refused }),
      ];
    }),
    connect('rules', 'won', 'rules', 'changeScene', { after: 3, to: SCENE.won }),
    connect('rules', 'lost', 'rules', 'changeScene', { after: 3, to: SCENE.lost }),
  ],
};

// ---------------------------------------------------------------- the title: the cafe from the street, then the level
const pasted = (ids) => ({ paste: Object.fromEntries(ids.map((id) => [`${id}-2`, id])) });
const title = {
  ref: SCENE.title, root: 'Title', steps: [
    { copy: SHARED }, pasted(SHARED),
    node({ type: 'Marker', id: 'look-at', p: [0, 0.1, 6] }),
    node({ type: 'Camera', id: 'cam', p: [3.5, 1.8, 14], props: { focalLength: 28, preset: 'fixed', target: 'look-at' } }),
    node({ type: 'GameRules', id: 'rules' }),
    node({ type: 'GameTimer', id: 'intro', parent: 'rules', props: { label: 'The night shift starts in', seconds: 6 } }),
    node({ type: 'GameGoal', id: 'title', parent: 'rules', props: { text: 'After Hours: the cafe after closing', optional: true } }),
    connect('intro', 'timeout', 'rules', 'changeScene', { to: SCENE.level }),
  ],
};

// ---------------------------------------------------------------- the endings: Hana at the counter, then the title again
const ending = (ref, root, lines) => ({
  ref, root, steps: [
    pasted(SHARED),
    node({ from: FILES.hana, id: 'hana', name: 'Hana', p: [0.2, 0, -3.3], props: { controller: 'npc' } }),
    node({ type: 'Marker', id: 'look-at', p: [0.2, -0.1, -3.3] }),
    node({ type: 'Camera', id: 'cam', p: [0.9, 1.6, -0.6], props: { focalLength: 35, preset: 'fixed', target: 'look-at' } }),
    node({ type: 'GameRules', id: 'rules', props: { reads: { counters: ['shelved', 'mistakes'] } } }),
    node({ type: 'GameTimer', id: 'outro', parent: 'rules', props: { label: 'Back to the title in', seconds: 12 } }),
    node({ type: 'Dialogue', id: 'closing', props: { autostart: true, lines } }),
    connect('outro', 'timeout', 'rules', 'changeScene', { reset: true, to: SCENE.title }),
  ],
});
const won = ending(SCENE.won, 'Won', [
  { id: 'clean', speaker: 'hana', text: 'Not one thing on the wrong shelf. Goodnight, Mira!', next: 'bye', when: cond.eq('counters.mistakes', 0) },
  { id: 'mixed', speaker: 'hana', text: 'All put away, even with a mix-up. Goodnight!' },
  { id: 'bye', speaker: 'hana', text: 'I\'ll lock up.' },
]);
const lost = ending(SCENE.lost, 'Lost', [
  { id: 'shelves', speaker: 'hana', text: 'That\'s two things on the wrong shelf. Let\'s sort it out tomorrow.', next: 'end', when: cond.ge('counters.mistakes', 2) },
  { id: 'time', speaker: 'hana', text: 'It\'s late, Mira. I\'m locking up; the rest can wait until tomorrow.' },
]);

/** The scenes in the order the editor builds them (the level first: the others copy from it). */
export const SCENES = [level, title, won, lost];
/** The project settings the game is given (File › Project Settings…), after New Project from "One level". */
export const GAME = { title: 'After Hours', id: 'after-hours', entry: SCENE.title, scenes: [SCENE.level, SCENE.won, SCENE.lost], drop: ['level.vrmxs', 'ending.vrmxs'], behaviours: `${DIR}/behaviours.js` };
