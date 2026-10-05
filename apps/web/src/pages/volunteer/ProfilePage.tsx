import React, { useState } from 'react';
import { CalendarClock, UserRound } from 'lucide-react';
import { useApiQuery } from '../../hooks/useApi';
import { getMyVolunteerProfile } from '../../services/api/endpoints';
import { AvailabilityList } from '../../components/volunteer/AvailabilityList';
import { ProfileForm } from '../../components/volunteer/ProfileForm';
import {
  Alert,
  ErrorState,
  SkeletonCard,
} from '../../components/ui';
import { PageHeader } from '../../components/shared';

export function VolunteerProfilePage() {
  const { data: profile, loading, error, refetch } = useApiQuery(getMyVolunteerProfile);
  const [savedMessage, setSavedMessage] = useState<string | null>(null);

  if (loading) {
    return (
      <div className="mx-auto max-w-3xl">
        <SkeletonCard lines={6} />
      </div>
    );
  }

  if (error) {
    return <ErrorState message={error?.message} onRetry={refetch} />;
  }

  const isEditing = profile !== null;

  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader
        title={isEditing ? 'Your profile' : 'Create your profile'}
        description={
          isEditing
            ? 'Keep your skills, location, and availability up to date so organizers can plan around you.'
            : 'Tell organizers who you are, where you are, and when you can help.'
        }
      />

      {savedMessage && (
        <Alert variant="success" onClose={() => setSavedMessage(null)} className="mb-6">
          {savedMessage}
        </Alert>
      )}

      {!isEditing && (
        <Alert variant="info" className="mb-6">
          Create your volunteer profile to start registering for events.
        </Alert>
      )}

      <ProfileForm
        key={profile?.updated_at ?? 'create'}
        initial={profile}
        onSaved={() => {
          setSavedMessage(isEditing ? 'Profile updated successfully.' : 'Profile created successfully.');
          refetch();
        }}
      />

      {isEditing && (
        <section className="mt-10" aria-label="Availability">
          <AvailabilityList />
        </section>
      )}

      <p className="mt-8 text-caption text-brand-text-muted">
        Notification preferences can be configured in a later step.
      </p>
    </div>
  );
}

export default VolunteerProfilePage;
