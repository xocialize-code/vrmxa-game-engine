// AudioPlayer and AudioPlayer3D (Godot's AudioStreamPlayer / AudioStreamPlayer3D). What the simulation holds is only
// whether the player is playing and the step it started on; the clip's length (from its header) ends it on a step.
// So `started` and `finished` are simulation signals a scene can connect, and snapshots restore a sound mid-clip.
// What is heard is presentation: the audio service makes Web Audio match these states every frame (AB-D-0248).
import { Node } from '@vrmxg/core';

const DT = 1 / 60;

export class AudioPlayerNode extends Node {
  static actions = ['play', 'stop'];

  constructor(data, def) {
    super(data, def);
    this.playing = false;
    /** the step play() was called on */ this.startStep = 0;
  }

  get positional() { return false; }

  enterTree() {
    const audio = this.tree.services.get('audio');
    if (!audio) throw new Error(`${this.type} "${this.id}" needs the audio service (installAudio)`);
    this.ref = audio.library.refOf(this.id);
    this.clip = this.ref ? audio.library.clip(this.ref) : null;
    if (!this.clip) throw new Error(`${this.type} "${this.id}" has no clip: await audio.prepare(doc) before instantiate`);
  }

  ready() { if (this.props.autoplay) this.play(); }

  /** Start from the beginning (again, if already playing). */
  play() {
    this.playing = true;
    this.startStep = this.tree.clock.step;
    this.emit('started', {});
  }

  stop() { if (!this.playing) return; this.playing = false; this.emit('finished', { stopped: true }); }

  /** Seconds into the clip at a step (the step clock: exact, the same everywhere). */
  elapsedAt(step) { return (step - this.startStep) * DT; }

  physicsProcess() {
    if (!this.playing || this.props.loop) return;
    // the step on which the clip's end has passed: (step + 1 - start) steps have been heard by the end of this one
    if ((this.tree.clock.step + 1 - this.startStep) * DT >= this.clip.duration) { this.playing = false; this.emit('finished', { stopped: false }); }
  }

  getState() { return { playing: this.playing, startStep: this.startStep }; }
  setState(s) { this.playing = s.playing; this.startStep = s.startStep; }
}

export class AudioPlayer3DNode extends AudioPlayerNode {
  get positional() { return true; }
}
