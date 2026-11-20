// M3 W3 (AB-T-0542): talking to the character with your voice, and the measured spoken turn.
//
// Listening, with a director (?director=shell or a loopback URL):
//   ?listen=page (the default) the page's microphone (getUserMedia, with the browser's echo cancellation) → EnergyVAD →
//                speech to text: the shell's stt.transcribe in the Mac app, else ?stt=<loopback url> (voice-server.py)
//   ?listen=shell the shell's own microphone (stt.listen: VoiceChatKit's capture, VAD and live STT; no echo
//                cancellation, so headphones)
// The measured turn (?measure=voice, in the Mac app with ?director=shell&tts=shell): each turn the person's line is
// synthesised (tts.speak, another voice) and fed through the page's detector as a live microphone would deliver it
// (wavFrames); then the real path: stt.transcribe → director.talk → the line (llm.respond) → tts.speak → heard on a step.
// Measured: the detector's end → first audio (and from the recording's last sample, which adds the detector's wait).
// The first turn is a warm-up and left out. The results go to window.__voiceMeasure, the console and file.save.
import { microphone, listenTo, shellListen, shellSTT, httpSTT, shellTTS, wavFrames, EnergyVAD } from '@vrmxg/voice';

const b64bytes = (s) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));

export class Listening {
  /** @param {any} pg the Playground @param {{ inShell: boolean, call: any, on: any, params: URLSearchParams }} o */
  constructor(pg, { inShell, call, on, params }) {
    this.pg = pg; this.native = { call, on };
    this.mode = params.get('listen') ?? (inShell ? 'shell' : 'page'); // WKWebView's getUserMedia delivers no frames (AB-T-0542): native in the app
    this.stt = inShell ? shellSTT({ call }) : params.get('stt') ? httpSTT(params.get('stt')) : null;
    this.available = this.mode === 'shell' ? inShell : !!this.stt && !!globalThis.navigator?.mediaDevices?.getUserMedia;
    this.active = false; this.heard = ''; this.stopFn = null; this.error = ''; this.frames = 0; this.level = 0; this.state = '';
    this.onSay = (t) => { this.heard = t.text; pg._changed(); };
    this.onError = (e) => { this.error = String(e?.message ?? e); console.warn(`[voice] ${this.error}`); pg._changed(); };
  }

  /** A line for the UI: what the microphone is doing. */
  get status() {
    if (this.error) return `mic: ${this.error}`;
    if (!this.active) return this.heard ? `heard: ${this.heard}` : '';
    const ctx = this.stopFn?.context, track = this.stopFn?.stream?.getAudioTracks?.()[0];
    return `${this.state || 'listening'}${this.mode === 'page' ? ` · ${this.frames} frames · level ${this.level.toFixed(3)} · audio ${ctx?.state ?? '?'} ${ctx?.sampleRate ?? ''} Hz · track ${track ? `${track.readyState}${track.muted ? ' muted' : ''} ${track.label}` : 'none'}` : ''}${this.heard ? ` · heard: ${this.heard}` : ''}`;
  }

  async start() {
    const { director, talkTo } = this.pg;
    if (!director || this.active) return;
    this.error = ''; this.frames = 0;
    try {
      if (this.mode === 'shell') {
        const l = shellListen({ native: this.native, director, agent: talkTo, onTranscript: this.onSay, onError: this.onError, onEvent: (e) => { this.state = e.type; this.pg._changed(); } });
        await l.start();
        this.stopFn = () => l.stop();
      } else {
        const dir = { speaking: (a, on) => { this.state = on ? 'hearing you' : 'transcribing'; director.speaking(a, on); this.pg._changed(); }, talk: (a, t) => { this.state = 'listening'; director.talk(a, t); } };
        const l = listenTo({ director: dir, agent: talkTo, stt: this.stt, onTranscript: this.onSay, onError: this.onError });
        this.stopFn = await microphone((f) => {
          this.frames++;
          let e = 0; for (let i = 0; i < f.length; i++) e += f[i] * f[i];
          this.level = Math.sqrt(e / f.length);
          if (this.frames % 25 === 0) this.pg._changed();
          l.feed(f);
        });
      }
      this.active = true;
    } catch (e) { this.onError(e); throw e; }
  }

  async stop() { const s = this.stopFn; this.stopFn = null; this.active = false; await s?.(); }
}

const LINES = [
  'Good morning, Hana!',
  'Could I get a latte, please?',
  'How long have you been running this place?',
  'What do you recommend today?',
  'Is it always this quiet in the morning?',
  'Can I sit by the window?',
  'That smells amazing.',
  'Do you have anything without milk?',
  'Thanks, you are the best.',
  'What music is this?',
  'I should get going. See you tomorrow!',
];

const median = (xs) => { const s = [...xs].sort((a, b) => a - b), n = s.length; return n ? (n % 2 ? s[(n - 1) / 2] : (s[n / 2 - 1] + s[n / 2]) / 2) : null; };
const stats = (xs) => ({ median: median(xs), max: xs.length ? Math.max(...xs) : null, mean: xs.length ? Math.round((xs.reduce((a, b) => a + b, 0) / xs.length) * 10) / 10 : null });
const r1 = (x) => (x == null ? null : Math.round(x * 10) / 10);

/**
 * Spoken turns through the shell, end to end in the page. @param {any} pg @param {{ call: any, turns?: number }} o
 */
