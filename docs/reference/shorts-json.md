---
title: "shorts.json"
description: "The file that lists a project's shorts for the creator: each short's script, sequence, marks, set and cameras."
order: 70
---

# shorts.json

> Generated from `apps/creator/src/shorts.js` and the sample project by `scripts/docs-reference.mjs`. Don't edit it: change the code and run `npm run docs:reference`.

`shorts.json`, at the root of a project, lists the project's shorts for the VRMXG creator: which script builds
which sequence, in which set, with which cameras.

| Field | Value |
|---|---|
| `format` | always `"vrmxg-shorts"` |
| `version` | always `1`; a newer version is refused |
| `shorts` | The list, in the order the creator shows it |

## A short

| Field | What |
|---|---|
| `id` | The short's id. Required. Its sequence is named after it by default. |
| `title` | The title shown in the creator. Defaults to the id. |
| `script` | The Fountain script, a path under the project. Required. |
| `sequence` | The sequence the script builds, a `.vrmxs` under the project. Defaults to `sequences/<id>.vrmxs`. |
| `marks` | A marks file (where the cast stands), if the short has one. |
| `set` | The set scene the short is filmed in, if named here; the script's title page (`Set:`) also names it. |
| `coverage` | How the short's cameras are made: `rule` or `default`. `rule` is `@vrmxg/coverage`'s cameras by rule; `default` is the script build's wide and close-ups. When left out, a short whose sequence already exists is `default` (so opening it changes nothing) and a new one is `rule`. |

Saving in the creator writes the file with these keys in this order.

## A project without one

A project with no `shorts.json` has a short for each `scripts/*.fountain`. For a project holding
`scripts/cafe-order.fountain`, `scripts/cafe-marks.json`, `sequences/cafe-order.vrmxs`, `scripts/first-light.fountain`, the creator finds:

```json
[
  {
    "id": "cafe-order",
    "title": "The Order",
    "script": "scripts/cafe-order.fountain",
    "sequence": "sequences/cafe-order.vrmxs",
    "marks": "scripts/cafe-marks.json",
    "set": "cafe.vrmxs",
    "coverage": "default"
  },
  {
    "id": "first-light",
    "title": "First Light",
    "script": "scripts/first-light.fountain",
    "sequence": "sequences/first-light.vrmxs",
    "marks": null,
    "set": null,
    "coverage": "rule"
  }
]
```

The title and the set come from each script's title page (`Title:`, `Set:`); a script without a title is called by its id.
The marks are `scripts/<id>-marks.json` when that file exists, else the set's (`scripts/<set>-marks.json`, once the
script's title page names a set), else none.

## The sample project's

`content/sample/shorts.json`:

```json
{
  "format": "vrmxg-shorts",
  "version": 1,
  "shorts": [
    {
      "id": "cafe-order",
      "title": "The Order",
      "script": "scripts/cafe-order.fountain",
      "sequence": "sequences/cafe-order.vrmxs",
      "marks": "scripts/cafe-marks.json",
      "set": "cafe.vrmxs",
      "coverage": "default"
    },
    {
      "id": "the-regular",
      "title": "The Regular",
      "script": "scripts/the-regular.fountain",
      "sequence": "sequences/the-regular.vrmxs",
      "marks": "scripts/cafe-marks.json",
      "set": "cafe.vrmxs",
      "coverage": "rule"
    }
  ]
}
```
