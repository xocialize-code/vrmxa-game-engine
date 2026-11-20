// A scripted director model for demos, screenshots and tests (M3 W6, W10): the split turn's line and verdict from a few
// patterns, so a director can be tried with no model running (the playground's ?director=demo, the editor's, the
// headless MCP engine's VRMXG_DIRECTOR=demo).
import { scriptedModel } from './model.js';

export function demoModel({ latency = 40 } = {}) {
  const isVerdict = (req) => !req.tools.length && /Fill in this JSON object/.test(req.messages.at(-1).content);
  const said = (req) => (isVerdict(req) ? /said to [^:]+: "(.*)"/.exec(req.messages[0].content)?.[1] ?? '' : req.messages.at(-1).content ?? '');
  /** @type {[RegExp, (m: RegExpExecArray) => [string, any]][]} */
  const RULES = [
    [/\b(latte|coffee|cappuccino|espresso|tea|mocha)\b/i, (m) => [`One ${m[1].toLowerCase()}, coming right up!`, { emotion: 'happy', goal: { name: 'takeOrder', params: { customer: 'user', order: m[1].toLowerCase() } } }]],
    [/\b(bye|see you|good night)\b/i, () => ['See you soon! Take care.', { emotion: 'happy', gesture: 'greet' }]],
    [/\b(morning|hello|hi|hey)\b/i, () => ['Good morning! Lovely to see you.', { emotion: 'happy', gesture: 'greet' }]],
    [/\bhow are you|how's\b/i, () => ['Busy, but happy. The beans are fresh today.', { emotion: 'relaxed' }]],
  ];
  return scriptedModel((req) => {
    const text = said(req);
    let reply = ['Mm, tell me more.', { emotion: 'relaxed', gesture: 'nod' }];
    for (const [re, f] of RULES) { const m = re.exec(text); if (m) { reply = f(m); break; } }
    const [line, verdict] = reply;
    return { text: isVerdict(req) ? JSON.stringify(verdict) : line };
  }, { latency, name: 'demo' });
}

