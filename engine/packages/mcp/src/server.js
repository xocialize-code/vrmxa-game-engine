#!/usr/bin/env node
// The VRMXG MCP server over stdio, for one scene of one project:
//
//   vrmxg-mcp <project-root> <scene.vrmxs> [--behaviours <module.js>] [--vrmxa-core <package dir>] [--seed N]
//
// Register it in Claude Code:  claude mcp add vrmxg -- node engine/packages/mcp/src/server.js <root> <scene>
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { CallToolRequestSchema, ListToolsRequestSchema } from '@modelcontextprotocol/sdk/types.js';
import { installPortableMath } from '@vrmxg/dmath';
import { m0Registry } from '@vrmxg/registry/m0';
import { Project } from './project.js';
import { createTools } from './tools.js';

installPortableMath(); // before anything parses a VRM or steps a world
const argv = process.argv.slice(2);
const opt = (k) => { const i = argv.indexOf(k); return i < 0 ? undefined : argv[i + 1]; };
const positional = argv.filter((a, i) => !a.startsWith('--') && !argv[i - 1]?.startsWith('--'));
const [root, scene] = positional;
if (!root || !scene) { console.error('usage: vrmxg-mcp <project-root> <scene.vrmxs> [--behaviours m.js] [--vrmxa-core dir] [--seed N]'); process.exit(2); }
const project = new Project(root, { behaviours: opt('--behaviours'), vrmxaCore: opt('--vrmxa-core'), seed: opt('--seed') ? Number(opt('--seed')) : 1 });
const { tools, call } = createTools({ registry: m0Registry(), project, scene });

const server = new Server({ name: 'vrmxg', version: '0.1.0' }, { capabilities: { tools: {} } });
server.setRequestHandler(ListToolsRequestSchema, async () => ({ tools }));
server.setRequestHandler(CallToolRequestSchema, async (req) => {
  const { text, isError } = await call(req.params.name, req.params.arguments ?? {});
  return { isError, content: [{ type: 'text', text }] };
});
await server.connect(new StdioServerTransport());
