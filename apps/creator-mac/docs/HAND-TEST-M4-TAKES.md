# Creator hand test: performance takes (M4 W9, AB-T-0581)

Recording a character's performance in the anime creator on the Mac shell: a puppet take, a director take and a face
take, each kept as one undo step, edited like any other tracks, removed again, and saved with their logs. The scenario
beside it ([`hand-test/HAND-TEST-M4-TAKES.scenario.md`](hand-test/HAND-TEST-M4-TAKES.scenario.md)) runs every row with
AppProbe, with scripted stand-ins for the person at the keys, the model and the camera. Set up with
`apps/creator-mac/scripts/build.sh`, and run under the machine's GPU lock (it draws):

```sh
node acceptance/gpu-lock.mjs run --who creator-takes-hand-test -- sh -c 'apps/creator-mac/scripts/hand-test-fixtures.sh && appprobe checklist scenario=apps/creator-mac/docs/hand-test/HAND-TEST-M4-TAKES.scenario.md'
```

- [x] The project opens on the sample short with the take panel ready: its characters can perform, and nothing is an undo step. *AppProbe 2026-11-23: The Order, Mira and Hana offered, Puppet chosen, "Take: ready (0 kept)".*
- [x] A puppet take records from the playhead while the film plays, and Stop leaves it waiting: nothing is in the short yet. *AppProbe 2026-11-23: Record at frame 24 with the scripted keys (`puppet=demo`), Undo disabled while it recorded, stopped past 6 s: "Take 1 recorded: puppet, mira, … 3 tracks; keep or discard", the document's hash unchanged. Real keys and a gamepad weren't pressed: the operator's row below.*
- [x] Keep adds the take as one undo step: its tracks are timeline rows after the film's own, and its log is in the project. *AppProbe 2026-11-23: "Undo Take 1: Mira, puppet (… s)"; rows mira-walk-take-1, mira-gaze-take-1 and mira-act-take-1; the log performances/cafe-order/take-1.json read on disk after the run.*
- [x] Edit › Undo takes the whole take out and Redo brings it back; the take's tracks are edited like any others. *AppProbe 2026-11-23: the same document hash after Undo as when opened, and after Redo as when kept; her nod clip moved a frame with ⇧→: "Move clip mira-act-take-1 0".*
- [x] A director take: what is typed is said to her, her answer is the take, and Keep adds her line as a dialogue clip. *AppProbe 2026-11-23: "Good morning, Hana!" typed and said; the demo model's "Good morning! Lovely to see you." came back as her line; kept as hana-1-says-take-2, hana-1-face-take-2 and hana-1-act-take-2. A real model wasn't asked: the operator's row below.*
- [x] A face take (the synthetic session): it waits for a resting face, then her face and head follow; Keep adds an expression track and a head track. *AppProbe 2026-11-23: "(hold still)" for the first second, then about 15 samples a second from the synthetic session; kept as mira-face-take-3 and mira-head-take-3. The shell listed its cameras in the panel without asking for one. No camera was used: the operator's row below.*
- [x] Discard throws a take away: nothing is written and nothing is an undo step. Remove takes a kept take out as one step. *AppProbe 2026-11-23: take 4 recorded and discarded, the document and the undo step as before; "Remove take 2" took Hana's three tracks out and Undo brought them back.*
- [x] Save writes the short with its takes; the logs are in the project folder. *AppProbe 2026-11-23: saved; nothing left in memory; take-1.json (puppet), take-2.json (director) and take-3.json (face, source synthetic) read on disk after the run, and the saved sequence has the eight take tracks.*

## By a person (waiting on the operator)

The scenario can't sit at a keyboard, talk to a model or show its face. These three are for a person, and the third
needs the camera (AB-T-0557: the camera re-test in good light blocks it).

Launch through LaunchServices (a child of another process is refused the camera with no prompt, AB-L-0370):

```sh
open -n --env VRMXG_SHELL_PROJECT=project apps/creator-mac/build/VRMXGCreator.app
```

- [ ] **Puppet, by hand.** Open The Regular, put the playhead on shot 020, pick Mira, Puppet, Record. Walk her with
  W A S D (Shift runs, Space jumps), turn her eyes with the arrow keys (R gives them back), press 1 to 6 for gestures;
  a gamepad works too (left stick, right stick, X Y B and the d-pad). Stop, Keep. *Check:* she moves as you drove her
  when the film plays back; the keys didn't type into the script pane or scroll the page.
- [ ] **Director, with a real model.** Launch with `--env VRMXG_QUERY=director=http://127.0.0.1:8080/v1/chat/completions`
  (the loopback stand-in, `content/sample/tools/voice-server.py --llm omni4`), or in a shell build that has
  `llm.respond`. Pick Hana, Director, Record, and tell her things ("Tell Mira the scones are fresh.", "Look at Mira.",
  "Walk over to her."). Stop, Keep. *Check:* her lines are dialogue clips with the model's words; a face, a gesture,
  a look and a goal became tracks; playing the film again never asks the model (stop the server first).
- [ ] **Face, with the camera.** In good light, pick Mira, Face, choose the display's camera in the panel (the default
  can be a capture card), Record. macOS asks for the camera the first time: that prompt is yours to answer. Hold a
  neutral face for a second ("hold still" goes away), then blink, open your mouth, smile, raise and lower your brows,
  wink, and turn, nod and tilt your head. Stop, Keep. *Check, and note for AB-T-0557:* the status line's sample count
  (about 30 a second), whether each of the five follows you and whether anything moves that you didn't do (a smile
  shutting her eyes, a head turn raising her brows), how jittery her face is at rest, and the lag you feel. The take's
  log (`performances/<short>/take-N.json`) has every sample; send it back so the thresholds can be tuned on a real face.

## Results

| Row | Step | What happened | Undo |
|---|---|---|---|
| 1–8 | The scenario, 2026-11-23, shell 0.8.0, WebGPU | 8 of 8 passed (`hand-test/results/m4-w9-takes/`; pictures in `hand-test/shots/takes/`). The first run after a fresh build found no app (a launch race in the runner); the next runs launched it. A run before the fix below failed the existing creator scenario's export rows | Take 1, Take 2, Take 3, Remove take 2 |
| — | The creator scenario (`HAND-TEST-M4-CREATOR`), re-run with takes in the app | First run: rows 9 to 12 failed, "job-1 failed: undefined is not an object (evaluating 'a of e.nodes')": the creator host's new take-world method had the editor host's `takeWorld` name, which exports call. Renamed (`liveWorld`; the deck is `takeDeck`, not `takes`). Second run: 15 of 15 (`hand-test/results/m4-w9-creator/`) | — |
