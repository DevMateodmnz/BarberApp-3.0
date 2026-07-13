# Public Booking Physical QA — Samsung Galaxy S21

**Date**: 2026-07-13
**Status**: Physical Android Chromium-browser QA recorded as PASS; publication and deployment still pending
**Target device/browser**: Samsung Galaxy S21 + Brave on Android (Chromium-based)
**Network model**: Same trusted local Wi-Fi for laptop and phone
**Runtime model**: laptop-hosted production builds (`node dist/index.js` + `next start`)
**Database**: isolated PostgreSQL test database on `5433` only
**Audited candidate code commit**: `900274909f4b96ba3a3b7faf70d454b3ace2e94b`

---

## Quick status

- Physical Samsung Galaxy S21 QA passed on a trusted local Wi-Fi using **Brave on Android** over the production-style local stack (`3000` API, `3001` Next, `5433` isolated PostgreSQL).
- The captured browser evidence is **Chromium-based Brave**, not Chrome. No Chrome-specific rerun is required for this controlled pilot unless a browser-specific defect appears later.
- Do **not** treat this checklist as deployment proof; it records a local trusted-network physical QA checkpoint only.
- Do **not** point the phone flow at the dev database on `5432`.

## Recorded physical QA evidence — 2026-07-13

### Runtime and device metadata

| Field | Value |
|---|---|
| Device | Samsung Galaxy S21 |
| Browser | Brave on Android |
| Browser engine class | Chromium-based |
| Network | Trusted local Wi-Fi |
| Public web runtime | production Next.js build on `3001` |
| API runtime | compiled Express API on `3000` |
| Database | isolated PostgreSQL test database on `5433` |
| Overall manual result | `PASS` |

### Successful physical booking evidence

| Field | Value |
|---|---|
| Shop | `E2E Booking Shop F16DE1C2F8` |
| Service | `Servicio E2E F16DE1C2F8` |
| Barber | `Barbero E2E F16DE1C2F8` |
| Date/time | `14 de julio de 2026 a las 09:00` |
| Phone | `+5493816167701` |
| Status shown | `CONFIRMED` |
| Public reference | `pb_XM3IT22J6Z3I6Y64` |

### Verified physical behavior

- ✅ direct public shop page load succeeded
- ✅ shop name and services rendered correctly
- ✅ service selection worked
- ✅ eligible barber selection worked
- ✅ date selection worked
- ✅ real available slots loaded
- ✅ responsive portrait layout was usable
- ✅ no visible horizontal overflow was observed
- ✅ customer form and consent flow worked
- ✅ real public booking succeeded
- ✅ confirmation page rendered
- ✅ public booking reference was shown
- ✅ international phone was stored and shown
- ✅ confirmed appointment status was shown
- ✅ no internal appointment IDs were exposed in the customer UI

## Required local terminals

### Terminal 1 — isolated database on `5433`

```bash
cd /home/mateo/Documents/coding/BarberApp-3.0

docker compose up -d postgres_test
docker compose ps postgres_test

export DATABASE_URL='postgresql://postgres:postgres@127.0.0.1:5433/barberapp_test'
export DATABASE_URL_TEST="$DATABASE_URL"

npm run db:migrate:test --workspace @barberapp/api
lsof -nP -iTCP:5433 -sTCP:LISTEN
```

Expected result:

- `postgres_test` is running
- Prisma test migrations are up to date
- port `5433` is listening

### Terminal 2 — deterministic physical-QA fixture

```bash
cd /home/mateo/Documents/coding/BarberApp-3.0

export FIXTURE_KEY='physical-qa-s21'
export PHYSICAL_QA_FIXTURE_JSON='/tmp/public-booking-physical-qa.json'

npm run fixture:public-booking:e2e --workspace @barberapp/api -- cleanup "$FIXTURE_KEY"
npm run fixture:public-booking:e2e --workspace @barberapp/api -- setup "$FIXTURE_KEY" | tee "$PHYSICAL_QA_FIXTURE_JSON"

node - <<'NODE'
const fs = require('node:fs');
const fixture = JSON.parse(fs.readFileSync('/tmp/public-booking-physical-qa.json', 'utf8'));
console.log(`slug=${fixture.slug}`);
console.log(`futureLocalDate=${fixture.futureLocalDate}`);
console.log(`serviceId=${fixture.serviceId}`);
console.log(`barberId=${fixture.barberId}`);
console.log(`ownerClerkUserId=${fixture.ownerClerkUserId}`);
console.log(`shopName=${fixture.shopName}`);
NODE
```

