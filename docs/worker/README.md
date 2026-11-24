# The documentation Worker

A Cloudflare Worker named `vrmxg-docs` that serves the built documentation site as static assets. It has no script:
[`wrangler.jsonc`](wrangler.jsonc) points Workers static assets at `../.vitepress/dist`, and every request is answered
from there.

| Behaviour | How |
|---|---|
| `/guide/determinism` serves `guide/determinism.html` | `html_handling: "auto-trailing-slash"` |
| A path that isn't a file gets the site's `404.html` with a 404 status | `not_found_handling: "404-page"` |
| Every page's Markdown is at its address plus `.md`; `llms.txt` and `llms-full.txt` are at the root | The site build copies them in (`../.vitepress/config.mjs`) |
| Response headers | `../public/_headers`: no sniffing, no framing, a referrer policy, long caching for hashed assets, and `X-Robots-Tag: noindex` |

## Locally

From `docs/`:

```bash
npm ci
npm run build           # .vitepress/dist
npm run worker          # wrangler dev: the site through the Worker, on http://localhost:8787 (add -- --port N)
npm run worker:check    # wrangler deploy --dry-run: checks the config and lists what would be uploaded; needs no account
```

## Deploying

Deploying is the operator's decision and isn't done by CI. Before a first deploy, two things are settled:

1. **Public or sign-in only.** The repository is private. The Worker's `workers.dev` address is public unless
   Cloudflare Access protects it. Access is switched on in the Cloudflare dashboard (the Worker's settings, or a
   Zero Trust application for its hostname), not in `wrangler.jsonc`.
2. **The account.** `npx wrangler whoami` lists the accounts the signed-in login can reach. Deploy only to the
   intended one. When the login reaches more than one, name it for that one command with `CLOUDFLARE_ACCOUNT_ID`;
   the id is not written into `wrangler.jsonc`.

Then, from `docs/`:

```bash
npm run build
CLOUDFLARE_ACCOUNT_ID=<the account's id> npx wrangler deploy --config worker/wrangler.jsonc
```

That creates (or updates) one Worker, `vrmxg-docs`, with the files of `.vitepress/dist` as its assets, served at
`vrmxg-docs.<the account's subdomain>.workers.dev`. It creates no other resource: no KV, no R2, no routes, no DNS, and
no per-version preview addresses (`preview_urls: false`).

No account id, token or address is kept in this repository.
