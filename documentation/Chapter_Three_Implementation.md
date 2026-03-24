# Chapter Three: System Implementation

## 3.1 Introduction
This chapter presents the implementation of the Smart Parking Management System. It explains the development environment, database design, backend and frontend development, payment integration, security measures, testing, and deployment considerations.

## 3.2 Implementation Environment
The system was implemented using the following environment:
- Hardware: Intel Core i5, 8GB RAM, 512GB SSD
- Operating System: Windows 11
- IDE: Visual Studio Code
- Backend: Node.js with Express
- Database: MySQL (XAMPP)
- Frontend: HTML, CSS, JavaScript (browser-based)
- Local Server: XAMPP Apache for frontend hosting

## 3.3 System Architecture Implementation
The system follows a three-tier architecture:
- Presentation Layer (Frontend): User interfaces for drivers, attendants, and administrators
- Business Logic Layer (Backend API): Node.js + Express services handling authentication, bookings, payments, and reporting
- Data Layer (Database): MySQL tables for users, slots, bookings, payments, and vehicle logs

This architecture improves maintainability, scalability, and security by clearly separating responsibilities.

## 3.4 Database Implementation
The database was created as `Park_db`. The main tables are:
- `users`: Stores drivers, attendants, and administrators
- `parking_slots`: Stores slot information and status
- `bookings`: Stores booking records and schedules
- `payments`: Stores payment transactions and status
- `vehicle_entries`: Logs vehicle entry data
- `vehicle_exits`: Logs vehicle exit data

Foreign key constraints enforce data integrity between bookings, payments, users, and slots.

## 3.5 Backend Implementation
The backend exposes RESTful APIs with role-based access:
- Authentication (`/api/auth`): register, login, logout
- Driver services (`/api/driver`): view slots, create bookings, booking history
- Attendant services (`/api/attendant`): vehicle entry/exit, reservation verification, occupancy
- Admin services (`/api/admin`): user management, slot management, reports, payment monitoring
- Payment services (`/api/payments`): webhooks and provider callbacks

Security features include:
- JWT authentication
- Role-based access control
- Input validation
- Rate limiting
- Secure HTTP headers

## 3.6 Frontend Implementation
The frontend consists of multiple pages mapped to user roles:
- Driver: Login, registration, dashboard, booking history, payments
- Attendant: Entry/exit logging, reservations verification, occupancy
- Admin: Dashboard, users, slots, payments, reports

All pages use role-based guards and session persistence so users cannot access unauthorized areas.

## 3.7 Payment Integration (M-Pesa Daraja)
The system supports mobile money payments via the M-Pesa Daraja STK Push flow.
Key features:
- OAuth token generation for secure API access
- STK Push initiation for customer payment
- Callback endpoint for asynchronous payment confirmation
- Payment status updates in the database

Integration parameters are configured through `.env` variables for sandbox and production environments.

## 3.8 Testing and Verification
End-to-end verification was performed to ensure:
- User registration and login works
- Slot booking works and prevents conflicts
- Attendants can log entry/exit
- Payments update booking status
- Admin reports show accurate totals

Both cash and mobile money flows were tested.

## 3.9 Deployment Considerations
For deployment:
- The backend runs on Node.js (production server or cloud VM)
- The database is deployed in MySQL
- The frontend is hosted on Apache or any static web host

Environment variables are used for database credentials, JWT secrets, and payment integration to keep sensitive data secure.
