// @vrmxg/dmath: portable transcendental functions for VRMXG's deterministic simulation.
//
// ECMAScript leaves Math.sin, cos, tan, asin, acos, atan, atan2, exp, log, pow, cbrt and hypot
// "implementation-approximated", and V8 builds and JavaScriptCore round them differently on
// 3–40% of inputs (≤1–2 ulp; AB-L-0345). +, -, *, / and Math.sqrt are correctly rounded
// everywhere and JS never fuses a multiply-add, so functions built only from those, plus bit
// tricks through typed arrays, return the same bits in every engine.
//
// Sources (FreeBSD msun, fdlibm lineage): k_sin, k_cos, k_tan, the medium-argument path of
// e_rem_pio2, s_atan, e_atan2, e_asin, e_acos, e_exp, e_log, e_pow, s_cbrt. hypot follows V8's
// MathHypot (scaled Kahan sum), so it also matches V8 bit for bit. Accuracy is that of the C
// originals, about 1 ulp. Simplification: trig arguments above about 2^20·π/2 (1.6e6) use the
// same three-step Cody–Waite reduction instead of Payne–Hanek, so they stay deterministic but
// lose accuracy; nothing in a scene gets near that.
//
// Merged on 2026-11-17 (AB-T-0500) from spike-determinism's dmath.js (trig) and
// spike-particles' detmath.js (exp/log/pow/cbrt/hypot and the scoped swap), with exp, log and
// pow re-ported faithfully from msun and tan given its own kernel.
//
//   installPortableMath()      replace the twelve Math functions for the whole realm (engine boot)
//   uninstallPortableMath()    put the native ones back
//   withPortableMath(fn)       swap them in for the duration of fn (nesting-safe), return fn()
//   sin, cos, …, hypot         the functions themselves, for code that imports them directly
//
// Not covered, so still engine-dependent: sinh, cosh, tanh, asinh, acosh, atanh, expm1, log1p,
// log2, log10 (none is called by three r187, three-vrm 3.5.5, postprocessing 6.39 or navcat
// 0.4 inside a simulation step). Math.random is not this module's business: the caller seeds it.
//
// Licence of the originals (fdlibm, via FreeBSD msun), which must be kept with this port:
//
//   Copyright (C) 1993 by Sun Microsystems, Inc. All rights reserved.
//
//   Developed at SunPro, a Sun Microsystems, Inc. business.
//   Permission to use, copy, modify, and distribute this
//   software is freely granted, provided that this notice
//   is preserved.
//
// Copyright (C) 2004 by Sun Microsystems, Inc. All rights reserved. (e_exp.c)
//   Permission to use, copy, modify, and distribute this
//   software is freely granted, provided that this notice
//   is preserved.

const sqrt = Math.sqrt;

// ---------------------------------------------------------------- words
// Little-endian: u32[0] is the low word, u32[1] the high word.
const f64 = new Float64Array(1);
const u32 = new Uint32Array(f64.buffer);
const hiWord = (x) => { f64[0] = x; return u32[1] | 0; }; // signed, like C's int32_t
const loWord = (x) => { f64[0] = x; return u32[0]; };      // unsigned
const clearLow = (x) => { f64[0] = x; u32[0] = 0; return f64[0]; };
const withHigh = (x, hi) => { f64[0] = x; u32[1] = hi; return f64[0]; };
const fromWords = (hi, lo) => { u32[1] = hi; u32[0] = lo; return f64[0]; };
function pow2(k) { // exact 2^k for an integer k in [-1074, 1023]
  if (k >= -1022) return fromWords((k + 1023) << 20, 0);
  return fromWords(0x00100000, 0) * fromWords((k + 1022 + 1023) << 20, 0);
}

// ---------------------------------------------------------------- sin / cos / tan kernels

const S1 = -1.66666666666666324348e-01, S2 = 8.33333333332248946124e-03, S3 = -1.98412698298579493134e-04,
  S4 = 2.75573137070700676789e-06, S5 = -2.50507602534068634195e-08, S6 = 1.58969099521155010221e-10;
function ksin(x, y, iy) {
  const z = x * x, w = z * z;
  const r = S2 + z * (S3 + z * S4) + z * w * (S5 + z * S6);
  const v = z * x;
  if (iy === 0) return x + v * (S1 + z * r);
  return x - ((z * (0.5 * y - v * r) - y) - v * S1);
}

