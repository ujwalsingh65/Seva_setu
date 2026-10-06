import React from 'react';
import { HeartHandshake } from 'lucide-react';
import { useApiQuery } from '../../hooks/useApi';
import { getMyKarma } from '../../services/api/endpoints';
import { formatDateTime } from '../../utils/format';
import {
  Alert,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  SkeletonCard,
} from '../ui';

export function KarmaSection() {
  const query = useApiQuery(getMyKarma);
  const result = query.data;

  return (
    <Card>
      <CardHeader icon={HeartHandshake}>
        <CardTitle as="h2">Community Impact</CardTitle>
        <CardDescription>Your verified community contribution — distinct from reliability and engagement.</CardDescription>
      </CardHeader>
      <CardContent>
        {query.loading && <SkeletonCard lines={3} />}
        {!query.loading && query.error && <Alert variant="error">{query.error.message}</Alert>}
        {!query.loading && !query.error && result && (
          <div>
            <p className="text-h2 text-brand-teal">{result.total_karma} Karma</p>
            <p className="text-small font-medium text-brand-text-secondary">{result.level}</p>

            <dl className="mt-4 grid grid-cols-2 gap-x-6 gap-y-2 text-small sm:grid-cols-3">
              <div>
                <dt className="text-caption text-brand-text-muted">Verified contributions</dt>
                <dd className="font-medium text-brand-text">{result.participated_events} events</dd>
              </div>
              <div>
                <dt className="text-caption text-brand-text-muted">Service hours</dt>
                <dd className="font-medium text-brand-text">{result.verified_service_hours === null ? '—' : `${result.verified_service_hours} hrs`}</dd>
              </div>
              <div>
                <dt className="text-caption text-brand-text-muted">Emergency contributions</dt>
                <dd className="font-medium text-brand-text">{result.emergency_contributions}</dd>
              </div>
            </dl>

            <div className="mt-4">
              <p className="text-caption font-medium text-brand-text-muted">Breakdown</p>
              <ul className="mt-1 space-y-1 text-small text-brand-text-secondary">
                <li>Participation: +{result.breakdown.participation}</li>
                <li>Verified service: +{result.breakdown.verified_service}</li>
                <li>Emergency contribution: +{result.breakdown.emergency_contribution}</li>
              </ul>
            </div>

            {result.recent_contributions.length > 0 ? (
              <div className="mt-4">
                <p className="text-caption font-medium text-brand-text-muted">Recent</p>
                <ul className="mt-1 space-y-1">
                  {result.recent_contributions.map((entry) => (
                    <li key={entry.event_id} className="text-small text-brand-text-secondary">
                      +{entry.points} {entry.title ?? 'Event'}
                      <span className="ml-2 text-caption text-brand-text-muted">
                        {entry.reason === 'participation_attended' ? 'Attended' : 'Late'}
                        {entry.hours !== null ? ` • ${entry.hours}h` : ''}
                        {entry.start_at ? ` • ${formatDateTime(entry.start_at)}` : ''}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            ) : (
              <p className="mt-4 text-caption text-brand-text-muted">
                Your impact history starts with your first verified contribution.
              </p>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export default KarmaSection;
