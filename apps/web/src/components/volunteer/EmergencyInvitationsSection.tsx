import React, { useState } from 'react';
import { Zap } from 'lucide-react';
import { useApiMutation, useApiQuery } from '../../hooks/useApi';
import {
  listMyEmergencyInvitations,
  respondToEmergencyInvitation,
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
  SkeletonCard,
} from '../../components/ui';

export function EmergencyInvitationsSection() {
  const query = useApiQuery(listMyEmergencyInvitations);
  const responseMutation = useApiMutation(respondToEmergencyInvitation);
  const [actionError, setActionError] = useState<string | null>(null);

  const respond = async (invitationId: string, action: 'accept' | 'decline') => {
    setActionError(null);
    try {
      await responseMutation.mutate(invitationId, action);
      query.refetch();
    } catch (error) {
      setActionError(getErrorMessage(error));
    }
  };

  const invitations = query.data ?? [];

  return (
    <Card>
      <CardHeader icon={Zap}>
        <CardTitle as="h2">Emergency invitations</CardTitle>
        <CardDescription>Urgent operations that need you — respond quickly to help.</CardDescription>
      </CardHeader>
      <CardContent>
        {actionError && <Alert variant="error" onClose={() => setActionError(null)} className="mb-4">{actionError}</Alert>}
        {query.loading && <SkeletonCard lines={3} />}
        {!query.loading && query.error && <Alert variant="error">{query.error.message}</Alert>}
        {!query.loading && !query.error && invitations.length === 0 && (
          <EmptyState icon={Zap} title="No emergency invitations" description="When an NGO mobilizes volunteers for urgent help, invitations arrive here." />
        )}
        {!query.loading && !query.error && invitations.length > 0 && (
          <ul className="divide-y divide-brand-border">
            {invitations.map((invitation) => (
              <li key={invitation.id} className="py-4 first:pt-0 last:pb-0">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-small font-medium text-brand-text">
                      {invitation.emergency?.title ?? 'Emergency operation'}
                    </p>
                    <p className="text-caption text-brand-text-muted">
                      {invitation.role ? `${invitation.role} · ` : ''}
                      {invitation.emergency ? `${formatDateTime(invitation.emergency.start_at)} – ${formatDateTime(invitation.emergency.end_at)} · ${invitation.emergency.venue}` : ''}
                    </p>
                    <p className="text-caption text-brand-text-muted">
                      Respond by {formatDateTime(invitation.expires_at)}
                    </p>
                  </div>
                  <Badge variant={invitation.status === 'accepted' ? 'success' : invitation.status === 'pending' ? 'warning' : 'neutral'} size="sm" dot>
                    {invitation.status}
                  </Badge>
                </div>
                {invitation.status === 'pending' && (
                  <div className="mt-3 flex gap-2">
                    <Button size="sm" loading={responseMutation.pending} onClick={() => void respond(invitation.id, 'accept')}>
                      Accept
                    </Button>
                    <Button size="sm" variant="secondary" loading={responseMutation.pending} onClick={() => void respond(invitation.id, 'decline')}>
                      Decline
                    </Button>
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}

export default EmergencyInvitationsSection;
