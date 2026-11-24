"""The spike's MediaPipe side (M4 W9): the Face Landmarker's 52 blendshape scores on each picture, running natively
(the mediapipe Python package: the same C++ graph and TFLite models the page ran in WebAssembly, here as native code on
the CPU through XNNPACK).

    python -I run_face.py <pictures dir> <face_landmarker.task> <out.json> [--repeat 30] [--jitter 8]

Per picture, scaled to the camera's 640x480: was a face found, the blendshape scores and the head's rotation matrix;
the time per frame over `repeat` runs after a warm-up, frame by frame (IMAGE mode) and as a video (VIDEO mode, which
tracks the face between frames), wall and CPU; and the same scores on `jitter` copies moved by a pixel or two.
"""
import json
import math
import os
import platform
import sys
import time

import mediapipe as mp
import numpy as np
from PIL import Image

W, H = 640, 480


def opt(name, default):
    return int(sys.argv[sys.argv.index(name) + 1]) if name in sys.argv else default


def frame(img, dx=0.0, dy=0.0, s=1.0):
    """The picture at the camera's size, moved by (dx, dy) pixels and scaled by s about its middle."""
    w, h = W * s, H * s
    out = Image.new("RGB", (W, H), (230, 230, 230))
    out.paste(img.resize((round(w), round(h)), Image.LANCZOS), (round((W - w) / 2 + dx), round((H - h) / 2 - dy)))
    return mp.Image(image_format=mp.ImageFormat.SRGB, data=np.asarray(out))


def stats(xs):
    a = sorted(xs)
    return {"median": round(a[len(a) // 2], 3), "p90": round(a[min(len(a) - 1, int(len(a) * 0.9))], 3), "mean": round(sum(a) / len(a), 3)}


def angles(m):
    """Yaw, pitch and roll (radians) from the face's rotation, as the matrix has them (the analysis names their signs)."""
    r = np.array(m)[:3, :3]
    return {"yaw": round(math.atan2(r[0][2], r[2][2]), 4), "pitch": round(math.asin(max(-1, min(1, -r[1][2]))), 4), "roll": round(math.atan2(r[1][0], r[1][1]), 4)}


# the scores a face take reads (takes' faceFromBlendshapes); a nudged copy keeps only these, the picture itself all 52
USED = {"eyeBlinkLeft", "eyeBlinkRight", "jawOpen", "mouthSmileLeft", "mouthSmileRight", "browInnerUp", "browOuterUpLeft", "browOuterUpRight", "browDownLeft", "browDownRight"}


def describe(res, every=True):
    if not res.face_landmarks:
        return {"found": False}
    out = {"found": True, "blendshapes": {c.category_name: round(c.score, 4) for c in res.face_blendshapes[0] if every or c.category_name in USED}}
    if res.facial_transformation_matrixes:
        out["matrix"] = angles(res.facial_transformation_matrixes[0])
    xs = [p.x for p in res.face_landmarks[0]]
    ys = [p.y for p in res.face_landmarks[0]]
    out["box"] = [round(min(xs), 4), round(1 - max(ys), 4), round(max(xs) - min(xs), 4), round(max(ys) - min(ys), 4)]
    return out


def main():
    pictures, model, dest = sys.argv[1], sys.argv[2], sys.argv[3]
    repeats, jitters = opt("--repeat", 30), opt("--jitter", 8)
    base = mp.tasks.BaseOptions(model_asset_path=model, delegate=mp.tasks.BaseOptions.Delegate.CPU)
    make = lambda mode: mp.tasks.vision.FaceLandmarker.create_from_options(mp.tasks.vision.FaceLandmarkerOptions(
        base_options=base, running_mode=mode, num_faces=1, output_face_blendshapes=True, output_facial_transformation_matrixes=True))
    image_mode, video_mode = make(mp.tasks.vision.RunningMode.IMAGE), make(mp.tasks.vision.RunningMode.VIDEO)
    seed = 12345

    def rnd():
        nonlocal seed
        seed = (seed * 1664525 + 1013904223) & 0xFFFFFFFF
        return seed / 4294967296 - 0.5

    rows, t_image, t_video, cpu_image, cpu_video, frames, ts = [], [], [], 0.0, 0.0, 0, 0
    for name in sorted(f for f in os.listdir(pictures) if f.endswith((".png", ".jpg"))):
        full = Image.open(os.path.join(pictures, name)).convert("RGB")
        img = frame(full)
        image_mode.detect(img)  # warm-up
        a, c0 = [], time.process_time()
        for _ in range(repeats):
            t = time.perf_counter(); res = image_mode.detect(img); a.append((time.perf_counter() - t) * 1000)
        cpu_image += (time.process_time() - c0) * 1000
        b, c0 = [], time.process_time()
        for _ in range(repeats):
            ts += 33
            t = time.perf_counter(); video_mode.detect_for_video(img, ts); b.append((time.perf_counter() - t) * 1000)
        cpu_video += (time.process_time() - c0) * 1000
        frames += repeats; t_image += a; t_video += b[1:]  # a new face's first video frame is a detection, not tracking
        row = describe(res)
        row.update(file=name, ms={"image": stats(a), "video": stats(b[1:])})
        row["jitter"] = [describe(image_mode.detect(frame(full, dx=rnd() * 6, dy=rnd() * 6, s=1 + rnd() * 0.03)), every=False) for _ in range(jitters)]
        rows.append(row)
        print(name, "face" if row["found"] else "NO FACE", file=sys.stderr)
    out = {
        "detector": f"MediaPipe Face Landmarker (mediapipe {mp.__version__}, Python {platform.python_version()}, CPU delegate), face_landmarker.task float16",
        "size": [W, H], "repeats": repeats, "frames": frames, "os": platform.platform(),
        "ms": {"image": stats(t_image), "video": stats(t_video)},
        "cpuMsPerFrame": {"image": round(cpu_image / max(1, frames), 3), "video": round(cpu_video / max(1, frames), 3)},
        "pictures": rows,
    }
    with open(dest, "w") as f:
        json.dump(out, f, separators=(",", ":"), sort_keys=True)
        f.write("\n")
    print(f"wrote {dest}: {len(rows)} pictures")


if __name__ == "__main__":
    main()