Keep:

- `FIXTURE_KEY=physical-qa-s21`
- `/tmp/public-booking-physical-qa.json`

You will reuse them for stale-slot setup, staff verification, and cleanup.

### Terminal 3 — compiled API

```bash
cd /home/mateo/Documents/coding/BarberApp-3.0

export DATABASE_URL='postgresql://postgres:postgres@127.0.0.1:5433/barberapp_test'
export DATABASE_URL_TEST="$DATABASE_URL"
export NODE_ENV=production
export PORT=3000
export CLERK_SECRET_KEY='sk_test_mock'
export CLERK_WEBHOOK_SECRET='whsec_test_mock'

npm run build --workspace @barberapp/api
npm run start --workspace @barberapp/api
```

Readiness checks from another shell:

```bash
curl -fsS http://127.0.0.1:3000/health
curl -fsS http://127.0.0.1:3000/api/v1/ping
```

### Terminal 4 — production Next server

```bash
cd /home/mateo/Documents/coding/BarberApp-3.0

export NODE_ENV=production
export PUBLIC_WEB_API_URL='http://127.0.0.1:3000/api/v1'

npm run build --workspace @barberapp/public-web
npm run start --workspace @barberapp/public-web -- --hostname 0.0.0.0
```

Readiness checks from another shell:

```bash
export PHYSICAL_QA_FIXTURE_JSON='/tmp/public-booking-physical-qa.json'

SLUG="$(node -e "const fs=require('node:fs');const f=JSON.parse(fs.readFileSync(process.env.PHYSICAL_QA_FIXTURE_JSON,'utf8'));console.log(f.slug)")"

curl -fsS "http://127.0.0.1:3001/api/public-booking/shops/${SLUG}/booking-config"
curl -I "http://127.0.0.1:3001/barberias/${SLUG}"
```

`next start --help` confirms `--hostname` is supported and defaults to `0.0.0.0`, but pass it explicitly for physical QA.

## Laptop IP and phone URL procedure

Run one of these on the laptop:

```bash
hostname -I | awk '{print $1}'
```

```bash
ip route get 1.1.1.1 | awk '{for(i=1;i<=NF;i++) if($i=="src"){print $(i+1); exit}}'
```

Then build the phone URL:

```text
http://<LAPTOP_LAN_IP>:3001/barberias/<FIXTURE_SLUG>
```

Where:

- `<LAPTOP_LAN_IP>` is the command output above
- `<FIXTURE_SLUG>` comes from `/tmp/public-booking-physical-qa.json`

Example pattern only:

```text
http://192.168.x.x:3001/barberias/e2e-public-booking-...
```

Do not assume the laptop IP; recalculate it each session.

## Firewall and local-network checks

1. Put the laptop and Samsung Galaxy S21 on the same Wi-Fi.
2. Verify the phone can reach TCP `3001`.
3. Check Ubuntu firewall state:

   ```bash
   sudo ufw status numbered
   ```

4. If UFW blocks the port, allow only the trusted LAN or phone address temporarily; do not expose the service beyond the local network.
5. After QA, remove any temporary firewall opening you added.

## Fixture helper exports for later scenarios

Before scenarios E and I, load fixture values into shell variables:

```bash
export PHYSICAL_QA_FIXTURE_JSON='/tmp/public-booking-physical-qa.json'

eval "$(node - <<'NODE'
const fs = require('node:fs');
const f = JSON.parse(fs.readFileSync(process.env.PHYSICAL_QA_FIXTURE_JSON, 'utf8'));
console.log(`SLUG='${f.slug}'`);
console.log(`SERVICE_ID='${f.serviceId}'`);
console.log(`BARBER_ID='${f.barberId}'`);
console.log(`FUTURE_LOCAL_DATE='${f.futureLocalDate}'`);
console.log(`OWNER_CLERK_USER_ID='${f.ownerClerkUserId}'`);
NODE
)"
```

## Required physical QA scenarios

