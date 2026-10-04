/**
 * Auth Routes
 *
 * POST /api/v1/auth/webhook  — Registered in server.ts (raw body, before JSON parser)
 * GET  /api/v1/auth/me       — Returns current authenticated user's app record
 */
import { Router } from 'express';
import { requireAuth } from '../../middleware/auth.js';
import { supabaseAdmin } from '../../lib/supabase.js';

const router = Router();

/**
 * GET /auth/me
 * Returns the authenticated user's application record (role, status, id).
 * Roles are fetched from Supabase — never from the JWT.
 */
router.get('/me', requireAuth, async (req, res, next) => {
  try {
    const { data: user, error } = await supabaseAdmin
      .from('users')
      .select('id, email, role, status, created_at')
      .eq('id', req.auth!.appUserId)
      .single();

    if (error || !user) {
      res.status(404).json({
        success: false,
        error: { code: 'USER_NOT_FOUND', message: 'User record not found' },
      });
      return;
    }

    res.json({
      success: true,
      data: {
        id: user.id,
        email: user.email,
        role: user.role,
        status: user.status,
        createdAt: user.created_at,
      },
    });
  } catch (err) {
    next(err);
  }
});

export { router as authRouter };
