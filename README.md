# Smart Parking Management System

Smart Parking Management System is a web-based parking platform built with a static frontend, a Node.js/Express backend, and a MySQL database running locally with XAMPP.

## Stack
- `frontend/` - browser UI for admin, attendant, and driver workflows
- `backend/` - Node.js API, authentication, payments, reporting, notifications, and smoke tests
- `database/` - MySQL schema and seed data
- `documentation/` - QA, deployment, chapter files, and handoff material

## Quick Start

### 1. Database
1. Start MySQL from XAMPP.
2. Create a database named `Park_db`.
3. Import `database/schema.sql` and then `database/seed.sql`.

```bash
mysql -u root -p Park_db < database/schema.sql
mysql -u root -p Park_db < database/seed.sql
```

### 2. Backend
```bash
cd backend
npm install
copy .env.example .env
npm run dev
```

Default API URL:
- `http://localhost:4000`

### 3. Frontend
```bash
cd frontend
npm install
npm run dev
```

Default frontend URL:
- `http://localhost:5500`

## Deployment Admin Bootstrap
- Set `ADMIN_SEED_NAME`, `ADMIN_SEED_EMAIL`, and `ADMIN_SEED_PASSWORD` in your local `backend/.env`.
- The backend creates or refreshes that admin account only until the first successful password change.
- After the first successful login, the user is forced to set a new password and the seed password is no longer reapplied.
- Do not commit live admin credentials to GitHub; keep them only in `backend/.env`.

## Recommended Local Run Order
1. Start MySQL in XAMPP.
2. Start the backend from `backend/`.
3. Start the frontend from `frontend/`.
4. Open `http://localhost:5500`.
5. Sign in with the admin credentials configured in `backend/.env`, then change the password immediately on first successful login.

## Railway Deployment

This repo is now prepared for a single Railway app deployment from the repository root, with the backend serving the frontend and bootstrapping the database automatically.

Railway setup:
1. Create a Railway project.
2. Add one Railway MySQL service to that project.
3. Deploy this repository once from the repo root using the root `railway.toml`.
4. Set backend variables in the Railway app service:
   - `JWT_SECRET`
   - `PAYMENT_WEBHOOK_SECRET`
   - `ADMIN_SEED_NAME`
   - `ADMIN_SEED_EMAIL`
   - `ADMIN_SEED_PASSWORD`
   - `RESET_URL_BASE` to `https://your-app-domain/reset-password.html`
   - notification/payment variables as needed
5. The backend now serves the frontend files directly, so the browser UI and API can share one Railway domain.
6. Add Railway MySQL reference variables to the app service. The backend supports `MYSQLHOST`, `MYSQLPORT`, `MYSQLUSER`, `MYSQLPASSWORD`, `MYSQLDATABASE`, and `MYSQL_URL` directly.
7. The Railway pre-deploy step runs `npm run railway:bootstrap` to apply schema, seed data, and migrations automatically.

Important note:
- Railway MySQL is still a separate Railway service, but the repository itself now deploys as one app service from one root deployment.

Railway-specific handoff:
- `documentation/RAILWAY-DEPLOYMENT.md`
- `documentation/DEPLOYMENT-HANDOFF.md`

## Verification

Backend health:
```bash
curl http://localhost:4000/health
```

Backend smoke test:
```bash
cd backend
npm run smoke
```

## Main Pages

### Authentication
- `frontend/index.html`
- `frontend/register.html`
- `frontend/forgot-password.html`
- `frontend/reset-password.html`

### Driver
- `frontend/driver.html`
- `frontend/payment.html`
- `frontend/profile.html`

### Attendant
- `frontend/attendant.html`
- `frontend/reservations.html`
- `frontend/occupancy.html`

### Admin
- `frontend/admin.html`
- `frontend/admin-users.html`
- `frontend/admin-slots.html`
- `frontend/admin-bookings.html`
- `frontend/admin-payments.html`
- `frontend/admin-reports.html`
- `frontend/admin-audit.html`

## Public Identifiers
- Users now expose a public alphanumeric code such as `USR-7ATFV7KD`.
- Parking slots now expose a public alphanumeric code such as `SLT-MSQYQN66`.
- Internal numeric primary keys are still preserved in MySQL for safe relationships.

## Seeded Slot Layout
- Default seed inventory now includes the full 24-slot visual layout: `A-01` to `C-08`.
- The UI keeps this slot order for the lot maps so status colors stay consistent across driver, attendant, occupancy, and admin screens.

## Current Operational Notes
- Unpaid mobile-money bookings use a `2-minute` hold.
- Unpaid mobile-money selections are released automatically after expiry.
- Slot status is resynced before key reads to reduce stale availability in local development.
- Brevo API delivery is ready, and `brevo_both` mode supports API-first with SMTP fallback.

## Handoff Documents
- QA checklist: `documentation/QA-CHECKLIST.md`
- Deployment handoff: `documentation/DEPLOYMENT-HANDOFF.md`
- Project handoff summary: `documentation/PROJECT-HANDOFF.md`
- Brevo setup: `documentation/BREVO-SETUP.md`
- Backend notes: `backend/README.md`
- Frontend notes: `frontend/README.md`

## Production Reminder
Before deployment, review:
- `backend/.env.example`
- `documentation/DEPLOYMENT-HANDOFF.md`

For production, keep these settings hardened:
- `CORS_ALLOW_ALL=false`
- `SHOW_RESET_TOKEN=false`
- a strong `JWT_SECRET`
- verified Brevo sender credentials
