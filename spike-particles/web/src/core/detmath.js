// Superseded on 2026-11-17 by the engine module engine/packages/dmath (AB-T-0500), which merges this
// spike's port with spike-determinism's dmath.js and re-ports exp, log and pow faithfully from
// FreeBSD msun. Kept as a re-export so the suite stays reproducible. fdlibm's licence notice is in
// the engine module.
export * from '../../../../engine/packages/dmath/src/index.js';
