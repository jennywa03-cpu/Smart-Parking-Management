# Brevo Setup Guide

## What Is Already Wired

The backend now supports three Brevo delivery modes:

- `brevo_smtp`
- `brevo_api`
- `brevo_both`

## Recommended Mode

If you want to use both SMTP and API together, use:

```env
EMAIL_PROVIDER=brevo_both
```

That means:

- Brevo API is used first
- If the API call fails, the system automatically falls back to Brevo SMTP

This is the best practical meaning of “use both” for transactional emails, because one email only needs one successful delivery path, but you still get redundancy.

## Current Brevo Defaults

These values are already prepared in `backend/.env` and `backend/.env.example`:

- `EMAIL_PROVIDER=brevo_both`
- `BREVO_SMTP_HOST=smtp-relay.brevo.com`
- `BREVO_SMTP_PORT=587`
- `BREVO_SMTP_LOGIN=a5c8da001@smtp-brevo.com`

## To Use Both SMTP and API

1. Generate a new SMTP key in Brevo.
2. Generate a new API key in Brevo.
3. Open `backend/.env`.
4. Set these values:

```env
EMAIL_ENABLED=true
EMAIL_PROVIDER=brevo_both
BREVO_SMTP_KEY=YOUR_GENERATED_SMTP_KEY
BREVO_API_KEY=YOUR_GENERATED_BREVO_API_KEY
BREVO_SENDER_EMAIL=your-verified-sender@example.com
BREVO_SENDER_NAME=Smart Parking Management
MAIL_FROM=your-verified-sender@example.com
MAIL_FROM_NAME=Smart Parking Management
```

5. Restart the backend.

## To Use SMTP Only

```env
EMAIL_ENABLED=true
EMAIL_PROVIDER=brevo_smtp
BREVO_SMTP_KEY=YOUR_GENERATED_SMTP_KEY
BREVO_SENDER_EMAIL=your-verified-sender@example.com
BREVO_SENDER_NAME=Smart Parking Management
MAIL_FROM=your-verified-sender@example.com
MAIL_FROM_NAME=Smart Parking Management
```

## To Use API Only

```env
EMAIL_ENABLED=true
EMAIL_PROVIDER=brevo_api
BREVO_API_KEY=YOUR_GENERATED_BREVO_API_KEY
BREVO_SENDER_EMAIL=your-verified-sender@example.com
BREVO_SENDER_NAME=Smart Parking Management
MAIL_FROM=your-verified-sender@example.com
MAIL_FROM_NAME=Smart Parking Management
```

## Test Email Delivery

Use the built-in email test script after adding your keys:

```bash
cd backend
npm run email:test -- your-email@example.com
```

Or set this in `backend/.env`:

```env
BREVO_TEST_TO=your-email@example.com
```

Then run:

```bash
cd backend
npm run email:test
```

## Password Reset Flow

Once email is enabled, `POST /api/auth/forgot-password` will send a reset email through Brevo.

With `brevo_both` mode:

- API is attempted first
- SMTP is used automatically as fallback if API delivery fails

## Important Notes

- Use a verified sender email in Brevo
- Keep `SHOW_RESET_TOKEN=false` in production
- If using production hosting, set `RESET_URL_BASE` to your live reset page URL
- If you do not yet have the SMTP or API key, leave `EMAIL_ENABLED=false`
