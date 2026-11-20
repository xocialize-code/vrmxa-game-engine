// Where feature frames come from (M3 W5). The spike (spike-camera/README.md) put capture in the Mac shell: AVCapture and
// Vision on a background queue, sending only numbers to the page (camera.start / camera.stop, `camera.frame` events).
// A page outside the shell can replay recorded frames (a session saved with recordFrames, or a test's). Frames from
// either go through a GestureDetector, and its events into the sense service. Nothing here keeps or sends an image.
import { GestureDetector } from './detect.js';

/**
 * The Mac shell's camera (apps/shell CameraMethods). @param {{ call: Function, on: Function }} shell the page's shell.js
 * devices() lists the cameras ({ id, name, kind, isDefault }; a capture card is one too); start takes a device id, or
 * uses the system's default camera.
 * @returns {{ devices: () => Promise<any[]>, start: (onFrame: (f: any) => void, opts?: { fps?: number, device?: string | null }) => Promise<any>, stop: () => Promise<void> }}
 */
export function shellCamera({ call, on }) {
  let off = null;
  return {
    async devices() { return (await call('camera.devices')).devices ?? []; },
    async start(onFrame, { fps = 15, device = null } = {}) { off?.(); off = on('camera.frame', (p) => onFrame(p.frame ?? p)); return call('camera.start', { fps, ...(device ? { device } : {}) }); },
    async stop() { off?.(); off = null; await call('camera.stop').catch(() => {}); },
  };
}

/**
 * Recorded feature frames played back on a clock, as the camera would send them. `now` (ms) is the caller's wall clock
 * (the page's performance.now): nothing in this package reads one, it is inside the determinism boundary.
 * @param {any[]} frames @param {{ now: () => number, setTimer?: (f: () => void, ms: number) => any, clearTimer?: (h: any) => void }} o
 */
export function recordedFrames(frames, { now, setTimer = setTimeout, clearTimer = clearTimeout }) {
  let timer = null;
  return {
    async start(onFrame) {
      const t0 = now(), base = frames[0]?.t ?? 0;
      let i = 0;
      const tick = () => {
        const at = now() - t0;
        while (i < frames.length && frames[i].t - base <= at) onFrame({ ...frames[i], t: frames[i].t }), i++;
        if (i < frames.length) timer = setTimer(tick, 16);
      };
      tick();
      return { frames: frames.length };
    },
    async stop() { if (timer !== null) clearTimer(timer); timer = null; },
  };
}

/**
 * The camera into the world: a source's frames through a detector into the sense service (each event applies on the next
 * step and is logged). `onEvent` sees every event (a UI's status line); `keep` keeps the frames (recordFrames).
 * @param {import('./service.js').SenseService} sense @param {ReturnType<typeof shellCamera>} source
 * @param {{ detector?: GestureDetector, onEvent?: (e: any) => void, keep?: boolean }} [o]
 */
export function connectCamera(sense, source, { detector = new GestureDetector(), onEvent = null, keep = false } = {}) {
  const frames = [];
  let on = false;
  return {
    detector, frames,
    get on() { return on; },
    async start(opts) {
      on = true;
      return source.start((f) => {
        if (!on) return;
        if (keep) frames.push(f);
        for (const e of detector.push(f)) { sense.push(e); onEvent?.(e); }
      }, opts);
    },
    async stop() {
      on = false;
      await source.stop();
      // whoever was there is gone when the camera goes off
      if (detector.present) { detector.present = false; const e = { type: 'presence', present: false }; sense.push(e); onEvent?.(e); }
    },
  };
}
