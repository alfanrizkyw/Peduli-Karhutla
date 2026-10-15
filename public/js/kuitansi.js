(() => {
'use strict';
const $ = (s) => document.querySelector(s);
const rupiah = (n) => 'Rp ' + Math.round(Number(n) || 0).toLocaleString('id-ID');

/* angka -> kata (bahasa Indonesia) */
const sat = ['', 'satu', 'dua', 'tiga', 'empat', 'lima', 'enam', 'tujuh', 'delapan', 'sembilan', 'sepuluh', 'sebelas'];
function kata(n) {
  n = Math.floor(n);
  if (n < 12) return sat[n];
  if (n < 20) return kata(n - 10) + ' belas';
  if (n < 100) return kata(Math.floor(n / 10)) + ' puluh' + (n % 10 ? ' ' + kata(n % 10) : '');
  if (n < 200) return 'seratus' + (n > 100 ? ' ' + kata(n - 100) : '');
  if (n < 1000) return kata(Math.floor(n / 100)) + ' ratus' + (n % 100 ? ' ' + kata(n % 100) : '');
  if (n < 2000) return 'seribu' + (n > 1000 ? ' ' + kata(n - 1000) : '');
  if (n < 1e6) return kata(Math.floor(n / 1e3)) + ' ribu' + (n % 1e3 ? ' ' + kata(n % 1e3) : '');
  if (n < 1e9) return kata(Math.floor(n / 1e6)) + ' juta' + (n % 1e6 ? ' ' + kata(n % 1e6) : '');
  return String(n);
}
const terbilang = (n) => (n > 0 ? kata(n) : 'nol') + ' rupiah';

function fail(msg) { const s = $('#state'); s.textContent = msg; s.classList.add('is-err'); s.hidden = false; $('#view').hidden = true; }

function fmtDate(t) {
  const d = new Date(t), tz = { timeZone: 'Asia/Jakarta' };
  return d.toLocaleDateString('id-ID', { ...tz, day: 'numeric', month: 'long', year: 'numeric' }) + ', ' +
    d.toLocaleTimeString('id-ID', { ...tz, hour: '2-digit', minute: '2-digit', hour12: false }).replace(':', '.') + ' WIB';
}

(async function init() {
  const q = new URLSearchParams(location.search), id = q.get('id') || '', token = q.get('token') || '';
  if (!/^[a-f0-9]{16}$/.test(id) || !/^[a-f0-9]{32}$/.test(token)) return fail('Tautan nota tidak valid. Buka nota dari tombol "Cetak nota" di website.');
  let r;
  try {
    const res = await fetch(`/api/donations/${id}?token=${token}`, { cache: 'no-store' });
    if (!res.ok) return fail(res.status === 404 ? 'Nota tidak ditemukan.' : 'Gagal memuat nota. Coba lagi sebentar.');
    r = await res.json();
  } catch { return fail('Tidak bisa terhubung ke server. Periksa koneksi Anda.'); }
  if (r.status !== 'paid') return fail('Nota baru tersedia setelah pembayaran terkonfirmasi.');

  $('#rcNo').textContent = r.receiptNo;
  $('#rcName').textContent = r.name;
  $('#rcWho').textContent = r.name;
  $('#rcSay').textContent = terbilang(r.payAmount);
  $('#rcAmt').textContent = rupiah(r.payAmount);
  $('#rcDate').textContent = fmtDate(r.paidAt);
  document.title = `Nota ${r.receiptNo} — Peduli Karhutla`;
  $('#state').hidden = true; $('#view').hidden = false;
  $('#print').addEventListener('click', () => window.print());
  if (q.get('print') === '1') setTimeout(() => window.print(), 300);
})();
})();
