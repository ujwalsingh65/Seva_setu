import React, { useState } from 'react';
import { CalendarPlus, Save } from 'lucide-react';
import { createEventSchema } from '@sevasetu/validation';
import { useApiMutation } from '../../hooks/useApi';
import {
  createNgoEvent,
  updateNgoEvent,
  type EventRow,
} from '../../services/api/endpoints';
import { getErrorMessage, isoToLocalDateTime, localDateTimeToIso } from '../../utils/format';
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
  Select,
  Textarea,
} from '../../components/ui';

interface EventFormProps {
  ngoId: string;
  initial?: EventRow | null;
  onSaved: (event: EventRow) => void;
  onCancel?: () => void;
}

interface EventFormState {
  title: string;
  description: string;
  cause: string;
  venue: string;
  capacity: string;
  visibility: string;
  registrationMode: string;
  startAt: string;
  endAt: string;
  geoLat: string;
  geoLng: string;
}

function stateFromEvent(event: EventRow | null): EventFormState {
  const geo = event?.geo as { lat: number; lng: number } | null | undefined;
  return {
    title: event?.title ?? '',
    description: event?.description ?? '',
    cause: event?.cause ?? '',
    venue: event?.venue ?? '',
    capacity: event ? String(event.capacity) : '',
    visibility: event?.visibility ?? 'public',
    registrationMode: event?.registration_mode ?? 'open',
    startAt: event ? isoToLocalDateTime(event.start_at) : '',
    endAt: event ? isoToLocalDateTime(event.end_at) : '',
    geoLat: geo ? String(geo.lat) : '',
    geoLng: geo ? String(geo.lng) : '',
  };
}

function buildFullEvent(state: EventFormState, ngoId: string, status: string) {
  const lat = state.geoLat.trim();
  const lng = state.geoLng.trim();
  return {
    ngo_id: ngoId,
    title: state.title.trim(),
    description: state.description.trim(),
    cause: state.cause.trim(),
    venue: state.venue.trim(),
    capacity: state.capacity.trim() === '' ? NaN : Number(state.capacity),
    visibility: state.visibility,
    status,
    registration_mode: state.registrationMode,
    start_at: state.startAt === '' ? '' : localDateTimeToIso(state.startAt),
    end_at: state.endAt === '' ? '' : localDateTimeToIso(state.endAt),
    geo: lat !== '' && lng !== '' ? { lat: Number(lat), lng: Number(lng) } : undefined,
  };
}

