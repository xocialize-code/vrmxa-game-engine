// Lines changed between two texts: added + removed lines by longest common subsequence (what a
// unified diff would show), not a positional comparison that counts every shifted line.
export function changedLines(a, b) {
  const x = a.split('\n'), y = b.split('\n');
  let lo = 0; while (lo < x.length && lo < y.length && x[lo] === y[lo]) lo++;
  let hx = x.length, hy = y.length; while (hx > lo && hy > lo && x[hx - 1] === y[hy - 1]) { hx--; hy--; }
  const X = x.slice(lo, hx), Y = y.slice(lo, hy);
  const dp = Array.from({ length: X.length + 1 }, () => new Uint32Array(Y.length + 1));
  for (let i = X.length - 1; i >= 0; i--) for (let j = Y.length - 1; j >= 0; j--) dp[i][j] = X[i] === Y[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1]);
  const lcs = dp[0][0];
  return { added: Y.length - lcs, removed: X.length - lcs, total: X.length + Y.length - 2 * lcs };
}
