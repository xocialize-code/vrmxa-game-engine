export const now = () => (globalThis.performance ? performance.now() : Date.now());
export function stats(samples) {
  const s = [...samples].sort((a, b) => a - b);
  const mean = s.reduce((a, b) => a + b, 0) / (s.length || 1);
  const p = (q) => s[Math.min(s.length - 1, Math.floor(q * s.length))];
  const r = (x) => Math.round(x * 1000) / 1000;
  return { mean: r(mean), p50: r(p(0.5)), p95: r(p(0.95)), max: r(s[s.length - 1]), n: s.length };
}
