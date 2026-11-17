# @vrmxg/dmath

Portable transcendental `Math` for VRMXG's deterministic simulation. `Math.sin`, `cos`, `tan`, `asin`, `acos`, `atan`,
`atan2`, `exp`, `log`, `pow`, `cbrt` and `hypot` round differently between V8 builds and JavaScriptCore (AB-L-0345).
These versions are built only from `+ - * /`, `Math.sqrt` and typed-array bit tricks, so they return the same bits in
every engine. They are ports of FreeBSD msun (fdlibm); `hypot` follows V8's own algorithm. fdlibm's licence notice is
in [src/index.js](src/index.js) and must stay with the code.

It replaces the two spike copies (`spike-determinism/web/src/char/dmath.js`, `spike-particles/web/src/core/detmath.js`;
AB-T-0500). Both of those files are now re-exports of this package.

## Use

```js
import { installPortableMath, withPortableMath, sin, native } from '@vrmxg/dmath';

installPortableMath();               // engine boot, before any VRM, clip or effect is parsed
withPortableMath(() => system.update(dt)); // or: only for the duration of one step (nesting-safe)
sin(1);                              // or call the functions directly
native.sin(1);                       // the engine's own, captured when the module loaded
```

- Import it before anything else patches `Math`: `native` is captured at module load.
- It does not seed `Math.random`; the caller owns the RNG.
- **The module's version is part of a replay's identity.** A shot recorded with one version replays bit for bit only
  with the same version. When the particle spike moved from `detmath.js` to this module, its portable-math hashes
  changed (they stayed identical across runtimes). Record the `dmath` version in saved shots and snapshots, and treat
  a version bump as a replay-breaking change.
- Not covered, so still engine-dependent: `sinh`, `cosh`, `tanh`, `asinh`, `acosh`, `atanh`, `expm1`, `log1p`, `log2`,
  `log10`. None is called inside a simulation step by three r187, three-vrm 3.5.5, postprocessing 6.39 or navcat 0.4
  (counted 2026-11-17). Add one here, with tests, before simulation code uses it.
- Trig arguments above about 1.6e6 (2^20·π/2) use a three-step Cody–Waite reduction, not Payne–Hanek: still
  deterministic, but less accurate.

## Test

```bash
npm test                                   # node --test: accuracy, edge cases, golden digests, install/swap
node scripts/stage-browser.mjs build/browser   # a static folder with test/browser/index.html as the page
PLAYWRIGHT_FROM=../../../spike-determinism/web/node_modules node scripts/chromium.mjs build/browser
```

`test/golden.json` holds an FNV-1a digest of every function's output bits over the seeded inputs and edge cases in
[test/cases.js](test/cases.js). Every runtime must reproduce it. Regenerate it (`npm run golden`) only when
`src/index.js` changes on purpose, and treat that as a replay-breaking change.

## Results (2026-11-17, M5 Max, macOS 27.3; receipt AB-R-0931)

**The module is identical everywhere.** All twelve golden digests are reproduced in Node 26.12.1 (V8 14.6), headless
Chromium 156 and WKWebView (macOS 27.3 JSC, custom scheme and loopback).

**Accuracy** (2,000 seeded inputs per function plus edge cases; `results/module-*.json`):

| Reference | Result |
|---|---|
| Correctly rounded (60-digit `decimal`) | tan, sin, pow: within 1 ulp on every input. hypot: within 1 ulp except 1 input at 2 ulp, which is V8's algorithm |
| Node's native (V8) | within 1 ulp everywhere (cbrt and hypot exact); 100,000-input stress run also ≤ 1 ulp |
| Chromium's native | within 1 ulp everywhere |
| WKWebView's native (JSC) | within 1 ulp except tan (26 inputs at 2 ulp) and hypot (3 at 2 ulp), where JSC is the less accurate side, and `pow(10, 308)`, where JSC is 3 ulp off and this module is correctly rounded |
| Edge cases (NaN, ±0, ±∞, thresholds) | identical to native in every runtime (`Object.is`), apart from JSC's `pow(10, 308)` |

**Both spike suites, re-run on this module** (`results/`):

- Characters (`determinism-compare.md`): in `dmath` mode, all 4 models × 4 scenarios × 600 steps × 4 state components
  are identical in Node, Chromium and WKWebView (scheme and loopback). The hashes are also identical to the original
  spike's `dmath` runs: for characters the merge changed nothing.
- Particles (`particles-summary.md`): every portable-math variant (three.quarks, three-nebula, the stateless twin,
  three.proton.js) is identical in Node, Chromium and WKWebView (scheme and loopback). Chromium is new coverage; the
  spike had only run Node and WKWebView. The hashes differ from the `detmath.js` era, as expected.
- Cost in WKWebView (loopback): three.quarks 10 × 1k with portable maths 0.75 ms per step, against 0.78 ms native in
  the same run; three-nebula 1.07 ms against 2.23 ms native.
