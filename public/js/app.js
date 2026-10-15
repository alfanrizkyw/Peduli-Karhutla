(() => {
'use strict';
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const rupiah = (n) => 'Rp ' + Math.round(Number(n) || 0).toLocaleString('id-ID');
const LS = {
  get(k, d) { try { const v = localStorage.getItem(k); return v === null ? d : JSON.parse(v); } catch { return d; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* abaikan */ } },
  del(k) { try { localStorage.removeItem(k); } catch { /* abaikan */ } }
};
function h(tag, attrs, ...kids) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs || {})) {
    if (v === false || v == null) continue;
    if (k === 'class') el.className = v; else if (k === 'text') el.textContent = v; else el.setAttribute(k, v === true ? '' : v);
  }
  for (const kid of kids.flat()) if (kid != null) el.append(kid.nodeType ? kid : document.createTextNode(kid));
  return el;
}
const api = async (url, opts) => {
  const res = await fetch(url, opts && opts.body ? { ...opts, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(opts.body) } : opts);
  let data = {}; try { data = await res.json(); } catch { /* kosong */ }
  if (!res.ok) throw Object.assign(new Error(data.error || 'Terjadi kesalahan. Coba lagi.'), { status: res.status });
  return data;
};
const timeAgo = (ts) => {
  const s = Math.max(0, (Date.now() + clockOffset - ts) / 1000);
  if (s < 45) return 'baru saja';
  if (s < 3600) return Math.round(s / 60) + ' menit lalu';
  if (s < 86400) return Math.round(s / 3600) + ' jam lalu';
  if (s < 86400 * 30) return Math.round(s / 86400) + ' hari lalu';
  return new Date(ts).toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' });
};
let clockOffset = 0;
const visitor = (() => {
  let v = LS.get('pk_visitor', null);
  if (!v) { v = (crypto.randomUUID ? crypto.randomUUID() : String(Math.random()).slice(2) + Date.now().toString(16) + '0000000000'); LS.set('pk_visitor', v); }
  return v;
})();

/* ================= daun bergerak di teks ================= */
function buildLeaves() {
  const box = $('#leaves'); if (!box) return;
  let seed = 7; const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  const colors = ['#1b5230', '#2d6e42', '#12351d', '#3b7d4c'];
  const NS = 'http://www.w3.org/2000/svg';
  const width = $('.leafline__txt').offsetWidth || 400;
  const n = Math.max(9, Math.min(20, Math.round(width / 38)));
  for (let i = 0; i < n; i++) {
    const s = 20 + rnd() * 20;
    const leaf = h('span', { class: 'leaf' });
    const st = leaf.style;
    st.setProperty('--x', (rnd() * 96).toFixed(1) + '%');
    st.setProperty('--y', (-30 + rnd() * 120).toFixed(1) + '%');
    st.setProperty('--s', s.toFixed(0) + 'px');
    st.setProperty('--o', (0.38 + rnd() * 0.27).toFixed(2));
    st.setProperty('--d', (8 + rnd() * 8).toFixed(1) + 's');
    st.setProperty('--dl', (-rnd() * 12).toFixed(1) + 's');
    st.setProperty('--dx', ((rnd() - 0.5) * 70).toFixed(0) + 'px');
    st.setProperty('--dy', ((rnd() - 0.3) * 34).toFixed(0) + 'px');
    st.setProperty('--r0', (rnd() * 360).toFixed(0) + 'deg');
    st.setProperty('--r1', (rnd() * 360).toFixed(0) + 'deg');
    st.setProperty('--c', colors[i % colors.length]);
    st.setProperty('--sw', (3 + rnd() * 3).toFixed(1) + 's');
    const svg = document.createElementNS(NS, 'svg'); svg.setAttribute('viewBox', '0 0 24 24');
    const p = document.createElementNS(NS, 'path'); p.setAttribute('d', 'M12 22C3.5 17.5 3 8.5 12 1.5c9 7 8.5 16 0 20.5z');
    svg.append(p); leaf.append(svg); box.append(leaf);
  }
}

