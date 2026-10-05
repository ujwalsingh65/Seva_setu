import React, { useState } from 'react';
import { X } from 'lucide-react';
import type { z } from 'zod';
import {
  createVolunteerProfileSchema,
  updateVolunteerProfileSchema,
} from '@sevasetu/validation';
import { useApiMutation } from '../../hooks/useApi';
import {
  createMyVolunteerProfile,
  updateMyVolunteerProfile,
  type VolunteerProfileRow,
} from '../../services/api/endpoints';
import { getErrorMessage } from '../../utils/format';
import {
  Alert,
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  FormField,
  Input,
  Textarea,
} from '../../components/ui';

interface ProfileFormProps {
  initial: VolunteerProfileRow | null;
  onSaved: () => void;
}

interface ProfileFormState {
  name: string;
  photoUrl: string;
  bio: string;
  homeLat: string;
  homeLng: string;
  maxDistanceKm: string;
  causes: string[];
  emergencyAvailable: boolean;
  profileVisibility: boolean;
  historyVisibility: boolean;
}

function stateFromProfile(profile: VolunteerProfileRow | null): ProfileFormState {
  const geo = profile?.home_geo ?? null;
  const geoCoords = geo as { lat: number; lng: number } | null;
  return {
    name: profile?.name ?? '',
    photoUrl: profile?.photo_url ?? '',
    bio: profile?.bio ?? '',
    homeLat: geoCoords ? String(geoCoords.lat) : '',
    homeLng: geoCoords ? String(geoCoords.lng) : '',
    maxDistanceKm: profile?.max_distance_km != null ? String(profile.max_distance_km) : '',
    causes: profile?.causes ?? [],
    emergencyAvailable: profile?.emergency_available ?? false,
    profileVisibility: profile?.profile_visibility ?? true,
    historyVisibility: profile?.history_visibility ?? true,
  };
}

type VolunteerProfilePayload = z.infer<typeof createVolunteerProfileSchema>;

function buildPayload(state: ProfileFormState): VolunteerProfilePayload {
  const lat = state.homeLat.trim() === '' ? null : Number(state.homeLat);
  const lng = state.homeLng.trim() === '' ? null : Number(state.homeLng);
  const distance = state.maxDistanceKm.trim() === '' ? null : Number(state.maxDistanceKm);
  return {
    name: state.name.trim(),
    photo_url: state.photoUrl.trim() === '' ? null : state.photoUrl.trim(),
    bio: state.bio.trim() === '' ? undefined : state.bio.trim(),
    home_geo: lat !== null && lng !== null ? { lat, lng } : null,
    max_distance_km: distance,
    causes: state.causes.length > 0 ? state.causes : null,
    emergency_available: state.emergencyAvailable,
    profile_visibility: state.profileVisibility,
    history_visibility: state.historyVisibility,
    notification_preferences: null,
  };
}

