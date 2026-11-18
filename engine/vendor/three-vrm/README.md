# @vrmxg/three-vrm

[`@pixiv/three-vrm`](https://github.com/pixiv/three-vrm) **3.5.5** (MIT, © pixiv Inc.), vendored for VRMXG as the PRD's
principle 2 asks. `lib/three-vrm.module.js` is the upstream ES module bundle (core, springbone, node-constraint,
MToon, v0 compat and HDR emissive in one file; it imports only `three`). The licence is in `LICENSE`.

| Version | Change |
|---|---|
| `3.5.5-vrmxg.0` | The upstream bundle, byte for byte (sha256 below) |
| `3.5.5-vrmxg.1` | Spring-bone state API: `VRMSpringBoneJoint.getState()/setState()` (six numbers: current and previous tail) and `VRMSpringBoneManager.getState()/setState()` (every joint's, in joint order), appended before the exports. Look-at needs no patch: `vrm.lookAt.yaw` / `pitch` are public |

Upstream bundle sha256: `bfc0f3bd49ee5b706b3055d366759e881f20dee32be344c4c8f586600f223434` (`lib/three-vrm.module.js` as published).

Why vendored: the engine needs a state API for spring bones and look-at (snapshots for timeline scrubbing,
AB-R-0924) that upstream doesn't have, without engine code reaching into private fields. Keep changes small, in their
own commits, and offer them upstream.
