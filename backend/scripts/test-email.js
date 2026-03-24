require('dotenv').config();

const { emailEnabled, getEmailProvider, sendEmailMessage } = require('../src/services/notifications');

const to = process.argv[2] || process.env.BREVO_TEST_TO;
const appName = process.env.APP_NAME || 'Smart Parking Management';

async function main() {
  if (!to) {
    throw new Error('Provide a recipient email as an argument or set BREVO_TEST_TO in .env');
  }

  if (!emailEnabled()) {
    throw new Error('EMAIL_ENABLED is false. Set EMAIL_ENABLED=true before running the email test.');
  }

  const provider = getEmailProvider();
  const result = await sendEmailMessage({
    to,
    subject: `${appName} email delivery test`,
    text: `${appName} email delivery is configured and ready. Provider: ${provider}.`,
    html: `<div style="font-family: Arial, sans-serif; padding: 24px;"><h1 style="margin: 0 0 12px;">${appName}</h1><p style="margin: 0;">Email delivery is configured and ready.</p><p style="margin: 12px 0 0; color: #5b7281;">Provider: <strong>${provider}</strong></p></div>`,
  });

  console.log(`Email test sent to ${to} via ${provider}.`);
  console.log(result);
}

main().catch((error) => {
  console.error(error.message || error);
  process.exit(1);
});
