// The render queue's model (M4 W5), with no UI: jobs that render a short, one at a time, through a runner. The queue
// owns order and state; the runner owns the rendering. M4 W5 ships two runners: the creator's, which exports through
// the editor's M2 path (the shell's AVAssetWriter, or frame hashes in a browser), and `stubRunner` here, which renders
// nothing. W10 (delivery export, AB-T-0582) fills the same interface with its formats: the delivery presets below (H.264,
// HEVC and ProRes 4444 with alpha at 1080p24 and 4K24, each with sound, an .srt, stills, thumbnails and a turntable), and
// per job the backend that draws it (the view's, or WebGL as a per-export choice) and the opt-in redraw check.

/** A job's states, in the order a job moves through them. */
export const JOB_STATES = Object.freeze(['queued', 'running', 'done', 'failed', 'cancelled']);

/** What a delivery preset adds to the film: a still and a thumbnail per shot, and a turntable per character. */
export const DELIVERY_EXTRAS = Object.freeze({ stills: true, thumbnails: true, turntable: true });

/**
 * Presets the queue offers. `fps: null` renders at the sequence's own rate. The delivery ones (M4 W10: `delivery: true`)
 * render at 24 fps with the extras; a job keeps the preset's values, so a later change to a preset doesn't change a
 * queued job.
 */
export const PRESETS = Object.freeze({
  draft: Object.freeze({ label: 'Draft 720p H.264', size: '720p', fps: null, codec: 'h264', audio: true, subtitles: true, extras: null }),
  review: Object.freeze({ label: 'Review 1080p H.264', size: '1080p', fps: null, codec: 'h264', audio: true, subtitles: true, extras: null }),
  master: Object.freeze({ label: 'Master 1080p ProRes 4444', size: '1080p', fps: null, codec: 'prores4444', audio: true, subtitles: true, extras: null }),
  ...Object.fromEntries([['h264', 'H.264'], ['hevc', 'HEVC'], ['prores4444', 'ProRes 4444 with alpha']].flatMap(([codec, name]) => [['1080p', '1080p24'], ['4k', '4K24']].map(([size, what]) => [
    `${codec === 'prores4444' ? 'prores' : codec}-${size}24`,
    Object.freeze({ label: `Delivery ${what} ${name}`, size, fps: 24, codec, audio: true, subtitles: true, extras: DELIVERY_EXTRAS, delivery: true }),
  ]))),
});

/** Backends a job can draw on: the view's (null), or one by name (WebGL export from a WebGPU view: the plan's risk table). */
export const JOB_BACKENDS = Object.freeze([null, 'webgpu', 'webgl']);

/**
 * What a runner is: `run(job, { progress, signal })` renders one job and resolves with its result (plain data: what
 * was written, frames, timings), or rejects. `progress(n, total, phase)` reports frames; `signal` aborts (a cancel).
 * @typedef {{ name: string, run: (job: Job, ctx: { progress: (n: number, total: number, phase?: string) => void, signal: AbortSignal }) => Promise<any> }} Runner
 *
 * @typedef {{ short: string, title?: string, ref: string, preset?: string, size: string, fps: number | null, codec: string,
 *   audio: boolean, subtitles: boolean, seconds?: number | null, name?: string | null,
 *   extras?: { stills?: boolean, thumbnails?: boolean, turntable?: boolean } | null, backend?: string | null, check?: 'redraw' | null }} JobSpec
 *   (extras: what a delivery adds to the film; backend: null for the view's; check: 'redraw' draws each frame twice, M4 W10)
 * @typedef {{ id: string, label: string, spec: JobSpec, state: string, progress: { n: number, total: number, phase: string },
 *   result: any, error: string | null, lateCancel?: boolean }} Job (lateCancel: cancelled after the runner could still stop)
 */

/** A runner that renders nothing (tests, a browser with no export, a queue W10 hasn't filled): it reports the frames it would draw. */
export const stubRunner = Object.freeze({
  name: 'stub',
  /** @param {Job} job */
  async run(job, { progress, signal }) {
    const fps = job.spec.fps ?? 24, total = Math.max(1, Math.round((job.spec.seconds ?? 1) * fps));
    for (const n of [0, Math.floor(total / 2), total]) {
      if (signal.aborted) throw new Error('cancelled');
      progress(n, total, 'stub');
      await Promise.resolve();
    }
    return { stub: true, frames: total, fps, size: job.spec.size, codec: job.spec.codec, note: 'nothing rendered: the stub runner (M4 W5) only counts frames; W10 fills the queue' };
  },
});

export class RenderQueue {
  /** @param {{ runner?: Runner, onChange?: (q: RenderQueue) => void }} [o] */
  constructor({ runner = stubRunner, onChange = null } = {}) {
    this.runner = runner; this.onChange = onChange;
    /** @type {Job[]} */ this.jobs = [];
    this._next = 1; this._abort = null; this._running = null;
  }

  changed() { this.onChange?.(this); }

