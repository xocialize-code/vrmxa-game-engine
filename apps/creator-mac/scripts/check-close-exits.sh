#!/bin/zsh
# What the close-and-quit rows of the creator's and the editor's scenarios can't see (AB-T-0593; AppProbe can't look at
# an app that has quit, AB-T-0625): that the process has gone after Save and after Don't Save, for Quit and for
# File › Close Window; the sheet the read-only sample gets; a Save that fails (the editor's project folder made
# read-only: the window stays, the scene stays unsaved, the next Quit asks again); and a quit with nothing unsaved.
# One line per check.
# Build both Mac apps first, and run it under the GPU lock (the apps draw):
#   node acceptance/gpu-lock.mjs run --who close-exits -- apps/creator-mac/scripts/check-close-exits.sh
# APPPROBE names the appprobe binary (default: the one on PATH).
A=${APPPROBE:-appprobe}
root=${0:A:h:h:h:h}
tmp=$HOME/Library/Containers/com.xocialize.vrmxg-creator/Data/tmp
pidof() { python3 -c "import json,sys; print(json.load(sys.stdin)['data']['app']['pid'])"; }
gone() { for i in {1..50}; do kill -0 $1 2>/dev/null || { echo "exited after $((i*100)) ms at most"; return 0; }; ps -p $1 -o stat= | grep -q Z && { echo "exited (within $((i*100)) ms)"; return 0; }; sleep 0.1; done; echo "STILL RUNNING after 5 s"; return 1; }
name() { $A find app=$1 id=$2 --json 2>/dev/null | python3 -c "import json,sys; d=json.load(sys.stdin).get('data') or []; print(d[0]['name'] if d else '(none)')"; }
until_name() { for i in {1..120}; do n=$(name $1 $2); [[ "$n" =~ "$3" ]] && return 0; sleep 0.5; done; echo "TIMED OUT waiting for $2 =~ $3 (last: $n)"; return 1; }

pkill -9 -f "$root/apps/creator-mac/build/" ; pkill -9 -f "$root/apps/editor-mac/build/"; sleep 1
$root/apps/creator-mac/scripts/hand-test-fixtures.sh > /dev/null

echo "== creator, a project folder: a draft, Quit, Save"
P=$($A launch app=$root/apps/creator-mac/build/VRMXGCreator.app env='{"VRMXG_SHELL_PROJECT":"project","VRMXG_SHELL_MODELS":"models"}' wait=40 --json | pidof)
$A wait app=$P id=open-project enabled=true timeout_ms=60000 > /dev/null; until_name $P doc-state "^Short cafe-order "
$A act app=$P id=open-project action=press > /dev/null; until_name $P project-name "Project project"; until_name $P doc-state "cafe-order.vrmxs [0-9]+ nodes saved"
$A act app=$P id=new-short action=press > /dev/null; until_name $P doc-state "second-take.vrmxs [0-9]+ nodes unsaved changes"
$A menu app=$P path="App › Quit*" action=press > /dev/null; until_name $P ask-text "."
echo "sheet: $(name $P ask-text)"
$A act app=$P id=ask-save action=press > /dev/null
echo "Quit, Save: $(gone $P)"
echo "on disk: sequences/second-take.vrmxs $( [ -f $tmp/project/sequences/second-take.vrmxs ] && echo present || echo MISSING ), shorts.json names second-take $(grep -c second-take $tmp/project/shorts.json) time(s)"

echo "== creator: a draft, File › Close Window, Don't Save"
P=$($A launch app=$root/apps/creator-mac/build/VRMXGCreator.app env='{"VRMXG_SHELL_PROJECT":"project","VRMXG_SHELL_MODELS":"models"}' wait=40 --json | pidof)
$A wait app=$P id=open-project enabled=true timeout_ms=60000 > /dev/null; until_name $P doc-state "^Short cafe-order "
$A act app=$P id=open-project action=press > /dev/null; until_name $P project-name "Project project"; until_name $P doc-state "nodes saved"
$A act app=$P id=new-short-title action=set_value value="Fourth" > /dev/null
$A act app=$P id=new-short action=press > /dev/null; until_name $P doc-state "unsaved changes"
echo "draft: $(name $P doc-state | cut -c1-60)"
osascript -e "tell application \"System Events\" to set frontmost of (first process whose unix id is $P) to true"; sleep 0.6
$A menu app=$P path="File › Close Window" action=press | cut -c1-60; until_name $P ask-text "."
echo "sheet: $(name $P ask-text)"
$A act app=$P id=ask-discard action=press > /dev/null
echo "Close Window, Don't Save: $(gone $P)"
echo "on disk: sequences/ has $(ls $tmp/project/sequences | grep -c fourth) file(s) named fourth"