const C1 = 4.16666666666666019037e-02, C2 = -1.38888888888741095749e-03, C3 = 2.48015872894767294178e-05,
  C4 = -2.75573143513906633035e-07, C5 = 2.08757232129817482790e-09, C6 = -1.13596475577881948265e-11;
function kcos(x, y) {
  const z = x * x, w = z * z;
  const r = z * (C1 + z * (C2 + z * C3)) + w * w * (C4 + z * (C5 + z * C6));
  const hz = 0.5 * z;
  const ww = 1.0 - hz;
  return ww + (((1.0 - ww) - hz) + (z * r - x * y));
}

const T = [
  3.33333333333334091986e-01, 1.33333333333201242699e-01, 5.39682539762260521377e-02,
  2.18694882948595424599e-02, 8.86323982359930005737e-03, 3.59207910759131235356e-03,
  1.45620945432529025516e-03, 5.88041240820264096874e-04, 2.46463134818469906812e-04,
  7.81794442939557092300e-05, 7.14072491382608190305e-05, -1.85586374855275456654e-05,
  2.59073051863633712884e-05,
];
const PIO4 = 7.85398163397448278999e-01, PIO4LO = 3.06161699786838301793e-17;
function ktan(x, y, iy) { // iy = 1: tan, iy = -1: -1/tan
  const hx = hiWord(x), ix = hx & 0x7fffffff;
  const big = ix >= 0x3FE59428; // |x| >= 0.6744
  if (big) {
    if (hx < 0) { x = -x; y = -y; }
    x = (PIO4 - x) + (PIO4LO - y);
    y = 0.0;
  }
  let z = x * x, w = z * z;
  let r = T[1] + w * (T[3] + w * (T[5] + w * (T[7] + w * (T[9] + w * T[11]))));
  let v = z * (T[2] + w * (T[4] + w * (T[6] + w * (T[8] + w * (T[10] + w * T[12])))));
  let s = z * x;
  r = y + z * (s * (r + v) + y);
  r += T[0] * s;
  w = x + r;
  if (big) {
    v = iy;
    return (1 - ((hx >> 30) & 2)) * (v - 2.0 * (x - (w * w / (w + v) - r)));
  }
  if (iy === 1) return w;
  z = clearLow(w);
  v = r - (z - x);
  const a = -1.0 / w;
  const t = clearLow(a);
  s = 1.0 + t * z;
  return t + a * (s + t * v);
}

// ---------------------------------------------------------------- argument reduction

const invpio2 = 6.36619772367581382433e-01;
const pio2_1 = 1.57079632673412561417e+00, pio2_1t = 6.07710050650619224932e-11;
const pio2_2 = 6.07710050630396597660e-11, pio2_2t = 2.02226624879595063154e-21;
const pio2_3 = 2.02226624871116645580e-21, pio2_3t = 8.47842766036889956997e-32;
const TOINT = 6755399441055744; // 1.5 * 2^52: x + TOINT - TOINT rounds to the nearest integer

// Returns the quadrant n and writes the reduced argument as red[0] + red[1].
const red = [0, 0];
function remPio2(x) {
  const fn = (x * invpio2 + TOINT) - TOINT;
  const n = fn | 0;
  let r = x - fn * pio2_1;
  let w = fn * pio2_1t;
  let y0 = r - w;
  const j = (hiWord(x) >>> 20) & 0x7ff;
  let i = j - ((hiWord(y0) >>> 20) & 0x7ff);
  if (i > 16) { // second iteration, good to 118 bits
    let t = r;
    w = fn * pio2_2;
    r = t - w;
    w = fn * pio2_2t - ((t - r) - w);
    y0 = r - w;
    i = j - ((hiWord(y0) >>> 20) & 0x7ff);
    if (i > 49) { // third iteration, 151 bits
      t = r;
      w = fn * pio2_3;
      r = t - w;
      w = fn * pio2_3t - ((t - r) - w);
      y0 = r - w;
    }
  }
  red[0] = y0;
  red[1] = (r - y0) - w;
  return n;
}

const TINY_TRIG = 7.450580596923828e-9; // 2^-27

