# Frontend (Dev)

## Run locally
```bash
npm install
npm run dev
```

Default URL:
- `http://localhost:5500`

## API base URL
Edit:
- `assets/js/config.js`

## Main role pages
- Login: `index.html`
- Register: `register.html`
- Forgot password: `forgot-password.html`
- Reset password: `reset-password.html`
- Driver: `driver.html`
- Payments: `payment.html`
- Profile: `profile.html`
- Attendant: `attendant.html`
- Reservations: `reservations.html`
- Occupancy: `occupancy.html`
- Admin dashboard: `admin.html`

## Notes
- The frontend is static and served with `http-server` during local development.
- Role pages are wired to the Node.js backend on `http://localhost:4000` by default.
- For release/handoff details, review `../documentation/PROJECT-HANDOFF.md`.
