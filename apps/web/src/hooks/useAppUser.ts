/**
 * useAppUser — hook that returns the current user's application record.
 *
 * After Clerk authentication succeeds, this hook fetches the user's
 * database record (including their AUTHORITATIVE role) from the backend.
 * The role shown in the frontend comes from the API — never from Clerk
 * session data or localStorage.
 *
 * States:
 *   loading  — Clerk or API call in progress
 *   error    — Clerk is signed in but the API returned an error
 *   user     — Resolved app user (id, email, role, status)
 */
import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '@clerk/react';
import type { User } from '@sevasetu/shared-types';
import { API_BASE_URL } from '../services/api/client';

interface AppUserState {
  user: Pick<User, 'id' | 'email' | 'role' | 'status'> | null;
  loading: boolean;
  error: string | null;
  refetch: () => void;
}

export function useAppUser(): AppUserState {
  const { isLoaded, isSignedIn, getToken } = useAuth();
  const [user, setUser] = useState<Pick<User, 'id' | 'email' | 'role' | 'status'> | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchUser = useCallback(async () => {
    if (!isLoaded) return;

    if (!isSignedIn) {
      setUser(null);
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const token = await getToken();
      if (!token) {
        throw new Error('No session token available');
      }

      const res = await fetch(`${API_BASE_URL}/auth/me`, {
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
      });

      const body = await res.json();

      if (!res.ok) {
        throw new Error(body.error?.message || 'Failed to load user profile');
      }

      setUser(body.data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
      setUser(null);
    } finally {
      setLoading(false);
    }
  }, [isLoaded, isSignedIn, getToken]);

  useEffect(() => {
    fetchUser();
  }, [fetchUser]);

  return { user, loading, error, refetch: fetchUser };
}
