'use strict';
require('dotenv').config({ quiet: true });
const path = require('path');
const crypto = require('crypto');
const express = require('express');
const rateLimit = require('express-rate-limit');
const QRCode = require('qrcode');

const cfg = require('./config');
const db = require('./lib/db');
const { makeDynamic, isCrcValid } = require('./lib/qris');
const { sendThankYou } = require('./lib/mailer');

const PORT = Number(process.env.PORT || 3000);
const BASE_URL = (process.env.BASE_URL || `http://localhost:${PORT}`).replace(/\/+$/, '');
const QRIS_STATIC = (process.env.QRIS_STATIC || cfg.qrisStatic).trim();
const UNIQUE_CODE = String(process.env.UNIQUE_CODE || 'false') === 'true';
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || '';
const MOOTA_SECRET = process.env.MOOTA_SECRET || '';
const WEBHOOK_SECRET = process.env.WEBHOOK_SECRET || '';
const TTL = cfg.qrisTtlMinutes * 60_000;
const GRACE = cfg.paymentGraceMinutes * 60_000;

if (!isCrcValid(QRIS_STATIC)) { console.error('QRIS_STATIC tidak valid (CRC salah).'); process.exit(1); }
if (cfg.allocation.reduce((a, b) => a + b.percent, 0) !== 100) { console.error('Total persen alokasi di config.js harus 100.'); process.exit(1); }

db.exec('CREATE TABLE IF NOT EXISTS webhook_seen (id TEXT PRIMARY KEY, at INTEGER NOT NULL)');

const app = express();
app.disable('x-powered-by');
if (process.env.TRUST_PROXY) app.set('trust proxy', Number(process.env.TRUST_PROXY) || process.env.TRUST_PROXY);

app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('Content-Security-Policy',
    "default-src 'self'; script-src 'self'; style-src 'self'; font-src 'self'; img-src 'self' data:; connect-src 'self'; frame-ancestors 'none'; base-uri 'self'; form-action 'self'");
  next();
});
app.use(express.json({ limit: '100kb', verify: (req, res, buf) => { req.rawBody = buf; } }));

const limiter = (windowMs, limit, message) => rateLimit({ windowMs, limit, standardHeaders: true, legacyHeaders: false, message: { error: message || 'Terlalu banyak permintaan, coba lagi sebentar.' } });

