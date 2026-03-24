const nodemailer = require('nodemailer');

let twilioClient = null;
let mailTransport = null;

function emailEnabled() {
  return process.env.EMAIL_ENABLED === 'true';
}

function smsEnabled() {
  return process.env.SMS_ENABLED === 'true';
}

function getEmailProvider() {
  const configured = String(process.env.EMAIL_PROVIDER || '').trim().toLowerCase();
  if (configured) return configured;

  const hasBrevoApi = Boolean(process.env.BREVO_API_KEY);
  const hasBrevoSmtp = Boolean(process.env.BREVO_SMTP_KEY || process.env.BREVO_SMTP_LOGIN);

  if (hasBrevoApi && hasBrevoSmtp) return 'brevo_both';
  if (hasBrevoApi) return 'brevo_api';
  if (hasBrevoSmtp) return 'brevo_smtp';
  return 'smtp';
}

function getSender() {
  return {
    email: process.env.BREVO_SENDER_EMAIL || process.env.MAIL_FROM || 'no-reply@park-management.local',
    name:
      process.env.BREVO_SENDER_NAME ||
      process.env.MAIL_FROM_NAME ||
      process.env.APP_NAME ||
      'Smart Parking Management',
  };
}

function formatFromAddress(sender) {
  if (!sender.name) return sender.email;
  return `"${sender.name}" <${sender.email}>`;
}

function usesBrevoSmtp(provider) {
  return provider === 'brevo_smtp' || provider === 'brevo_both';
}

function getSmtpConfig() {
  const provider = getEmailProvider();
  if (usesBrevoSmtp(provider)) {
    return {
      host: process.env.BREVO_SMTP_HOST || process.env.SMTP_HOST || 'smtp-relay.brevo.com',
      port: Number(process.env.BREVO_SMTP_PORT || process.env.SMTP_PORT || 587),
      secure: (process.env.BREVO_SMTP_SECURE || process.env.SMTP_SECURE || 'false') === 'true',
      user: process.env.BREVO_SMTP_LOGIN || process.env.SMTP_USER,
      pass: process.env.BREVO_SMTP_KEY || process.env.SMTP_PASS,
    };
  }

  return {
    host: process.env.SMTP_HOST,
    port: Number(process.env.SMTP_PORT || 587),
    secure: process.env.SMTP_SECURE === 'true',
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS,
  };
}

function getMailTransport() {
  if (!emailEnabled()) return null;
  if (mailTransport) return mailTransport;

  const { host, port, secure, user, pass } = getSmtpConfig();
  if (!host || !user || !pass) {
    throw new Error('SMTP credentials not configured');
  }

  mailTransport = nodemailer.createTransport({
    host,
    port,
    secure,
    auth: { user, pass },
  });
  return mailTransport;
}

function getTwilioClient() {
  if (!smsEnabled()) return null;
  if (twilioClient) return twilioClient;
  const accountSid = process.env.TWILIO_ACCOUNT_SID;
  const authToken = process.env.TWILIO_AUTH_TOKEN;
  if (!accountSid || !authToken) {
    throw new Error('Twilio credentials not configured');
  }
  // eslint-disable-next-line global-require
  const twilio = require('twilio');
  twilioClient = twilio(accountSid, authToken);
  return twilioClient;
}

async function sendBrevoTransactionalEmail({ to, subject, text, html }) {
  const apiKey = process.env.BREVO_API_KEY;
  if (!apiKey) {
    throw new Error('Brevo API key not configured');
  }

  const sender = getSender();
  const response = await fetch('https://api.brevo.com/v3/smtp/email', {
    method: 'POST',
    headers: {
      accept: 'application/json',
      'content-type': 'application/json',
      'api-key': apiKey,
    },
    body: JSON.stringify({
      sender,
      to: [{ email: to }],
      subject,
      textContent: text,
      htmlContent: html,
    }),
  });

  if (!response.ok) {
    const details = await response.text();
    throw new Error(`Brevo API email request failed (${response.status}): ${details.slice(0, 240)}`);
  }

  return response.json();
}

