// The provisional M0 node set (PRD §8). In W1 the runtime node classes register themselves with
// `define` and this file goes; until then it is the fixture the scene package tests against. Enough types to build a scene with a set, a character, a door prefab,
// a camera, lights, physics and a trigger. Each is one definition; schemas and tools follow.
import { createRegistry, P } from './index.js';

const arg = (p, description) => ({ ...p, schema: { ...p.schema, description } });

/** The tests a game condition may use (@vrmxg/game's TESTS: its test checks the two lists are the same). */
export const GAME_TESTS = ['state', 'all', 'any', 'not'];
/** The comparisons of the `state` test (@vrmxg/ai's `bb` test has the same). */
export const GAME_OPS = ['eq', 'ne', 'gt', 'ge', 'lt', 'le', 'set', 'unset'];
/**
 * JSON Schema of a game condition: { test: 'state', key, op?, value? } | { test: 'all' | 'any', of: [condition…] } |
 * { test: 'not', of: condition }. Written out `depth` levels deep (a scene schema here has no recursive $ref); below
 * that a condition is checked only for its shape, and @vrmxg/game's checkCondition checks it whole when the scene starts.
 */
export function conditionSchema(depth = 3) {
  const inner = depth > 0 ? conditionSchema(depth - 1) : { type: 'object', required: ['test'], properties: { test: { enum: GAME_TESTS } } };
  return {
    type: 'object', required: ['test'],
    properties: { test: { enum: GAME_TESTS } },
    allOf: [
      { if: { properties: { test: { const: 'state' } }, required: ['test'] }, then: {
        required: ['key'], additionalProperties: false,
        properties: { test: {}, key: { type: 'string', minLength: 1, description: 'A path into the game state, to something this scene declares: "score", "counters.orders", "flags.tillClosed", "timers.clock.left", "goals.serve.done", "outcome", "sceneSteps".' }, op: { enum: GAME_OPS, description: 'set (the default): there and not false. A comparison with a value that isn\'t there is false.' }, value: { type: ['number', 'string', 'boolean'] } },
      } },
      { if: { properties: { test: { enum: ['all', 'any'] } }, required: ['test'] }, then: { required: ['of'], additionalProperties: false, properties: { test: {}, of: { type: 'array', minItems: 1, items: inner } } } },
      { if: { properties: { test: { const: 'not' } }, required: ['test'] }, then: { required: ['of'], additionalProperties: false, properties: { test: {}, of: inner } } },
    ],
  };
}

