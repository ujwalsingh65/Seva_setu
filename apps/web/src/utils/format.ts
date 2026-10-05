import { ApiError } from '../services/api/client';

const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

export function formatDate(iso: string | null | undefined): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString(undefined, {
    weekday: 'short',
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}

export function formatTime(iso: string | null | undefined): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
}

export function formatDateTime(iso: string | null | undefined): string {
  if (!iso) return '—';
  return `${formatDate(iso)} · ${formatTime(iso)}`;
}

export function isUpcoming(iso: string | null | undefined): boolean {
  return !!iso && new Date(iso).getTime() >= Date.now();
}

export function weekdayName(weekday: number): string {
  return WEEKDAYS[weekday] ?? 'Unknown';
}

/** ISO timestamp → value usable in a datetime-local input. */
export function isoToLocalDateTime(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/** datetime-local input value → ISO string (UTC, "Z" suffix). */
export function localDateTimeToIso(value: string): string {
  return new Date(value).toISOString();
}

export function getErrorMessage(error: unknown): string {
  if (error instanceof ApiError) {
    if (error.status === 401) return 'Your session has expired. Please sign in again.';
    if (error.status === 403) return "You don't have permission to do that.";
    if (error.status === 0) return error.message;
    return error.message;
  }
  if (error instanceof Error && error.message) return error.message;
  return 'Something went wrong on our side. Please try again.';
}
