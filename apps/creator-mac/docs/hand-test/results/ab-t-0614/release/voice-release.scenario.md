# Voice release check (AB-T-0614): Kokoro stays loaded after a cast, and leaves when a render starts

```scenario
app: VRMXG Creator
launch: apps/creator-mac/build/VRMXGCreator.app
env: {"VRMXG_SHELL_PROJECT": "project", "VRMXG_SHELL_OPEN": "inbox/first-light.fountain", "VRMXG_SHELL_EXPORT": "exports/", "VRMXG_SHELL_MODELS": "models"}
fixtures: ~/Library/Containers/com.xocialize.vrmxg-creator/Data/tmp/inbox
fresh: false
```

- [ ] The project opens, a draft short opens from a script, then the app idles.
  ```steps
  wait id=open-project enabled=true timeout_ms=60000
  until find("id=doc-state").0.name matches "^Short cafe-order " timeout=60000
  act id=open-project action=press
  until find("id=project-name").0.name == "Project project"
  until find("id=sb-status").0.name == "Storyboard 11 shots, 11 thumbnails" timeout=120000
  menu "File › Open…" press
  until find("id=open-result").0.name == "Opened first-light.fountain (script) → short first-light" timeout=30000
  until find("id=sb-status").0.name == "Storyboard 5 shots, 5 thumbnails" timeout=120000
  pause 8000
  ```

- [ ] A cast voices the role's lines through the shell, then the app idles for twenty seconds.
  ```steps
  act id=role-hana-1 action=press
  open ${fixtures}/mira-guest.vrmxa
  until find("id=undo").0.name == "Undo Cast HANA: Mira" timeout=60000
  pause 20000
  ```

- [ ] An export renders, then the app idles.
  ```steps
  menu "File › Export…" press
  until find("id=q-job-1-status").0.name matches "^job-1 (done|failed)" timeout=300000
  expect find("id=q-job-1-status").0.name matches "^job-1 done"
  pause 8000
  ```
