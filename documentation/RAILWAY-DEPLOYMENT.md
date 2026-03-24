# Railway Deployment Guide

This project is prepared for one-go Railway deployment from the repository root. The Node.js backend serves the frontend files, and Railway runs a database bootstrap command before the app starts.

## What gets deployed
- One Railway app service from this repository root
- One Railway MySQL service in the same Railway project

Important note:
- The application deploys from the repo in one go.
- The database is still a Railway-managed MySQL service, because Railway provisions databases as services rather than from app source files alone.
- Once the MySQL service is attached, the repo handles schema, seed data, and migrations automatically during deployment.

## Root deployment files
- Root config: `railway.toml`
- Root scripts: `package.json`
- Backend bootstrap: `backend/scripts/railway-bootstrap.js`

## Required Railway app variables
- `JWT_SECRET`
- `PAYMENT_WEBHOOK_SECRET`
- `ADMIN_SEED_NAME`
- `ADMIN_SEED_EMAIL`
- `ADMIN_SEED_PASSWORD`
- `RESET_URL_BASE` set to your public app domain + `/reset-password.html`
- Optional Brevo, Twilio, and M-Pesa variables from `backend/.env.example`

## Database variables
The backend supports Railway's MySQL reference variables directly:
- `MYSQLHOST`
- `MYSQLPORT`
- `MYSQLUSER`
- `MYSQLPASSWORD`
- `MYSQLDATABASE`

## What Railway runs
- Build: `npm run railway:build`
- Pre-deploy: `npm run railway:bootstrap`
- Start: `npm run railway:start`
- Healthcheck: `/health`

## What the bootstrap does
- applies `database/schema.sql`
- applies `database/seed.sql` idempotently
- runs SQL migrations from `database/migrations/`

## First login
Use the admin seed values from Railway environment variables only. On the first successful login, the system forces a password change. After that password has been changed, the seed password is no longer reapplied.

## Final deploy flow
1. Create Railway project.
2. Add Railway MySQL service.
3. Deploy this repo from root.
4. Add the required variables.
5. Redeploy once.
6. Open the Railway domain and log in.
