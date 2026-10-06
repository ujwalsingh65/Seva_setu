/**
 * Step 16 — Event Intelligence Agent (domain layer).
 *
 * Strict two-layer architecture:
 *   LAYER 1 — reasoning/explanation (this file + provider) which may use an
 *             LLM to phrase results, always validated against Zod schema.
 *   LAYER 2 — deterministic SevaSetu systems (matching/reliability/
 *             scheduling/emergency/transparency) remain authoritative.
 *
 * The deterministic analyzer below IS the rules provider: it produces the
 * same structured output the LLM is asked for, so the UI works (and is
 * honest to label) even when no AI credentials exist. When an LLM provider
 * IS configured, its output is validated against the same schema and only
 * then used; failures fall back to the rules provider.
 *
 * No autonomy: everything here is advisory. No LLM result can modify
 * authoritative data.
 */
import { z } from 'zod';

// ---------------------------------------------------------------------------
// Structured output schema
// ---------------------------------------------------------------------------

export const intelligenceRiskSchema = z.object({
  type: z.enum(['staffing', 'certification', 'scheduling', 'emergency', 'data_quality']),
  severity: z.enum(['low', 'medium', 'high']),
  title: z.string(),
  explanation: z.string(),
  evidence: z.record(z.string(), z.union([z.number(), z.string(), z.boolean(), z.null()])),
  recommendation: z.string(),
});

export const intelligenceSchema = z.object({
  summary: z.string(),
  readiness: z.object({
    status: z.enum(['ready', 'needs_attention', 'critical']),
    reasons: z.array(z.string()),
  }),
  risks: z.array(intelligenceRiskSchema),
  recommendations: z.array(z.object({ title: z.string(), explanation: z.string(), action_type: z.string().nullable() })),
  requirement_insights: z.array(
    z.object({ requirement: z.string(), source: z.enum(['explicit', 'inferred']), note: z.string() }),
  ),
});

export type EventIntelligence = z.infer<typeof intelligenceSchema>;

// ---------------------------------------------------------------------------
// Deterministic context (server-built facts only)
// ---------------------------------------------------------------------------

export interface EventIntelligenceContext {
  event: { id: string; title: string; status: string; event_type: string; urgency: string | null; start_at: string; end_at: string; response_deadline: string | null };
  requirements_defined: boolean;
  shifts_defined: boolean;
  required_headcount: number;
  confirmed_assignments: number;
  pending_invitations: number;
  unfilled_positions: number;
  requirements: Array<{
    role: string;
    headcount: number;
    required_skills: number;
    required_certifications: number;
    eligible_candidates: number;
    certified_candidates: number;
    has_certification_requirement: boolean;
  }>;
  scheduling_conflicts: number;
  emergency: null | {
    response_deadline: string | null;
    required: number;
    confirmed: number;
    pending: number;
    backups: number;
    minutes_to_deadline: number | null;
  };
}

