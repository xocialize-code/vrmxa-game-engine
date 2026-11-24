# Creator hand test: performance takes (M4 W9, AB-T-0581)

Recording a character's performance in the anime creator on the Mac shell: a puppet take, a director take and a face
take, each kept as one undo step, edited like any other tracks, removed again, and saved with their logs. The scenario
beside it ([`hand-test/HAND-TEST-M4-TAKES.scenario.md`](hand-test/HAND-TEST-M4-TAKES.scenario.md)) runs every row with
AppProbe, with scripted stand-ins for the person at the keys, the model and the camera. Set up with
`apps/creator-mac/scripts/build.sh`, and run under the machine's GPU lock (it draws):

```sh
node acceptance/gpu-lock.mjs run --who creator-takes-hand-test -- sh -c 'apps/creator-mac/scripts/hand-test-fixtures.sh && appprobe checklist scenario=apps/creator-mac/docs/hand-test/HAND-TEST-M4-TAKES.scenario.md'
```

- [ ] The project opens on the sample short with the take panel ready: its characters can perform, and nothing is an undo step.
- [ ] A puppet take records from the playhead while the film plays, and Stop leaves it waiting: nothing is in the short yet.
- [ ] Keep adds the take as one undo step: its tracks are timeline rows after the film's own, and its log is in the project.
- [ ] Edit › Undo takes the whole take out and Redo brings it back; the take's tracks are edited like any others.
- [ ] A director take: what is typed is said to her, her answer is the take, and Keep adds her line as a dialogue clip.
- [ ] A face take (the synthetic session): it waits for a resting face, then her face and head follow; Keep adds an expression track and a head track.
- [ ] Discard throws a take away: nothing is written and nothing is an undo step. Remove takes a kept take out as one step.
- [ ] Save writes the short with its takes; the logs are in the project folder.

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
