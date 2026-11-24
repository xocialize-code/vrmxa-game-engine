# Creator hand test: a fresh agent with only the skill makes the short (M5 W9, AB-T-0608)

The `vrmxg` skill's acceptance: a Claude Code session with only the skill and `vrmxg-mcp --creator` completes M4 W11's
six edits (patch the script, recast a role, re-voice a line with new words, a shot's camera, render a frame, queue an
export) without reading the repository. `mcp-session.mjs --skill` runs it from a new folder outside the repository,
with the skill installed there as that folder's own (`skills/install.mjs --project`), no file, shell or web tools, and
a prompt that names the edits but no tool. The scenario beside it
([`hand-test/HAND-TEST-M5-SKILL.scenario.md`](hand-test/HAND-TEST-M5-SKILL.scenario.md)) is M4's MCP scenario's first two
rows on this run's own project and port: it opens the project and waits for the agent's edits in the creator's Undo.

```sh
apps/creator-mac/scripts/build.sh
T="$HOME/Library/Containers/com.xocialize.vrmxg-creator/Data/tmp"; rm -rf "$T/project-w9-skill"; cp -R content/sample "$T/project-w9-skill"
node acceptance/gpu-lock.mjs run --who creator-skill -- appprobe checklist scenario=apps/creator-mac/docs/hand-test/HAND-TEST-M5-SKILL.scenario.md
node apps/creator-mac/scripts/mcp-session.mjs --skill --port 5194   # after row 1 passes; records docs/hand-test/results/mcp-creator-session-skill.json
```

- [x] The project opens on the sample short, linked to the agent's MCP server, with no undo step. *AppProbe 2026-11-24: Open Project on `project-w9-skill`; the sample short, 11 shots and thumbnails; no undo step; `#mcp-state` polling 5194.*
- [x] An agent with only the vrmxg skill and the creator's MCP tools makes the short's edits; the last one is in the creator's Undo, marked (MCP), and the export it queued is in the render queue. *AppProbe 2026-11-24: `mcp-session.mjs --skill` (Sonnet; the session's folder outside the repository; its only personal skill `vrmxg`, which it loaded first; no file, shell or web tools): 22 calls, none failed, $0.13 ([record](hand-test/results/mcp-creator-session-skill.json)). It described each command before running it; patched Mira's first line (keeping its `[[point]]` tag) and voiced it; recast HANA in af_nicole (4 lines re-voiced); re-voiced the second line with its new words; put shot 030 on a new 85 mm close-up of Mira; rendered frame 200 (not blank); queued a review export, not run. Five undo steps, each "(MCP)"; the export queued in the render queue ([shot](hand-test/shots/m5-skill/r2-1.png)).*

## Results

| Row | Step | What happened | Undo |
|---|---|---|---|
| 1–4 | 2026-11-24, first run (M4's four rows) | The agent made the six edits, 20 calls, none failed ([record](hand-test/results/mcp-creator-session-skill-first.json)), but my prompt said only that the second line "gets new words", not M4's "re-voice": it patched both lines in one step and left them unvoiced. Rows 3–4 failed on M4's step names. Fixed: M4's wording; the skill says how to change a line's words and voice; the session loads no personal skills (`--setting-sources project,local`) | 3 steps |
| 1–4 | second run | All six edits, 22 calls, none failed: the patched line voiced again, the second re-voiced with new words. Five steps, not M4's four, so rows 3–4 (written for M4's agent) were rewritten. Its record was overwritten by the third run | 5 steps |
| 1–4 | third run | 25 calls, none failed ([record](hand-test/results/mcp-creator-session-skill-third.json)): it gave the first line wholly new words with `revoice`, which dropped its `[[point]]` tag, and patched it back. The scenario's row 3 pressed Undo while the agent was still working, and undid its camera step under it; the agent noticed and stopped before redoing it. Fixed: the scenario keeps rows 1–2 (rows that undo can't run beside an agent; the editor's M5 scenario walks an agent's steps); the skill says that `revoice` text drops tags and to patch a tagged line, then voice it | 5 steps, one undone by the scenario |
| 1–2 | fourth run | 2 of 2. All six edits, 22 calls, none failed ([report](hand-test/results/m5-skill/report.md)) | 5 steps, each "(MCP)" |
