// Where sound goes: one Web Audio context with its buses (music, sfx, voice, ambience → master), shared by every tree an
// app builds (the editor's play worlds, the playground's reloads). Volume and mute are the listener's settings,
// presentation only. Browsers start a context suspended until a gesture: `unlockOn(target)` resumes it on the first
// pointer or key press.

export const BUSES = ['music', 'sfx', 'voice', 'ambience'];

export class AudioOutput {
  /** @param {{ context?: BaseAudioContext, AudioContext?: any }} [opts] */
  constructor({ context, AudioContext: Ctor = globalThis.AudioContext } = {}) {
    this.ctx = context ?? new Ctor({ latencyHint: 'interactive' });
    this.master = this.ctx.createGain();
    this.master.connect(this.ctx.destination);
    /** @type {Record<string, { gain: GainNode, volume: number, muted: boolean }>} */ this.buses = {};
    for (const name of BUSES) {
      const gain = this.ctx.createGain();
      gain.connect(this.master);
      this.buses[name] = { gain, volume: 1, muted: false };
    }
    this.masterVolume = 1; this.masterMuted = false;
  }

  bus(name) { return this.buses[name] ?? this.buses.sfx; }

  /**
   * Set a bus's volume (0..1, linear) and mute; name 'master' for everything.
   * @param {string} name @param {{ volume?: number, muted?: boolean }} [opts]
   */
  setBus(name, { volume, muted } = {}) {
    if (name === 'master') {
      if (volume !== undefined) this.masterVolume = volume;
      if (muted !== undefined) this.masterMuted = muted;
      this.master.gain.setTargetAtTime(this.masterMuted ? 0 : this.masterVolume, this.ctx.currentTime, 0.015);
      return;
    }
    const b = this.buses[name];
    if (!b) throw new Error(`no bus "${name}" (${BUSES.join(', ')}, master)`);
    if (volume !== undefined) b.volume = volume;
    if (muted !== undefined) b.muted = muted;
    b.gain.gain.setTargetAtTime(b.muted ? 0 : b.volume, this.ctx.currentTime, 0.015);
  }

  /** The settings as plain data: { master: { volume, muted }, music: {...}, ... }. */
  settings() {
    return { master: { volume: this.masterVolume, muted: this.masterMuted }, ...Object.fromEntries(BUSES.map((n) => [n, { volume: this.buses[n].volume, muted: this.buses[n].muted }])) };
  }

  get running() { return this.ctx.state === 'running'; }

  /** Resume the context on the first pointer or key press on `target` (a window). → a function that stops listening */
  unlockOn(target) {
    const kick = () => { if (this.ctx.state !== 'running') this.ctx.resume?.(); };
    const events = ['pointerdown', 'keydown', 'touchend'];
    for (const e of events) target.addEventListener(e, kick, { capture: true });
    return () => { for (const e of events) target.removeEventListener(e, kick, { capture: true }); };
  }

  /** Seconds from scheduling to hearing: what a sound's start offset makes up for. */
  get latency() { return (this.ctx.baseLatency ?? 0) + (this.ctx.outputLatency ?? 0); }
}
