/**
 * Clerk Webhook Handler — User Synchronization
 *
 * Listens for Clerk lifecycle events and keeps the Supabase `users` table
 * in sync.  All webhook payloads are verified with the CLERK_WEBHOOK_SECRET
 * using the svix library (the same library Clerk uses internally).
 *
 * Events handled:
 *   user.created  → INSERT into users (role defaults to 'volunteer')
 *   user.updated  → UPDATE email / metadata
 *   user.deleted  → soft-delete (status = 'disabled')
 */
import type { Request, Response } from 'express';
import { Webhook } from 'svix';
import { supabaseAdmin } from '../../lib/supabase.js';
import { config } from '../../config/env.js';
import { AppError } from '../../middleware/errorHandler.js';

interface ClerkEmailAddress {
  email_address: string;
  id: string;
}

interface ClerkUserData {
  id: string;
  email_addresses: ClerkEmailAddress[];
  primary_email_address_id: string;
  public_metadata?: Record<string, unknown>;
  private_metadata?: Record<string, unknown>;
}

interface ClerkWebhookEvent {
  type: string;
  data: ClerkUserData;
}

function getPrimaryEmail(data: ClerkUserData): string {
  const primary = data.email_addresses.find(
    (e) => e.id === data.primary_email_address_id
  );
  return primary?.email_address ?? data.email_addresses[0]?.email_address ?? '';
}

/**
 * POST /api/v1/auth/webhook
 *
 * Raw body must be available (express.raw middleware applied at route level).
 */
export async function handleClerkWebhook(req: Request, res: Response): Promise<void> {
  const webhookSecret = config.clerk.webhookSecret;
  if (!webhookSecret) {
    console.error('[Webhook] CLERK_WEBHOOK_SECRET is not configured');
    res.status(500).json({ error: 'Webhook not configured' });
    return;
  }

  // Verify signature
  const svixId = req.headers['svix-id'] as string;
  const svixTimestamp = req.headers['svix-timestamp'] as string;
  const svixSignature = req.headers['svix-signature'] as string;

  if (!svixId || !svixTimestamp || !svixSignature) {
    res.status(400).json({ error: 'Missing svix headers' });
    return;
  }

  let event: ClerkWebhookEvent;
  try {
    const wh = new Webhook(webhookSecret);
    event = wh.verify(req.body, {
      'svix-id': svixId,
      'svix-timestamp': svixTimestamp,
      'svix-signature': svixSignature,
    }) as unknown as ClerkWebhookEvent;
  } catch (err) {
    console.error('[Webhook] Signature verification failed:', err);
    res.status(400).json({ error: 'Invalid webhook signature' });
    return;
  }

  const { type, data } = event;
  console.log(`[Webhook] Received event: ${type} for clerk_user_id: ${data.id}`);

  try {
    if (type === 'user.created') {
      const email = getPrimaryEmail(data);
      // Default role is 'volunteer' per the PRD. Role is ONLY changed through
      // controlled backend operations — never set by the frontend or JWT claims.
      const { error } = await supabaseAdmin.from('users').insert({
        clerk_user_id: data.id,
        email,
        role: 'volunteer',
        status: 'active',
      });
      if (error) {
        console.error('[Webhook] user.created insert error:', error);
        // 23505 = unique violation (user already exists — idempotent OK)
        if (error.code !== '23505') {
          throw new AppError('Failed to create user record', 500, 'DB_ERROR');
        }
      } else {
        console.log(`[Webhook] Created user record for ${email}`);
      }
    } else if (type === 'user.updated') {
      const email = getPrimaryEmail(data);
      const { error } = await supabaseAdmin
        .from('users')
        .update({ email, updated_at: new Date().toISOString() })
        .eq('clerk_user_id', data.id);
      if (error) {
        console.error('[Webhook] user.updated error:', error);
      } else {
        console.log(`[Webhook] Updated user record for clerk_user_id: ${data.id}`);
      }
    } else if (type === 'user.deleted') {
      // Soft-delete: preserve data for audit trail
      const { error } = await supabaseAdmin
        .from('users')
        .update({ status: 'disabled', updated_at: new Date().toISOString() })
        .eq('clerk_user_id', data.id);
      if (error) {
        console.error('[Webhook] user.deleted error:', error);
      } else {
        console.log(`[Webhook] Soft-deleted user clerk_user_id: ${data.id}`);
      }
    } else {
      console.log(`[Webhook] Ignoring unhandled event type: ${type}`);
    }

    res.status(200).json({ received: true });
  } catch (err) {
    console.error('[Webhook] Processing error:', err);
    res.status(500).json({ error: 'Webhook processing failed' });
  }
}
