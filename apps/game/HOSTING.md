# Putting a game on the web

M6 W7 (AB-T-0648, decision AB-D-0297 item 6). A game build (`vrmxg-export` or the editor's Export Game) is a folder of
static files that plays from any static host. This page covers what a host needs and the operator's steps to publish
one. Nothing in this repository uploads or deploys a game. Where a game goes, and on which account, is the operator's
call.

The build contract, and what was checked, is in `engine/packages/bundle/README.md` ("On a static host"). The check is
`node acceptance/m6/sharing.mjs`.

## What any host needs

- **Serve the folder as it is,** at any path: `/`, or a sub-folder such as `/games/morning-rush/`. Open it by its folder
  (with the trailing slash) or by `index.html`.
- **Send JavaScript as JavaScript** (`text/javascript`) and WebAssembly as `application/wasm`. Every common server
  does both. Other types don't matter: the game reads its own files as bytes.
- **Send no cross-origin isolation headers.** The game doesn't use `SharedArrayBuffer`, so it needs no
  `Cross-Origin-Opener-Policy` or `Cross-Origin-Embedder-Policy`. Adding them does no harm.
- **Serve it over HTTPS** when it's public. The game also plays over plain `http://` (the checks use loopback), but
  browsers keep some features to secure contexts, and gamepads are one of them.
- **Recommended: send the build's Content Security Policy** as a header on every file. `contentSecurityPolicy()` in
  `@vrmxg/bundle/hosting` makes it from the build's `index.html`. It is printed in the `_headers` file that
  `vrmxg-export --worker` writes, so copy it from there. It allows no `eval`. It allows WebAssembly, the page's own
  import map and style by their hashes, and nothing from another site. A game whose own behaviours fetch from another
  host adds that host to `connect-src`.

**Saves and settings** stay in the player's browser (IndexedDB and localStorage), keyed by the game's id. Every export
of a game on one site shares them, which is how saves carry across updates (M6 W5). Two different games on one site
keep theirs apart.

## On Cloudflare (a Worker serving static assets)

```sh
node engine/packages/bundle/src/cli.js content/sample out/rush --game game/game.json   # the build
node engine/packages/bundle/src/cli.js --worker out/rush out/rush-worker               # the Worker folder
cd out/rush-worker
npx wrangler@4.167.0 dev --ip 127.0.0.1        # this Mac only: http://127.0.0.1:8787/
```

`out/rush-worker/` holds `public/` (the build plus `_headers`: the CSP, `nosniff`, and long caching for `assets/`, whose
file names are content hashes) and `wrangler.jsonc`: assets only, so no script runs per request, with the workers.dev
address and preview URLs off. The checks used the Wrangler that `docs/` pins (`cd docs && npm ci`, then
`docs/node_modules/.bin/wrangler`).

The cf CLI's `cf dev` was tried first, as the operator's rule asks. It ran its project autoconfig (it installed `cf`
and `wrangler` into the folder, wrote `cloudflare.config.ts` and `wrangler.config.ts`, and added a deploy script) and
didn't take the forwarded `--ip`/`--port`. The folder carries a Wrangler config, so Wrangler is the tool here.

**The operator's steps to publish** (not done here):

1. Choose the account: `npx wrangler whoami`, and set `CLOUDFLARE_ACCOUNT_ID` when the login reaches more than one.
2. Choose the address. Either add a route to `wrangler.jsonc` (`"routes": [{ "pattern": "games.example.com",
   "custom_domain": true }]`, for a zone in that account), or set `"workers_dev": true` for a workers.dev address.
   Neither is on until you do one.
3. `npx wrangler deploy --dry-run` checks the config and what would go up, then `npx wrangler deploy` publishes it.
4. Open the address and play to an ending. In the browser's console, nothing should report a CSP violation.

Limits worth knowing: a Worker's static asset is at most 25 MiB per file, and there's a cap on the number of files.
The Morning Rush has 118 files, 26 MB in all, and its largest is 4.8 MB.

## On other static hosts

- **Cloudflare Pages, Netlify:** publish the Worker folder's `public/`. Both read `_headers`.
- **GitHub Pages, S3, a plain web server:** publish the build folder. These hosts don't read `_headers`, so set the
  CSP header in the host's own configuration if you want it.
- **itch.io and other embedding sites:** upload the build folder zipped, with `index.html` at its root. The game runs
  in the site's iframe. It needs no permissions beyond what a page has (gamepad input, audio after a click).

A plain local check needs no tools of ours: `python3 -m http.server --bind 127.0.0.1 --directory out` serves `out/rush/`
at `http://127.0.0.1:8000/rush/`.
