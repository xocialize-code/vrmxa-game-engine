// Which mesh2motion clips the starter set takes, and the slots they fill (VRMXA §8.2). Read by make-animations.mjs
// (which writes them) and by the starter's tests (which play every slot).
//
// `src` is the clip's file under mesh2motion's static/assets/human/animations/ (without .glb); `move` clips get their
// ground speed measured; `loops` overrides mesh2motion's own flag.

/** @type {{ name: string, src: string, move?: boolean, loops?: boolean }[]} */
export const CLIPS = [
  // movement
  { name: 'idle', src: 'idle-a' },
  { name: 'idle-foldArms', src: 'idle-foldarms' },
  { name: 'walk', src: 'walk', move: true },
  { name: 'run', src: 'jog', move: true },
  { name: 'jump', src: 'jump-start' },
  { name: 'fall', src: 'jump-air' },
  { name: 'land', src: 'jump-land' },
  { name: 'crouch', src: 'crouch-idle' },
  { name: 'crouchWalk', src: 'crouch-walk', move: true },
  // posture
  { name: 'sit', src: 'sitting-enter' },
  { name: 'sitIdle', src: 'sitting-idle' },
  { name: 'stand', src: 'sitting-exit' },
  { name: 'getUp', src: 'laytoidle' },
  // conversation
  { name: 'talk', src: 'idle-talking' },
  { name: 'listen', src: 'idle-listening' },
  { name: 'think', src: 'confused' },
  // gestures and emotion
  { name: 'greet', src: 'greeting' },
  { name: 'nod', src: 'head-nod' },
  { name: 'clap', src: 'clapping' },
  { name: 'cheer', src: 'victory-fist-pump' },
  { name: 'happy', src: 'victory' },
  { name: 'angry', src: 'angry' },
  { name: 'sip', src: 'consume' },
  { name: 'dance', src: 'dance-simple' },
  // item use
  { name: 'use', src: 'interact' },
  { name: 'equip', src: 'pickup-table' },
  { name: 'pickUp', src: 'pick-up' },
  { name: 'carry', src: 'walk-carry' },
  { name: 'push', src: 'push' },
  { name: 'chestOpen', src: 'chest-open' },
  // a sword in hand
  { name: 'idle-sword', src: 'idle-sword' },
  { name: 'swordAttack', src: 'sword-attack' },
  { name: 'swordBlock', src: 'sword-block' },
  // knocks
  { name: 'hit', src: 'hit-chest' },
  { name: 'death', src: 'death-a' },
  { name: 'punch', src: 'punch-jab' },
  { name: 'kick', src: 'kick-front' },
];

const one = (clip, extra = {}) => [{ clip, ...extra }];
/**
 * The sets. Masks (G10, @vrmxg/character's masks.js) make a clip a gesture that plays over walking; the engine plays
 * a masked slot as a one-shot (`startAction`), the actions (use, take → equip, talk, sit, sitIdle, stand, getUp) in
 * place of locomotion, and anything else through a layer (`playLayer({ slot })`, carry on the upper body).
 */
export const SETS = [
  {
    id: 'default', name: 'Default', default: true, priority: 0, requires: [],
    slots: {
      idle: [{ clip: 'idle', weight: 3 }, { clip: 'idle-foldArms', weight: 1 }],
      walk: one('walk'), run: one('run'), jump: one('jump', { blendIn: 0.1 }), fall: one('fall'), land: one('land', { blendIn: 0.1 }),
      sit: one('sit'), sitIdle: one('sitIdle'), stand: one('stand'), getUp: one('getUp'),
      talk: one('talk'), listen: one('listen', { mask: 'upperBody' }), think: one('think', { mask: 'upperBody' }),
      greet: one('greet', { mask: 'upperBody' }), wave: one('greet', { mask: 'upperBody' }), nod: one('nod', { mask: 'face' }),
      clap: one('clap', { mask: 'arms' }), cheer: one('cheer', { mask: 'arms' }), sip: one('sip', { mask: 'arms' }),
      'emote.happy': one('happy', { mask: 'upperBody' }), 'emote.angry': one('angry', { mask: 'upperBody' }),
      use: one('use'), equip: one('equip'), carry: one('carry', { blendIn: 0.3 }),
      'x-vrmxg.crouch': one('crouch'), 'x-vrmxg.crouchWalk': one('crouchWalk'),
      'x-vrmxg.pickUp': one('pickUp'), 'x-vrmxg.push': one('push'), 'x-vrmxg.dance': one('dance'),
      'x-vrmxg.hit': one('hit', { mask: 'upperBody' }), 'x-vrmxg.death': one('death'), 'x-vrmxg.punch': one('punch', { mask: 'upperBody' }), 'x-vrmxg.kick': one('kick'),
    },
  },
  // VRMXA §8.3: a sword in hand (any wearable tagged held:sword) changes idle, holds the sword on the upper body while
  // moving, and makes use a swing
  { id: 'sword', name: 'Sword in hand', priority: 1, requires: ['held:sword'], slots: { idle: one('idle-sword'), hold: one('idle-sword', { mask: 'upperBody' }), use: one('swordAttack'), 'x-vrmxg.block': one('swordBlock', { mask: 'upperBody' }) } },
  // VRMXI §8.1: while a character opens a chest (an item tagged container:chest) its tags count, so the open verb's
  // use slot plays the chest's own clip
  { id: 'chest', name: 'Opening a chest', priority: 1, requires: ['container:chest'], slots: { use: one('chestOpen') } },
];
