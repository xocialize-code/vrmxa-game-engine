// @vrmxg/bundle: game builds (M5 W0, AB-T-0615; the contract is AB-D-0282 and this package's README).
//
//   exportBuild   a project and a runtime in, a build out: the runtime's files, the project's under project/, and
//                 vrmxg-build.json listing every file with its SHA-256 and its licence. Runs in Node and in a page.
//   openBuild     the loader: the game, the project's files by ref (refusing what the manifest doesn't list or what
//                 has changed), the input map, the behaviours.
//   collect       which of a project's files a game needs, traced from its documents.
//   runtimeTable  a runtime's vrmxg-runtime.json (the Vite plugin in ./vite writes it for a built app).
//   compat*       a build's save-compatibility fingerprint (M6 W5): what a save's restore depends on, and why a save
//                 from another build can't be restored here (compatProblems).
//
// Node's folders, the comparison of two builds and the import hook for behaviours are in ./node.
export { sha256, sha256Text } from './sha256.js';
export { BuildError, pathProblem, isHidden, sortPaths } from './paths.js';
export { LICENCES_FILE, parseLicences, licenceOf } from './licences.js';
export { GAME_FILE, GAME_FORMAT, GAME_VERSION, checkGame, checkPhysics, defaultGame, MAX_LAYERS, layersUsed, gameLayers, unknownLayers } from './game.js';
export { collect, sceneRefs } from './collect.js';
export { moduleImports, moduleExports, moduleGraph, linkModules } from './modules.js';
export { RUNTIME_FILE, RUNTIME_FORMAT, RUNTIME_VERSION, RUNTIME_CONTRACT, PROJECT_DIR, checkRuntime, runtimeTable, serializeRuntime, filesDigest } from './runtime.js';
export { BUILD_FILE, BUILD_FORMAT, BUILD_VERSION, makeManifest, serializeManifest, parseManifest } from './manifest.js';
export { exportBuild, planBuild, behavioursCode } from './export.js';
export { COMPAT_FORMAT, COMPAT_VERSION, COMPAT_PARTS, compatFingerprint, compatProblems, checkCompat, engineCompat, checkEngine, declaredShape, behavioursUsed, actionsShape, stableJson } from './compat.js';
export { Build, openBuild, fetchReader } from './loader.js';
