# Public Booking Pilot Deployment Plan

## Release identity

- Deployment candidate version: `mvp-1.1.1`
- Deployment rule: deploy `mvp-1.1.1` only after the patch tag is published from green `main`.
- Superseded pre-deploy release: `mvp-1.1.0`
- Superseded release commit: `49f69c4e323eab5f2226458979e7d2046ec208fa`
- Superseded tag object: `48525c4e099ac7cafd21dfdc386e1d2ffd6a8045`
- Superseded tag target: `49f69c4e323eab5f2226458979e7d2046ec208fa`
- Publication date of superseded tag: `2026-07-13`
- Supersession reason: GitHub Actions on Node `20.20.2` exposed a midnight-conversion defect in `apps/api/src/lib/dateUtils.ts`; see `docs/releases/mvp-1.1.1.md`.
- Physical QA status: Samsung Galaxy S21 physical Android Chromium-browser QA passed on Brave for Android; the patch is runtime-only, so that physical QA remains valid; deployment still has not been performed.

## Platform inventory

| Component | Intended platform | Known configuration | Missing configuration | Owner / action required |
|---|---|---|---|---|
| PostgreSQL | Railway PostgreSQL (documented target) | `docs/releases/railway-mvp-deployment.md` defines Railway PostgreSQL in the same project as the API; migrations run with `npm run db:migrate:deploy --workspace @barberapp/api`. | Actual production Railway project/service, confirmed backup/PITR posture, live `DATABASE_URL`, production data-retention policy. | Mateo: provision Railway Postgres, enable backups, confirm recovery path. |
| Express API | Railway application service (documented target) | `railway.json` defines `RAILPACK`, predeploy migrations, `node apps/api/dist/index.js`, health check `/health`; runtime validation requires `DATABASE_URL`, `CLERK_SECRET_KEY`, `CLERK_WEBHOOK_SECRET`; `/api/v1/ping` exists. | Railway service linkage, actual production domain, live environment variables, deployment approval, health verification on the real host. | Mateo: provision/link Railway API service, set env, deploy, verify `/health` and `/api/v1/ping`. |
| Next.js public web | Unverified from repository metadata; deployable Next.js production host required | `apps/public-web` builds with `next build` and starts with `next start --port 3001`; server runtime requires `PUBLIC_WEB_API_URL` ending in `/api/v1`; public routes live under `/barberias/:slug`. | Actual hosting platform, production domain/TLS, server env injection for `PUBLIC_WEB_API_URL`, deploy credentials, whether deploy is Git-triggered. | Mateo: choose/confirm host, configure env/domain/TLS, deploy after API is healthy. |
| Clerk webhook / auth dependencies | Clerk production environment | API expects `CLERK_SECRET_KEY` and `CLERK_WEBHOOK_SECRET`; webhook route is `/api/v1/webhooks/clerk`; staff auth remains Clerk-backed. | Production Clerk instance confirmation, live secrets, webhook endpoint registration to the final API domain, delivery validation. | Mateo: set prod Clerk secrets and register the production webhook URL. |

## Required environment variables

### API
- `NODE_ENV`
- `PORT`
- `DATABASE_URL`
- `CLERK_SECRET_KEY`
- `CLERK_WEBHOOK_SECRET`
- `CORS_ALLOWED_ORIGINS`
- `RATE_LIMIT_ENABLED`
- `RATE_LIMIT_WINDOW_MS`
- `RATE_LIMIT_MAX`

### Web
- `NODE_ENV`
- `PORT`
- `PUBLIC_WEB_API_URL`

### Database
- `DATABASE_URL`

### Clerk
- `CLERK_SECRET_KEY`
- `CLERK_WEBHOOK_SECRET`

### CORS
- `CORS_ALLOWED_ORIGINS`

### Rate limiting
- `RATE_LIMIT_ENABLED`
- `RATE_LIMIT_WINDOW_MS`
- `RATE_LIMIT_MAX`

## Deployment sequence

1. Confirm a current production database backup / snapshot exists.
2. Provision production PostgreSQL.
3. Configure API environment.
4. Apply migrations.
5. Deploy API.
6. Verify `/health`.
7. Verify `/api/v1/ping`.
8. Configure Clerk webhook.
9. Configure public-web internal API URL.
10. Deploy public web.
11. Configure domain/TLS.
12. Set CORS allowlist.
13. Provision pilot barbershop slug.
14. Verify active services/barbers/assignments/hours.
15. Execute production public-booking smoke.
16. Verify staff visibility.
17. Share link with pilot shop.

Before step 1, verify the deployment artifact/tag is `mvp-1.1.1`, not `mvp-1.1.0`.

### Operator details for the ordered steps

