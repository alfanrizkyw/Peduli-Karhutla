'use strict';
// Utilitas QRIS (standar EMVCo MPM): ubah QRIS statis -> dinamis dengan nominal.

function crc16(str) {
  let crc = 0xffff;
  for (const b of Buffer.from(str, 'utf8')) {
    crc ^= b << 8;
    for (let i = 0; i < 8; i++) crc = crc & 0x8000 ? ((crc << 1) ^ 0x1021) & 0xffff : (crc << 1) & 0xffff;
  }
  return crc.toString(16).toUpperCase().padStart(4, '0');
}

function parseTLV(s) {
  const out = [];
  let i = 0;
  while (i < s.length) {
    const tag = s.slice(i, i + 2);
    const len = parseInt(s.slice(i + 2, i + 4), 10);
    if (!/^\d{2}$/.test(tag) || Number.isNaN(len)) throw new Error('Format QRIS tidak valid');
    const value = s.slice(i + 4, i + 4 + len);
    if (value.length !== len) throw new Error('Panjang data QRIS tidak sesuai');
    out.push({ tag, value });
    i += 4 + len;
  }
  return out;
}

const tlv = (tag, value) => tag + String(value.length).padStart(2, '0') + value;

function isCrcValid(payload) {
  if (payload.length < 8 || payload.slice(-8, -4) !== '6304') return false;
  return crc16(payload.slice(0, -4)) === payload.slice(-4).toUpperCase();
}

/**
 * @param {string} staticQris  payload QRIS statis (hasil scan gambar QR)
 * @param {number} amount      nominal rupiah (bilangan bulat)
 */
function makeDynamic(staticQris, amount) {
  const raw = String(staticQris || '').trim();
  if (!isCrcValid(raw)) throw new Error('CRC QRIS statis tidak valid. Pastikan payload QRIS benar.');
  if (!Number.isInteger(amount) || amount <= 0) throw new Error('Nominal tidak valid');

  const fields = parseTLV(raw.slice(0, -8)).filter((f) => f.tag !== '54'); // buang nominal lama jika ada
  const out = [];
  let inserted = false;
  for (const f of fields) {
    if (f.tag === '01') f.value = '12'; // 11 = statis, 12 = dinamis
    // tag 54 harus setelah 53 (mata uang) dan sebelum 58 (negara)
    if (!inserted && Number(f.tag) > 54) {
      out.push({ tag: '54', value: String(amount) });
      inserted = true;
    }
    out.push(f);
  }
  if (!inserted) out.push({ tag: '54', value: String(amount) });
  const body = out.map((f) => tlv(f.tag, f.value)).join('') + '6304';
  return body + crc16(body);
}

module.exports = { crc16, parseTLV, isCrcValid, makeDynamic };