export function sin(x) {
  if (x !== x || x === Infinity || x === -Infinity) return NaN;
  if (x <= PIO4 && x >= -PIO4) return (x < TINY_TRIG && x > -TINY_TRIG) ? x : ksin(x, 0, 0);
  const n = remPio2(x);
  switch (n & 3) {
    case 0: return ksin(red[0], red[1], 1);
    case 1: return kcos(red[0], red[1]);
    case 2: return -ksin(red[0], red[1], 1);
    default: return -kcos(red[0], red[1]);
  }
}

export function cos(x) {
  if (x !== x || x === Infinity || x === -Infinity) return NaN;
  if (x <= PIO4 && x >= -PIO4) return (x < TINY_TRIG && x > -TINY_TRIG) ? 1 : kcos(x, 0);
  const n = remPio2(x);
  switch (n & 3) {
    case 0: return kcos(red[0], red[1]);
    case 1: return -ksin(red[0], red[1], 1);
    case 2: return -kcos(red[0], red[1]);
    default: return ksin(red[0], red[1], 1);
  }
}

export function tan(x) {
  if (x !== x || x === Infinity || x === -Infinity) return NaN;
  if (x <= PIO4 && x >= -PIO4) return (x < TINY_TRIG && x > -TINY_TRIG) ? x : ktan(x, 0, 1);
  const n = remPio2(x);
  return ktan(red[0], red[1], 1 - ((n & 1) << 1));
}

// ---------------------------------------------------------------- atan / atan2

const atanhi = [4.63647609000806093515e-01, 7.85398163397448278999e-01, 9.82793723247329054082e-01, 1.57079632679489655800e+00];
const atanlo = [2.26987774529616870924e-17, 3.06161699786838301793e-17, 1.39033110312309984516e-17, 6.12323399573676603587e-17];
const aT0 = 3.33333333333329318027e-01, aT1 = -1.99999999998764832476e-01, aT2 = 1.42857142725034663711e-01,
  aT3 = -1.11111104054623557880e-01, aT4 = 9.09088713343650656196e-02, aT5 = -7.69187620504482999495e-02,
  aT6 = 6.66107313738753120669e-02, aT7 = -5.83357013379057348645e-02, aT8 = 4.97687799461593236017e-02,
  aT9 = -3.65315727442169155270e-02, aT10 = 1.62858201153657823623e-02;

export function atan(x) {
  if (x !== x) return NaN;
  let ax = x < 0 ? -x : x;
  if (ax >= 7.378697629483821e19) return x > 0 ? atanhi[3] + atanlo[3] : -atanhi[3] - atanlo[3]; // 2^66
  let id;
  if (ax < 0.4375) {
    if (ax < 3.725290298461914e-9) return x; // 2^-28
    id = -1;
  } else if (ax < 1.1875) {
    if (ax < 0.6875) { id = 0; ax = (2.0 * ax - 1.0) / (2.0 + ax); } else { id = 1; ax = (ax - 1.0) / (ax + 1.0); }
  } else if (ax < 2.4375) { id = 2; ax = (ax - 1.5) / (1.0 + 1.5 * ax); } else { id = 3; ax = -1.0 / ax; }
  const v = id < 0 ? x : ax;
  const z = v * v, w = z * z;
  const s1 = z * (aT0 + w * (aT2 + w * (aT4 + w * (aT6 + w * (aT8 + w * aT10)))));
  const s2 = w * (aT1 + w * (aT3 + w * (aT5 + w * (aT7 + w * aT9))));
  if (id < 0) return x - x * (s1 + s2);
  const r = atanhi[id] - ((ax * (s1 + s2) - atanlo[id]) - ax);
  return x < 0 ? -r : r;
}

const PI = 3.1415926535897931160e+00, PI_LO = 1.2246467991473531772e-16, PIO2 = 1.57079632679489655800e+00;

