import React, { useMemo, useState } from 'react';
import { Clock, Pencil, Plus, Trash2 } from 'lucide-react';
import type { z } from 'zod';
import { createAvailabilitySchema } from '@sevasetu/validation';
import { useApiMutation, useApiQuery } from '../../hooks/useApi';
import {
  createMyAvailability,
  deleteMyAvailability,
  listMyAvailability,
  updateMyAvailability,
  type AvailabilityRow,
} from '../../services/api/endpoints';
import { formatDate, getErrorMessage, weekdayName } from '../../utils/format';
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
  FormField,
  Input,
  Modal,
  Select,
  SkeletonCard,
} from '../../components/ui';

const WEEKDAY_OPTIONS = Array.from({ length: 7 }, (_, day) => ({
  value: String(day),
  label: weekdayName(day),
}));

interface SlotFormState {
  weekday: string;
  startTime: string;
  endTime: string;
  availableDate: string;
  available: boolean;
  allDay: boolean;
}

const emptySlot: SlotFormState = {
  weekday: '',
  startTime: '',
  endTime: '',
  availableDate: '',
  available: true,
  allDay: false,
};

function slotPayload(state: SlotFormState) {
  return {
    weekday: state.weekday === '' ? null : Number(state.weekday),
    start_time: state.startTime === '' ? null : state.startTime,
    end_time: state.endTime === '' ? null : state.endTime,
    available_date: state.availableDate === '' ? null : state.availableDate,
    is_available: state.available,
    recurrence: state.availableDate === '' ? 'weekly' : null,
  };
}

function rowLabel(row: AvailabilityRow): string {
  if (row.available_date === null) {
    return `Every ${weekdayName(row.weekday ?? -1)} · ${row.start_time?.slice(0, 5)}–${row.end_time?.slice(0, 5)}`;
  }
  if (!row.is_available) return formatDate(`${row.available_date}T00:00:00Z`);
  if (row.start_time && row.end_time) {
    return `${formatDate(`${row.available_date}T00:00:00Z`)} · ${row.start_time.slice(0, 5)}–${row.end_time.slice(0, 5)}`;
  }
  return `${formatDate(`${row.available_date}T00:00:00Z`)} · Available all day`;
}

