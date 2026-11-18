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
      preset: P.enum(['free', 'orbit', 'follow', 'firstPerson', 'fixed'], { default: 'free' }),
      target: P.nodeRef({ description: 'Follow / orbit target.' }),
    },
    actions: { makeCurrent: { args: {}, description: 'Render through this camera.' } },
  });
  r.define('DirectionalLight', { extends: 'Node3D', description: 'Sun-like light.', props: { color: P.color({ default: '#ffffff' }), intensity: P.number({ min: 0, default: 2 }), castShadow: P.boolean({ default: true }) } });
  r.define('PointLight', { extends: 'Node3D', description: 'Omni light with range.', props: { color: P.color({ default: '#ffffff' }), intensity: P.number({ min: 0, default: 1, unit: 'cd' }), range: P.number({ min: 0, unit: 'm', default: 10 }) } });
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
  r.behaviour('pickup', { description: 'Can be picked up; equips a VRMXW if the item names one.', on: ['Instance', 'Model', 'RigidBody'], params: { item: P.string() }, signals: { pickedUp: { args: { by: P.nodeRef() } } } });
  return r;
}
