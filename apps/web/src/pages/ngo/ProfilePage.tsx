import React, { useState } from 'react';
import { Building2, Lock, MapPin, Pencil } from 'lucide-react';
import { useApiQuery } from '../../hooks/useApi';
import { getNgoProfile, type NgoMembership } from '../../services/api/endpoints';
import { formatDate } from '../../utils/format';
import {
  Alert,
  Badge,
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  ErrorState,
  Skeleton,
} from '../../components/ui';
import { PageHeader } from '../../components/shared';
import { NgoGate, NgoProfileForm } from '../../components/ngo';

function ProfileContent({ membership }: { membership: NgoMembership }) {
  const ngoId = membership.ngo_id;
  const profile = useApiQuery((token) => getNgoProfile(token, ngoId), [ngoId]);

  const [editing, setEditing] = useState(false);
  const [savedMessage, setSavedMessage] = useState<string | null>(null);

  if (profile.loading) {
    return (
      <div>
        <Skeleton variant="text" className="mb-2 h-8 w-72" />
        <Skeleton variant="text" className="mb-6 h-4 w-96" />
        <Skeleton variant="rectangular" className="h-56 w-full" />
      </div>
    );
  }

  if (profile.error) {
    return <ErrorState message={profile.error?.message} onRetry={profile.refetch} />;
  }

  const data = profile.data;
  if (!data) {
    return (
      <ErrorState
        title="Profile not found"
        message="We couldn't load your organization's profile."
      />
    );
  }

  const canEdit = membership.role === 'admin';

  if (editing) {
    return (
      <div className="mx-auto max-w-3xl">
        <PageHeader title="Edit organization profile" description={data.name} />
        <NgoProfileForm
          ngoId={ngoId}
          initial={data}
          onSaved={() => {
            setEditing(false);
            setSavedMessage('Organization profile updated.');
            profile.refetch();
          }}
          onCancel={() => setEditing(false)}
        />
      </div>
    );
  }

  const geo = data.geo as { lat: number; lng: number } | null;

  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader
        title={data.name}
        description={`Member since ${formatDate(data.created_at)} · You are ${membership.role === 'admin' ? 'an admin' : 'a coordinator'}`}
        actions={
          canEdit ? (
            <Button leadingIcon={Pencil} onClick={() => setEditing(true)}>
              Edit profile
            </Button>
          ) : undefined
        }
      />

      {savedMessage && (
        <Alert variant="success" onClose={() => setSavedMessage(null)} className="mb-6">
          {savedMessage}
        </Alert>
      )}

      {!canEdit && (
        <Alert variant="info" className="mb-6">
          Only NGO admins can edit the organization profile. Coordinators have read access.
        </Alert>
      )}

      <Card className="mb-6">
        <CardHeader icon={Building2}>
          <CardTitle as="h2">Public information</CardTitle>
          <CardDescription>What volunteers see on your organization page.</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-5">
            <div>
              <p className="text-caption font-medium text-brand-text-muted">About</p>
              {data.description ? (
                <p className="mt-1 whitespace-pre-line text-small text-brand-text">
                  {data.description}
                </p>
              ) : (
                <p className="mt-1 text-small text-brand-text-muted">No description added yet.</p>
              )}
            </div>

            <div className="grid gap-x-6 gap-y-4 sm:grid-cols-2">
              <div>
                <p className="text-caption font-medium text-brand-text-muted">Region</p>
                <p className="mt-0.5 text-small text-brand-text">{data.region ?? '—'}</p>
              </div>
              <div>
                <p className="text-caption font-medium text-brand-text-muted">Status</p>
                <p className="mt-0.5 text-small capitalize text-brand-text">{data.status}</p>
              </div>
            </div>

            <div>
              <p className="text-caption font-medium text-brand-text-muted">Causes</p>
              {data.causes && data.causes.length > 0 ? (
                <ul className="mt-2 flex flex-wrap gap-2" aria-label="Organization causes">
                  {data.causes.map((cause) => (
                    <li key={cause}>
                      <Badge variant="success" size="sm">
                        {cause}
                      </Badge>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="mt-1 text-small text-brand-text-muted">No causes listed yet.</p>
              )}
            </div>

            <div>
              <p className="text-caption font-medium text-brand-text-muted">Location</p>
              <p className="mt-0.5 flex items-center gap-1 text-small text-brand-text">
                <MapPin className="h-4 w-4 shrink-0" aria-hidden="true" />
                {geo ? `${geo.lat.toFixed(4)}, ${geo.lng.toFixed(4)}` : 'Not set'}
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader icon={Lock}>
          <CardTitle as="h2">Private contact details</CardTitle>
          <CardDescription>Never shown publicly. Only your team can see this.</CardDescription>
        </CardHeader>
        <CardContent>
          {data.contact ? (
            <pre className="overflow-x-auto rounded-medium border border-brand-border bg-brand-background p-4 text-caption text-brand-text">
              {JSON.stringify(data.contact, null, 2)}
            </pre>
          ) : (
            <p className="text-small text-brand-text-muted">No contact details stored yet.</p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

export function NgoProfilePage() {
  return <NgoGate>{(ngo) => <ProfileContent membership={ngo} />}</NgoGate>;
}

export default NgoProfilePage;
