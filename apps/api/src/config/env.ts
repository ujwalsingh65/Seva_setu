import dotenv from 'dotenv';
dotenv.config();

export const config = {
  env: process.env.NODE_ENV || 'development',
  port: parseInt(process.env.PORT || '5000', 10),
  frontendUrl: process.env.FRONTEND_URL || 'http://localhost:5173',
  clerk: {
    secretKey: process.env.CLERK_SECRET_KEY || '',
    webhookSecret: process.env.CLERK_WEBHOOK_SECRET || '',
  },
  supabase: {
    url: process.env.SUPABASE_URL || '',
    anonKey: process.env.SUPABASE_ANON_KEY || '',
    serviceRoleKey: process.env.SUPABASE_SERVICE_ROLE_KEY || '',
  },
  firebase: {
    projectId: process.env.FIREBASE_PROJECT_ID || '',
    clientEmail: process.env.FIREBASE_CLIENT_EMAIL || '',
    privateKey: process.env.FIREBASE_PRIVATE_KEY || '',
  },
  agent: {
    serviceUrl: process.env.AGENT_SERVICE_URL || 'http://localhost:8000',
    secret: process.env.AGENT_SERVICE_SECRET || '',
    // Event Intelligence LLM (Step 16) — optional. When unset, the
    // deterministic rules provider is used and the response says so.
    llmApiKey: process.env.AGENT_LLM_API_KEY || '',
    llmBaseUrl: process.env.AGENT_LLM_BASE_URL || '',
    llmModel: process.env.AGENT_LLM_MODEL || '',
  },
  logLevel: process.env.LOG_LEVEL || 'info',
};
