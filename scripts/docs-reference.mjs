#!/usr/bin/env node
// The documentation's generated reference (AB-T-0611) and its llms.txt index (the first half of AB-T-0608), written
// from the code so neither can go stale:
//
//   node scripts/docs-reference.mjs           write docs/reference/*.md, docs/public/schemas/*.json and docs/llms.txt
//   node scripts/docs-reference.mjs --check   write nothing; exit 1 naming every file that is out of date
//
// `npm run check` and CI run --check. What each page is generated from:
//   nodes, behaviours   @vrmxg/registry's registry (m0Registry): types, props, signals, actions, behaviours; and the
//                       behaviours the sample game declares (content/sample/game/behaviours.js, M6 W0)
//   mcp                 @vrmxg/mcp's tool lists (toolList for headless and editor, shortToolList) and what each server
//                       says at initialize; the launch line and ports read from src/server.js
//   creator-commands    apps/creator/src/agent.js's CommandRegistry, with every command's JSON Schema
//   vrmxs               @vrmxg/scene's documentSchema over the registry (also written whole, as a JSON Schema file)
//   fountain            @vrmxg/script's vocabulary and timing tables, and the subset's table from its README
//   shorts-json         apps/creator/src/shorts.js (the format, what a reader fills in, the sample's own file)
//   delivery-json       @vrmxg/editor-core's presets, @vrmxg/export's deliveryFiles, and the manifest as
//                       apps/creator/src/delivery.js writes it (quoted from the source)
//   game-json           @vrmxg/bundle's checkGame (the keys, the defaults it fills in) over the sample's game.json,
//                       and the game document's section of its README
//   build-json          @vrmxg/bundle's manifest (makeManifest over a two-file build), its constants, and the layout and
//                       manifest sections of its README
//   packages            every engine/packages/*: its package.json and the first lines of its README
//   llms.txt            every page of docs/ (front matter) and one line per type, behaviour, tool, command and package,
//                       and the vrmxg skill (skills/vrmxg/SKILL.md, its front matter)
//
// Anything read from source text (a README section, a line of server.js) is found by an anchor, and a missing anchor is
// an error here, not a silently empty page.
import fs from 'node:fs';
import path from 'node:path';
import { m0Registry } from '@vrmxg/registry/m0';
import { declareProjectBehaviours } from '@vrmxg/registry';
import * as rushBehaviours from '../content/sample/game/behaviours.js';
import { documentSchema } from '@vrmxg/scene';
import { toolList, INSTRUCTIONS, OUTPUT_LIMIT } from '@vrmxg/mcp/tools';
import { shortToolList, SHORT_INSTRUCTIONS, CONTENT_NOTE, AGENT_MARK } from '@vrmxg/mcp/shorts';
import { GESTURES, EXPRESSIONS, PAREN_WORDS, TIMING, parseScript } from '@vrmxg/script';
import { PRESETS, JOB_STATES } from '@vrmxg/editor-core';
import { deliveryFiles, THUMB, SIZES, CODECS } from '@vrmxg/export';
import { KEYED_TAGS } from '../engine/packages/script/src/vocab.js';
import { creatorCommands } from '../apps/creator/src/agent.js';
import { SHORTS_FILE, SHORTS_FORMAT, COVERAGE, readShorts, shortsManifest } from '../apps/creator/src/shorts.js';
import { readPages } from './docs-pages.mjs';
import { GAME_FILE, GAME_FORMAT, GAME_VERSION, checkGame, BUILD_FILE, BUILD_FORMAT, BUILD_VERSION, RUNTIME_FILE, RUNTIME_CONTRACT, PROJECT_DIR, makeManifest, serializeManifest, runtimeTable, sha256 } from '@vrmxg/bundle';

// a page that can't be generated is a message, not a stack trace
process.on('uncaughtException', (e) => { console.error(`docs-reference: ${e.message}`); process.exit(1); });

const root = path.resolve(import.meta.dirname, '..');
const docs = path.join(root, 'docs');
const read = (rel) => fs.readFileSync(path.join(root, rel), 'utf8');
const check = process.argv.includes('--check');

// ---------------------------------------------------------------- Markdown helpers

