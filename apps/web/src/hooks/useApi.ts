import { useCallback, useEffect, useRef, useState } from 'react';
import { useAuth } from '@clerk/react';
import { getMyNgos } from '../services/api/endpoints';
import type { NgoMembership } from '../services/api/endpoints';

interface UseApiQueryResult<T> {
  data: T | null;
  loading: boolean;
  error: Error | null;
  refetch: () => void;
}

/**
 * Runs a token-authenticated fetch whenever the session or `deps` change.
 * The fetcher is kept in a ref so callers can pass inline closures that
 * close over changing props (e.g. route params) without re-triggering.
 */
export function useApiQuery<T>(fetcher: (token: string) => Promise<T>, deps: unknown[] = []): UseApiQueryResult<T> {
  const { getToken, isSignedIn } = useAuth();
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);
  const [tick, setTick] = useState(0);
  const fetcherRef = useRef(fetcher);
  fetcherRef.current = fetcher;

  useEffect(() => {
    if (!isSignedIn) return;
    let cancelled = false;
    setLoading(true);
    (async () => {
      try {
        const token = await getToken();
        if (!token) throw new Error('Your session has expired. Please sign in again.');
        const result = await fetcherRef.current(token);
        if (!cancelled) {
          setData(result);
          setError(null);
        }
      } catch (err) {
        if (!cancelled) setError(err as Error);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isSignedIn, getToken, tick, ...deps]);

  const refetch = useCallback(() => setTick((t) => t + 1), []);
  return { data, loading, error, refetch };
}

interface UseApiMutationResult<TArgs extends unknown[], TResult> {
  mutate: (...args: TArgs) => Promise<TResult>;
  pending: boolean;
  error: Error | null;
  reset: () => void;
}

/** Wraps a token-authenticated write. Errors are re-thrown after being recorded. */
export function useApiMutation<TArgs extends unknown[], TResult>(
  fn: (token: string, ...args: TArgs) => Promise<TResult>
): UseApiMutationResult<TArgs, TResult> {
  const { getToken } = useAuth();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const fnRef = useRef(fn);
  fnRef.current = fn;

  const mutate = useCallback(
    async (...args: TArgs): Promise<TResult> => {
      setPending(true);
      setError(null);
      try {
        const token = await getToken();
        if (!token) throw new Error('Your session has expired. Please sign in again.');
        return await fnRef.current(token, ...args);
      } catch (err) {
        setError(err as Error);
        throw err;
      } finally {
        setPending(false);
      }
    },
    [getToken]
  );

  const reset = useCallback(() => setError(null), []);
  return { mutate, pending, error, reset };
}

interface UseMyNgoResult {
  memberships: NgoMembership[];
  primaryNgo: NgoMembership | null;
  loading: boolean;
  error: Error | null;
  refetch: () => void;
}

/** NGO memberships for the signed-in user, sourced from the backend. */
export function useMyNgo(): UseMyNgoResult {
  const query = useApiQuery((token) => getMyNgos(token), []);
  return {
    memberships: query.data ?? [],
    primaryNgo: query.data?.[0] ?? null,
    loading: query.loading,
    error: query.error,
    refetch: query.refetch,
  };
}
