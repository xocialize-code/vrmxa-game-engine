// MCP attached to the open creator (M4 W11, AB-T-0583). `vrmxg-mcp --creator` (engine/packages/mcp) listens on
// 127.0.0.1:5184 for this page; the editor's link (apps/editor/src/mcp.js McpLink) polls it and runs each call here with
// @vrmxg/mcp's short tools over the creator (src/agent.js). Every edit is a step of the creator's own Undo marked
// "(MCP)"; render draws a frame of the short as the export does (the editor's frame screenshot).
import { createShortHandlers } from '@vrmxg/mcp/shorts';
import { caller } from '@vrmxg/mcp/tools';
import { McpLink, editorTarget } from '../../editor/src/mcp.js';
import { creatorTarget } from './agent.js';

/** The default port: one apart from the editor's 5183, so both apps can be linked at once. */
export const CREATOR_MCP_PORT = 5184;

/** The page's end of the bridge for the creator. @param {import('./host.js').CreatorHost} cr @param {{ url?: string, onChange?: () => void }} [o] */
export function creatorLink(cr, { url = `http://127.0.0.1:${CREATOR_MCP_PORT}`, onChange } = {}) {
  const frames = editorTarget(cr); // the sequence on a frame and its still: the editor's, on the creator's host
  const target = creatorTarget(cr, { render: ({ frame, width, height }) => frames.screenshot({ frame, width, height }) });
  return new McpLink(cr, { url, onChange, app: 'VRMXG Creator', call: caller(createShortHandlers(target)), hello: () => ({ short: cr.short?.id ?? null }) });
}
