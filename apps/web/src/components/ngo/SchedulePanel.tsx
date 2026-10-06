import React, { useState } from 'react';
import { CalendarClock } from 'lucide-react';
import { useApiMutation, useApiQuery } from '../../hooks/useApi';
import {
  confirmEventRoster,
  generateEventRoster,
  getNgoEventSchedule,
  removeRosterAssignment,
  type RosterGenerationResult,
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
  Badge,
} from '../../components/ui';

interface SchedulePanelProps {
  ngoId: string;
  eventId: string;
}

export function SchedulePanel({ ngoId, eventId }: SchedulePanelProps) {
  const query = useApiQuery((token) => getNgoEventSchedule(token, ngoId, eventId), [ngoId, eventId]);
  const generateMutation = useApiMutation(generateEventRoster);
  const confirmMutation = useApiMutation(confirmEventRoster);
  const removeMutation = useApiMutation(removeRosterAssignment);
  const [notice, setNotice] = useState<string | null>(null);
  const [gaps, setGaps] = useState<RosterGenerationResult['gaps']>([]);
  const [actionError, setActionError] = useState<string | null>(null);

  const generate = async () => {
    setActionError(null);
    try {
      const result = await generateMutation.mutate(ngoId, eventId);
      setGaps(result.gaps);
      setNotice(`Draft roster generated — ${result.generated} assignment${result.generated === 1 ? '' : 's'}. Review before confirming.`);
      query.refetch();
    } catch (error) {
      setActionError(getErrorMessage(error));
    }
  };

  const confirm = async () => {
    setActionError(null);
    try {
      const result = await confirmMutation.mutate(ngoId, eventId);
      setNotice(`${result.confirmed} assignment${result.confirmed === 1 ? '' : 's'} confirmed.`);
      query.refetch();
    } catch (error) {
      setActionError(getErrorMessage(error));
    }
  };

  const remove = async (assignmentId: string) => {
    setActionError(null);
    try {
      await removeMutation.mutate(ngoId, eventId, assignmentId);
      query.refetch();
    } catch (error) {
      setActionError(getErrorMessage(error));
    }
  };

  const shifts = query.data?.shifts ?? [];
  const totalRequired = shifts.reduce((sum, shift) => sum + shift.headcount, 0);
  const totalAssigned = shifts.reduce((sum, shift) => sum + shift.assigned_count, 0);

  return (
    <Card>
      <CardHeader icon={CalendarClock}>
        <CardTitle as="h2">Automated roster</CardTitle>
        <CardDescription>
          Generate a conflict-free draft roster from your accepted volunteers, review it, then confirm.
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

        <div className="mb-4 flex flex-wrap gap-2">
          <Button loading={generateMutation.pending} onClick={() => void generate()}>
            Generate draft roster
          </Button>
          <Button variant="secondary" loading={confirmMutation.pending} onClick={() => void confirm()}>
            Confirm roster
          </Button>
        </div>

        {query.loading && <SkeletonCard lines={4} />}
        {!query.loading && query.error && <Alert variant="error">{query.error.message}</Alert>}

        {!query.loading && !query.error && totalRequired > 0 && (
          <p className="mb-4 text-small text-brand-text-secondary">
            Staffing: <span className="font-medium text-brand-text">{totalAssigned} / {totalRequired}</span> positions filled
            {totalAssigned < totalRequired ? (
              <span className="ml-2 text-amber-700">{totalRequired - totalAssigned} unfilled</span>
            ) : null}
          </p>
        )}

        {!query.loading && !query.error && shifts.length === 0 && (
          <EmptyState
            icon={CalendarClock}
            title="No shifts yet"
            description="Generate a draft roster — shifts are created automatically from your event requirements."
          />
        )}

        {!query.loading && !query.error && shifts.length > 0 && (
          <ul className="divide-y divide-brand-border">
            {shifts.map((shift) => (
              <li key={shift.id} className="py-4 first:pt-0 last:pb-0">
                <p className="text-small font-medium text-brand-text">
                  {formatDateTime(shift.start_at)} – {formatDateTime(shift.end_at)}
                  {shift.role ? ` · ${shift.role}` : ''}
                </p>
                <p className="text-caption text-brand-text-muted">
                  {shift.assigned_count} / {shift.headcount} assigned{shift.unfilled > 0 ? ` · ${shift.unfilled} unfilled` : ''}
                </p>
                {shift.assignments.length > 0 && (
                  <ul className="mt-2 space-y-1">
                    {shift.assignments.map((assignment) => (
                      <li key={assignment.id} className="flex items-center justify-between gap-2 text-small">
                        <span>
                          {assignment.volunteer?.name ?? `Volunteer ${assignment.volunteer_id.slice(0, 8)}`}
                          {assignment.explanation ? (
                            <span className="ml-2 text-caption text-brand-text-muted">— {assignment.explanation}</span>
                          ) : null}
                        </span>
                        <span className="flex items-center gap-2">
                          <Badge variant={assignment.status === 'confirmed' ? 'success' : 'info'} size="sm" dot>
                            {assignment.status}
                          </Badge>
                          <Button
                            size="sm"
                            variant="ghost"
                            loading={removeMutation.pending}
                            onClick={() => void remove(assignment.id)}
                          >
                            Remove
                          </Button>
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </li>
            ))}
          </ul>
        )}

        {gaps.length > 0 && (
          <div className="mt-4 rounded-lg border border-amber-300 bg-amber-50 p-3">
            <p className="text-small font-medium text-amber-800">Staffing gaps</p>
            <ul className="mt-1 space-y-1">
              {gaps.map((gap) => (
                <li key={gap.shift_id + gap.role} className="text-caption text-amber-900">
                  {gap.role}: requested {gap.required}, assigned {gap.assigned}, unfilled {gap.unfilled} — {gap.reason}
                </li>
              ))}
            </ul>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export default SchedulePanel;
