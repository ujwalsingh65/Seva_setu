import React from 'react';
import { Activity } from 'lucide-react';
import { useApiQuery } from '../../hooks/useApi';
import { getMyEngagement } from '../../services/api/endpoints';
import { formatDateTime } from '../../utils/format';
import {
  Alert,
  Badge,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  SkeletonCard,
} from '../ui';

const STATUS_VARIANT: Record<string, 'success' | 'info' | 'warning' | 'neutral' | 'error'> = {
  active: 'success',
  engaged: 'info',
  at_risk: 'warning',
  inactive: 'neutral',
  new: 'neutral',
};

export function EngagementSection() {
  const query = useApiQuery(getMyEngagement);
  const result = query.data;

  return (
    <Card>
      <CardHeader icon={Activity}>
        <CardTitle as="h2">My Engagement</CardTitle>
        <CardDescription>Real participation history — no fabricated metrics.</CardDescription>
      </CardHeader>
      <CardContent>
        {query.loading && <SkeletonCard lines={3} />}
        {!query.loading && query.error && <Alert variant="error">{query.error.message}</Alert>}
        {!query.loading && !query.error && result && (
          <div>
            <div className="flex items-center gap-3">
              <Badge variant={STATUS_VARIANT[result.status] ?? 'neutral'} dot>
                {result.status === 'new' ? 'New' : result.status === 'at_risk' ? 'At risk' : result.status.charAt(0).toUpperCase() + result.status.slice(1)}
              </Badge>
              <p className="text-small text-brand-text-secondary">{result.status_reason}</p>
            </div>

            <dl className="mt-4 grid grid-cols-2 gap-x-6 gap-y-2 text-small sm:grid-cols-4">
              <div>
                <dt className="text-caption text-brand-text-muted">Events participated</dt>
                <dd className="font-medium text-brand-text">{result.totals.events_participated}</dd>
              </div>
              <div>
                <dt className="text-caption text-brand-text-muted">Service hours</dt>
                <dd className="font-medium text-brand-text">{result.totals.service_hours === null ? '—' : `${result.totals.service_hours}h`}</dd>
              </div>
              <div>
                <dt className="text-caption text-brand-text-muted">Attendance</dt>
                <dd className="font-medium text-brand-text">{result.attendance_rate === null ? '—' : `${result.attendance_rate}%`}</dd>
              </div>
              <div>
                <dt className="text-caption text-brand-text-muted">Emergency events</dt>
                <dd className="font-medium text-brand-text">{result.totals.emergency_events}</dd>
              </div>
            </dl>

            {result.recent_activity.length > 0 ? (
              <div className="mt-4">
                <p className="text-caption font-medium text-brand-text-muted">Recent activity</p>
                <ul className="mt-1 space-y-1">
                  {result.recent_activity.map((row) => (
                    <li key={row.event_id} className="text-small text-brand-text-secondary">
                      {row.title ?? 'Event'} — {row.status.replace('_', ' ')}
                      <span className="ml-2 text-caption text-brand-text-muted">{formatDateTime(row.start_at)}</span>
                    </li>
                  ))}
                </ul>
              </div>
            ) : (
              <p className="mt-4 text-caption text-brand-text-muted">No recorded participation yet — your history starts with your first event.</p>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export default EngagementSection;
