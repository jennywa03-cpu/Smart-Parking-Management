# Deployment Handoff

## Stack
- Frontend: static HTML, CSS, and JavaScript in `frontend/`
- Backend: Node.js + Express API in `backend/`
- Database: MySQL schema in `database/schema.sql` and `database/seed.sql`
- Local database host: XAMPP MySQL

## Production Checklist
- Copy `backend/.env.example` to `backend/.env`
- Set a strong `JWT_SECRET`
- Set `CORS_ALLOW_ALL=false`
- Set `CORS_ORIGIN` to the real frontend URL
- Set `SHOW_RESET_TOKEN=false`
- Configure a verified Brevo sender
- Add real Brevo API and/or SMTP credentials
- Configure M-Pesa credentials only if mobile-money production flow is required
- Confirm `REPORT_EXPORT_DIR` is writable by the backend process

## Railway Release Steps
1. Create a Railway project.
2. Add a Railway MySQL service to the project.
3. Deploy this repository as a single Railway app service from the repo root. The root `railway.toml` handles the build, pre-deploy bootstrap, start command, and healthcheck.
4. Add Railway MySQL reference variables from the MySQL service to the app service, or expose `MYSQL_URL`. Then set these Railway app variables:
   - `JWT_SECRET`
   - `PAYMENT_WEBHOOK_SECRET`
   - `ADMIN_SEED_NAME`, `ADMIN_SEED_EMAIL`, `ADMIN_SEED_PASSWORD`
   - `RESET_URL_BASE` to `https://your-app-domain/reset-password.html`
   - email/payment variables from `backend/.env.example` as needed
5. Redeploy. Railway will run `npm run railway:bootstrap`, then start the backend which also serves the frontend.
6. Open the single Railway domain, sign in with the seeded admin account once, and change the password immediately.

## Frontend Hosting Options
- Apache/XAMPP document root
- Nginx static site
- Any static hosting that can serve the `frontend/` directory

## Backend Hosting Notes
- Default port: `4000`
- Keep the backend behind a reverse proxy in production when possible
- Ensure logs and export folders remain writable

## Security Notes
- Do not commit `backend/.env`
- Keep `JWT_SECRET`, Brevo keys, Twilio keys, and M-Pesa secrets private
- Use HTTPS in production
- Keep reset tokens out of frontend responses in production
- Review lockout settings before go-live

## Validation Before Handoff
- `GET /health` returns `ok`
- `npm run smoke` passes
- Admin login works
- Driver booking and payment flow works
- Attendant entry and exit flow works
- Admin reports export successfully
- Password reset email delivery works with the configured provider

## Reference Documents
- Root guide: `README.md`
- Backend guide: `backend/README.md`
- QA checklist: `documentation/QA-CHECKLIST.md`
- Brevo setup: `documentation/BREVO-SETUP.md`
