/**
 * Supabase admin client — service role bypasses RLS.
 * Used for auth middleware, webhooks, and other trusted server operations.
 */
import { createClient } from '@supabase/supabase-js';
import type { Database } from '@sevasetu/shared-types';
import { config } from '../config/env.js';

const { url, serviceRoleKey } = config.supabase;

if (!url || !serviceRoleKey) {
  console.warn(
    '[Supabase] SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY is not configured. ' +
      'Database operations will fail until these are set in apps/api/.env'
  );
}

export const supabaseAdmin = createClient<Database>(
  url || 'https://placeholder.supabase.co',
  serviceRoleKey || 'placeholder',
  {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  }
);
