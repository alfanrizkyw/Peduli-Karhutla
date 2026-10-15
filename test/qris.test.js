'use strict';
const assert = require('assert');
const { makeDynamic, isCrcValid, parseTLV } = require('../lib/qris');
const cfg = require('../config');

assert(isCrcValid(cfg.qrisStatic), 'QRIS statis harus valid');
for (const amt of [1000, 5000, 25000, 1000000, 9999999]) {
  const q = makeDynamic(cfg.qrisStatic, amt);
  assert(isCrcValid(q), 'CRC dinamis valid ' + amt);
  const f = Object.fromEntries(parseTLV(q.slice(0, -8)).map((x) => [x.tag, x.value]));
  assert.strictEqual(f['01'], '12');
  assert.strictEqual(f['54'], String(amt));
  assert.strictEqual(f['58'], 'ID');
  assert.strictEqual(f['59'], 'Peduli Karhutla, Service');
  // urutan tag harus naik
  const tags = parseTLV(q.slice(0, -8)).map((x) => +x.tag);
  assert.deepStrictEqual(tags, [...tags].sort((a, b) => a - b));
}
assert.throws(() => makeDynamic(cfg.qrisStatic.replace('4FA6', '0000'), 5000));
console.log('QRIS OK');
