import React, { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { CalendarDays, ClipboardList, Compass, MapPin, Sparkles, UserRound } from 'lucide-react';
import { useApiQuery } from '../../hooks/useApi';
import { ROUTES } from '../../routes';
import {
  getMySchedule,
  getMyVolunteerProfile,
  listMyApplications,
  listPublicEvents,
  type ApplicationRow,
  type EventRow,
} from '../../services/api/endpoints';
import { formatDateTime, isUpcoming } from '../../utils/format';
import {
  Badge,
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
import { ReliabilitySection } from '../../components/volunteer';

const ACTIVE_APPLICATION_STATUSES = ['interested', 'accepted', 'waitlisted'] as const;

interface RegistrationWithEvent {
  application: ApplicationRow;
  event: EventRow | null;
}

export function VolunteerDashboardPage() {
  const profile = useApiQuery(getMyVolunteerProfile);
  const events = useApiQuery(listPublicEvents);
  const applications = useApiQuery(listMyApplications);
  const schedule = useApiQuery(getMySchedule);

  const loading = profile.loading || events.loading || applications.loading || schedule.loading;
  const error = profile.error ?? events.error ?? applications.error ?? schedule.error;

  const refetchAll = () => {
    profile.refetch();
    events.refetch();
    applications.refetch();
    schedule.refetch();
  };

  const eventById = useMemo(
    () => new Map((events.data ?? []).map((event) => [event.id, event])),
    [events.data],
  );

  const upcoming = useMemo<RegistrationWithEvent[]>(() => {
    const all = applications.data ?? [];
    return all
      .filter((application) =>
        (ACTIVE_APPLICATION_STATUSES as readonly string[]).includes(application.status),
      )
      .map((application) => ({
        application,
        event: eventById.get(application.event_id) ?? null,
      }))
      .filter(({ event }) => event === null || isUpcoming(event.start_at))
      .sort(
        (a, b) =>
          new Date(a.event?.start_at ?? '9999-12-31').getTime() -
          new Date(b.event?.start_at ?? '9999-12-31').getTime(),
      );
  }, [applications.data, eventById]);

  if (loading) {
    return (
      <div>
        <Skeleton variant="text" className="h-8 w-72 mb-2" />
        <Skeleton variant="text" className="h-4 w-96 mb-6" />
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

  const profileMissing = profile.data === null;

  return (
    <div>
      <PageHeader
        title="Volunteer Dashboard"
        description={`Welcome back${profile.data ? `, ${profile.data.name}` : ''}. Here's where you can make an impact.`}
      />

      {!profileMissing && upcoming.length === 0 && (
        <Card className="mb-6 border-brand-mint bg-brand-mint/40">
          <CardContent className="mt-0 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="font-medium text-brand-green-dark">Ready to help?</p>
              <p className="text-small text-brand-text-secondary">
                You have no upcoming registrations. Browse public events and sign up for one.
              </p>
            </div>
            <Link to={ROUTES.VOLUNTEER.DISCOVER}>
              <Button leadingIcon={Compass}>Explore events</Button>
            </Link>
          </CardContent>
        </Card>
      )}

      {profileMissing && (
        <Card className="mb-6 border-brand-mint bg-brand-mint/40">
          <CardContent className="mt-0 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="font-medium text-brand-green-dark">Finish setting up your profile</p>
              <p className="text-small text-brand-text-secondary">
                Add your skills, availability, and location so organizers can plan around you.
              </p>
            </div>
            <Link to={ROUTES.VOLUNTEER.PROFILE}>
              <Button leadingIcon={UserRound}>Create profile</Button>
            </Link>
          </CardContent>
        </Card>
      )}

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        <Card>
          <CardHeader icon={CalendarDays} />
          <CardContent>
            <p className="text-h2 text-brand-teal">{upcoming.length}</p>
            <CardDescription>Upcoming registrations</CardDescription>
          </CardContent>
        </Card>
        <Card>
          <CardHeader icon={ClipboardList} />
          <CardContent>
            <p className="text-h2 text-brand-teal">{applications.data?.length ?? 0}</p>
            <CardDescription>Total registrations</CardDescription>
          </CardContent>
        </Card>
        <Card>
          <CardHeader icon={Sparkles} />
          <CardContent>
            <p className="font-medium text-brand-text-secondary">Impact insights</p>
            <CardDescription>
              Service hours and karma are planned for a later step. Your reliability record is
              below.
            </CardDescription>
          </CardContent>
        </Card>
      </div>

      {!profileMissing && (
        <section className="mt-8" aria-labelledby="my-reliability-heading">
          <h2 id="my-reliability-heading" className="sr-only">
            My Reliability
          </h2>
          <ReliabilitySection />
        </section>
      )}

      {!profileMissing && (schedule.data?.length ?? 0) > 0 && (
        <section className="mt-8" aria-labelledby="my-shifts-heading">
          <h2 id="my-shifts-heading" className="mb-4 text-h3 text-brand-teal">
            My assigned shifts
          </h2>
          <ul className="grid gap-4 md:grid-cols-2">
            {(schedule.data ?? []).slice(0, 6).map((row) => (
              <li key={row.assignment_id}>
                <Card>
                  <CardHeader icon={CalendarDays} action={
                    <Badge variant={row.status === 'confirmed' ? 'success' : 'info'} size="sm" dot>
                      {row.status === 'confirmed' ? 'Confirmed' : 'Draft'}
                    </Badge>
                  }>
                    <CardTitle>{row.event.title}</CardTitle>
                    <CardDescription>{formatDateTime(row.shift_start)} – {formatDateTime(row.shift_end)}</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <p className="text-small text-brand-text-secondary">
                      {row.role ? `Role: ${row.role}` : 'Role pending'} · {row.status === 'confirmed' ? 'Confirmed' : 'Awaiting confirmation'}
                    </p>
                  </CardContent>
                </Card>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className="mt-8" aria-labelledby="upcoming-registrations-heading">
        <div className="flex items-center justify-between mb-4">
          <h2 id="upcoming-registrations-heading" className="text-h3 text-brand-teal">
            Upcoming registrations
          </h2>
          <Link
            to={ROUTES.VOLUNTEER.EVENTS}
            className="text-small font-medium text-brand-green hover:text-brand-green-dark"
          >
            View all
          </Link>
        </div>

        {upcoming.length === 0 ? (
          <Card>
            <CardContent className="mt-0">
              <EmptyState
                icon={CalendarDays}
                title="Nothing scheduled yet"
                description="Events you register for will appear here."
                action={
                  <Link to={ROUTES.VOLUNTEER.DISCOVER}>
                    <Button leadingIcon={Compass}>Discover events</Button>
                  </Link>
                }
              />
            </CardContent>
          </Card>
        ) : (
          <ul className="grid gap-4 md:grid-cols-2">
            {upcoming.slice(0, 5).map(({ application, event }) => (
              <li key={application.id}>
                {event ? (
                  <Link to={ROUTES.VOLUNTEER.EVENT_DETAILS(event.id)} className="block h-full">
                    <Card hoverable className="h-full">
                      <CardHeader
                        icon={CalendarDays}
                        action={<StatusBadge kind="application" status={application.status} />}
                      >
                        <CardTitle>{event.title}</CardTitle>
                        <CardDescription>{formatDateTime(event.start_at)}</CardDescription>
                      </CardHeader>
                      <CardContent>
                        <p className="text-small text-brand-text-secondary flex items-center gap-1">
                          <MapPin className="h-4 w-4 shrink-0" aria-hidden="true" />
                          {event.venue}
                        </p>
                      </CardContent>
                    </Card>
                  </Link>
                ) : (
                  <Card className="h-full">
                    <CardHeader
                      icon={CalendarDays}
                      action={<StatusBadge kind="application" status={application.status} />}
                    >
                      <CardTitle>Event details unavailable</CardTitle>
                      <CardDescription>
                        This event is no longer publicly listed, but your registration still stands.
                      </CardDescription>
                    </CardHeader>
                  </Card>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

export default VolunteerDashboardPage;
export { VolunteerDashboardPage as VolunteerDashboard };
