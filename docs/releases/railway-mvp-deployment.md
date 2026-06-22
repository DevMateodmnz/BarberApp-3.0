# Railway MVP Deployment Runbook

This runbook defines the initial publication path for deploying the BarberApp API to Railway without provisioning anything automatically from this repository.

## Cost model

Railway pricing is usage-based. You pay for your selected account plan plus the CPU, memory, storage, and network resources the project actually consumes.

Before any real rollout:

- enable Railway usage limits / cost controls
- review project usage regularly
- set alerts or billing guardrails appropriate for the MVP

Do not assume a fixed monthly total from this document alone.

## Target architecture

- **API service**: Railway application service running the Express API
- **Database service**: Railway PostgreSQL in the same project
- **Repository layout**: shared npm monorepo, built from the repository root
- **Health check**: `/health`
- **Port binding**: Railway-injected `PORT`
- **Migrations**: run via Railway pre-deploy command before API start
- **Production env**: secrets and CORS origin stay in Railway variables

## Account and project preparation

1. Create or sign in to the Railway account.
2. Create a new Railway project.
3. Add a **PostgreSQL** service to the project.
4. Add an **Empty Service** (or GitHub-backed service) for the API.
5. Connect the GitHub repository to that API service.
6. Keep the service **Root Directory** at `/` because this monorepo depends on:
   - `package-lock.json`
   - root `package.json` workspaces
   - `tsconfig.base.json`
7. Point the service at the repository branch only **after** publication approval.

`railway.json` cannot safely provision the PostgreSQL service itself, so database creation remains a Railway dashboard/CLI step.

## Config-as-code and service settings

This repository includes `railway.json` at the repository root. The intended API service settings are:

- clean local reproduction install command:

  ```bash
  npm ci
  ```

- builder: `RAILPACK`
- build command:

  ```bash
  npm run db:generate --workspace @barberapp/api && npm run build --workspace @barberapp/api
  ```

- pre-deploy command:

  ```bash
  npm run db:migrate:deploy --workspace @barberapp/api
  ```

- start command:

  ```bash
  node apps/api/dist/index.js
  ```

- health check path: `/health`
- health check timeout: `120`
- restart policy: `ON_FAILURE` with bounded retries
- draining window: `30` seconds

Important:

- The start command runs `node` directly so the API process receives `SIGTERM` cleanly on Railway.
- The pre-deploy command runs in a separate container and must not depend on mutable local filesystem state.
- Do not add a Dockerfile unless the monorepo stops building deterministically with the native Railpack path.

## Required Railway environment variables

Set these on the API service:

| Variable | Required | Value source |
|---|---:|---|
| `NODE_ENV` | yes | `production` |
| `DATABASE_URL` | yes | reference variable: `${{Postgres.DATABASE_URL}}` |
| `CLERK_SECRET_KEY` | yes | Clerk production backend secret |
| `CLERK_WEBHOOK_SECRET` | yes | Clerk production webhook signing secret |
| `ALLOWED_ORIGIN` | yes | chosen production browser origin(s) |
| `RATE_LIMIT_ENABLED` | no | optional override |
| `RATE_LIMIT_WINDOW_MS` | no | optional override |
| `RATE_LIMIT_MAX` | no | optional override |

Notes:

- `DATABASE_URL` should be created as a Railway reference variable so it tracks PostgreSQL credential changes automatically.
- Do not store any real value in the repository.
- `PORT` is provided by Railway automatically and must not be hardcoded.

## Clerk setup

Before a real deployment:

1. Create or confirm the production Clerk environment.
2. Set the API service secrets:
   - `CLERK_SECRET_KEY`
   - `CLERK_WEBHOOK_SECRET`
3. Configure the production Clerk webhook URL to:

   ```text
   https://<your-api-domain>/api/v1/webhooks/clerk
   ```

4. Confirm the mobile app is pointed at the correct production API URL during its own build/distribution flow.

Do not commit Clerk production keys, webhook secrets, or domains.

## Database and migration rules

- Run `prisma migrate deploy` before application startup.
- Do **not** use `prisma db push` in production.
- Do **not** run demo seed data.
- Do **not** run `qa:bootstrap` in production.
- Take responsibility for the first production backup/snapshot before schema changes.

Railway notes:

- Railway PostgreSQL exposes `DATABASE_URL` and related connection variables to sibling services.
- Railway database services are not hands-off from an application-ops perspective; backup and recovery choices still need to be configured and verified.
- Evaluate and enable Railway backups / PITR before real customer data if the MVP will hold non-disposable records.

## Deployment verification

After a real Railway deployment:

1. Confirm the deployment becomes healthy in Railway.
2. Verify:

   ```bash
   curl https://<api-domain>/health
   curl https://<api-domain>/api/v1/ping
   ```

3. Verify CORS:
   - allowed browser origin gets the exact `Access-Control-Allow-Origin`
   - rejected origin gets no permissive CORS header
   - no-Origin request still works
4. Verify authenticated API smoke:
   - OWNER flow
   - BARBER flow
5. Verify Clerk webhook delivery to `/api/v1/webhooks/clerk`
6. Verify a database write/read smoke operation succeeds

`/health` is currently a **liveness** endpoint only. It proves the process is running, not that the database or Clerk are healthy.

## Rollback and incident handling

- Roll back the application deployment in Railway if the code release is bad.
- Remember that schema migrations do **not** automatically roll back with the app.
- If a migration causes trouble, use a forward fix or restore according to the backup/recovery plan.
- Preserve pre-migration backups until the release is accepted.
- If data integrity is uncertain, disable public traffic first and investigate before resuming writes.

## Monitoring and resource review

Watch at minimum:

- memory usage
- CPU usage
- PostgreSQL storage growth
- application logs
- restart count / crash loops
- failed deployments
- monthly usage and billing alerts

## Publication gate

Do not deploy directly from unpublished local history.

Required gate before any external Railway rollout:

1. push a dedicated release branch (not local-only `main`)
2. let GitHub Actions CI pass remotely
3. review the release diff / PR
4. obtain explicit approval to provision Railway resources and push public changes

Recommended first publication path:

1. create local branch `release/mvp-rc-2`
2. push that branch
3. open PR into `main`
4. let CI validate
5. merge only after review and approval