/* ---------- helpers ---------- */
const now = () => Date.now();
const rid = (n) => crypto.randomBytes(n).toString('hex');
const safeEq = (a, b) => {
  const x = crypto.createHash('sha256').update(String(a)).digest();
  const y = crypto.createHash('sha256').update(String(b)).digest();
  return crypto.timingSafeEqual(x, y);
};
const cleanLine = (s, max) => String(s ?? '').replace(/[\u0000-\u001f\u007f<>]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max);
const cleanText = (s, max) => String(s ?? '').replace(/\r/g, '').replace(/[\u0000-\u0009\u000b\u000c\u000e-\u001f\u007f<>]/g, '').replace(/\n{3,}/g, '\n\n').trim().slice(0, max);
const isEmail = (e) => e.length <= 120 && /^[^\s@,;<>()"']+@[^\s@,;<>()"']+\.[A-Za-z]{2,}$/.test(e);
const isVisitor = (v) => typeof v === 'string' && /^[a-zA-Z0-9-]{16,64}$/.test(v);
const publicName = (d) => (d.hide_name ? 'Anonim' : d.name);

/* ---------- realtime (Server-Sent Events) ---------- */
const clients = new Set();
let bcTimer = null;
function broadcast(type = 'update') {
  clearTimeout(bcTimer);
  bcTimer = setTimeout(() => { for (const res of clients) res.write(`event: update\ndata: ${type}\n\n`); }, 150);
}
app.get('/api/stream', (req, res) => {
  res.set({ 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache, no-transform', Connection: 'keep-alive', 'X-Accel-Buffering': 'no' });
  res.flushHeaders();
  res.write('retry: 3000\n\n');
  clients.add(res);
  req.on('close', () => clients.delete(res));
});
setInterval(() => { for (const res of clients) res.write(': ping\n\n'); }, 25_000).unref();

/* ---------- data publik ---------- */
function buildPublic(visitor) {
  const paid = db.prepare("SELECT COUNT(*) c, COALESCE(SUM(pay_amount),0) s, MAX(paid_at) last FROM donations WHERE status='paid'").get();
  const dis = db.prepare('SELECT COUNT(*) c, COALESCE(SUM(amount),0) s, COUNT(DISTINCT lower(location)) l FROM disbursements').get();
  const byCat = Object.fromEntries(db.prepare('SELECT category, SUM(amount) s FROM disbursements GROUP BY category').all().map((r) => [r.category, r.s]));
  const locations = db.prepare('SELECT location, SUM(amount) amount, COUNT(*) count, MAX(date) last FROM disbursements GROUP BY lower(location) ORDER BY amount DESC').all();
  const catLabel = Object.fromEntries(cfg.allocation.map((a) => [a.key, a.label]));
  const donors = db.prepare("SELECT name, hide_name, pay_amount, paid_at FROM donations WHERE status='paid' ORDER BY paid_at DESC LIMIT 12").all()
    .map((d) => ({ name: publicName(d), amount: d.pay_amount, at: d.paid_at }));
  const myLikes = new Set(isVisitor(visitor) ? db.prepare('SELECT note_id FROM likes WHERE visitor=?').all(visitor).map((r) => r.note_id) : []);
  const notes = db.prepare(`SELECT n.id, n.name, n.message, n.created_at, (SELECT COUNT(*) FROM likes l WHERE l.note_id=n.id) likes
      FROM notes n ORDER BY n.id DESC LIMIT 200`).all()
    .map((n) => ({ id: n.id, name: n.name, message: n.message, at: n.created_at, likes: n.likes, liked: myLikes.has(n.id) }));
  const disbursements = db.prepare('SELECT * FROM disbursements ORDER BY date DESC, id DESC LIMIT 300').all()
    .map((d) => ({ id: d.id, date: d.date, amount: d.amount, category: d.category, categoryLabel: catLabel[d.category] || d.category, location: d.location, recipient: d.recipient, description: d.description, proofUrl: d.proof_url }));
  return {
    stats: {
      raised: paid.s, target: cfg.targetAmount, percent: Math.min(100, (paid.s / cfg.targetAmount) * 100),
      donors: paid.c, lastDonationAt: paid.last || null,
      disbursedTotal: dis.s, disbursedCount: dis.c, locationCount: dis.l, available: Math.max(0, paid.s - dis.s)
    },
    allocation: cfg.allocation.map((a) => {
      const planned = Math.round((paid.s * a.percent) / 100);
      const used = byCat[a.key] || 0;
      return { key: a.key, label: a.label, percent: a.percent, note: a.note, planned, disbursed: used, remaining: planned - used };
    }),
    locations, donors, notes, disbursements, serverTime: now()
  };
}
app.get('/api/public', limiter(60_000, 120), (req, res) => { res.set('Cache-Control', 'no-store'); res.json(buildPublic(req.query.v)); });
app.get('/api/config', (req, res) => res.json({
  name: cfg.name, jargon: cfg.jargon, target: cfg.targetAmount, presets: cfg.presets, min: cfg.minAmount, max: cfg.maxAmount,
  qrisTtlMinutes: cfg.qrisTtlMinutes, merchant: 'Peduli Karhutla'
}));

/* ---------- donasi ---------- */
async function qrImage(payload) {
  const svg = await QRCode.toString(payload, { type: 'svg', errorCorrectionLevel: 'M', margin: 2, color: { dark: '#000000', light: '#ffffff' } });
  return 'data:image/svg+xml;base64,' + Buffer.from(svg).toString('base64');
}

app.post('/api/donations', limiter(10 * 60_000, 12), async (req, res) => {
  try {
    const name = cleanLine(req.body.name, 60);
    const email = String(req.body.email || '').trim().toLowerCase();
    const amount = Number(req.body.amount);
    if (name.length < 2) return res.status(400).json({ error: 'Nama minimal 2 huruf.' });
    if (!isEmail(email)) return res.status(400).json({ error: 'Alamat email tidak valid.' });
    if (!Number.isInteger(amount) || amount < cfg.minAmount || amount > cfg.maxAmount)
      return res.status(400).json({ error: `Nominal harus antara Rp ${cfg.minAmount.toLocaleString('id-ID')} dan Rp ${cfg.maxAmount.toLocaleString('id-ID')}.` });

    let payAmount = amount;
    if (UNIQUE_CODE) {
      const used = new Set(db.prepare("SELECT pay_amount FROM donations WHERE status='pending' AND expires_at+? > ?").all(GRACE, now()).map((r) => r.pay_amount));
      const free = [];
      for (let i = 1; i <= 99; i++) if (!used.has(amount + i)) free.push(i);
      if (!free.length) return res.status(503).json({ error: 'Sedang ramai, coba lagi sebentar.' });
      payAmount = amount + free[crypto.randomInt(free.length)];
    }
    const qris = makeDynamic(QRIS_STATIC, payAmount);
    const id = rid(8), token = rid(16), t = now();
    db.prepare('INSERT INTO donations (id, token, name, email, hide_name, amount, pay_amount, qris, created_at, expires_at) VALUES (?,?,?,?,?,?,?,?,?,?)')
      .run(id, token, name, email, req.body.hideName ? 1 : 0, amount, payAmount, qris, t, t + TTL);
    res.json({ id, token, amount, payAmount, status: 'pending', expiresAt: t + TTL, serverTime: t, qrImage: await qrImage(qris) });
  } catch (e) {
    console.error(e); res.status(500).json({ error: 'Gagal membuat QR pembayaran.' });
  }
});

function loadOwn(req, res) {
  const d = db.prepare('SELECT * FROM donations WHERE id=?').get(String(req.params.id));
  const token = String(req.query.token || req.body?.token || '');
  if (!d || !safeEq(d.token, token)) { res.status(404).json({ error: 'Donasi tidak ditemukan.' }); return null; }
  return d;
}
app.get('/api/donations/:id', limiter(60_000, 90), async (req, res) => {
  const d = loadOwn(req, res); if (!d) return;
  const out = { id: d.id, status: d.status, name: d.name, amount: d.amount, payAmount: d.pay_amount, expiresAt: d.expires_at, paidAt: d.paid_at, hideName: !!d.hide_name, serverTime: now(),
    hasNote: !!db.prepare('SELECT 1 FROM notes WHERE donation_id=?').get(d.id) };
  if (d.status === 'pending') out.qrImage = await qrImage(d.qris);
  res.set('Cache-Control', 'no-store').json(out);
});
app.post('/api/donations/:id/cancel', limiter(60_000, 30), (req, res) => {
  const d = loadOwn(req, res); if (!d) return;
  if (d.status === 'pending') db.prepare("UPDATE donations SET status='cancelled' WHERE id=?").run(d.id);
  res.json({ ok: true });
});

/* ---------- pembayaran berhasil ---------- */
function markPaidById(id, via) {
  const t = now();
  const r = db.prepare("UPDATE donations SET status='paid', paid_at=?, paid_via=? WHERE id=? AND status IN ('pending','expired')").run(t, via, id);
  if (r.changes) { afterPaid(id); return true; }
  return false;
}
function markPaidByAmount(amount, via) {
  const row = db.prepare("SELECT id FROM donations WHERE status='pending' AND pay_amount=? AND expires_at+? > ? ORDER BY created_at ASC LIMIT 1").get(amount, GRACE, now());
  return row ? markPaidById(row.id, via) : false;
}
function afterPaid(id) {
  broadcast('paid');
  sendEmailFor(id);
}
async function sendEmailFor(id) {
  const d = db.prepare('SELECT * FROM donations WHERE id=?').get(id);
  if (!d || d.status !== 'paid' || d.email_sent) return;
  db.prepare('UPDATE donations SET email_attempts=email_attempts+1 WHERE id=?').run(id);
  try {
    await sendThankYou(d, BASE_URL);
    db.prepare('UPDATE donations SET email_sent=1 WHERE id=?').run(id);
    console.log('[email] terkirim ke', d.email);
  } catch (e) { console.error('[email] gagal kirim ke', d.email, '-', e.message); }
}
setInterval(() => {
  const t = now();
  db.prepare("UPDATE donations SET status='expired' WHERE status='pending' AND expires_at+? < ?").run(GRACE, t);
  for (const r of db.prepare("SELECT id FROM donations WHERE status='paid' AND email_sent=0 AND email_attempts<6 AND paid_at < ?").all(t - 60_000)) sendEmailFor(r.id);
}, 60_000).unref();

/* webhook: Moota (mutasi bank/e-wallet). Header "Signature" = HMAC-SHA256(raw body, MOOTA_SECRET) */
app.post('/api/webhook/moota', limiter(60_000, 120), (req, res) => {
  if (!MOOTA_SECRET) return res.status(503).json({ error: 'MOOTA_SECRET belum diatur' });
  const sig = String(req.get('Signature') || '');
  const expect = crypto.createHmac('sha256', MOOTA_SECRET).update(req.rawBody || Buffer.alloc(0)).digest('hex');
  if (sig.length !== expect.length || !crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expect))) return res.status(401).json({ error: 'signature salah' });
  const list = Array.isArray(req.body) ? req.body : Array.isArray(req.body?.data) ? req.body.data : [];
  let matched = 0;
  for (const m of list) {
    if (String(m.type || '').toUpperCase() !== 'CR') continue;
    const key = String(m.mutation_id || m.id || '');
    if (key) { if (db.prepare('SELECT 1 FROM webhook_seen WHERE id=?').get('moota:' + key)) continue; db.prepare('INSERT INTO webhook_seen VALUES (?,?)').run('moota:' + key, now()); }
    if (markPaidByAmount(Math.round(Number(m.amount)), 'moota')) matched++;
  }
  res.json({ ok: true, matched });
});
/* webhook umum: header "x-webhook-secret", body {"amount": 50000, "id": "unik-opsional"} */
app.post('/api/webhook/payment', limiter(60_000, 120), (req, res) => {
  if (!WEBHOOK_SECRET || !safeEq(req.get('x-webhook-secret') || '', WEBHOOK_SECRET)) return res.status(401).json({ error: 'secret salah' });
  const amount = Math.round(Number(req.body?.amount));
  if (!Number.isInteger(amount) || amount <= 0) return res.status(400).json({ error: 'amount tidak valid' });
  const key = String(req.body?.id || '');
  if (key) { if (db.prepare('SELECT 1 FROM webhook_seen WHERE id=?').get('gen:' + key)) return res.json({ ok: true, duplicate: true }); db.prepare('INSERT INTO webhook_seen VALUES (?,?)').run('gen:' + key, now()); }
  res.json({ ok: true, matched: markPaidByAmount(amount, 'webhook') ? 1 : 0 });
});

/* ---------- catatan & hati ---------- */
app.post('/api/notes', limiter(10 * 60_000, 10), (req, res) => {
  const d = loadOwn({ params: { id: req.body.donationId }, query: {}, body: { token: req.body.token } }, res); if (!d) return;
  if (d.status !== 'paid') return res.status(403).json({ error: 'Catatan hanya untuk donatur yang pembayarannya sudah berhasil.' });
  const message = cleanText(req.body.message, 280);
  if (message.length < 3) return res.status(400).json({ error: 'Catatan minimal 3 karakter.' });
  if (db.prepare('SELECT 1 FROM notes WHERE donation_id=?').get(d.id)) return res.status(409).json({ error: 'Anda sudah menulis catatan untuk donasi ini.' });
  const r = db.prepare('INSERT INTO notes (donation_id, name, message, created_at) VALUES (?,?,?,?)').run(d.id, publicName(d), message, now());
  broadcast('note');
  res.json({ ok: true, id: r.lastInsertRowid });
});
app.post('/api/notes/:id/like', limiter(60_000, 40), (req, res) => {
  const id = Number(req.params.id), v = req.body.visitor;
  if (!isVisitor(v)) return res.status(400).json({ error: 'visitor tidak valid' });
  if (!db.prepare('SELECT 1 FROM notes WHERE id=?').get(id)) return res.status(404).json({ error: 'Catatan tidak ada' });
  const had = db.prepare('DELETE FROM likes WHERE note_id=? AND visitor=?').run(id, v).changes > 0;
  if (!had) db.prepare('INSERT INTO likes VALUES (?,?,?)').run(id, v, now());
  broadcast('like');
  res.json({ liked: !had, likes: db.prepare('SELECT COUNT(*) c FROM likes WHERE note_id=?').get(id).c });
});

/* ---------- admin ---------- */
const adminLimiter = limiter(15 * 60_000, 300, 'Terlalu banyak percobaan.');
function adminAuth(req, res, next) {
  if (!ADMIN_PASSWORD || ADMIN_PASSWORD === 'ganti-password-ini') return res.status(503).json({ error: 'ADMIN_PASSWORD belum diatur di .env' });
  const h = String(req.get('Authorization') || '');
  if (!h.startsWith('Bearer ') || !safeEq(h.slice(7), ADMIN_PASSWORD)) return res.status(401).json({ error: 'Password admin salah' });
  next();
}
const admin = express.Router();
admin.use(adminLimiter, adminAuth);
admin.get('/ping', (req, res) => res.json({ ok: true }));
admin.get('/donations', (req, res) => {
  const st = String(req.query.status || '');
  const rows = db.prepare(`SELECT id,name,email,hide_name,amount,pay_amount,status,created_at,paid_at,paid_via,email_sent,email_attempts FROM donations ${st ? 'WHERE status=?' : ''} ORDER BY created_at DESC LIMIT 300`).all(...(st ? [st] : []));
  res.json(rows);
});
admin.post('/donations/:id/confirm', (req, res) => res.json({ ok: markPaidById(String(req.params.id), 'admin') }));
admin.post('/donations/:id/resend-email', async (req, res) => {
  db.prepare('UPDATE donations SET email_sent=0, email_attempts=0 WHERE id=? AND status=?').run(String(req.params.id), 'paid');
  await sendEmailFor(String(req.params.id));
  res.json({ ok: !!db.prepare('SELECT email_sent FROM donations WHERE id=?').get(String(req.params.id))?.email_sent });
});
admin.get('/notes', (req, res) => res.json(db.prepare('SELECT id,name,message,created_at FROM notes ORDER BY id DESC LIMIT 300').all()));
admin.delete('/notes/:id', (req, res) => { db.prepare('DELETE FROM notes WHERE id=?').run(Number(req.params.id)); broadcast('note'); res.json({ ok: true }); });
admin.get('/meta', (req, res) => res.json({ categories: cfg.allocation.map((a) => ({ key: a.key, label: a.label })), uniqueCode: UNIQUE_CODE, moota: !!MOOTA_SECRET, webhook: !!WEBHOOK_SECRET, smtp: !!process.env.SMTP_HOST }));
admin.post('/disbursements', (req, res) => {
  const b = req.body || {};
  const amount = Number(b.amount);
  const date = String(b.date || '');
  const cat = String(b.category || '');
  const proof = String(b.proofUrl || '').trim();
  if (!Number.isInteger(amount) || amount <= 0) return res.status(400).json({ error: 'Nominal tidak valid' });
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return res.status(400).json({ error: 'Tanggal tidak valid' });
  if (!cfg.allocation.some((a) => a.key === cat)) return res.status(400).json({ error: 'Kategori tidak valid' });
  const location = cleanLine(b.location, 80);
  if (location.length < 2) return res.status(400).json({ error: 'Lokasi wajib diisi' });
  if (proof && !/^https?:\/\/[^\s]+$/i.test(proof)) return res.status(400).json({ error: 'Link bukti harus diawali http(s)://' });
  const r = db.prepare('INSERT INTO disbursements (date,amount,category,location,recipient,description,proof_url,created_at) VALUES (?,?,?,?,?,?,?,?)')
    .run(date, amount, cat, location, cleanLine(b.recipient, 100), cleanText(b.description, 400), proof.slice(0, 300), now());
  broadcast('disbursement');
  res.json({ ok: true, id: r.lastInsertRowid });
});
admin.delete('/disbursements/:id', (req, res) => { db.prepare('DELETE FROM disbursements WHERE id=?').run(Number(req.params.id)); broadcast('disbursement'); res.json({ ok: true }); });
app.use('/api/admin', admin);

/* ---------- static ---------- */
app.use('/img', express.static(path.join(__dirname, 'public', 'img'), { maxAge: '7d' }));
app.use('/fonts', express.static(path.join(__dirname, 'public', 'fonts'), { maxAge: '365d', immutable: true }));
app.use(express.static(path.join(__dirname, 'public'), { extensions: ['html'], maxAge: '5m' }));
app.get('/admin', (req, res) => res.sendFile(path.join(__dirname, 'public', 'admin.html')));
app.use('/api', (req, res) => res.status(404).json({ error: 'Not found' }));

app.listen(PORT, () => {
  console.log(`Peduli Karhutla berjalan di ${BASE_URL}  (port ${PORT})`);
  if (!process.env.SMTP_HOST) console.log('! SMTP belum diatur: email ucapan terima kasih hanya ditulis ke data/outbox.log');
  if (!MOOTA_SECRET && !WEBHOOK_SECRET) console.log('! Webhook pembayaran belum diatur: konfirmasi hanya lewat /admin');
  if (!ADMIN_PASSWORD || ADMIN_PASSWORD === 'ganti-password-ini') console.log('! ADMIN_PASSWORD belum diatur: /admin dinonaktifkan');
});
