// What a script's tags and parentheticals may ask of a performance. Gestures are VRMXA animation slots (§8.2) the
// sample's characters fill; expressions are VRM's presets. Casting (W6) narrows both to what a persona allows.

export const GESTURES = ['greet', 'nod', 'shrug', 'point', 'laugh', 'cheer', 'sip', 'use', 'sit', 'stand'];
export const EXPRESSIONS = ['happy', 'angry', 'sad', 'relaxed', 'surprised', 'neutral'];

/** Tags with an argument: look (a character, a mark or "camera"), at (a mark), hold (seconds). */
export const KEYED_TAGS = ['look', 'at', 'hold'];

/** Words in a parenthetical → what they do. Matched as whole words, lower case. */
export const PAREN_WORDS = {
  expression: {
    smiling: 'happy', smiles: 'happy', smile: 'happy', grinning: 'happy', grins: 'happy', happily: 'happy', cheerful: 'happy',
    cheerfully: 'happy', brightly: 'happy', beaming: 'happy', laughs: 'happy', laughing: 'happy',
    sad: 'sad', sadly: 'sad', sighs: 'sad', sighing: 'sad', tearful: 'sad',
    angry: 'angry', angrily: 'angry', annoyed: 'angry', frowning: 'angry', frowns: 'angry',
    surprised: 'surprised', startled: 'surprised', gasps: 'surprised', shocked: 'surprised',
    relaxed: 'relaxed', calm: 'relaxed', calmly: 'relaxed', warmly: 'relaxed', softly: 'relaxed', gently: 'relaxed',
  },
  gesture: {
    nods: 'nod', nodding: 'nod', nod: 'nod', shrugs: 'shrug', shrugging: 'shrug', shrug: 'shrug', waves: 'greet',
    waving: 'greet', wave: 'greet', points: 'point', pointing: 'point', laughs: 'laugh', laughing: 'laugh', laugh: 'laugh',
    cheers: 'cheer', sips: 'sip', sipping: 'sip',
  },
  /** Seconds of silence. */
  pause: { beat: 0.5, pause: 1 },
};

/** Timing defaults, in seconds unless named frames. */
export const TIMING = {
  /** An establishing shot for a scene heading (0: a heading isn't a shot). */
  establish: 2,
  /** Reading time per word of action, and its bounds. */
  actionPerWord: 0.3, actionMin: 1.5, actionMax: 8,
  /** Speech: a lead and a time per word (M3's estimate before a line is baked), and its bounds. */
  speechLead: 0.4, speechPerWord: 0.32, speechMin: 1, speechMax: 12,
  /** Silence after each line, and after the last beat. */
  gap: 0.25, tail: 1,
  /** A gesture's length; an expression's rise and fall (frames). */
  gesture: 1.5, rise: 8, fall: 16,
  /** An expression's weight. */
  weight: 0.7,
  /** A dissolve's blend (frames). */
  dissolve: 12,
};