export function m0Registry() {
  const r = createRegistry();

  r.define('Node3D', {
    description: 'A transform in the tree. Every other node type derives from it.',
    props: {},
    signals: { ready: { description: 'The node entered the running tree.' } },
    actions: { show: { args: {} }, hide: { args: {} } },
  });
  // M1 W5: sound. Playing is simulation (the step it started on; the clip's length ends it), what is heard is not.
  const audioProps = {
    bus: P.enum(['music', 'sfx', 'voice', 'ambience'], { default: 'sfx', description: 'The mixer bus it plays on.' }),
    volume: P.number({ min: 0, max: 4, default: 1, description: 'Linear gain.' }),
    loop: P.boolean({ default: false, sim: true }),
    autoplay: P.boolean({ default: false, sim: true, description: 'Start when the scene starts.' }),
  };
  r.define('AudioPlayer', {
    extends: 'Node3D', description: 'Plays a sound clip (.wav) everywhere at once: music, ambience, interface sounds.',
    asset: { types: ['audio'], required: true }, props: audioProps,
    signals: { started: {}, finished: { args: { stopped: P.boolean() } } },
    actions: { play: { args: {}, description: 'Play from the start.' }, stop: { args: {} } },
  });
  r.define('AudioPlayer3D', {
    extends: 'AudioPlayer', description: 'Plays a sound clip from where it is: doors, switches, machines.',
    props: { ...audioProps, refDistance: P.number({ min: 0.01, default: 1, unit: 'm', description: 'Full volume up to this distance.' }), maxDistance: P.number({ min: 0.1, default: 30, unit: 'm' }), rolloff: P.number({ min: 0, default: 1, description: 'How fast it fades past refDistance (inverse distance).' }) },
  });
  // M2 W0: keyed tracks played on the step clock (@vrmxg/tracks). A track is { id, type, target?, path?, step?, interp?,
  // keys? | clips? }; see @vrmxg/tracks for the types. Playing is simulation (a door it opens replays bit for bit).
  const trackSchema = { type: 'object', required: ['type'], properties: {
    id: { type: 'string' }, type: { enum: ['property', 'transform', 'expression', 'event', 'audio', 'animation'] },
    target: { type: 'string', description: 'Node id the track drives (property, transform, expression, animation).' },
    path: { type: 'string', description: 'Property tracks: "visible" or "props.<name>".' },
    step: { type: 'integer', minimum: 1, maximum: 4, description: 'Hold on ones, twos, threes (anime timing).' },
    interp: { enum: ['linear', 'step'] }, bus: { type: 'string' },
    keys: { description: '[[frame, value, ease?], …]; expression tracks: { name: [[frame, weight, ease?], …] }; event tracks: [[frame, { target, call, args } | { emit }]].' },
    clips: { type: 'array', items: { type: 'object' }, description: 'Animation: [{ start, end, slot | clip, speed, offset, loop, blendIn, blendOut }]; audio: [{ start, end, asset, offset, gain, bus }].' },
  } };
  r.define('AnimationPlayer', {
    extends: 'Node3D', description: 'Plays keyed tracks on the simulation clock: properties, transforms, expressions, character animation, events and sounds. For doors, items, lights and small cutscenes.',
    props: {
      tracks: { schema: { type: 'array', items: trackSchema, description: 'The tracks it plays.' }, meta: { widget: 'json', sim: true } },
      length: P.number({ min: 0, unit: 'frames', sim: true, description: 'Where it ends (default: its last key or clip).' }),
      fps: P.number({ min: 1, max: 240, default: 30, sim: true, description: 'Frames per second the keys are counted in.' }),
      speed: P.number({ min: 0, max: 16, default: 1, sim: true }),
      loop: P.boolean({ default: false, sim: true }),
      autoplay: P.boolean({ default: false, sim: true, description: 'Start when the scene starts.' }),
    },
    signals: { started: { args: { from: P.number() } }, finished: { args: { stopped: P.boolean() } }, event: { args: { name: P.string() }, description: 'An event key with emit.' } },
    actions: { play: { args: { from: arg(P.number(), 'Frame to start from (0).') }, description: 'Play from a frame.' }, stop: { args: {} }, seek: { args: { frame: arg(P.number(), 'Frame to show.') }, description: 'Jump to a frame (no events fire).' } },
  });
  r.define('Marker', { extends: 'Node3D', description: 'A named point: spawn points, look targets, waypoints.', props: { purpose: P.enum(['spawn', 'look', 'waypoint', 'other'], { default: 'other' }) } });
  r.define('Model', {
    extends: 'Node3D', description: 'Static or animated glTF geometry from a .glb asset (sets, props).',
    asset: { types: ['glb'], required: true },
    props: { castShadow: P.boolean({ default: true }), receiveShadow: P.boolean({ default: true }), colliders: P.enum(['none', 'fromAsset', 'trimesh', 'convex'], { default: 'fromAsset', sim: true, description: 'Where physics colliders come from: KHR_physics in the asset, or generated.' }) },
  });
  r.define('Instance', {
    extends: 'Node3D', description: 'Another .vrmxs scene placed here (a prefab), with overrides by inner node id.',
    asset: { types: ['vrmxs'], required: true },
  });
  r.define('Character', {
    extends: 'Node3D', description: 'A VRMXA character: VRM body, closet, animation sets, voice.',
    asset: { types: ['vrmxa'], required: true },
    props: {
      outfit: P.string({ description: 'Outfit id from the character\'s closet.' }),
      controller: P.enum(['none', 'player', 'npc'], { default: 'none', sim: true }),
      animationSet: P.string({ description: 'Animation set id; defaults to the one equipped items imply (VRMXA §8.3).' }),
      capsuleHeight: P.number({ min: 0.3, max: 3, unit: 'm', sim: true }),
      walkSpeed: P.number({ min: 0, default: 1.4, unit: 'm/s', sim: true }),
      jumpSpeed: P.number({ min: 0, default: 4.5, unit: 'm/s', sim: true }),
      layer: P.string({ description: 'Collision layer of the capsule.' }),
      mass: P.number({ min: 1, unit: 'kg', sim: true, description: 'Shared among the ragdoll\'s parts when knocked down (60).' }),
      getUpSeconds: P.number({ min: 0.1, max: 10, unit: 's', sim: true, description: 'How long getting up from a ragdoll blends back into animation (1.2).' }),
      head: P.vec3({ unit: 'rad', sim: true, description: 'Turn the head over the animation: [yaw to her left, pitch up, roll to her left shoulder]. Keyed by a face take (M4 W9) or by hand.' }),
      gaze: P.list(P.number(), { sim: true, description: 'Where the eyes look, from her facing: [yaw to her left, pitch up] in radians. It comes before a look-at target; a puppet take keys it (M4 W9).' }),
      layers: {
        schema: {
          type: 'array',
          description: 'Animation layers over her locomotion (M5 W7), applied in order: each with a bone mask, overwrite or additive blending and a weight that scales what plays on it. Without this list she has upperBody, arms, face (overwrite) and additive (fullBody).',
          items: {
            type: 'object', required: ['name'], additionalProperties: false,
            properties: {
              name: { type: 'string', minLength: 1, description: 'What playLayer and a sequence\'s layer track call it.' },
              mask: { anyOf: [{ enum: ['fullBody', 'upperBody', 'lowerBody', 'arms', 'hands', 'face'] }, { type: 'array', items: { type: 'string' } }], description: 'A group of VRM humanoid bones, or a list of bone names (upperBody).' },
              blend: { enum: ['overwrite', 'additive'], description: 'Overwrite blends towards the layer\'s pose; additive adds its difference from the rest pose (overwrite).' },
              weight: { type: 'number', minimum: 0, maximum: 1, description: 'Scales whatever plays on the layer (1).' },
            },
          },
        },
        meta: { sim: true },
      },
    },
    signals: { arrived: { args: { target: P.nodeRef() } }, spoke: { args: { text: P.string() } }, lineEnded: { args: { text: P.string() } }, dressed: { args: { worn: P.list(P.string()) } }, knockedDown: {}, gettingUp: {}, gotUp: {}, faced: {} },
    actions: {
      say: { args: { text: arg(P.string(), 'What to say (the caption; lip-synced from estimated timings without a clip).'), clip: arg(P.string(), 'A voice line in the project (.wav), with its word timings beside it (<clip>.timings.json).') }, description: 'Speak a line: the clip plays from the head, the mouth follows its word timings, a caption shows.' },
      reach: { args: { hand: arg(P.enum(['left', 'right']), 'Which hand (right).'), point: arg(P.vec3({ unit: 'm' }), 'A point.'), target: arg(P.nodeRef(), 'Or a node.'), part: arg(P.string(), 'An item\'s part (a knob).'), seconds: arg(P.number({ unit: 's' }), 'How long (1).') }, description: 'Reach a hand to a point, a node or an item\'s part: two-bone IK on the arm, fading in and out.' },
      goTo: { args: { target: arg(P.nodeRef(), 'Node to walk to.'), point: arg(P.vec3({ unit: 'm' }), 'Or a point to walk to.') }, description: 'Walk to a node or a point, along the navmesh when the scene has one (around tables and through doorways), else straight.' },
      emote: { args: { name: arg(P.string(), 'Expression or emote clip name.') } },
      lookAt: { args: { target: arg(P.nodeRef(), 'Node to look at; omit to stop.') } },
      knockDown: { args: { impulse: arg(P.vec3({ unit: 'N·s' }), 'A shove in world space, on the torso (or `part`).'), part: arg(P.string(), 'The humanoid bone whose part takes the shove (spine).'), getUp: arg(P.boolean(), 'Get up once settled (true); false stays down until getUp.') }, description: 'Fall as a ragdoll (capsules and joints from the humanoid), then get up, blending back into animation.' },
      getUp: { description: 'Get up from a ragdoll lying still.' },
      playLayer: { args: { layer: arg(P.string(), 'Which layer (upperBody).'), clip: arg(P.string(), 'A clip by name.'), slot: arg(P.string(), 'Or an animation slot, as what she has on resolves it.'), loop: arg(P.boolean(), 'Loop it (true); a one-shot fades out at its end.'), rate: arg(P.number(), 'Playback rate (1).'), fade: arg(P.number({ min: 0, unit: 's' }), 'Fade in, and cross-fade from what played there (0.25).'), weight: arg(P.number({ min: 0, max: 1 }), 'The weight it fades to (1).') }, description: 'Play a clip or a slot on one of her animation layers (M5 W7): a wave or a carried tray on the upper body while she walks.' },
      stopLayer: { args: { layer: arg(P.string(), 'Which layer (upperBody).'), fade: arg(P.number({ min: 0, unit: 's' }), 'Fade out (0.25).') }, description: 'Fade a layer out.' },
      layerWeight: { args: { layer: arg(P.string(), 'Which layer (upperBody).'), weight: arg(P.number({ min: 0, max: 1 }), 'The new weight.'), fade: arg(P.number({ min: 0, unit: 's' }), 'Over this long (0.25).') }, description: 'Fade what plays on a layer to another weight.' },
      face: { args: { target: arg(P.nodeRef(), 'Turn to face this node.'), point: arg(P.vec3({ unit: 'm' }), 'Or this point.'), rate: arg(P.number({ min: 0, unit: 'rad/s' }), 'How fast (4).') }, description: 'Turn the body to face a node or a point, in place (M3 W12); look-at alone stops about 100° from the facing.' },
    },
  });
  r.define('Camera', {
    extends: 'Node3D', description: 'A physical camera: lens, sensor and focus, as the cinematics research specifies.',
    props: {
      focalLength: P.number({ min: 4, max: 1200, default: 50, unit: 'mm' }),
      sensor: P.enum(['super35', 'fullframe', 'mft', 'anime', 'custom'], { default: 'super35' }),
      sensorMm: P.vec3({ description: 'A custom sensor: [width, height, 0] in mm (sensor custom).' }),
      gateFit: P.enum(['fill', 'overscan'], { default: 'fill', description: 'Fill the frame with the sensor (crop) or show all of it.' }),
      fStop: P.number({ min: 0.7, max: 64, default: 2.8 }),
      coc: P.number({ min: 0.001, max: 0.2, unit: 'mm', description: 'Circle of confusion (default: the sensor diagonal / 1500).' }),
      dutch: P.number({ min: -90, max: 90, default: 0, unit: '°', description: 'Dutch angle: roll about the view axis.' }),
      focusDistance: P.number({ min: 0.05, unit: 'm', default: 3 }),
      near: P.number({ min: 0.001, unit: 'm', default: 0.1 }), far: P.number({ min: 0.1, unit: 'm', default: 500 }),
      preset: P.enum(['free', 'fixed', 'orbit', 'follow', 'overShoulder', 'firstPerson'], { default: 'free', sim: true, description: 'Rig preset; switchable at run time (setPreset, nextPreset).' }),
      player: P.number({ min: 1, max: 4, sim: true, description: 'Split screen (M3 W9): this camera is that player\'s, takes that player\'s look input and draws in their viewport.' }),
      rig: { schema: { type: 'object', description: 'Rig overrides: distance, height, side (m); yaw, pitch (degrees): the starting view, yaw 0 looking along +Z.' }, meta: { sim: true } },
      target: P.nodeRef({ description: 'Follow / orbit target.' }),
    },
    actions: {
      makeCurrent: { args: {}, description: 'Render through this camera.' },
      setPreset: { args: { preset: arg(P.enum(['free', 'fixed', 'orbit', 'follow', 'overShoulder', 'firstPerson']), 'Rig preset.') } },
      nextPreset: { args: {} },
    },
    signals: { madeCurrent: {} },
  });
  // M2 W2: cinematic cameras. A VirtualCamera is a candidate shot (body, aim, lens, noise); a CameraBrain picks the live
  // one on its channel and blends it onto a Camera node; Path3D carries dollies and cranes. All step at 60 Hz with the
  // simulation, so camera moves and blends replay identically.
  const RIG_NAMES = ['fixed', 'security', 'follow', 'thirdPerson', 'overShoulder', 'firstPerson', 'topDown', 'orbit', 'turntable', 'dolly', 'crane', 'closeUp', 'twoShot', 'handheld', 'shotReverse'];
  r.define('VirtualCamera', {
    extends: 'Node3D', description: 'A candidate shot: a body (where the camera is), an aim (where it looks), a lens, seeded noise and impulses. A CameraBrain picks one and renders through its Camera.',
    props: {
      rig: P.enum(RIG_NAMES, { default: 'fixed', sim: true, description: 'Preset body / aim / lens / noise; the props below override any part.' }),
      priority: P.number({ default: 10, sim: true, description: 'Higher wins on its channel; the most recently activated wins a tie.' }),
      channel: P.string({ default: 'main', sim: true, description: 'Which brain (output) it competes for.' }),
      enabled: P.boolean({ default: true, sim: true }),
      body: { schema: { type: 'object', description: 'type: fixed | follow | orbit | thirdPerson | firstPerson | dolly | hardLock; target; follow: offset [x, y, z] (target space), space, damping (s); orbit: radius, yaw, pitch (°), yawSpeed (°/s); thirdPerson: shoulder, arm, collide; dolly: path (a Path3D), u (0–1, else closest to the target), lead, pathDamping.' }, meta: { sim: true } },
      aim: { schema: { type: 'object', description: 'type: none | lookAt | composer | groupFraming | panTilt; target ("id" or "id#head"); offset; composer: screen [x, y] (−1…1), deadZone [w, h], softZone [w, h], damping (s); groupFraming: targets [...], size (frame-height fraction); panTilt: yaw, pitch (°).' }, meta: { sim: true } },
      lens: { schema: { type: 'object', description: 'focalLength (mm), fStop, focusDistance (m) or focusTarget, dutch (°), sensor.' }, meta: { sim: true } },
      noise: { schema: { type: 'object', description: 'profile: handheldLight | handheldHeavy | vehicle; amplitude, frequency multipliers.' }, meta: { sim: true } },
      impulseDecay: P.number({ min: 0.05, default: 0.6, unit: 's', sim: true }),
    },
    actions: {
      activate: { args: {}, description: 'Make it the most recently activated (wins ties).' },
      impulse: { args: { strength: arg(P.number({ min: 0, max: 1 }), 'Trauma added (shake ∝ trauma²).'), zoom: arg(P.number({ min: -0.5, max: 0.5 }), 'Zoom punch: a focal-length kick that eases back.') }, description: 'Shake the shot.' },
    },
  });
  r.define('CameraBrain', {
    extends: 'Node3D', description: 'Picks the live VirtualCamera on its channel and blends between them onto a Camera node: one per output (main view, picture in picture, split screen, a render job).',
    props: {
      camera: P.nodeRef({ sim: true, description: 'The Camera node it drives.' }),
      channel: P.string({ default: 'main', sim: true }),
      defaultBlend: { schema: { type: 'object', description: '{ style: cut | linear | easeInOut | easeIn | easeOut, seconds } (or frames + fps).' }, meta: { sim: true } },
      blends: { schema: { type: 'array', items: { type: 'object' }, description: 'Per-pair blends: [{ from, to, style, seconds }] ("*" matches any).' }, meta: { sim: true } },
      makeCurrent: P.boolean({ default: true, sim: true, description: 'Make its Camera the one the view renders through.' }),
    },
    signals: { cameraChanged: { args: { from: P.nodeRef(), to: P.nodeRef() } } },
    actions: {
      override: { args: { camera: arg(P.nodeRef(), 'The VirtualCamera to make live.'), blend: arg({ schema: { type: 'object' }, meta: {} }, 'Blend to it: { style, seconds }.') }, description: 'Force a shot (a sequence\'s camera track).' },
      clearOverride: { args: {} },
    },
  });
  r.define('ParticleEmitter', {
    extends: 'Node3D', description: 'Shows a particle effect where it stands: steam, dust, sparks, or an effect document from the project. In the simulation by default (seeded, in the snapshot, scrubs exactly); presentation for visual-only dressing.',
    props: {
      effect: P.string({ default: 'steam', sim: true, description: 'A built-in effect (steam, dust, sparks) or a project effect document (.json).' }),
      mode: P.enum(['simulation', 'presentation'], { default: 'simulation', sim: true, description: 'simulation: stepped at 60 Hz, in the snapshot and the hash; presentation: stepped with the frame, visual only.' }),
      autoplay: P.boolean({ default: true, sim: true, description: 'Start when the scene starts.' }),
      speed: P.number({ min: 0, max: 16, default: 1, sim: true, description: 'Time scale of the effect.' }),
    },
    signals: { finished: { args: {}, description: 'A non-looping effect ended and its last particle died.' } },
    actions: { play: { args: {}, description: 'Start emitting from the effect\'s start.' }, stop: { args: {}, description: 'Stop emitting; live particles finish their lives.' }, restart: { args: {}, description: 'Clear the particles and start over.' } },
  });
  r.define('Path3D', {
    extends: 'Node3D', description: 'A smooth path through points (Catmull-Rom, by arc length) for dollies, rails and cranes.',
    props: {
      points: { schema: { type: 'array', items: { type: 'array', items: { type: 'number' }, minItems: 3, maxItems: 3 }, minItems: 2, description: 'Points in the node\'s space.' }, meta: { sim: true } },
      closed: P.boolean({ default: false, sim: true }),
      tension: P.number({ min: 0, max: 1, default: 0.5, sim: true }),
    },
  });
  // Lights and the environment are presentation: none of their props is simulated. Lights shine along
  // their node's -Z. Shadow presets set the map size and bias; `shadowUpdate: "once"` freezes the map
  // (static sets), re-rendered when the light or its props change.
  const shadow = (on) => ({
    castShadow: P.boolean({ default: on }),
    shadowPreset: P.enum(['low', 'medium', 'high', 'ultra'], { default: 'medium', description: 'Map size 512 / 1024 / 2048 / 4096, with matching bias.' }),
    shadowUpdate: P.enum(['always', 'once'], { default: 'always', description: '"once" renders the map once and keeps it (static sets).' }),
  });
  r.define('DirectionalLight', { extends: 'Node3D', description: 'Sun-like light along the node\'s -Z. The shadow box is centred on the node.', props: { color: P.color({ default: '#ffffff' }), intensity: P.number({ min: 0, default: 2 }), ...shadow(true), shadowExtent: P.number({ min: 0.5, unit: 'm', default: 8, description: 'Half the width of the shadow box.' }) } });
  r.define('PointLight', { extends: 'Node3D', description: 'Omni light with range.', props: { color: P.color({ default: '#ffffff' }), intensity: P.number({ min: 0, default: 1, unit: 'cd' }), range: P.number({ min: 0, unit: 'm', default: 10 }), ...shadow(false) } });
  r.define('SpotLight', { extends: 'Node3D', description: 'Cone light along the node\'s -Z.', props: { color: P.color({ default: '#ffffff' }), intensity: P.number({ min: 0, default: 10, unit: 'cd' }), range: P.number({ min: 0, unit: 'm', default: 10 }), angle: P.number({ min: 1, max: 89, unit: 'deg', default: 30, description: 'Half-angle of the cone.' }), penumbra: P.number({ min: 0, max: 1, default: 0.2 }), ...shadow(false) } });
  r.define('Environment', {
    extends: 'Node3D', description: 'How the world looks around everything: background, environment lighting, ambient, fog, tone mapping, exposure, an optional ground plane. One per scene (the first wins).',
    props: {
      background: P.enum(['color', 'gradient', 'environment', 'transparent'], { default: 'color' }),
      backgroundColor: P.color({ default: '#c9d3df' }),
      skyTopColor: P.color({ default: '#6f9bd1' }), skyHorizonColor: P.color({ default: '#dfe7ef' }),
      environment: P.enum(['none', 'room'], { default: 'room', description: 'Image-based lighting: none, or a neutral studio room.' }),
      environmentIntensity: P.number({ min: 0, default: 0.4 }),
      ambientColor: P.color({ default: '#ffffff' }), ambientIntensity: P.number({ min: 0, default: 0.6 }),
      fog: P.enum(['none', 'linear', 'exponential'], { default: 'none' }),
      fogColor: P.color({ default: '#c9d3df' }), fogNear: P.number({ min: 0, unit: 'm', default: 10 }), fogFar: P.number({ min: 0, unit: 'm', default: 60 }), fogDensity: P.number({ min: 0, default: 0.02 }),
      toneMapping: P.enum(['neutral', 'agx', 'aces', 'none'], { default: 'neutral', description: 'Neutral keeps MToon\'s authored colours.' }),
      exposure: P.number({ min: 0, default: 1 }),
      post: { schema: { description: 'The post stack (M2 W3): a preset ("anime", "clean") or a list of effects [{ effect: edges | dof | bloom | grade | lut | toneMapping | vignette | grain | anime | chromaticAberration | smaa, …params }]. Lengths in px at 1080p.', anyOf: [{ type: 'string' }, { type: 'array', items: { type: 'object', required: ['effect'] } }] }, meta: { widget: 'json' } },
      ground: P.boolean({ default: false, description: 'A shadow-receiving ground plane at y = 0.' }),
      groundColor: P.color({ default: '#9aa3ad' }), groundSize: P.number({ min: 1, unit: 'm', default: 40 }),
    },
  });
  // A VRMXI game item (VRMXI-base-draft.md): model, bodies, colliders and sensors, joints, states and verbs come from
  // the .vrmxi; the scene places it and may start it in another state.
  r.define('Item', {
    extends: 'Node3D', description: 'A VRMXI game item: a door, container, pickup, switch, seat or spawn point, with its states and verbs.',
    asset: { types: ['vrmxi'], required: true },
    props: { state: P.string({ sim: true, description: 'The state the item starts in; absent: its default (the first).' }) },
    signals: {
      stateChanged: { args: { from: P.string(), to: P.string() } },
      verb: { args: { verb: P.string(), by: P.nodeRef() } },
      entered: { args: { sensor: P.string(), body: P.nodeRef() } },
      exited: { args: { sensor: P.string(), body: P.nodeRef() } },
    },
    actions: {
      enterState: { args: { state: arg(P.string(), 'One of the item\'s states.') }, description: 'Move the item to a state (joints, shown meshes, morphs, animations, sensors).' },
      perform: { args: { verb: arg(P.string(), 'A verb the item offers in its current state.'), by: arg(P.nodeRef(), 'The character doing it.') }, description: 'Do one of the item\'s verbs.' },
      drive: { args: { throttle: arg(P.number({ min: -1, max: 1 }), 'Forward (1) to reverse (−1).'), steer: arg(P.number({ min: -1, max: 1 }), 'Right (1) to left (−1).') }, description: 'A vehicle\'s driving while a non-player sits in its driver\'s seat (M3 W8): a script or a brain.' },
    },
  });
  r.define('RigidBody', {
    extends: 'Node3D', description: 'A Rapier rigid body; its Collider children give it shape.',
    props: { bodyType: P.enum(['dynamic', 'kinematic', 'fixed'], { default: 'dynamic', sim: true }), mass: P.number({ min: 0, unit: 'kg', sim: true }), linearDamping: P.number({ min: 0, default: 0, sim: true }) },
    signals: { contact: { args: { other: P.nodeRef() } }, sleep: {} },
    actions: { applyImpulse: { args: { impulse: arg(P.vec3({ unit: 'N·s' }), 'Impulse in world space.') } } },
  });
  r.define('Collider', {
    extends: 'Node3D', description: 'A collision shape. Under a RigidBody it moves with it; otherwise it is fixed.',
    props: {
      shape: P.enum(['box', 'sphere', 'capsule', 'cylinder', 'convex', 'trimesh'], { default: 'box', sim: true }),
      size: P.vec3({ unit: 'm', sim: true, description: 'Box extents.' }), radius: P.number({ min: 0, unit: 'm', sim: true }), height: P.number({ min: 0, unit: 'm', sim: true }),
      friction: P.number({ min: 0, default: 0.5, sim: true }), restitution: P.number({ min: 0, max: 1, default: 0, sim: true }),
    },
  });
  r.define('Area', {
    extends: 'Collider', description: 'A sensor volume: reports bodies entering and leaving (door triggers, pickups).',
    signals: { bodyEntered: { args: { body: P.nodeRef() } }, bodyExited: { args: { body: P.nodeRef() } } },
  });

  r.define('BoneAttachment', {
    extends: 'Node3D', description: 'Rides on a humanoid bone of the Character it is inside (held and stowed items).',
    props: { bone: P.string({ default: 'rightHand', description: 'VRM humanoid bone name.' }) },
  });

  // M5 W2: game rules (@vrmxg/game, AB-D-0283). These nodes declare; the live values are in the "game" service, which the
  // world snapshot holds and a scene change carries. A condition is data in the shape @vrmxg/ai's tests have:
  // { test, ...args }. What it triggers is a signal, wired to an action by a connection.
  const when = (description) => ({ schema: { ...conditionSchema(), description }, meta: { widget: 'json', sim: true } });
  const key = (what) => P.string({ pattern: '^[A-Za-z0-9_-]+$', sim: true, description: `The ${what}'s name in the game state (default: the node's id).` });
  const scope = (def) => P.enum(['game', 'scene'], { default: def, sim: true, description: 'game: kept across scene changes. scene: starts again each time this scene is entered.' });
  r.define('GameRules', {
    extends: 'Node3D', description: 'A scene\'s rules: when the game is won and lost, and the flags it starts with. One per scene. Its actions change the game state and move the game to another scene.',
    props: {
      win: when('The game is won when this holds. Absent: when every GameGoal that isn\'t optional is done.'),
      lose: when('The game is lost when this holds (a win on the same step beats it).'),
      flags: { schema: { type: 'object', additionalProperties: { type: ['boolean', 'number', 'string'] }, description: 'Flags and the values they start a game with. A condition may read a flag started here, set by a connection in this scene, or listed in reads.' }, meta: { widget: 'json', sim: true } },
      reads: { schema: { type: 'object', additionalProperties: false, description: 'What this scene\'s conditions read that another scene owns, by name: carried counters, flags, timers and goals, and other scenes\' checkpoint slots. Reading a goal doesn\'t make it one of this scene\'s objectives. What the game doesn\'t have is seen as its default (a flag false, a goal not done, a counter 0 or the default given; a timer and a checkpoint not there), without becoming state: its owner\'s scene gives it its value.', properties: { ...Object.fromEntries(['counters', 'flags', 'timers', 'goals', 'checkpoints'].map((k) => [k, { type: 'array', items: { type: 'string', minLength: 1 }, uniqueItems: true }])), counters: { anyOf: [{ type: 'array', items: { type: 'string', minLength: 1 }, uniqueItems: true }, { type: 'object', additionalProperties: { type: 'number' }, description: 'name → the value it has when the game brings none.' }] } } }, meta: { widget: 'json', sim: true } },
      keepOutcome: P.boolean({ default: false, sim: true, description: 'Arriving here keeps the last win or loss (an ending screen shows it). Otherwise the scene starts undecided.' }),
    },
    signals: {
      won: { description: 'The game was won.' }, lost: { description: 'The game was lost.' },
      ended: { args: { result: P.enum(['won', 'lost']) }, description: 'Won or lost.' },
      flagChanged: { args: { flag: P.string(), value: { schema: {}, meta: {} } } },
    },
    actions: {
      win: { args: {}, description: 'Ask for a win: the game is decided once, at the end of the step\'s rules.' }, lose: { args: {}, description: 'Ask for a loss (a win asked for on the same step beats it).' },
      setFlag: { args: { flag: arg(P.string(), 'The flag\'s name.'), value: { schema: { type: ['boolean', 'number', 'string'], description: 'Its value (true).' }, meta: {} } }, description: 'Set a flag.' },
      clearFlag: { args: { flag: arg(P.string(), 'The flag\'s name.') }, description: 'Remove a flag.' },
      changeScene: { args: { to: arg(P.string(), 'The scene to go to: its path in the project ("level.vrmxs").'), after: arg(P.number({ min: 0, unit: 's' }), 'Play on here this long first (0: the change is the next step).'), reset: arg(P.boolean(), 'Start a new game there: nothing is carried over.') }, description: 'Move the game to another scene. The game state goes with it.' },
      restart: { args: { after: arg(P.number({ min: 0, unit: 's' }), 'Play on this long first.') }, description: 'Start this scene again as a new game.' },
    },
  });
  r.define('GameCounter', {
    extends: 'Node3D', description: 'A number the game counts: the score (the counter named "score"), orders taken, coins.',
    props: { key: key('counter'), start: P.number({ default: 0, sim: true, description: 'What it starts at.' }), min: P.number({ sim: true }), max: P.number({ sim: true }), label: P.string({ description: 'What the HUD calls it.' }), scope: scope('game') },
    signals: { changed: { args: { value: P.number(), by: P.number() } } },
    actions: { add: { args: { by: arg(P.number(), 'How much (1).') }, description: 'Add to it.' }, set: { args: { value: arg(P.number(), 'The new value.') } }, reset: { args: {}, description: 'Back to its start.' } },
  });
  r.define('GameTimer', {
    extends: 'Node3D', description: 'A clock counted in simulation steps: a countdown that times out, or a stopwatch (no length). It follows its node\'s pause and time scale, and stops when the game is won or lost.',
    props: { key: key('timer'), seconds: { schema: { type: 'number', exclusiveMinimum: 0, description: 'How long the countdown is: above zero. Absent: a stopwatch, with no limit, that never times out.' }, meta: { unit: 's', widget: undefined, sim: true } }, autostart: P.boolean({ default: true, sim: true, description: 'Running from the scene\'s start.' }), label: P.string({ description: 'What the HUD calls it.' }), scope: scope('scene') },
    signals: { started: {}, stopped: {}, timeout: { description: 'The countdown reached zero.' } },
    actions: { start: { args: {}, description: 'Run (on from where it stopped).' }, stop: { args: {} }, reset: { args: {}, description: 'Back to its full length.' }, addTime: { args: { seconds: arg(P.number({ unit: 's' }), 'Time to add to the countdown (negative: take away; with none left it times out).') }, description: 'Lengthen or shorten a countdown (not a stopwatch).' } },
  });
  r.define('GameGoal', {
    extends: 'Node3D', description: 'Something to get done: the HUD shows the first one that isn\'t. Done when its condition first holds, or by its action.',
    props: { key: key('goal'), text: P.string({ description: 'What the HUD shows.' }), when: when('The goal is done when this first holds.'), optional: P.boolean({ default: false, sim: true, description: 'Not needed to win.' }), scope: scope('scene') },
    signals: { completed: {} },
    actions: { complete: { args: {}, description: 'Done, now.' } },
  });
  r.define('Checkpoint', {
    extends: 'Node3D', description: 'A point where the game saves by itself (into a slot of the save store): when its condition first holds, or by its action (a trigger\'s connection).',
    props: { slot: P.string({ default: 'checkpoint', pattern: '^[A-Za-z0-9_-]{1,59}$', sim: true, description: 'The checkpoint slot it writes (in the save store: "auto-" and this name).' }), when: when('Written when this becomes true.'), once: P.boolean({ default: true, sim: true, description: 'Only the first time.' }), label: P.string({ description: 'The save\'s name in a slot list.' }) },
    signals: { written: { args: { slot: P.string() }, description: 'The checkpoint was taken (the file is written after the step). Not on a step that decides the game.' } },
    actions: { write: { args: {}, description: 'Save now.' } },
  });

  // M5 W3: conversations with choices (@vrmxg/voice's dialogue service, AB-T-0618). The lines are data; a choice names
  // the line that comes next, and arrives in the step as a recorded input, so a conversation replays as it was played.
  const lineFlags = { type: 'object', additionalProperties: { type: ['boolean', 'number', 'string'] }, description: 'Game flags to set (@vrmxg/game), by name.' };
  const choiceSchema = { type: 'object', required: ['text'], additionalProperties: false, properties: {
    id: { type: 'string', pattern: '^[A-Za-z0-9_-]+$', description: 'What the choice is called in the input recording (default: its place in the list, "0", "1").' },
    text: { type: 'string', minLength: 1, description: 'What the player picks.' },
    to: { type: 'string', minLength: 1, description: 'The id of the line that comes next ("end" ends the conversation). Default: the line after this one.' },
    when: { ...conditionSchema(2), description: 'Offered only when this holds (a game condition).' },
    set: lineFlags,
  } };
  const lineSchema = { type: 'object', required: ['text'], additionalProperties: false, properties: {
    id: { type: 'string', pattern: '^[A-Za-z0-9_-]+$', description: 'The name a next or a choice\'s to uses.' },
    speaker: { type: 'string', minLength: 1, description: 'The id of the node that says it (a Character is heard and lip-synced; without one the line is a caption).' },
    text: { type: 'string', minLength: 1, description: 'What is said: the caption, and the line itself without a clip.' },
    clip: { type: 'string', description: 'A voice clip (.wav) with its timings beside it.' },
    seconds: { type: 'number', exclusiveMinimum: 0, description: 'The line\'s length. Default: from its clip\'s word timings (the last word, plus a quarter second), or from its text. Set it to keep a clip\'s tail: a line never takes its length from the decoded audio, which only some hosts have.' },
    pause: { type: 'number', minimum: 0, description: 'Seconds to wait after the line before its choices or the next line.' },
    next: { type: 'string', minLength: 1, description: 'The id of the line after this one when it offers no choice ("end" ends the conversation). Default: the next in the list.' },
    when: { ...conditionSchema(2), description: 'Said only when this holds; otherwise passed over to the next in the list.' },
    set: lineFlags,
    choices: { type: 'array', minItems: 1, items: choiceSchema, description: 'What the player may answer; the conversation waits for one.' },
  } };
  r.define('Dialogue', {
    extends: 'Node3D', description: 'A conversation: lines said in order by the scene\'s characters, some offering choices that say which line comes next. One conversation runs at a time.',
    props: {
      lines: { schema: { type: 'array', minItems: 1, items: lineSchema, description: 'The lines, in order. A line\'s next, or a choice\'s to, jumps to another by id.' }, meta: { widget: 'json', sim: true } },
      autostart: P.boolean({ default: false, sim: true, description: 'Starts when the scene starts.' }),
      skippable: P.boolean({ default: true, sim: true, description: 'The player may end a line early (the dialogue.advance input).' }),
    },
    signals: {
      started: {}, ended: { args: { line: P.string() } },
      line: { args: { line: P.string(), speaker: P.string(), text: P.string() }, description: 'A line started.' },
      asked: { description: 'A line\'s choices are on offer.' },
      chose: { args: { line: P.string(), choice: P.string(), text: P.string() }, description: 'The player picked a choice.' },
    },
    actions: { start: { args: { at: arg(P.string(), 'Start at this line\'s id (default: the first).') }, description: 'Start the conversation (nothing happens while another is going on).' }, stop: { args: {}, description: 'End it where it is.' } },
  });

  // Behaviours: named code in the project, referenced from scenes by id (no code in scenes).
  r.behaviour('wander', { description: 'Walk to random reachable points within a radius.', on: ['Character'], params: { radius: P.number({ min: 0, default: 4, unit: 'm' }), pause: P.number({ min: 0, default: 2, unit: 's' }) } });
  r.behaviour('greet', { description: 'Says a line to someone who comes close (looking at them), then waits a while before greeting again.', on: ['Character'], params: { target: P.nodeRef({ description: 'Who to greet (the player).' }), radius: P.number({ min: 0, default: 2, unit: 'm' }), clip: P.string({ description: 'A voice line (.wav) with its timings beside it.' }), text: P.string({ description: 'The caption (or the line, without a clip).' }), cooldown: P.number({ min: 0, default: 20, unit: 's' }) } });
  r.behaviour('switchedBy', { description: 'Shown while an item is in a state (a lamp lit while its switch is on), hidden otherwise.', on: ['Node3D'], params: { item: P.nodeRef({ description: 'The item (a switch).' }), state: P.string({ default: 'on' }) } });
  r.behaviour('hinge', {
    description: 'A door hinge: a revolute joint with limits and a motor.', on: ['RigidBody'],
    params: { axis: P.vec3({ default: [0, 1, 0] }), openAngle: P.number({ min: -180, max: 180, default: 100, unit: '°' }), locked: P.boolean({ default: false }) },
    signals: { opened: {}, closed: {} }, actions: { open: { args: {} }, close: { args: {} }, toggle: { args: {} } },
  });
  r.behaviour('noticeViewer', { description: 'Sees the person at the camera (M3 W5, @vrmxg/sense): looks at them when they appear and away when they leave, answers a wave and a nod with animation slots, and can say lines. Needs the sense service and the scene\'s viewer node.', on: ['Character'], params: {
    answers: { schema: { type: 'object', additionalProperties: { type: 'string' }, default: { wave: 'greet', nod: 'nod' }, description: 'Camera event (wave, nod, shake, point) → the animation slot that answers it.' }, meta: { widget: 'json' } },
    say: { schema: { type: 'object', additionalProperties: { type: 'string' }, description: 'Camera event (appeared, wave, nod, shake, point) → a line to say.' }, meta: { widget: 'json' } },
    smile: P.string({ default: 'happy', description: 'The expression shown when someone appears.' }),
  } });
  r.behaviour('brain', { description: 'An NPC brain (M2 W7): perception, memory, a behaviour tree with utility choices, and the action vocabulary. A role preset (server, customer, wanderer; M3: host, conversationPartner, follower, which a director can talk with; M4: actor, who does only what she is directed to), a brain document in the project (brains/hana.json) or a preset object; vars override its blackboard plan.', on: ['Character'], params: {
    preset: { schema: { anyOf: [{ type: 'string', enum: ['server', 'customer', 'wanderer', 'host', 'conversationPartner', 'follower', 'actor'] }, { type: 'string', pattern: '\\.json$' }, { type: 'object' }], default: 'wanderer', description: 'A role preset, a brain document\'s path, or a preset object ({ plan, senses, tree }).' }, meta: { widget: 'json' } },
    vars: { schema: { type: 'object', description: 'Blackboard values over the preset\'s plan.' }, meta: { widget: 'json' } },
    tickEvery: P.number({ min: 1, default: 1, description: 'Think every n steps (four times slower far from the player).' }),
    lodDistance: P.number({ min: 0, default: 25, unit: 'm' }),
    senses: { schema: { type: 'object', description: 'Perception settings over the preset\'s: sight { range, fov, every }, hearing { sensitivity }, proximity { radius }, maxAge, decay.' }, meta: { widget: 'json' } },
  } });
  r.behaviour('player', { description: 'Drives a Character from the move / jump / run actions, relative to the current camera (split screen: its player\'s actions and camera).', on: ['Character'], params: { walkSpeed: P.number({ min: 0, default: 1.4, unit: 'm/s' }), runSpeed: P.number({ min: 0, default: 4, unit: 'm/s' }), player: P.number({ min: 1, max: 4, default: 1, description: 'Which player (M3 W9): 2 reads the p2.* actions and player 2\'s camera.' }) } });
  r.behaviour('pickup', { description: 'Can be picked up; equips a VRMXW if the item names one.', on: ['Instance', 'Model', 'RigidBody'], params: { item: P.string() }, signals: { pickedUp: { args: { by: P.nodeRef() } } } });
  return r;
}
