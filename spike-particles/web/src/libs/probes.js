// Smoke probes for the two candidates not spiked in depth: three.proton.js 0.2.3 (Mage's choice)
// and @newkrok/three-particles 3.0.0. Question per library: does it load and step on three r187,
// and does a seeded Math.random swap + fixed step make it repeatable?
import * as THREE from 'three';
import ProtonNS from 'three.proton.js';
import { createParticleSystem, updateParticleSystems } from '@newkrok/three-particles';
import { Rng, withRandom } from '../core/rng.js';
import { withPortableMath } from '../core/detmath.js';
import { hashRows } from '../core/state.js';

const Proton = ProtonNS.default ?? ProtonNS;

export function protonRun({ seed = 7, steps = 600, emitters = 10, per = 1000, math = 'native' } = {}) {
  const rng = new Rng(seed);
  const wrap = math === 'portable' ? withPortableMath : (f) => f();
  return withRandom(rng, () => wrap(() => {
    const scene = new THREE.Scene();
    const proton = new Proton();
    for (let i = 0; i < emitters; i++) {
      const e = new Proton.Emitter();
      e.rate = new Proton.Rate(new Proton.Span(Math.round(per / 60)), new Proton.Span(1 / 60));
      e.addInitialize(new Proton.Mass(1));
      e.addInitialize(new Proton.Radius(0.05, 0.15));
      e.addInitialize(new Proton.Life(0.8, 1.2));
      e.addInitialize(new Proton.Position(new Proton.SphereZone(0.3)));
      e.addInitialize(new Proton.V(new Proton.Span(1, 3), new Proton.Vector3D(0, 1, 0), 180));
      e.addBehaviour(new Proton.Alpha(1, 0));
      e.addBehaviour(new Proton.Scale(1, 0.2));
      e.addBehaviour(new Proton.Gravity(0.02));
      e.p.x = i * 1.5; e.emit();
      proton.addEmitter(e);
    }
    proton.addRender(new Proton.MeshRender(scene)); // also exercises the three r187 surface
    const t0 = performance.now();
    for (let f = 0; f < steps; f++) proton.update(1 / 60);
    const ms = (performance.now() - t0) / steps;
    const rows = [];
    for (const e of proton.emitters) for (const p of e.particles) rows.push([p.p.x, p.p.y, p.p.z, p.v.x, p.v.y, p.v.z, p.age, p.life, p.scale, p.alpha]);
    return { ...hashRows(rows), msPerStep: Math.round(ms * 1000) / 1000, drawObjects: scene.children.length };
  }));
}

export function newkrokRun({ seed = 7, steps = 600, emitters = 10, per = 1000 } = {}) {
  const rng = new Rng(seed);
  return withRandom(rng, () => {
    const systems = [];
    const tex = new THREE.DataTexture(new Uint8Array([255, 255, 255, 255]), 1, 1); // its default texture needs document
    for (let i = 0; i < emitters; i++) {
      const sys = createParticleSystem({
        duration: 2, looping: true, maxParticles: Math.ceil(per * 1.6), startLifetime: { min: 0.8, max: 1.2 },
        startSpeed: { min: 1, max: 3 }, startSize: { min: 0.05, max: 0.15 }, gravity: 2,
        emission: { rateOverTime: Math.round(per / 60) * 60 }, shape: { shape: 'SPHERE', sphere: { radius: 0.3 } },
        simulationBackend: 'CPU', map: tex,
      }, 1000); // externalNow: 0 is falsy and falls back to Date.now()
      sys.instance.position.x = i * 1.5;
      systems.push(sys);
    }
    // the library times particles from a millisecond clock; drive it with a synthetic one
    const t0 = performance.now();
    for (let f = 0; f < steps; f++) {
      const now = 1000 + (f + 1) * 1000 / 60;
      updateParticleSystems({ now, delta: 1 / 60, elapsed: (f + 1) / 60 });
    }
    const ms = (performance.now() - t0) / steps;
    const rows = [];
    for (const s of systems) {
      const g = (s.instance.geometry);
      const pos = g.attributes.position.array, act = g.attributes.isActive?.array;
      for (let i = 0; i < pos.length / 3; i++) if (!act || act[i]) rows.push([pos[3 * i], pos[3 * i + 1], pos[3 * i + 2]]);
    }
    systems.forEach((s) => s.dispose());
    return { ...hashRows(rows), msPerStep: Math.round(ms * 1000) / 1000 };
  });
}
