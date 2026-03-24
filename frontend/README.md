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
- The frontend now runs through `server.js` locally.
- On Railway one-go deployment, the backend serves the frontend directly from the repo root deployment.
- Runtime API configuration still supports `FRONTEND_API_BASE` for optional split deployments, but it is not required for the root Railway deployment.
- For release/handoff details, review `../documentation/PROJECT-HANDOFF.md` and `../documentation/RAILWAY-DEPLOYMENT.md`.
