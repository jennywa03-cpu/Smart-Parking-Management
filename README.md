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

## Default Local Admin
- Email: `janemwangi@gmail.com`
- Password: `admin@123`

## Recommended Local Run Order
1. Start MySQL in XAMPP.
2. Start the backend from `backend/`.
3. Start the frontend from `frontend/`.
4. Open `http://localhost:5500`.
5. Sign in with the local admin account.

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
