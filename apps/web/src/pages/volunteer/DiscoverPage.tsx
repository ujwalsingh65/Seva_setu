import React, { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { CalendarDays, MapPin, Search, Users } from 'lucide-react';
import { useApiQuery } from '../../hooks/useApi';
import { ROUTES } from '../../routes';
import { listPublicEvents, type PublicEventRow } from '../../services/api/endpoints';
import { formatDateTime, isUpcoming } from '../../utils/format';
import {
  Button,
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
  EmptyState,
  ErrorState,
  Input,
  Select,
  SkeletonCard,
} from '../../components/ui';
import { PageHeader, StatusBadge } from '../../components/shared';

const DATE_WINDOW_OPTIONS = [
  { value: 'all', label: 'Any date' },
  { value: 'week', label: 'Next 7 days' },
  { value: 'month', label: 'Next 30 days' },
];

type DateWindow = 'all' | 'week' | 'month';

function matchesFilters(
  event: PublicEventRow,
  query: string,
  cause: string,
  dateWindow: DateWindow,
): boolean {
  if (query) {
    const haystack = `${event.title} ${event.description} ${event.cause} ${event.venue}`.toLowerCase();
    if (!haystack.includes(query)) return false;
  }
  if (cause && event.cause !== cause) return false;
  if (dateWindow !== 'all' && !isUpcoming(event.start_at)) return false;
  if (dateWindow === 'week') {
    const inWeek = new Date(event.start_at).getTime() <= Date.now() + 7 * 24 * 60 * 60 * 1000;
    if (!inWeek) return false;
  }
  if (dateWindow === 'month') {
    const inMonth = new Date(event.start_at).getTime() <= Date.now() + 30 * 24 * 60 * 60 * 1000;
    if (!inMonth) return false;
  }
  return true;
}

export function DiscoverPage() {
  const { data: events, loading, error, refetch } = useApiQuery(listPublicEvents);

  const [query, setQuery] = useState('');
  const [cause, setCause] = useState('');
  const [dateWindow, setDateWindow] = useState<DateWindow>('all');

  const causes = useMemo(
    () => Array.from(new Set((events ?? []).map((event) => event.cause))).sort(),
    [events],
  );

  const filtered = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    return (events ?? [])
      .filter((event) => matchesFilters(event, normalizedQuery, cause, dateWindow))
      .sort(
        (a, b) => new Date(a.start_at).getTime() - new Date(b.start_at).getTime(),
      );
  }, [events, query, cause, dateWindow]);

  const hasActiveFilters = query.trim() !== '' || cause !== '' || dateWindow !== 'all';

  const clearFilters = () => {
    setQuery('');
    setCause('');
    setDateWindow('all');
  };

  return (
    <div>
      <PageHeader
        title="Discover events"
        description="Browse public volunteering opportunities and register for the causes you care about."
      />

      <Card className="mb-6">
        <CardContent className="mt-0 grid gap-3 md:grid-cols-[1fr_auto_auto]">
          <Input
            type="search"
            label="Search"
            hideLabel
            placeholder="Search by title, cause, or venue"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            leadingIcon={<Search className="h-4 w-4" aria-hidden="true" />}
          />
          <Select
            label="Cause"
            hideLabel
            placeholder="All causes"
            options={causes.map((c) => ({ value: c, label: c }))}
            value={cause}
            onChange={(e) => setCause(e.target.value)}
          />
          <Select
            label="Date"
            hideLabel
            options={DATE_WINDOW_OPTIONS}
            value={dateWindow}
            onChange={(e) => setDateWindow(e.target.value as DateWindow)}
          />
        </CardContent>
      </Card>

      {loading && (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          <SkeletonCard />
          <SkeletonCard />
          <SkeletonCard />
          <SkeletonCard />
          <SkeletonCard />
          <SkeletonCard />
        </div>
      )}

      {!loading && error && <ErrorState message={error?.message} onRetry={refetch} />}

      {!loading && !error && (events ?? []).length === 0 && (
        <Card>
          <CardContent className="mt-0">
            <EmptyState
              icon={CalendarDays}
              title="No public events available right now"
              description="Check back soon — organizations post new opportunities regularly."
            />
          </CardContent>
        </Card>
      )}

      {!loading && !error && (events ?? []).length > 0 && filtered.length === 0 && (
        <Card>
          <CardContent className="mt-0">
            <EmptyState
              icon={Search}
              title="No events match your filters"
              description="Try widening your search or clearing the filters."
              action={
                <Button variant="secondary" onClick={clearFilters}>
                  Clear filters
                </Button>
              }
            />
          </CardContent>
        </Card>
      )}

      {!loading && !error && filtered.length > 0 && (
        <ul className="grid gap-4 md:grid-cols-2 lg:grid-cols-3" aria-label="Public events">
          {filtered.map((event) => {
            const past = !isUpcoming(event.start_at);
            return (
              <li key={event.id} className="h-full">
                <Link to={ROUTES.VOLUNTEER.EVENT_DETAILS(event.id)} className="block h-full">
                  <Card hoverable className="flex h-full flex-col">
                    <CardHeader icon={CalendarDays} action={<StatusBadge kind="event" status={event.status} />}>
                      <CardTitle>{event.title}</CardTitle>
                      <CardDescription>{formatDateTime(event.start_at)}</CardDescription>
                    </CardHeader>
                    <CardContent className="flex-1">
                      <p className="text-small text-brand-text-secondary line-clamp-2">
                        {event.description}
                      </p>
                      <p className="mt-3 flex items-center gap-1 text-small text-brand-text-secondary">
                        <MapPin className="h-4 w-4 shrink-0" aria-hidden="true" />
                        {event.venue}
                      </p>
                      <p className="mt-1 flex items-center gap-1 text-small text-brand-text-secondary">
                        <Users className="h-4 w-4 shrink-0" aria-hidden="true" />
                        {event.capacity - event.accepted_count > 0
                          ? `${event.capacity - event.accepted_count} of ${event.capacity} spots open`
                          : 'All spots filled'}
                      </p>
                    </CardContent>
                    <CardFooter>
                      <span className="text-small font-medium text-brand-green">{event.cause}</span>
                      {past && (
                        <span className="text-small text-brand-text-muted" aria-label="This event has already taken place">
                          Past event
                        </span>
                      )}
                    </CardFooter>
                  </Card>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

export default DiscoverPage;