### A. Direct page load

- [ ] Open `http://<LAPTOP_LAN_IP>:3001/barberias/<SLUG>` in Brave on the Samsung Galaxy S21
- [ ] Refresh the page
- [ ] Navigate away and return
- [ ] Verify no safe-fallback error appears
- [ ] Verify the shop name and services load

### B. Responsive layout

- [ ] Verify portrait layout
- [ ] Verify landscape layout
- [ ] Verify no horizontal overflow
- [ ] Verify no clipped controls
- [ ] Verify readable text
- [ ] Verify touch targets feel usable
- [ ] If an external keyboard is available, verify visible focus

### C. Successful booking

- [ ] Choose service
- [ ] Choose barber
- [ ] Choose date
- [ ] Choose slot
- [ ] Enter name
- [ ] Enter phone
- [ ] Enter notes
- [ ] Accept consent
- [ ] Submit
- [ ] Verify confirmation

Expected confirmation checks:

- [ ] Local date/time is correct
- [ ] Public reference is shown
- [ ] Phone is shown
- [ ] Status is `CONFIRMED`
- [ ] No internal IDs appear in the page

### D. Double submission

- [ ] Rapidly tap the submit button more than once
- [ ] Verify only one booking is created
- [ ] Verify only one confirmation page appears
- [ ] Verify no false conflict message appears

### E. Stale slot

Use the real public API helper flow below from the laptop to occupy the selected slot before submitting from the phone:

```bash
export AVAILABILITY_JSON='/tmp/public-booking-availability.json'

curl -fsS \
  "http://127.0.0.1:3000/api/v1/public/barbershops/${SLUG}/barbers/${BARBER_ID}/availability?serviceId=${SERVICE_ID}&localDate=${FUTURE_LOCAL_DATE}" \
  | tee "$AVAILABILITY_JSON"

export START_AT="$(node -e "const fs=require('node:fs');const p=JSON.parse(fs.readFileSync(process.argv[1],'utf8'));console.log(p.data.slots[0].startAt)" "$AVAILABILITY_JSON")"
export CONSENT_VERSION="$(curl -fsS "http://127.0.0.1:3000/api/v1/public/barbershops/${SLUG}/booking-config" | node -e "let s='';process.stdin.on('data',d=>s+=d);process.stdin.on('end',()=>console.log(JSON.parse(s).data.consent.version));")"

curl -i -X POST "http://127.0.0.1:3000/api/v1/public/barbershops/${SLUG}/appointments" \
  -H 'Content-Type: application/json' \
  -H 'Idempotency-Key: stale-slot-phone-occupier' \
  --data "$(cat <<JSON
{"serviceId":"${SERVICE_ID}","barberId":"${BARBER_ID}","startAt":"${START_AT}","clientName":"Competidor QA","clientPhone":"+543811234571","notes":"Reserva competidora para QA física","consentAccepted":true,"consentVersion":"${CONSENT_VERSION}"}
JSON
)"
```

Then on the phone:

- [ ] Submit the previously selected stale slot
- [ ] Verify the app shows an understandable conflict
- [ ] Verify the selected slot clears
- [ ] Verify availability refreshes
- [ ] Verify customer name/phone/notes remain
- [ ] Verify another slot can still be booked successfully

### F. Confirmation refresh

- [ ] Refresh the confirmation page in the same Chrome tab
- [ ] Open the confirmation route directly in a new incognito tab
- [ ] Verify the safe fallback appears in incognito/new-session mode
- [ ] Verify no PII appears in the URL

### G. Validation

- [ ] Blank name shows understandable feedback
- [ ] Malformed phone shows understandable feedback
- [ ] Unchecked consent shows understandable feedback
- [ ] Errors are visible and understandable on device

### H. Network interruption

- [ ] Disable Wi-Fi immediately after submit, or otherwise create a safe ambiguous response
- [ ] Verify the form stays preserved
- [ ] Verify retry is possible
- [ ] Verify retry does not create a duplicate booking

### I. Staff visibility

Primary check:

- [ ] Verify the created appointment is visible through the authorized staff application

Local isolated API fallback (safe only on the test DB / local QA environment):