export function atan2(y, x) {
  if (x !== x || y !== y) return NaN;
  if (x === 1) return atan(y);
  const xneg = x < 0 || (x === 0 && 1 / x < 0);
  if (y === 0) return xneg ? (1 / y < 0 ? -PI : PI) : y; // keeps the sign of zero
  if (x === 0) return y > 0 ? PIO2 : -PIO2;
  if (x === Infinity || x === -Infinity) {
    if (y === Infinity || y === -Infinity) {
      const q = x > 0 ? PI / 4 : 3 * PI / 4;
      return y > 0 ? q : -q;
    }
    return x > 0 ? (y > 0 ? 0 : -0) : (y > 0 ? PI : -PI);
  }
  if (y === Infinity || y === -Infinity) return y > 0 ? PIO2 : -PIO2;
  const ay = y < 0 ? -y : y, ax = x < 0 ? -x : x;
  const ex = (hiWord(ax) >>> 20) & 0x7ff, ey = (hiWord(ay) >>> 20) & 0x7ff;
  let z;
  if (ey - ex > 60) z = PIO2 + 0.5 * PI_LO; // |y/x| > 2^60
  else if (x < 0 && ey - ex < -60) z = 0;   // |y|/x < -2^-60
  else z = atan(ay / ax);
  if (!xneg) return y < 0 ? -z : z;
  return y < 0 ? (z - PI_LO) - PI : PI - (z - PI_LO);
}

// ---------------------------------------------------------------- asin / acos

const pio2_hi = 1.57079632679489655800e+00, pio2_lo = 6.12323399573676603587e-17, pio4_hi = 7.85398163397448278999e-01;
const pS0 = 1.66666666666666657415e-01, pS1 = -3.25565818622400915405e-01, pS2 = 2.01212532134862925881e-01,
  pS3 = -4.00555345006794114027e-02, pS4 = 7.91534994289814532176e-04, pS5 = 3.47933107596021167570e-05;
const qS1 = -2.40339491173441421878e+00, qS2 = 2.02094576023350569471e+00, qS3 = -6.88283971605453293030e-01,
  qS4 = 7.70381505559019352791e-02;
const R = (z) => (z * (pS0 + z * (pS1 + z * (pS2 + z * (pS3 + z * (pS4 + z * pS5)))))) / (1.0 + z * (qS1 + z * (qS2 + z * (qS3 + z * qS4))));

export function acos(x) {
  if (x !== x) return NaN;
  const ax = x < 0 ? -x : x;
  if (ax >= 1) {
    if (x === 1) return 0;
    if (x === -1) return PI + 2.0 * pio2_lo;
    return NaN;
  }
  if (ax < 0.5) {
    if (ax <= 6.938893903907228e-18) return pio2_hi + pio2_lo; // 2^-57
    return pio2_hi - (x - (pio2_lo - x * R(x * x)));
  }
  if (x < 0) {
    const z = (1.0 + x) * 0.5;
    const s = sqrt(z);
    const w = R(z) * s - pio2_lo;
    return PI - 2.0 * (s + w);
  }
  const z = (1.0 - x) * 0.5;
  const s = sqrt(z);
  const df = clearLow(s);
  const c = (z - df * df) / (s + df);
  const w = R(z) * s + c;
  return 2.0 * (df + w);
}

export function asin(x) {
  if (x !== x) return NaN;
  const ax = x < 0 ? -x : x;
  if (ax >= 1) {
    if (ax === 1) return x * pio2_hi + x * pio2_lo;
    return NaN;
  }
  if (ax < 0.5) {
    if (ax < 1.4901161193847656e-8) return x; // 2^-26
    return x + x * R(x * x);
  }
  const t = (1.0 - ax) * 0.5;
  const s = sqrt(t);
  let r;
  if (ax >= 0.975) {
    r = pio2_hi - (2.0 * (s + s * R(t)) - pio2_lo);
  } else {
    const w = clearLow(s);
    const c = (t - w * w) / (s + w);
    const p = 2.0 * s * R(t) - (pio2_lo - 2.0 * c);
    const q = pio4_hi - 2.0 * w;
    r = pio4_hi - (p - q);
  }
  return x > 0 ? r : -r;
}

// ---------------------------------------------------------------- exp (e_exp.c)

const o_threshold = 7.09782712893383973096e+02, u_threshold = -7.45133219101941108420e+02;
const ln2HI = [6.93147180369123816490e-01, -6.93147180369123816490e-01];
const ln2LO = [1.90821492927058770002e-10, -1.90821492927058770002e-10];
const invln2 = 1.44269504088896338700e+00;
const P1 = 1.66666666666666019037e-01, P2 = -2.77777777770155933842e-03, P3 = 6.61375632143793436117e-05,
  P4 = -1.65339022054652515390e-06, P5 = 4.13813679705723846039e-08;