export function AvailabilityList() {
  const query = useApiQuery(listMyAvailability);
  const createMutation = useApiMutation(createMyAvailability);
  const updateMutation = useApiMutation(updateMyAvailability);
  const deleteMutation = useApiMutation(deleteMyAvailability);

  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState<SlotFormState>(emptySlot);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState<SlotFormState>(emptySlot);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<AvailabilityRow | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  const sortedRows = useMemo(() => {
    const rows = [...(query.data ?? [])];
    rows.sort((a, b) => {
      if (a.available_date === null && b.available_date === null) {
        return (a.weekday ?? 0) - (b.weekday ?? 0);
      }
      if (a.available_date === null) return -1;
      if (b.available_date === null) return 1;
      return a.available_date.localeCompare(b.available_date);
    });
    return rows;
  }, [query.data]);

  const setFormField = <K extends keyof SlotFormState>(key: K, value: SlotFormState[K]) => {
    setForm((prev) => ({ ...prev, [key]: value }));
  };

  const setEditFormField = <K extends keyof SlotFormState>(key: K, value: SlotFormState[K]) => {
    setEditForm((prev) => ({ ...prev, [key]: value }));
  };

  const validateAndReport = (
    payload: ReturnType<typeof slotPayload>,
  ): z.infer<typeof createAvailabilitySchema> | null => {
    const parsed = createAvailabilitySchema.safeParse(payload);
    if (!parsed.success) {
      const errors: Record<string, string> = {};
      for (const issue of parsed.error.issues) {
        const key = String(issue.path[0] ?? 'form');
        if (!errors[key]) errors[key] = issue.message;
      }
      setFieldErrors(errors);
      return null;
    }
    return parsed.data;
  };

  const handleAdd = async (event: React.FormEvent) => {
    event.preventDefault();
    setFieldErrors({});
    setFormError(null);
    const payload = validateAndReport(slotPayload(form));
    if (!payload) return;
    try {
      await createMutation.mutate(payload);
      setForm(emptySlot);
      setShowForm(false);
      query.refetch();
    } catch (createError) {
      setFormError(getErrorMessage(createError));
    }
  };

  const startEditing = (row: AvailabilityRow) => {
    setActionError(null);
    setFieldErrors({});
    setEditingId(row.id);
    setEditForm({
      weekday: row.weekday !== null ? String(row.weekday) : '',
      startTime: row.start_time?.slice(0, 5) ?? '',
      endTime: row.end_time?.slice(0, 5) ?? '',
      availableDate: row.available_date ?? '',
      available: row.is_available,
      allDay: row.available_date !== null && row.start_time === null,
    });
  };

  const handleEditSave = async (row: AvailabilityRow) => {
    setFieldErrors({});
    setFormError(null);
    const payload = validateAndReport(slotPayload(editForm));
    if (!payload) return;
    try {
      await updateMutation.mutate(row.id, payload);
      setEditingId(null);
      query.refetch();
    } catch (updateError) {
      setFormError(getErrorMessage(updateError));
    }
  };

  const handleDelete = async () => {
    if (!deleting) return;
    setActionError(null);
    try {
      await deleteMutation.mutate(deleting.id);
      setDeleting(null);
      query.refetch();
    } catch (deleteError) {
      setActionError(getErrorMessage(deleteError));
    }
  };

  const renderSlotFields = (
    values: SlotFormState,
    onChange: <K extends keyof SlotFormState>(key: K, value: SlotFormState[K]) => void,
    errors: Record<string, string>,
    isWeekly: boolean,
  ) => (
    <div className="space-y-4">
      {isWeekly ? (
        <FormField label="Day of week" required error={errors.weekday}>
          {(controls) => (
            <Select
              {...controls}
              placeholder="Select a day"
              options={WEEKDAY_OPTIONS}
              value={values.weekday}
              onChange={(e) => onChange('weekday', e.target.value)}
            />
          )}
        </FormField>
      ) : (
        <FormField label="Date" required error={errors.available_date}>
          {(controls) => (
            <Input
              {...controls}
              type="date"
              value={values.availableDate}
              onChange={(e) => onChange('availableDate', e.target.value)}
            />
          )}
        </FormField>
      )}

      {!isWeekly && (
        <div className="space-y-3">
          <FormField label="Status">
            {() => (
              <div className="flex gap-4">
                <label className="flex items-center gap-2 text-small text-brand-text">
                  <input
                    type="radio"
                    name={`${editingId ?? 'new'}-slot-status`}
                    className="h-4 w-4 accent-brand-green"
                    checked={values.available}
                    onChange={() => onChange('available', true)}
                  />
                  Available
                </label>
                <label className="flex items-center gap-2 text-small text-brand-text">
                  <input
                    type="radio"
                    name={`${editingId ?? 'new'}-slot-status`}
                    className="h-4 w-4 accent-brand-green"
                    checked={!values.available}
                    onChange={() => {
                      onChange('available', false);
                      onChange('allDay', true);
                    }}
                  />
                  Not available
                </label>
              </div>
            )}
          </FormField>

          {values.available && (
            <label className="flex items-center gap-2 text-small text-brand-text">
              <input
                type="checkbox"
                className="h-4 w-4 accent-brand-green"
                checked={values.allDay}
                onChange={(e) => onChange('allDay', e.target.checked)}
              />
              Available all day
            </label>
          )}
        </div>
      )}

      {(isWeekly || (values.available && !values.allDay)) && (
        <div className="grid gap-3 sm:grid-cols-2">
          <FormField label="From" required error={errors.start_time}>
            {(controls) => (
              <Input
                {...controls}
                type="time"
                value={values.startTime}
                onChange={(e) => onChange('startTime', e.target.value)}
              />
            )}
          </FormField>
          <FormField label="Until" required error={errors.end_time}>
            {(controls) => (
              <Input
                {...controls}
                type="time"
                value={values.endTime}
                onChange={(e) => onChange('endTime', e.target.value)}
              />
            )}
          </FormField>
        </div>
      )}
    </div>
  );

  return (
    <div>
      {actionError && (
        <Alert variant="error" onClose={() => setActionError(null)} className="mb-4">
          {actionError}
        </Alert>
      )}

      {query.loading && <SkeletonCard lines={4} />}

      {!query.loading && query.error && (
        <Alert variant="error">{query.error?.message}</Alert>
      )}

      {!query.loading && !query.error && (
        <Card>
          <CardHeader
            icon={Clock}
            action={
              !showForm && editingId === null ? (
                <Button
                  size="sm"
                  variant="secondary"
                  leadingIcon={Plus}
                  onClick={() => {
                    setForm(emptySlot);
                    setFieldErrors({});
                    setFormError(null);
                    setShowForm(true);
                  }}
                >
                  Add
                </Button>
              ) : undefined
            }
          >
            <CardTitle as="h2">Weekly availability</CardTitle>
            <CardDescription>
              Tell organizers when you're generally free. Add one-time exceptions for specific
              dates.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {formError && (
              <Alert variant="error" onClose={() => setFormError(null)} className="mb-4">
                {formError}
              </Alert>
            )}

            {showForm && editingId === null && (
              <form onSubmit={handleAdd} noValidate className="mb-6 rounded-medium border border-brand-border p-4">
                {renderSlotFields(form, setFormField, fieldErrors, form.availableDate === '')}
                <div className="mt-4 flex justify-end gap-2">
                  <Button
                    type="button"
                    variant="ghost"
                    onClick={() => {
                      setShowForm(false);
                      setForm(emptySlot);
                      setFieldErrors({});
                    }}
                  >
                    Cancel
                  </Button>
                  <Button type="submit" loading={createMutation.pending}>
                    Add availability
                  </Button>
                </div>
              </form>
            )}

            {sortedRows.length === 0 && !showForm ? (
              <EmptyState
                icon={Clock}
                title="No availability set"
                description="Add your weekly schedule so organizers know when you can help."
              />
            ) : (
              <ul className="divide-y divide-brand-border">
                {sortedRows.map((row) => {
                  const isWeeklyRow = row.available_date === null;
                  return (
                    <li key={row.id} className="py-3 first:pt-0 last:pb-0">
                      {editingId === row.id ? (
                        <form
                          onSubmit={(e) => {
                            e.preventDefault();
                            void handleEditSave(row);
                          }}
                          noValidate
                          className="rounded-medium border border-brand-border p-4"
                        >
                          {renderSlotFields(
                            editForm,
                            setEditFormField,
                            fieldErrors,
                            editForm.availableDate === '',
                          )}
                          <div className="mt-4 flex justify-end gap-2">
                            <Button
                              type="button"
                              variant="ghost"
                              onClick={() => setEditingId(null)}
                            >
                              Cancel
                            </Button>
                            <Button type="submit" loading={updateMutation.pending}>
                              Save
                            </Button>
                          </div>
                        </form>
                      ) : (
                        <div className="flex items-center justify-between gap-3">
                          <div className="min-w-0">
                            <p className="text-small font-medium text-brand-text">
                              {rowLabel(row)}
                            </p>
                            <div className="mt-1">
                              {!isWeeklyRow && !row.is_available ? (
                                <Badge variant="error" size="sm">Blocked</Badge>
                              ) : isWeeklyRow ? (
                                <Badge variant="success" size="sm">Weekly</Badge>
                              ) : (
                                <Badge variant="info" size="sm">One-time</Badge>
                              )}
                            </div>
                          </div>
                          <div className="flex shrink-0 gap-1">
                            <Button
                              variant="ghost"
                              size="sm"
                              leadingIcon={Pencil}
                              aria-label={`Edit ${rowLabel(row)}`}
                              onClick={() => startEditing(row)}
                            >
                              <span className="sr-only sm:not-sr-only">Edit</span>
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              leadingIcon={Trash2}
                              aria-label={`Delete ${rowLabel(row)}`}
                              onClick={() => {
                                setActionError(null);
                                setDeleting(row);
                              }}
                            >
                              <span className="sr-only sm:not-sr-only">Delete</span>
                            </Button>
                          </div>
                        </div>
                      )}
                    </li>
                  );
                })}
              </ul>
            )}
          </CardContent>
        </Card>
      )}

      <Modal
        open={deleting !== null}
        onClose={() => setDeleting(null)}
        title="Remove this availability?"
        description={deleting ? rowLabel(deleting) : undefined}
        icon={Clock}
        footer={
          <>
            <Button variant="secondary" onClick={() => setDeleting(null)}>
              Keep it
            </Button>
            <Button variant="destructive" loading={deleteMutation.pending} onClick={handleDelete}>
              Remove
            </Button>
          </>
        }
      >
        <p className="text-small text-brand-text-secondary">
          Organizers will no longer see this time as available.
        </p>
      </Modal>
    </div>
  );
}

export default AvailabilityList;
