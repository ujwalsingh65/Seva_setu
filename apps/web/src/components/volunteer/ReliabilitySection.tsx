import React from 'react';
import { ShieldCheck } from 'lucide-react';
import { useApiQuery } from '../../hooks/useApi';
import { getMyReliability, type ReliabilityResult } from '../../services/api/endpoints';
import {
  Alert,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  SkeletonCard,
} from '../ui';

const FACTOR_LABELS: Array<[keyof NonNullable<ReliabilityResult['factors']>, string]> = [
  ['attendance', 'Attendance'],
  ['no_show', 'No-show behavior'],
  ['cancellations', 'Cancellations'],
  ['consistency', 'Consistency'],
];

function StatusBody({ result }: { result: ReliabilityResult }) {
  if (result.status === 'insufficient_data') {
    return (
      <div>
        <p className="text-h3 text-brand-teal">Building history</p>
        <p className="mt-1 text-small text-brand-text-secondary">
          Complete volunteer events to establish your reliability score. {result.explanation}
        </p>
        <p className="mt-4 text-caption text-brand-text-muted">
          Participation history: {result.history.eligible_events} recorded event outcome
          {result.history.eligible_events === 1 ? '' : 's'}
        </p>
      </div>
    );
  }

  return (
    <div>
      <p className="text-h2 text-brand-teal">
        {result.score} / 100
        {result.status === 'provisional' ? (
          <span className="ml-2 align-middle text-small font-medium text-brand-text-muted">
            (Building history)
          </span>
        ) : null}
      </p>
      <p className="mt-1 text-small text-brand-text-secondary">{result.explanation}</p>

      <dl className="mt-4 grid grid-cols-2 gap-x-6 gap-y-1 text-small sm:grid-cols-4">
        <div>
          <dt className="text-caption text-brand-text-muted">Attended</dt>
          <dd className="font-medium text-brand-text">{result.history.attended}</dd>
        </div>
        <div>
          <dt className="text-caption text-brand-text-muted">Late</dt>
          <dd className="font-medium text-brand-text">{result.history.late}</dd>
        </div>
        <div>
          <dt className="text-caption text-brand-text-muted">No-show</dt>
          <dd className="font-medium text-brand-text">{result.history.no_show}</dd>
        </div>
        <div>
          <dt className="text-caption text-brand-text-muted">Cancelled</dt>
          <dd className="font-medium text-brand-text">{result.history.volunteer_cancelled}</dd>
        </div>
      </dl>

      {result.factors ? (
        <div className="mt-4">
          <p className="text-caption font-medium text-brand-text-muted">Why this score?</p>
          <ul className="mt-1 space-y-1">
            {FACTOR_LABELS.map(([key, label]) => {
              const factor = result.factors![key];
              return (
                <li key={key} className="text-small text-brand-text-secondary">
                  <span className="inline-block w-36 font-medium text-brand-text">{label}</span>
                  {factor.earned} / {factor.weight}
                  <span className="ml-2 text-caption text-brand-text-muted">{factor.explanation}</span>
                </li>
              );
            })}
          </ul>
        </div>
      ) : null}
    </div>
  );
}

export function ReliabilitySection() {
  const query = useApiQuery(getMyReliability);

  return (
    <Card>
      <CardHeader icon={ShieldCheck}>
        <CardTitle as="h2">My Reliability</CardTitle>
        <CardDescription>
          A transparent, evidence-based record of your event participation. Not a public rating.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {query.loading && <SkeletonCard lines={3} />}
        {!query.loading && query.error && <Alert variant="error">{query.error.message}</Alert>}
        {!query.loading && !query.error && query.data && <StatusBody result={query.data} />}
      </CardContent>
    </Card>
  );
}

export default ReliabilitySection;
