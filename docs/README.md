# VRMXG documentation

The source of VRMXG's documentation site (AB-T-0611). Plain Markdown, built into a static site with
[VitePress](https://vitepress.dev) and served by a Cloudflare Worker.

| Path | What |
|---|---|
| [INVENTORY.md](INVENTORY.md) | Everything that needs documenting, who reads it, and what this phase covers. Not a page of the site |
| `index.md` | The home page |
| `guide/` | Hand-written pages: what VRMXG is and the rules it keeps. Short, plain, and checked against the code |
| `reference/` | **Generated**: never edit these. `scripts/docs-reference.mjs` writes them from the registry, the MCP tool lists, the creator's commands, the format code and the packages |
| `llms.txt` | **Generated**: the index for agents, linking every page's Markdown |
| `public/schemas/` | **Generated**: the `.vrmxs` JSON Schema |
| `public/_headers` | Response headers for the Worker's static assets |
| `.vitepress/` | The site's configuration and theme |
| `worker/` | The Cloudflare Worker that serves the built site ([worker/README.md](worker/README.md)) |

## Commands

From the repository's root:

```bash
npm run docs:reference        # regenerate docs/reference/, docs/llms.txt and the schema from the code
npm run check                 # … fails when they are out of date (node scripts/docs-reference.mjs --check)
```

From `docs/` (its own package, installed apart from the workspace):

```bash
npm ci
npm run dev                   # the site with hot reload, http://localhost:5186
npm run build                 # .vitepress/dist: the site, every page's Markdown beside it, llms.txt, llms-full.txt
npm run links                 # every internal link and anchor in the built site resolves; llms.txt's links too
npm run worker                # the built site through the Worker, locally (wrangler dev), http://localhost:8788
```

## Writing a page

- A hand-written page goes in `guide/`, with front matter: a `title`, a one-line `description` (both in double quotes)
  and an `order`. The sidebar and `llms.txt` are both built from that, so run `npm run docs:reference` after adding one.
- Keep it short and plain. Take each fact from the code, a README or the PRD, and check it against the code.
- Plain Markdown only: no Vue components, no HTML. Every page is also served as its `.md` source for agents.
- Link other pages relatively (`./determinism`, `../reference/nodes#character`). The build fails on a dead link, and
  `npm run links` checks anchors too.
- Something that can be generated from the code belongs in `scripts/docs-reference.mjs`, not in `guide/`.
- **The site is public and the repository is not.** No bridge ids (AB-T-…), milestone tags (M4 W9), names, email
  addresses or machine paths in a page. `npm run links` fails the build on the ones it can recognise.

## What `npm run check` and CI hold

- The generated reference, `llms.txt` and the schema are what the code produces now.
- The site builds on Node 26 from a clean checkout (`docs/package-lock.json`, exact versions).
- Every internal link and anchor resolves, and the built site holds no bridge id, home or volume path, or email
  address.