  /**
   * Queue a short. `preset` fills size, fps, codec, audio and subtitles; explicit fields win.
   * @param {Partial<JobSpec> & { short: string, ref: string }} spec @returns {Job}
   */
  add(spec) {
    if (!spec?.short || !spec.ref) throw new Error('a render job needs the short and its sequence (short, ref)');
    const p = spec.preset ? PRESETS[spec.preset] : null;
    if (spec.preset && !p) throw new Error(`no preset ${spec.preset} (${Object.keys(PRESETS).join(', ')})`);
    const full = /** @type {JobSpec} */ ({ size: '1080p', fps: null, codec: 'h264', audio: true, subtitles: true, seconds: null, name: null, extras: null, backend: null, check: null, ...(p ? { size: p.size, fps: p.fps, codec: p.codec, audio: p.audio, subtitles: p.subtitles, extras: p.extras ? { ...p.extras } : null } : {}), ...spec });
    if (!JOB_BACKENDS.includes(full.backend ?? null)) throw new Error(`no backend ${full.backend} (webgpu, webgl, or null for the view's)`);
    if (full.check != null && full.check !== 'redraw') throw new Error(`check is 'redraw' or null, not ${full.check}`);
    const job = { id: `job-${this._next++}`, label: `${full.title ?? full.short} · ${p?.label ?? `${full.size} ${full.codec}`}${full.backend ? ` · ${full.backend === 'webgl' ? 'WebGL' : 'WebGPU'}` : ''}${full.check ? ' · checked' : ''}`, spec: full, state: 'queued', progress: { n: 0, total: 0, phase: '' }, result: null, error: null, lateCancel: false };
    this.jobs.push(job);
    this.changed();
    return job;
  }

  get(id) { return this.jobs.find((j) => j.id === id) ?? null; }

  /** Remove a job that isn't running. */
  remove(id) {
    const j = this.get(id);
    if (!j) return false;
    if (j.state === 'running') throw new Error(`${id} is rendering: cancel it first`);
    this.jobs = this.jobs.filter((x) => x !== j);
    this.changed();
    return true;
  }

  /** Move a queued job up (-1) or down (+1) among the queued ones. */
  move(id, delta) {
    const i = this.jobs.findIndex((j) => j.id === id);
    const j = this.jobs[i];
    if (!j || j.state !== 'queued') return false;
    const to = i + Math.sign(delta);
    if (to < 0 || to >= this.jobs.length || this.jobs[to].state !== 'queued') return false;
    [this.jobs[i], this.jobs[to]] = [this.jobs[to], this.jobs[i]];
    this.changed();
    return true;
  }

  /** Cancel a queued job, or abort the running one (the runner sees its signal). */
  cancel(id) {
    const j = this.get(id);
    if (!j || (j.state !== 'queued' && j.state !== 'running')) return false;
    if (j.state === 'running') this._abort?.abort();
    else { j.state = 'cancelled'; this.changed(); }
    return true;
  }

  /** Put a failed or cancelled job back in the queue. */
  retry(id) {
    const j = this.get(id);
    if (!j || (j.state !== 'failed' && j.state !== 'cancelled')) return false;
    Object.assign(j, { state: 'queued', progress: { n: 0, total: 0, phase: '' }, result: null, error: null, lateCancel: false });
    this.changed();
    return true;
  }

  get running() { return this.jobs.find((j) => j.state === 'running') ?? null; }

  /**
   * Render queued jobs in order, one at a time: every queued job, or only `only` (File › Export… renders the job it just
   * added, not the rest). Resolves when they're done. A run asked for while another runs waits for it, so two jobs never
   * render at once.
   * @param {{ only?: string | null }} [o]
   */
  run({ only = null } = {}) {
    const next = () => this.jobs.find((x) => x.state === 'queued' && (!only || x.id === only));
    const go = async () => { for (let j = next(); j; j = next()) await this._one(j); };
    const p = (this._running ?? Promise.resolve()).then(go);
    this._running = p;
    p.finally(() => { if (this._running === p) this._running = null; }).catch(() => {});
    return p;
  }

  async _one(job) {
    const abort = new AbortController();
    this._abort = abort;
    job.state = 'running'; job.error = null; this.changed();
    try {
      const progress = (n, total, phase = '') => { job.progress = { n, total, phase }; this.changed(); };
      job.result = await this.runner.run(structuredClone(job), { progress, signal: abort.signal });
      // the runner finished: its file is written, whatever came late. A cancel it couldn't act on any more is said, not hidden
      job.state = 'done';
      job.lateCancel = abort.signal.aborted;
    } catch (e) {
      // a cancel: the queue's own, or the runner's (the person closed the shell's save panel: ShellError 'cancelled')
      const cancelled = abort.signal.aborted || e?.code === 'cancelled';
      job.state = cancelled ? 'cancelled' : 'failed';
      job.error = cancelled ? null : String(e?.message ?? e);
    } finally { this._abort = null; this.changed(); }
  }

  /** Plain copies of the jobs, for a panel. */
  list() { return structuredClone(this.jobs); }
}
