import React from 'react';
import { Users } from 'lucide-react';
import { useApiQuery } from '../../hooks/useApi';
import {
  getNgoEventMatches,
  type EventMatch,
  type MatchFactors,
  type MatchListFactor,
} from '../../services/api/endpoints';
import {
  Alert,
  Badge,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  EmptyState,
  SkeletonCard,
} from '../../components/ui';

interface MatchesPanelProps {
  ngoId: string;
  eventId: string;
}

const FACTOR_LABELS: Record<keyof MatchFactors, string> = {
  skills: 'Skills',
  certifications: 'Certifications',
  availability: 'Availability',
  experience: 'Experience',
  proximity: 'Proximity',
  reliability: 'Reliability',
};

const FACTOR_KEYS = Object.keys(FACTOR_LABELS) as Array<keyof MatchFactors>;

function factorSummary(key: keyof MatchFactors, factor: MatchListFactor): string {
  if (factor.status === 'not_assessable') return `${FACTOR_LABELS[key]}: not assessed`;
  const earned = Math.round((factor.score / 100) * factor.weight);
  const label = factor.label ? ` — ${factor.label}` : '';
  return `${FACTOR_LABELS[key]} ${earned}/${factor.weight}${label}`;
}

function scoreVariant(score: number): 'success' | 'info' | 'neutral' {
  if (score >= 70) return 'success';
  if (score >= 40) return 'info';
  return 'neutral';
}

function MatchCard({ match }: { match: EventMatch }) {
  return (
    <li className="py-4 first:pt-0 last:pb-0">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-small font-medium text-brand-text">{match.volunteer.name}</p>
          {match.volunteer.causes?.length ? (
            <p className="text-caption text-brand-text-muted">
              Causes: {match.volunteer.causes.join(', ')}
            </p>
          ) : null}
          {match.volunteer.bio ? (
            <p className="mt-1 line-clamp-2 text-caption text-brand-text-secondary">{match.volunteer.bio}</p>
          ) : null}
        </div>
        <Badge variant={scoreVariant(match.score)} dot>
          {match.score}% match
        </Badge>
      </div>
      <p className="mt-2 text-caption text-brand-text-muted">
        {FACTOR_KEYS.map((key) => factorSummary(key, match.factors[key])).join(' · ')}
      </p>
      <details className="mt-2">
        <summary className="cursor-pointer text-caption font-medium text-brand-text-secondary hover:text-brand-teal">
          Why this match?
        </summary>
        <ul className="mt-2 space-y-1">
          {FACTOR_KEYS.map((key) => {
            const factor = match.factors[key];
            const names: string[] = [];
            if ('matched' in factor) {
              if (factor.matched.length > 0) names.push(`has: ${factor.matched.join(', ')}`);
              if (factor.missing.length > 0) names.push(`missing: ${factor.missing.join(', ')}`);
            }
            return (
              <li key={key} className="text-caption text-brand-text-secondary">
                {factorSummary(key, factor)}
                {names.length > 0 ? ` (${names.join('; ')})` : ''}
                {factor.status === 'not_assessable' && factor.detail ? ` — ${factor.detail}` : ''}
              </li>
            );
          })}
        </ul>
      </details>
    </li>
  );
}

export function MatchesPanel({ ngoId, eventId }: MatchesPanelProps) {
  const query = useApiQuery((token) => getNgoEventMatches(token, ngoId, eventId), [ngoId, eventId]);
  const matches = query.data?.matches ?? [];
  const total = query.data?.total_candidates ?? 0;

  return (
    <Card>
      <CardHeader icon={Users}>
        <CardTitle as="h2">Suggested volunteers</CardTitle>
        <CardDescription>
          {query.data
            ? `${total} eligible ${total === 1 ? 'candidate' : 'candidates'}${
                matches.length < total ? ` — showing top ${matches.length}` : ''
              }.`
            : 'Ranked by an explainable weighted score across skills, certifications, availability, and proximity.'}
        </CardDescription>
      </CardHeader>
      <CardContent>
        {query.loading && <SkeletonCard lines={4} />}

        {!query.loading && query.error && <Alert variant="error">{query.error?.message}</Alert>}

        {!query.loading && !query.error && matches.length === 0 && (
          <EmptyState
            icon={Users}
            title="No suitable volunteers found"
            description="No suitable volunteers found for this event yet."
          />
        )}

        {!query.loading && !query.error && matches.length > 0 && (
          <ul className="divide-y divide-brand-border">
            {matches.map((match) => (
              <MatchCard key={match.volunteer_id} match={match} />
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}

export default MatchesPanel;
