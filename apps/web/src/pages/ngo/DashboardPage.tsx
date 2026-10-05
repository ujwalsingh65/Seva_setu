import React, { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { CalendarDays, ClipboardList, MapPin, Plus, Users } from 'lucide-react';
import { useApiQuery } from '../../hooks/useApi';
import { ROUTES } from '../../routes';
import { listNgoApplications, listNgoEvents } from '../../services/api/endpoints';
import { formatDateTime, isUpcoming } from '../../utils/format';
import {
  Button,
  Card,
  CardContent,
  CardDescription,
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

function DashboardContent({ ngoId, ngoName }: { ngoId: string; ngoName: string }) {
  const events = useApiQuery((token) => listNgoEvents(token, ngoId), [ngoId]);
  const applications = useApiQuery((token) => listNgoApplications(token, ngoId), [ngoId]);

  const loading = events.loading || applications.loading;
  const error = events.error ?? applications.error;
  const refetchAll = () => {
    events.refetch();
    applications.refetch();
  };

  const eventById = useMemo(
    () => new Map((events.data ?? []).map((event) => [event.id, event])),
    [events.data],
  );

  const activeEvents = useMemo(
    () => (events.data ?? []).filter((event) => (ACTIVE_EVENT_STATUSES as readonly string[]).includes(event.status)),
    [events.data],
  );

  const publishedUpcoming = useMemo(
    () =>
      activeEvents
        .filter((event) => event.status === 'published' && isUpcoming(event.start_at))
        .sort((a, b) => new Date(a.start_at).getTime() - new Date(b.start_at).getTime()),
    [activeEvents],
  );

  const awaitingReview = useMemo(
    () =>
      (applications.data ?? []).filter(
        (application) =>
          application.status === 'interested' &&
          eventById.get(application.event_id)?.registration_mode === 'approval_required',
      ).length,
    [applications.data, eventById],
  );

  if (loading) {
    return (
      <div>
        <Skeleton variant="text" className="mb-2 h-8 w-72" />
        <Skeleton variant="text" className="mb-6 h-4 w-96" />
        <div className="grid gap-4 md:grid-cols-3">
          <SkeletonCard />
          <SkeletonCard />
          <SkeletonCard />
        </div>
      </div>
    );
  }

  if (error) {
    return <ErrorState message={error?.message} onRetry={refetchAll} />;
  }

  return (
    <div>
      <PageHeader
        title={ngoName}
        description="Manage your events, review registrations, and coordinate volunteers."
        actions={
          <Link to={ROUTES.NGO.CREATE_EVENT}>
            <Button leadingIcon={Plus}>New event</Button>
          </Link>
        }
      />

      {activeEvents.length === 0 && (
        <Card className="mb-6 border-brand-mint bg-brand-mint/40">
          <CardContent className="mt-0 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="font-medium text-brand-green-dark">Create your first event</p>
              <p className="text-small text-brand-text-secondary">
                Publish an opportunity so volunteers can discover and register for it.
              </p>
            </div>
            <Link to={ROUTES.NGO.CREATE_EVENT}>
              <Button leadingIcon={Plus}>Create event</Button>
            </Link>
          </CardContent>
        </Card>
      )}

      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardHeader icon={CalendarDays} />
          <CardContent>
            <p className="text-h2 text-brand-teal">{activeEvents.length}</p>
            <CardDescription>Active events</CardDescription>
          </CardContent>
        </Card>
        <Card>
          <CardHeader icon={ClipboardList} />
          <CardContent>
            <p className="text-h2 text-brand-teal">{awaitingReview}</p>
            <CardDescription>Requests awaiting review</CardDescription>
          </CardContent>
        </Card>
        <Card>
          <CardHeader icon={Users} />
          <CardContent>
            <p className="text-h2 text-brand-teal">{publishedUpcoming.length}</p>
            <CardDescription>Published &amp; upcoming</CardDescription>
          </CardContent>
        </Card>
      </div>

      <section className="mt-8" aria-labelledby="upcoming-events-heading">
        <div className="mb-4 flex items-center justify-between">
          <h2 id="upcoming-events-heading" className="text-h3 text-brand-teal">
            Upcoming published events
          </h2>
          <Link
            to={ROUTES.NGO.EVENTS}
            className="text-small font-medium text-brand-green hover:text-brand-green-dark"
          >
            View all
          </Link>
        </div>

        {publishedUpcoming.length === 0 ? (
          <Card>
            <CardContent className="mt-0">
              <EmptyState
                icon={CalendarDays}
                title="No published events"
                description="Publish an event so it appears on the volunteer discovery feed."
              />
            </CardContent>
          </Card>
        ) : (
          <ul className="grid gap-4 md:grid-cols-2">
            {publishedUpcoming.slice(0, 5).map((event) => (
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
                  </Card>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

export function NGODashboardPage() {
  return (
    <NgoGate>
      {(ngo) => <DashboardContent ngoId={ngo.ngo_id} ngoName={ngo.ngo.name} />}
    </NgoGate>
  );
}

export default NGODashboardPage;
export { NGODashboardPage as NGODashboard };
