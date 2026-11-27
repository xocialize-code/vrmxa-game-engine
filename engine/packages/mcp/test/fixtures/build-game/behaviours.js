// Project behaviours for the M6 W8 tests (test/build.test.mjs): one that declares itself and keys the game state by a
// param, as the Morning Rush's tableZone does, and one with no describe.
import { Behaviour } from '@vrmxg/core';

// `scoreZone`, on an Area: each body that enters adds `by` to the game counter `counter` and emits `scored`.
export class scoreZone extends Behaviour {
  static describe = {
    description: 'On an Area: each body that enters adds to a game counter.',
    on: ['Area'],
    params: {
      counter: { type: 'string', minLength: 1, default: 'points', description: 'The counter it adds to.' },
      by: { type: 'integer', minimum: 1, default: 1, description: 'How much each body adds.' },
      target: { type: 'string', nodeRef: true, description: 'A node it watches (optional).' },
    },
    signals: { scored: { description: 'A body entered and the counter was added to.', args: { by: { type: 'integer', description: 'What was added.' } } } },
    state: { type: 'object', additionalProperties: false, required: ['count'], properties: { count: { type: 'integer', minimum: 0 } } },
  };
  ready() {
    this.count = 0;
    this.tree.listen(this.node, 'bodyEntered', () => {
      this.count++;
      const by = this.params.by ?? 1;
      this.tree.services.get('game')?.add(this.params.counter ?? 'points', by);
      this.node.emit('scored', { by });
    });
  }
  getState() { return { count: this.count }; }
  setState(s) { this.count = s.count; }
}

// `blink`: runs, but declares nothing (no static describe).
export class blink extends Behaviour {
  getState() { return null; }
}
