'use strict';
const { Resend } = require('resend');

async function sendThankYou(d, baseUrl) {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    throw new Error('RESEND_API_KEY belum diatur di Environment Variables Deplexo.');
  }

  const resend = new Resend(apiKey);
  const mailFrom = process.env.MAIL_FROM || 'Peduli Karhutla <onboarding@resend.dev>';
  const donorName = d.hide_name ? 'Donatur' : d.name;
  const payAmount = Number(d.pay_amount || d.amount).toLocaleString('id-ID');

  const { data, error } = await resend.emails.send({
    from: mailFrom,
    to: [d.email],
    subject: 'Terima Kasih - Donasi Peduli Karhutla Berhasil!',
    html: `
      <div style="font-family: Arial, sans-serif; padding: 20px; color: #333; max-width: 600px; margin: auto; border: 1px solid #e0e0e0; border-radius: 8px;">
        <h2 style="color: #2e7d32; margin-top: 0;">Terima Kasih, ${donorName}!</h2>
        <p>Donasi Anda sebesar <strong style="color: #d32f2f;">Rp ${payAmount}</strong> telah berhasil kami terima dan terverifikasi oleh sistem.</p>
        <p>Bantuan dan kepedulian Anda sangat berarti bagi tim lapangan penanggulangan Karhutla.</p>
        <hr style="border: none; border-top: 1px solid #eee; margin: 20px 0;"/>
        <p style="font-size: 12px; color: #777;">Tim Pengelola Peduli Karhutla<br/><a href="${baseUrl}" style="color: #2e7d32; text-decoration: none;">${baseUrl}</a></p>
      </div>
    `
  });

  if (error) {
    console.error('[Resend Error]:', error);
    throw new Error(typeof error === 'object' ? JSON.stringify(error) : error);
  }

  console.log('[Resend Success]: Email kuitansi terkirim ke', d.email, data);
  return data;
}

module.exports = { sendThankYou };