async function sendSmtpEmailMessage({ to, subject, text, html }) {
  const sender = getSender();
  const transport = getMailTransport();
  await transport.sendMail({
    from: formatFromAddress(sender),
    to,
    subject,
    text,
    html,
  });
}

async function sendEmailMessage({ to, subject, text, html }) {
  if (!emailEnabled()) return { skipped: true };

  const provider = getEmailProvider();

  if (provider === 'brevo_api') {
    const data = await sendBrevoTransactionalEmail({ to, subject, text, html });
    return { sent: true, provider, data };
  }

  if (provider === 'brevo_both') {
    try {
      const data = await sendBrevoTransactionalEmail({ to, subject, text, html });
      return { sent: true, provider, active_provider: 'brevo_api', data };
    } catch (apiError) {
      await sendSmtpEmailMessage({ to, subject, text, html });
      return {
        sent: true,
        provider,
        active_provider: 'brevo_smtp',
        fallback_used: true,
        fallback_reason: apiError.message,
      };
    }
  }

  await sendSmtpEmailMessage({ to, subject, text, html });
  return { sent: true, provider };
}

function buildPasswordResetEmail({ to, name, token }) {
  const appName = process.env.APP_NAME || 'Smart Parking Management';
  const resetBase = process.env.RESET_URL_BASE || '';
  const resetUrl = resetBase ? `${resetBase}?token=${encodeURIComponent(token)}` : '';
  const greeting = name ? `Hello ${name},` : 'Hello,';
  const subject = `${appName} password reset`;
  const textLines = [
    greeting,
    '',
    `We received a request to reset your ${appName} password.`,
    `Reset code: ${token}`,
  ];
  if (resetUrl) {
    textLines.push(`Reset link: ${resetUrl}`);
  }
  textLines.push('', 'If you did not request this, you can ignore this message.');

  const html = `
    <div style="font-family: Arial, sans-serif; background: #f5f8fb; padding: 24px; color: #173543;">
      <div style="max-width: 560px; margin: 0 auto; background: #ffffff; border-radius: 16px; padding: 32px; border: 1px solid #dfe8ef;">
        <p style="margin: 0 0 16px; font-size: 15px;">${greeting}</p>
        <h1 style="margin: 0 0 12px; font-size: 24px;">Reset your password</h1>
        <p style="margin: 0 0 18px; line-height: 1.6; color: #4b6473;">
          We received a request to reset your ${appName} password. Use the code below or open the reset link.
        </p>
        <div style="margin: 0 0 18px; padding: 16px; border-radius: 12px; background: #f7fafc; border: 1px solid #dfe8ef; text-align: center;">
          <div style="font-size: 12px; letter-spacing: 0.12em; text-transform: uppercase; color: #6b8492; margin-bottom: 8px;">Reset code</div>
          <strong style="font-size: 24px; letter-spacing: 0.08em;">${token}</strong>
        </div>
        ${resetUrl ? `<p style="margin: 0 0 18px;"><a href="${resetUrl}" style="display: inline-block; padding: 12px 18px; border-radius: 999px; background: #3a86b3; color: #ffffff; text-decoration: none; font-weight: 700;">Open reset page</a></p>` : ''}
        <p style="margin: 0; color: #6b8492; line-height: 1.6;">If you did not request this, you can ignore this message.</p>
      </div>
    </div>
  `;

  return {
    to,
    subject,
    text: textLines.join('\n'),
    html,
  };
}

async function sendPasswordResetEmail({ to, name, token }) {
  const message = buildPasswordResetEmail({ to, name, token });
  return sendEmailMessage(message);
}

async function sendPasswordResetSms({ to, token }) {
  if (!smsEnabled()) return { skipped: true };
  const client = getTwilioClient();
  const from = process.env.TWILIO_FROM_NUMBER;
  const appName = process.env.APP_NAME || 'Smart Parking Management';
  if (!from) {
    throw new Error('Twilio from number not configured');
  }
  const body = `${appName} reset code: ${token}`;
  await client.messages.create({ to, from, body });
  return { sent: true };
}

module.exports = {
  emailEnabled,
  getEmailProvider,
  sendEmailMessage,
  sendPasswordResetEmail,
  sendPasswordResetSms,
};