/* ================= angka berjalan ================= */
const shown = {};
function countTo(el, key, target, fmt) {
  const from = shown[key] ?? 0; shown[key] = target;
  if (from === target || matchMedia('(prefers-reduced-motion: reduce)').matches) { el.textContent = fmt(target); return; }
  const t0 = performance.now(), dur = 900;
  const step = (t) => { const k = Math.min(1, (t - t0) / dur), e = 1 - Math.pow(1 - k, 3); el.textContent = fmt(from + (target - from) * e); if (k < 1) requestAnimationFrame(step); };
  requestAnimationFrame(step);
}

/* ================= data publik ================= */
let data = null, sortMode = 'new', cfg = null, lastDonorKey = '';
async function loadPublic() {
  try {
    const d = await api('/api/public?v=' + encodeURIComponent(visitor));
    clockOffset = d.serverTime - Date.now();
    data = d; renderAll();
  } catch { /* offline: biarkan data lama */ }
}
let refreshT; const refresh = () => { clearTimeout(refreshT); refreshT = setTimeout(loadPublic, 120); };

function renderAll() {
  const s = data.stats;
  countTo($('#raised'), 'raised', s.raised, rupiah);
  $('#target').textContent = rupiah(s.target);
  $('#barFill').style.width = s.percent.toFixed(1) + '%';
  $('#bar').setAttribute('aria-valuenow', s.percent.toFixed(1));
  $('#pct').textContent = (s.percent < 10 && s.percent > 0 ? s.percent.toFixed(1) : Math.round(s.percent)).toString().replace('.', ',') + '%';
  countTo($('#sDonors'), 'donors', s.donors, (v) => Math.round(v).toLocaleString('id-ID'));
  countTo($('#sTimes'), 'times', s.disbursedCount, (v) => Math.round(v).toLocaleString('id-ID'));
  countTo($('#sLocs'), 'locs', s.locationCount, (v) => Math.round(v).toLocaleString('id-ID'));
  countTo($('#tRaised'), 'tRaised', s.raised, rupiah);
  countTo($('#tDisb'), 'tDisb', s.disbursedTotal, rupiah);
  countTo($('#tAvail'), 'tAvail', s.available, rupiah);
  countTo($('#tTimes'), 'tTimes', s.disbursedCount, (v) => Math.round(v).toLocaleString('id-ID') + ' kali');
  renderDonors(); renderAlloc(); renderLocs(); renderLedger(); renderNotes();
}

function renderDonors() {
  const ul = $('#donorList'); const list = data.donors;
  if (!list.length) { ul.replaceChildren(h('li', { class: 'empty', text: 'Belum ada donasi. Jadilah yang pertama.' })); return; }
  const key = list[0].at + ':' + list[0].amount;
  const isNew = lastDonorKey && key !== lastDonorKey; lastDonorKey = key;
  ul.replaceChildren(...list.map((d, i) => h('li', { class: i === 0 && isNew ? 'flash' : '' },
    h('span', { class: 'who' }, d.name, h('span', { class: 'when', 'data-ts': d.at, text: timeAgo(d.at) })),
    h('span', { class: 'amt2', text: rupiah(d.amount) }))));
}

function renderAlloc() {
  const ul = $('#alloc');
  ul.replaceChildren(...data.allocation.map((a) => {
    const pct = a.planned > 0 ? Math.min(100, (a.disbursed / a.planned) * 100) : (a.disbursed > 0 ? 100 : 0);
    const meter = h('div', { class: 'meter' }, h('i'));
    meter.firstChild.style.width = pct.toFixed(1) + '%';
    return h('li', {},
      h('div', { class: 'alloc__top' }, h('strong', { text: a.label }), h('span', { class: 'alloc__pct', text: a.percent + '%' })),
      h('p', { class: 'alloc__note', text: a.note }), meter,
      h('div', { class: 'alloc__nums' },
        h('span', {}, 'Rencana ', h('b', { text: rupiah(a.planned) })),
        h('span', {}, 'Tersalur ', h('b', { text: rupiah(a.disbursed) })),
        h('span', {}, a.remaining >= 0 ? 'Sisa ' : 'Melebihi ', h('b', { text: rupiah(Math.abs(a.remaining)) }))));
  }));
}

