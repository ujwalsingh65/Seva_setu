/**
 * Protected Route Components
 *
 * RequireAuth        — Redirects to /login if not signed in to Clerk.
 * RequireRole        — Additionally checks the app role from the DB.
 * RequireNoAuth      — Redirects authenticated users (for login/signup pages).
 *
 * IMPORTANT: Role checking happens via useAppUser which calls the backend.
 * Roles are NEVER read from Clerk session data on the frontend.
 */
import React from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '@clerk/react';
import { useAppUser } from '../hooks/useAppUser';
import { ROUTES } from './index';

interface ProtectedRouteProps {
  children: React.ReactNode;
}

interface RoleRouteProps extends ProtectedRouteProps {
  allowedRoles: string[];
}

// ─── Loading Screen ────────────────────────────────────────────────────────────

function AuthLoadingScreen() {
  return (
    <div className="min-h-screen bg-brand-background flex items-center justify-center">
      <div className="text-center space-y-3">
        <div className="w-10 h-10 rounded-full bg-brand-green mx-auto flex items-center justify-center text-white font-bold animate-pulse">
          SS
        </div>
        <p className="text-sm text-brand-text-secondary">Loading your account…</p>
      </div>
    </div>
  );
}

// ─── Unauthorized Screen ───────────────────────────────────────────────────────

export function UnauthorizedPage() {
  return (
    <div className="min-h-screen bg-brand-background flex items-center justify-center">
      <div className="max-w-md w-full mx-auto p-8 text-center space-y-4">
        <div className="w-16 h-16 rounded-full bg-red-100 mx-auto flex items-center justify-center">
          <span className="text-2xl">🚫</span>
        </div>
        <h1 className="text-2xl font-bold text-brand-teal">Access Denied</h1>
        <p className="text-brand-text-secondary">
          You don't have permission to view this page. If you believe this is an error, please
          contact support.
        </p>
        <a
          href={ROUTES.PUBLIC.HOME}
          className="inline-block px-6 py-2 bg-brand-green text-white rounded-medium text-sm font-medium hover:bg-brand-green-dark transition-colors"
        >
          Return Home
        </a>
      </div>
    </div>
  );
}

// ─── Error Screen ──────────────────────────────────────────────────────────────

function AuthErrorScreen({ message }: { message: string }) {
  return (
    <div className="min-h-screen bg-brand-background flex items-center justify-center">
      <div className="max-w-md w-full mx-auto p-8 text-center space-y-4">
        <div className="w-16 h-16 rounded-full bg-amber-100 mx-auto flex items-center justify-center">
          <span className="text-2xl">⚠️</span>
        </div>
        <h1 className="text-xl font-bold text-brand-teal">Account Error</h1>
        <p className="text-sm text-brand-text-secondary">{message}</p>
        <p className="text-xs text-brand-text-muted">
          If you just signed up, please wait a moment and refresh the page.
        </p>
        <button
          onClick={() => window.location.reload()}
          className="px-6 py-2 bg-brand-green text-white rounded-medium text-sm font-medium hover:bg-brand-green-dark transition-colors"
        >
          Retry
        </button>
      </div>
    </div>
  );
}

// ─── RequireAuth ───────────────────────────────────────────────────────────────

/**
 * Ensures the user is signed in to Clerk.
 * Redirects to /login if not.
 */
export function RequireAuth({ children }: ProtectedRouteProps) {
  const { isLoaded, isSignedIn } = useAuth();
  const location = useLocation();

  if (!isLoaded) {
    return <AuthLoadingScreen />;
  }

  if (!isSignedIn) {
    return <Navigate to={ROUTES.PUBLIC.LOGIN} state={{ from: location }} replace />;
  }

  return <>{children}</>;
}

// ─── RequireRole ───────────────────────────────────────────────────────────────

/**
 * Ensures the user is signed in AND has one of the allowed roles.
 * Role is fetched from the backend — never trusted from Clerk session.
 */
export function RequireRole({ children, allowedRoles }: RoleRouteProps) {
  const { isLoaded, isSignedIn } = useAuth();
  const { user, loading, error } = useAppUser();
  const location = useLocation();

  if (!isLoaded || loading) {
    return <AuthLoadingScreen />;
  }

  if (!isSignedIn) {
    return <Navigate to={ROUTES.PUBLIC.LOGIN} state={{ from: location }} replace />;
  }

  if (error) {
    return <AuthErrorScreen message={error} />;
  }

  if (!user) {
    return <AuthLoadingScreen />;
  }

  if (!allowedRoles.includes(user.role)) {
    return <UnauthorizedPage />;
  }

  return <>{children}</>;
}

// ─── RequireNoAuth ─────────────────────────────────────────────────────────────

/**
 * Prevents authenticated users from accessing login/signup pages.
 * Redirects to the appropriate dashboard based on the user's role.
 */
export function RequireNoAuth({ children }: ProtectedRouteProps) {
  const { isLoaded, isSignedIn } = useAuth();
  const { user, loading, error } = useAppUser();

  if (!isLoaded || (isSignedIn && loading)) {
    return <AuthLoadingScreen />;
  }

  if (isSignedIn && error) {
    return <AuthErrorScreen message={error} />;
  }

  if (isSignedIn && user) {
    // Redirect to role-appropriate landing page
    const destination = getRoleDashboard(user.role);
    return <Navigate to={destination} replace />;
  }

  return <>{children}</>;
}

function getRoleDashboard(role: string): string {
  switch (role) {
    case 'volunteer':
      return ROUTES.VOLUNTEER.DASHBOARD;
    case 'ngo_coordinator':
    case 'ngo_admin':
      return ROUTES.NGO.DASHBOARD;
    case 'platform_admin':
      return ROUTES.ADMIN.DASHBOARD;
    default:
      return ROUTES.PUBLIC.HOME;
  }
}
