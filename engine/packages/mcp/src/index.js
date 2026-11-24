// @vrmxg/mcp — M0 W7 (AB-T-0508), M1 W9 (AB-T-0521). The MCP server's parts, for embedding and tests: the project
// loader, the headless engine session, the headless tool set and the editor bridge (Node). The page-safe parts (the
// tool list and handlers, the live view) are @vrmxg/mcp/tools and @vrmxg/mcp/live. src/server.js runs it on stdio.
export { Project } from './project.js';
export { EngineSession } from './engine.js';
export { createTools } from './headless.js';
export { EditorBridge } from './bridge.js';
export { toolList, createHandlers, caller } from './tools.js';
export { LiveView } from './live.js';
export { shortToolList, createShortHandlers, CommandRegistry, checkArgs, asAgent, asContent, SHORT_INSTRUCTIONS, AGENT_MARK, CONTENT_NOTE } from './shorts.js';
export { gameRules, validateGame, colliderProblems, unreachableGoals, GAME_NOTE } from './game.js';
