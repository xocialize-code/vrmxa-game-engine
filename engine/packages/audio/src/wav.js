// WAV (RIFF, PCM 8/16/24/32-bit integer or 32-bit float) read without Web Audio: the clip's length for the simulation
// (exact: frames / rate), and its samples for tests and measurements in Node.

/** @param {Uint8Array} bytes → { sampleRate, channels, bits, float, frames, duration, dataOffset, dataSize } or null */
export function wavInfo(bytes) {
  if (bytes.length < 12) return null;
  const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const tag = (o) => String.fromCharCode(bytes[o], bytes[o + 1], bytes[o + 2], bytes[o + 3]);
  if (tag(0) !== 'RIFF' || tag(8) !== 'WAVE') return null;
  let fmt = null, dataOffset = -1, dataSize = 0;
  for (let o = 12; o + 8 <= bytes.length;) {
    const id = tag(o), size = dv.getUint32(o + 4, true);
    if (id === 'fmt ') fmt = { format: dv.getUint16(o + 8, true), channels: dv.getUint16(o + 10, true), sampleRate: dv.getUint32(o + 12, true), bits: dv.getUint16(o + 22, true) };
    else if (id === 'data') { dataOffset = o + 8; dataSize = Math.min(size, bytes.length - dataOffset); break; }
    o += 8 + size + (size & 1);
  }
  if (!fmt || dataOffset < 0) return null;
  const float = fmt.format === 3;
  const frames = Math.floor(dataSize / ((fmt.bits / 8) * fmt.channels));
  return { sampleRate: fmt.sampleRate, channels: fmt.channels, bits: fmt.bits, float, frames, duration: frames / fmt.sampleRate, dataOffset, dataSize };
}

/** The samples, one Float32Array per channel, in -1..1. */
export function wavSamples(bytes) {
  const info = wavInfo(bytes);
  if (!info) throw new Error('not a WAV file');
  const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const { channels, frames, bits, float, dataOffset } = info;
  const out = Array.from({ length: channels }, () => new Float32Array(frames));
  const step = bits / 8;
  for (let f = 0; f < frames; f++) {
    for (let c = 0; c < channels; c++) {
      const o = dataOffset + (f * channels + c) * step;
      let v;
      if (float) v = dv.getFloat32(o, true);
      else if (bits === 16) v = dv.getInt16(o, true) / 32768;
      else if (bits === 8) v = (dv.getUint8(o) - 128) / 128;
      else if (bits === 24) { const x = dv.getUint8(o) | (dv.getUint8(o + 1) << 8) | (dv.getInt8(o + 2) << 16); v = x / 8388608; }
      else v = dv.getInt32(o, true) / 2147483648;
      out[c][f] = v;
    }
  }
  return { ...info, data: out };
}

/** Write mono or multi-channel Float32 samples as 16-bit PCM WAV. @param {Float32Array[]} channels */
export function writeWav(channels, sampleRate) {
  const n = channels[0].length, ch = channels.length, size = n * ch * 2;
  const b = new Uint8Array(44 + size), dv = new DataView(b.buffer);
  const put = (o, s) => { for (let i = 0; i < 4; i++) b[o + i] = s.charCodeAt(i); };
  put(0, 'RIFF'); dv.setUint32(4, 36 + size, true); put(8, 'WAVE'); put(12, 'fmt ');
  dv.setUint32(16, 16, true); dv.setUint16(20, 1, true); dv.setUint16(22, ch, true); dv.setUint32(24, sampleRate, true);
  dv.setUint32(28, sampleRate * ch * 2, true); dv.setUint16(32, ch * 2, true); dv.setUint16(34, 16, true); put(36, 'data'); dv.setUint32(40, size, true);
  for (let i = 0; i < n; i++) for (let c = 0; c < ch; c++) dv.setInt16(44 + (i * ch + c) * 2, Math.round(Math.max(-1, Math.min(1, channels[c][i])) * 32767), true);
  return b;
}
