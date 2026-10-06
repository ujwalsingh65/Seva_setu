import React, { useState } from 'react';
import { Sparkles, AlertTriangle, CheckCircle2, Info } from 'lucide-react';
import { useApiMutation } from '../../hooks/useApi';
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
  summary: string;
  readiness: { status: 'ready' | 'needs_attention' | 'critical'; reasons: string[] };
  risks: Array<{ type: string; severity: 'low' | 'medium' | 'high'; title: string; explanation: string; evidence: Record<string, unknown>; recommendation: string }>;
  recommendations: Array<{ title: string; explanation: string; action_type: string | null }>;
  requirement_insights: Array<{ requirement: string; source: 'explicit' | 'inferred'; note: string }>;
  context_summary: { confirmed: number; required: number; unfilled: number; conflicts: number };
}

export function EventIntelligencePanel({ ngoId, eventId }: { ngoId: string; eventId: string }) {
  const [result, setResult] = useState<IntelligenceResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const mutation = useApiMutation(async (token: string) => {
    const { data } = await apiClient<IntelligenceResult>(`/ngos/${ngoId}/events/${eventId}/intelligence`, { method: 'POST', token });
    return data;
  });

  const analyze = async () => {
    setError(null);
    try {
      setResult(await mutation.mutate());
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
                <ul className="mt-1 space-y-1">
                  {result.recommendations.map((recommendation, index) => (
                    <li key={index} className="text-small text-brand-text-secondary">
                      <Info className="mr-1 inline h-3 w-3" />
                      <span className="font-medium">{recommendation.title}</span> — {recommendation.explanation}
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
