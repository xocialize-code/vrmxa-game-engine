// A stand-in for Web Audio in Node: enough of BaseAudioContext for the service to schedule against, recording what it
// was asked to do (starts with their offsets, stops, positions).
const param = (v = 0) => ({ value: v, setTargetAtTime(x) { this.value = x; }, setValueAtTime(x) { this.value = x; } });
const node = (extra = {}) => ({ connect(x) { return x; }, disconnect() {}, ...extra });

export class FakeAudioContext {
  constructor() {
    this.currentTime = 0; this.state = 'running'; this.baseLatency = 0.005; this.outputLatency = 0.015;
    this.destination = node(); this.started = []; this.stopped = 0;
    this.listener = { positionX: param(), positionY: param(), positionZ: param(), forwardX: param(), forwardY: param(), forwardZ: param(-1), upX: param(), upY: param(1), upZ: param() };
  }
  createGain() { return node({ gain: param(1) }); }
  createPanner() { return node({ positionX: param(), positionY: param(), positionZ: param() }); }
  createBufferSource() {
    const ctx = this;
    return node({ buffer: null, loop: false, start(when, offset) { ctx.started.push({ when, offset, buffer: this.buffer }); }, stop() { ctx.stopped++; } });
  }
  decodeAudioData(ab) { return Promise.resolve({ duration: (ab.byteLength - 44) / 2 / 24000, numberOfChannels: 1 }); }
  resume() { this.state = 'running'; return Promise.resolve(); }
}
