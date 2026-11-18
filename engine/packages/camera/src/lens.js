// The physical lens: focal length in mm on a sensor, gate fit, focus distance and f-stop, and the thin-lens maths
// (research/cinematics.md §1.2; the cinematics spike's thinLens). No library takes an f-stop, so the engine turns these
// into a field of view and the depth-of-field numbers the post stack (M2 W3) maps onto its backend.

/** Sensor sizes in mm (width × height of the full gate). `anime` is a 16:9 gate the width of Super 35. */
export const SENSORS = {
  super35: [24.89, 18.66],
  fullframe: [36, 24],
  mft: [17.3, 13],
  anime: [24.89, 14],
  custom: [24.89, 18.66],
};

/** A sensor by name, or [w, h] mm given directly. */
export function sensorSize(sensor = 'super35') { return Array.isArray(sensor) ? sensor : SENSORS[sensor] ?? SENSORS.super35; }

/**
 * Vertical field of view (degrees) for a focal length on a sensor at an output aspect. Gate fit `fill` (the default)
 * fills the frame with the sensor and crops what sticks out; `overscan` shows the whole sensor and adds frame around it.
 */
export function verticalFov(focalMm, sensor = 'super35', aspect = 16 / 9, gateFit = 'fill') {
  const [w, h] = sensorSize(sensor);
  const wider = aspect >= w / h;
  const gateH = gateFit === 'overscan' ? (wider ? h : w / aspect) : (wider ? w / aspect : h);
  return (2 * Math.atan(gateH / (2 * focalMm)) * 180) / Math.PI;
}

/** The focal length (mm) that gives a vertical field of view (degrees) on a sensor at an aspect (the inverse). */
export function focalForFov(fovDeg, sensor = 'super35', aspect = 16 / 9, gateFit = 'fill') {
  const [w, h] = sensorSize(sensor);
  const wider = aspect >= w / h;
  const gateH = gateFit === 'overscan' ? (wider ? h : w / aspect) : (wider ? w / aspect : h);
  return gateH / (2 * Math.tan((fovDeg * Math.PI) / 360));
}

/** A circle of confusion from the sensor: its diagonal / 1500 (mm). thinLens's default stays 0.025 mm, which the
 * research's worked example (50 mm, f/1.8, 3.9 m → 3.65–4.19 m) and M0 use; pass this as cocMm for the diagonal rule. */
export function defaultCoc(sensor = 'super35') { const [w, h] = sensorSize(sensor); return Math.sqrt(w * w + h * h) / 1500; }

/**
 * Thin-lens depth of field, metres (circle of confusion 0.025 mm unless given): hyperfocal H = f²/(N·c) + f; near = s(H − f)/(H + s − 2f); far = s(H − f)/(H − s)
 * when s < H, else ∞. `cocAt(d)` is the blur circle at distance d as a fraction of the sensor width.
 */
export function thinLens({ focalMm, focusM, fStop, cocMm, sensor = 'super35' }) {
  const f = focalMm / 1000, c = (cocMm ?? 0.025) / 1000, s = focusM;
  const hyperfocal = (f * f) / (fStop * c) + f;
  const near = (s * (hyperfocal - f)) / (hyperfocal + s - 2 * f);
  const far = s < hyperfocal ? (s * (hyperfocal - f)) / (hyperfocal - s) : Infinity;
  const width = sensorSize(sensor)[0] / 1000;
  const cocAt = (d) => ((Math.abs(d - s) / d) * (f * f)) / (fStop * (s - f)) / width;
  return { hyperfocal, near, far, cocAt };
}

/**
 * What a post stack's depth of field needs (W3 maps it onto pmndrs or TSL): focus distance, the sharp range, and the
 * blur at infinity in pixels of an output `heightPx` tall (the backend's bokeh scale).
 */
export function postDof({ focalMm, focusM, fStop, cocMm, sensor = 'super35', heightPx = 1080, aspect = 16 / 9 }) {
  const t = thinLens({ focalMm, focusM, fStop, cocMm, sensor });
  const f = focalMm / 1000, [w] = sensorSize(sensor);
  const cocInfinity = (f * f) / (fStop * (focusM - f)) / (w / 1000); // fraction of the sensor width
  return { focusDistance: focusM, near: t.near, far: t.far, focusRange: Number.isFinite(t.far) ? t.far - t.near : 1e6, bokehPx: cocInfinity * heightPx * aspect };
}