const halF = [0.5, -0.5];
const HUGE = 1.0e300, TWOM1000 = 9.33263618503218878990e-302;
const TWO1023 = 8.98846567431157953865e+307;

export function exp(x) {
  let hx = hiWord(x);
  const xsb = (hx >>> 31) & 1;
  hx &= 0x7fffffff;
  let hi = 0, lo = 0, k = 0;
  if (hx >= 0x40862E42) { // |x| >= 709.78...
    if (hx >= 0x7ff00000) {
      if (((hx & 0xfffff) | loWord(x)) !== 0) return NaN;
      return xsb === 0 ? x : 0.0; // exp(+-inf) = {inf, 0}
    }
    if (x > o_threshold) return Infinity;
    if (x < u_threshold) return 0;
  }
  if (hx > 0x3fd62e42) { // |x| > 0.5 ln2
    if (hx < 0x3FF0A2B2) { // and |x| < 1.5 ln2
      hi = x - ln2HI[xsb]; lo = ln2LO[xsb]; k = 1 - xsb - xsb;
    } else {
      k = Math.trunc(invln2 * x + halF[xsb]);
      hi = x - k * ln2HI[0];
      lo = k * ln2LO[0];
    }
    x = hi - lo;
  } else if (hx < 0x3e300000) { // |x| < 2^-28
    if (HUGE + x > 1.0) return 1.0 + x;
  } else k = 0;
  const t = x * x;
  const twopk = k >= -1021 ? fromWords((0x3ff00000 + (k << 20)) | 0, 0) : fromWords((0x3ff00000 + ((k + 1000) << 20)) | 0, 0);
  const c = x - t * (P1 + t * (P2 + t * (P3 + t * (P4 + t * P5))));
  if (k === 0) return 1.0 - ((x * c) / (c - 2.0) - x);
  const y = 1.0 - ((lo - (x * c) / (2.0 - c)) - hi);
  if (k >= -1021) {
    if (k === 1024) return y * 2.0 * TWO1023;
    return y * twopk;
  }
  return y * twopk * TWOM1000;
}

// ---------------------------------------------------------------- log (e_log.c)

const ln2_hi = 6.93147180369123816490e-01, ln2_lo = 1.90821492927058770002e-10, two54 = 1.80143985094819840000e+16;
const Lg1 = 6.666666666666735130e-01, Lg2 = 3.999999999940941908e-01, Lg3 = 2.857142874366239149e-01,
  Lg4 = 2.222219843214978396e-01, Lg5 = 1.818357216161805012e-01, Lg6 = 1.531383769920937332e-01,
  Lg7 = 1.479819860511658591e-01;

export function log(x) {
  let hx = hiWord(x);
  const lx = loWord(x);
  let k = 0;
  if (hx < 0x00100000) { // x < 2^-1022
    if (((hx & 0x7fffffff) | lx) === 0) return -Infinity; // log(+-0)
    if (hx < 0) return NaN; // log(-#)
    k -= 54; x *= two54; hx = hiWord(x);
  }
  if (hx >= 0x7ff00000) return x + x;
  if (hx === 0x3ff00000 && lx === 0) return 0;
  k += (hx >> 20) - 1023;
  hx &= 0x000fffff;
  let i = (hx + 0x95f64) & 0x100000;
  x = withHigh(x, hx | (i ^ 0x3ff00000)); // normalize x or x/2
  k += (i >> 20);
  const f = x - 1.0;
  if ((0x000fffff & (2 + hx)) < 3) { // -2^-20 <= f < 2^-20
    if (f === 0) { if (k === 0) return 0; return k * ln2_hi + k * ln2_lo; }
    const Rr = f * f * (0.5 - 0.33333333333333333 * f);
    if (k === 0) return f - Rr;
    return k * ln2_hi - ((Rr - k * ln2_lo) - f);
  }
  const s = f / (2.0 + f);
  const dk = k;
  const z = s * s;
  i = hx - 0x6147a;
  const w = z * z;
  const j = 0x6b851 - hx;
  const t1 = w * (Lg2 + w * (Lg4 + w * Lg6));
  const t2 = z * (Lg1 + w * (Lg3 + w * (Lg5 + w * Lg7)));
  i |= j;
  const Rr = t2 + t1;
  if (i > 0) {
    const hfsq = 0.5 * f * f;
    if (k === 0) return f - (hfsq - s * (hfsq + Rr));
    return dk * ln2_hi - ((hfsq - (s * (hfsq + Rr) + dk * ln2_lo)) - f);
  }
  if (k === 0) return f - s * (f - Rr);
  return dk * ln2_hi - ((s * (f - Rr) - dk * ln2_lo) - f);
}

