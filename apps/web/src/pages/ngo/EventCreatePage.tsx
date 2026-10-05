import React from 'react';
import { useNavigate } from 'react-router-dom';
import { ROUTES } from '../../routes';
import type { EventRow } from '../../services/api/endpoints';
import { PageHeader } from '../../components/shared';
import { EventForm, NgoGate } from '../../components/ngo';

function CreateEventContent({ ngoId, ngoName }: { ngoId: string; ngoName: string }) {
  const navigate = useNavigate();

  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader
        title="Create event"
        description={`Publish a new volunteer opportunity for ${ngoName}, or save it as a draft to finish later.`}
      />
      <EventForm
        ngoId={ngoId}
        onSaved={(event: EventRow) => navigate(ROUTES.NGO.EVENT_DETAILS(event.id))}
        onCancel={() => navigate(ROUTES.NGO.EVENTS)}
      />
    </div>
  );
}

export function NgoEventCreatePage() {
  return (
    <NgoGate>
      {(ngo) => <CreateEventContent ngoId={ngo.ngo_id} ngoName={ngo.ngo.name} />}
    </NgoGate>
  );
}

export default NgoEventCreatePage;