1. **Confirm backup**: verify Railway/PostgreSQL backup coverage before schema changes; do not proceed on assumptions.
2. **Provision production PostgreSQL**: create the Railway PostgreSQL service and confirm the application can reference its `DATABASE_URL`.
3. **Configure API environment**: set `NODE_ENV=production`, `DATABASE_URL`, `CLERK_SECRET_KEY`, `CLERK_WEBHOOK_SECRET`, and optional `CORS_ALLOWED_ORIGINS` / rate-limit overrides.
4. **Apply migrations**: run `npm run db:migrate:deploy --workspace @barberapp/api` before starting the new API version.
5. **Deploy API**: use the Railway service defined by `railway.json` (`RAILPACK`, predeploy migration command, `node apps/api/dist/index.js`).
6. **Verify `/health`**: confirm the deployed API process responds at `https://<api-domain>/health`.
7. **Verify `/api/v1/ping`**: confirm the versioned API responds at `https://<api-domain>/api/v1/ping`.
8. **Configure Clerk webhook**: register `https://<api-domain>/api/v1/webhooks/clerk` and validate delivery with the production Clerk secrets.
9. **Configure public-web internal API URL**: set `PUBLIC_WEB_API_URL=https://<api-domain>/api/v1` on the Next.js host exactly, without query/fragment/credentials.
10. **Deploy public web**: build and start/deploy `apps/public-web` on the chosen production host.
11. **Configure domain/TLS**: point the public host at the final pilot domain that serves `/barberias/:slug` and confirm HTTPS.
12. **Set CORS allowlist**: if any direct browser-to-API traffic is expected, set exact allowed origins in `CORS_ALLOWED_ORIGINS`; otherwise omit it.
13. **Provision pilot barbershop slug**: use `npm run public-slug --workspace @barberapp/api -- --barbershop-id <id> --slug "<name>"` after dry-run review.
14. **Verify active services/barbers/assignments/hours**: confirm the pilot shop has active services, an eligible barber assignment, and weekly hours / schedule exceptions configured.
15. **Execute production public-booking smoke**: open `/barberias/<slug>`, verify booking config availability, create one controlled booking, and confirm the customer confirmation page shows the public reference.
16. **Verify staff visibility**: confirm the created appointment is visible through the existing staff surfaces and retains the expected `CONFIRMED` state.
17. **Share link with pilot shop**: only after the full smoke path passes and monitoring is active.

## Rollback

- Stop public-web traffic or remove the public link first.
- Preserve created appointments and consent/public-reference records.
- Roll back the web independently if the public site is the failing layer.
- Roll back the API application version separately from the web when needed.
- Treat database migrations as forward-fix or restore work; schema rollback is not automatic.
- Unpublish the pilot slug with `npm run public-slug --workspace @barberapp/api -- --barbershop-id <id> --unpublish` if public access must be removed.
- Do not delete customer booking records casually; investigate before any destructive action.

## Go / no-go checklist

- [ ] Production database exists and backup posture is confirmed.
- [ ] Deployment tag `mvp-1.1.1` is published and green on GitHub Actions.
- [ ] Railway/API deployment target is provisioned and authenticated.
- [ ] Actual production `DATABASE_URL` is available.
- [ ] Actual production `CLERK_SECRET_KEY` and `CLERK_WEBHOOK_SECRET` are available.
- [ ] API migration succeeds.
- [ ] API `/health` succeeds.
- [ ] API `/api/v1/ping` succeeds.
- [ ] Public-web host/platform is confirmed.
- [ ] `PUBLIC_WEB_API_URL` is configured to the final `/api/v1` endpoint.
- [ ] Domain/TLS is configured for the public web.
- [ ] Clerk webhook is registered to the final API domain and delivers successfully.
- [ ] Pilot slug is provisioned intentionally.
- [ ] Pilot services, barber assignment, and hours are verified.
- [ ] Public page loads successfully.
- [ ] Booking-write flow succeeds.
- [ ] Staff visibility succeeds.
- [ ] Rate-limit configuration is reviewed for production traffic.
- [ ] No unexpected deployment was triggered by a Git push.

## Explicit blockers

- Missing production database.
- Migration failure.
- API health failure.
- Invalid Clerk secrets / webhook configuration.
- Public page failure.
- Booking-write failure.
- Staff visibility failure.
- TLS / domain failure.
- Unexpected deployment triggered by push.
- Production rate limits misconfigured.

## Notes on unresolved deployment risk

- GitHub Actions CI definitely triggers on pushes to `main` per `.github/workflows/ci.yml`.
- `mvp-1.1.0` was published but is superseded before deployment by the Node 20 compatibility patch release `mvp-1.1.1`.
- The repository does **not** prove whether Railway or any Next.js host is currently Git-connected for automatic deployment.
- No `vercel.json` or equivalent public-web platform config was found in the repository root.
- Therefore deployment must still be treated as **not yet executed** and **not fully configuration-complete**.
