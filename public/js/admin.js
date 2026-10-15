(() => {
'use strict';
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const rupiah = (n) => 'Rp ' + Math.round(Number(n) || 0).toLocaleString('id-ID');
function h(tag, attrs, ...kids) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs || {})) { if (v == null || v === false) continue; if (k === 'class') el.className = v; else if (k === 'text') el.textContent = v; else el.setAttribute(k, v === true ? '' : v); }
  for (const kid of kids.flat()) if (kid != null) el.append(kid.nodeType ? kid : document.createTextNode(kid));
  return el;
}
let pw = null; try { pw = sessionStorage.getItem('pk_admin'); } catch { /* abaikan */ }
async function call(path, method = 'GET', body) {
  const res = await fetch('/api/admin' + path, { method, headers: { Authorization: 'Bearer ' + pw, ...(body ? { 'Content-Type': 'application/json' } : {}) }, body: body ? JSON.stringify(body) : undefined });
  let d = {}; try { d = await res.json(); } catch { /* kosong */ }
  if (!res.ok) throw Object.assign(new Error(d.error || 'Gagal'), { status: res.status });
  return d;
}
const fmtT = (t) => t ? new Date(t).toLocaleString('id-ID', { dateStyle: 'medium', timeStyle: 'short' }) : '-';
const label = { pending: 'Menunggu', paid: 'Berhasil', expired: 'Kedaluwarsa', cancelled: 'Dibatalkan' };

async function enter() {
  try { await call('/ping'); } catch (e) { pw = null; try { sessionStorage.removeItem('pk_admin'); } catch { /* abaikan */ } $('#login').hidden = false; $('#app').hidden = true; if (e.status && e.status !== 401) { $('#loginErr').textContent = e.message; $('#loginErr').hidden = false; } return false; }
  $('#login').hidden = true; $('#app').hidden = false; $('#logout').hidden = false;
  const m = await call('/meta');
  $('#meta').replaceChildren(
    h('span', { class: m.smtp ? 'ok' : 'no', text: m.smtp ? 'Email SMTP: aktif' : 'Email SMTP: belum diatur (email ke data/outbox.log)' }),
    h('span', { class: m.moota ? 'ok' : 'no', text: m.moota ? 'Webhook Moota: aktif' : 'Webhook Moota: belum diatur' }),
    h('span', { class: m.webhook ? 'ok' : 'no', text: m.webhook ? 'Webhook umum: aktif' : 'Webhook umum: belum diatur' }),
    h('span', { text: m.uniqueCode ? 'Kode unik: aktif' : 'Kode unik: mati' }));
  $('#dCat').replaceChildren(...m.categories.map((c) => h('option', { value: c.key, text: c.label })));
  $('#dDate').value = new Date().toLocaleDateString('en-CA');
  loadDon(); loadDis(); loadNotes();
  return true;
}
$('#loginForm').addEventListener('submit', async (e) => {
  e.preventDefault(); pw = $('#pw').value; $('#loginErr').hidden = true;
  try { sessionStorage.setItem('pk_admin', pw); } catch { /* abaikan */ }
  if (!(await enter())) { $('#loginErr').textContent = 'Password salah atau admin belum diaktifkan di .env'; $('#loginErr').hidden = false; }
});
$('#logout').addEventListener('click', () => { try { sessionStorage.removeItem('pk_admin'); } catch { /* abaikan */ } location.reload(); });
$$('.adm__tabs button').forEach((b) => b.addEventListener('click', () => {
  $$('.adm__tabs button').forEach((x) => x.classList.toggle('is-on', x === b));
  for (const t of ['don', 'dis', 'note']) $('#tab-' + t).hidden = t !== b.dataset.tab;
}));

