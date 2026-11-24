---
layout: home
title: "VRMXG"
titleTemplate: "A deterministic three.js game engine"
description: "VRMXG is a deterministic three.js game engine built around VRMX characters, wearables and items, with an editor, an anime creator and MCP servers for agents."

hero:
  name: "VRMXG"
  text: "A game engine that replays to the bit."
  tagline: "A three.js engine built around VRMX characters, wearables and items. Build a scene, play it, film it, and export the same frames every time."
  actions:
    - theme: brand
      text: What VRMXG is
      link: /guide/what-is-vrmxg
    - theme: alt
      text: Run the sample
      link: /guide/running
    - theme: alt
      text: Reference
      link: /reference/

features:
  - title: Deterministic
    details: A fixed 60 Hz step and portable maths. A scene simulates identically in Node, Chromium and the Mac apps, so a shot can be scrubbed, re-rendered and exported exactly.
    link: /guide/determinism
  - title: Scenes are data
    details: A scene is a small JSON file of typed nodes, checked against a schema generated from the engine's own registry. One edit is one line.
    link: /guide/scene-format
  - title: Built for agents
    details: The engine describes itself. An agent can inspect, build and drive a scene or a short through MCP, and every edit is one undo step.
    link: /guide/agents
  - title: A reference that can't go stale
    details: Node types, MCP tools, creator commands and formats are generated from the code, and the build fails when they are out of date.
    link: /reference/
---
