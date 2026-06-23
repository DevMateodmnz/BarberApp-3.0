# Mobile EAS Release Runbook

This runbook defines the tracked local repository contract for BarberApp mobile builds.
It does **not** create Expo/EAS resources, trigger cloud builds, or store real secrets.

## Environment model

BarberApp mobile now supports exactly three build-time environments:

- `development`
- `preview`
- `production`

The environment is selected with `EXPO_PUBLIC_APP_ENV`.

### Development

- Default when `EXPO_PUBLIC_APP_ENV` is unset.
- Keeps the current Expo Go workflow.
- `EXPO_PUBLIC_API_URL` is optional.
- If `EXPO_PUBLIC_API_URL` is omitted, the app uses the explicit fallback `http://localhost:3000/api/v1`.
- Localhost, loopback, and private LAN hosts remain allowed for local testing.

### Preview

- Intended for controlled QA builds distributed outside Expo Go.
- Requires an explicit `EXPO_PUBLIC_API_URL`.
- Rejects localhost, loopback, `.local`, `.lan`, and private-network IP hosts.
- Accepts a valid Clerk publishable key.
- Uses the tracked EAS `preview` build profile with internal distribution.

### Production

- Intended for store-ready release builds.
- Requires an explicit `EXPO_PUBLIC_API_URL` using `https://`.
- Rejects localhost, loopback, private-network hosts, malformed URLs, credentials, query strings, fragments, and non-`/api/v1` paths.
- Requires a live Clerk publishable key (`pk_live_...`).
- Uses the tracked EAS `production` build profile.

## Public vs secret variables

These values are public and are compiled into the app bundle:

- `EXPO_PUBLIC_APP_ENV`
- `EXPO_PUBLIC_API_URL`
- `EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY`

These values are **not** allowed in mobile config:

- `EXPO_PUBLIC_CLERK_SECRET_KEY`
- `EXPO_PUBLIC_CLERK_WEBHOOK_SECRET`
- API-side `CLERK_SECRET_KEY`
- API-side `CLERK_WEBHOOK_SECRET`

Clerk publishable keys are client-visible by design. Server-side Clerk secrets belong only in the API deployment environment.

## Local development

Start local Expo Go development exactly as before:

```bash
npm run dev --workspace @barberapp/mobile
```

Typical local `.env.local` flow:

```dotenv
EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY=pk_test_your_local_key
# Optional for local API fallback override:
# EXPO_PUBLIC_API_URL=http://192.168.x.x:3000/api/v1
```

Notes:

- If `EXPO_PUBLIC_API_URL` is omitted locally, the app uses `http://localhost:3000/api/v1`.
- For a physical phone, replace `localhost` with a reachable LAN host before starting Expo Go.
- No source edits are required to switch between local, preview, and production API targets.

## Preview build

Preview builds depend on future external Expo/EAS authentication and project linking.
Those steps are intentionally **not** executed from this repository batch.

Required preview values:

- `EXPO_PUBLIC_APP_ENV=preview` (set by `apps/mobile/eas.json`)
- `EXPO_PUBLIC_API_URL=https://<preview-api-host>/api/v1`
- `EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY=pk_test_<preview-or-staging-key>` or another valid preview publishable key

Tracked Android preview command:

```bash
cd apps/mobile
npx eas-cli@latest build --platform android --profile preview
```

Tracked iOS preview command:

```bash
cd apps/mobile
npx eas-cli@latest build --platform ios --profile preview
```

The `preview` profile uses `distribution: internal` so the result is meant for controlled QA, not app-store submission.

## Production build

Required production values:

- `EXPO_PUBLIC_APP_ENV=production` (set by `apps/mobile/eas.json`)
- `EXPO_PUBLIC_API_URL=https://<railway-api-host>/api/v1`
- `EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY=pk_live_<production-key>`

Tracked Android production command:

```bash
cd apps/mobile
npx eas-cli@latest build --platform android --profile production
```

Tracked iOS production command:

```bash
cd apps/mobile
npx eas-cli@latest build --platform ios --profile production
```

Production signing credentials, app-store records, submission, and distribution are later external steps.

## API and Clerk coordination

Before any preview or production mobile build:

1. Railway API must already be deployed and healthy.
2. `EXPO_PUBLIC_API_URL` must include the repository's expected API base path `/api/v1`.
3. The mobile Clerk publishable key must belong to the same Clerk environment expected by the API-side Clerk secret.
4. Clerk webhook configuration remains an API-side concern.

Related API deployment guidance: [`docs/releases/railway-mvp-deployment.md`](./railway-mvp-deployment.md)

## Verification checklist

Before distributing a build, verify:

1. Resolved Expo config still loads locally:

   ```bash
   cd apps/mobile
   npx expo config --type public
   ```

2. The selected environment variables resolve cleanly.
3. A local export proof contains the intended API URL and no `localhost` reference for preview/production:

   ```bash
   cd apps/mobile
   EXPO_PUBLIC_APP_ENV=production \
   EXPO_PUBLIC_API_URL=https://api.example.com/api/v1 \
   EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY=pk_live_example123 \
   npx expo export --platform android --output-dir dist-export-proof
   ```

4. OWNER sign-in works.
5. BARBER sign-in works.
6. Role-aware visibility remains correct.
7. Service-record write/read works.
8. Revenue analytics reads work.
9. No `localhost` or private host is embedded in a preview/production build.

## Rollback

- Mobile binaries cannot be patched instantly once installed on user devices.
- Keep previous preview/production binaries available until the replacement is accepted.
- Do not deploy breaking API changes before compatible mobile builds are ready.
- If a bad mobile build is distributed internally, stop sharing it and reissue a corrected build.

## External steps still required later

These actions remain outside the repository and require human/external work:

- Expo account authentication
- Expo project linking (if EAS commands require it)
- Android/iOS signing credentials
- Internal distribution recipient management
- Railway production API domain selection
- Clerk production environment setup
- App store account setup and submission
