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

## Recommended Release Steps
1. Provision MySQL and create `Park_db`
2. Import `database/schema.sql` and then `database/seed.sql`
3. Configure `backend/.env`
4. Install backend dependencies with `npm install`
5. Start the backend with `npm start`
6. Serve `frontend/` from static hosting or a web server
7. Update `frontend/assets/js/config.js` if the API base URL changes
8. Run `npm run smoke` from `backend/`

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