async function loadDon() {
  const rows = await call('/donations' + ($('#fStatus').value ? '?status=' + $('#fStatus').value : ''));
  $('#donTable tbody').replaceChildren(...rows.map((d) => h('tr', {},
    h('td', { text: fmtT(d.created_at) }),
    h('td', { text: d.name + (d.hide_name ? ' (anonim)' : '') }),
    h('td', { text: d.email }),
    h('td', { class: 'num2', text: rupiah(d.pay_amount) }),
    h('td', {}, h('span', { class: 'pill ' + d.status, text: label[d.status] || d.status }), d.paid_via ? h('small', { text: ' via ' + d.paid_via }) : null),
    h('td', { text: d.status === 'paid' ? (d.email_sent ? 'Terkirim' : `Belum (${d.email_attempts}x)`) : '-' }),
    h('td', {},
      d.status !== 'paid' && d.status !== 'cancelled' ? h('button', { class: 'btn-s', type: 'button', text: 'Konfirmasi', onclick: null, 'data-a': 'confirm', 'data-id': d.id }) : null,
      d.status === 'paid' ? h('button', { class: 'btn-s g', type: 'button', text: 'Kirim ulang email', 'data-a': 'resend', 'data-id': d.id }) : null))));
}
$('#donTable').addEventListener('click', async (e) => {
  const b = e.target.closest('button[data-a]'); if (!b) return;
  if (b.dataset.a === 'confirm' && !confirm('Konfirmasi bahwa pembayaran ini sudah masuk ke rekening?')) return;
  b.disabled = true;
  try { const r = await call(`/donations/${b.dataset.id}/${b.dataset.a === 'confirm' ? 'confirm' : 'resend-email'}`, 'POST'); if (b.dataset.a === 'resend') alert(r.ok ? 'Email terkirim.' : 'Email gagal dikirim. Cek pengaturan SMTP.'); }
  catch (err) { alert(err.message); }
  loadDon();
});
$('#fStatus').addEventListener('change', loadDon); $('#reloadDon').addEventListener('click', loadDon);

$('#dAmount').addEventListener('input', (e) => { const v = Number(e.target.value.replace(/\D/g, '')); e.target.value = v ? v.toLocaleString('id-ID') : ''; });
$('#disForm').addEventListener('submit', async (e) => {
  e.preventDefault(); const err = $('#disErr'); err.hidden = true;
  try {
    await call('/disbursements', 'POST', { date: $('#dDate').value, amount: Number($('#dAmount').value.replace(/\D/g, '')), category: $('#dCat').value, location: $('#dLoc').value, recipient: $('#dRecv').value, proofUrl: $('#dProof').value, description: $('#dDesc').value });
    ['#dAmount', '#dLoc', '#dRecv', '#dProof', '#dDesc'].forEach((s) => { $(s).value = ''; }); loadDis();
  } catch (x) { err.textContent = x.message; err.hidden = false; }
});
async function loadDis() {
  const res = await fetch('/api/public'); const d = await res.json();
  $('#disTable tbody').replaceChildren(...d.disbursements.map((r) => h('tr', {},
    h('td', { text: r.date }), h('td', {}, r.categoryLabel, r.description ? h('small', { text: r.description }) : null), h('td', { text: r.location }),
    h('td', { class: 'num2', text: rupiah(r.amount) }),
    h('td', {}, h('button', { class: 'btn-s', type: 'button', text: 'Hapus', 'data-id': r.id })))));
}
$('#disTable').addEventListener('click', async (e) => {
  const b = e.target.closest('button[data-id]'); if (!b || !confirm('Hapus catatan pencairan ini? Angka di website ikut berubah.')) return;
  await call('/disbursements/' + b.dataset.id, 'DELETE'); loadDis();
});
async function loadNotes() {
  const rows = await call('/notes');
  $('#noteTable tbody').replaceChildren(...rows.map((n) => h('tr', {}, h('td', { text: fmtT(n.created_at) }), h('td', { text: n.name }), h('td', { text: n.message }),
    h('td', {}, h('button', { class: 'btn-s', type: 'button', text: 'Hapus', 'data-id': n.id })))));
}
$('#noteTable').addEventListener('click', async (e) => {
  const b = e.target.closest('button[data-id]'); if (!b || !confirm('Hapus catatan ini dari halaman publik?')) return;
  await call('/notes/' + b.dataset.id, 'DELETE'); loadNotes();
});
if (pw) enter();
})();
