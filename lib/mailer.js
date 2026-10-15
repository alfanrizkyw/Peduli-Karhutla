'use strict';
const fs = require('fs');
const path = require('path');
const nodemailer = require('nodemailer');

const rupiah = (n) => 'Rp ' + Number(n).toLocaleString('id-ID');
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

let transport;
let devMode = false;
function getTransport() {
  if (transport) return transport;
  if (process.env.SMTP_HOST) {
    transport = nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port: Number(process.env.SMTP_PORT || 587),
      secure: String(process.env.SMTP_SECURE || 'false') === 'true',
      auth: process.env.SMTP_USER ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS } : undefined
    });
  } else {
    devMode = true; // tanpa SMTP: email ditulis ke data/outbox.log agar bisa dites
    transport = nodemailer.createTransport({ jsonTransport: true });
  }
  return transport;
}

function buildThankYou({ name, amount, baseUrl, noteLink, date }) {
  const subject = `Terima kasih ${name}, donasi ${rupiah(amount)} Anda sudah kami terima`;
  const when = new Date(date).toLocaleString('id-ID', { dateStyle: 'full', timeStyle: 'short', timeZone: 'Asia/Jakarta' });
  const text = [
    `Halo ${name},`,
    '',
    `Terima kasih banyak. Donasi Anda sebesar ${rupiah(amount)} untuk Peduli Karhutla sudah kami terima pada ${when} WIB.`,
    'Dana akan digunakan untuk pemadaman, penyelamatan satwa, rehabilitasi hutan dan pencegahan, dan setiap pencairan dicatat terbuka di website.',
    '',
    `Tulis catatan untuk hutan (tampil publik): ${noteLink}`,
    `Pantau penggunaan dana: ${baseUrl}/#transparansi`,
    '',
    'Peduli Karhutla - Dari Rakyat Untuk Hutan'
  ].join('\n');
  const html = `<!doctype html><html lang="id"><body style="margin:0;background:#f6f1e6;font-family:Arial,Helvetica,sans-serif;color:#17321f">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:24px 12px">
<table role="presentation" width="560" cellpadding="0" cellspacing="0" style="max-width:560px;background:#fffdf8;border:1px solid #e3dac6">
<tr><td style="padding:22px 28px;border-bottom:3px solid #8f1d14"><img src="${esc(baseUrl)}/img/logo-96.png" width="44" height="44" alt="" style="vertical-align:middle;border:0"> <span style="font-size:20px;font-weight:bold;color:#14391f;vertical-align:middle;margin-left:8px">Peduli Karhutla</span></td></tr>
<tr><td style="padding:28px">
<p style="margin:0 0 14px;font-size:16px">Halo <strong>${esc(name)}</strong>,</p>
<p style="margin:0 0 18px;font-size:16px;line-height:1.6">Terima kasih banyak. Donasi Anda sudah kami terima.</p>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f6f1e6;border-left:4px solid #14391f;margin:0 0 20px"><tr><td style="padding:16px 18px">
<div style="font-size:13px;color:#5b6b5f">Nominal donasi</div>
<div style="font-size:28px;font-weight:bold;color:#8f1d14">${esc(rupiah(amount))}</div>
<div style="font-size:13px;color:#5b6b5f;margin-top:6px">${esc(when)} WIB</div></td></tr></table>
<p style="margin:0 0 18px;font-size:15px;line-height:1.6">Dana digunakan untuk pemadaman, penyelamatan satwa, rehabilitasi hutan dan pencegahan. Setiap pencairan dicatat terbuka di website.</p>
<p style="margin:0 0 10px"><a href="${esc(noteLink)}" style="display:inline-block;background:#8f1d14;color:#ffffff;text-decoration:none;padding:12px 20px;font-weight:bold;font-size:15px">Tulis catatan untuk hutan</a></p>
<p style="margin:0 0 4px;font-size:14px"><a href="${esc(baseUrl)}/#transparansi" style="color:#14391f">Lihat penggunaan dana</a></p>
</td></tr>
<tr><td style="padding:16px 28px;background:#14391f;color:#e9f0e3;font-size:13px">Peduli Karhutla &middot; Dari Rakyat Untuk Hutan</td></tr>
</table></td></tr></table></body></html>`;
  return { subject, text, html };
}

async function sendThankYou(donation, baseUrl) {
  const noteLink = `${baseUrl}/?catatan=${donation.id}.${donation.token}#catatan`;
  const mail = buildThankYou({ name: donation.name, amount: donation.pay_amount, baseUrl, noteLink, date: donation.paid_at || Date.now() });
  const from = process.env.MAIL_FROM || `Peduli Karhutla <${process.env.SMTP_USER || 'noreply@localhost'}>`;
  const info = await getTransport().sendMail({ from, to: donation.email, ...mail });
  if (devMode) {
    const file = path.join(process.env.DATA_DIR || path.join(__dirname, '..', 'data'), 'outbox.log');
    fs.appendFileSync(file, `--- ${new Date().toISOString()} ---\nTO: ${donation.email}\nSUBJECT: ${mail.subject}\n${mail.text}\n\n`);
    console.log('[email:dev] SMTP belum diatur, email ditulis ke data/outbox.log ->', donation.email);
  }
  return info;
}

module.exports = { sendThankYou, buildThankYou, rupiah };
