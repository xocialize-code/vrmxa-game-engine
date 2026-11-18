// Baking lines (M2 W10): text-only dialogue becomes clips with word timings, so a shot replays and exports with the
// voice it was cut to. bakePlan() lists what a sequence still speaks from text; a TTS tool makes each clip and its
// timings file (content/sample/tools/make-voice.py reads voice/lines.json); applyBake() points the dialogue at them.
// tools/bake-lines.mjs runs the three in order.

/**
 * The text-only dialogue lines of a sequence (and of `say` connections), each with the clip it will be baked to.
 * @param {any} doc a .vrmxs document
 * @param {{ voices?: Record<string, string>, voice?: string, dir?: string }} [opts] voices: speaker id → TTS voice
 * @returns {{ id: string, text: string, voice: string, clip: string, speaker: string, where: string }[]}
 */
export function bakePlan(doc, { voices = {}, voice = 'af_heart', dir = 'voice' } = {}) {
  const out = [];
  const slug = (s) => String(s).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  const base = slug(doc.id ?? 'scene');
  for (const t of doc.sequence?.tracks ?? []) {
    if (t.type !== 'dialogue') continue;
    (t.clips ?? []).forEach((c, i) => {
      if (c.clip || !c.text) return;
      const id = `${base}-${slug(t.id)}-${i + 1}`;
      out.push({ id, text: c.text, voice: voices[t.target] ?? voice, clip: `${dir}/${id}.wav`, speaker: t.target, where: `tracks.${t.id}.clips[${i}]` });
    });
  }
  (doc.connections ?? []).forEach((c, i) => {
    if (c.call !== 'say' || c.args?.clip || !c.args?.text) return;
    const id = `${base}-say-${slug(c.to)}-${i + 1}`;
    out.push({ id, text: c.args.text, voice: voices[c.to] ?? voice, clip: `${dir}/${id}.wav`, speaker: c.to, where: `connections[${i}]` });
  });
  return out;
}

/** The document with each planned line pointing at its baked clip (the text stays, as the caption). */
export function applyBake(doc, plan) {
  const d = structuredClone(doc);
  for (const p of plan) {
    const m = /^tracks\.(.+)\.clips\[(\d+)\]$/.exec(p.where);
    if (m) { const t = d.sequence.tracks.find((x) => x.id === m[1]); if (t?.clips?.[+m[2]]) t.clips[+m[2]].clip = p.clip; continue; }
    const c = /^connections\[(\d+)\]$/.exec(p.where);
    if (c && d.connections?.[+c[1]]) d.connections[+c[1]].args.clip = p.clip;
  }
  return d;
}
