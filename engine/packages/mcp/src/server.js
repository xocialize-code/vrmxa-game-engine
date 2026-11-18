#!/usr/bin/env node
// The VRMXG MCP server over stdio, for one scene of one project, or for the scene open in the VRMXG editor:
//
//   vrmxg-mcp <project-root> <scene.vrmxs> [--behaviours <module.js>] [--vrmxa-core <package dir>] [--seed N]
//   vrmxg-mcp --editor [--port 5183]
//
// Register it in Claude Code:  claude mcp add vrmxg -- node engine/packages/mcp/src/server.js <root> <scene>
//                              claude mcp add vrmxg-editor -- node engine/packages/mcp/src/server.js --editor
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { CallToolRequestSchema, ListToolsRequestSchema } from '@modelcontextprotocol/sdk/types.js';
import { installPortableMath } from '@vrmxg/dmath';
import { m0Registry } from '@vrmxg/registry/m0';

installPortableMath(); // before anything parses a VRM or steps a world
const argv = process.argv.slice(2);
const opt = (k) => { const i = argv.indexOf(k); return i < 0 ? undefined : argv[i + 1]; };
let tools, call;
if (argv.includes('--editor')) {
  const { EditorBridge } = await import('./bridge.js');
  const { toolList } = await import('./tools.js');
  const bridge = new EditorBridge({ port: opt('--port') ? Number(opt('--port')) : 5183, ...(opt('--hold-ms') ? { holdMs: Number(opt('--hold-ms')) } : {}) });
  try { await bridge.start(); } catch (e) { console.error(`vrmxg-mcp --editor: can't listen on 127.0.0.1:${bridge.port}: ${e.message}`); process.exit(1); }
  console.error(`vrmxg-mcp: waiting for the editor on http://127.0.0.1:${bridge.port}`);
  tools = toolList(m0Registry(), 'editor');
  call = (name, args) => bridge.call(name, args);
} else {
  const positional = argv.filter((a, i) => !a.startsWith('--') && !argv[i - 1]?.startsWith('--'));
  const [root, scene] = positional;
  if (!root || !scene) { console.error('usage: vrmxg-mcp <project-root> <scene.vrmxs> [--behaviours m.js] [--vrmxa-core dir] [--seed N] | vrmxg-mcp --editor [--port N]'); process.exit(2); }
  const { Project } = await import('./project.js');
  const { createTools } = await import('./headless.js');
  const project = new Project(root, { behaviours: opt('--behaviours'), vrmxaCore: opt('--vrmxa-core'), seed: opt('--seed') ? Number(opt('--seed')) : 1 });
  ({ tools, call } = createTools({ registry: m0Registry(), project, scene }));
}

const { INSTRUCTIONS } = await import('./tools.js');
const server = new Server({ name: 'vrmxg', version: '0.3.0' }, { capabilities: { tools: {} }, instructions: INSTRUCTIONS });
server.setRequestHandler(ListToolsRequestSchema, async () => ({ tools }));
server.setRequestHandler(CallToolRequestSchema, async (req) => {
  const { text, isError, image } = await call(req.params.name, req.params.arguments ?? {});
  return { isError, content: [...(image ? [{ type: 'image', data: image.data, mimeType: 'image/png' }] : []), { type: 'text', text }] };
});
await server.connect(new StdioServerTransport());
