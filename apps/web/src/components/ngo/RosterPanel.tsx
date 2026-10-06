import React from 'react';
import { Users } from 'lucide-react';
import { useApiQuery } from '../../hooks/useApi';
import { getNgoEventRoster } from '../../services/api/endpoints';
import { formatDateTime } from '../../utils/format';
import {
  Alert,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  EmptyState,
  SkeletonCard,
} from '../../components/ui';

interface RosterPanelProps {
  ngoId: string;
  eventId: string;
}

export function RosterPanel({ ngoId, eventId }: RosterPanelProps) {
  const query = useApiQuery((token) => getNgoEventRoster(token, ngoId, eventId), [ngoId, eventId]);

  return (
    <Card>
      <CardHeader icon={Users}>
        <CardTitle as="h2">Roster</CardTitle>
        <CardDescription>
          {query.loading
            ? 'Loading roster…'
            : query.error
              ? 'Roster unavailable.'
              : `${query.data?.accepted_count ?? 0} / ${query.data?.event.capacity ?? 0} volunteers confirmed`}
        </CardDescription>
      </CardHeader>
      <CardContent>
        {query.loading && <SkeletonCard lines={4} />}

        {!query.loading && query.error && <Alert variant="error">{query.error?.message}</Alert>}

        {!query.loading && !query.error && (query.data?.volunteers.length ?? 0) === 0 && (
          <EmptyState
            icon={Users}
            title="No accepted volunteers yet"
            description="Volunteers with accepted registrations appear here automatically."
          />
        )}

        {!query.loading && !query.error && (query.data?.volunteers.length ?? 0) > 0 && (
          <ul className="divide-y divide-brand-border">
            {query.data?.volunteers.map((row) => (
              <li key={row.id} className="flex items-start justify-between gap-3 py-3 first:pt-0 last:pb-0">
                <div className="min-w-0">
                  <p className="text-small font-medium text-brand-text">
                    {row.volunteer?.name ?? `Volunteer ${row.volunteer_id.slice(0, 8)}`}
                  </p>
                  {row.volunteer?.bio ? (
                    <p className="text-caption text-brand-text-muted line-clamp-1">{row.volunteer.bio}</p>
                  ) : null}
                  {row.volunteer?.causes?.length ? (
                    <p className="text-caption text-brand-text-muted">
                      Causes: {row.volunteer.causes.join(', ')}
                    </p>
                  ) : null}
                </div>
                <span className="shrink-0 text-caption text-brand-text-muted">
                  Last updated {formatDateTime(row.updated_at)}
                </span>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}

export default RosterPanel;
