/**
 * Clerk JWT Verification Middleware
 *
 * Verifies the Clerk session token present in the `Authorization: Bearer <token>` header.
 * On success, attaches the decoded `clerkUserId` and `appRole` to `req.auth`.
 * `appRole` is read from the Supabase `users` table — it is NEVER trusted from the JWT claims
 * directly, preventing frontend role spoofing.
 *
 * Security note: roles come from our DB, not Clerk metadata.
 */
import type { Request, Response, NextFunction } from 'express';
import { verifyToken } from '@clerk/backend';
import { supabaseAdmin } from '../lib/supabase.js';
import { config } from '../config/env.js';
import { AppError } from './errorHandler.js';

// Augment Express Request with our auth context
declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      auth?: {
        clerkUserId: string;
        appUserId: string;
        appRole: string;
        userStatus: string;
      };
    }
  }
}

/**
 * requireAuth — hard gate: 401 if no valid session token.
 */
export async function requireAuth(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader?.startsWith('Bearer ')) {
      throw new AppError('Missing or invalid authorization header', 401, 'UNAUTHORIZED');
    }

    const token = authHeader.slice(7);

    // Verify token with Clerk
    if (!config.clerk.secretKey) {
      throw new Error('CLERK_SECRET_KEY is not configured');
    }

    let clerkUserId: string;
    try {
      const payload = await verifyToken(token, {
        secretKey: config.clerk.secretKey,
        authorizedParties: [config.frontendUrl],
      });
      if (!payload.sub) {
        throw new AppError('Invalid session token', 401, 'TOKEN_INVALID');
      }
      clerkUserId = payload.sub;
    } catch {
      throw new AppError('Invalid or expired session token', 401, 'TOKEN_INVALID');
    }

    // Load the user record from Supabase — the authoritative role source
    const { data: user, error } = await supabaseAdmin
      .from('users')
      .select('id, role, status')
      .eq('clerk_user_id', clerkUserId)
      .single();

    if (error || !user) {
      // User has a valid Clerk token but doesn't exist in our DB yet.
      // This can happen during the brief window after Clerk signup before
      // the webhook has been processed.
      throw new AppError(
        'User account not found. Please complete registration.',
        403,
        'USER_NOT_FOUND'
      );
    }

    if (user.status !== 'active') {
      throw new AppError(
        `Account is ${user.status}. Please contact support.`,
        403,
        'ACCOUNT_INACTIVE'
      );
    }

    req.auth = {
      clerkUserId,
      appUserId: user.id,
      appRole: user.role,
      userStatus: user.status,
    };

    next();
  } catch (err) {
    next(err);
  }
}

/**
 * requireRole — must be used AFTER requireAuth.
 * Accepts one or more allowed roles.
 */
export function requireRole(...allowedRoles: string[]) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    if (!req.auth) {
      return next(new AppError('Authentication required', 401, 'UNAUTHORIZED'));
    }

    if (!allowedRoles.includes(req.auth.appRole)) {
      return next(
        new AppError(
          `Access denied. Required role: ${allowedRoles.join(' or ')}`,
          403,
          'FORBIDDEN'
        )
      );
    }

    next();
  };
}
