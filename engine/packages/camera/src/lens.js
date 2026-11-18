// The physical lens: focal length in mm on a named sensor, focus distance and f-stop, and the thin-lens
// maths (research/cinematics.md §1.2; the cinematics spike's thinLens). No library takes an f-stop, so the
// engine turns these into a field of view and depth-of-field numbers the post stack uses.

/** Sensor sizes in mm (width × height of the full gate). */
export const SENSORS = {
  super35: [24.89, 18.66],
  fullframe: [36, 24],
  mft: [17.3, 13],
  custom: [24.89, 18.66],
};

/**
 * Vertical field of view (degrees) for a focal length on a sensor, fitted to the output's aspect: the
 * sensor's width fills the frame when the output is wider than the sensor, else its height.
 */
export function verticalFov(focalMm, sensor = 'super35', aspect = 16 / 9) {
  const [w, h] = SENSORS[sensor] ?? SENSORS.super35;
  const gateH = aspect >= w / h ? w / aspect : h;
  return (2 * Math.atan(gateH / (2 * focalMm)) * 180) / Math.PI;
}

/**
 * Thin-lens depth of field, metres. `coc` is the circle of confusion on the sensor (default 0.025 mm).
 * → { hyperfocal, near, far, cocAt(d) } with cocAt as a fraction of the sensor width
 */
export function thinLens({ focalMm, focusM, fStop, cocMm = 0.025, sensor = 'super35' }) {
  const f = focalMm / 1000, c = cocMm / 1000, s = focusM;
  const hyperfocal = (f * f) / (fStop * c) + f;
  const near = (s * (hyperfocal - f)) / (hyperfocal + s - 2 * f);
  const far = s < hyperfocal ? (s * (hyperfocal - f)) / (hyperfocal - s) : Infinity;
  const width = (SENSORS[sensor] ?? SENSORS.super35)[0] / 1000;
  const cocAt = (d) => ((Math.abs(d - s) / d) * (f * f)) / (fStop * (s - f)) / width;
  return { hyperfocal, near, far, cocAt };
}
