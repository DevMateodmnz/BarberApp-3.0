# Manual QA — Notification Operations and Delivery Audit

> This QA is intentionally deferred until after the current development
> batch. It does **not** block implementation or commit creation.

## Future targeted QA bundle

Run these after the already-deferred email-reminder checks in
`docs/manual-tests/appointment-email-reminders.md`:

1. owner notification operations summary + filters
2. owner notification detail + attempt timeline
3. owner manual retry for a terminal failure
4. authorization/privacy regression checks

## Preconditions

- API + mobile are running against a DB with
  `20260715193000_add_notification_operations_audit` applied.
- Use one `OWNER`, one `BARBER`, and one `CLIENT` account from the same
  barbershop.
- Seed at least:
  - one `PENDING` notification,
  - one `SENT` notification,
  - one `FAILED` notification with at least one attempt row,
  - one `CANCELLED` notification.
- Keep the separate physical email/reminder checks deferred to the
  earlier appointment-email-reminders checklist.

## A. Owner summary and list

### Steps

1. Open **Manage → Notifications** as an `OWNER`.
2. Confirm the summary cards render counts for:
   - pending,
   - sent,
   - failed,
   - cancelled.
3. Switch filters between:
   - Todas / All,
   - Pendientes,
   - Enviadas,
   - Fallidas,
   - Canceladas.
4. Pull to refresh.
5. Load more rows when pagination is available.

### Expected

- The screen is reachable only for OWNER users.
- The list shows masked recipients only.
- Localized type/status labels appear instead of raw enum values.
- Failed rows show useful attempt/failure context.
- Pending retried rows show the next retry time when available.
- Pagination appends without duplicate rows.

## B. Notification detail and attempt history

### Steps

1. Open a failed notification from the owner list.
2. Verify the detail view shows:
   - masked recipient,
   - localized type/status,
   - scheduled time,
   - appointment summary,
   - manual retry count,
   - sanitized latest error.
3. Review the attempt timeline.

### Expected

- Each attempt row shows attempt number, localized outcome, date/time,
  and only sanitized failure text.
- No raw payload, lock token, provider response, or public booking
  reference is visible.
- Attempt ordering is newest-first and deterministic.

## C. Owner manual retry

### Steps

1. From a `FAILED` notification detail screen, tap
   **Reintentar envío / Retry delivery**.
2. Confirm the dialog.
3. Wait for the screen to refresh.
4. Reopen the summary/list if needed.

### Expected

- Success feedback says **Reintento programado** (or the localized
  equivalent), not “email sent”.
- The notification status becomes `PENDING`.
- `manualRetryCount` increments by exactly one.
- Existing attempt history remains intact.
- No email is sent inline merely from tapping retry.

## D. Authorization and privacy regression

### Steps

1. Try to open **Manage → Notifications** as a `BARBER`.
2. Try to deep-link or tamper an owner notification-detail request from a
   different barbershop.
3. Inspect network responses for the summary/list/detail endpoints.

### Expected

- BARBER and CLIENT do not get the owner operations surface.
- Cross-tenant probes are hidden with not-found behavior.
- Responses exclude:
  - full recipient email,
  - raw payload,
  - lock token,
  - raw provider identifiers,
  - Clerk identifiers,
  - stack traces.

## Regression checklist

- [ ] Existing appointment-row notification labels still render
- [ ] Staff appointments can still be created with optional email
- [ ] Reminder worker still processes due rows
- [ ] Failed manual retry does not duplicate notification rows
- [ ] Attempt history persists after a successful later send

## Evidence to capture later

- Screenshot of the owner notification summary/list
- Screenshot of one failed-notification detail view
- Screenshot of the retry confirmation + success state
- API inspector proof that recipients are masked and payloads are absent
