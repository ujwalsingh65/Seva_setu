import React, { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { CalendarDays, MapPin, Plus, Users } from 'lucide-react';
import { useApiQuery } from '../../hooks/useApi';
import { ROUTES } from '../../routes';
import { listNgoApplications, listNgoEvents, type EventRow } from '../../services/api/endpoints';
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
  Skeleton,
  SkeletonCard,
} from '../../components/ui';
import { PageHeader, StatusBadge } from '../../components/shared';
import { NgoGate } from '../../components/ngo';

const ACTIVE_EVENT_STATUSES = ['draft', 'published', 'in_progress'] as const;

interface EventWithCount {
  event: EventRow;
  registrationCount: number;
}

function EventsContent({ ngoId }: { ngoId: string }) {
  const events = useApiQuery((token) => listNgoEvents(token, ngoId), [ngoId]);
  const applications = useApiQuery((token) => listNgoApplications(token, ngoId), [ngoId]);

  const loading = events.loading || applications.loading;
  const error = events.error ?? applications.error;
  const refetchAll = () => {
    events.refetch();
    applications.refetch();
  };

  const countsByEvent = useMemo(() => {
    const counts = new Map<string, number>();
    for (const application of applications.data ?? []) {
      if (application.status === 'rejected' || application.status === 'cancelled') continue;
      counts.set(application.event_id, (counts.get(application.event_id) ?? 0) + 1);
    }
    return counts;
  }, [applications.data]);

  const withCounts = useMemo<EventWithCount[]>(
    () =>
      (events.data ?? []).map((event) => ({
        event,
        registrationCount: countsByEvent.get(event.id) ?? 0,
      })),
    [events.data, countsByEvent],
  );

  const active = useMemo(
    () =>
      withCounts
        .filter(({ event }) => (ACTIVE_EVENT_STATUSES as readonly string[]).includes(event.status))
        .sort((a, b) => new Date(a.event.start_at).getTime() - new Date(b.event.start_at).getTime()),
    [withCounts],
  );

  const past = useMemo(
    () =>
      withCounts
        .filter(({ event }) => event.status === 'completed' || event.status === 'cancelled')
        .sort((a, b) => new Date(b.event.start_at).getTime() - new Date(a.event.start_at).getTime()),
    [withCounts],
  );

  if (loading) {
    return (
      <div>
        <Skeleton variant="text" className="mb-2 h-8 w-72" />
        <Skeleton variant="text" className="mb-6 h-4 w-96" />
        <div className="grid gap-4 md:grid-cols-2">
          <SkeletonCard />
          <SkeletonCard />
        </div>
      </div>
    );
  }

  if (error) {
    return <ErrorState message={error?.message} onRetry={refetchAll} />;
  }

  const renderCard = ({ event, registrationCount }: EventWithCount) => (
    <li key={event.id}>
      <Link to={ROUTES.NGO.EVENT_DETAILS(event.id)} className="block h-full">
        <Card hoverable className="h-full">
          <CardHeader
            icon={CalendarDays}
            action={<StatusBadge kind="event" status={event.status} />}
          >
            <CardTitle>{event.title}</CardTitle>
            <CardDescription>{formatDateTime(event.start_at)}</CardDescription>
          </CardHeader>
          <CardContent>
            <p className="flex items-center gap-1 text-small text-brand-text-secondary">
              <MapPin className="h-4 w-4 shrink-0" aria-hidden="true" />
              {event.venue}
            </p>
          </CardContent>
          <CardFooter>
            <p className="flex items-center gap-1 text-caption text-brand-text-muted">
              <Users className="h-4 w-4 shrink-0" aria-hidden="true" />
              {registrationCount} registration{registrationCount === 1 ? '' : 's'}
              {event.status === 'published' && !isUpcoming(event.start_at) && ' · Past start date'}
            </p>
          </CardFooter>
        </Card>
      </Link>
    </li>
  );

  return (
    <div>
      <PageHeader
        title="Events"
        description="Draft, publish, and manage volunteer opportunities for your organization."
        actions={
          <Link to={ROUTES.NGO.CREATE_EVENT}>
            <Button leadingIcon={Plus}>New event</Button>
          </Link>
        }
      />

      {active.length === 0 && past.length === 0 && (
        <Card>
          <CardContent className="mt-0">
            <EmptyState
              icon={CalendarDays}
              title="No events yet"
              description="Create your first event to start recruiting volunteers."
              action={
                <Link to={ROUTES.NGO.CREATE_EVENT}>
                  <Button leadingIcon={Plus}>Create event</Button>
                </Link>
              }
            />
          </CardContent>
        </Card>
      )}

      {(active.length > 0 || past.length > 0) && (
        <>
          <section aria-labelledby="active-events-heading">
            <h2 id="active-events-heading" className="mb-4 text-h3 text-brand-teal">
              Active
            </h2>
            {active.length === 0 ? (
              <Card>
                <CardContent className="mt-0">
                  <EmptyState
                    icon={CalendarDays}
                    title="No active events"
                    description="Draft, published, and in-progress events appear here."
                  />
                </CardContent>
              </Card>
            ) : (
              <ul className="grid gap-4 md:grid-cols-2">{active.map(renderCard)}</ul>
            )}
          </section>

          <section className="mt-8" aria-labelledby="past-events-heading">
            <h2 id="past-events-heading" className="mb-4 text-h3 text-brand-teal">
              Past
            </h2>
            {past.length === 0 ? (
              <Card>
                <CardContent className="mt-0">
                  <EmptyState
                    icon={CalendarDays}
                    title="No past events"
                    description="Completed and cancelled events appear here."
                  />
                </CardContent>
              </Card>
            ) : (
              <ul className="grid gap-4 md:grid-cols-2">{past.map(renderCard)}</ul>
            )}
          </section>
        </>
      )}
    </div>
  );
}

export function NgoEventsPage() {
  return <NgoGate>{(ngo) => <EventsContent ngoId={ngo.ngo_id} />}</NgoGate>;
}

export default NgoEventsPage;