/** Inline code, whatever the text holds. */
const code = (s) => { const t = String(s); const ticks = t.includes('`') ? '``' : '`'; return t.includes('`') ? `${ticks} ${t} ${ticks}` : `${ticks}${t}${ticks}`; };
const cell = (s) => String(s ?? '').replace(/\s*\n\s*/g, ' ').replace(/\|/g, '\\|').trim();
/** A table; a column with nothing in any row is left out. */
function table(head, rows) {
  const cells = rows.map((r) => r.map(cell)), keep = head.map((_, i) => cells.some((r) => r[i]));
  const pick = (r) => r.filter((_, i) => keep[i]);
  return [`| ${pick(head).join(' | ')} |`, `|${pick(head).map(() => '---').join('|')}|`, ...cells.map((r) => `| ${pick(r).join(' | ')} |`)].join('\n');
}
const fence = (text, lang = '') => `\`\`\`${lang}\n${String(text).replace(/\n+$/, '')}\n\`\`\``;
/** JSON laid out for reading: a value that fits on a line stays on one. */
function layout(v, indent = '', width = 96) {
  const flat = JSON.stringify(v, null, 1)?.replace(/\n\s*/g, ' ').replace(/([[{]) /g, '$1 ').replace(/\[ /g, '[').replace(/ \]/g, ']') ?? 'null';
  if (v === null || typeof v !== 'object' || indent.length + flat.length <= width || !Object.keys(v).length) return flat;
  const inner = `${indent}  `;
  if (Array.isArray(v) && v.every((x) => x === null || typeof x !== 'object')) { // short values: fill lines
    const lines = [''];
    for (const x of v.map((y) => JSON.stringify(y))) { if (lines.at(-1) && inner.length + lines.at(-1).length + x.length + 2 > width) lines.push(''); lines[lines.length - 1] += `${lines.at(-1) ? ', ' : ''}${x}`; }
    return `[\n${lines.map((l) => inner + l).join(',\n')}\n${indent}]`;
  }
  const items = Array.isArray(v) ? v.map((x) => layout(x, inner, width)) : Object.entries(v).map(([k, x]) => `${JSON.stringify(k)}: ${layout(x, inner, width - k.length - 4)}`);
  return `${Array.isArray(v) ? '[' : '{'}\n${items.map((i) => inner + i).join(',\n')}\n${indent}${Array.isArray(v) ? ']' : '}'}`;
}
const json = (v) => fence(layout(v), 'json');
const slugOf = (s) => String(s).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
const oneLine = (s) => String(s ?? '').replace(/\s+/g, ' ').trim();

/**
 * The site is public and the repository is not. Descriptions in the code carry notes that only mean something inside
 * the project: bridge record ids (AB-T-0611), milestone and workstream tags (M3 W5), a pull request in a private
 * repository. They are taken out of everything this script publishes, without changing the code they come from.
 */
function publicText(text) {
  return text
    .replace(/,?\s*under review in [\w.-]+\/[\w.-]+#\d+/g, '')                          // ", under review in owner/repo#1"
    .replace(/\s*\((?:(?:decision )?AB-[A-Z]-\d+(?:(?:[,;]| to| and) )?)+\)/g, '')         // " (AB-R-0926)", " (AB-T-0599 to AB-T-0607)"
    .replace(/[,;]\s*(?:decision )?AB-[A-Z]-\d+/g, '')                                    // "…0.21.0, AB-R-0923)"
    .replace(/\s*\(M\d+ W\d+\)/g, '')                                                   // " (M2 W7)"
    .replace(/\(M\d+ W\d+[,;:] /g, '(')                                                  // "(M3 W5, @vrmxg/sense)"
    .replace(/\bsince M\d+ W\d+\b,?/g, 'now')                                           // "since M4 W0 a WebGPU one"
    .replace(/([;,(] ?)M\d+: /g, '$1')                                                   // "wanderer; M3: host, …"
    .replace(/\s*\(W\d+\)/g, '')                                                        // "casting (W6)"
    .replace(/\bM\d+ W\d+[:,]? ?/g, '')                                                  // any left
    .replace(/\bAB-[A-Z]-\d+\b[:,]? ?/g, '')
    .replace(/ ?\(\s*\)/g, '');
}
/** The same, through every description of a schema. */
const publicSchema = (v) => (Array.isArray(v) ? v.map(publicSchema) : v && typeof v === 'object' ? Object.fromEntries(Object.entries(v).map(([k, x]) => [k, k === 'description' && typeof x === 'string' ? publicText(x) : publicSchema(x)])) : v);

/**
 * Text from code goes into pages a Vue compiler reads, so outside code spans and fences a `<` is escaped (a description
 * may say "<clip>.timings.json") and so is `{{`.
 */
function safe(md) {
  return md.split(/(^```[\s\S]*?^```[^\n]*$)/m).map((part, i) => (i % 2 ? part
    : publicText(part).split(/(`+[\s\S]*?`+)/).map((p, k) => (k % 2 ? p : p.replace(/(?<!\\)</g, '\\<').replace(/\{\{/g, '&#123;&#123;'))).join(''))).join('');
}

const GENERATED = (from) => `> Generated from ${from} by \`scripts/docs-reference.mjs\`. Don't edit it: change the code and run \`npm run docs:reference\`.`;

/** A page: front matter (the sidebar and llms.txt read it), a heading, the body. */
function page({ title, description, order, from, body }) {
  return `---\ntitle: ${JSON.stringify(title)}\ndescription: ${JSON.stringify(description)}\norder: ${order}\n---\n\n# ${title}\n\n${GENERATED(from)}\n\n${safe(body.trim())}\n`;
}

/** A `## heading` section of a Markdown file, without its heading. */
function section(rel, heading) {
  const text = read(rel), at = text.indexOf(`\n## ${heading}\n`);
  if (at < 0) throw new Error(`${rel}: no "## ${heading}" section (docs-reference.mjs quotes it)`);
  const rest = text.slice(at + heading.length + 5), end = rest.search(/\n## /);
  return (end < 0 ? rest : rest.slice(0, end)).trim();
}

/** The first match of an anchor in a source file, or an error naming it. */
function grab(rel, re, what) {
  const m = re.exec(read(rel));
  if (!m) throw new Error(`${rel}: ${what} not found (docs-reference.mjs reads it there)`);
  return m;
}

// ---------------------------------------------------------------- the registry

const reg = m0Registry();

/** A prop's type, in words. */
function typeOf(p) {
  const s = p.schema ?? {}, w = p.meta?.widget;
  if (p.nodeRef) return 'node id';
  if (p.assetTypes) return `asset (${p.assetTypes.join(', ')})`;
  if (s.enum) return s.enum.map((v) => code(v)).join(', ');
  if (w === 'vec3') return 'vec3 `[x, y, z]`';
  if (w === 'quat') return 'quaternion `[x, y, z, w]`';
  if (w === 'color') return 'colour `#rrggbb`';
  if (s.type === 'array') return s.items?.type ? `list of ${s.items.type}` : 'list';
  return s.type ?? 'any';
}
const rangeOf = (s) => (s.minimum !== undefined && s.maximum !== undefined ? `${s.minimum} to ${s.maximum}` : s.minimum !== undefined ? `≥ ${s.minimum}` : s.maximum !== undefined ? `≤ ${s.maximum}` : '');
const propRows = (props) => Object.entries(props).map(([k, p]) => [
  code(k), typeOf(p), p.schema?.default !== undefined ? code(JSON.stringify(p.schema.default)) : '', [rangeOf(p.schema ?? {}), p.meta?.unit ?? ''].filter(Boolean).join(' '),
  p.meta?.sim ? 'yes' : '', [p.schema?.description ?? '', conditionsOf(p)].filter(Boolean).join(' '),
]);
/** When a prop applies (AB-T-0602): its visibleIf and enabledIf, as the inspector and MCP's describe read them. */
const conditionsOf = (p) => [p.meta?.visibleIf ? `Applies when ${code(p.meta.visibleIf)}.` : '', p.meta?.enabledIf ? `Editable when ${code(p.meta.enabledIf)}.` : ''].filter(Boolean).join(' ');
const PROP_HEAD = ['Prop', 'Type', 'Default', 'Range, unit', 'Simulated', 'What'];
const argsOf = (args = {}) => Object.entries(args).map(([k, p]) => `${code(k)} (${typeOf(p)}${p.meta?.unit ? `, ${p.meta.unit}` : ''})${p.schema?.description ? `: ${p.schema.description.replace(/\.$/, '')}` : ''}`).join('; ');
const memberRows = (members) => Object.entries(members).map(([k, v]) => [code(k), argsOf(v.args), v.description ?? '']);

/** What a type declares itself, apart from what its parent gave it. */
function own(t, kind) {
  const parent = t.extends ? reg.get(t.extends) : null;
  const mine = {}, inherited = [];
  for (const [k, v] of Object.entries(t[kind])) (parent && parent[kind][k] === v ? inherited.push(k) : (mine[k] = v));
  return { mine, inherited };
}
const chainOf = (t) => { const c = []; for (let x = t.extends ? reg.get(t.extends) : null; x; x = x.extends ? reg.get(x.extends) : null) c.push(x.name); return c; };
const behavioursFor = (type) => [...reg.behaviours.values()].filter((b) => !b.on || b.on.some((o) => reg.isA(type, o))).map((b) => b.name);

function nodesPage() {
  const types = [...reg.types.values()];
  const out = [
    'Every node in a `.vrmxs` scene has a type from the node registry (`@vrmxg/registry`). The registry is the one place',
    'a type\'s props, signals and actions are declared: the scene\'s JSON Schema, the editor\'s inspector and the MCP',
    'tools are all generated from it, and so is this page.',
    '',
    '- A **prop** is saved in the scene under the node\'s `props`. *Simulated* props are inside the determinism boundary:',
    '  they are part of what replays bit for bit. The others are presentation.',
    '- A **signal** is something a node emits. A scene\'s `connections` wire a signal to another node\'s action.',
    '- An **action** is something a node can be told to do: by a connection, a behaviour, or `call_action` over MCP.',
    '- A type that **extends** another has everything its parent has.',
    '',
    `${types.length} types:`,
    '',
    table(['Type', 'Extends', 'Asset', 'What'], types.map((t) => [`[${t.name}](#${slugOf(t.name)})`, t.extends ?? '', t.asset ? `${t.asset.types.map(code).join(', ')}${t.asset.required ? ' (required)' : ''}` : '', t.description])),
  ];
  for (const t of types) {
    const props = own(t, 'props'), signals = own(t, 'signals'), actions = own(t, 'actions'), chain = chainOf(t), accepts = behavioursFor(t.name);
    out.push('', `## ${t.name}`, '', t.description, '');
    if (chain.length) out.push(`- **Extends:** ${chain.map((c) => `[${c}](#${slugOf(c)})`).join(' → ')}`);
    if (t.asset) out.push(`- **Asset:** ${t.asset.required ? 'required' : 'optional'}, of type ${t.asset.types.map(code).join(' or ')} (the node's \`asset\` names an entry in the scene's \`assets\`)`);
    if (t.abstract) out.push('- **Abstract:** a base for other types; not placed in a scene');
    if (t.children) out.push(`- **Children:** only ${t.children.map(code).join(', ')}`);
    out.push(`- **Behaviours it accepts:** ${accepts.length ? accepts.map((b) => `[${code(b)}](./behaviours#${slugOf(b)})`).join(', ') : 'none'}`);
    out.push('', '**Props**', '');
    if (Object.keys(props.mine).length) out.push(table(PROP_HEAD, propRows(props.mine)));
    else out.push(props.inherited.length ? 'None of its own.' : 'None.');
    if (props.inherited.length) out.push('', `Also, from ${t.extends}: ${props.inherited.map(code).join(', ')}.`);
    out.push('', '**Signals**', '');
    if (Object.keys(signals.mine).length) out.push(table(['Signal', 'Arguments', 'What'], memberRows(signals.mine)));
    else out.push(signals.inherited.length ? 'None of its own.' : 'None.');
    if (signals.inherited.length) out.push('', `Also, from ${t.extends}: ${signals.inherited.map(code).join(', ')}.`);
    out.push('', '**Actions**', '');
    if (Object.keys(actions.mine).length) out.push(table(['Action', 'Arguments', 'What'], memberRows(actions.mine)));
    else out.push(actions.inherited.length ? 'None of its own.' : 'None.');
    if (actions.inherited.length) out.push('', `Also, from ${t.extends}: ${actions.inherited.map(code).join(', ')}.`);
  }
  return page({
    title: 'Node types', order: 10, from: '`@vrmxg/registry` (`m0Registry`)',
    description: `The ${types.length} node types of a VRMXG scene, with each one's props, signals and actions.`,
    body: out.join('\n'),
  });
}

/** The state a behaviour declares it keeps (M6 W0), or that it hasn't said. */
function stateOf(b) {
  const s = b.state;
  if (s === undefined) return ['*Not declared.*'];
  const what = (v) => [v.type ? code(Array.isArray(v.type) ? v.type.join(' | ') : v.type) : '', v.description ?? ''].filter(Boolean).join(': ');
  if (s && typeof s === 'object' && s.properties) return [table(['Field', 'Type', 'What'], Object.entries(s.properties).map(([k, v]) => [code(k), v.type ? (Array.isArray(v.type) ? v.type.join(' | ') : v.type) : 'any', v.description ?? '']))];
  return [typeof s === 'boolean' ? code(String(s)) : what(s) || code(JSON.stringify(s))];
}

/** One behaviour's section: what it attaches to, its params, the signals and actions it adds, the state it keeps. */
function behaviourSection(b, heading) {
  const out = ['', `${heading} ${b.name}`, '', b.description || '*No description in the registry.*', '', `- **Attaches to:** ${b.on ? b.on.map((o) => `[${o}](./nodes#${slugOf(o)})`).join(', ') : 'any node'} (and types that extend them)`, '', '**Params**', ''];
  out.push(Object.keys(b.params).length ? table(PROP_HEAD.map((h) => (h === 'Prop' ? 'Param' : h)), propRows(b.params)) : 'None.');
  if (Object.keys(b.signals).length) out.push('', '**Signals it adds**', '', table(['Signal', 'Arguments', 'What'], memberRows(b.signals)));
  if (Object.keys(b.actions).length) out.push('', '**Actions it adds**', '', table(['Action', 'Arguments', 'What'], memberRows(b.actions)));
  if (b.state !== undefined) out.push('', '**State it keeps**', '', ...stateOf(b));
  return out;
}

/** The behaviours the sample game declares (content/sample/game/behaviours.js), as a registry holds them. */
function rushDeclared() {
  const rush = m0Registry();
  return declareProjectBehaviours(rush, rushBehaviours).map((n) => rush.behaviours.get(n));
}

function behavioursPage() {
  const all = [...reg.behaviours.values()];
  const declared = rushDeclared();
  const out = [
    'A behaviour is a named script attached to a node: an entry in the node\'s `behaviours` list, `{ "use": "<name>", …params }`.',
    'The scene holds the name and the params; the project maps the name to code. A scene never carries code, and an',
    'unknown name keeps its data and runs nothing.',
    '',
    'A behaviour can add signals and actions to the node it is on. These are the behaviours the registry declares; a',
    'project can add its own, and [declare them](#project-behaviours) so the editor, validation and MCP know them.',
    '',
    table(['Behaviour', 'Attaches to', 'What'], all.map((b) => [`[${code(b.name)}](#${slugOf(b.name)})`, b.on ? b.on.map((o) => `[${o}](./nodes#${slugOf(o)})`).join(', ') : 'any node', b.description])),
  ];
  for (const b of all) out.push(...behaviourSection(b, '##'));
  out.push(
    '', '## Project behaviours', '',
    'A project\'s behaviours module (`behaviours` in [game.json](./game-json)) exports behaviour classes under the names its',
    'scenes use. A class declares itself with a static `describe`: the same definition the registry\'s own behaviours',
    'have, `{ description, on, params, signals, actions, state }`. Params and arguments are JSON Schema; beside a',
    'schema\'s own keywords a param may say `unit`, `widget`, `step`, `precision`, `visibleIf`, `enabledIf`, and',
    '`nodeRef: true` (a node id) or `assetTypes` (an asset reference). `state` is the JSON Schema of what the behaviour\'s',
    '`getState` returns: a behaviour without it hasn\'t declared its state, and `{ "type": "null" }` declares that it keeps',
    'none. Saves are checked against it: what they compare is its shape, the schema with its annotations (`description`,',
    '`title`, `examples`, `$comment`) taken out and its keys sorted, so rewording a description or reordering keys',
    'changes nothing (`stateShape` in `@vrmxg/registry`).',
    '',
    'When a project loads (the editor, the game runtime, the MCP server), its declarations sit in the registry beside',
    'the engine\'s: their params are checked against their schemas, a scene may connect their signals and call their',
    'actions, and MCP\'s `describe` lists them (marked `project`). A declaration with the name of one of the engine\'s',
    'behaviours is an error, and so is a schema that isn\'t JSON Schema or a key a definition doesn\'t have. A class with',
    'no `describe` of its own is code only (a subclass doesn\'t inherit its parent\'s): a scene that uses it validates with',
    'a warning.',
    '',
    'A build takes only the module `game.json` names, so name it (the editor\'s Project Settings › Behaviours writes it).',
    'The editor\'s Play in place also runs a `behaviours.js` at the project\'s root that `game.json` doesn\'t name, and its',
    'Export Game refuses such a project rather than build it without its behaviours. The editor reads the module when the',
    'project opens and again before a Play when it has changed; while it plays, saving the module reloads it in place,',
    'a behaviour keeping its state when its declared state has the same shape and starting again on its node when it',
    'hasn\'t. The [tutorial](../guide/tutorial) writes one, attaches it and wires its signal.',
    '',
    '```js',
    'import { Behaviour } from \'@vrmxg/core\';',
    'export class tableZone extends Behaviour {',
    '  static describe = {',
    '    on: [\'Area\'],',
    '    params: { customer: { type: \'string\', nodeRef: true }, points: { type: \'integer\', minimum: 0, default: 10 } },',
    '    signals: { served: { args: { right: { type: \'boolean\' } } } },',
    '    state: { type: \'object\', properties: { done: { type: \'boolean\' } } },',
    '  };',
    '  // ready(), physicsProcess(), getState(), setState() …',
    '}',
    '```',
    '',
    `The sample game, "The Morning Rush", declares ${declared.length} (\`content/sample/game/behaviours.js\`):`,
  );
  for (const b of declared) out.push(...behaviourSection(b, '###'));
  return page({
    title: 'Behaviours', order: 20, from: '`@vrmxg/registry` (`m0Registry`)',
    description: `The ${all.length} behaviours the registry declares, with their params and the signals and actions they add, and how a project declares its own.`,
    body: out.join('\n'),
  });
}

// ---------------------------------------------------------------- MCP

const SERVER = 'engine/packages/mcp/src/server.js';
const usage = grab(SERVER, /console\.error\('usage: ([^']+)'\)/, 'the usage line')[1].split(' | ');
const editorPort = Number(grab(SERVER, /new EditorBridge\(\{ port: opt\('--port'\) \? Number\(opt\('--port'\)\) : (\d+)/, 'the editor bridge\'s default port')[1]);
const creatorPort = Number(grab(SERVER, /app: 'creator', port: opt\('--port'\) \? Number\(opt\('--port'\)\) : (\d+)/, 'the creator bridge\'s default port')[1]);
const headless = toolList(reg, 'headless'), editor = toolList(reg, 'editor'), shorts = shortToolList();
const commands = creatorCommands();

/** A tool's input schema, with the long generated enums (every node type) cut to a note. */
function shownSchema(s) {
  return JSON.parse(JSON.stringify(s, (k, v) => (k === 'enum' && Array.isArray(v) && v.length > 12 ? [`… ${v.length} values: see the reference`] : v)));
}

function mcpPage() {
  const names = [...new Set([...headless, ...editor].map((t) => t.name))];
  const by = (list) => new Map(list.map((t) => [t.name, t]));
  const H = by(headless), E = by(editor);
  const where = (n) => (H.has(n) && E.has(n) ? 'headless, editor' : H.has(n) ? 'headless' : 'editor');
  const out = [
    'VRMXG has one MCP server, `vrmxg-mcp` (`engine/packages/mcp/src/server.js`), on stdio, in three modes. Each mode has a',
    'small, generic tool list: node types and creator commands are described on demand (`describe`) instead of each',
    'getting a tool.',
    '',
    table(['Mode', 'Started as', 'Works on', 'Tools'], [
      ['Headless', code(usage[0]), 'One scene file of one project, edited with undo, and a headless engine in Node', String(headless.length)],
      ['Editor', code(usage[1]), `The scene open in the VRMXG editor, through its own undo and its play world. The server listens on 127.0.0.1:${editorPort}; the editor connects to it`, String(editor.length)],
      ['Creator', code(usage[2]), `The short open in the VRMXG creator. The server listens on 127.0.0.1:${creatorPort}; the creator connects to it`, String(shorts.length)],
    ]),
    '',
    'From a checkout, `vrmxg-mcp` is `node engine/packages/mcp/src/server.js`. See [Agents and MCP](../guide/agents) for how to register it.',
    '',
    `Answers are compact JSON, cut at ${OUTPUT_LIMIT.toLocaleString('en-US')} characters with a note. Errors come back as text an agent can act on.`,
    '',
    '## Scene tools (headless and editor)',
    '',
    'What the server tells a client at initialize:',
    '',
    `> ${INSTRUCTIONS}`,
    '',
    table(['Tool', 'In', 'What'], names.map((n) => [`[${code(n)}](#${slugOf(n)})`, where(n), (H.get(n) ?? E.get(n)).description])),
  ];
  for (const n of names) {
    const h = H.get(n), e = E.get(n), t = h ?? e;
    out.push('', `### ${n}`, '', `*${where(n)}*`, '', t.description);
    if (h && e && e.description !== h.description) out.push('', `In the editor: ${e.description}`);
    out.push('', json(shownSchema(t.inputSchema)));
    if (h && e && JSON.stringify(e.inputSchema) !== JSON.stringify(h.inputSchema)) out.push('', 'In the editor, the input is:', '', json(shownSchema(e.inputSchema)));
  }
  out.push(
    '', '## Creator tools', '',
    'What the server tells a client at initialize:', '', `> ${SHORT_INSTRUCTIONS}`, '',
    `Every edit a command makes is one step of the creator's own Undo, marked \`(${AGENT_MARK})\`. Text read from the project's files comes back inside a \`content\` field, with this note:`,
    '', `> ${CONTENT_NOTE}`, '',
    table(['Tool', 'What'], shorts.map((t) => [`[${code(t.name)}](#${slugOf(t.name)}-creator)`, t.description])),
  );
  for (const t of shorts) out.push('', `### ${t.name} (creator)`, '', t.description, '', json(t.inputSchema));
  out.push('', `The \`command\` tool runs one of the creator's ${commands.commands.size} commands: see [Creator commands](./creator-commands).`);
  return page({
    title: 'MCP servers and tools', order: 30, from: '`@vrmxg/mcp` (`toolList`, `shortToolList`, `src/server.js`)',
    description: `The vrmxg-mcp server's three modes (headless, editor, creator) and every tool with its input schema.`,
    body: out.join('\n'),
  });
}

function commandsPage() {
  const list = [...commands.commands.values()];
  const out = [
    'What an agent can do in the VRMXG creator. The creator\'s MCP tool list stays at',
    `${shorts.length} tools whatever is added here: \`describe\` lists these commands and returns one command's schema, and`,
    '`command` runs one, checked against that schema. See [MCP servers and tools](./mcp#creator-tools).',
    '',
    `A command that **edits** makes exactly one step of the creator's Undo, marked \`(${AGENT_MARK})\`; \`undo\` takes it back.`,
    'A command that doesn\'t edit (queueing an export, saving) makes no undo step.',
    '',
    table(['Command', 'Edits', 'What'], list.map((c) => [`[${code(c.name)}](#${slugOf(c.name)})`, c.edit ? 'yes' : 'no', c.summary])),
  ];
  for (const c of list) {
    out.push('', `## ${c.name}`, '', c.summary);
    if (c.description) out.push('', c.description);
    out.push('', `- **Edits the short:** ${c.edit ? 'yes, as one undo step' : 'no'}`, '', '**Arguments**', '', json(c.schema));
  }
  return page({
    title: 'Creator commands', order: 40, from: '`apps/creator/src/agent.js` (`creatorCommands`)',
    description: `The ${list.length} commands an agent runs in the creator through the command tool, each with its JSON Schema.`,
    body: out.join('\n'),
  });
}

// ---------------------------------------------------------------- formats

const schema = documentSchema(reg);
const SCHEMA_FILE = 'schemas/vrmxs-1.schema.json';

/** The schema as text: readable at the top, one node type or behaviour per line below, so a change is a small diff. */
function schemaText() {
  const { $defs, ...top } = publicSchema(schema);
  const head = JSON.stringify(top, null, 2).replace(/\n\}$/, '');
  const defs = Object.entries($defs).map(([k, v]) => `    ${JSON.stringify(k)}: ${JSON.stringify(v)}`).join(',\n');
  return `${head},\n  "$defs": {\n${defs}\n  }\n}\n`;
}

const fieldRows = (s) => Object.entries(s.properties).map(([k, v]) => [code(k), (s.required ?? []).includes(k) ? 'yes' : '', v.const !== undefined ? `always ${code(JSON.stringify(v.const))}` : v.enum ? v.enum.map(code).join(', ') : (v.type ?? ''), v.description ?? '']);

function vrmxsPage() {
  const p = schema.properties, node = reg.get('Node3D') && schema.$defs['node.Node3D'], inst = schema.$defs['node.Instance'];
  const sample = read('content/sample/prefabs/door.vrmxs');
  const out = [
    'A `.vrmxs` file is a scene: a saved node tree, as JSON. A set, a prefab and a sequence are all `.vrmxs` files.',
    'This page lists what the document schema checks. For the ideas behind the format, see [The scene format](../guide/scene-format).',
    '',
    `The whole schema, as JSON Schema 2020-12: [\`${SCHEMA_FILE.split('/').pop()}\`](/${SCHEMA_FILE}). It is generated from the node registry, so it`,
    'checks every [node type](./nodes) and [behaviour](./behaviours) listed in this reference. Unknown node types, props and',
    'behaviours pass the schema and are kept when a scene is read and written back; lint reports them as warnings.',
    '',
    '## The document',
    '',
    table(['Field', 'Required', 'Type', 'What'], Object.entries(p).map(([k, v]) => [code(k), schema.required.includes(k) ? 'yes' : '', v.const !== undefined ? `always ${code(JSON.stringify(v.const))}` : v.type, v.description ?? ({ id: 'The scene\'s id.', assets: 'The files the scene uses: see below.', nodes: 'The nodes, as a flat list: see below. Order in the list is sibling order.', connections: 'Signals wired to actions: see below.', settings: 'Scene settings (physics, personas and others), an open object.', format: '', version: '' })[k] ?? ''])),
    '',
    'Other top-level keys are allowed and kept. A sequence adds `set` (the set scene it films) and a `sequence` block;',
    'those are checked by `@vrmxg/sequence`\'s `checkSequence`, not by this schema.',
    '',
    '## An asset',
    '',
    'One entry of `assets`. Nodes name an asset by its `id`.',
    '',
    table(['Field', 'Required', 'Type', 'What'], fieldRows(p.assets.items).map((r) => (r[3] ? r : [...r.slice(0, 3), ({ '`id`': 'The id nodes name it by.', '`type`': 'What kind of file it is.', '`sha256`': 'The file\'s SHA-256, as 64 hex digits.' })[r[0]] ?? '']))),
    '',
    '## A node',
    '',
    'One entry of `nodes`. Every node has these fields; its type adds the props listed under [Node types](./nodes).',
    '',
    table(['Field', 'Required', 'Type', 'What'], Object.entries(node.properties).map(([k, v]) => [code(k), node.required.includes(k) ? 'yes' : '', k === 'type' ? 'string' : (v.type ?? ''), ({ type: 'A node type from the registry.', parent: 'The parent node\'s id; none for a root.', name: 'A display name.', tags: 'Free-form tags, each once.', props: 'The type\'s props.', behaviours: 'A list of `{ "use": "<behaviour>", …params }`.' })[k] ?? v.description ?? ''])),
    '',
    `- A node id matches ${code(node.properties.id.pattern)}.`,
    '- A node whose type takes an asset also has `asset`: the id of an entry in `assets`.',
    '',
    '**`transform`**', '',
    `${node.properties.transform.description}`, '',
    table(['Field', 'Type', 'What'], Object.entries(node.properties.transform.properties).map(([k, v]) => [code(k), `${v.minItems} numbers`, v.description])),
    '',
    '**`overrides`** (an `Instance` node only)', '',
    inst.properties.overrides.description, '',
    `An override may set ${Object.keys(inst.properties.overrides.additionalProperties.properties).map(code).join(', ')}, and nothing else.`,
    '',
    '## A connection',
    '',
    'One entry of `connections`: when `from` emits `signal`, `call` runs on `to`.',
    '',
    table(['Field', 'Required', 'Type', 'What'], fieldRows(p.connections.items).map((r) => (r[3] ? r : [...r.slice(0, 3), ({ '`signal`': 'A signal the `from` node has (its type\'s, or a behaviour\'s).', '`call`': 'An action the `to` node has.', '`args`': 'Arguments for the action.' })[r[0]] ?? '']))),
    '',
    '## An example',
    '',
    'The sample project\'s door prefab (`content/sample/prefabs/door.vrmxs`), in the canonical form `@vrmxg/scene` writes:',
    'one asset, node and connection per line, keys in a fixed order, so one edit is a one-line diff.',
    '',
    fence(sample, 'json'),
  ];
  return page({
    title: 'The .vrmxs scene file', order: 50, from: '`@vrmxg/scene` (`documentSchema`) over the registry',
    description: 'Every field of a .vrmxs scene document, with the JSON Schema it is checked against.',
    body: out.join('\n'),
  });
}

function fountainPage() {
  const README = 'engine/packages/script/README.md';
  const subset = section(README, 'The Fountain subset');
  const sample = read('content/sample/scripts/cafe-order.fountain');
  const parsed = parseScript(sample);
  if (parsed.errors.length) throw new Error(`content/sample/scripts/cafe-order.fountain has errors: ${parsed.errors.map((e) => `${e.line}: ${e.message}`).join('; ')}`);
  const words = (o) => Object.entries(o).map(([w, to]) => [code(w), code(to)]);
  const T = TIMING;
  const out = [
    'A VRMXG script is plain text in a subset of [Fountain](https://fountain.io), the screenplay format. `@vrmxg/script`',
    'reads it with its own parser and builds a sequence from it: shots, the cast on their marks, dialogue, looks, a',
    'default performance and cameras. Errors point at script lines.',
    '',
    '## The subset',
    '',
    'From the package\'s own README (`engine/packages/script/README.md`):',
    '',
    subset,
    '',
    '## Vocabulary',
    '',
    'What tags and parentheticals may ask for. Casting narrows the expressions to what a character\'s persona allows.',
    '',
    table(['Kind', 'Written as', 'Values'], [
      ['Gesture tag', '`[[nod]]`', GESTURES.map(code).join(', ')],
      ['Expression tag', '`[[happy]]`', EXPRESSIONS.map(code).join(', ')],
      ['Tag with a value', '`[[look: MIRA]]`', KEYED_TAGS.map(code).join(', ')],
    ]),
    '',
    '**Words in a parenthetical**, matched as whole words in lower case:',
    '',
    table(['Word', 'Raises the expression'], words(PAREN_WORDS.expression)),
    '',
    table(['Word', 'Plays the gesture'], words(PAREN_WORDS.gesture)),
    '',
    table(['Word', 'Adds silence'], Object.entries(PAREN_WORDS.pause).map(([w, s]) => [code(w), `${s} s`])),
    '',
    '## Timing defaults',
    '',
    'How long the build gives each element before a line is voiced. A voiced line takes its clip\'s length instead.',
    '',
    table(['What', 'Value'], [
      ['A scene heading\'s establishing shot', `${T.establish} s`],
      ['Action', `${T.actionPerWord} s a word, between ${T.actionMin} and ${T.actionMax} s`],
      ['A line of dialogue', `${T.speechLead} s, plus ${T.speechPerWord} s a word, between ${T.speechMin} and ${T.speechMax} s`],
      ['Silence after each line', `${T.gap} s`],
      ['Silence after the last beat', `${T.tail} s`],
      ['A gesture', `${T.gesture} s`],
      ['An expression', `rises over ${T.rise} frames to a weight of ${T.weight}, falls over ${T.fall} frames`],
      ['A dissolve', `${T.dissolve} frames`],
    ]),
    '',
    '## An example',
    '',
    `The sample project's "${parsed.title?.title ?? 'script'}" (\`content/sample/scripts/cafe-order.fountain\`). It parses into ${parsed.beats.length} beats with no errors.`,
    '',
    fence(sample, 'text'),
  ];
  return page({
    title: 'The Fountain subset', order: 60, from: '`@vrmxg/script` (`src/vocab.js`, its README) and the sample script',
    description: 'The screenplay syntax a VRMXG script is written in: elements, tags, parenthetical words and timing defaults.',
    body: out.join('\n'),
  });
}

/** The keys an object literal in source text declares at its top level, in order (shorthand keys too). */
function topKeys(literal) {
  const keys = [];
  let depth = 0, quote = null, expectKey = false;
  for (let i = 0; i < literal.length; i++) {
    const c = literal[i];
    if (quote) { if (c === '\\') i++; else if (c === quote) quote = null; continue; }
    if (c === '\'' || c === '"' || c === '`') { quote = c; expectKey = false; continue; }
    if ('{[('.includes(c)) { depth++; expectKey = depth === 1 && c === '{'; continue; }
    if ('}])'.includes(c)) { depth--; expectKey = false; continue; }
    if (depth !== 1) continue;
    if (c === ',') { expectKey = true; continue; }
    if (/\s/.test(c)) continue;
    if (expectKey) { const m = /^[A-Za-z_]\w*/.exec(literal.slice(i)); if (m) { keys.push(m[0]); i += m[0].length - 1; } }
    expectKey = false;
  }
  return keys;
}

/** Field notes for a format with no schema, checked against the keys the code writes: a new or renamed key is an error. */
function notedFields(keys, notes, what) {
  const missing = keys.filter((k) => !(k in notes)), gone = Object.keys(notes).filter((k) => !keys.includes(k));
  if (missing.length || gone.length) throw new Error(`${what}: docs-reference.mjs describes its fields by name, and they changed (${[missing.length ? `not described: ${missing.join(', ')}` : '', gone.length ? `no longer written: ${gone.join(', ')}` : ''].filter(Boolean).join('; ')}). Update the notes in scripts/docs-reference.mjs.`);
  return keys.map((k) => [code(k), notes[k]]);
}

function shortsPage() {
  const sampleText = read(`content/sample/${SHORTS_FILE}`);
  const sampleFiles = ['scripts/cafe-order.fountain', 'scripts/cafe-marks.json', 'sequences/cafe-order.vrmxs', 'scripts/first-light.fountain'];
  const texts = { 'scripts/cafe-order.fountain': read('content/sample/scripts/cafe-order.fountain'), 'scripts/first-light.fountain': 'Title: First Light\n\nINT. ROOM - DAY\n\nA lamp comes on.\n' };
  const found = readShorts(sampleFiles, null, texts);
  readShorts(sampleFiles, sampleText); // the sample's own file must read
  const written = JSON.parse(shortsManifest([{ id: 'a', title: 'A', script: 's', sequence: 'q', marks: 'm', set: 't', coverage: COVERAGE[0] }]));
  const notes = {
    id: 'The short\'s id. Required. Its sequence is named after it by default.',
    title: 'The title shown in the creator. Defaults to the id.',
    script: 'The Fountain script, a path under the project. Required.',
    sequence: 'The sequence the script builds, a `.vrmxs` under the project. Defaults to `sequences/<id>.vrmxs`.',
    marks: 'A marks file (where the cast stands), if the short has one.',
    set: 'The set scene the short is filmed in, if named here; the script\'s title page (`Set:`) also names it.',
    coverage: `How the short's cameras are made: ${COVERAGE.map(code).join(' or ')}. \`rule\` is \`@vrmxg/coverage\`'s cameras by rule; \`default\` is the script build's wide and close-ups. When left out, a short whose sequence already exists is \`default\` (so opening it changes nothing) and a new one is \`rule\`.`,
  };
  const out = [
    `\`${SHORTS_FILE}\`, at the root of a project, lists the project's shorts for the VRMXG creator: which script builds`,
    'which sequence, in which set, with which cameras.',
    '',
    table(['Field', 'Value'], [['`format`', `always ${code(JSON.stringify(SHORTS_FORMAT))}`], ['`version`', `always ${code(String(written.version))}; a newer version is refused`], ['`shorts`', 'The list, in the order the creator shows it']]),
    '',
    '## A short',
    '',
    table(['Field', 'What'], notedFields(Object.keys(written.shorts[0]), notes, `${SHORTS_FILE} (shortsManifest in apps/creator/src/shorts.js)`)),
    '',
    'Saving in the creator writes the file with these keys in this order.',
    '',
    '## A project without one',
    '',
    `A project with no \`${SHORTS_FILE}\` has a short for each \`scripts/*.fountain\`. For a project holding`,
    `${sampleFiles.map(code).join(', ')}, the creator finds:`,
    '',
    json(found),
    '',
    'The title and the set come from each script\'s title page (`Title:`, `Set:`); a script without a title is called by its id.',
    'The marks are `scripts/<id>-marks.json` when that file exists, else the set\'s (`scripts/<set>-marks.json`, once the',
    'script\'s title page names a set), else none.',
    '',
    '## The sample project\'s',
    '',
    `\`content/sample/${SHORTS_FILE}\`:`,
    '',
    fence(sampleText, 'json'),
  ];
  return page({
    title: 'shorts.json', order: 70, from: '`apps/creator/src/shorts.js` and the sample project',
    description: 'The file that lists a project\'s shorts for the creator: each short\'s script, sequence, marks, set and cameras.',
    body: out.join('\n'),
  });
}

function deliveryPage() {
  const SRC = 'apps/creator/src/delivery.js';
  const literal = grab(SRC, /\n( {2}const manifest = \{\n[\s\S]*?\n {2}\};)\n/, 'the manifest literal (const manifest = { … };)')[1];
  const still = grab(SRC, /manifest\.stills\.push\((\{[^}]*\})\)/, 'the still entry (manifest.stills.push)')[1];
  const thumb = grab(SRC, /manifest\.thumbnails\.push\((\{[^}]*\})\)/, 'the thumbnail entry (manifest.thumbnails.push)')[1];
  const turn = grab(SRC, /\n {4}return (\{ character: id,[^\n]*\});\n/, 'the turntable entry (turntable\'s return)')[1];
  const notes = {
    format: 'Always `"vrmxg-delivery"`.',
    version: 'Always `1`.',
    short: 'The short\'s id.',
    title: 'Its title, or null.',
    preset: 'The preset the job was queued at (below), or null.',
    size: 'The frame size, `[width, height]` in pixels.',
    fps: 'The frame rate as a fraction, `[numerator, denominator]`.',
    codec: 'The codec\'s key (below).',
    backend: 'The renderer that drew the film: `webgpu` or `webgl`.',
    check: 'The redraw check the job ran with: `redraw` (each frame drawn twice and compared) or null.',
    film: 'The film: its path, frame count, a digest of every frame\'s hash, the sound\'s hash, timings, the check\'s counts, and whether it was written to disk.',
    subtitles: 'The `.srt`: its path, line count and hash; null when the film has none.',
    stills: 'One entry per shot: the shot\'s middle frame as a PNG at the delivery size, kept from the film\'s own frames.',
    thumbnails: `The same frames boxed down to ${THUMB[0]}×${THUMB[1]}.`,
    turntables: 'One entry per character: a movie of the camera going once round the character alone.',
    ms: 'Milliseconds spent on the film, the stills, the turntables and in total.',
  };
  const stillNotes = { shot: 'The shot\'s id.', frame: 'The frame of the film it is.', path: 'Its path under the project.', bytes: 'The file\'s size.', hash: 'FNV-1a over the file\'s bytes, 8 hex digits.' };
  const turnNotes = { character: 'The character\'s node id.', path: 'Its path under the project.', frames: 'Frame count.', seconds: 'Length.', frameDigest: 'A digest of every frame\'s hash.', framing: 'The orbit: its centre, radius and starting angle.', ms: 'Timings.', check: 'The redraw check\'s counts.', written: 'Whether it was written to disk.' };
  const files = deliveryFiles({ base: 'the-order-1080p24-h264', ext: CODECS.h264.ext, stills: [{ shot: 's010' }, { shot: 's020' }], turntables: ['hana-1', 'mira'], subtitles: true });
  const extras = (e) => (e ? Object.entries(e).filter(([, v]) => v).map(([k]) => k).join(', ') : '');
  const out = [
    'A delivery is a folder the creator\'s render queue writes into the open project: the film with its sound, subtitles,',
    'a still and a thumbnail per shot, a turntable per character, and `delivery.json`, which names every file with its',
    'hash. The folder is `deliveries/<name>/`.',
    '',
    '## Presets',
    '',
    'A job is queued at a preset. The film presets render the film alone; the delivery presets write the folder.',
    '',
    table(['Preset', 'Label', 'Size', 'Frame rate', 'Codec', 'Extras', 'Redraw check'], Object.entries(PRESETS).map(([k, p]) => [
      code(k), p.label, `${p.size} (${SIZES[p.size].join('×')})`, p.fps === null ? 'the sequence\'s' : String(p.fps), `${CODECS[p.codec].label} (.${CODECS[p.codec].ext})`, extras(p.extras), p.check === 'auto' ? 'on WebGPU' : p.check === 'redraw' ? 'always' : '',
    ])),
    '',
    `Every preset renders with sound and subtitles. A job's state is one of ${JOB_STATES.map(code).join(', ')}.`,
    '',
    '## The folder',
    '',
    'For a job named `the-order-1080p24-h264`, with two shots and two characters:',
    '',
    json(files),
    '',
    '## delivery.json',
    '',
    table(['Field', 'What'], notedFields(topKeys(literal), notes, `delivery.json (the manifest literal in ${SRC})`)),
    '',
    '**A still or a thumbnail**', '',
    table(['Field', 'What'], notedFields(topKeys(still), stillNotes, `delivery.json's still entry (${SRC})`)),
    '',
    '**A turntable**', '',
    table(['Field', 'What'], notedFields(topKeys(turn), turnNotes, `delivery.json's turntable entry (${SRC})`)),
    '',
    'The format has no schema yet. This is the code that writes it, quoted from `apps/creator/src/delivery.js`:',
    '',
    fence([literal.replace(/^ {2}/gm, ''), `manifest.stills.push(${still});`, `manifest.thumbnails.push(${thumb});`, `manifest.turntables.push(${turn});`].join('\n'), 'js'),
  ];
  if (JSON.stringify(topKeys(still)) !== JSON.stringify(topKeys(thumb))) throw new Error(`${SRC}: a still's entry and a thumbnail's no longer have the same fields; describe them apart in docs-reference.mjs`);
  return page({
    title: 'delivery.json', order: 80, from: '`@vrmxg/editor-core` (presets), `@vrmxg/export` (`deliveryFiles`) and `apps/creator/src/delivery.js`',
    description: 'What a delivery folder holds, the render queue\'s presets, and the manifest that names every file with its hash.',
    body: out.join('\n'),
  });
}

// ---------------------------------------------------------------- packages

/**
 * A package's line: the opening of its README, without the milestone tag it starts with ("M2 W7 (AB-T-0530).") or
 * bridge ids in brackets, up to the first full stop that makes a sentence of some length.
 */
const BUNDLE_README = 'engine/packages/bundle/README.md';

function gameJsonPage() {
  const sampleText = read(`content/sample/${GAME_FILE}`), checked = checkGame(JSON.parse(sampleText));
  const body = section(BUNDLE_README, `The game document: \`${GAME_FILE}\``).replace(' (below)', '');
  const out = [
    body,
    '',
    'An export follows every string in the game\'s documents that reads as a path to one of the project\'s files; one that',
    'names no file stops it, with the line to add. `ignore` lists the strings that only look like files (a line of text',
    'that ends in `.wav`), so the export passes them by.',
    '',
    `\`format\` is always ${code(JSON.stringify(GAME_FORMAT))} and \`version\` ${code(String(GAME_VERSION))}; another version, or a key not in the table, is refused with a message naming it.`,
    '',
    '## How it is read',
    '',
    'The exporter checks the document and fills in its defaults before anything else (`checkGame` in `@vrmxg/bundle`). The',
    'scenes come back sorted, with the entry among them; `include` and `ignore` sorted, each name once; the title trimmed.',
    'What it reads from the sample project\'s file is what goes into a build\'s manifest as `game`:',
    '',
    json(checked),
    '',
    'The rules of a game are not here: they are nodes in its scenes (`GameRules`, `GameCounter`, `GameTimer`, `GameGoal`,',
    '`Checkpoint`; see [Node types](./nodes)). The MCP `game` tool reads both together: every scene\'s rules, a check of',
    'the whole project, and an export.',
    '',
    '## The sample project\'s',
    '',
    `\`content/sample/${GAME_FILE}\`:`,
    '',
    fence(sampleText, 'json'),
  ];
  return page({
    title: GAME_FILE, order: 82, from: `\`@vrmxg/bundle\` (\`checkGame\`, its README) and the sample project`,
    description: 'The game document: the scene a game starts in, the scenes it can reach, its behaviours, input map and the files no document names.',
    body: out.join('\n'),
  });
}

function buildJsonPage() {
  const enc = (t) => new TextEncoder().encode(t);
  const rt = runtimeTable({ name: 'my-runtime', runtimeVersion: '1.0.0', files: [{ path: 'index.html', bytes: enc('<!doctype html>'), licence: 'Ours' }] });
  const project = enc('{"format":"vrmxg-game"}\n');
  const manifest = makeManifest({
    game: checkGame({ format: GAME_FORMAT, version: GAME_VERSION, id: 'my-game', entry: 'level.vrmxs' }),
    runtime: rt,
    files: [
      { path: 'index.html', role: 'runtime', bytes: rt.files[0].bytes, sha256: rt.files[0].sha256, licence: 'Ours' },
      { path: `${PROJECT_DIR}${GAME_FILE}`, role: 'project', bytes: project.length, sha256: sha256(project), licence: 'Ours' },
    ],
  });
  const out = [
    `A game build is a web folder: the runtime, the project's files under \`${PROJECT_DIR}\`, and \`${BUILD_FILE}\`, which lists`,
    `every other file with its SHA-256 and its licence. \`format\` is ${code(JSON.stringify(BUILD_FORMAT))}, \`version\` ${code(String(BUILD_VERSION))}, and a`,
    `runtime keeps contract ${RUNTIME_CONTRACT} (its own table is \`${RUNTIME_FILE}\`).`,
    '',
    '## Layout',
    '',
    section(BUNDLE_README, 'A build\'s layout'),
    '',
    '## The manifest',
    '',
    section(BUNDLE_README, `The manifest: \`${BUILD_FILE}\``).replace(/^```json\n[\s\S]*?\n```\n*/m, '').replace('filled in (below)', `filled in (see [${GAME_FILE}](./game-json))`),
    '',
    '## Saves across updates',
    '',
    section(BUNDLE_README, 'Saves across updates: the compatibility fingerprint'),
    '',
    '## A whole manifest',
    '',
    'Of a build with one runtime file and one project file, as the exporter writes it (`makeManifest`, `serializeManifest`):',
    '',
    fence(serializeManifest(manifest), 'json'),
  ];
  return page({
    title: BUILD_FILE, order: 84, from: `\`@vrmxg/bundle\` (\`makeManifest\`, its README)`,
    description: 'A game build\'s manifest: the game, the runtime it was made with, and every file with its SHA-256 and licence.',
    body: out.join('\n'),
  });
}

function readmeLine(text) {
  const lines = text.split('\n');
  let i = lines.findIndex((l) => l.startsWith('# ')) + 1;
  while (i < lines.length && !lines[i].trim()) i++;
  const para = [];
  for (; i < lines.length && lines[i].trim() && !/^(\s*[-*] |```|\||#)/.test(lines[i]); i++) para.push(lines[i].trim());
  let s = para.join(' ');
  s = s.replace(/^(?:M\d+ W\d+(?: \([^)]*\))?(?:, )?)+\.\s+/, '');           // "M0 W7 (AB-T-0508), M1 W9 (AB-T-0521). "
  s = s.replace(/\s*\((?:(?:M\d+ W\d+|AB-[A-Z]-\d+|decision AB-D-\d+|M\d+ done-check \d+)(?:[,;] )?)+\)/g, ''); // " (AB-R-0926)"
  const cut = /^(.{25,}?[.!?])(?=\s+[A-Z`[*]|$)/.exec(s);
  let line = oneLine((cut ? cut[1] : s).replace(/:$/, '.'));
  if (line.length > 220) { // one long sentence: stop at the last clause that fits
    const head = line.slice(0, 220), at = Math.max(head.lastIndexOf(', '), head.lastIndexOf('; '), head.lastIndexOf(': '));
    line = `${head.slice(0, at > 80 ? at : 220).replace(/\s+\S*$/, (m) => (at > 80 ? m : ''))} …`;
  }
  return line;
}

function packages() {
  const dir = path.join(root, 'engine/packages');
  return fs.readdirSync(dir).sort().filter((d) => fs.existsSync(path.join(dir, d, 'package.json'))).map((d) => {
    const pkg = JSON.parse(read(`engine/packages/${d}/package.json`));
    const readme = fs.existsSync(path.join(dir, d, 'README.md')) ? `engine/packages/${d}/README.md` : null;
    const line = readme ? readmeLine(read(readme)) : oneLine(pkg.description ?? '');
    if (!line) throw new Error(`engine/packages/${d}: no README opening and no package.json description to describe it by`);
    return { dir: d, name: pkg.name, version: pkg.version, boundary: pkg.vrmxg?.determinism ?? null, line, readme };
  });
}

function packagesPage(list) {
  const out = [
    `The engine is ${list.length} packages under \`engine/packages/\`, each with its own tests. Until a package has pages of its own`,
    'here, its README in the repository is its manual.',
    '',
    '**Boundary** says which side of the determinism boundary a package\'s code is on ([Determinism](../guide/determinism)):',
    '`simulation` packages are held to the `vrmxg/deterministic` lint rule, `tooling` packages work on documents, and the',
    'rest are presentation or run outside the 60 Hz step.',
    '',
    table(['Package', 'Version', 'Boundary', 'What', 'Manual'], list.map((p) => [code(p.name), p.version, p.boundary ?? '', p.line, p.readme ? code(p.readme) : 'none yet: read `src/`'])),
  ];
  return page({
    title: 'Packages', order: 90, from: 'every `engine/packages/*`: its `package.json` and the opening of its README',
    description: `The ${list.length} engine packages, one line each, and which side of the determinism boundary each is on.`,
    body: out.join('\n'),
  });
}

function indexPage(pages) {
  const out = [
    'Every page in this section is written by a script from the engine\'s own code and data, and `npm run check` fails',
    'when one is out of date. If a page here disagrees with the engine, the build is broken, not the page.',
    '',
    table(['Page', 'What', 'Generated from'], pages.map((p) => [`[${p.title}](./${p.name})`, p.description, p.from])),
    '',
    'For agents, [`llms.txt`](/llms.txt) indexes the whole site, and every page is also served as Markdown: add `.md` to',
    'its address.',
  ];
  return `---\ntitle: "Overview"\ndescription: "What the generated reference covers, and what each page is generated from."\norder: 0\n---\n\n# Reference\n\n${GENERATED('the code')}\n\n${safe(out.join('\n'))}\n`;
}

// ---------------------------------------------------------------- build

const pkgs = packages();
const built = [
  ['nodes', nodesPage()], ['behaviours', behavioursPage()], ['mcp', mcpPage()], ['creator-commands', commandsPage()],
  ['vrmxs', vrmxsPage()], ['fountain', fountainPage()], ['shorts-json', shortsPage()], ['delivery-json', deliveryPage()],
  ['game-json', gameJsonPage()], ['build-json', buildJsonPage()], ['packages', packagesPage(pkgs)],
];
const meta = (text) => ({ title: JSON.parse(/^title: (.*)$/m.exec(text)[1]), description: JSON.parse(/^description: (.*)$/m.exec(text)[1]), from: /^> Generated from (.*) by `scripts/m.exec(text)[1] });
/** @type {Map<string, string>} path under docs/ → content */
const files = new Map();
files.set('reference/index.md', indexPage(built.map(([name, text]) => ({ name, ...meta(text) }))));
for (const [name, text] of built) files.set(`reference/${name}.md`, text);
files.set(`public/${SCHEMA_FILE}`, schemaText());

// The skill's own description (its front matter), so the index and the skill say the same thing.
const SKILL_FILE = 'skills/vrmxg/SKILL.md';
const skillDescription = (() => {
  const m = /^---\n[\s\S]*?^description: (.+)$/m.exec(read(SKILL_FILE));
  if (!m) throw new Error(`${SKILL_FILE}: no description in its front matter (docs-reference.mjs quotes it)`);
  return m[1].replace(/^["']|["']$/g, '');
})();

// llms.txt reads every page's front matter: the hand-written ones from disk, the generated ones as just built.
function llms() {
  const sections = readPages(docs, { skip: ['reference'] }).map((s) => (s.dir === 'reference'
    ? { ...s, pages: [...files.keys()].filter((f) => f.startsWith('reference/')).map((f) => ({ file: f, order: Number(/^order: (.*)$/m.exec(files.get(f))[1]), ...meta0(files.get(f)) })).sort((a, b) => a.order - b.order) }
    : s));
  const link = (p) => `- [${p.title}](${p.file}): ${p.description}`;
  const out = [
    '# VRMXG',
    '',
    '> VRMXG is a deterministic three.js game engine built around the VRMX formats: VRMXA characters, VRMXW wearables and VRMXI game items. A fixed 60 Hz step makes every scene and shot replay bit for bit in Node, Chromium and WKWebView. It comes with an editor, an anime creator that films a script, and MCP servers that let an agent build and drive both.',
    '',
    'This is the index for agents. Every link is the Markdown source of a page; fetch only the pages the task needs. The same pages are on the site without the `.md`.',
    '',
    '## Rules',
    '',
    '- The scene tools\' own rules (sent at initialize): ' + INSTRUCTIONS,
    '- The creator tools\' own rules (sent at initialize): ' + SHORT_INSTRUCTIONS,
    '- Simulation code gets `sin`, `cos`, `pow` and the other transcendental functions from `@vrmxg/dmath` (installed over `Math` at boot, or imported), never from the JavaScript engine\'s own, and never uses the `**` operator: see guide/determinism.md.',
    '- Anything that draws frames for a result takes the GPU lock first (`node acceptance/gpu-lock.mjs run --who <name> -- <command>`): see guide/acceptance.md.',
    `- The \`vrmxg\` skill (${SKILL_FILE} in the repository; install it with \`node skills/install.mjs\`) carries these rules, how to start each server and the describe-then-command pattern: ${skillDescription}`,
  ];
  for (const s of sections) out.push('', `## ${s.title}`, '', ...s.pages.map(link));
  out.push('', '## Node types', '', ...[...reg.types.values()].map((t) => `- [${t.name}](reference/nodes.md#${slugOf(t.name)}): ${t.description}`));
  out.push('', '## Behaviours', '', ...[...reg.behaviours.values()].map((b) => `- [${b.name}](reference/behaviours.md#${slugOf(b.name)}): ${b.description || `on ${b.on?.join(', ') ?? 'any node'}`}`));
  out.push(
    '- [Project behaviours](reference/behaviours.md#project-behaviours): a project\'s own, exported from the module game.json\'s `behaviours` names (the editor\'s Project Settings › Behaviours), each class declaring itself with a static `describe` ({ description, on, params, signals, actions, state }); guide/tutorial.md writes one',
    ...rushDeclared().map((b) => `- [${b.name}](reference/behaviours.md#${slugOf(b.name)}) (the sample game's own): ${b.description}`));
  out.push('', '## MCP servers', '',
    `- [vrmxg-mcp (headless)](reference/mcp.md): \`${usage[0]}\`: ${headless.length} tools on one scene file and a headless engine`,
    `- [vrmxg-mcp --editor](reference/mcp.md): ${editor.length} tools on the scene open in the VRMXG editor (127.0.0.1:${editorPort})`,
    `- [vrmxg-mcp --creator](reference/mcp.md#creator-tools): ${shorts.length} tools on the short open in the VRMXG creator (127.0.0.1:${creatorPort})`);
  const names = [...new Set([...headless, ...editor].map((t) => t.name))];
  out.push('', '## Scene tools (headless and editor)', '', ...names.map((n) => { const t = headless.find((x) => x.name === n) ?? editor.find((x) => x.name === n); return `- [${n}](reference/mcp.md#${slugOf(n)}): ${t.description}${headless.some((x) => x.name === n) ? '' : ' (editor only)'}${editor.some((x) => x.name === n) ? '' : ' (headless only)'}`; }));
  out.push('', '## Creator tools', '', ...shorts.map((t) => `- [${t.name}](reference/mcp.md#${slugOf(t.name)}-creator): ${t.description}`));
  out.push('', '## Creator commands', '', ...[...commands.commands.values()].map((c) => `- [${c.name}](reference/creator-commands.md#${slugOf(c.name)}): ${c.summary}`));
  out.push('', '## Formats', '',
    '- [.vrmxs](reference/vrmxs.md): A scene, a prefab or a sequence: a saved node tree as JSON',
    `- [.vrmxs JSON Schema](${SCHEMA_FILE}): The schema a scene is checked against, generated from the node registry`,
    '- [Fountain subset](reference/fountain.md): The screenplay syntax a script is written in',
    `- [${SHORTS_FILE}](reference/shorts-json.md): A project's list of shorts`,
    '- [delivery.json](reference/delivery-json.md): The manifest of a delivery folder',
    `- [${GAME_FILE}](reference/game-json.md): The game document: its entry scene, its scenes, behaviours, input map and extra files`,
    `- [${BUILD_FILE}](reference/build-json.md): A game build's manifest: every file with its SHA-256 and licence`);
  out.push('', '## Packages', '', ...pkgs.map((p) => `- [${p.name}](reference/packages.md): ${p.line}`));
  return `${publicText(out.join('\n'))}\n`;
}
function meta0(text) { const m = meta(text); return { title: m.title, description: m.description }; }
files.set('llms.txt', llms());

// ---------------------------------------------------------------- write, or check

const onDisk = (rel) => { const f = path.join(docs, rel); return fs.existsSync(f) ? fs.readFileSync(f, 'utf8') : null; };
const stale = [...files].filter(([rel, text]) => onDisk(rel) !== text).map(([rel]) => `docs/${rel}`);
// a page in docs/reference/ this script didn't write is a leftover (a renamed page) or a hand-written page in the wrong place
const refDir = path.join(docs, 'reference');
const extra = (fs.existsSync(refDir) ? fs.readdirSync(refDir) : []).filter((f) => !files.has(`reference/${f}`)).map((f) => `docs/reference/${f}`);

if (check) {
  if (stale.length || extra.length) {
    for (const f of stale) console.error(`out of date: ${f}`);
    for (const f of extra) console.error(`not generated (docs/reference/ holds only generated pages): ${f}`);
    console.error('\nThe generated reference or llms.txt is out of date. Run `npm run docs:reference` and commit the result.');
    process.exit(1);
  }
  console.log(`docs reference: ${files.size} generated files are up to date`);
} else {
  for (const [rel, text] of files) { const f = path.join(docs, rel); fs.mkdirSync(path.dirname(f), { recursive: true }); fs.writeFileSync(f, text); }
  for (const f of extra) fs.rmSync(path.join(root, f));
  console.log(`docs reference: wrote ${files.size} files (${stale.length} changed${extra.length ? `, ${extra.length} removed` : ''})`);
}
