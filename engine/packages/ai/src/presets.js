// Role presets (M2 W7, research/npc-ai.md §7): data documents bundling a behaviour tree, its utility options, a
// blackboard plan and perception settings. A scene attaches one to a character ({ "use": "brain", "preset": "server" })
// and overrides the plan per instance ("vars"). A scene may also give a whole preset object in place of a name.
//
//   wanderer   wanders near home (a seeded reachable point, then a pause), sits on a free seat now and then
//   customer   comes in, takes a free seat, asks the server over (setGoal), orders when asked, waits to be served,
//              drinks, stands and leaves
//   server     greets newcomers it sees (even on its way somewhere: a greeting is short), takes an order when asked (walks over, asks, listens), makes it at the
//              counter and brings it, and keeps to the counter between customers

const A = (d, args = {}) => ({ type: 'action', do: d, args });

export const PRESETS = {
  wanderer: {
    plan: { radius: 3 },
    senses: { sight: { range: 0, fov: 120, every: 12 } },
    tree: {
      type: 'utility', rate: 30, hysteresis: 0.15, children: [
        { name: 'wander', considerations: [{ input: 'random', curve: { type: 'linear', m: 0.6, b: 0.4 } }], tree: {
          type: 'sequence', children: [
            { type: 'choose', pick: 'point', around: '$home', radius: 3, min: 0.8, key: 'dest' },
            A('goTo', { point: '$dest', timeout: 15 }),
            A('wait', { min: 1, max: 3 }),
          ] } },
        { name: 'idle', considerations: [{ input: 'random', curve: { type: 'linear', m: 0.5 } }], tree: A('wait', { min: 2, max: 4 }) },
        { name: 'sit', weight: 0.8, considerations: [{ input: 'advert', verb: 'sit', range: 6, curve: { type: 'step', at: 0.5 } }, { input: 'random', curve: { type: 'linear' } }], tree: {
          type: 'sequence', children: [
            { type: 'choose', pick: 'advert', verb: 'sit', range: 6, key: 'seat' },
            A('goTo', { target: '$seat', within: 0.9, timeout: 15 }),
            A('interact', { item: '$seat', verb: 'sit' }),
            A('wait', { min: 4, max: 8 }),
            A('interact', { verb: 'stand' }),
          ] } },
      ],
    },
  },

  customer: {
    plan: { entry: [-0.8, 0, 1.2], exit: [-0.5, 0, 9.5], server: 'hana-1', seat: null, order: 'A latte, please.' },
    senses: { sight: { range: 8, fov: 140, every: 6 } },
    tree: {
      type: 'sequence', children: [
        A('goTo', { point: '$entry', timeout: 30 }),
        { type: 'choose', pick: 'advert', verb: 'sit', range: 15, key: 'seat' },
        A('goTo', { target: '$seat', within: 0.9, timeout: 30 }),
        A('interact', { item: '$seat', verb: 'sit' }),
        A('setGoal', { agent: '$server', goal: 'takeOrder', params: { customer: '$self' } }),
        { type: 'until', test: 'remembers', kind: 'speech', topic: 'askOrder', within: 30, timeout: 60 },
        A('lookAt', { target: '$server' }),
        A('say', { text: '$order', topic: 'order', to: '$server' }),
        { type: 'until', test: 'goal', name: 'served', timeout: 90 },
        A('emote', { name: 'happy' }),
        A('wait', { seconds: 6 }),
        A('lookAt', {}),
        A('interact', { verb: 'stand' }),
        A('goTo', { point: '$exit', timeout: 40 }),
        { type: 'set', key: 'left', value: true },
        { type: 'repeat', child: A('wait', { seconds: 5 }) },
      ],
    },
  },

  server: {
    plan: { counter: [0.6, 0, -4.6], greeted: {}, customer: null },
    senses: { sight: { range: 12, fov: 150, every: 6 }, hearing: { sensitivity: 1.5 } },
    tree: {
      type: 'utility', rate: 10, hysteresis: 0.2, children: [
        { name: 'takeOrder', considerations: [{ input: 'goal', name: 'takeOrder', curve: { type: 'step', at: 0.5 } }], tree: {
          type: 'sequence', children: [
            { type: 'set', key: 'customer', value: '$goal.params.customer' },
            A('goTo', { target: '$customer', within: 1.3, timeout: 30 }),
            A('lookAt', { target: '$customer' }),
            A('say', { text: 'Hi! What can I get you?', topic: 'askOrder', to: '$customer' }),
            { type: 'until', test: 'remembers', kind: 'speech', topic: 'order', source: '$customer', within: 30, timeout: 30 },
            A('say', { text: 'Coming right up!', topic: 'ack', to: '$customer' }),
            A('lookAt', {}),
            A('goTo', { point: '$counter', timeout: 30 }),
            A('gesture', { slot: 'use' }),
            A('wait', { seconds: 3 }),
            A('goTo', { target: '$customer', within: 1.3, timeout: 30 }),
            A('lookAt', { target: '$customer' }),
            A('say', { text: 'Here you go. Enjoy!', topic: 'served', to: '$customer' }),
            A('setGoal', { agent: '$customer', goal: 'served' }),
            A('setGoal', { goal: '' }),
            A('lookAt', {}),
          ] } },
        { name: 'greet', weight: 1.25, considerations: [{ input: 'test', test: 'newcomer', curve: { type: 'step', at: 0.5 } }], tree: {
          type: 'sequence', children: [
            { type: 'choose', pick: 'remembered', kind: 'sight', within: 1, exclude: 'greeted', key: 'newcomer' },
            { type: 'set', key: 'greeted.$newcomer', value: true },
            A('lookAt', { target: '$newcomer' }),
            A('say', { text: 'Welcome in!', topic: 'greet', to: '$newcomer' }),
            A('wait', { seconds: 1 }),
            A('lookAt', {}),
          ] } },
        { name: 'tend', weight: 0.3, considerations: [{ input: 'constant', value: 1, curve: { type: 'linear' } }], tree: {
          type: 'sequence', children: [
            A('goTo', { point: '$counter', timeout: 30 }),
            A('wait', { min: 1, max: 2 }),
          ] } },
      ],
    },
  },
};