export function EventForm({ ngoId, initial, onSaved, onCancel }: EventFormProps) {
  const isEditing = initial != null;
  const [state, setState] = useState<EventFormState>(() => stateFromEvent(initial ?? null));
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const createMutation = useApiMutation(createNgoEvent);
  const updateMutation = useApiMutation(updateNgoEvent);

  const update = <K extends keyof EventFormState>(key: K, value: EventFormState[K]) => {
    setState((prev) => ({ ...prev, [key]: value }));
  };

  const handleSubmit = async (status: string) => {
    setFieldErrors({});
    setSubmitError(null);

    const fullEvent = buildFullEvent(state, ngoId, isEditing ? initial.status : status);
    const parsed = createEventSchema.safeParse(fullEvent);
    if (!parsed.success) {
      const errors: Record<string, string> = {};
      for (const issue of parsed.error.issues) {
        const key = String(issue.path[0] ?? 'form');
        if (!errors[key]) errors[key] = issue.message;
      }
      setFieldErrors(errors);
      return;
    }

    setSubmitting(true);
    try {
      if (isEditing) {
        const { ngo_id: _ngoId, status: _status, ...patch } = parsed.data;
        const saved = await updateMutation.mutate(ngoId, initial.id, patch);
        onSaved(saved);
      } else {
        const saved = await createMutation.mutate(ngoId, parsed.data);
        onSaved(saved);
      }
    } catch (mutationError) {
      setSubmitError(
        mutationError instanceof Error && 'code' in mutationError
          ? (mutationError as { code: string }).code === 'EVENT_CAPACITY_REACHED'
            ? 'Capacity cannot be lower than the number of volunteers already accepted.'
            : getErrorMessage(mutationError)
          : getErrorMessage(mutationError),
      );
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        void handleSubmit(isEditing ? initial.status : 'draft');
      }}
      noValidate
    >
      {submitError && (
        <Alert variant="error" onClose={() => setSubmitError(null)} className="mb-6">
          {submitError}
        </Alert>
      )}

      <Card className="mb-6">
        <CardHeader>
          <CardTitle as="h2">Event details</CardTitle>
          <CardDescription>What volunteers will see when they find this event.</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            <FormField label="Event title" required error={fieldErrors.title}>
              {(controls) => (
                <Input
                  {...controls}
                  value={state.title}
                  onChange={(e) => update('title', e.target.value)}
                  placeholder="e.g. Weekend food drive"
                />
              )}
            </FormField>

            <FormField label="Description" required error={fieldErrors.description}>
              {(controls) => (
                <Textarea
                  {...controls}
                  rows={5}
                  value={state.description}
                  onChange={(e) => update('description', e.target.value)}
                  placeholder="What will volunteers do? What should they bring or know?"
                />
              )}
            </FormField>

            <div className="grid gap-4 sm:grid-cols-2">
              <FormField label="Cause" required error={fieldErrors.cause}>
                {(controls) => (
                  <Input
                    {...controls}
                    value={state.cause}
                    onChange={(e) => update('cause', e.target.value)}
                    placeholder="e.g. Food security"
                  />
                )}
              </FormField>
              <FormField label="Venue" required error={fieldErrors.venue}>
                {(controls) => (
                  <Input
                    {...controls}
                    value={state.venue}
                    onChange={(e) => update('venue', e.target.value)}
                    placeholder="e.g. Community Hall, Indiranagar"
                  />
                )}
              </FormField>
            </div>

            <FormField
              label="Map coordinates (optional)"
              error={fieldErrors.geo}
              hint="Exact location shown to registered volunteers. Leave blank to use the venue text only."
            >
              {() => (
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label htmlFor="event-lat" className="mb-1 block text-small font-medium text-brand-text">
                      Latitude
                    </label>
                    <Input
                      id="event-lat"
                      aria-label="Venue latitude"
                      type="number"
                      step="any"
                      min={-90}
                      max={90}
                      value={state.geoLat}
                      onChange={(e) => update('geoLat', e.target.value)}
                      placeholder="12.9716"
                    />
                  </div>
                  <div>
                    <label htmlFor="event-lng" className="mb-1 block text-small font-medium text-brand-text">
                      Longitude
                    </label>
                    <Input
                      id="event-lng"
                      aria-label="Venue longitude"
                      type="number"
                      step="any"
                      min={-180}
                      max={180}
                      value={state.geoLng}
                      onChange={(e) => update('geoLng', e.target.value)}
                      placeholder="77.5946"
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
          <CardTitle as="h2">Schedule & capacity</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <FormField label="Starts" required error={fieldErrors.start_at}>
                {(controls) => (
                  <Input
                    {...controls}
                    type="datetime-local"
                    value={state.startAt}
                    onChange={(e) => update('startAt', e.target.value)}
                  />
                )}
              </FormField>
              <FormField label="Ends" required error={fieldErrors.end_at}>
                {(controls) => (
                  <Input
                    {...controls}
                    type="datetime-local"
                    value={state.endAt}
                    onChange={(e) => update('endAt', e.target.value)}
                  />
                )}
              </FormField>
            </div>

            <FormField
              label="Volunteer capacity"
              required
              error={fieldErrors.capacity}
              hint="Maximum number of volunteers that can be accepted."
            >
              {(controls) => (
                <Input
                  {...controls}
                  type="number"
                  min={1}
                  step={1}
                  value={state.capacity}
                  onChange={(e) => update('capacity', e.target.value)}
                  placeholder="e.g. 20"
                />
              )}
            </FormField>
          </div>
        </CardContent>
      </Card>

      <Card className="mb-6">
        <CardHeader>
          <CardTitle as="h2">Registration</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            <FormField label="Visibility" required error={fieldErrors.visibility}>
              {(controls) => (
                <Select
                  {...controls}
                  value={state.visibility}
                  onChange={(e) => update('visibility', e.target.value)}
                  options={[
                    { value: 'public', label: 'Public — anyone can discover this event' },
                    {
                      value: 'ngo_only',
                      label: 'Organization only — affiliated volunteers can register',
                    },
                  ]}
                />
              )}
            </FormField>

            <FormField label="Approval mode" required error={fieldErrors.registration_mode}>
              {(controls) => (
                <Select
                  {...controls}
                  value={state.registrationMode}
                  onChange={(e) => update('registrationMode', e.target.value)}
                  options={[
                    { value: 'open', label: 'Open — registrations are confirmed instantly' },
                    {
                      value: 'approval_required',
                      label: 'Approval required — you review each request',
                    },
                  ]}
                />
              )}
            </FormField>
          </div>
        </CardContent>
      </Card>

      <div className="flex flex-wrap justify-end gap-2">
        {onCancel && (
          <Button type="button" variant="ghost" onClick={onCancel}>
            Cancel
          </Button>
        )}
        {isEditing ? (
          <Button type="submit" loading={submitting} leadingIcon={Save}>
            Save changes
          </Button>
        ) : (
          <>
            <Button
              type="button"
              variant="secondary"
              loading={submitting}
              onClick={() => void handleSubmit('draft')}
            >
              Save as draft
            </Button>
            <Button
              type="button"
              loading={submitting}
              leadingIcon={CalendarPlus}
              onClick={() => void handleSubmit('published')}
            >
              Publish event
            </Button>
          </>
        )}
      </div>
    </form>
  );
}

export default EventForm;
