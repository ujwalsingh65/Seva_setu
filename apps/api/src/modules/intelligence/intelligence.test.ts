import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  analyzeEventContext,
  validateIntelligenceResult,
  intelligenceSchema,
  type EventIntelligenceContext,
} from './intelligenceService.js';

function baseContext(overrides: Partial<EventIntelligenceContext> = {}): EventIntelligenceContext {
  return {
    event: { id: 'e1', title: 'Food Drive', status: 'published', event_type: 'standard', urgency: null, start_at: '2026-10-20T00:00:00Z', end_at: '2026-10-20T04:00:00Z', response_deadline: null },
    requirements_defined: true,
    shifts_defined: true,
    required_headcount: 8,
    confirmed_assignments: 5,
    pending_invitations: 0,
    unfilled_positions: 3,
    requirements: [
      { role: 'Distribution', headcount: 6, required_skills: 0, required_certifications: 0, eligible_candidates: 9, certified_candidates: 9, has_certification_requirement: false },
      { role: 'Medic', headcount: 2, required_skills: 1, required_certifications: 1, eligible_candidates: 2, certified_candidates: 0, has_certification_requirement: true },
    ],
    scheduling_conflicts: 0,
    emergency: null,
    ...overrides,
  };
}

describe('analyzeEventContext', () => {
  it('detects staffing gaps with evidence', () => {
    const result = analyzeEventContext(baseContext());
    assert.equal(result.readiness.status, 'needs_attention');
    const staffing = result.risks.find((risk) => risk.type === 'staffing');
    assert.ok(staffing);
    assert.equal((staffing!.evidence as { unfilled: number }).unfilled, 3);
  });

  it('flags zero certified candidates for a certification-required role', () => {
    const result = analyzeEventContext(baseContext());
    const cert = result.risks.find((risk) => risk.type === 'certification');
    assert.ok(cert);
    assert.match(cert!.explanation, /certification/);
  });

  it('critical when no requirements are defined', () => {
    const result = analyzeEventContext(baseContext({ requirements_defined: false, required_headcount: 0, unfilled_positions: 0, confirmed_assignments: 0 }));
    assert.equal(result.readiness.status, 'critical');
    assert.ok(result.risks.some((risk) => risk.type === 'data_quality'));
  });

  it('emergency context reports deadline pressure and understaffing', () => {
    const result = analyzeEventContext(
      baseContext({
        event: { ...baseContext().event, event_type: 'emergency', urgency: 'high', response_deadline: new Date(Date.now() + 30 * 60000).toISOString() },
        emergency: { response_deadline: new Date(Date.now() + 30 * 60000).toISOString(), required: 8, confirmed: 4, pending: 6, backups: 3, minutes_to_deadline: 30 },
      }),
    );
    assert.equal(result.readiness.status, 'critical');
    assert.ok(result.risks.some((risk) => risk.type === 'emergency' && risk.title === 'Emergency understaffed'));
    assert.ok(result.risks.some((risk) => risk.type === 'emergency' && risk.title === 'Response deadline approaching'));
  });

  it('ready event produces ready status and no risks', () => {
    const result = analyzeEventContext(
      baseContext({
        required_headcount: 5,
        confirmed_assignments: 5,
        unfilled_positions: 0,
        requirements: [{ role: 'Setup', headcount: 5, required_skills: 0, required_certifications: 0, eligible_candidates: 6, certified_candidates: 6, has_certification_requirement: false }],
      }),
    );
    assert.equal(result.readiness.status, 'ready');
    assert.equal(result.risks.length, 0);
  });

  it('all recommendations trace to concrete conditions', () => {
    const result = analyzeEventContext(baseContext());
    assert.ok(result.recommendations.every((rec) => rec.title.length > 0 && rec.explanation.length > 0));
  });
});

describe('validateIntelligenceResult', () => {
  it('accepts the rules output (schema-valid by construction)', () => {
    const validated = validateIntelligenceResult(analyzeEventContext(baseContext()));
    assert.ok(validated);
    assert.equal(validated!.readiness.status, 'needs_attention');
  });

  it('rejects malformed LLM output safely', () => {
    assert.equal(validateIntelligenceResult({ summary: 42 }), null);
    assert.equal(validateIntelligenceResult({ summary: 'x', readiness: { status: 'amazing', reasons: [] }, risks: [], recommendations: [], requirement_insights: [] }), null);
    assert.equal(validateIntelligenceResult(null), null);
    assert.equal(validateIntelligenceResult('garbage'), null);
  });

  it('schema requires evidence objects on risks', () => {
    const bad = { summary: 'x', readiness: { status: 'ready', reasons: [] }, risks: [{ type: 'staffing', severity: 'high', title: 't', explanation: 'e', recommendation: 'r' }], recommendations: [], requirement_insights: [] };
    assert.equal(intelligenceSchema.safeParse(bad).success, false);
  });
});
