/**
 * SevaSetu Express API Server
 *
 * Architecture: Clerk (auth) → Express middleware → Supabase (data)
 * Roles are ALWAYS sourced from Supabase, never from JWT claims.
 */
import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { config } from './config/env.js';
import { errorHandler } from './middleware/errorHandler.js';
import { authRouter } from './modules/auth/routes.js';
import { handleClerkWebhook } from './modules/auth/webhookHandler.js';
import { coreRouter } from './modules/core/routes.js';
import { matchingRouter } from './modules/matching/routes.js';
import { reliabilityRouter } from './modules/reliability/routes.js';
import { emergencyRouter } from './modules/emergency/routes.js';
import { analyticsRouter } from './modules/analytics/routes.js';
import { karmaRouter } from './modules/karma/routes.js';
import { schedulingRouter } from './modules/scheduling/routes.js';

dotenv.config();

const app = express();

// ─── CORS ────────────────────────────────────────────────────────────────────
app.use(
  cors({
    origin: config.frontendUrl,
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'x-request-id'],
  })
);

// ─── Clerk Webhook (raw body — must run before express.json()) ───────────────
app.post(
  '/api/v1/auth/webhook',
  express.raw({ type: 'application/json' }),
  handleClerkWebhook
);

// ─── Body Parsers ─────────────────────────────────────────────────────────────
app.use(express.json());

// ─── Request Logging (development) ────────────────────────────────────────────
if (config.env !== 'production') {
  app.use((req, _res, next) => {
    const requestId = `req_${Date.now()}`;
    req.headers['x-request-id'] = requestId;
    console.log(`[${new Date().toISOString()}] ${req.method} ${req.path}`);
    next();
  });
}

// ─── Health Check ─────────────────────────────────────────────────────────────
app.get('/api/v1/health', (_req, res) => {
  res.json({
    status: 'ok',
    service: 'sevasetu-api',
    timestamp: new Date().toISOString(),
    env: config.env,
  });
});

// ─── Routes ───────────────────────────────────────────────────────────────────
app.use('/api/v1/auth', authRouter);
app.use('/api/v1', coreRouter);
app.use('/api/v1', matchingRouter);
app.use('/api/v1', analyticsRouter);
app.use('/api/v1', karmaRouter);
app.use('/api/v1', emergencyRouter);
app.use('/api/v1', schedulingRouter);
app.use('/api/v1', reliabilityRouter);

// 404 handler
app.use((_req, res) => {
  res.status(404).json({
    success: false,
    error: { code: 'NOT_FOUND', message: 'Route not found' },
  });
});

// ─── Error Handler (must be last) ─────────────────────────────────────────────
app.use(errorHandler);

// ─── Start ────────────────────────────────────────────────────────────────────
app.listen(config.port, () => {
  console.log(`[SevaSetu API] Listening on port ${config.port} (${config.env})`);
  console.log(`[SevaSetu API] Health: http://localhost:${config.port}/api/v1/health`);
});

export default app;
