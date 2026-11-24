// A project's own modules (behaviours.js) import '@vrmxg/core' by name. The runtime's import map points that name
// here, and this hands them the runtime's own copy (set on globalThis before a project module loads), so a project's
// behaviour extends the very Behaviour class the engine runs. The editor does the same (apps/editor/static).
const core = globalThis.VRMXG_CORE;
if (!core) throw new Error('@vrmxg/core: the runtime has not published its engine yet');
export const { Behaviour, Node, SceneTree } = core;
export default core;
