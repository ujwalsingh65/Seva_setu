# Production deployment on Vercel

SevaSetu is an npm-workspaces monorepo. Deploy the frontend and Express API as
two Vercel projects connected to the same GitHub repository:

- Repository: `ujwalsingh65/Seva_setu`
- Web project (suggested name `seva-setu-web`): root directory `apps/web`
- API project (suggested name `seva-setu-api`): root directory `apps/api`

## Workspace and build settings

Keep the repository-root `package.json` and `package-lock.json` available to
Vercel so npm can install the declared workspaces. In each Vercel project's
Root Directory settings, enable access to source files outside the app root so
the project can resolve `packages/*`. Use the Vite framework preset for the web
project with output directory `dist`. The API's existing
`apps/api/src/server.ts` is the Express entrypoint; Vercel's Express support
deploys that app as a Function without a second server or duplicated routes.
Use Node.js `24.x` for both projects (the current Vercel default and the version
used for local production-style verification).

The web project's `vercel.json` rewrites client-side routes to `index.html` so
BrowserRouter deep links work on direct visits and refreshes.

## Environment variables

Set variables in the matching Vercel project's Environment Variables settings.
Do not commit real values or put server secrets in `VITE_*` variables.

### Web project

- `VITE_CLERK_PUBLISHABLE_KEY` — Clerk publishable key for the frontend.
- `VITE_API_BASE_URL` — deployed API URL ending in `/api/v1`, for example
  `https://<api-domain>/api/v1`. It is required for production builds/runtime;
  local development keeps the `http://localhost:5000/api/v1` default.

### API project

- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY` — server-only.
- `CLERK_SECRET_KEY` — server-only.
- `CLERK_WEBHOOK_SECRET` — server-only.
- `FRONTEND_URL` — the exact deployed web origin, for example
  `https://<web-domain>`; no path or trailing slash.

Optional Event Intelligence provider settings (leave unset to use the
deterministic rules provider):

- `AGENT_LLM_API_KEY` — server-only.
- `AGENT_LLM_BASE_URL`
- `AGENT_LLM_MODEL`

Never expose `SUPABASE_SERVICE_ROLE_KEY`, `CLERK_SECRET_KEY`,
`CLERK_WEBHOOK_SECRET`, or `AGENT_LLM_API_KEY` to the web project.

## Clerk and CORS

Set Clerk's production frontend URL to the deployed web origin. The API uses
`FRONTEND_URL` both as its single allowed CORS origin and as the authorized
party for Clerk session tokens; keep the values identical.

Configure the Clerk production webhook to send the required user events to:

`https://<api-domain>/api/v1/auth/webhook`

Use the webhook signing secret from Clerk as the API project's
`CLERK_WEBHOOK_SECRET` value.

## Deployment order

1. Deploy the API project and copy its production URL.
2. Set the web project's `VITE_API_BASE_URL` to
   `https://<api-domain>/api/v1`, then deploy the web project.
3. Copy the production web URL and set the API project's `FRONTEND_URL` to that
   exact origin; redeploy the API if its environment changed.
4. Configure Clerk's production frontend URL and webhook URL/signing secret.
5. Redeploy affected projects after changing environment variables.
6. Verify `GET https://<api-domain>/api/v1/health`, then smoke-test sign-in,
   authenticated API requests, role checks, and the webhook.

The health response contains only service status and timestamp. Vercel
deployment does not apply the Supabase migrations; confirm migrations 001–005
are already applied to the intended Supabase project before testing live flows.
