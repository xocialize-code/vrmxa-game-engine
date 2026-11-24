// The package's own SHA-256 against node:crypto: the standard vectors, every length around a block boundary, and a
// megabyte of varied bytes.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { sha256, sha256Text } from '@vrmxg/bundle';

const node = (b) => createHash('sha256').update(b).digest('hex');

test('the standard vectors', () => {
  assert.equal(sha256(new Uint8Array(0)), 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855');
  assert.equal(sha256Text('abc'), 'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
  assert.equal(sha256Text('abcdbcdecdefdefgefghfghighijhijkijkljklmklmnlmnomnopnopq'), '248d6a61d20638b8e5c026930c3e6039a33ce45964ff2167f6ecedd419db06c1');
});

test('every length from 0 to 300 bytes matches node:crypto', () => {
  for (let n = 0; n <= 300; n++) {
    const b = Uint8Array.from({ length: n }, (_, i) => (i * 131 + n * 7) & 255);
    assert.equal(sha256(b), node(b), `${n} bytes`);
  }
});

test('a megabyte, and a view into a larger buffer', () => {
  const big = new Uint8Array(1 << 20);
  let x = 12345;
  for (let i = 0; i < big.length; i++) { x = (x * 1103515245 + 12345) >>> 0; big[i] = x >>> 16; }
  assert.equal(sha256(big), node(big));
  const view = big.subarray(1001, 70000);
  assert.equal(sha256(view), node(view));
});
