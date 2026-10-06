import React, { useState } from 'react';
import { AlertTriangle, Zap } from 'lucide-react';
import { useApiMutation, useApiQuery, useMyNgo } from '../../hooks/useApi';
import {
  cancelEmergency,
  createNgoEmergency,
  listNgoEmergencies,
  mobilizeEmergency,
  type NgoEmergencyRow,
} from '../../services/api/endpoints';
import { formatDateTime, getErrorMessage } from '../../utils/format';
import {
  Alert,
  Badge,
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  EmptyState,
  ErrorState,
  Input,
  SkeletonCard,
} from '../../components/ui';
import { PageHeader } from '../../components/shared';

function EmergencyCard({
  ngoId,
  emergency,
  onChanged,
}: {
  ngoId: string;
  emergency: NgoEmergencyRow;
  onChanged: () => void;
}) {
  const mobilizeMutation = useApiMutation(mobilizeEmergency);
  const cancelMutation = useApiMutation(cancelEmergency);
  const [message, setMessage] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  const mobilize = async () => {
    setActionError(null);
    try {
      const result = await mobilizeMutation.mutate(ngoId, emergency.id);
      setMessage(`Mobilized: ${result.primary_invitations} invitations created, ${result.backups} backups ranked.`);
      onChanged();
    } catch (error) {
      setActionError(getErrorMessage(error));
    }
  };

  const cancel = async () => {
    setActionError(null);
    try {
      await cancelMutation.mutate(ngoId, emergency.id);
      setMessage('Emergency cancelled.');
      onChanged();
    } catch (error) {
      setActionError(getErrorMessage(error));
    }
  };

  return (
    <Card>
      <CardHeader icon={AlertTriangle} action={<Badge variant={emergency.status === 'cancelled' ? 'neutral' : 'error'} size="sm" dot>{emergency.urgency ?? 'emergency'}</Badge>}>
        <CardTitle>{emergency.title}</CardTitle>
        <CardDescription>
          {formatDateTime(emergency.start_at)} – {formatDateTime(emergency.end_at)} · {emergency.venue}
        </CardDescription>
      </CardHeader>
      <CardContent>
        {message && <Alert variant="success" onClose={() => setMessage(null)} className="mb-3">{message}</Alert>}
        {actionError && <Alert variant="error" onClose={() => setActionError(null)} className="mb-3">{actionError}</Alert>}
        {emergency.response_deadline && (
          <p className="mb-3 text-caption text-brand-text-muted">Respond by {formatDateTime(emergency.response_deadline)}</p>
        )}
        <div className="flex flex-wrap gap-2">
          <Button leadingIcon={Zap} loading={mobilizeMutation.pending} onClick={() => void mobilize()}>
            Mobilize volunteers
          </Button>
          {emergency.status !== 'cancelled' && (
            <Button variant="destructive" loading={cancelMutation.pending} onClick={() => void cancel()}>
              Cancel emergency
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

export function NgoEmergencyPage() {
  const { primaryNgo, loading: ngoLoading } = useMyNgo();
  const ngoId = primaryNgo?.ngo_id ?? null;
  const listQuery = useApiQuery(
    (token) => (ngoId ? listNgoEmergencies(token, ngoId) : Promise.resolve([])),
    [ngoId],
  );
  const createMutation = useApiMutation(createNgoEmergency);
  const [error, setError] = useState<string | null>(null);
  const [title, setTitle] = useState('');
  const [venue, setVenue] = useState('');
  const [startAt, setStartAt] = useState('');
  const [endAt, setEndAt] = useState('');
  const [role, setRole] = useState('Volunteer');
  const [headcount, setHeadcount] = useState('1');
  const [urgency, setUrgency] = useState<'low' | 'medium' | 'high' | 'critical'>('high');

  const create = async () => {
    setError(null);
    if (!ngoId) return;
    try {
      await createMutation.mutate(ngoId, {
        ngo_id: ngoId,
        title,
        description: `${title} — rapid response needed.`,
        venue,
        start_at: new Date(startAt).toISOString(),
        end_at: new Date(endAt).toISOString(),
        urgency,
        requirements: [{ role, headcount: parseInt(headcount, 10) || 1 }],
      });
      setTitle('');
      setVenue('');
      setStartAt('');
      setEndAt('');
      listQuery.refetch();
    } catch (createError) {
      setError(getErrorMessage(createError));
    }
  };

  if (ngoLoading) return <SkeletonCard lines={4} />;
  if (listQuery.error) return <ErrorState message={listQuery.error.message} onRetry={listQuery.refetch} />;

  return (
    <div>
      <PageHeader title="Rapid emergency mobilization" description="Create an emergency need, mobilize ranked volunteers, and replace no-shows from backups automatically." />

      <Card className="mb-6">
        <CardHeader icon={AlertTriangle}>
          <CardTitle as="h2">New emergency</CardTitle>
          <CardDescription>Keep requirements realistic — every role maps to real, eligible volunteers.</CardDescription>
        </CardHeader>
        <CardContent>
          {error && <Alert variant="error" className="mb-4">{error}</Alert>}
          <div className="grid gap-3 sm:grid-cols-2">
            <Input label="Title" value={title} onChange={(event) => setTitle(event.target.value)} placeholder="Flood Relief Distribution" />
            <Input label="Venue" value={venue} onChange={(event) => setVenue(event.target.value)} placeholder="Mumbai community center" />
            <Input label="Start" type="datetime-local" value={startAt} onChange={(event) => setStartAt(event.target.value)} />
            <Input label="End" type="datetime-local" value={endAt} onChange={(event) => setEndAt(event.target.value)} />
            <Input label="Role" value={role} onChange={(event) => setRole(event.target.value)} />
            <Input label="Count" type="number" min={1} value={headcount} onChange={(event) => setHeadcount(event.target.value)} />
            <label className="block text-small">
              <span className="text-brand-text-secondary">Urgency</span>
              <select
                className="mt-1 w-full rounded-md border border-brand-border px-2 py-2"
                value={urgency}
                onChange={(event) => setUrgency(event.target.value as typeof urgency)}
              >
                <option value="low">Low</option>
                <option value="medium">Medium</option>
                <option value="high">High</option>
                <option value="critical">Critical</option>
              </select>
            </label>
          </div>
          <div className="mt-4">
            <Button loading={createMutation.pending} onClick={() => void create()} disabled={!title || !venue || !startAt || !endAt}>
              Create emergency
            </Button>
          </div>
        </CardContent>
      </Card>

      {listQuery.loading ? (
        <SkeletonCard lines={4} />
      ) : (listQuery.data ?? []).length === 0 ? (
        <EmptyState icon={AlertTriangle} title="No emergencies yet" description="Emergencies you create appear here." />
      ) : (
        <ul className="grid gap-4 md:grid-cols-2">
          {(listQuery.data ?? []).map((emergency) => (
            <li key={emergency.id}>
              {ngoId && <EmergencyCard ngoId={ngoId} emergency={emergency} onChanged={listQuery.refetch} />}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export default NgoEmergencyPage;
