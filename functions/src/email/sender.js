// ╔══════════════════════════════════════════════════════════════╗
// ║  Email-Versand via Resend                                    ║
// ╚══════════════════════════════════════════════════════════════╝

const { defineSecret } = require('firebase-functions/params');
const { Resend } = require('resend');
const company = require('../lib/company');

// Resend API-Key als Firebase-Secret (firebase functions:secrets:set RESEND_API_KEY)
const RESEND_API_KEY = defineSecret('RESEND_API_KEY');

async function sendEmail({ to, subject, html, text, attachments, replyTo }) {
  if (!process.env.RESEND_API_KEY) {
    console.warn('[email] RESEND_API_KEY nicht gesetzt - Email wird nicht versendet');
    console.log('[email-dry-run]', { to, subject });
    return { id: 'dry-run', skipped: true };
  }

  const resend = new Resend(process.env.RESEND_API_KEY);

  try {
    const { data, error } = await resend.emails.send({
      from: company.emailFrom,
      to: Array.isArray(to) ? to : [to],
      replyTo: replyTo || company.emailReplyTo,
      subject,
      html,
      text: text || stripHtml(html),
      attachments: attachments || undefined
    });

    if (error) {
      console.error('[email] Resend-Fehler:', error);
      throw new Error(`Email-Versand fehlgeschlagen: ${error.message}`);
    }

    console.log('[email] gesendet:', data?.id, '→', to, '|', subject);
    return data;
  } catch (err) {
    console.error('[email] Exception:', err);
    throw err;
  }
}

function stripHtml(html) {
  return (html || '').replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim();
}

module.exports = { sendEmail, RESEND_API_KEY };
