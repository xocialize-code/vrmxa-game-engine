# AB-T-0598: the creator hand test with another app in front

Run of 2026-11-23 (`report.md`, `results.json`): 15 rows, 15 passed, on VRMXG Creator built from this branch, AppProbe
0.5.1, under the GPU lock.

`front-app.txt` is the frontmost app every two seconds during that run. The operator's own app was put back in front
two seconds after the Creator launched, and stayed there for the first 34 seconds: rows 1 to 6, the find-field rows 4
and 5 among them. Row 7's `open` step (an Open Documents event) then brought the Creator forward, so row 14 ran with
the Creator active. Both states pass.

## What was wrong

AppProbe's `set_value` focuses a text field, presses ⌘A and types. ⌘A selects only while the target is the active
app. Measured on one launch of the same build, typing `abc` and then `xyz` into `#script-find`:

| The find field | Creator in front | Another app in front |
|---|---|---|
| before (no select on focus) | `xyz` | `xyzabcxyz` |
| now (selects its text on focus) | `xyz` | `xyz` |

Also measured with another app in front: `keys cmd+a` and `menu "Edit › Select All" press` select nothing; typed
text and Backspace reach the focused field.

So the failure followed where the operator's attention was, not the code. `launch` brings the Creator to the front;
the run passes while it stays there and fails from the first value typed over old text once another app comes
forward. Before the fix this session ran rows 1 to 5 seven times, on three copies of the same code (this branch's
build, main's build, and main's build copied elsewhere): six passed and one failed. Main's own build failed once and
passed once. The coordinator's three runs of 2026-11-23 failed (AB-T-0598). Which app was in front was recorded for
one of those four failures (this session's: the operator's app); for the coordinator's three it is inferred.

The fix is in the page (`apps/creator/src/ScriptPane.vue`): the find and replace fields select their text when they
take focus, as a find bar does. AppProbe's side (select through accessibility instead of ⌘A) is AB-T-0612.

## After merging main (W9's creator), 2026-11-23

- `merged/`: the scenario run as the checklist says, the launched Creator left in front. **15 of 15.** The Creator was
  the frontmost app in every sample of the run.
- `other-app-in-front/`: the same build with another app (Music) put in front two seconds after launch, where it stayed
  for the whole run. **13 of 15.** Rows 4 and 5 pass, so the select-on-focus fix holds. Rows 14 and 15 fail in another
  way: after three tries each field holds what it held before (`[[gret]]`, and New Short's title `Second take`). The
  typed text never arrived. Nothing was appended.

So the page fix covers what AB-T-0598 was filed for, the appended text. It doesn't make the scenario independent of
which app is in front: late in a run in which the Creator was never active, AppProbe's typing doesn't reach the page at
all. In the earlier run above that isn't seen, because row 7's `open` step had brought the Creator forward by then;
here it didn't. Which step stops the typing wasn't traced. It is AppProbe's side again (AB-T-0612, amended).

**Run the scenario with the Creator left in front**, and don't click into another app during its two minutes.
