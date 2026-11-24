---
title: "Acceptance and exactness"
description: "How VRMXG proves its claims: milestone checks run in Node, Chromium and WKWebView on both renderers, and the rules that make exact frames possible."
order: 7
---

# Acceptance and exactness

VRMXG's claims are checked, not asserted. Each milestone ends with a set of exit checks run on the sample project,
in every runtime, at one commit. The runners, the method and every result are in the repository under `acceptance/`;
`acceptance/README.md` is the full record. This page is the outline.

## What is checked, and where

**The runtimes.** A check runs in up to four places: Node, headless Chromium, and the Mac apps' web view (WKWebView)
over each of its two origins, the custom scheme and loopback. Node and Chromium run V8; WKWebView runs JavaScriptCore.
They are different JavaScript engines, which is the point.

**The simulation is bit-identical.** Every step of a recorded ten-second walk through the cafe hashes the same in all
four, component by component. A snapshot taken halfway restores and carries on to the same end. A stray `Math.random`
slipped into one run is caught and named at the step after it happens.

**The renderers.** Since milestone M4 every rendering check runs on both WebGPU and WebGL, in Chromium and in
WKWebView over both origins: three runtimes by two renderers, six cells.

| Milestone | What its checks cover | State |
|---|---|---|
| M0 | The cafe runs everywhere; walk, run, jump; bit for bit with snapshot and restore; 20 characters with physics inside the step budget; MCP describes, drives and edits; debug draw | Done |
| M1 | Playable: items, interaction, the closet at run time, the editor, sound and voice, export | Done |
| M2 | Production: sequences and the timeline, cinematic cameras, the post stack, particles, navigation, NPC brains, save games | Done |
| M3 | Characters you talk to: personas, the director, voice in the shell, camera sensing, ragdolls, vehicles, split screen | Done |
| M4 | The anime creator on WebGPU: a short from script to export | In progress; its checks land one by one |

```bash
(cd apps/playground && npx vite build)
node acceptance/node.mjs          # the recorded walk, snapshot and restore, in Node
node acceptance/chromium.mjs      # the same in headless Chromium, with the rendered pass
acceptance/wkwebview.sh           # the same in WKWebView, over both origins
node acceptance/compare.mjs       # scores the checks; exits 1 on a failure

node acceptance/matrix.mjs        # every rendering check on both renderers, in every browser
```

The browser runs are made on the development Mac: they need WKWebView, the avatar studio beside the repository, and
a GPU to themselves.

## Exact frames

An exported film is exact: the same sequence exported twice, on the same renderer and browser engine, gives the same
bytes for every frame. The checks compare digests of frames, not pictures by eye. Several rules make that hold.

### The GPU lock

Exact frames only hold on a quiet GPU. On the macOS beta this was measured on, the graphics driver draws a rare odd
frame while another process is loading the GPU. So everything that draws frames for a result takes one machine-wide
lock first, from any repository or session:

```bash
node acceptance/gpu-lock.mjs run --who my-runner -- <command> [args…]   # hold the lock while a command runs
node acceptance/gpu-lock.mjs status                                     # who holds it
```

A process started by a holder doesn't take the lock again, so a locked runner can call other locked runners. A lock
whose owner has gone is taken over. Every runner in the repository that draws takes it.

### A quiet GPU, and what happened recorded

Before each cell the matrix waits for the GPU to be quiet. Every result records the GPU's load during the run and
which other processes were using it, so a frame that differs can be told apart from a frame that was disturbed.

### Canonical digests

`acceptance/canonical.json` pins the expected digest of every check, per renderer and runtime. Every load must match
it. An entry is written only by an explicit "bless" of a run in which every load passed and agreed. A check with no
entry is reported as unpinned, and the matrix can't pass with one.

### One rerun, then a verdict

A load that doesn't match is run once more, and then classified:

- **A functional failure** (an error, a time-out, the wrong renderer, a blank frame) is a failure, whatever the rerun did.
- **Only pixels differed, the rerun is clean, and the GPU was under load** during the first: the known driver issue.
  It is recorded as an incident, and the load counts.
- **Anything else is a failure**, including an odd frame on a quiet GPU.

### The redraw check

Until the driver issue is re-tested on a release build of macOS, deliveries drawn on WebGPU draw every frame twice
and compare the two, with a third draw to break a tie. It is on by default for the delivery presets
([delivery.json](../reference/delivery-json#presets)).

## The same look on both renderers

WebGPU and WebGL don't give the same bytes, and aren't asked to. Each is exact with itself. Between them the look is
held to a measured tolerance: every look of the post stack, drawn on the same frame at 1080p on both, must have a
structural similarity (SSIM) of at least 0.98.

Two things are set aside on purpose:

- **Translucent pixels.** WebGPU blends translucency in linear light, which is the physically correct blend, and WebGL
  blends in sRGB where no post effect runs. Those pixels differ by design, so they are masked out. On the test frame
  that is the characters' irises, eyebrows and eyelashes: under a fiftieth of one percent of the frame.
- **Film grain.** It is per-pixel noise, which each renderer draws differently, so the one look with grain is compared
  at quarter size.

## In the apps

The acceptance isn't only scripts. Each Mac app has a hand-test checklist and a scenario that runs it through the
accessibility tree, as a person would use the app: `apps/*-mac/docs/hand-test/`.
