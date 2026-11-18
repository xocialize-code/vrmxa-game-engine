// Node's view of public/models for world.js.
import fs from 'node:fs';
const dir = new URL('./public/models/', import.meta.url);
export const files = {
  bytes: async (p) => new Uint8Array(fs.readFileSync(new URL(p, dir))),
  json: async (p) => JSON.parse(fs.readFileSync(new URL(p, dir), 'utf8')),
};