// ---------------------------------------------------------------- pow (e_pow.c)

const bp = [1.0, 1.5], dp_h = [0.0, 5.84962487220764160156e-01], dp_l = [0.0, 1.35003920212974897128e-08];
const two53 = 9007199254740992.0, TINY = 1.0e-300;
const L1 = 5.99999999999994648725e-01, L2 = 4.28571428578550184252e-01, L3 = 3.33333329818377432918e-01,
  L4 = 2.72728123808534006489e-01, L5 = 2.30660745775561754067e-01, L6 = 2.06975017800338417784e-01;
const lg2 = 6.93147180559945286227e-01, lg2_h = 6.93147182464599609375e-01, lg2_l = -1.90465429995776804525e-09;
const ovt = 8.0085662595372944372e-17;
const cp = 9.61796693925975554329e-01, cp_h = 9.61796700954437255859e-01, cp_l = -7.02846165095275826516e-09;
const ivln2 = 1.44269504088896338700e+00, ivln2_h = 1.44269502162933349609e+00, ivln2_l = 1.92596299112661746887e-08;

export function pow(x, y) {
  // Where ECMAScript differs from C99's pow: NaN exponents, and |x| = 1 with an infinite y.
  if (y !== y) return NaN;
  if (y === 0) return 1;
  if (x !== x) return NaN;
  if ((x === 1 || x === -1) && (y === Infinity || y === -Infinity)) return NaN;

  const hx = hiWord(x), lx = loWord(x), hy = hiWord(y), ly = loWord(y);
  let ix = hx & 0x7fffffff;
  const iy = hy & 0x7fffffff;
  if (hx === 0x3ff00000 && lx === 0) return 1; // 1^y

  // yisint: 0 = y is not an integer, 1 = odd integer, 2 = even integer (only needed for x < 0)
  let yisint = 0, j, k;
  if (hx < 0) {
    if (iy >= 0x43400000) yisint = 2;
    else if (iy >= 0x3ff00000) {
      k = (iy >> 20) - 0x3ff;
      if (k > 20) {
        j = ly >>> (52 - k);
        if (((j << (52 - k)) >>> 0) === ly) yisint = 2 - (j & 1);
      } else if (ly === 0) {
        j = iy >> (20 - k);
        if ((j << (20 - k)) === iy) yisint = 2 - (j & 1);
      }
    }
  }

  if (ly === 0) {
    if (iy === 0x7ff00000) { // y is +-inf
      if (((ix - 0x3ff00000) | lx) === 0) return 1; // unreachable after the JS check above
      if (ix >= 0x3ff00000) return hy >= 0 ? y : 0;
      return hy < 0 ? -y : 0;
    }
    if (iy === 0x3ff00000) return hy < 0 ? 1 / x : x; // y is +-1
    if (hy === 0x40000000) return x * x;               // y is 2
    if (hy === 0x3fe00000 && hx >= 0) return sqrt(x);  // y is 0.5, x >= +0
  }

  let ax = Math.abs(x); // fabs: -0 -> +0 (x < 0 ? -x : x would keep -0)
  if (lx === 0 && (ix === 0x7ff00000 || ix === 0 || ix === 0x3ff00000)) { // x is +-0, +-inf, +-1
    let z = ax;
    if (hy < 0) z = 1 / z;
    if (hx < 0) {
      if (((ix - 0x3ff00000) | yisint) === 0) z = NaN; // (-1)^non-int
      else if (yisint === 1) z = -z;
    }
    return z;
  }

  let n = (hx >>> 31) - 1;
  if ((n | yisint) === 0) return NaN; // (x < 0)^(non-int)

  let s = 1; // sign of the result
  if ((n | (yisint - 1)) === 0) s = -1; // (-ve)^(odd int)

  let t1, t2;
  if (iy > 0x41e00000) { // |y| > 2^31
    if (iy > 0x43f00000) { // |y| > 2^64: must over/underflow
      if (ix <= 0x3fefffff) return hy < 0 ? Infinity : 0;
      if (ix >= 0x3ff00000) return hy > 0 ? Infinity : 0;
    }
    if (ix < 0x3fefffff) return hy < 0 ? s * Infinity : s * 0;
    if (ix > 0x3ff00000) return hy > 0 ? s * Infinity : s * 0;
    // |1 - x| <= 2^-20: log(x) by x - x^2/2 + x^3/3 - x^4/4
    const t = ax - 1;
    const w = (t * t) * (0.5 - t * (3.3333333333333331e-01 - t * 0.25));
    const u = ivln2_h * t;
    const v = t * ivln2_l - w * ivln2;
    t1 = clearLow(u + v);
    t2 = v - (t1 - u);
  } else {
    n = 0;
    if (ix < 0x00100000) { ax *= two53; n -= 53; ix = hiWord(ax); } // subnormal x
    n += (ix >> 20) - 0x3ff;
    j = ix & 0x000fffff;
    ix = j | 0x3ff00000;
    if (j <= 0x3988E) k = 0;      // |x| < sqrt(3/2)
    else if (j < 0xBB67A) k = 1;  // |x| < sqrt(3)
    else { k = 0; n += 1; ix -= 0x00100000; }
    ax = withHigh(ax, ix);

    // ss = s_h + s_l = (x - 1)/(x + 1) or (x - 1.5)/(x + 1.5)
    let u = ax - bp[k];
    let v = 1 / (ax + bp[k]);
    const ss = u * v;
    const s_h = clearLow(ss);
    let t_h = fromWords((((ix >> 1) | 0x20000000) + 0x00080000 + (k << 18)) | 0, 0);
    let t_l = ax - (t_h - bp[k]);
    const s_l = v * ((u - s_h * t_h) - s_h * t_l);
    // log(ax)
    let s2 = ss * ss;
    let r = s2 * s2 * (L1 + s2 * (L2 + s2 * (L3 + s2 * (L4 + s2 * (L5 + s2 * L6)))));
    r += s_l * (s_h + ss);
    s2 = s_h * s_h;
    t_h = clearLow(3.0 + s2 + r);
    t_l = r - ((t_h - 3.0) - s2);
    u = s_h * t_h;
    v = s_l * t_h + t_l * ss;
    const p_h = clearLow(u + v);
    const p_l = v - (p_h - u);
    const z_h = cp_h * p_h;
    const z_l = cp_l * p_h + p_l * cp + dp_l[k];
    const t = n;
    t1 = clearLow(((z_h + z_l) + dp_h[k]) + t);
    t2 = z_l - (((t1 - t) - dp_h[k]) - z_h);
  }

  // (y1 + y2) * (t1 + t2)
  const y1 = clearLow(y);
  let p_l = (y - y1) * t1 + y * t2;
  let p_h = y1 * t1;
  let z = p_l + p_h;
  j = hiWord(z);
  let i = loWord(z);
  if (j >= 0x40900000) { // z >= 1024
    if (((j - 0x40900000) | i) !== 0) return s * Infinity;
    if (p_l + ovt > z - p_h) return s * Infinity;
  } else if ((j & 0x7fffffff) >= 0x4090cc00) { // z <= -1075
    if (((j - 0xc090cc00) | i) !== 0) return s * 0;
    if (p_l <= z - p_h) return s * 0;
  }

  // 2^(p_h + p_l)
  i = j & 0x7fffffff;
  k = (i >> 20) - 0x3ff;
  n = 0;
  if (i > 0x3fe00000) { // |z| > 0.5: n = [z + 0.5]
    n = (j + (0x00100000 >> (k + 1))) | 0;
    k = ((n & 0x7fffffff) >> 20) - 0x3ff;
    const t = fromWords(n & ~(0x000fffff >> k), 0);
    n = ((n & 0x000fffff) | 0x00100000) >> (20 - k);
    if (j < 0) n = -n;
    p_h -= t;
  }
  let t = clearLow(p_l + p_h);
  const u = t * lg2_h;
  const v = (p_l - (t - p_h)) * lg2 + t * lg2_l;
  z = u + v;
  const w = v - (z - u);
  t = z * z;
  t1 = z - t * (P1 + t * (P2 + t * (P3 + t * (P4 + t * P5))));
  const r = (z * t1) / (t1 - 2.0) - (w + z * w);
  z = 1.0 - (r - z);
  j = hiWord(z);
  j = (j + (n << 20)) | 0;
  if ((j >> 20) <= 0) z = n < -1000 ? (z * pow2(n + 600)) * pow2(-600) : z * pow2(n); // subnormal output
  else z = withHigh(z, j);
  return s * z;
}

