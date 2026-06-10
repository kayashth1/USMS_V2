# USMS Admin V2 — School ERP System

## Project Overview
This is a **School ERP Admin Panel** built as a React single-page application with Firebase as the backend. It is the admin-facing interface for managing a school's day-to-day operations.

## Tech Stack
- **Frontend**: React 19 + Vite 7
- **Styling**: Tailwind CSS v4 + Radix UI primitives (shadcn/ui style components)
- **Backend/DB**: Firebase v12 (Firestore + Auth)
- **Routing**: React Router DOM v7
- **Icons**: lucide-react
- **PDF Export**: jspdf

## Project Structure
```
frontend/
  src/
    Pages/          # Full page views (Dashboard, Students, Teachers, etc.)
    components/     # Reusable components
      ui/           # Base UI components (button, card, input, dialog, etc.)
      Layout/       # AdminLayout, Header, Sidebar
      students/     # Student-specific dialogs and components
      teachers/     # Teacher-specific dialogs and components
      attendance/   # Attendance filters, calendar, table
      academics/    # Upgrade/promote dialogs
      settings/     # Class, Subject, TimePeriod, TeacherAssignment management
    services/       # Firebase service layer (one file per entity)
    data/           # Static/seed data files
    Routes/         # AppRoute, ProtectedRoute
    config/
      firebase.js   # Firebase initialization
```

## Pages
- Dashboard, Students, Teachers, Attendance, Academics, Books, Fees, Timetable, Notices, Alumni, Settings, Login

## Key Conventions
- Services live in `frontend/src/services/` — one file per entity (e.g., `student.service.js`, `teacher.service.js`)
- UI primitives are in `frontend/src/components/ui/` — prefer using existing ones before creating new
- Dialogs for CRUD operations are colocated with their entity's component folder
- Dev server: run `npm run dev` inside `frontend/`
