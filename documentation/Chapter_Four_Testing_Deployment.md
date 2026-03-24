# Chapter Four: Testing and Deployment

## 4.1 Introduction
This chapter presents the testing approach used to verify the Smart Parking Management System, as well as the deployment procedures for local and production environments.

## 4.2 Testing Strategy
Testing focused on functionality, security, and data integrity. The following levels were considered:
- Unit testing: validation of individual functions (authentication, booking logic, payment updates)
- Integration testing: API endpoints with database persistence
- End-to-end testing: full user flows across driver, attendant, and admin roles

## 4.3 Test Cases and Results
Key test scenarios and outcomes:
- Driver registration and login: Passed (valid credentials allow access)
- Slot booking: Passed (available slots can be booked, conflicts prevented)
- Cash payment flow: Passed (payment pending → paid after vehicle exit)
- Mobile money flow: Passed (booking pending → confirmed on callback)
- Attendant entry/exit: Passed (slot status updated correctly)
- Admin reporting: Passed (revenue and occupancy reflect latest records)

## 4.4 Deployment (Local)
Local deployment uses XAMPP and Node.js:
- Start MySQL and Apache in XAMPP
- Apply database schema: `database/schema.sql`
- Apply migrations in `database/migrations`
- Start backend: `npm run dev` in `backend`
- Start frontend: `npm run dev` in `frontend` (http-server)

## 4.5 Deployment (Production)
Recommended production setup:
- Host backend on a Node.js-capable server (Ubuntu/Windows Server)
- Deploy MySQL on a secured database server
- Serve frontend via Apache/Nginx or static hosting
- Use environment variables for secrets and API keys
- Enable HTTPS and firewall rules for security

## 4.6 Maintenance Considerations
- Regular backups of the `Park_db` database
- Log monitoring for errors and suspicious access
- Periodic audit of user accounts and permissions
- Payment reconciliation through admin tools
