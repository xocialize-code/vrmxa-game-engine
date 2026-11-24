#!/usr/bin/python3
"""Samples the memory of a VRMXG Mac app's web processes once a second (AB-T-0592).

  apps/editor-mac/scripts/web-footprint.py --app <path inside the .app, or its name> --out series.json [--every 1]
      [--breakdown-every 15] [--until-gone]

A WKWebView's content, GPU and networking processes are XPC services, so they aren't the app's children. They are
found as the WebKit processes that share the app's *responsible* process (the app itself when LaunchServices started
it; the launching tool's when AppProbe or a terminal did) and started no earlier than the app. Run one app at a time
(the GPU lock does that): two apps started by the same tool can't be told apart this way. Each sample is `footprint --noCategories -f bytes` of those processes: the
`phys_footprint` the kernel judges the process by (WebKit's kill threshold reads the same ledger). Every
`--breakdown-every` seconds one sample also keeps `footprint`'s categories for the content process (IOSurface, IOAccelerator,
JS heap, malloc, ...), so a series says what grew as well as how much.

It waits for the app to appear, samples while it runs, and writes the series when the app has gone (or on SIGINT /
SIGTERM). Paths in the output are relative to nothing: only process names, pids and numbers are kept.
"""
import argparse, ctypes, json, re, signal, subprocess, sys, time

libc = ctypes.CDLL('/usr/lib/libSystem.dylib')


def responsible(pid):
    return libc.responsibility_get_pid_responsible_for_pid(pid)


def processes():
    out = subprocess.run(['ps', '-axo', 'pid=,comm='], capture_output=True, text=True).stdout
    for line in out.splitlines():
        m = re.match(r'\s*(\d+)\s+(.*)', line)
        if m:
            yield int(m.group(1)), m.group(2)


def find_app(needle):
    """The newest process whose executable path contains `needle` (an older copy left running isn't the one to watch)."""
    found = [pid for pid, comm in processes() if needle in comm and 'WebKit' not in comm]
    return max(found, key=lambda pid: started(pid) or 0) if found else None


def started(pid):
    """A process's start time (unix seconds), or None when it has gone."""
    out = subprocess.run(['ps', '-o', 'lstart=', '-p', str(pid)], capture_output=True, text=True).stdout.strip()
    try:
        return time.mktime(time.strptime(out, '%a %b %d %H:%M:%S %Y'))
    except ValueError:
        return None


def web_processes(app_pid, app_started, known):
    """{ pid: kind } of the app's WebKit processes; `known` caches each pid's verdict."""
    owner = responsible(app_pid)
    found = {}
    for pid, comm in processes():
        if 'com.apple.WebKit.' not in comm:
            continue
        if pid not in known:
            t = started(pid)
            known[pid] = t is not None and t >= app_started - 1 and responsible(pid) == owner
        if known[pid]:
            found[pid] = comm.rsplit('com.apple.WebKit.', 1)[1]  # WebContent, GPU, Networking
    return found


def footprints(pids):
    """phys_footprint in bytes per pid, from `footprint --noCategories -f bytes`."""
    if not pids:
        return {}
    args = ['footprint', '--noCategories', '-f', 'bytes']
    for p in pids:
        args += ['--pid', str(p)]
    out = subprocess.run(args, capture_output=True, text=True).stdout
    result, current = {}, None
    for line in out.splitlines():
        m = re.match(r'.* \[(\d+)\]: ', line)  # "com.apple.WebKit.WebContent [123]: 64-bit    Footprint: ..."
        if m:
            current = int(m.group(1))
        m = re.search(r'phys_footprint:\s*(\d+)', line)
        if m and current is not None:
            result[current] = int(m.group(1))
    return result


def breakdown(pid):
    """The content process's largest categories (bytes dirty), from `footprint -f bytes`."""
    out = subprocess.run(['footprint', '-f', 'bytes', '--pid', str(pid)], capture_output=True, text=True).stdout
    rows = []
    for line in out.splitlines():
        m = re.match(r'\s*(\d+) B\s+(\d+) B\s+(\d+) B\s+(\d+)\s+(\S.*)$', line)  # Dirty  Clean  Reclaimable  Regions  Category
        if m and int(m.group(1)) >= 16 * 1024 * 1024:
            rows.append({'category': m.group(5).strip(), 'dirty': int(m.group(1)), 'regions': int(m.group(4))})
    rows.sort(key=lambda r: -r['dirty'])
    return rows[:12]


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--app', required=True)
    ap.add_argument('--out', required=True)
    ap.add_argument('--every', type=float, default=1.0)
    ap.add_argument('--breakdown-every', type=float, default=15.0)
    ap.add_argument('--wait', type=float, default=120.0, help='seconds to wait for the app to appear')
    ap.add_argument('--label', default='')
    a = ap.parse_args()

    stop = {'now': False}
    for s in (signal.SIGINT, signal.SIGTERM):
        signal.signal(s, lambda *_: stop.update(now=True))

    t0 = time.time()
    app = None
    while app is None and time.time() - t0 < a.wait and not stop['now']:
        app = find_app(a.app)
        if app is None:
            time.sleep(0.2)
    if app is None:
        print('no app matching', a.app, file=sys.stderr)
        sys.exit(2)

    start = time.time()
    app_started, known = started(app) or start, {}
    samples, breakdowns, last_breakdown = [], [], 0.0
    while not stop['now']:
        tick = time.time()
        if started(app) is None:
            break  # the app has gone
        web = web_processes(app, app_started, known)
        fp = footprints(list(web))
        row = {'t': round(tick - start, 2), 'unix': round(tick, 2)}
        for pid, kind in web.items():
            if pid in fp:
                key = kind if kind not in row else f'{kind}-{pid}'
                row[key] = fp[pid]
                row.setdefault('pids', {})[key] = pid
        samples.append(row)
        content = max(((fp.get(p, 0), p) for p, k in web.items() if k == 'WebContent'), default=(0, None))[1]
        if content and tick - last_breakdown >= a.breakdown_every:
            last_breakdown = tick
            breakdowns.append({'t': row['t'], 'pid': content, 'top': breakdown(content)})
        time.sleep(max(0.0, a.every - (time.time() - tick)))

    def peak(kind):
        return max((s.get(kind, 0) for s in samples), default=0)

    doc = {
        'what': 'phys_footprint (bytes) of the web processes the app is responsible for, sampled with footprint(1)',
        'label': a.label, 'app': a.app.rsplit('/', 1)[-1], 'started': time.strftime('%Y-%m-%dT%H:%M:%SZ', time.gmtime(start)),
        'every': a.every, 'samples': len(samples),
        'peak': {k: peak(k) for k in ('WebContent', 'GPU', 'Networking')},
        'peakGB': {k: round(peak(k) / 2 ** 30, 2) for k in ('WebContent', 'GPU', 'Networking')},
        'series': samples, 'breakdowns': breakdowns,
    }
    with open(a.out, 'w') as f:
        json.dump(doc, f, indent=1)
        f.write('\n')
    print(f"{len(samples)} samples; peak WebContent {doc['peakGB']['WebContent']} GB, GPU {doc['peakGB']['GPU']} GB → {a.out}")


if __name__ == '__main__':
    main()
