# MathPath Admin Panel

Full-stack admin panel and attendance tracking system based on the MathPath UI Design Document v1.2.

## Stack
- **Frontend**: Next.js 14 (App Router) + TypeScript + Tailwind CSS + Recharts
- **Backend**: Node.js + Express + MongoDB (Mongoose)

## Setup

### Prerequisites
- Node.js 18+
- MongoDB (local on port 27017 or MongoDB Atlas)

### Backend

```bash
cd backend
npm install
cp .env.example .env     # edit MONGODB_URI if needed
npm run dev              # runs on http://localhost:5000
```

### Frontend

```bash
cd frontend
npm install
npm run dev              # runs on http://localhost:3000
```

### Demo Login Credentials
| Role | Email | Password |
|------|-------|----------|
| Super Admin | admin@mathpath.in | admin123 |
| Operations | ops@mathpath.in | ops1234 |
| Finance | finance@mathpath.in | fin1234 |
| Support Agent | support@mathpath.in | sup1234 |

## Screens (7 new from v1.2)

| ID | Screen | Route |
|----|--------|-------|
| A1 | Admin Overview | `/dashboard` |
| A2 | Tutor Management | `/tutors` |
| A3 | Tutor Detail | `/tutors/[id]` |
| A4 | Revenue Dashboard | `/revenue` |
| A5 | Student Attendance | `/attendance/students` |
| A6 | Tutor Attendance | `/attendance/tutors` |
| A7 | Alerts & Flags | `/alerts` |

## API Endpoints

```
POST /api/auth/login
GET  /api/auth/me
GET  /api/dashboard/overview
GET  /api/tutors
GET  /api/tutors/:id
POST /api/tutors/:id/warn
POST /api/tutors/:id/suspend
POST /api/tutors/:id/approve
GET  /api/students
GET  /api/students/stats/summary
GET  /api/students/:id/attendance
POST /api/students/:id/notify
GET  /api/revenue/overview
POST /api/revenue/pay/:paymentId
POST /api/revenue/pay-all
GET  /api/tutor-attendance
GET  /api/alerts
PATCH /api/alerts/:id/resolve
PATCH /api/alerts/:id/dismiss
```

## Access Control
| Role | Access |
|------|--------|
| Super Admin | All screens + all actions |
| Operations | Overview, tutor mgmt, alerts, attendance |
| Finance | Revenue + payouts only |
| Support Agent | View-only |