/** Deterministic operational analysis — the rules provider's structured result. */
export function analyzeEventContext(context: EventIntelligenceContext): EventIntelligence {
  const risks: EventIntelligence['risks'] = [];
  const recommendations: EventIntelligence['recommendations'] = [];
  const readinessReasons: string[] = [];
  let readinessStatus: 'ready' | 'needs_attention' | 'critical' = 'ready';

  if (!context.requirements_defined) {
    readinessStatus = 'critical';
    risks.push({
      type: 'data_quality',
      severity: 'high',
      title: 'No staffing requirements defined',
      explanation: 'The event has no role/headcount requirements, so staffing cannot be verified.',
      evidence: { requirements_defined: false },
      recommendation: 'Add at least one staffing requirement to this event.',
    });
    recommendations.push({ title: 'Define staffing requirements', explanation: 'Add roles and headcounts so the scheduler and matching engine can plan.', action_type: 'edit_event' });
  }

  if (!context.shifts_defined && context.requirements_defined) {
    readinessReasons.push('Shifts not configured yet');
    risks.push({
      type: 'data_quality',
      severity: 'medium',
      title: 'No shifts configured',
      explanation: 'Assignments cannot be generated until shift windows exist.',
      evidence: { shifts_defined: false },
      recommendation: 'Generate a draft roster to derive shift coverage.',
    });
  }

  if (context.required_headcount > 0) {
    const gap = context.unfilled_positions;
    if (gap > 0) {
      readinessStatus = gap === context.required_headcount ? 'critical' : 'needs_attention';
      readinessReasons.push(`${gap} of ${context.required_headcount} positions unfilled`);
      risks.push({
        type: 'staffing',
        severity: gap === context.required_headcount ? 'high' : 'medium',
        title: 'Volunteer shortage',
        explanation: `The event requires ${context.required_headcount} volunteers but only ${context.confirmed_assignments} are confirmed.`,
        evidence: { required: context.required_headcount, confirmed: context.confirmed_assignments, unfilled: gap },
        recommendation: 'Review eligible matching candidates and generate or top up the roster.',
      });
      recommendations.push({ title: 'Fill remaining positions', explanation: `${gap} position(s) remain open; review deterministic matching results.`, action_type: 'view_matching' });
    } else {
      readinessReasons.push('All required positions are confirmed');
    }
  }

  for (const requirement of context.requirements) {
    if (requirement.has_certification_requirement && requirement.certified_candidates === 0) {
      readinessStatus = readinessStatus === 'ready' ? 'needs_attention' : readinessStatus;
      readinessReasons.push(`${requirement.role}: no certified eligible candidate`);
      risks.push({
        type: 'certification',
        severity: 'high',
        title: `Certification coverage gap — ${requirement.role}`,
        explanation: `This role requires a verified certification and no currently eligible candidate holds one.`,
        evidence: { role: requirement.role, certified_candidates: 0 },
        recommendation: 'Relax a requirement, extend the search, or recruit certified volunteers.',
      });
      recommendations.push({ title: `Review ${requirement.role} certification requirements`, explanation: 'No eligible candidate satisfies the certification requirement.', action_type: 'view_matching' });
    }
    if (requirement.eligible_candidates === 0) {
      risks.push({
        type: 'staffing',
        severity: 'medium',
        title: `No eligible volunteers for ${requirement.role}`,
        explanation: 'Current gates (skills/certs/availability/conflicts) would exclude every known candidate.',
        evidence: { role: requirement.role, eligible_candidates: 0 },
        recommendation: 'Review requirements or widen the candidate pool.',
      });
    }
  }

  if (context.scheduling_conflicts > 0) {
    readinessStatus = readinessStatus === 'ready' ? 'needs_attention' : readinessStatus;
    risks.push({
      type: 'scheduling',
      severity: 'high',
      title: 'Scheduling conflicts detected',
      explanation: `${context.scheduling_conflicts} volunteer assignment(s) overlap another commitment.`,
      evidence: { scheduling_conflicts: context.scheduling_conflicts },
      recommendation: 'Review the roster for overlapping or conflicted assignments.',
    });
    recommendations.push({ title: 'Review roster conflicts', explanation: 'Resolve overlapping assignments before confirming the roster.', action_type: 'view_roster' });
  }

  if (context.emergency) {
    const emergency = context.emergency;
    if (emergency.minutes_to_deadline !== null && emergency.minutes_to_deadline <= 60 && emergency.minutes_to_deadline >= 0) {
      risks.push({
        type: 'emergency',
        severity: 'high',
        title: 'Response deadline approaching',
        explanation: `${emergency.minutes_to_deadline} minutes remain for volunteers to respond.`,
        evidence: { minutes_to_deadline: emergency.minutes_to_deadline },
        recommendation: 'Review pending invitations and confirm backup coverage.',
      });
    }
    if (emergency.required > 0 && emergency.confirmed < emergency.required) {
      readinessStatus = 'critical';
      risks.push({
        type: 'emergency',
        severity: 'high',
        title: 'Emergency understaffed',
        explanation: `${emergency.confirmed} of ${emergency.required} emergency positions are confirmed.`,
        evidence: { required: emergency.required, confirmed: emergency.confirmed },
        recommendation: 'Mobilize or replace volunteers using the emergency workflow.',
      });
      recommendations.push({ title: 'Open emergency mobilization', explanation: 'Use the existing mobilization flow to fill remaining positions.', action_type: 'emergency_mobilization' });
    }
  }

  let summary: string;
  if (readinessStatus === 'critical') summary = `This event needs urgent attention: ${readinessReasons.join('; ') || 'critical operational gaps'}.`;
  else if (readinessStatus === 'needs_attention') summary = `This event is workable but needs follow-up: ${readinessReasons.join('; ') || 'minor gaps'}.`;
  else summary = 'This event looks operationally ready.';

  const requirementInsights: EventIntelligence['requirement_insights'] = context.requirements.map((requirement) => ({
    requirement: `${requirement.role}: ${requirement.headcount} volunteer(s)`,
    source: 'explicit' as const,
    note: requirement.has_certification_requirement ? `Requires ${requirement.required_certifications} certification(s).` : 'Skills/availability gated.',
  }));

  return {
    summary,
    readiness: { status: readinessStatus, reasons: readinessReasons },
    risks,
    recommendations,
    requirement_insights: requirementInsights,
  };
}

/** Validate arbitrary model output; returns null when invalid. */
export function validateIntelligenceResult(raw: unknown): EventIntelligence | null {
  const parsed = intelligenceSchema.safeParse(raw);
  return parsed.success ? parsed.data : null;
}

/**
 * Stale-data fingerprint: same relevant operational facts ⇒ same string.
 * Derived from counts + deadlines, not timestamps, so it changes exactly
 * when the facts the analysis relied on change.
 */
export function buildContextFingerprint(context: EventIntelligenceContext): string {
  const parts = [
    context.event.status,
    context.event.start_at,
    context.event.end_at,
    context.event.response_deadline ?? '',
    String(context.required_headcount),
    String(context.confirmed_assignments),
    String(context.unfilled_positions),
    String(context.scheduling_conflicts),
    String(context.shifts_defined),
    ...context.requirements.map(
      (row) => `${row.role}:${row.headcount}:${row.eligible_candidates}:${row.certified_candidates}`,
    ),
    context.emergency ? `${context.emergency.required}:${context.emergency.confirmed}:${context.emergency.pending}` : '',
  ];
  return parts.join('|');
}
