import React, { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, CalendarDays, CheckCircle2, PlayCircle, Trash2, XCircle } from 'lucide-react';
import { useApiMutation, useApiQuery } from '../../hooks/useApi';
import { ROUTES } from '../../routes';
import { deleteNgoEvent, listNgoEvents, updateNgoEvent } from '../../services/api/endpoints';
import { formatDate, formatDateTime, formatTime, getErrorMessage } from '../../utils/format';
import {
  Alert,
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  ErrorState,
  Modal,
  Skeleton,
} from '../../components/ui';
import { PageHeader, StatusBadge } from '../../components/shared';
import { EventForm, NgoGate, RegistrationsPanel } from '../../components/ngo';

const LIFECYCLE_SUCCESS: Record<string, string> = {
  published: 'Event published — volunteers can now discover and register for it.',
  in_progress: 'Event marked as in progress.',
  completed: 'Event marked as completed. Thank you for running it!',
  cancelled: 'Event cancelled. It is no longer visible to volunteers.',
};

function EventDetailsContent({ ngoId, eventId }: { ngoId: string; eventId: string }) {
  const navigate = useNavigate();
  const events = useApiQuery((token) => listNgoEvents(token, ngoId), [ngoId]);
  const event = events.data?.find((row) => row.id === eventId) ?? null;

  const updateMutation = useApiMutation(updateNgoEvent);
  const deleteMutation = useApiMutation(deleteNgoEvent);

  const [editing, setEditing] = useState(false);
  const [confirmCancel, setConfirmCancel] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  if (events.loading) {
    return (
      <div>
        <Skeleton variant="text" className="mb-2 h-8 w-72" />
        <Skeleton variant="text" className="mb-6 h-4 w-96" />
        <Skeleton variant="rectangular" className="h-40 w-full" />
      </div>
    );
  }

  if (events.error) {
    return <ErrorState message={events.error?.message} onRetry={events.refetch} />;
  }

  if (!event) {
    return (
      <ErrorState
        title="Event not found"
        message="This event doesn't exist or isn't part of your organization."
      />
    );
  }

  const changeStatus = async (status: string) => {
    setActionError(null);
    try {
      await updateMutation.mutate(ngoId, eventId, { status });
      setNotice(LIFECYCLE_SUCCESS[status] ?? 'Event updated.');
      events.refetch();
    } catch (statusError) {
      setActionError(getErrorMessage(statusError));
    }
  };

  const handleDelete = async () => {
    setActionError(null);
    try {
      await deleteMutation.mutate(ngoId, eventId);
      navigate(ROUTES.NGO.EVENTS);
    } catch (deleteError) {
      setConfirmDelete(false);
      setActionError(getErrorMessage(deleteError));
    }
  };

  const isDraft = event.status === 'draft';
  const isPublished = event.status === 'published';
  const isInProgress = event.status === 'in_progress';
  const isClosed = event.status === 'completed' || event.status === 'cancelled';

  return (
    <div>
      <Link
        to={ROUTES.NGO.EVENTS}
        className="mb-4 inline-flex items-center gap-1 text-small font-medium text-brand-text-secondary hover:text-brand-teal"
      >
        <ArrowLeft className="h-4 w-4" aria-hidden="true" />
        Back to events
      </Link>

      {editing ? (
        <div className="mx-auto max-w-3xl">
          <PageHeader title="Edit event" description={event.title} />
          <EventForm
            ngoId={ngoId}
            initial={event}
            onSaved={() => {
              setEditing(false);
              setNotice('Event updated.');
              events.refetch();
            }}
            onCancel={() => setEditing(false)}
          />
        </div>
      ) : (
        <>
          <PageHeader
            title={event.title}
            description={`${formatDateTime(event.start_at)} · ${event.venue}`}
            actions={
              <>
                <Button variant="secondary" onClick={() => setEditing(true)}>
                  Edit
                </Button>
                {isDraft && (
                  <Button
                    leadingIcon={CheckCircle2}
                    loading={updateMutation.pending}
                    onClick={() => void changeStatus('published')}
                  >
                    Publish
                  </Button>
                )}
                {isPublished && (
                  <>
                    <Button
                      variant="secondary"
                      leadingIcon={PlayCircle}
                      loading={updateMutation.pending}
                      onClick={() => void changeStatus('in_progress')}
                    >
                      Mark in progress
                    </Button>
                    <Button
                      variant="destructive"
                      loading={updateMutation.pending}
                      onClick={() => setConfirmCancel(true)}
                    >
                      Cancel event
                    </Button>
                  </>
                )}
                {isInProgress && (
                  <Button
                    leadingIcon={CheckCircle2}
                    loading={updateMutation.pending}
                    onClick={() => void changeStatus('completed')}
                  >
                    Mark completed
                  </Button>
                )}
              </>
            }
          />

          {notice && (
            <Alert variant="success" onClose={() => setNotice(null)} className="mb-6">
              {notice}
            </Alert>
          )}

          {actionError && (
            <Alert variant="error" onClose={() => setActionError(null)} className="mb-6">
              {actionError}
            </Alert>
          )}

          {isClosed && (
            <Alert variant="warning" className="mb-6" title={`This event is ${event.status.replace('_', ' ')}.`}>
              {event.status === 'cancelled'
                ? 'Volunteers can no longer register for it.'
                : 'No further lifecycle changes are available.'}
            </Alert>
          )}

          <div className="grid gap-6 lg:grid-cols-3">
            <div className="lg:col-span-2 space-y-6">
              <Card>
                <CardHeader icon={CalendarDays} action={<StatusBadge kind="event" status={event.status} />}>
                  <CardTitle as="h2">Event details</CardTitle>
                </CardHeader>
                <CardContent>
                  <dl className="grid gap-x-6 gap-y-4 sm:grid-cols-2">
                    <div>
                      <dt className="text-caption font-medium text-brand-text-muted">Schedule</dt>
                      <dd className="mt-0.5 text-small text-brand-text">
                        {formatDate(event.start_at)} · {formatTime(event.start_at)} – {formatTime(event.end_at)}
                      </dd>
                    </div>
                    <div>
                      <dt className="text-caption font-medium text-brand-text-muted">Venue</dt>
                      <dd className="mt-0.5 text-small text-brand-text">{event.venue}</dd>
                    </div>
                    <div>
                      <dt className="text-caption font-medium text-brand-text-muted">Capacity</dt>
                      <dd className="mt-0.5 text-small text-brand-text">
                        {event.capacity} volunteer{event.capacity === 1 ? '' : 's'}
                      </dd>
                    </div>
                    <div>
                      <dt className="text-caption font-medium text-brand-text-muted">Cause</dt>
                      <dd className="mt-0.5 text-small text-brand-text">{event.cause}</dd>
                    </div>
                    <div>
                      <dt className="text-caption font-medium text-brand-text-muted">Visibility</dt>
                      <dd className="mt-0.5 text-small text-brand-text">
                        {event.visibility === 'public' ? 'Public' : 'Organization only'}
                      </dd>
                    </div>
                    <div>
                      <dt className="text-caption font-medium text-brand-text-muted">Registration</dt>
                      <dd className="mt-0.5 text-small text-brand-text">
                        {event.registration_mode === 'open'
                          ? 'Open — instant confirmation'
                          : 'Approval required'}
                      </dd>
                    </div>
                  </dl>
                  <div className="mt-6">
                    <p className="text-caption font-medium text-brand-text-muted">Description</p>
                    <p className="mt-1 whitespace-pre-line text-small text-brand-text">
                      {event.description}
                    </p>
                  </div>
                </CardContent>
              </Card>

              <RegistrationsPanel
                ngoId={ngoId}
                eventId={eventId}
                registrationMode={event.registration_mode}
                onDecided={events.refetch}
              />
            </div>

            <div className="space-y-6">
              <Card>
                <CardHeader>
                  <CardTitle as="h2">Danger zone</CardTitle>
                  <CardDescription>
                    Events with registrations can't be deleted — cancel them instead to keep records.
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <Button
                    variant="destructive"
                    leadingIcon={Trash2}
                    onClick={() => setConfirmDelete(true)}
                  >
                    Delete event
                  </Button>
                </CardContent>
              </Card>
            </div>
          </div>

          <Modal
            open={confirmCancel}
            onClose={() => setConfirmCancel(false)}
            title="Cancel this event?"
            description="Volunteers will no longer be able to register, and existing registrations are kept on record."
            icon={XCircle}
            footer={
              <>
                <Button variant="ghost" onClick={() => setConfirmCancel(false)}>
                  Keep event
                </Button>
                <Button
                  variant="destructive"
                  loading={updateMutation.pending}
                  onClick={() => void changeStatus('cancelled').then(() => setConfirmCancel(false))}
                >
                  Cancel event
                </Button>
              </>
            }
          >
            <p className="text-small text-brand-text-secondary">
              The event status changes to <strong>cancelled</strong>. You can't un-cancel it from this
              page, but you can still view registrations.
            </p>
          </Modal>

          <Modal
            open={confirmDelete}
            onClose={() => setConfirmDelete(false)}
            title="Delete this event?"
            description="This permanently removes the event. Events that already have registrations can't be deleted."
            icon={Trash2}
            footer={
              <>
                <Button variant="ghost" onClick={() => setConfirmDelete(false)}>
                  Keep event
                </Button>
                <Button variant="destructive" loading={deleteMutation.pending} onClick={() => void handleDelete()}>
                  Delete permanently
                </Button>
              </>
            }
          >
            <p className="text-small text-brand-text-secondary">
              If you only want to stop registrations, cancel the event instead — cancellation keeps
              the records.
            </p>
          </Modal>
        </>
      )}
    </div>
  );
}

export function NgoEventDetailsPage() {
  const { eventId } = useParams<{ eventId: string }>();

  if (!eventId) {
    return <ErrorState title="Event not found" message="No event was specified." />;
  }

  return <NgoGate>{(ngo) => <EventDetailsContent ngoId={ngo.ngo_id} eventId={eventId} />}</NgoGate>;
}

export default NgoEventDetailsPage;
