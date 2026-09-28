import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = dirname(fileURLToPath(import.meta.url));
let checked = 0;
for (const directory of ['app', 'tray']) {
  for (const name of readdirSync(join(root, directory)).filter(name => name.endsWith('.png'))) {
    const data = readFileSync(join(root, directory, name));
    const size = Number(name.match(/-(\d+)\.png$/)[1]);
    assert.equal(data.subarray(1, 4).toString(), 'PNG', name);
    assert.equal(data.readUInt32BE(16), size, name);
    assert.equal(data.readUInt32BE(20), size, name);
    assert.equal(data[25], 6, `${name} must have RGBA transparency`);
    checked++;
  }
}
const ico = readFileSync(join(root, 'app/icon.ico'));
assert.equal(ico.readUInt16LE(0), 0);
assert.equal(ico.readUInt16LE(2), 1);
assert.equal(ico.readUInt16LE(4), 8);
for (let i = 0; i < 8; i++) {
  const entry = 6 + i * 16;
  const size = ico[entry] || 256;
  const length = ico.readUInt32LE(entry + 8);
  const offset = ico.readUInt32LE(entry + 12);
  assert.deepEqual(ico.subarray(offset, offset + length), readFileSync(join(root, `app/icon-${size}.png`)));
}
const icns = readFileSync(join(root, 'app/icon.icns'));
assert.equal(icns.subarray(0, 4).toString(), 'icns');
assert.equal(icns.readUInt32BE(4), icns.length);
let cursor = 8;
for (const [type, size] of [['ic07', 128], ['ic08', 256], ['ic09', 512], ['ic10', 1024]]) {
  assert.equal(icns.subarray(cursor, cursor + 4).toString(), type);
  const length = icns.readUInt32BE(cursor + 4);
  assert.deepEqual(icns.subarray(cursor + 8, cursor + length), readFileSync(join(root, `app/icon-${size}.png`)));
  cursor += length;
}
assert.equal(cursor, icns.length);
console.log(`Verified ${checked} RGBA icon sizes, 8 ICO frames and 4 ICNS frames.`);
