import React from 'react';
import { BarChart3, TrendingDown, TrendingUp, Minus } from 'lucide-react';
import { useApiQuery } from '../../hooks/useApi';
import { getNgoEngagementAnalytics } from '../../services/api/endpoints';
import {
  Alert,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  SkeletonCard,
} from '../ui';

export function NgoEngagementPanel({ ngoId }: { ngoId: string }) {
  const query = useApiQuery((token) => getNgoEngagementAnalytics(token, ngoId), [ngoId]);
  const data = query.data;

  return (
    <Card>
      <CardHeader icon={BarChart3}>
        <CardTitle as="h2">Volunteer engagement & retention</CardTitle>
        <CardDescription>Derived from recorded participation — deterministic, no AI scoring.</CardDescription>
      </CardHeader>
      <CardContent>
        {query.loading && <SkeletonCard lines={4} />}
        {!query.loading && query.error && <Alert variant="error">{query.error.message}</Alert>}
        {!query.loading && !query.error && data && (
          <div>
            <dl className="grid grid-cols-2 gap-x-6 gap-y-2 text-small sm:grid-cols-4">
              <div>
                <dt className="text-caption text-brand-text-muted">Participating volunteers</dt>
                <dd className="font-medium text-brand-text">{data.volunteers.total}</dd>
              </div>
              <div>
                <dt className="text-caption text-brand-text-muted">Active (30d)</dt>
                <dd className="font-medium text-brand-text">{data.volunteers.active}</dd>
              </div>
              <div>
                <dt className="text-caption text-brand-text-muted">At risk / inactive</dt>
                <dd className="font-medium text-brand-text">
                  {data.volunteers.at_risk} / {data.volunteers.inactive}
                </dd>
              </div>
              <div>
                <dt className="text-caption text-brand-text-muted">Returning rate</dt>
                <dd className="font-medium text-brand-text">{data.returning_volunteer_rate === null ? '—' : `${data.returning_volunteer_rate}%`}</dd>
              </div>
            </dl>

            <p className="mt-4 flex items-center gap-2 text-small text-brand-text-secondary">
              {data.trend.direction === 'up' ? <TrendingUp className="h-4 w-4 text-brand-green" /> : data.trend.direction === 'down' ? <TrendingDown className="h-4 w-4 text-red-600" /> : <Minus className="h-4 w-4 text-brand-text-muted" />}
              Recorded participation: {data.trend.current_period} in the last 30 days vs {data.trend.previous_period} in the prior 30
              {data.attendance_rate !== null ? ` · attendance rate ${data.attendance_rate}%` : ''}.
            </p>

            <ul className="mt-4 space-y-1">
              {data.insights.map((insight, index) => (
                <li key={index} className="text-small text-brand-text-secondary">
                  • {insight}
                </li>
              ))}
            </ul>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export default NgoEngagementPanel;
