import React, { useMemo, useState } from 'react';
import { ClipboardCheck } from 'lucide-react';
import { useApiMutation, useApiQuery } from '../../hooks/useApi';
import {
  getNgoEventParticipation,
  recordNgoParticipation,
  type ParticipationOutcomeInput,
} from '../../services/api/endpoints';
import { getErrorMessage } from '../../utils/format';
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

interface ParticipationPanelProps {
  ngoId: string;
  eventId: string;
}

type StatusChoice = 'attended' | 'late' | 'no_show' | 'cancelled' | '';

const STATUS_OPTIONS: Array<{ value: Exclude<StatusChoice, ''>; label: string }> = [
  { value: 'attended', label: 'Attended' },
  { value: 'late', label: 'Late' },
  { value: 'no_show', label: 'No-show' },
  { value: 'cancelled', label: 'Cancelled (volunteer)' },
];

const selectClass =
  'rounded-md border border-brand-border bg-white px-2 py-1 text-small text-brand-text focus:border-brand-teal focus:outline-none';

export function ParticipationPanel({ ngoId, eventId }: ParticipationPanelProps) {
  const query = useApiQuery((token) => getNgoEventParticipation(token, ngoId, eventId), [ngoId, eventId]);
  const mutation = useApiMutation(recordNgoParticipation);
  const [drafts, setDrafts] = useState<Record<string, StatusChoice>>({});
  const [source, setSource] = useState<Record<string, 'volunteer' | 'ngo' | 'event'>>({});
  const [notice, setNotice] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  const rows = useMemo(() => query.data?.volunteers ?? [], [query.data]);

  const currentChoice = (volunteerId: string, recorded: string | null): StatusChoice => {
    if (drafts[volunteerId] !== undefined) return drafts[volunteerId];
    return (recorded as StatusChoice | null) ?? '';
  };

  const save = async () => {
    setActionError(null);
    setNotice(null);
    const outcomes: ParticipationOutcomeInput[] = [];
    for (const row of rows) {
      const choice = currentChoice(row.volunteer_id, row.participation?.status ?? null);
      if (!choice) continue;
      if (choice === 'cancelled') {
        outcomes.push({
          volunteer_id: row.volunteer_id,
          status: 'cancelled',
          cancellation_source: source[row.volunteer_id] ?? row.participation?.cancellation_source ?? 'volunteer',
        });
      } else {
        outcomes.push({ volunteer_id: row.volunteer_id, status: choice });
      }
    }
    if (outcomes.length === 0) {
      setActionError('Record at least one outcome before saving.');
      return;
    }
    try {
      await mutation.mutate(ngoId, eventId, outcomes);
      setNotice('Participation outcomes saved.');
      setDrafts({});
      query.refetch();
    } catch (error) {
      setActionError(getErrorMessage(error));
    }
  };

  return (
    <Card>
      <CardHeader icon={ClipboardCheck}>
        <CardTitle as="h2">Participation</CardTitle>
        <CardDescription>
          Record what actually happened — accepted registrations alone never count as attendance.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {notice && (
          <Alert variant="success" onClose={() => setNotice(null)} className="mb-4">
            {notice}
          </Alert>
        )}
        {actionError && (
          <Alert variant="error" onClose={() => setActionError(null)} className="mb-4">
            {actionError}
          </Alert>
        )}

        {query.loading && <SkeletonCard lines={4} />}
        {!query.loading && query.error && <Alert variant="error">{query.error.message}</Alert>}
        {!query.loading && !query.error && rows.length === 0 && (
          <EmptyState
            icon={ClipboardCheck}
            title="No accepted volunteers yet"
            description="Accepted volunteers appear here so you can record their participation."
          />
        )}

        {!query.loading && !query.error && rows.length > 0 && (
          <>
            <ul className="divide-y divide-brand-border">
              {rows.map((row) => {
                const choice = currentChoice(row.volunteer_id, row.participation?.status ?? null);
                return (
                  <li key={row.volunteer_id} className="flex flex-wrap items-center justify-between gap-3 py-3 first:pt-0">
                    <div className="min-w-0">
                      <p className="text-small font-medium text-brand-text">
                        {row.volunteer?.name ?? `Volunteer ${row.volunteer_id.slice(0, 8)}`}
                      </p>
                      <p className="text-caption text-brand-text-muted">
                        {row.status === 'cancelled' ? 'Application cancelled' : 'Accepted'}
                        {row.participation
                          ? ` · recorded: ${row.participation.status}${
                              row.participation.cancellation_source
                                ? ` (${row.participation.cancellation_source})`
                                : ''
                            }`
                          : ' · not recorded yet'}
                      </p>
                    </div>
                    <div className="flex shrink-0 items-center gap-2">
                      {choice === 'cancelled' && (
                        <select
                          aria-label="Cancellation source"
                          className={selectClass}
                          value={source[row.volunteer_id] ?? row.participation?.cancellation_source ?? 'volunteer'}
                          onChange={(event) =>
                            setSource((prev) => ({
                              ...prev,
                              [row.volunteer_id]: event.target.value as 'volunteer' | 'ngo' | 'event',
                            }))
                          }
                        >
                          <option value="volunteer">Volunteer cancelled</option>
                          <option value="ngo">NGO cancelled</option>
                          <option value="event">Event cancelled</option>
                        </select>
                      )}
                      <select
                        aria-label={`Status for ${row.volunteer?.name ?? row.volunteer_id}`}
                        className={selectClass}
                        value={choice}
                        onChange={(event) =>
                          setDrafts((prev) => ({ ...prev, [row.volunteer_id]: event.target.value as StatusChoice }))
                        }
                      >
                        <option value="">Select status…</option>
                        {STATUS_OPTIONS.map((option) => (
                          <option key={option.value} value={option.value}>
                            {option.label}
                          </option>
                        ))}
                      </select>
                    </div>
                  </li>
                );
              })}
            </ul>
            <div className="mt-4 flex justify-end">
              <Button loading={mutation.pending} onClick={() => void save()}>
                Save
              </Button>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}

export default ParticipationPanel;
