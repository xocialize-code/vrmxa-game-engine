#!/usr/bin/python3
"""The WebKit GPU process of one app, by its pid: the com.apple.WebKit.GPU process whose responsible process is that app
(started by LaunchServices, so it is its own responsible process) and that started no earlier than it. Prints its pid;
exits 1 unless there is exactly one, so nothing else (Safari's, another app's) is ever named. As
apps/editor-mac/scripts/web-footprint.py finds an app's web processes."""
import ctypes, re, subprocess, sys, time
libc = ctypes.CDLL('/usr/lib/libSystem.dylib')
def started(pid):
    out = subprocess.run(['ps', '-o', 'lstart=', '-p', str(pid)], capture_output=True, text=True).stdout.strip()
    try: return time.mktime(time.strptime(out, '%a %b %d %H:%M:%S %Y'))
    except ValueError: return None
app = int(sys.argv[1])
if libc.responsibility_get_pid_responsible_for_pid(app) != app: sys.exit('the app is not its own responsible process: start it with open')
t0, found = started(app), []
for line in subprocess.run(['ps', '-axo', 'pid=,comm='], capture_output=True, text=True).stdout.splitlines():
    m = re.match(r'\s*(\d+)\s+(.*)', line)
    if not m or not m.group(2).endswith('com.apple.WebKit.GPU'): continue
    pid, t = int(m.group(1)), started(int(m.group(1)))
    if t is not None and t >= t0 - 1 and libc.responsibility_get_pid_responsible_for_pid(pid) == app: found.append(pid)
if len(found) != 1: sys.exit(f'expected one GPU process for app {app}, found {found}')
print(found[0])
