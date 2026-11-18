// The anime effects pmndrs doesn't have (research/cinematics.md §1.3; spike-cinematics' speed lines and edges), as pmndrs
// Effects so they merge into the stack's passes. Every parameter is resolution-independent: lengths are given in pixels
// at 1080p and scaled by the output's height, so a 4K export looks like the 1080p preview.
import { Effect, EffectAttribute, BlendFunction } from 'postprocessing';
import { Uniform, Vector2 } from 'three';

// Speed lines and focus lines (radial streaks from a centre) and the impact frame (a posterised inverse silhouette).
// The streak pattern is seeded, not timed: keys on `seed` (a post track) animate it on twos or threes, as anime does.
const animeFrag = /* glsl */`
uniform float speedLines; uniform float focusLines; uniform float impact; uniform float seed; uniform vec2 centre; uniform float aspect;
float h1(float n){ return fract(sin(n * 12.9898) * 43758.5453); }
void mainImage(const in vec4 inputColor, const in vec2 uv, out vec4 outputColor){
  vec3 c = inputColor.rgb;
  vec2 p = (uv - centre) * vec2(aspect, 1.0);
  float r = length(p), ang = atan(p.y, p.x);
  if (speedLines > 0.0) {
    float k = floor((ang + 3.14159) / 6.28318 * 180.0);
    float line = step(0.82, h1(k + seed)) * smoothstep(0.18 + 0.2 * h1(k * 1.7 + seed), 0.75, r);
    c = mix(c, vec3(1.0), line * speedLines);
  }
  if (focusLines > 0.0) {
    float k = floor((ang + 3.14159) / 6.28318 * 260.0);
    float line = step(0.7, h1(k * 3.1 + seed)) * smoothstep(0.32 + 0.25 * h1(k + seed * 0.7), 0.95, r);
    c = mix(c, vec3(0.04, 0.03, 0.05), line * focusLines);
  }
  if (impact > 0.0) {
    float lum = dot(c, vec3(0.299, 0.587, 0.114));
    c = mix(c, vec3(step(lum, 0.35)), impact);
  }
  outputColor = vec4(c, inputColor.a);
}`;

export class AnimeEffect extends Effect {
  constructor({ speedLines = 0, focusLines = 0, impact = 0, seed = 3, centre = [0.5, 0.5] } = {}) {
    super('AnimeEffect', animeFrag, { blendFunction: BlendFunction.NORMAL, uniforms: new Map([
      ['speedLines', new Uniform(speedLines)], ['focusLines', new Uniform(focusLines)], ['impact', new Uniform(impact)],
      ['seed', new Uniform(seed)], ['centre', new Uniform(new Vector2(centre[0], centre[1]))], ['aspect', new Uniform(16 / 9)],
    ]) });
  }
  setSize(w, h) { this.uniforms.get('aspect').value = w / h; }
}

// Screen-space edges from depth and normals, for sets and props only: a mask (characters drawn white into a target)
// switches them off where MToon's own hull outline is (never stack the two, §3.4).
const edgeFrag = /* glsl */`
uniform sampler2D tNormal; uniform sampler2D tMask; uniform vec2 texel; uniform float thickness; uniform vec3 colour; uniform float strength;
float lin(float d){ return perspectiveDepthToViewZ(d, cameraNear, cameraFar); }
void mainImage(const in vec4 inputColor, const in vec2 uv, const in float depth, out vec4 outputColor){
  vec2 o = texel * thickness; float z = lin(depth);
  float m = texture2D(tMask, uv).r;
  float dz = 0.0, dn = 0.0; vec3 n0 = texture2D(tNormal, uv).xyz * 2.0 - 1.0;
  vec2 offs[4]; offs[0] = vec2(o.x, 0.0); offs[1] = vec2(-o.x, 0.0); offs[2] = vec2(0.0, o.y); offs[3] = vec2(0.0, -o.y);
  for (int i = 0; i < 4; i++) {
    m = max(m, texture2D(tMask, uv + offs[i]).r);
    dz += abs(lin(readDepth(uv + offs[i])) - z);
    vec3 n = texture2D(tNormal, uv + offs[i]).xyz * 2.0 - 1.0; dn += 1.0 - dot(n0, n);
  }
  // soft thresholds: a hard step lands on different pixels at each resolution (a 4K frame scaled down wouldn't match)
  float e = max(smoothstep(0.02 * abs(z), 0.07 * abs(z), dz), smoothstep(0.35, 0.85, dn)) * (1.0 - m) * strength;
  outputColor = vec4(mix(inputColor.rgb, colour, e), inputColor.a);
}`;

export class EdgeEffect extends Effect {
  constructor({ normal, mask, thickness = 1, colour = [0.05, 0.03, 0.04], strength = 1 }) {
    super('EdgeEffect', edgeFrag, { attributes: EffectAttribute.DEPTH, uniforms: new Map([
      ['tNormal', new Uniform(normal)], ['tMask', new Uniform(mask)], ['texel', new Uniform(new Vector2(1 / 1920, 1 / 1080))],
      ['thickness', new Uniform(thickness)], ['colour', new Uniform(colour)], ['strength', new Uniform(strength)],
    ]) });
    this.thickness1080 = thickness;
  }
  setSize(w, h) { this.uniforms.get('texel').value.set(1 / w, 1 / h); this.uniforms.get('thickness').value = Math.max(1, this.thickness1080 * (h / 1080)); }
}
