import React from 'react';
import { useApiQuery } from '../../hooks/useApi';
import { getNgoTransparency } from '../../services/api/endpoints';
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
import { Building2 } from 'lucide-react';

export function NgoTransparencyCard({ ngoId }: { ngoId: string }) {
  const query = useApiQuery((token) => getNgoTransparency(token, ngoId), [ngoId]);
  const data = query.data;

  return (
    <Card>
      <CardHeader icon={Building2}>
        <CardTitle as="h2">Who is organizing this?</CardTitle>
        <CardDescription>NGO-provided details plus SevaSetu-verified activity.</CardDescription>
      </CardHeader>
      <CardContent>
        {query.loading && <SkeletonCard lines={4} />}
        {!query.loading && query.error && <Alert variant="error">{query.error.message}</Alert>}
        {!query.loading && !query.error && data && (
          <div>
            <p className="text-small font-medium text-brand-text">{data.organization.name}</p>
            {data.organization.description && (
              <p className="mt-1 text-caption text-brand-text-secondary">{data.organization.description}</p>
            )}
            {data.organization.causes && data.organization.causes.length > 0 && (
              <p className="mt-1 text-caption text-brand-text-muted">Causes: {data.organization.causes.join(' · ')}</p>
            )}

            <dl className="mt-4 grid grid-cols-2 gap-x-6 gap-y-2 text-small">
              <div>
                <dt className="text-caption text-brand-text-muted">Completed events</dt>
                <dd className="font-medium text-brand-text">{data.activity.completed_events}</dd>
              </div>
              <div>
                <dt className="text-caption text-brand-text-muted">Verified participations</dt>
                <dd className="font-medium text-brand-text">{data.activity.verified_participations}</dd>
              </div>
              <div>
                <dt className="text-caption text-brand-text-muted">Unique volunteers</dt>
                <dd className="font-medium text-brand-text">{data.activity.unique_volunteers}</dd>
              </div>
              <div>
                <dt className="text-caption text-brand-text-muted">Verified service hours</dt>
                <dd className="font-medium text-brand-text">
                  {data.activity.verified_service_hours === null ? 'Not recorded' : `${data.activity.verified_service_hours}h`}
                </dd>
              </div>
              <div>
                <dt className="text-caption text-brand-text-muted">Emergency events supported</dt>
                <dd className="font-medium text-brand-text">{data.activity.emergency_events_supported}</dd>
              </div>
              <div>
                <dt className="text-caption text-brand-text-muted">Returning volunteers</dt>
                <dd className="font-medium text-brand-text">{data.activity.returning_volunteers}</dd>
              </div>
            </dl>

            {data.recent_events.length > 0 && (
              <div className="mt-4">
                <p className="text-caption font-medium text-brand-text-muted">Recent completed events</p>
                <ul className="mt-1 space-y-1">
                  {data.recent_events.map((event) => (
                    <li key={event.event_id} className="text-small text-brand-text-secondary">
                      {event.title ?? 'Event'}
                      <span className="ml-2 text-caption text-brand-text-muted">
                        {event.start_at ? formatDateTime(event.start_at) : ''} · {event.participation_count} verified participation{event.participation_count === 1 ? '' : 's'}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            <p className="mt-4 text-caption text-brand-text-muted">{data.transparency.verification_note}</p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export default NgoTransparencyCard;
