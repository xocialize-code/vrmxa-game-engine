// The LanguageModel adapter (M3 W0, research/npc-ai.md §4.5): the engine asks a model through this, never MLXEngine or
// an HTTP API directly. A model is { name, respond(request) → Promise<reply> }:
//   request { messages: [{ role, content }], tools: [{ name, description, parameters }], maxTokens, priority }
//   reply   { text?, toolCalls: [{ name, arguments }], model }   (arguments: an object, or the JSON text of one)
// Backends:
//   shellModel(native)   the Mac shell's bridge: native.call('llm.respond', request) (MLXEngine in the shell's voice
//                        product, apps/shell/Voice: Qwen3.5-4B 4-bit until LFM3-Omni-2B has a Swift package; no tools,
//                        so the split turn; the verdict's `json: true` is grammar-constrained there)
//   httpModel(url)       an OpenAI-compatible chat-completions endpoint on loopback (the stand-in for browsers)
//   scriptedModel(fn)    replies from a function or a list, after `latency` steps: every test and acceptance check
//   replayModel()        never called: in replay the decisions come from the ai service's log

/** The Mac shell's bridge (window.vrmxgNative or the shell's `native` object). */
export function shellModel(native, { name = 'shell' } = {}) {
  return { name, async respond(request) { return normalise(await native.call('llm.respond', request), name); } };
}

/**
 * An OpenAI-compatible chat-completions endpoint (mlx-lm's server, the loopback stand-in): POST { model, messages,
 * tools, max_tokens } → choices[0].message { content, tool_calls }.
 */
export function httpModel(url, { model = 'default', fetch: f = globalThis.fetch, temperature = 0.6 } = {}) {
  return {
    name: `http ${model}`,
    async respond(request) {
      const body = {
        model, messages: request.messages, max_tokens: request.maxTokens ?? 200, temperature,
        tools: request.tools.map((t) => ({ type: 'function', function: { name: t.name, description: t.description, parameters: t.parameters } })),
      };
      const r = await f(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
      if (!r.ok) throw new Error(`${url}: ${r.status} ${await r.text()}`);
      const j = await r.json(), m = j.choices?.[0]?.message ?? {};
      return normalise({ text: m.content ?? null, toolCalls: (m.tool_calls ?? []).map((c) => ({ name: c.function?.name, arguments: c.function?.arguments })), model: j.model ?? model }, `http ${model}`);
    },
  };
}

/**
 * Replies from a script: a function (request, n) → reply (n counts requests from 0), or a list taken in order. Each reply
 * arrives `latency` steps after it is asked (the director's pump releases it), so a test's timing is exact.
 * A reply of { throws: 'message' } fails the request; { never: true } never answers (a timeout).
 * @param {((request: any, n: number) => any) | any[]} script
 * @param {{ latency?: number, name?: string }} [opts]
 */
export function scriptedModel(script, { latency = 30, name = 'scripted' } = {}) {
  let n = 0;
  return {
    name, latency,
    /** @param {any} request @param {{ untilStep?: (steps: number) => Promise<void> }} [ctx] */
    async respond(request, ctx = {}) {
      const r = typeof script === 'function' ? script(request, n++) : script[n++];
      if (ctx.untilStep) await ctx.untilStep(latency);
      if (r?.never) return new Promise(() => {});
      if (r?.throws) throw new Error(r.throws);
      return normalise(r ?? { toolCalls: [] }, name);
    },
  };
}

/** A model for replay: asking it is a mistake (decisions come from the log). */
export function replayModel() {
  return { name: 'replay', replay: true, async respond() { throw new Error('replay: the model is never asked; decisions come from the log'); } };
}

function normalise(r, name) {
  return { text: typeof r?.text === 'string' && r.text.trim() ? r.text : null, toolCalls: Array.isArray(r?.toolCalls) ? r.toolCalls : [], model: r?.model ?? name };
}