// ---------------------------------------------------------------- cbrt (s_cbrt.c)

const B1 = 715094163, B2 = 696219795;
const CP0 = 1.87595182427177009643, CP1 = -1.88497979543377169875, CP2 = 1.621429720105354466140,
  CP3 = -0.758397934778766047437, CP4 = 0.145996192886612446982;

export function cbrt(x) {
  let hx = hiWord(x);
  const low = loWord(x);
  const sign = hx & 0x80000000;
  hx = (hx ^ sign) | 0;
  if (hx >= 0x7ff00000) return x + x; // NaN, +-inf
  let t;
  if (hx < 0x00100000) { // zero or subnormal
    if ((hx | low) === 0) return x;
    t = fromWords(0x43500000, 0) * x; // 2^54 * x
    const high = hiWord(t);
    t = fromWords((sign | (Math.floor((high & 0x7fffffff) / 3) + B2)) >>> 0, 0);
  } else {
    t = fromWords((sign | (Math.floor(hx / 3) + B1)) >>> 0, 0);
  }
  // Polynomial for 1/cbrt(r) to about 23 bits
  let r = (t * t) * (t / x);
  t = t * ((CP0 + r * (CP1 + r * CP2)) + ((r * r) * r) * (CP3 + r * CP4));
  // Round t away from zero to 23 bits: add 2^31 to the 64-bit pattern, clear the low 30 bits
  f64[0] = t;
  let lo = u32[0] + 0x80000000, hi = u32[1];
  if (lo >= 0x100000000) { lo -= 0x100000000; hi = (hi + 1) >>> 0; }
  u32[1] = hi; u32[0] = (lo & 0xc0000000) >>> 0;
  t = f64[0];
  // One Newton step to 53 bits, error < 0.667 ulp
  const s = t * t;
  r = x / s;
  const w = t + t;
  r = (r - t) / (w + r);
  return t + t * r;
}

