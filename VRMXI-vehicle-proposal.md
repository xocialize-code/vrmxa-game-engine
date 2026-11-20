# Proposal for the VRMXI review: the `vehicle` type (VRMXI 0.1 → 0.2)

*From VRMXG M3 W8 (AB-T-0547), 2026-11-19. For the open VRMXI review (xocialize-code/vrmxa-spec#1, branch
`claude/vrmxi-draft-4198c8`). VRMXG implements this today: `engine/packages/item/src/vehicle.js`, the sample's
`items/cart.vrmxi` (which the draft's checker accepts as it stands), acceptance check 19.*

## What changes in the draft

1. **§2 Types.** `vehicle` moves from the later types into the table:

   | `type` | What | Verbs | States | Needs |
   |---|---|---|---|---|
   | `vehicle` | something a character drives or rides: a cart, a car, a buggy | `sit` | none needed | `vehicle` (§8.4) and `seat` (§8.2): a dynamic chassis, its wheels, where the driver and passengers sit |

   The later types keep `ladder` and `screen`.

2. **§4 Manifest.** One more row:

   | Field | Required | Meaning |
   |---|---|---|
   | `vehicle` | `vehicle` only | its chassis, wheels, suspension, grip, engine and which seat drives (§8.4) |

3. **§8.4 Vehicles (`vehicle`)**, new:

   ```json
   "vehicle": {
     "body": "Chassis",
     "wheels": [
       { "node": "Wheel FL", "radius": 0.26, "steer": true,  "drive": false },
       { "node": "Wheel FR", "radius": 0.26, "steer": true,  "drive": false },
       { "node": "Wheel BL", "radius": 0.26, "steer": false, "drive": true },
       { "node": "Wheel BR", "radius": 0.26, "steer": false, "drive": true }
     ],
     "suspension": { "rest": 0.2, "travel": 0.12, "stiffness": 40, "compression": 2.6, "relaxation": 3.4 },
     "grip": { "friction": 2.5, "side": 1 },
     "engine": { "force": 500, "reverse": 250, "brake": 20, "maxSpeed": 6, "maxSteer": 0.5, "steerSpeed": 2 },
     "driver": 0
   },
   "seat": { "points": [ { "node": "Driver", "exit": "Driver exit" }, { "node": "Passenger", "exit": "Passenger exit" } ] },
   "verbs": [ { "verb": "sit", "prompt": "Get in", "reach": "Reach" } ]
   ```

   | Key | Meaning |
   |---|---|
   | `body` | the `name` of the node with the chassis' **dynamic** body (`motion` without `isKinematic`, §5.1). The chassis' colliders, its seats, wheels and `reach` sensor are under it, so they move with it |
   | `wheels[]` | one per wheel. `node`: a node under the chassis at the wheel's centre at rest; `radius` in metres; `steer`: it turns with the steering; `drive`: the engine drives it; `brake` (default true): it brakes |
   | `suspension` | for every wheel: `rest`, the spring's rest length (m: the wheel hangs that far below its mounting point); `travel`, how far it compresses (m); `stiffness`; `compression` and `relaxation`, its damping each way. Absent: the reader's defaults |
   | `grip` | `friction`, the tyres' slip friction; `side`, their sideways grip (a factor) |
   | `engine` | `force` forwards and `reverse` backwards (newtons, shared among the driven wheels); `brake` (per braking wheel); `maxSpeed` (m/s; reverse a third of it); `maxSteer` (rad, the wheel angle at full lock); `steerSpeed` (rad/s, how fast the steering turns) |
   | `driver` | the index of the seat point (§8.2) whose occupant drives; default 0. Other points are passengers |

   - **Frame.** The item's: +Y up, the front +Z. Steering a positive angle turns towards +X (the vehicle's left).
   - **The wheels are rays.** The engine finds the ground with a ray down from each wheel's mounting point, as a
     raycast vehicle does; a wheel needs no collider and no body of its own, and has none. Its node is drawn: the
     engine moves it with its suspension and turns it with the steering and as it rolls.
   - **Getting in and out** is the `sit` verb (§8.2): the character goes to the nearest free seat point and sits; the
     `driver` point's occupant drives. It gets out to that point's `exit`, which moves with the chassis, when it
     interacts again with the vehicle nearly stopped. Movement keys drive instead of standing it up.
   - **Driving is the game's.** Which keys or stick steer and drive, and how a non-player drives (a script, a brain),
     belong to the engine, as focus and prompts do (§8). The manifest gives the vehicle's limits, not its controls.
   - **Parked**, with no driver, a vehicle holds its brakes.
   - **Not in version 1:** gears and an engine's torque curve, differentials, tyre models beyond slip friction, damage,
     trailers, tracks (a tank), boats and aircraft. A vendor adds them under `extensions` meanwhile (§12).

4. **§13 Checks.** New rows, code `vrmxi.vehicle`:
   - a `vehicle` has `vehicle` and `seat`, and offers `sit`;
   - `vehicle.body` names a node with a dynamic body;
   - each wheel's `node` exists under the chassis' node, each `radius` is above 0, and at least one wheel drives;
   - `vehicle.driver` is an index into `seat.points`;
   - a `vehicle` section on another type is a warning.

5. **§16.** Closes the vehicle half of I18.

## Why this shape

- **Rays, not wheel bodies.** It is what Rapier's `DynamicRayCastVehicleController` does, and Jolt's
  `VehicleConstraint` and Godot's `VehicleBody3D` work the same way. A writer describes wheels in a way every engine can
  build, and nothing in the file depends on one engine's joint solver.
- **Limits in the file, controls in the engine.** As verbs name slots rather than clips (§8.1), a vehicle names its
  forces and limits rather than its keys.
- **Seats reuse §8.2.** A vehicle is a seat that moves and that one occupant steers. Nothing new for getting in and out.

## How VRMXG reads it (for the record)

- One controller per vehicle, on the chassis' body, behind the physics adapter (`createVehicle`). Like the character
  controller, it lives outside Rapier's snapshot: it is built again after a restore. The steering as it eases, the
  wheels' spin and a script's command are the item's state, so a snapshot mid-drive re-simulates bit for bit (check 19,
  Node, Chromium and WKWebView).
- A parked vehicle that has gone to sleep is left alone: Rapier's controller would keep adding its springs' impulse
  to a sleeping body.
- Seated characters are moved to their seats again after physics has moved the chassis, so they ride with it
  rather than a step behind.
