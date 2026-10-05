import React, { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { CalendarDays, MapPin } from 'lucide-react';
import { useApiMutation, useApiQuery } from '../../hooks/useApi';
import { ROUTES } from '../../routes';
import {
  cancelMyApplication,
  listMyApplications,
  listPublicEvents,
  type ApplicationRow,
  type EventRow,
} from '../../services/api/endpoints';
import { formatDateTime, getErrorMessage, isUpcoming } from '../../utils/format';
import {
  Alert,
  Button,
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
  EmptyState,
  ErrorState,
  Modal,
  SkeletonCard,
} from '../../components/ui';
import { PageHeader, StatusBadge } from '../../components/shared';

const ACTIVE_APPLICATION_STATUSES = ['interested', 'accepted', 'waitlisted'] as const;

type TabKey = 'upcoming' | 'past' | 'cancelled';

interface RegistrationWithEvent {
  application: ApplicationRow;
  event: EventRow | null;
}

export function MyEventsPage() {
  const applicationsQuery = useApiQuery(listMyApplications);
  const eventsQuery = useApiQuery(listPublicEvents);

  const [tab, setTab] = useState<TabKey>('upcoming');
  const [cancelling, setCancelling] = useState<ApplicationRow | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  const cancelMutation = useApiMutation(cancelMyApplication);

  const loading = applicationsQuery.loading || eventsQuery.loading;
  const error = applicationsQuery.error ?? eventsQuery.error;

  const refetchAll = () => {
    applicationsQuery.refetch();
    eventsQuery.refetch();
  };

  const eventById = useMemo(
    () => new Map((eventsQuery.data ?? []).map((event) => [event.id, event])),
    [eventsQuery.data],
  );

  const { upcoming, past, cancelled } = useMemo(() => {
    const all: RegistrationWithEvent[] = (applicationsQuery.data ?? []).map((application) => ({
      application,
      event: eventById.get(application.event_id) ?? null,
    }));
    const isActive = (status: string) =>
      (ACTIVE_APPLICATION_STATUSES as readonly string[]).includes(status);
    const isUpcomingRegistration = (row: RegistrationWithEvent) =>
      isActive(row.application.status) &&
      (row.event === null || isUpcoming(row.event.start_at));

    const upcomingRows = all.filter(isUpcomingRegistration).sort((a, b) =>
      new Date(a.event?.start_at ?? '9999-12-31').getTime() -
      new Date(b.event?.start_at ?? '9999-12-31').getTime(),
    );
    const cancelledRows = all.filter((row) => row.application.status === 'cancelled');
    const pastRows = all.filter(
      (row) => row.application.status !== 'cancelled' && !isUpcomingRegistration(row),
    );
    return { upcoming: upcomingRows, past: pastRows, cancelled: cancelledRows };
  }, [applicationsQuery.data, eventById]);

  const tabs: Array<{ key: TabKey; label: string; rows: RegistrationWithEvent[] }> = [
    { key: 'upcoming', label: 'Upcoming', rows: upcoming },
    { key: 'past', label: 'Past', rows: past },
    { key: 'cancelled', label: 'Cancelled', rows: cancelled },
  ];

  const activeTab = tabs.find((t) => t.key === tab) ?? tabs[0];

  const handleCancelConfirm = async () => {
    if (!cancelling) return;
    setActionError(null);
    try {
      await cancelMutation.mutate(cancelling.id);
      setCancelling(null);
      setSuccessMessage('Your registration has been cancelled.');
      refetchAll();
    } catch (mutationError) {
      setActionError(getErrorMessage(mutationError));
    }
  };

  return (
    <div>
      <PageHeader
        title="My events"
        description="Track your registrations, review past events, and manage your commitments."
      />

      {successMessage && (
        <Alert
          variant="success"
          onClose={() => setSuccessMessage(null)}
          className="mb-6"
        >
          {successMessage}
        </Alert>
      )}

      {actionError && (
        <Alert variant="error" onClose={() => setActionError(null)} className="mb-6">
          {actionError}
        </Alert>
      )}

      {loading && (
        <div className="grid gap-4 md:grid-cols-2">
          <SkeletonCard />
          <SkeletonCard />
        </div>
      )}

      {!loading && error && <ErrorState message={error?.message} onRetry={refetchAll} />}

      {!loading && !error && (
        <>
          <div
            role="tablist"
            aria-label="Filter registrations by period"
            className="mb-6 flex flex-wrap gap-2"
          >
            {tabs.map(({ key, label, rows }) => (
              <button
                key={key}
                role="tab"
                aria-selected={tab === key}
                onClick={() => setTab(key)}
                className={`rounded-full border px-4 py-1.5 text-small font-medium transition-colors ${
                  tab === key
                    ? 'border-brand-green bg-brand-green text-white'
                    : 'border-brand-border bg-brand-surface text-brand-text-secondary hover:border-brand-green hover:text-brand-green'
                }`}
              >
                {label} ({rows.length})
              </button>
            ))}
          </div>

          {activeTab.rows.length === 0 ? (
            <Card>
              <CardContent className="mt-0">
                <EmptyState
                  icon={CalendarDays}
                  title={
                    tab === 'upcoming'
                      ? 'No upcoming registrations'
                      : tab === 'past'
                        ? 'No past registrations yet'
                        : 'No cancelled registrations'
                  }
                  description={
                    tab === 'upcoming'
                      ? 'Find an event and sign up to see it here.'
                      : 'Your registration history will appear here.'
                  }
                  action={
                    tab === 'upcoming' ? (
                      <Link to={ROUTES.VOLUNTEER.DISCOVER}>
                        <Button>Discover events</Button>
                      </Link>
                    ) : undefined
                  }
                />
              </CardContent>
            </Card>
          ) : (
            <ul className="grid gap-4 md:grid-cols-2" aria-label={`${activeTab.label} registrations`}>
              {activeTab.rows.map(({ application, event }) => (
                <li key={application.id}>
                  {event ? (
                    <Card className="flex h-full flex-col">
                      <CardHeader
                        icon={CalendarDays}
                        action={<StatusBadge kind="application" status={application.status} />}
                      >
                        <CardTitle>
                          <Link
                            to={ROUTES.VOLUNTEER.EVENT_DETAILS(event.id)}
                            className="hover:text-brand-green-dark"
                          >
                            {event.title}
                          </Link>
                        </CardTitle>
                        <CardDescription>{formatDateTime(event.start_at)}</CardDescription>
                      </CardHeader>
                      <CardContent className="flex-1">
                        <p className="text-small text-brand-text-secondary flex items-center gap-1">
                          <MapPin className="h-4 w-4 shrink-0" aria-hidden="true" />
                          {event.venue}
                        </p>
                      </CardContent>
                      <CardFooter>
                        <Link
                          to={ROUTES.VOLUNTEER.EVENT_DETAILS(event.id)}
                          className="text-small font-medium text-brand-green hover:text-brand-green-dark"
                        >
                          View details
                        </Link>
                        {tab === 'upcoming' && (
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => {
                              setActionError(null);
                              setSuccessMessage(null);
                              setCancelling(application);
                            }}
                          >
                            Cancel registration
                          </Button>
                        )}
                      </CardFooter>
                    </Card>
                  ) : (
                    <Card className="h-full">
                      <CardHeader
                        icon={CalendarDays}
                        action={<StatusBadge kind="application" status={application.status} />}
                      >
                        <CardTitle>Event details unavailable</CardTitle>
                        <CardDescription>
                          This event is no longer publicly listed, but your registration still
                          stands.
                        </CardDescription>
                      </CardHeader>
                      {tab === 'upcoming' && (
                        <CardFooter>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => {
                              setActionError(null);
                              setSuccessMessage(null);
                              setCancelling(application);
                            }}
                          >
                            Cancel registration
                          </Button>
                        </CardFooter>
                      )}
                    </Card>
                  )}
                </li>
              ))}
            </ul>
          )}
        </>
      )}

      <Modal
        open={cancelling !== null}
        onClose={() => setCancelling(null)}
        title="Cancel this registration?"
        description={
          eventById.get(cancelling?.event_id ?? '')?.title ??
          'Your spot will be released for another volunteer.'
        }
        icon={CalendarDays}
        footer={
          <>
            <Button variant="secondary" onClick={() => setCancelling(null)}>
              Keep registration
            </Button>
            <Button
              variant="destructive"
              loading={cancelMutation.pending}
              onClick={handleCancelConfirm}
            >
              Cancel registration
            </Button>
          </>
        }
      >
        <p className="text-small text-brand-text-secondary">
          This cannot be undone. You can register again later if the event still has space.
        </p>
      </Modal>
    </div>
  );
}

export default MyEventsPage;
