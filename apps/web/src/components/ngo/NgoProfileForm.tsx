import React, { useState } from 'react';
import { Save } from 'lucide-react';
import { jsonObjectSchema } from '@sevasetu/validation';
import { useApiMutation } from '../../hooks/useApi';
import { updateNgoProfile, type NgoProfileRow } from '../../services/api/endpoints';
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

interface NgoProfileFormProps {
  ngoId: string;
  initial: NgoProfileRow;
  onSaved: () => void;
  onCancel?: () => void;
}

interface NgoProfileFormState {
  name: string;
  description: string;
  region: string;
  logoUrl: string;
  causes: string[];
  geoLat: string;
  geoLng: string;
  contactJson: string;
}

function stateFromProfile(profile: NgoProfileRow): NgoProfileFormState {
  const geo = profile.geo as { lat: number; lng: number } | null;
  return {
    name: profile.name ?? '',
    description: profile.description ?? '',
    region: profile.region ?? '',
    logoUrl: profile.logo_url ?? '',
    causes: profile.causes ?? [],
    geoLat: geo ? String(geo.lat) : '',
    geoLng: geo ? String(geo.lng) : '',
    contactJson: profile.contact ? JSON.stringify(profile.contact, null, 2) : '',
  };
}

export function NgoProfileForm({ ngoId, initial, onSaved, onCancel }: NgoProfileFormProps) {
  const [state, setState] = useState<NgoProfileFormState>(() => stateFromProfile(initial));
  const [chipInput, setChipInput] = useState('');
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [submitError, setSubmitError] = useState<string | null>(null);

  const updateMutation = useApiMutation(updateNgoProfile);

  const update = <K extends keyof NgoProfileFormState>(key: K, value: NgoProfileFormState[K]) => {
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

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setFieldErrors({});
    setSubmitError(null);

    const lat = state.geoLat.trim();
    const lng = state.geoLng.trim();
    let contact: unknown = null;
    if (state.contactJson.trim() !== '') {
      try {
        contact = JSON.parse(state.contactJson);
      } catch {
        setFieldErrors({ contact: 'Contact must be valid JSON, e.g. {"email": "hello@example.org"}' });
        return;
      }
      const parsedContact = jsonObjectSchema.safeParse(contact);
      if (!parsedContact.success) {
        setFieldErrors({
          contact: 'Contact must be a JSON object with string, number, boolean, array, or nested object values.',
        });
        return;
      }
    }

    const patch = {
      name: state.name.trim(),
      description: state.description.trim() === '' ? null : state.description.trim(),
      region: state.region.trim() === '' ? null : state.region.trim(),
      logo_url: state.logoUrl.trim() === '' ? null : state.logoUrl.trim(),
      causes: state.causes.length > 0 ? state.causes : null,
      geo: lat !== '' && lng !== '' ? { lat: Number(lat), lng: Number(lng) } : null,
      contact,
    };

    try {
      await updateMutation.mutate(ngoId, patch);
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
        <CardHeader>
          <CardTitle as="h2">Public information</CardTitle>
          <CardDescription>Visible to volunteers on your public organization page.</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            <FormField label="Organization name" required error={fieldErrors.name}>
              {(controls) => (
                <Input
                  {...controls}
                  value={state.name}
                  onChange={(e) => update('name', e.target.value)}
                />
              )}
            </FormField>

            <FormField label="Description" error={fieldErrors.description}>
              {(controls) => (
                <Textarea
                  {...controls}
                  rows={4}
                  value={state.description}
                  onChange={(e) => update('description', e.target.value)}
                  placeholder="What does your organization do?"
                />
              )}
            </FormField>

            <div className="grid gap-4 sm:grid-cols-2">
              <FormField label="Region" error={fieldErrors.region}>
                {(controls) => (
                  <Input
                    {...controls}
                    value={state.region}
                    onChange={(e) => update('region', e.target.value)}
                    placeholder="e.g. Bengaluru, Karnataka"
                  />
                )}
              </FormField>
              <FormField label="Logo URL" error={fieldErrors.logo_url}>
                {(controls) => (
                  <Input
                    {...controls}
                    type="url"
                    value={state.logoUrl}
                    onChange={(e) => update('logoUrl', e.target.value)}
                    placeholder="https://example.com/logo.png"
                  />
                )}
              </FormField>
            </div>

            <FormField label="Causes" error={fieldErrors.causes}>
              {() => (
                <div>
                  <div className="flex gap-2">
                    <Input
                      aria-label="Add a cause"
                      value={chipInput}
                      onChange={(e) => setChipInput(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          e.preventDefault();
                          addCause();
                        }
                      }}
                      placeholder="Type a cause and press Add"
                    />
                    <Button type="button" variant="secondary" onClick={addCause}>
                      Add
                    </Button>
                  </div>
                  {state.causes.length > 0 && (
                    <ul className="mt-3 flex flex-wrap gap-2" aria-label="Your causes">
                      {state.causes.map((cause) => (
                        <li key={cause}>
                          <span className="inline-flex items-center gap-1 rounded-full bg-brand-mint px-3 py-1 text-small text-brand-green-dark">
                            {cause}
                            <button
                              type="button"
                              onClick={() => update('causes', state.causes.filter((c) => c !== cause))}
                              aria-label={`Remove ${cause}`}
                              className="rounded-full p-0.5 hover:bg-brand-green/10"
                            >
                              ×
                            </button>
                          </span>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              )}
            </FormField>

            <FormField label="Map coordinates" error={fieldErrors.geo}>
              {() => (
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label htmlFor="ngo-lat" className="mb-1 block text-small font-medium text-brand-text">
                      Latitude
                    </label>
                    <Input
                      id="ngo-lat"
                      aria-label="Organization latitude"
                      type="number"
                      step="any"
                      min={-90}
                      max={90}
                      value={state.geoLat}
                      onChange={(e) => update('geoLat', e.target.value)}
                    />
                  </div>
                  <div>
                    <label htmlFor="ngo-lng" className="mb-1 block text-small font-medium text-brand-text">
                      Longitude
                    </label>
                    <Input
                      id="ngo-lng"
                      aria-label="Organization longitude"
                      type="number"
                      step="any"
                      min={-180}
                      max={180}
                      value={state.geoLng}
                      onChange={(e) => update('geoLng', e.target.value)}
                    />
                  </div>
                </div>
              )}
            </FormField>
          </div>
        </CardContent>
      </Card>

      <Card className="mb-6">
        <CardHeader>
          <CardTitle as="h2">Private contact details</CardTitle>
          <CardDescription>
            Never shown publicly. Stored as structured JSON, e.g.{' '}
            {'{"email": "hello@example.org", "phone": "+91…"}'}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <FormField label="Contact (JSON)" error={fieldErrors.contact}>
            {(controls) => (
              <Textarea
                {...controls}
                rows={5}
                value={state.contactJson}
                onChange={(e) => update('contactJson', e.target.value)}
                placeholder={'{\n  "email": "hello@example.org",\n  "phone": "+91 80000 00000"\n}'}
              />
            )}
          </FormField>
        </CardContent>
      </Card>

      <div className="flex flex-wrap justify-end gap-2">
        {onCancel && (
          <Button type="button" variant="ghost" onClick={onCancel}>
            Cancel
          </Button>
        )}
        <Button type="submit" loading={updateMutation.pending} leadingIcon={Save}>
          Save changes
        </Button>
      </div>
    </form>
  );
}

export default NgoProfileForm;