export function ProfileForm({ initial, onSaved }: ProfileFormProps) {
  const [state, setState] = useState<ProfileFormState>(() => stateFromProfile(initial));
  const [chipInput, setChipInput] = useState('');
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [submitError, setSubmitError] = useState<string | null>(null);

  const isEditing = initial !== null;

  const createMutation = useApiMutation(createMyVolunteerProfile);
  const updateMutation = useApiMutation(updateMyVolunteerProfile);
  const pending = createMutation.pending || updateMutation.pending;

  const update = <K extends keyof ProfileFormState>(key: K, value: ProfileFormState[K]) => {
    setState((prev) => ({ ...prev, [key]: value }));
  };

  const addCause = () => {
    const trimmed = chipInput.trim();
    if (trimmed === '') return;
    if (!state.causes.some((cause) => cause.toLowerCase() === trimmed.toLowerCase())) {
      update('causes', [...state.causes, trimmed]);
    }
    setChipInput('');
  };

  const removeCause = (cause: string) => {
    update('causes', state.causes.filter((c) => c !== cause));
  };

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setFieldErrors({});
    setSubmitError(null);

    const payload = buildPayload(state);
    const schema = isEditing ? updateVolunteerProfileSchema : createVolunteerProfileSchema;
    const parsed = schema.safeParse(payload);
    if (!parsed.success) {
      const errors: Record<string, string> = {};
      for (const issue of parsed.error.issues) {
        const key = String(issue.path[0] ?? 'form');
        if (!errors[key]) errors[key] = issue.message;
      }
      setFieldErrors(errors);
      return;
    }

    try {
      if (isEditing) {
        await updateMutation.mutate(parsed.data);
      } else {
        await createMutation.mutate(parsed.data);
      }
      onSaved();
    } catch (mutationError) {
      setSubmitError(getErrorMessage(mutationError));
    }
  };

  return (
    <form onSubmit={handleSubmit} noValidate>
      {submitError && (
        <Alert variant="error" onClose={() => setSubmitError(null)} className="mb-6">
          {submitError}
        </Alert>
      )}

      <Card className="mb-6">
        <CardHeader icon={undefined}>
          <CardTitle as="h2">About you</CardTitle>
          <CardDescription>
            This information helps organizers know who you are.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            <FormField label="Full name" required error={fieldErrors.name}>
              {(controls) => (
                <Input
                  {...controls}
                  value={state.name}
                  onChange={(e) => update('name', e.target.value)}
                  placeholder="e.g. Priya Sharma"
                  autoComplete="name"
                />
              )}
            </FormField>

            <FormField
              label="Photo URL"
              error={fieldErrors.photo_url}
              hint="Link to a profile picture (optional)."
            >
              {(controls) => (
                <Input
                  {...controls}
                  type="url"
                  value={state.photoUrl}
                  onChange={(e) => update('photoUrl', e.target.value)}
                  placeholder="https://example.com/photo.jpg"
                />
              )}
            </FormField>

            <FormField
              label="Bio"
              error={fieldErrors.bio}
              hint="A short introduction (max 500 characters)."
            >
              {(controls) => (
                <Textarea
                  {...controls}
                  rows={4}
                  value={state.bio}
                  onChange={(e) => update('bio', e.target.value)}
                  placeholder="Tell organizers a little about yourself and the causes you care about."
                />
              )}
            </FormField>
          </div>
        </CardContent>
      </Card>

      <Card className="mb-6">
        <CardHeader>
          <CardTitle as="h2">Location & skills</CardTitle>
          <CardDescription>
            Used to plan around where you can volunteer. Private — never shown publicly.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            <FormField
              label="Home location"
              error={fieldErrors.home_geo}
              hint="Private — used only to match you with nearby events. Never shown publicly."
            >
              {() => (
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label htmlFor="home-lat" className="mb-1 block text-small font-medium text-brand-text">
                      Latitude
                    </label>
                    <Input
                      id="home-lat"
                      aria-label="Home latitude"
                      type="number"
                      step="any"
                      min={-90}
                      max={90}
                      value={state.homeLat}
                      onChange={(e) => update('homeLat', e.target.value)}
                      placeholder="12.9716"
                    />
                  </div>
                  <div>
                    <label htmlFor="home-lng" className="mb-1 block text-small font-medium text-brand-text">
                      Longitude
                    </label>
                    <Input
                      id="home-lng"
                      aria-label="Home longitude"
                      type="number"
                      step="any"
                      min={-180}
                      max={180}
                      value={state.homeLng}
                      onChange={(e) => update('homeLng', e.target.value)}
                      placeholder="77.5946"
                    />
                  </div>
                </div>
              )}
            </FormField>

            <FormField
              label="Max travel distance (km)"
              error={fieldErrors.max_distance_km}
              hint="How far you're willing to travel for an event. Leave blank for no limit."
            >
              {(controls) => (
                <Input
                  {...controls}
                  type="number"
                  step="any"
                  min={0}
                  value={state.maxDistanceKm}
                  onChange={(e) => update('maxDistanceKm', e.target.value)}
                  placeholder="e.g. 25"
                />
              )}
            </FormField>

            <FormField
              label="Skills & causes"
              error={fieldErrors.causes}
              hint="Add tags describing how you can help, e.g. teaching, first aid, logistics."
            >
              {() => (
                <div>
                  <div className="flex gap-2">
                    <Input
                      aria-label="Add a skill or cause"
                      value={chipInput}
                      onChange={(e) => setChipInput(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          e.preventDefault();
                          addCause();
                        }
                      }}
                      placeholder="Type a skill and press Add"
                    />
                    <Button type="button" variant="secondary" onClick={addCause}>
                      Add
                    </Button>
                  </div>
                  {state.causes.length > 0 && (
                    <ul className="mt-3 flex flex-wrap gap-2" aria-label="Your skills and causes">
                      {state.causes.map((cause) => (
                        <li key={cause}>
                          <span className="inline-flex items-center gap-1 rounded-full bg-brand-mint px-3 py-1 text-small text-brand-green-dark">
                            {cause}
                            <button
                              type="button"
                              onClick={() => removeCause(cause)}
                              aria-label={`Remove ${cause}`}
                              className="rounded-full p-0.5 hover:bg-brand-green/10"
                            >
                              <X className="h-3 w-3" aria-hidden="true" />
                            </button>
                          </span>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              )}
            </FormField>

            <FormField label="Emergency availability">
              {() => (
                <label className="flex items-start gap-2 text-small text-brand-text">
                  <input
                    type="checkbox"
                    className="mt-0.5 h-4 w-4 accent-brand-green"
                    checked={state.emergencyAvailable}
                    onChange={(e) => update('emergencyAvailable', e.target.checked)}
                  />
                  <span>
                    I'm willing to be contacted for urgent, short-notice volunteering.
                  </span>
                </label>
              )}
            </FormField>
          </div>
        </CardContent>
      </Card>

      <Card className="mb-6">
        <CardHeader>
          <CardTitle as="h2">Privacy</CardTitle>
          <CardDescription>Control what organizations can see about you.</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            <label className="flex items-start gap-2 text-small text-brand-text">
              <input
                type="checkbox"
                className="mt-0.5 h-4 w-4 accent-brand-green"
                checked={state.profileVisibility}
                onChange={(e) => update('profileVisibility', e.target.checked)}
              />
              <span>Show my profile to organizations I register with.</span>
            </label>
            <label className="flex items-start gap-2 text-small text-brand-text">
              <input
                type="checkbox"
                className="mt-0.5 h-4 w-4 accent-brand-green"
                checked={state.historyVisibility}
                onChange={(e) => update('historyVisibility', e.target.checked)}
              />
              <span>Show my volunteer history to organizations.</span>
            </label>
          </div>
        </CardContent>
      </Card>

      <div className="flex justify-end">
        <Button type="submit" loading={pending} disabled={pending}>
          {isEditing ? 'Save changes' : 'Create profile'}
        </Button>
      </div>
    </form>
  );
}

export default ProfileForm;