function renderLocs() {
  const ul = $('#locs');
  if (!data.locations.length) { ul.replaceChildren(h('li', { class: 'empty', text: 'Belum ada pencairan ke lokasi.' })); return; }
  const max = Math.max(...data.locations.map((l) => l.amount));
  ul.replaceChildren(...data.locations.map((l) => {
    const m = h('div', { class: 'meter' }, h('i')); m.firstChild.style.width = ((l.amount / max) * 100).toFixed(1) + '%';
    return h('li', {}, h('div', { class: 'locs__top' }, h('span', { text: l.location }), h('span', { text: rupiah(l.amount) })),
      h('small', { text: l.count + ' kali pencairan' }), m);
  }));
}

function renderLedger() {
  const box = $('#ledger');
  if (!data.disbursements.length) { box.replaceChildren(h('p', { class: 'empty', text: 'Belum ada pencairan. Setiap pencairan akan muncul di sini begitu dicatat pengelola.' })); return; }
  const fmt = (d) => new Date(d + 'T00:00:00').toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' });
  const rows = data.disbursements.map((d) => h('tr', {},
    h('td', { 'data-l': 'Tanggal', text: fmt(d.date) }),
    h('td', { 'data-l': 'Kebutuhan' }, d.categoryLabel, d.description ? h('small', { text: d.description }) : null,
      /^https?:\/\//i.test(d.proofUrl) ? h('small', {}, h('a', { href: d.proofUrl, target: '_blank', rel: 'noopener noreferrer', text: 'Lihat bukti' })) : null),
    h('td', { 'data-l': 'Lokasi', text: d.location }),
    h('td', { 'data-l': 'Penerima', text: d.recipient || '-' }),
    h('td', { class: 'num2', 'data-l': 'Jumlah', text: rupiah(d.amount) })));
  box.replaceChildren(h('table', {},
    h('thead', {}, h('tr', {}, h('th', { text: 'Tanggal' }), h('th', { text: 'Kebutuhan' }), h('th', { text: 'Lokasi' }), h('th', { text: 'Penerima' }), h('th', { class: 'r', text: 'Jumlah' }))),
    h('tbody', {}, rows)));
}

const heartSvg = () => { const ns = 'http://www.w3.org/2000/svg'; const s = document.createElementNS(ns, 'svg'); s.setAttribute('viewBox', '0 0 24 24'); s.setAttribute('aria-hidden', 'true'); const p = document.createElementNS(ns, 'path'); p.setAttribute('d', 'M12 20.5s-7.5-4.6-9.2-9.4C1.6 7.700 3.700 4.500 7 4.500c2 0 3.700 1.100 5 3 1.300-1.900 3-3 5-3 3.300 0 5.400 3.200 4.200 6.600-1.700 4.800-9.200 9.400-9.200 9.400z'); s.append(p); return s; };

function renderNotes() {
  const ul = $('#notes');
  const list = [...data.notes];
  if (sortMode === 'top') list.sort((a, b) => b.likes - a.likes || b.id - a.id);
  if (!list.length) { ul.replaceChildren(h('li', { class: 'empty', text: 'Belum ada catatan. Donatur pertama bisa membuka halaman ini.' })); return; }
  ul.replaceChildren(...list.map((n) => {
    const btn = h('button', { type: 'button', class: 'heart', 'aria-pressed': String(n.liked), 'aria-label': `Beri hati untuk catatan ${n.name}. Jumlah hati ${n.likes}`, 'data-id': n.id }, heartSvg(), h('span', { text: String(n.likes) }));
    return h('li', { class: 'note' },
      h('div', {}, h('span', { class: 'note__who', text: n.name }), h('span', { class: 'note__when', 'data-ts': n.at, text: timeAgo(n.at) })),
      h('p', { class: 'note__msg', text: n.message }), btn);
  }));
}
$('#notes').addEventListener('click', async (e) => {
  const btn = e.target.closest('.heart'); if (!btn) return;
  const id = Number(btn.dataset.id), note = data.notes.find((n) => n.id === id); if (!note) return;
  note.liked = !note.liked; note.likes += note.liked ? 1 : -1; renderNotes();
  const nb = $(`.heart[data-id="${id}"]`); if (nb) { nb.classList.add('pop'); nb.focus({ preventScroll: true }); }
  try { const r = await api(`/api/notes/${id}/like`, { method: 'POST', body: { visitor } }); note.liked = r.liked; note.likes = r.likes; renderNotes(); const nb2 = $(`.heart[data-id="${id}"]`); if (nb2) nb2.focus({ preventScroll: true }); }
  catch { refresh(); }
});
$$('.seg button').forEach((b) => b.addEventListener('click', () => {
  sortMode = b.dataset.sort; $$('.seg button').forEach((x) => { const on = x === b; x.classList.toggle('is-on', on); x.setAttribute('aria-pressed', String(on)); });
  if (data) renderNotes();
}));
setInterval(() => $$('[data-ts]').forEach((el) => { el.textContent = timeAgo(Number(el.dataset.ts)); }), 30000);

/* ================= alur donasi ================= */
const st = { amount: 0, order: null, timer: null, poll: null, info: null };
const panes = { 1: $('#pane1'), 2: $('#pane2'), 3: $('#pane3'), done: $('#paneDone') };
function setStep(n) {
  for (const [k, el] of Object.entries(panes)) el.hidden = String(k) !== String(n);
  const idx = n === 'done' ? 4 : n;
  $$('.steps li').forEach((li) => { const s = Number(li.dataset.step); li.classList.toggle('is-on', s === idx); li.classList.toggle('is-done', s < idx); });
}
const showErr = (el, msg) => { el.textContent = msg || ''; el.hidden = !msg; };
const parseMoney = (s) => Number(String(s).replace(/\D/g, '')) || 0;

function buildAmounts() {
  const box = $('#amts');
  box.replaceChildren(...cfg.presets.map((v) => h('button', { type: 'button', class: 'amt', role: 'radio', 'aria-checked': 'false', 'data-v': v, text: rupiah(v) })));
}
function setAmount(v, fromCustom) {
  st.amount = v;
  $$('.amt').forEach((b) => b.setAttribute('aria-checked', String(!fromCustom && Number(b.dataset.v) === v)));
  if (!fromCustom) $('#custom').value = '';
  const ok = v >= cfg.min && v <= cfg.max;
  const btn = $('#to2'); btn.disabled = !ok;
  btn.textContent = ok ? 'Lanjut dengan ' + rupiah(v) : (v ? 'Nominal belum sesuai' : 'Pilih nominal dulu');
  showErr($('#err1'), v && !ok ? `Nominal harus antara ${rupiah(cfg.min)} dan ${rupiah(cfg.max)}.` : '');
}
$('#amts').addEventListener('click', (e) => { const b = e.target.closest('.amt'); if (b) setAmount(Number(b.dataset.v), false); });
$('#custom').addEventListener('input', (e) => {
  const v = parseMoney(e.target.value); e.target.value = v ? v.toLocaleString('id-ID') : ''; setAmount(v, true);
});
$('#to2').addEventListener('click', () => { $('#sum2').textContent = rupiah(st.amount); setStep(2); $('#name').focus({ preventScroll: true }); });
const toStep1 = () => setStep(1);
$('#back1').addEventListener('click', toStep1); $('#back1b').addEventListener('click', toStep1);

$('#pane2').addEventListener('submit', async (e) => {
  e.preventDefault();
  const name = $('#name').value.trim().replace(/\s+/g, ' ');
  if (name.length < 2) return showErr($('#err2'), 'Mohon isi nama Anda (minimal 2 huruf).'), $('#name').focus();
  showErr($('#err2'), '');
  const btn = $('#to3'); btn.disabled = true; btn.textContent = 'Membuat QRIS...';
  try { await createOrder({ name, hideName: $('#hide').checked }); }
  catch (err) { showErr($('#err2'), err.message); }
  finally { btn.disabled = false; btn.textContent = 'Tampilkan QRIS'; }
});

async function createOrder(p) {
  const o = await api('/api/donations', { method: 'POST', body: { ...p, amount: st.amount } });
  clockOffset = o.serverTime - Date.now();
  st.info = { name: p.name };
  st.order = { id: o.id, token: o.token };
  LS.set('pk_order', { ...st.order, name: p.name });
  const list = LS.get('pk_donations', []).filter((x) => x.id !== o.id); list.push({ id: o.id, token: o.token }); LS.set('pk_donations', list.slice(-15));
  showPay(o);
}

function showPay(o) {
  if (o.serverTime) clockOffset = o.serverTime - Date.now();
  st.expiresAt = o.expiresAt;
  $('#qrImg').src = o.qrImage; $('#dlQr').href = o.qrImage;
  $('#payAmt').textContent = rupiah(o.payAmount);
  $('#statusTxt').textContent = 'Menunggu pembayaran';
  $('#expiredNote').hidden = true; $('#renew').hidden = true;
  setStep(3); tick(); clearInterval(st.timer); clearInterval(st.poll);
  st.timer = setInterval(tick, 1000); st.poll = setInterval(pollStatus, 3000);
}
function tick() {
  const left = Math.round((st.expiresAt - (Date.now() + clockOffset)) / 1000);
  if (left > 0) { $('#timer').textContent = `QR berlaku ${String(Math.floor(left / 60)).padStart(2, '0')}:${String(left % 60).padStart(2, '0')}`; return; }
  $('#timer').textContent = 'Waktu QR habis'; $('#expiredNote').hidden = false; $('#renew').hidden = false; clearInterval(st.timer);
}
async function pollStatus() {
  if (!st.order) return;
  try {
    const r = await api(`/api/donations/${st.order.id}?token=${st.order.token}`);
    if (r.status === 'paid') return paid(r);
    if (r.status === 'cancelled') { stopPay(); setStep(1); }
    if (r.status === 'expired') { $('#timer').textContent = 'QR sudah tidak berlaku'; $('#renew').hidden = false; }
  } catch (e) { if (e.status === 404) { stopPay(); LS.del('pk_order'); setStep(1); } }
}
function stopPay() { clearInterval(st.timer); clearInterval(st.poll); st.timer = st.poll = null; }
function paid(r) {
  stopPay();
  const own = st.order || LS.get('pk_order', {}) || {};
  $('#doneTitle').textContent = 'Terima kasih, ' + r.name;
  $('#doneAmt').textContent = rupiah(r.payAmount);
  $('#receiptBtn').href = receiptUrl(r.id || own.id, own.token);
  LS.del('pk_order'); st.order = null;
  setStep('done'); refresh(); refreshComposer(); refreshReceipts();
  $('#donateBox').scrollIntoView({ behavior: 'smooth', block: 'center' });
}
$('#cancel').addEventListener('click', async () => {
  if (st.order) { try { await api(`/api/donations/${st.order.id}/cancel`, { method: 'POST', body: { token: st.order.token } }); } catch { /* abaikan */ } }
  stopPay(); LS.del('pk_order'); st.order = null; setStep(1);
});
$('#renew').addEventListener('click', async () => {
  const b = $('#renew'); b.disabled = true;
  try {
    const old = st.order; const r = await api(`/api/donations/${old.id}?token=${old.token}`);
    if (r.status === 'paid') return paid(r);
    await createOrder({ name: st.info.name, hideName: $('#hide').checked });
  } catch (e) { showErr($('#err2'), e.message); setStep(2); }
  finally { b.disabled = false; }
});
$('#again').addEventListener('click', () => { setAmount(0, false); $$('.amt').forEach((x) => x.setAttribute('aria-checked', 'false')); setStep(1); });
$('#goNote').addEventListener('click', () => setTimeout(() => { const t = $('#noteText'); if (t && !t.closest('[hidden]')) t.focus({ preventScroll: true }); }, 600));

async function resumeOrder() {
  const o = LS.get('pk_order', null); if (!o || !o.id) return;
  try {
    const r = await api(`/api/donations/${o.id}?token=${o.token}`);
    st.order = { id: o.id, token: o.token }; st.info = { name: o.name };
    if (r.status === 'paid') return paid(r);
    if (r.status === 'pending') { showPay({ ...r, qrImage: r.qrImage }); return; }
    LS.del('pk_order'); st.order = null;
  } catch { LS.del('pk_order'); }
}

/* ================= catatan (khusus donatur) ================= */
let eligible = null;
async function refreshComposer() {
  const list = LS.get('pk_donations', []); eligible = null;
  for (const d of [...list].reverse()) {
    try {
      const r = await api(`/api/donations/${d.id}?token=${d.token}`);
      if (r.status === 'paid' && !r.hasNote) { eligible = { ...d, name: r.hideName ? 'Anonim' : r.name }; break; }
    } catch (e) { if (e.status === 404) LS.set('pk_donations', LS.get('pk_donations', []).filter((x) => x.id !== d.id)); }
  }
  $('#noteForm').hidden = !eligible; $('#noteLocked').hidden = !!eligible;
  if (eligible) $('#noteAs').textContent = eligible.name;
}
$('#noteText').addEventListener('input', (e) => { $('#noteCount').textContent = e.target.value.length + ' / 280'; });
$('#noteForm').addEventListener('submit', async (e) => {
  e.preventDefault(); if (!eligible) return;
  const message = $('#noteText').value.trim();
  if (message.length < 3) return showErr($('#noteErr'), 'Catatan minimal 3 karakter.');
  const btn = e.submitter || $('#noteForm button'); btn.disabled = true;
  try {
    await api('/api/notes', { method: 'POST', body: { donationId: eligible.id, token: eligible.token, message } });
    $('#noteText').value = ''; $('#noteCount').textContent = '0 / 280'; showErr($('#noteErr'), '');
    $('#noteDone').hidden = false; setTimeout(() => { $('#noteDone').hidden = true; }, 8000);
    await refreshComposer(); refresh();
  } catch (err) { showErr($('#noteErr'), err.message); }
  finally { btn.disabled = false; }
});

/* ================= kuitansi ================= */
const receiptUrl = (id, token) => `/kuitansi?id=${encodeURIComponent(id)}&token=${encodeURIComponent(token)}`;
async function refreshReceipts() {
  const list = LS.get('pk_donations', []), items = [];
  for (const d of [...list].reverse()) {
    try {
      const r = await api(`/api/donations/${d.id}?token=${d.token}`);
      if (r.status === 'paid') items.push(h('li', {},
        h('span', {}, h('b', { text: rupiah(r.payAmount) }), h('small', { text: new Date(r.paidAt).toLocaleDateString('id-ID', { dateStyle: 'medium' }) })),
        h('a', { class: 'link', href: receiptUrl(d.id, d.token), target: '_blank', rel: 'noopener', text: 'Cetak' })));
    } catch (e) { if (e.status === 404) LS.set('pk_donations', LS.get('pk_donations', []).filter((x) => x.id !== d.id)); }
  }
  $('#mineList').replaceChildren(...items); $('#mine').hidden = !items.length;
}

/* ================= realtime ================= */
function connectStream() {
  if (!('EventSource' in window)) return;
  const es = new EventSource('/api/stream');
  es.addEventListener('update', () => { refresh(); if (st.order) pollStatus(); });
  es.onopen = () => refresh();
}

/* ================= mulai ================= */
(async function init() {
  buildLeaves();
  try { cfg = await api('/api/config'); } catch { cfg = { presets: [5000, 10000, 25000, 50000, 100000, 250000, 500000, 1000000], min: 1000, max: 10000000 }; }
  buildAmounts(); setAmount(0, false);
  await loadPublic(); connectStream(); setInterval(loadPublic, 45000);
  await resumeOrder(); await refreshComposer(); refreshReceipts();
})();
})();
