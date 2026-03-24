# Smart Parking Management System Backend

Node.js + MySQL backend for the Smart Parking Management System.

## Local Setup
1. Copy `.env.example` to `.env`.
2. Create `Park_db` and import `../database/schema.sql` followed by `../database/seed.sql`.
3. Install dependencies and start the server.

```bash
npm install
npm run dev
```

## Railway Notes
- Railway MySQL variables are supported directly: `MYSQLHOST`, `MYSQLPORT`, `MYSQLUSER`, `MYSQLPASSWORD`, `MYSQLDATABASE`.
- For one-go Railway deployment, use the root `railway.toml` and deploy from the repository root.
- The backend serves the frontend files automatically when the repo is deployed from root.
- The Railway pre-deploy bootstrap command is `npm run railway:bootstrap`.

## Deployment Admin Bootstrap
- Set `ADMIN_SEED_NAME`, `ADMIN_SEED_EMAIL`, and `ADMIN_SEED_PASSWORD` in your local `.env`.
- The backend creates or refreshes that admin account only until the first successful password change.
- After the first successful login, the user must set a new password.
- Do not store live deployment credentials in tracked files.

## Core Endpoints
- `POST /api/auth/login`
- `POST /api/auth/register`
- `POST /api/auth/forgot-password`
- `POST /api/auth/reset-password`
- `GET /api/users/me`
- `PATCH /api/users/me`
- `GET /health`

## Email Delivery
The backend supports:
- `brevo_smtp`
- `brevo_api`
- `brevo_both`

Recommended mode:
- `brevo_both`

Behavior in `brevo_both` mode:
- Brevo API is attempted first
- SMTP is used as fallback if the API request fails

See:
- `documentation/BREVO-SETUP.md`

## Public Identifier Model
- `users.public_user_id` is exposed as the user code in API responses.
- `parking_slots.public_slot_id` is exposed as the slot code in API responses.
- Admin user and slot updates accept either the public code or the internal numeric ID, though the UI now uses public codes by default.

## Password Recovery
When `SHOW_RESET_TOKEN=true`, the reset token is included in the response for local testing.
For production:
- set `SHOW_RESET_TOKEN=false`
- deliver reset codes by email and/or SMS only

## Scheduled Exports
Daily report exports are controlled through:
- `REPORT_EXPORT_ENABLED`
- `REPORT_EXPORT_TIME`
- `REPORT_EXPORT_DIR`
- `REPORT_EXPORT_TYPES`

## Smoke Tests
Run quick API verification:
```bash
npm run smoke
```

## Email Test
```bash
npm run email:test -- your-email@example.com
```

## Production Handoff
Before deployment, review:
- `.env.example`
- `../documentation/DEPLOYMENT-HANDOFF.md`
- `../documentation/PROJECT-HANDOFF.md`
