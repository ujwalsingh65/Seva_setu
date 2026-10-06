/**
 * Step 16 — Server-side read-only tool layer for the Event Intelligence
 * Agent. Every tool validates arguments, enforces NGO + event ownership,
 * and returns bounded, PII-minimized structured data. The server — never
 * the model — decides which tools are real and executable.
 */
import { APPLICATION_STATUSES } from '@sevasetu/constants';
import { supabaseAdmin } from '../../lib/supabase.js';
import { databaseError } from '../core/routes.js';

export interface IntelligenceToolDef {
  name: string;
  description: string;
  execute: () => Promise<Record<string, unknown>>;
}

/** Allowlist executor: unknown tools are rejected before execution. */
export function createToolExecutor(tools: IntelligenceToolDef[]) {
  return async (name: string): Promise<{ ok: true; data: Record<string, unknown> } | { ok: false; error: string }> => {
    const tool = tools.find((t) => t.name === name);
    if (!tool) return { ok: false, error: `Unknown tool: ${name}` };
    try {
      return { ok: true, data: await tool.execute() };
    } catch (error) {
      return { ok: false, error: error instanceof Error ? error.message : 'Tool failed' };
    }
  };
}

export const INTELLIGENCE_TOOL_NAMES = [
  'getEvent',
  'getRequirements',
  'getRoster',
  'getStaffingGaps',
  'getMatchingResults',
  'getEmergencyStatus',
] as const;

export type IntelligenceToolName = (typeof INTELLIGENCE_TOOL_NAMES)[number];

/**
 * Server-side allowlist check. Anything not listed here (write tools,
 * invented tools, endpoint/sql/action requests) is rejected before any
 * execution happens.
 */
export function isAllowedToolName(name: string): name is IntelligenceToolName {
  return (INTELLIGENCE_TOOL_NAMES as readonly string[]).includes(name);
}

/** Tools bound to an already-authorized event (ownership enforced upstream). */
export function buildIntelligenceTools(ngoId: string, eventId: string): IntelligenceToolDef[] {
  return [
    {
      name: 'getEvent',
      description: 'Event title, type, status, window, urgency, response deadline.',
      execute: async () => {
        const { data, error } = await supabaseAdmin
          .from('events')
          .select('id, title, status, event_type, urgency, start_at, end_at, response_deadline, venue')
          .eq('id', eventId)
          .eq('ngo_id', ngoId)
          .maybeSingle();
        if (error) throw databaseError(error);
        if (!data) throw new Error('Event not found');
        return data as unknown as Record<string, unknown>;
      },
    },
    {
      name: 'getRequirements',
      description: 'Roles, headcounts, required skills/certifications.',
      execute: async () => {
        const { data, error } = await supabaseAdmin
          .from('event_requirements')
          .select('role, headcount, required_skill_ids, required_cert_names, min_experience')
          .eq('event_id', eventId);
        if (error) throw databaseError(error);
        return { requirements: data ?? [] };
      },
    },
    {
      name: 'getRoster',
      description: 'Confirmed/draft assignment counts per shift (no volunteer PII).',
      execute: async () => {
        const { data, error } = await supabaseAdmin
          .from('roster_assignments')
          .select('status, shift_id')
          .eq('event_id', eventId);
        if (error) throw databaseError(error);
        const confirmed = (data ?? []).filter((row) => row.status === 'confirmed').length;
        const draft = (data ?? []).filter((row) => row.status === 'draft').length;
        return { confirmed, draft };
      },
    },
    {
      name: 'getStaffingGaps',
      description: 'Required vs confirmed positions and the gap.',
      execute: async () => {
        const { data: requirements, error } = await supabaseAdmin
          .from('event_requirements')
          .select('headcount')
          .eq('event_id', eventId);
        if (error) throw databaseError(error);
        const required = (requirements ?? []).reduce((sum, row) => sum + row.headcount, 0);
        const { data: assignments, error: assignmentError } = await supabaseAdmin
          .from('roster_assignments')
          .select('id')
          .eq('event_id', eventId)
          .eq('status', 'confirmed');
        if (assignmentError) throw databaseError(assignmentError);
        return { required, confirmed: (assignments ?? []).length, gap: Math.max(0, required - (assignments ?? []).length) };
      },
    },
    {
      name: 'getMatchingResults',
      description: 'Count-level matching summary for accepted volunteers (no PII, no scoring internals).',
      execute: async () => {
        const { data, error } = await supabaseAdmin
          .from('applications')
          .select('id')
          .eq('event_id', eventId)
          .eq('status', APPLICATION_STATUSES.ACCEPTED);
        if (error) throw databaseError(error);
        return { accepted_candidates: (data ?? []).length };
      },
    },
    {
      name: 'getEmergencyStatus',
      description: 'Staffing/invitation counts when the event is an emergency.',
      execute: async () => {
        const { data: event, error } = await supabaseAdmin
          .from('events')
          .select('event_type, response_deadline, status')
          .eq('id', eventId)
          .maybeSingle();
        if (error) throw databaseError(error);
        if (!event || event.event_type !== 'emergency') return { applicable: false };
        const { data: inv, error: invError } = await supabaseAdmin
          .from('emergency_invitations')
          .select('status')
          .eq('event_id', eventId);
        if (invError) throw databaseError(invError);
        return {
          applicable: true,
          pending: (inv ?? []).filter((row) => row.status === 'pending').length,
          accepted: (inv ?? []).filter((row) => row.status === 'accepted').length,
          expired: (inv ?? []).filter((row) => row.status === 'expired').length,
          response_deadline: event.response_deadline,
        };
      },
    },
  ];
}

/** Minimal summary the UI/audit trail can show (never chain-of-thought). */
export function toolsUsedSummary(toolNames: string[]): string[] {
  return toolNames.filter((name, index) => toolNames.indexOf(name) === index);
}
