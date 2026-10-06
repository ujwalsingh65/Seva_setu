import React, { useMemo, useState } from 'react';
import { ClipboardList } from 'lucide-react';
import { useApiMutation, useApiQuery } from '../../hooks/useApi';
import {
  decideNgoApplication,
  listNgoApplications,
  type ApplicationRow,
} from '../../services/api/endpoints';
import { formatDateTime, getErrorMessage } from '../../utils/format';
import {
  Alert,
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  EmptyState,
  SkeletonCard,
} from '../../components/ui';
import { StatusBadge } from '../../components/shared';

const STATUS_ORDER: Record<string, number> = {
  interested: 0,
  waitlisted: 1,
  accepted: 2,
  rejected: 3,
  cancelled: 4,
};

interface RegistrationsPanelProps {
  ngoId: string;
  eventId: string;
  registrationMode: string;
  onDecided?: () => void;
}

export function RegistrationsPanel({ ngoId, eventId, registrationMode, onDecided }: RegistrationsPanelProps) {
  const query = useApiQuery((token) => listNgoApplications(token, ngoId), [ngoId]);
  const decideMutation = useApiMutation(decideNgoApplication);
  const [actionError, setActionError] = useState<string | null>(null);

  const rows = useMemo(
    () =>
      (query.data ?? [])
        .filter((application) => application.event_id === eventId)
        .sort(
          (a, b) =>
            (STATUS_ORDER[a.status] ?? 9) - (STATUS_ORDER[b.status] ?? 9) ||
            a.created_at.localeCompare(b.created_at),
        ),
    [query.data, eventId],
  );

  const pendingCount = rows.filter((row) => row.status === 'interested').length;
  const reviewable = registrationMode === 'approval_required';

  const decide = async (application: ApplicationRow, status: 'accepted' | 'waitlisted' | 'rejected') => {
    setActionError(null);
    try {
      await decideMutation.mutate(ngoId, application.id, status);
      query.refetch();
      onDecided?.();
    } catch (decisionError) {
      setActionError(getErrorMessage(decisionError));
    }
  };

  return (
    <Card>
      <CardHeader icon={ClipboardList}>
        <CardTitle as="h2">Registrations</CardTitle>
        <CardDescription>
          {reviewable
            ? `${pendingCount} request${pendingCount === 1 ? '' : 's'} awaiting review.`
            : 'This event confirms registrations instantly.'}
        </CardDescription>
      </CardHeader>
      <CardContent>
        {actionError && (
          <Alert variant="error" onClose={() => setActionError(null)} className="mb-4">
            {actionError}
          </Alert>
        )}

        {query.loading && <SkeletonCard lines={4} />}

        {!query.loading && query.error && (
          <Alert variant="error">{query.error?.message}</Alert>
        )}

        {!query.loading && !query.error && rows.length === 0 && (
          <EmptyState
            icon={ClipboardList}
            title="No registrations yet"
            description={
              reviewable
                ? 'When volunteers request to join, they appear here for review.'
                : 'When volunteers register, they appear here.'
            }
          />
        )}

        {!query.loading && !query.error && rows.length > 0 && (
          <ul className="divide-y divide-brand-border">
            {rows.map((row) => (
              <li key={row.id} className="flex flex-wrap items-center justify-between gap-3 py-3 first:pt-0 last:pb-0">
                <div className="min-w-0">
                  <p className="text-small font-medium text-brand-text">
                    {row.volunteer?.name ?? `Volunteer ${row.volunteer_id.slice(0, 8)}`}
                  </p>
                  {row.volunteer?.causes?.length ? (
                    <p className="text-caption text-brand-text-muted">
                      Causes: {row.volunteer.causes.join(', ')}
                    </p>
                  ) : null}
                  <p className="text-caption text-brand-text-muted">
                    Registered {formatDateTime(row.created_at)}
                  </p>
                </div>
                <div className="flex shrink-0 flex-wrap items-center gap-2">
                  <StatusBadge kind="application" status={row.status} />
                  {reviewable && (row.status === 'interested' || row.status === 'waitlisted') && (
                    <>
                      {row.status === 'interested' && (
                        <Button
                          size="sm"
                          variant="secondary"
                          loading={decideMutation.pending}
                          onClick={() => void decide(row, 'waitlisted')}
                        >
                          Waitlist
                        </Button>
                      )}
                      <Button
                        size="sm"
                        loading={decideMutation.pending}
                        onClick={() => void decide(row, 'accepted')}
                      >
                        Accept
                      </Button>
                      <Button
                        size="sm"
                        variant="destructive"
                        loading={decideMutation.pending}
                        onClick={() => void decide(row, 'rejected')}
                      >
                        Reject
                      </Button>
                    </>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}

export default RegistrationsPanel;
