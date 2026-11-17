// Superseded on 2026-11-17 by the engine module engine/packages/dmath (AB-T-0500), which merges this
// spike's trig port with spike-particles' detmath.js. Kept as a re-export under this spike's old
// names so the suite and its results stay reproducible. The original port is in git history and
// in the engine module, which carries fdlibm's licence notice.
//
// Difference from the original: installDMath() now replaces twelve functions (adds exp, log,
// pow, cbrt, hypot) and tan has its own kernel instead of sin/cos.
export {
  sin as dsin, cos as dcos, tan as dtan, asin as dasin, acos as dacos, atan as datan, atan2 as datan2,
  FUNCTIONS as DMATH_FUNCTIONS, installPortableMath as installDMath, uninstallPortableMath as uninstallDMath,
  isPortableMathInstalled as dmathInstalled, native as nativeMath,
} from '../../../../engine/packages/dmath/src/index.js';
