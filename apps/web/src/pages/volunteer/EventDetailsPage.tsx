import React, { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import {
  AlertCircle,
  CalendarDays,
  Clock,
  MapPin,
  Users,
} from 'lucide-react';
import { useApiMutation, useApiQuery } from '../../hooks/useApi';
import { ROUTES } from '../../routes';
import {
  createApplication,
  cancelMyApplication,
  getMyVolunteerProfile,
  getNgoPublicProfile,
  getPublicEvent,
  listMyApplications,
  type ApplicationRow,
  type NgoPublicProfile,
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
  ErrorState,
  Modal,
  SkeletonCard,
} from '../../components/ui';
import { StatusBadge } from '../../components/shared';

const ACTIVE_APPLICATION_STATUSES = ['interested', 'accepted', 'waitlisted'] as const;

function NgoName({ ngoId }: { ngoId: string }) {
  const { data } = useApiQuery<NgoPublicProfile>((token) => getNgoPublicProfile(token, ngoId), [
    ngoId,
  ]);
  if (!data) return null;
  return <span>{data.name}</span>;
}

function registrationErrorMessage(error: unknown): string {
  if (error instanceof Error && 'code' in error) {
    const code = (error as { code: string }).code;
    if (code === 'EVENT_CAPACITY_REACHED') return 'This event is currently full.';
    if (code === 'DUPLICATE_RECORD') return 'You already have a registration for this event.';
    if (code === 'PROFILE_REQUIRED') {
      return 'Create your volunteer profile before registering.';
    }
  }
  return getErrorMessage(error);
}

export function VolunteerEventDetailsPage() {
  const { eventId } = useParams<{ eventId: string }>();

  const eventQuery = useApiQuery(
    (token) => (eventId ? getPublicEvent(token, eventId) : Promise.reject(new Error('Missing event id'))),
    [eventId],
  );
  const applicationsQuery = useApiQuery(listMyApplications);
  const profileQuery = useApiQuery(getMyVolunteerProfile);

  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [confirmingCancel, setConfirmingCancel] = useState(false);

  const registerMutation = useApiMutation(createApplication);
  const cancelMutation = useApiMutation(cancelMyApplication);

  if (eventQuery.loading) {
    return (
      <div className="grid gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <SkeletonCard lines={5} />
        </div>
        <SkeletonCard lines={4} />
      </div>
    );
  }

  if (eventQuery.error) {
    const notFound = eventQuery.error instanceof Error && 'status' in eventQuery.error
      ? (eventQuery.error as { status: number }).status === 404
      : false;
    return (
      <ErrorState
        title={notFound ? 'Event not found' : undefined}
        message={
          notFound
            ? 'This event could not be found or is not publicly visible.'
            : eventQuery.error?.message
        }
        onRetry={eventQuery.refetch}
      />
    );
  }

  const event = eventQuery.data;
  if (!event) return null;

  const myApplications = (applicationsQuery.data ?? []).filter(
    (application: ApplicationRow) => application.event_id === event.id,
  );
  const activeApplication = myApplications.find((application) =>
    (ACTIVE_APPLICATION_STATUSES as readonly string[]).includes(application.status),
  );
  const hasCancelledBefore = myApplications.some(
    (application) => application.status === 'cancelled',
  );

  const eventHasStarted = !isUpcoming(event.start_at);
  const profileMissing =
    !profileQuery.loading && !profileQuery.error && profileQuery.data === null;

  const handleRegister = async () => {
    setActionError(null);
    setSuccessMessage(null);
    try {
      await registerMutation.mutate(event.id);
      setSuccessMessage(
        event.registration_mode === 'open'
          ? "You're registered for this event."
          : 'Your request has been sent — the organizer will review it.',
      );
      applicationsQuery.refetch();
    } catch (registerError) {
      setActionError(registrationErrorMessage(registerError));
    }
  };

  const handleCancel = async () => {
    if (!activeApplication) return;
    setActionError(null);
    try {
      await cancelMutation.mutate(activeApplication.id);
      setConfirmingCancel(false);
      setSuccessMessage('Your registration has been cancelled.');
      applicationsQuery.refetch();
    } catch (cancelError) {
      setActionError(getErrorMessage(cancelError));
    }
  };

  return (
    <div>
      <Link
        to={ROUTES.VOLUNTEER.DISCOVER}
        className="text-small font-medium text-brand-green hover:text-brand-green-dark"
      >
        ← Back to discover
      </Link>

      <div className="mt-4 grid gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2 space-y-6">
          <Card>
            <CardHeader icon={CalendarDays} action={<StatusBadge kind="event" status={event.status} />}>
              <CardTitle as="h1">{event.title}</CardTitle>
              <CardDescription>
                Hosted by{' '}
                {event.ngo_id ? <NgoName ngoId={event.ngo_id} /> : <span>an organization</span>}
              </CardDescription>
            </CardHeader>
            <CardContent>
              <p className="text-body text-brand-text-secondary whitespace-pre-line">
                {event.description}
              </p>
              <dl className="mt-6 grid gap-4 sm:grid-cols-2">
                <div>
                  <dt className="text-small font-medium text-brand-text-secondary flex items-center gap-1">
                    <Clock className="h-4 w-4" aria-hidden="true" /> Schedule
                  </dt>
                  <dd className="text-small text-brand-text mt-1">
                    {formatDateTime(event.start_at)} – {formatDateTime(event.end_at)}
                  </dd>
                </div>
                <div>
                  <dt className="text-small font-medium text-brand-text-secondary flex items-center gap-1">
                    <MapPin className="h-4 w-4" aria-hidden="true" /> Venue
                  </dt>
                  <dd className="text-small text-brand-text mt-1">{event.venue}</dd>
                </div>
                <div>
                  <dt className="text-small font-medium text-brand-text-secondary flex items-center gap-1">
                    <Users className="h-4 w-4" aria-hidden="true" /> Capacity
                  </dt>
                  <dd className="text-small text-brand-text mt-1">
                    {event.accepted_count} / {event.capacity} volunteers confirmed
                  </dd>
                </div>
                <div>
                  <dt className="text-small font-medium text-brand-text-secondary">Cause</dt>
                  <dd className="text-small text-brand-text mt-1">{event.cause}</dd>
                </div>
              </dl>
            </CardContent>
          </Card>
        </div>

        <div className="space-y-4">
          {successMessage && (
            <Alert variant="success" onClose={() => setSuccessMessage(null)}>
              {successMessage}
            </Alert>
          )}
          {actionError && (
            <Alert variant="error" onClose={() => setActionError(null)}>
              {actionError}
            </Alert>
          )}

          <Card>
            <CardHeader icon={Users}>
              <CardTitle as="h2">Registration</CardTitle>
            </CardHeader>
            <CardContent>
              {applicationsQuery.loading || applicationsQuery.error ? null : activeApplication ? (
                <div className="space-y-3">
                  <StatusBadge kind="application" status={activeApplication.status} />
                  <p className="text-small text-brand-text-secondary">
                    {activeApplication.status === 'accepted' &&
                      "You're confirmed for this event. See you there!"}
                    {activeApplication.status === 'interested' &&
                      'Request pending — the organizer will review your request.'}
                    {activeApplication.status === 'waitlisted' &&
                      "You're on the waitlist. We'll notify you if a spot opens up."}
                  </p>
                </div>
              ) : profileMissing ? (
                <div className="space-y-3">
                  <Alert variant="info">Create your volunteer profile before registering.</Alert>
                  <Link to={ROUTES.VOLUNTEER.PROFILE}>
                    <Button fullWidth>Create profile</Button>
                  </Link>
                </div>
              ) : eventHasStarted ? (
                <Alert variant="info">This event has already taken place.</Alert>
              ) : (
                <div className="space-y-3">
                  <p className="text-small text-brand-text-secondary">
                    {event.registration_mode === 'open'
                      ? 'Registering confirms your spot instantly.'
                      : 'This event requires organizer approval. Your registration will be reviewed.'}
                  </p>
                  <Button
                    fullWidth
                    loading={registerMutation.pending}
                    onClick={handleRegister}
                  >
                    {hasCancelledBefore ? 'Register again' : 'Register for this event'}
                  </Button>
                </div>
              )}
            </CardContent>
            {activeApplication && !eventHasStarted && (
              <CardFooter>
                <Button
                  variant="ghost"
                  size="sm"
                  loading={cancelMutation.pending}
                  onClick={() => {
                    setActionError(null);
                    setSuccessMessage(null);
                    setConfirmingCancel(true);
                  }}
                >
                  Cancel registration
                </Button>
              </CardFooter>
            )}
          </Card>

          <Card>
            <CardContent className="mt-0">
              <p className="text-small text-brand-text-secondary flex items-start gap-2">
                <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" aria-hidden="true" />
                Can't make it? Cancel your registration so another volunteer can take your spot.
              </p>
              <Link
                to={ROUTES.VOLUNTEER.EVENTS}
                className="mt-3 inline-block text-small font-medium text-brand-green hover:text-brand-green-dark"
              >
                View my events
              </Link>
            </CardContent>
          </Card>
        </div>
      </div>

      <Modal
        open={confirmingCancel}
        onClose={() => setConfirmingCancel(false)}
        title="Cancel this registration?"
        description={event.title}
        icon={CalendarDays}
        footer={
          <>
            <Button variant="secondary" onClick={() => setConfirmingCancel(false)}>
              Keep registration
            </Button>
            <Button
              variant="destructive"
              loading={cancelMutation.pending}
              onClick={handleCancel}
            >
              Cancel registration
            </Button>
          </>
        }
      >
        <p className="text-small text-brand-text-secondary">
          Your spot will be released for another volunteer.
        </p>
      </Modal>
    </div>
  );
}

export default VolunteerEventDetailsPage;