echo "== editor, the bundled sample (read-only): a change, Quit"
P=$(VRMXG_QUERY=mcp=off $A launch app=$root/apps/editor-mac/build/VRMXGEditor.app env='{"VRMXG_QUERY":"mcp=off"}' wait=40 --json | pidof)
$A wait app=$P id=add-node enabled=true timeout_ms=60000 > /dev/null; until_name $P doc-state "nodes saved"
$A act app=$P id=add-node action=press > /dev/null; until_name $P doc-state "unsaved changes"
$A menu app=$P path="App › Quit*" action=press > /dev/null; until_name $P ask-text "."
echo "sheet: $(name $P ask-text)"
echo "buttons: $(name $P ask-cancel) | $(name $P ask-discard) | save: $(name $P ask-save)"
$A act app=$P id=ask-cancel action=press > /dev/null; sleep 1
echo "Cancel: $(kill -0 $P 2>/dev/null && echo 'still running' || echo GONE), doc $(name $P doc-state | grep -o 'unsaved changes')"
$A menu app=$P path="App › Quit*" action=press > /dev/null; until_name $P ask-text "."
$A act app=$P id=ask-discard action=press > /dev/null
echo "Quit Anyway: $(gone $P)"

echo "== editor, a project folder that can't be written: a change, Quit, Save"
$root/apps/editor-mac/scripts/hand-test-fixtures.sh > /dev/null
etmp=$HOME/Library/Containers/com.xocialize.vrmxg-editor/Data/tmp
P=$($A launch app=$root/apps/editor-mac/build/VRMXGEditor.app env='{"VRMXG_QUERY":"mcp=off","VRMXG_SHELL_PROJECT":"project"}' wait=40 --json | pidof)
$A wait app=$P id=open-project enabled=true timeout_ms=60000 > /dev/null; until_name $P doc-state "nodes saved"
$A act app=$P id=open-project action=press > /dev/null; until_name $P project-name "Project project"; until_name $P doc-state "nodes saved"
scene=$(name $P doc-state | awk '{print $2}')
$A act app=$P id=add-node action=press > /dev/null; until_name $P doc-state "unsaved changes"
before=$(shasum $etmp/project/$scene | cut -c1-12)
chmod -R a-w $etmp/project
$A menu app=$P path="App › Quit*" action=press > /dev/null; until_name $P ask-text "."
$A act app=$P id=ask-save action=press > /dev/null; sleep 2
echo "Save fails: $(kill -0 $P 2>/dev/null && echo 'still running' || echo GONE), doc $(name $P doc-state | grep -o 'unsaved changes\|nodes saved'), file $( [ "$(shasum $etmp/project/$scene | cut -c1-12)" = "$before" ] && echo unchanged || echo CHANGED )"
echo "error shown: $($A find app=$P text="permission to save" --json 2>/dev/null | python3 -c "import json,sys; d=json.load(sys.stdin).get('data') or []; print((d[0].get('name') or d[0].get('value') or '?')[:110] if d else '(none)')")"
$A menu app=$P path="App › Quit*" action=press > /dev/null; until_name $P ask-text "."
echo "Quit again: asks again: $(name $P ask-text)"
chmod -R u+w $etmp/project
$A act app=$P id=ask-save action=press > /dev/null
echo "Save, the folder writable again: $(gone $P); file $( [ "$(shasum $etmp/project/$scene | cut -c1-12)" = "$before" ] && echo UNCHANGED || echo written )"

echo "== editor, nothing unsaved: Quit"
P=$($A launch app=$root/apps/editor-mac/build/VRMXGEditor.app env='{"VRMXG_QUERY":"mcp=off"}' wait=40 --json | pidof)
$A wait app=$P id=add-node enabled=true timeout_ms=60000 > /dev/null; until_name $P doc-state "nodes saved"
$A menu app=$P path="App › Quit*" action=press > /dev/null
echo "Quit with nothing unsaved: $(gone $P) (no sheet)"
pkill -9 -f "$root/apps/creator-mac/build/" ; pkill -9 -f "$root/apps/editor-mac/build/"; true