```bash
curl -fsS http://127.0.0.1:3000/api/v1/appointments \
  -H "x-test-user-id: ${OWNER_CLERK_USER_ID}"
```

Verify:

- [ ] customer name
- [ ] customer phone
- [ ] service
- [ ] barber
- [ ] date/time
- [ ] confirmed status

## Recorded nonblocking UX findings

### 1. Argentine phone-entry experience

Classification:

`POST-RELEASE UX IMPROVEMENT — HIGH PRIORITY, NONBLOCKING FOR CONTROLLED PILOT`

Observed on device:

- The current field works when the customer enters canonical E.164-compatible input such as `+5493816167701`.
- A normal Argentine customer is more likely to type a familiar local form such as:
  - `3816167701`
  - `381 6167701`
  - `0381 15 6167701`

Required future direction:

- accept familiar Argentine mobile formats;
- normalize safely to E.164 through an authoritative client/server boundary;
- preserve canonical stored representation;
- provide clearer visible help text and formatting guidance;
- avoid guessing truly ambiguous numbers.

### 2. Spanish confirmation status copy

Classification:

`POST-RELEASE COPY IMPROVEMENT — NONBLOCKING`

Observed on device:

- The confirmation currently displays `CONFIRMED`.
- The customer-facing Spanish UI should later display `Confirmado`.
- The internal enum and API status should remain `CONFIRMED`.

## Pass / fail recording

| Scenario | Result | Evidence / notes | Blocker severity |
|---|---|---|---|
| A. Direct page load | `PASS` | Samsung Galaxy S21 on Brave loaded the public URL directly, showed the shop correctly, and no safe-fallback error appeared during the captured pass. |  |
| B. Responsive layout | `PASS` | Portrait layout was usable on the physical phone and no visible horizontal overflow was observed. |  |
| C. Successful booking | `PASS` | Completed real booking for `E2E Booking Shop F16DE1C2F8` / `Servicio E2E F16DE1C2F8` / `Barbero E2E F16DE1C2F8`; `14 de julio de 2026 a las 09:00`; phone `+5493816167701`; reference `pb_XM3IT22J6Z3I6Y64`; status `CONFIRMED`. |  |
| D. Double submission | `NOT-TESTED` | Not repeated on the physical phone during the publication batch; covered by Playwright scenario 3 in `apps/public-web/e2e/publicBooking.spec.ts`. |  |
| E. Stale slot | `NOT-TESTED` | Not repeated on the physical phone during the publication batch; covered by Playwright scenario 5. |  |
| F. Confirmation refresh | `NOT-TESTED` | Not repeated on the physical phone during the publication batch; covered by Playwright scenario 6. |  |
| G. Validation | `NOT-TESTED` | Not repeated on the physical phone during the publication batch; covered by Playwright scenario 7. |  |
| H. Network interruption | `NOT-TESTED` | Not repeated on the physical phone during the publication batch; ambiguous-retry behavior remains covered by Playwright scenario 4. |  |
| I. Staff visibility | `NOT-TESTED` | The customer-side confirmation PASS was recorded; staff-surface verification was not separately repeated on-device in this publication batch. |  |

### Result meanings

- `PASS`: scenario behaved as expected
- `FAIL-BLOCKER`: release-blocking failure; stop push/tag/deploy
- `FAIL-NONBLOCKER`: issue exists but does not block the controlled pilot
- `NOT-TESTED`: scenario has not been executed yet

## Cleanup commands after QA

### Stop the compiled API and Next server

Use `Ctrl+C` in Terminal 3 and Terminal 4.

### Clean fixture data

```bash
cd /home/mateo/Documents/coding/BarberApp-3.0

export FIXTURE_KEY='physical-qa-s21'
npm run fixture:public-booking:e2e --workspace @barberapp/api -- cleanup "$FIXTURE_KEY"
rm -f /tmp/public-booking-physical-qa.json /tmp/public-booking-availability.json
```

### Stop the isolated PostgreSQL test database

```bash
cd /home/mateo/Documents/coding/BarberApp-3.0
docker compose stop postgres_test
```

### Verify ports are free

```bash
for port in 3000 3001 5433; do
  echo "PORT ${port}"
  lsof -nP -iTCP:${port} -sTCP:LISTEN || true
done
```

Do not touch the dev database on `5432`.
