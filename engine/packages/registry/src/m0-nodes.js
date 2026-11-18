// The provisional M0 node set (PRD §8). In W1 the runtime node classes register themselves with
// `define` and this file goes; until then it is the fixture the scene package tests against. Enough types to build a scene with a set, a character, a door prefab,
// a camera, lights, physics and a trigger. Each is one definition; schemas and tools follow.
import { createRegistry, P } from './index.js';

const arg = (p, description) => ({ ...p, schema: { ...p.schema, description } });

export function m0Registry() {
  const r = createRegistry();

  r.define('Node3D', {
    description: 'A transform in the tree. Every other node type derives from it.',
    props: {},
    signals: { ready: { description: 'The node entered the running tree.' } },
    actions: { show: { args: {} }, hide: { args: {} } },
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
    },
    signals: { arrived: { args: { target: P.nodeRef() } }, spoke: { args: { text: P.string() } } },
    actions: {
      say: { args: { text: arg(P.string(), 'What to say (lip-synced).') }, description: 'Speak a line.' },
      goTo: { args: { target: arg(P.nodeRef(), 'Node to walk to.') }, description: 'Walk to a node using navigation.' },
      emote: { args: { name: arg(P.string(), 'Expression or emote clip name.') } },
      lookAt: { args: { target: arg(P.nodeRef(), 'Node to look at; omit to stop.') } },
    },
  });
  r.define('Camera', {
    extends: 'Node3D', description: 'A physical camera: lens, sensor and focus, as the cinematics research specifies.',
    props: {
      focalLength: P.number({ min: 4, max: 1200, default: 50, unit: 'mm' }),
      sensor: P.enum(['super35', 'fullframe', 'mft', 'custom'], { default: 'super35' }),
      fStop: P.number({ min: 0.7, max: 64, default: 2.8 }),
      focusDistance: P.number({ min: 0.05, unit: 'm', default: 3 }),
      near: P.number({ min: 0.001, unit: 'm', default: 0.1 }), far: P.number({ min: 0.1, unit: 'm', default: 500 }),
      preset: P.enum(['free', 'fixed', 'orbit', 'follow', 'overShoulder', 'firstPerson'], { default: 'free', sim: true, description: 'Rig preset; switchable at run time (setPreset, nextPreset).' }),
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
      ground: P.boolean({ default: false, description: 'A shadow-receiving ground plane at y = 0.' }),
      groundColor: P.color({ default: '#9aa3ad' }), groundSize: P.number({ min: 1, unit: 'm', default: 40 }),
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

  // Behaviours: named code in the project, referenced from scenes by id (no code in scenes).
  r.behaviour('wander', { description: 'Walk to random reachable points within a radius.', on: ['Character'], params: { radius: P.number({ min: 0, default: 4, unit: 'm' }), pause: P.number({ min: 0, default: 2, unit: 's' }) } });
  r.behaviour('hinge', {
    description: 'A door hinge: a revolute joint with limits and a motor.', on: ['RigidBody'],
    params: { axis: P.vec3({ default: [0, 1, 0] }), openAngle: P.number({ min: -180, max: 180, default: 100, unit: '°' }), locked: P.boolean({ default: false }) },
    signals: { opened: {}, closed: {} }, actions: { open: { args: {} }, close: { args: {} }, toggle: { args: {} } },
  });
  r.behaviour('player', { description: 'Drives a Character from the move / jump / run actions, relative to the current camera.', on: ['Character'], params: { walkSpeed: P.number({ min: 0, default: 1.4, unit: 'm/s' }), runSpeed: P.number({ min: 0, default: 4, unit: 'm/s' }) } });
  r.behaviour('pickup', { description: 'Can be picked up; equips a VRMXW if the item names one.', on: ['Instance', 'Model', 'RigidBody'], params: { item: P.string() }, signals: { pickedUp: { args: { by: P.nodeRef() } } } });
  return r;
}