// ---------------------------------------------------------------- hypot (V8's MathHypot)

export function hypot(...values) {
  let max = 0, sawNaN = false;
  const abs = new Array(values.length);
  for (let i = 0; i < values.length; i++) {
    const v = +values[i];
    if (v !== v) { sawNaN = true; abs[i] = 0; continue; }
    const a = v < 0 ? -v : v;
    abs[i] = a;
    if (a > max) max = a;
  }
  if (max === Infinity) return Infinity;
  if (sawNaN) return NaN;
  if (max === 0) return 0;
  let sum = 0, compensation = 0; // Kahan summation of the scaled squares
  for (let i = 0; i < abs.length; i++) {
    const n = abs[i] / max;
    const summand = n * n - compensation;
    const preliminary = sum + summand;
    compensation = (preliminary - sum) - summand;
    sum = preliminary;
  }
  return sqrt(sum) * max;
}

// ---------------------------------------------------------------- install / swap

export const FUNCTIONS = Object.freeze(['sin', 'cos', 'tan', 'asin', 'acos', 'atan', 'atan2', 'exp', 'log', 'pow', 'cbrt', 'hypot']);
export const portable = Object.freeze({ sin, cos, tan, asin, acos, atan, atan2, exp, log, pow, cbrt, hypot });
// Captured when this module is first evaluated, so it must load before anything patches Math.
export const native = Object.freeze(Object.fromEntries(FUNCTIONS.map((k) => [k, Math[k]])));

export function installPortableMath() { Object.assign(Math, portable); }
export function uninstallPortableMath() { Object.assign(Math, native); }
export function isPortableMathInstalled() { return FUNCTIONS.every((k) => Math[k] === portable[k]); }

// Swap the portable functions in for the duration of fn and restore whatever was there before,
// so nesting inside an installed realm, or inside another withPortableMath, is harmless.
export function withPortableMath(fn) {
  const saved = FUNCTIONS.map((k) => Math[k]);
  Object.assign(Math, portable);
  try { return fn(); } finally { FUNCTIONS.forEach((k, i) => { Math[k] = saved[i]; }); }
}
