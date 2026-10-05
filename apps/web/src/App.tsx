/**
 * SevaSetu Application Router
 *
 * Route protection strategy:
 *  - Public routes: accessible to all
 *  - RequireAuth: Clerk session required (soft protection)
 *  - RequireRole: Clerk session + specific DB role required (hard protection)
 *  - RequireNoAuth: redirects authenticated users away from login/signup
 *
 * Roles are NEVER read from Clerk session data — always from the backend.
 * Frontend role checks are UX/navigation only; the API remains the
 * authorization boundary.
 */
import React from 'react';
import { BrowserRouter, Outlet, Route, Routes } from 'react-router-dom';
import { ClerkProvider } from '@clerk/react';
import { Building2, CalendarDays, Compass, LayoutDashboard, UserRound } from 'lucide-react';
import type { NavItem } from './components/ui';
import { ROUTES } from './routes';
import { LoginPage, SignupPage } from './pages/auth';
import { DesignSystemPage } from './pages/DesignSystemPage';
import { RequireAuth, RequireNoAuth, RequireRole, UnauthorizedPage } from './routes/ProtectedRoutes';
import { AppShell } from './layouts/AppShell';
import { USER_ROLES } from '@sevasetu/constants';
import {
  VolunteerDashboard,
  VolunteerDiscover,
  VolunteerEventDetails,
  VolunteerMyEvents,
  VolunteerProfile,
} from './pages/volunteer';
import {
  NGODashboard,
  NgoEventCreatePage,
  NgoEventDetailsPage,
  NgoEventsPage,
  NgoProfilePage,
} from './pages/ngo';
import { AdminDashboard } from './pages/admin/DashboardPage';

const CLERK_PUBLISHABLE_KEY = import.meta.env.VITE_CLERK_PUBLISHABLE_KEY;

if (!CLERK_PUBLISHABLE_KEY || CLERK_PUBLISHABLE_KEY === 'pk_test_placeholder') {
  console.warn(
    '[SevaSetu] VITE_CLERK_PUBLISHABLE_KEY is not configured. ' +
    'Authentication will not work. Set this in apps/web/.env.local'
  );
}

// ─── Role-scoped navigation ───────────────────────────────────────────────────

const VOLUNTEER_NAV: NavItem[] = [
  { label: 'Dashboard', to: ROUTES.VOLUNTEER.DASHBOARD, icon: LayoutDashboard },
  { label: 'Discover', to: ROUTES.VOLUNTEER.DISCOVER, icon: Compass },
  { label: 'My events', to: ROUTES.VOLUNTEER.EVENTS, icon: CalendarDays },
  { label: 'Profile', to: ROUTES.VOLUNTEER.PROFILE, icon: UserRound },
];

const NGO_NAV: NavItem[] = [
  { label: 'Dashboard', to: ROUTES.NGO.DASHBOARD, icon: LayoutDashboard },
  { label: 'Events', to: ROUTES.NGO.EVENTS, icon: CalendarDays },
  { label: 'Organization', to: ROUTES.NGO.PROFILE, icon: Building2 },
];

function RoleShell({ navItems }: { navItems: NavItem[] }) {
  return (
    <AppShell navItems={navItems}>
      <Outlet />
    </AppShell>
  );
}

// ─── Home / Public Landing ────────────────────────────────────────────────────

function HomePage() {
  return (
    <div className="min-h-screen bg-brand-background text-brand-text flex flex-col">
      <header className="border-b border-brand-border bg-brand-surface">
        <div className="max-w-7xl mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-brand-green flex items-center justify-center text-white font-bold text-lg">
              SS
            </div>
            <div>
              <h1 className="text-xl font-bold text-brand-teal tracking-tight">SevaSetu</h1>
              <p className="text-xs text-brand-text-secondary">
                Right Volunteer. Right Place. Right Impact.
              </p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <a
              href={ROUTES.PUBLIC.LOGIN}
              className="text-sm text-brand-text-secondary hover:text-brand-teal transition-colors"
            >
              Sign in
            </a>
            <a
              href={ROUTES.PUBLIC.SIGNUP}
              className="px-4 py-2 bg-brand-green text-white text-sm font-medium rounded-lg hover:bg-brand-green-dark transition-colors"
            >
              Get started
            </a>
          </div>
        </div>
      </header>

      <main className="flex-1 max-w-7xl w-full mx-auto px-6 py-16 text-center">
        <h2 className="text-4xl font-bold text-brand-teal mb-4">
          Community Volunteer Coordination
        </h2>
        <p className="text-lg text-brand-text-secondary max-w-2xl mx-auto mb-8">
          Connecting NGOs with the right volunteers, at the right time, for the right impact.
        </p>
        <div className="flex gap-4 justify-center">
          <a
            href={ROUTES.PUBLIC.SIGNUP}
            className="px-6 py-3 bg-brand-green text-white font-semibold rounded-xl hover:bg-brand-green-dark transition-colors"
          >
            Volunteer with us
          </a>
          <a
            href={ROUTES.PUBLIC.LOGIN}
            className="px-6 py-3 border border-brand-border text-brand-text rounded-xl hover:bg-brand-light-green transition-colors"
          >
            Sign in
          </a>
        </div>
      </main>
    </div>
  );
}

