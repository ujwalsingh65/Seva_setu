import React, { useEffect, useState } from 'react';
import { Sparkles, AlertTriangle, CheckCircle2, Info, Wrench, RefreshCw } from 'lucide-react';
import { useApiMutation, useApiQuery } from '../../hooks/useApi';
import { apiClient } from '../../services/api/client';
import { getErrorMessage } from '../../utils/format';
import {
  Alert,
  Badge,
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '../ui';

interface IntelligenceResult {
  provider: 'llm' | 'rules';
  fallback?: boolean;
  tools_used?: string[];
  fingerprint?: string;
  summary: string;
  readiness: { status: 'ready' | 'needs_attention' | 'critical'; reasons: string[] };
  risks: Array<{ type: string; severity: 'low' | 'medium' | 'high'; title: string; explanation: string; evidence: Record<string, unknown>; recommendation: string }>;
  recommendations: Array<{ title: string; explanation: string; action_type: string | null }>;
  requirement_insights: Array<{ requirement: string; source: 'explicit' | 'inferred'; note: string }>;
  context_summary: { confirmed: number; required: number; unfilled: number; conflicts: number };
}

/**
 * Action types the agent may recommend. Each maps to an existing NGO
 * workflow; the agent itself never executes any of them. Unknown action
 * types are rendered as plain text (no invented endpoints).
 */
const HANDOFF_ACTIONS: Record<string, string> = {
  view_matching: 'Review matching',
  view_roster: 'Review roster',
  edit_event: 'Edit event',
  emergency_mobilization: 'Open emergency mobilization',
};

interface EventIntelligencePanelProps {
  ngoId: string;
  eventId: string;
  /** Handoff into existing workflows — never executed by the agent. */
  onAction?: (actionType: string) => void;
}

export function EventIntelligencePanel({ ngoId, eventId, onAction }: EventIntelligencePanelProps) {
  const [result, setResult] = useState<IntelligenceResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [analyzedFingerprint, setAnalyzedFingerprint] = useState<string | null>(null);

  // Freshness: current fingerprint of the event's operational context.
  const freshness = useApiQuery(
    async (token) => {
      const { data } = await apiClient<{ fingerprint: string }>(
        `/ngos/${ngoId}/events/${eventId}/intelligence/fingerprint`,
        { token },
      );
      return data;
    },
    [ngoId, eventId, result?.fingerprint ?? null],
  );

  const stale =
    analyzedFingerprint !== null &&
    freshness.data !== null &&
    freshness.data.fingerprint !== analyzedFingerprint;

  // While an analysis is displayed, re-check freshness when the tab regains
  // focus and on a light interval so roster/requirement edits made elsewhere
  // on the page surface the "data changed" warning.
  useEffect(() => {
    if (!result) return;
    const onFocus = () => freshness.refetch();
    window.addEventListener('focus', onFocus);
    const timer = window.setInterval(() => freshness.refetch(), 30000);
    return () => {
      window.removeEventListener('focus', onFocus);
      window.clearInterval(timer);
    };
  }, [result, freshness.refetch]);

  const mutation = useApiMutation(async (token: string) => {
    const { data } = await apiClient<IntelligenceResult>(`/ngos/${ngoId}/events/${eventId}/intelligence`, { method: 'POST', token });
    return data;
  });

  const analyze = async () => {
    setError(null);
    try {
      const next = await mutation.mutate();
      setResult(next);
      setAnalyzedFingerprint(next.fingerprint ?? null);
    } catch (err) {
      setError(getErrorMessage(err));
    }
  };

  return (
    <Card>
      <CardHeader icon={Sparkles}>
        <CardTitle as="h2">Event Intelligence</CardTitle>
        <CardDescription>Operational copilot over your live staffing, certification, and emergency data.</CardDescription>
      </CardHeader>
      <CardContent>
        <Button loading={mutation.pending} onClick={() => void analyze()} variant={result ? 'secondary' : 'primary'}>
          {result ? 'Analyze again' : 'Analyze event'}
        </Button>

        {error && <Alert variant="error" className="mt-4">{error}</Alert>}

        {stale && (
          <Alert variant="warning" className="mt-4">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
              <span>Event data changed since this analysis.</span>
              <Button size="sm" variant="secondary" leadingIcon={RefreshCw} loading={mutation.pending} onClick={() => void analyze()}>
                Analyze again
              </Button>
            </div>
          </Alert>
        )}

        {result && (
          <div className="mt-4 space-y-4">
            <div className="flex items-center gap-2">
              {result.readiness.status === 'ready' ? (
                <CheckCircle2 className="h-5 w-5 text-brand-green" />
              ) : (
                <AlertTriangle className={`h-5 w-5 ${result.readiness.status === 'critical' ? 'text-red-600' : 'text-amber-600'}`} />
              )}
              <p className="text-h3 text-brand-text">
                {result.readiness.status === 'ready' ? 'Ready' : result.readiness.status === 'critical' ? 'Critical gaps' : 'Needs attention'}
              </p>
              <Badge variant="neutral" size="sm">{result.provider === 'llm' ? 'AI-assisted' : 'Deterministic rules'}{result.fallback ? ' (AI fell back)' : ''}</Badge>
            </div>

            <p className="text-small text-brand-text-secondary">{result.summary}</p>

            <p className="text-caption text-brand-text-muted">
              {result.context_summary.confirmed} of {result.context_summary.required} confirmed · {result.context_summary.unfilled} unfilled · {result.context_summary.conflicts} scheduling conflict(s)
            </p>

            {result.tools_used && result.tools_used.length > 0 && (
              <p className="flex items-center gap-1 text-caption text-brand-text-muted">
                <Wrench className="h-3 w-3" />
                Evidence sources: {result.tools_used.join(', ')}
              </p>
            )}

            {result.risks.length > 0 && (
              <div>
                <p className="text-caption font-medium text-brand-text-muted">Risks</p>
                <ul className="mt-1 space-y-2">
                  {result.risks.map((risk, index) => (
                    <li key={index} className="text-small text-brand-text-secondary">
                      <span className={`font-medium ${risk.severity === 'high' ? 'text-red-700' : risk.severity === 'medium' ? 'text-amber-700' : ''}`}>
                        [{risk.severity}] {risk.title}
                      </span>{' '}— {risk.explanation}
                      <span className="block text-caption text-brand-text-muted">→ {risk.recommendation}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {result.recommendations.length > 0 && (
              <div>
                <p className="text-caption font-medium text-brand-text-muted">Recommended actions</p>
                <ul className="mt-1 space-y-2">
                  {result.recommendations.map((recommendation, index) => (
                    <li key={index} className="text-small text-brand-text-secondary">
                      <Info className="mr-1 inline h-3 w-3" />
                      <span className="font-medium">{recommendation.title}</span> — {recommendation.explanation}
                      {recommendation.action_type && HANDOFF_ACTIONS[recommendation.action_type] && onAction && (
                        <Button
                          size="sm"
                          variant="secondary"
                          className="ml-2"
                          onClick={() => onAction(recommendation.action_type!)}
                        >
                          {HANDOFF_ACTIONS[recommendation.action_type]}
                        </Button>
                      )}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {result.requirement_insights.length > 0 && (
              <div>
                <p className="text-caption font-medium text-brand-text-muted">Requirements</p>
                <ul className="mt-1 space-y-1">
                  {result.requirement_insights.map((insight, index) => (
                    <li key={index} className="text-small text-brand-text-secondary">
                      {insight.requirement} <span className="text-caption text-brand-text-muted">({insight.source}) — {insight.note}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        )}

        {!result && !mutation.pending && !error && (
          <p className="mt-4 text-small text-brand-text-muted">
            Run an analysis to inspect staffing, certification, scheduling, and emergency readiness. The agent recommends — it never changes your roster.
          </p>
        )}
      </CardContent>
    </Card>
  );
}

export default EventIntelligencePanel;
