# Licence texts for packages that ship none

A Vite build's `THIRD-PARTY-LICENCES.txt` (`@vrmxg/bundle/notices`) holds the licence text of every package the
bundle includes, read from the licence files in the package's folder. A package published without one gets its text
from here instead: `<name>.txt`, with a scoped name's `/` written as `__`. A package with neither stops the build, so
a notice can't go missing quietly.

| File | Package | Where the text comes from |
|---|---|---|
| `@cfworker__json-schema.txt` | `@cfworker/json-schema` 4.1.1 (MIT; vrmxa-core imports it) | `LICENSE.md` and `THIRD_PARTY_NOTICES.md` (its punycode.js and Ajv notices) at the root of github.com/cfworker/cfworker, read 2026-11-25. The npm package carries neither |