// ─── App ──────────────────────────────────────────────────────────────────────

export const App: React.FC = () => {
  return (
    <ClerkProvider publishableKey={CLERK_PUBLISHABLE_KEY ?? ''}>
      <BrowserRouter>
        <Routes>
          {/* ── Public ── */}
          <Route path={ROUTES.PUBLIC.HOME} element={<HomePage />} />
          <Route path="/unauthorized" element={<UnauthorizedPage />} />
          <Route path="/design-system" element={<DesignSystemPage />} />

          {/* ── Auth (redirect if already signed in) ── */}
          <Route
            path={ROUTES.PUBLIC.LOGIN}
            element={
              <RequireNoAuth>
                <LoginPage />
              </RequireNoAuth>
            }
          />
          <Route
            path={ROUTES.PUBLIC.LOGIN + '/*'}
            element={
              <RequireNoAuth>
                <LoginPage />
              </RequireNoAuth>
            }
          />
          <Route
            path={ROUTES.PUBLIC.SIGNUP}
            element={
              <RequireNoAuth>
                <SignupPage />
              </RequireNoAuth>
            }
          />
          <Route
            path={ROUTES.PUBLIC.SIGNUP + '/*'}
            element={
              <RequireNoAuth>
                <SignupPage />
              </RequireNoAuth>
            }
          />

          {/* ── Volunteer (role: volunteer) ── */}
          <Route
            element={
              <RequireRole allowedRoles={[USER_ROLES.VOLUNTEER]}>
                <RoleShell navItems={VOLUNTEER_NAV} />
              </RequireRole>
            }
          >
            <Route path={ROUTES.VOLUNTEER.DASHBOARD} element={<VolunteerDashboard />} />
            <Route path={ROUTES.VOLUNTEER.DISCOVER} element={<VolunteerDiscover />} />
            <Route path={ROUTES.VOLUNTEER.EVENTS} element={<VolunteerMyEvents />} />
            <Route path={ROUTES.VOLUNTEER.EVENT_DETAILS(':eventId')} element={<VolunteerEventDetails />} />
            <Route path={ROUTES.VOLUNTEER.PROFILE} element={<VolunteerProfile />} />
          </Route>

          {/* ── NGO (roles: ngo_admin, ngo_coordinator) ── */}
          <Route
            element={
              <RequireRole allowedRoles={[USER_ROLES.NGO_ADMIN, USER_ROLES.NGO_COORDINATOR]}>
                <RoleShell navItems={NGO_NAV} />
              </RequireRole>
            }
          >
            <Route path={ROUTES.NGO.DASHBOARD} element={<NGODashboard />} />
            <Route path={ROUTES.NGO.PROFILE} element={<NgoProfilePage />} />
            <Route path={ROUTES.NGO.CREATE_EVENT} element={<NgoEventCreatePage />} />
            <Route path={ROUTES.NGO.EVENTS} element={<NgoEventsPage />} />
            <Route path={ROUTES.NGO.EVENT_DETAILS(':eventId')} element={<NgoEventDetailsPage />} />
          </Route>

          {/* ── Admin (role: platform_admin) ── */}
          <Route
            path={ROUTES.ADMIN.DASHBOARD}
            element={
              <RequireRole allowedRoles={[USER_ROLES.PLATFORM_ADMIN]}>
                <AdminDashboard />
              </RequireRole>
            }
          />

          {/* ── Catch-all 404 ── */}
          <Route
            path="*"
            element={
              <div className="min-h-screen bg-brand-background flex items-center justify-center">
                <div className="text-center">
                  <h1 className="text-4xl font-bold text-brand-teal mb-2">404</h1>
                  <p className="text-brand-text-secondary">Page not found</p>
                  <a href="/" className="mt-4 inline-block text-brand-green hover:underline">
                    Go home
                  </a>
                </div>
              </div>
            }
          />
        </Routes>
      </BrowserRouter>
    </ClerkProvider>
  );
};

export default App;