export async function measureVoiceTurns(pg, { call, turns = LINES.length }) {
  const now = () => performance.now(), wait = (ms) => new Promise((r) => setTimeout(r, ms));
  const agent = pg.talkTo, director = pg.director, tree = pg.tree, voice = tree.services.get('voice');
  if (!director) throw new Error('measure=voice needs ?director=shell');
  const status = await call('voice.status');
  if (!status.models) await call('voice.chooseModels');
  const t0 = now();
  const prep = await call('voice.prepare');
  const prepareMs = now() - t0;
  let heard = null;
  voice.useLive(shellTTS({ call }), { voices: { [agent]: 'af_heart' }, now, onHeard: (h) => { if (h.id === agent && !heard) heard = h; } });
  if (!pg.playing) pg.play();
  // every model call, timed: which part (line or verdict), when it was sent and how long it took
  const calls = [], model = director.model;
  director.model = { ...model, respond: async (req, o) => {
    const c = { part: req.json ? 'verdict' : 'line', sent: now(), ms: null };
    calls.push(c);
    try { return await model.respond(req, o); } finally { c.ms = now() - c.sent; }
  } };

  const rows = [];
  for (let i = 0; i < turns; i++) {
    const said = LINES[i % LINES.length];
    const person = await call('tts.speak', { text: said, voice: 'am_michael' }); // the person (not timed)
    heard = null;
    let vadEnd = null, recordingEnd = null, talkedAt = null, text = null, sttMs = null;
    const firstCall = calls.length;
    const dir = {
      speaking: (a, on) => { if (!on) vadEnd ??= now(); director.speaking(a, on); },
      talk: (a, t) => { talkedAt = now(); text = t; director.talk(a, t); },
    };
    const l = listenTo({ director: dir, agent, stt: shellSTT({ call }), vad: new EnergyVAD(), onTranscript: (t) => { sttMs = t.ms; } });
    const feed = wavFrames(b64bytes(person.wav), (f) => l.feed(f), { now, tick: (fn) => setInterval(fn, 5), untick: (h) => clearInterval(h), onSpeechEnd: (t) => { recordingEnd = t; } });
    await feed.done;
    const deadline = now() + 20000;
    while (!heard && now() < deadline) await wait(10);
    const h = heard;
    rows.push({
      said, heard: text, line: h?.text ?? null,
      sttMs: r1(sttMs), sttRoundTripMs: r1(talkedAt && vadEnd ? talkedAt - vadEnd : null),
      talkToAudioMs: r1(h && talkedAt ? h.at - talkedAt : null), ttsMs: r1(h?.ms ?? null),
      firstAudioMs: r1(h && vadEnd ? h.at - vadEnd : null), fromSpeechEndMs: r1(h && vadEnd ? h.at - vadEnd + 450 : null),
      fromRecordingEndMs: r1(h && recordingEnd ? h.at - recordingEnd : null),
      calls: calls.slice(firstCall).map((c) => ({ part: c.part, afterTalkMs: r1(talkedAt ? c.sent - talkedAt : null), ms: r1(c.ms) })),
    });
    console.log(`[voice-measure] ${i}: ${JSON.stringify(rows.at(-1))}`);
    // let her finish the line (and the verdict land) before the next turn
    const until = now() + 15000;
    while (voice.lines.get(agent) && now() < until) await wait(50);
    while (calls.some((c) => c.ms === null) && now() < until) await wait(50); // the verdict, too
    await wait(600);
  }
  const steady = rows.slice(1).filter((r) => r.firstAudioMs != null);
  const result = {
    when: new Date().toISOString(), where: 'VRMXG Playground (Mac app, shell voice product)', ua: navigator.userAgent,
    models: status.backends, modelsFolder: prep.models, prepareMs: r1(prepareMs),
    turns: rows.length, heardAll: rows.every((r) => r.line), vadEndMs: 450,
    steady: {
      firstAudioMs: stats(steady.map((r) => r.firstAudioMs)), fromSpeechEndMs: stats(steady.map((r) => r.fromSpeechEndMs)),
      sttMs: stats(steady.map((r) => r.sttMs)), talkToAudioMs: stats(steady.map((r) => r.talkToAudioMs)), ttsMs: stats(steady.map((r) => r.ttsMs)),
    },
    lineMs: stats(rows.slice(1).flatMap((r) => r.calls.filter((c) => c.part === 'line').map((c) => c.ms))),
    verdictMs: stats(rows.slice(1).flatMap((r) => r.calls.filter((c) => c.part === 'verdict').map((c) => c.ms))),
    note: 'firstAudioMs: the detector\'s end of speech → her line heard (STT round trip + director line via llm.respond + tts.speak + the step it starts on); fromSpeechEndMs adds the detector\'s 450 ms wait (EnergyVAD endMs). fromRecordingEndMs is from the synthesised clip\'s last sample, which includes its trailing silence. The first turn is a warm-up, left out.',
    rows,
  };
  window.__voiceMeasure = result;
  console.log(`[voice-measure] done ${JSON.stringify(result.steady)}`);
  try { await call('file.save', { text: JSON.stringify(result, null, 1) + '\n', suggestedName: 'voice-turns.json' }); } catch (e) { console.warn(`[voice-measure] save: ${e.message}`); }
  return result;
}
