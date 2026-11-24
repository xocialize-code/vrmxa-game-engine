# The documentation Worker

A Cloudflare Worker named `vrmxg-docs` that serves the built documentation site as static assets, at
**https://docs.vrmxstudio.com**. It has no script:
[`wrangler.jsonc`](wrangler.jsonc) points Workers static assets at `../.vitepress/dist`, and every request is answered
from there.

| Behaviour | How |
|---|---|
| Served at `docs.vrmxstudio.com` only | `routes` with `custom_domain: true` (Wrangler makes the DNS record); `workers_dev: false`, because that address carries the account's subdomain; `preview_urls: false` |
| `/guide/determinism` serves `guide/determinism.html` | `html_handling: "auto-trailing-slash"` |
| A path that isn't a file gets the site's `404.html` with a 404 status | `not_found_handling: "404-page"` |
| Every page's Markdown is at its address plus `.md`; `llms.txt` and `llms-full.txt` are at the root | The site build copies them in (`../.vitepress/config.mjs`) |
| Response headers | `../public/_headers`: no sniffing, no framing, a referrer policy, long caching for hashed assets, UTF-8 for the Markdown and text files, and `X-Robots-Tag: noindex` |

## Locally

From `docs/`:

```bash
npm ci
npm run build           # .vitepress/dist
npm run worker          # wrangler dev: the site through the Worker, on http://localhost:8787 (add -- --port N)
npm run worker:check    # wrangler deploy --dry-run: checks the config and lists what would be uploaded; needs no account
```

## Deploying

Deploying is the operator's decision and isn't done by CI: nothing redeploys on a merge. First deployed 2026-11-23.
Two things were settled first, and hold for every later deploy:

1. **Public or sign-in only.** Decided 2026-11-23: **public**, with no Cloudflare Access in front of it. The
   repository is private, so what the site publishes is kept free of internal notes: the generator takes bridge ids,
   milestone tags and private pull-request references out of text it lifts from the code, and the link check fails
   the build on a bridge id, a home or volume path or an email address anywhere in the built site. (To go back to
   sign-in only, switch Access on in the Cloudflare dashboard: the Worker's settings, or a Zero Trust application
   for its hostname. It is not a `wrangler.jsonc` setting.)
2. **The account.** `npx wrangler whoami` lists the accounts the signed-in login can reach. Deploy only to the
   intended one. When the login reaches more than one, name it for that one command with `CLOUDFLARE_ACCOUNT_ID`;
   the id is not written into `wrangler.jsonc`.

Then, from `docs/`:

```bash
npm run build
CLOUDFLARE_ACCOUNT_ID=<the account's id> npx wrangler deploy --config worker/wrangler.jsonc
```

That updates the one Worker, `vrmxg-docs`, with the files of `.vitepress/dist` as its assets, and its custom domain.
It creates no other resource: no KV, no R2, no per-version preview addresses.

No account id or token is kept in this repository. The custom domain is.
