# @vrmxg/input

M0 W4 (AB-T-0505). Named actions bound to keys, mouse and gamepads, latched once per simulation step, recorded and
replayed; and the player controller. Inside the determinism boundary: devices are read once per step, and only the
latched values reach the simulation.

```js
import { installInput, KeyboardDevice, MouseDevice, GamepadDevice } from '@vrmxg/input';
const input = installInput(tree, project.input);          // first service: it latches before any node runs
input.addDevice(new KeyboardDevice().attach(window));
const mouse = input.addDevice(new MouseDevice().attach(canvas)); canvas.onclick = () => mouse.lock();
input.addDevice(new GamepadDevice());
input.record();  /* … */  const rec = input.stop();       // plain JSON
input.replay(rec);                                         // from rec.start on, frames come from the recording
```

| Piece | What |
|---|---|
| `ActionMap` | `vrmxg.json` `input.actions`: axis or button actions with key, mouse (deltas, wheel, buttons) and gamepad (axes with deadzones, buttons) bindings. `DEFAULT_ACTIONS`: WASD/arrows, mouse look, Space jump, Shift run, E / click interact, C next camera, a standard gamepad |
| Devices | `KeyboardDevice` (codes held; released on blur), `MouseDevice` (deltas accumulated between steps, wheel, buttons, pointer lock), `GamepadDevice` (the first standard-mapping pad, polled once per step; `rumble()` is output only), `VirtualDevice` (scriptable, for tests and tools) |
| `InputService` (`input`) | Latches one frame per step: `axis(name)`, `isDown`, `pressed` (went down this step), `released`. `record()` / `stop()` / `replay(rec)`; a replay ignores live devices and refuses a recording made with a different action map. `getState()` for world snapshots |
| `PlayerController` (`player`) | Move / run / jump → a Character's intent, relative to the current camera's yaw. One step (1/60 s) of latency: behaviours run after their node |

Tests (`npm test`, no models needed): the map (keys, deadzones, unbounded mouse deltas, any-binding buttons); 10 s of
scripted keyboard, mouse and gamepad recorded, saved as JSON and replayed to the identical state with live devices
ignored; button edges; a mismatched recording refused. The character-level version is in `@vrmxg/camera`'s
integration test.
