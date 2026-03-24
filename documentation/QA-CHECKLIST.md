# Browser QA Checklist

Use this checklist in a real browser after starting MySQL, the backend on `http://localhost:4000`, and the frontend on `http://localhost:5500`.

## 1. Authentication Pages

### Login - `frontend/index.html`
- Open `http://localhost:5500/index.html`
- Confirm the hero image loads correctly
- Confirm the login card is centered and readable on desktop
- Confirm email and password inputs align properly
- Confirm the password eye icon stays inside the input field
- Sign in with `janemwangi@gmail.com` / `admin@123`
- Confirm admin dashboard opens without fetch errors

### Register - `frontend/register.html`
- Open the page from the login screen
- Confirm the form spacing matches the login page quality
- Confirm phone, vehicle, and password reveal buttons stay inside the input fields
- Register a test driver account
- Confirm success feedback appears

### Forgot Password - `frontend/forgot-password.html`
- Open the page from login
- Submit a valid email
- Confirm the reset message appears without layout breakage
- Confirm links back to login and reset-password work

## 2. Driver Pages

### Driver Dashboard - `frontend/driver.html`
- Sign in as a driver
- Confirm hero, support cards, overview cards, and booking sections have consistent spacing
- Confirm slot cards align evenly and wrap cleanly
- Confirm clicking an available slot loads the booking panel
- Confirm filters work: All, Available, Booked, Occupied
- Confirm quick book by slot number works
- Confirm the selected slot summary updates live

### Driver Booking Flow
- Choose an available slot
- Set start and end time
- Click `Calculate Total`
- Confirm the estimate updates
- Book with `mobile_money`
- Confirm the pending payment handoff appears
- Book with `cash`
- Confirm success feedback appears

### Payment Page - `frontend/payment.html`
- Open `payment.html`
- Confirm the selected booking summary loads
- Confirm the hold banner is visible for pending mobile-money bookings
- Confirm the countdown updates
- Confirm payment method toggle works
- Confirm mobile-money fields show and hide correctly
- Confirm success panel appears after payment initiation

### Driver History and Active Booking
- Confirm one active booking appears in the pinned section when present
- Confirm older records appear in history
- Confirm status chips are readable and consistent
- Confirm clicking a booking card opens payment details when appropriate

## 3. Attendant Pages

### Attendant Dashboard - `frontend/attendant.html`
- Sign in as an attendant
- Confirm summary cards, helper cards, and forms align well
- Confirm live lot map loads
- Click an available slot tile
- Confirm the entry form slot select is prefilled
- Use `Check Reservation` with a real booked vehicle
- Confirm reservation details appear in the helper and summary card

### Entry and Exit Flow
- Confirm a paid or confirmed booking can be checked in
- Confirm the entry success message appears
- Look up the same vehicle in the exit form
- Confirm duration, amount, and payment status appear
- Process exit
- Confirm the slot is released afterward

### Reservations - `frontend/reservations.html`
- Confirm reservation queue loads
- Type a vehicle number into the filter
- Confirm the table filters live
- Click `Verify`
- Confirm the reservation status updates cleanly

### Occupancy - `frontend/occupancy.html`
- Confirm the grid loads
- Confirm Available, Reserved, Occupied, and Maintenance insight cards appear
- Confirm the action summary updates based on lot state
- Confirm refresh works

## 4. Admin Pages

### Admin Dashboard - `frontend/admin.html`
- Sign in as admin
- Confirm KPI cards only appear on the main dashboard
- Confirm charts and overview blocks align consistently
- Confirm quick action cards work

### Public Code Check
- Confirm admin user rows show `USR-...` style user codes instead of plain numeric user IDs.
- Confirm admin slot forms and booking filters accept `SLT-...` and `USR-...` values.
- Confirm driver and attendant responses still work after the public-code change.

### User Management - `frontend/admin-users.html`
- Confirm create and update forms align properly
- Create a user
- Edit that user
- Toggle active/inactive status
- Confirm the table updates cleanly

### Slot Management - `frontend/admin-slots.html`
- Confirm slot map loads
- Confirm quick list cards align properly
- Click a slot tile and a quick-list card
- Confirm the update form fills correctly
- Change a slot status
- Confirm the selection summary updates

### Booking Management - `frontend/admin-bookings.html`
- Confirm filters work
- Load a booking into the update form
- Cancel a booking
- Confirm audit history is accessible

### Payments - `frontend/admin-payments.html`
- Confirm payment rows load
- Confirm action buttons render consistently
- Confirm manual payment status update works

### Reports - `frontend/admin-reports.html`
- Confirm summary and report controls load
- Generate reports
- Export CSV/PDF where available
- Confirm schedule/export controls respond correctly

### Audit Trail - `frontend/admin-audit.html`
- Confirm audit rows load
- Filter by entity type if available
- Confirm table layout and badges remain readable

## 5. Responsive QA

### Mobile Width Check
- Reduce the browser width to tablet and mobile sizes
- Confirm auth pages keep readable padding and card sizes
- Confirm topbar right-side chips collapse cleanly
- Confirm driver slot cards stack to one column
- Confirm action buttons stack vertically where needed
- Confirm tables remain horizontally scrollable instead of breaking layout

## 6. End-to-End Flow

Run this as one full journey:
- Admin signs in
- Admin confirms slots and users load
- Driver registers or signs in
- Driver books a slot and initiates payment
- Attendant verifies reservation and records entry
- Attendant processes exit
- Admin opens reports and confirms totals update

Expected result:
- No fetch errors
- No broken layout sections
- Slot status changes correctly across all roles
- Paid and completed actions reflect in admin reporting
