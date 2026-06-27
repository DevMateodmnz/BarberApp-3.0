# Employee Onboarding — Design Investigation

Date: 2026-06-08 · Based on codebase inspection through PR-062A (fa2c44c).
**Status: Option A (Email Lookup) was implemented in PR-065A (8292af2). Option B (Clerk Invitation) is now implemented on `feat/employee-invitation-onboarding` through `6c8e9e5`, `56bb6de`, and `7feb09b`, and Batch 4 accepted it for merge review on 2026-06-27.**

## Purpose

The current employee add flow requires the OWNER to know and paste a raw Clerk user ID (`user_<clerk-id>...`). This document investigates options for improving this UX toward invite-by-email or user lookup, assessing security, complexity, and MVP value.

**Update (PR-065A)**: Email lookup is now implemented. OWNERs can add employees by email (`barber@shop.com`) in addition to userId.

**Update (Employee Invitation Onboarding)**: the "user doesn't exist yet" gap is now covered by the invitation flow. OWNERs can create a pending invitation by email, duplicate pending creates are idempotent, resend revokes-and-recreates the provider invitation while preserving the local row, revoke preserves local history, and accepted invitees reconcile into local BARBER user/employee records before `/me/context`.

**Current QA classification (2026-06-27)**:
- Accepted for merge review / MVP continuation
- Automated validation passed at the accepted baseline: API **441/441**, Mobile **593/593**
- Live Clerk/provider/API reconciliation behavior was validated successfully
- Literal inbox receipt, full browser UI driving, and full physical mobile tap-through remained limited from the CLI environment
- Live webhook-specific verification remained limited locally because `CLERK_WEBHOOK_SECRET` was missing

---

## 1. Current Contract

### 1.1 Backend: POST /barbershops/:id/employees

| Aspect | Detail |
|--------|--------|
| Endpoint | `POST /api/v1/barbershops/:barbershopId/employees` |
| Auth | `requireAuth` → `requireBarbershopAccess` → `requireRole('OWNER')` |
| Body | `{ email: string }` OR `{ userId: string }` (Zod: XOR refine — exactly one required) |
| Mobile form | "Email or User ID" field. Auto-detects: `@` → sends `{ email }`, otherwise `{ userId }`. |
| Response (201) | Full `Employee` object with `user` include (id, email, name, role) |
| Preconditions | User must exist in local DB, not be soft-deleted (`deletedAt: null`) |
| Errors | `404` user not found, `409` duplicate employee, `403` cross-tenant, `403` non-OWNER |
| Role behavior | Does NOT modify `User.role`. Employee link is created; role is managed separately via Clerk metadata. |

**Key constraint**: the target user must ALREADY exist in the local `users` table. There is no invitation, no user creation, and no email-based lookup on this endpoint.

### 1.2 User Model

```prisma
model User {
  id            String    @id @default(cuid())     // Internal UUID
  clerkUserId   String    @unique                  // Clerk external ID
  email         String    @unique                  // From Clerk
  name          String?                             // From Clerk
  role          UserRole  @default(CLIENT)         // OWNER | BARBER | CLIENT
  deletedAt     DateTime?                           // Soft delete
}
```

**Key facts**:
- `email` is unique and indexed — lookup by email is possible and fast.
- `clerkUserId` is unique and indexed — the current lookup key.
- `role` defaults to CLIENT; upgraded via Clerk `public_metadata.role` at webhook sync time.
- Soft-deleted users (`deletedAt IS NOT NULL`) are excluded from employee add.

### 1.3 Clerk User Sync (webhook)

| Event | Behavior |
|-------|----------|
| `user.created` | Creates User row with email, name, role from `public_metadata.role` (defaults CLIENT). Restores soft-deleted users. |
| `user.updated` | Updates email, name, role. **Never downgrades** role (CLIENT→BARBER→OWNER allowed, reverse blocked). |
| `user.deleted` | Sets `deletedAt = now()` (soft delete). |

**Role management**: roles are set via Clerk Dashboard → User metadata → `public_metadata: { role: "BARBER" }`. The webhook syncs this to the local DB. There is no in-app role management endpoint.

### 1.4 Current Mobile Flow

| Step | What happens |
|------|-------------|
| OWNER taps "+ Add Employee" | Inline form appears with one field: "Email or User ID" |
| OWNER enters email or ID | e.g. `barber@shop.com` or `user_<clerk-id>...` |
| Mobile auto-detects | `@` → `{ email }`, otherwise `{ userId }` |
| Validate | Non-empty after trim |
| API call | `POST /employees { email }` or `{ userId }` |
| Success | Form resets, employee list reloads, flash message |

**Pain points**:
- OWNER must know the raw Clerk user ID — a 20+ character opaque string.
- No way to discover users by name or email.
- The only way to get a user ID is: Clerk Dashboard, database query, or pre-sharing the ID out-of-band.

---

## 2. Security Analysis

### 2.1 Current protections

| Risk | Mitigation |
|------|-----------|
| Adding a user who isn't a barber | `User.role` is not checked. An OWNER can add a CLIENT or another OWNER as an employee. The backend does NOT validate the target user's role. **This is intentional** — role is managed via Clerk metadata, and a CLIENT can later be upgraded to BARBER. |
| Cross-tenant leakage | `requireBarbershopAccess` verifies the OWNER owns the barbershop. `addEmployee` uses `barbershopId` from the route param (not user input). |
| Adding the same user twice | `P2002` unique constraint → `409 Conflict`. |
| Adding a nonexistent user | `findUnique` → `404 Not Found`. |
| Role escalation via employee add | `addEmployee` does not change `User.role`. No escalation path. |
| Exposing user list across tenants | No user search endpoint exists. `listEmployees` only returns employees of the OWNER's barbershop. |

### 2.2 Risks of adding email-based lookup

| Risk | Severity | Mitigation |
|------|----------|-----------|
| **Email enumeration**: attacker probes which emails exist in the system | MEDIUM | Only return success/failure to authenticated OWNER. Rate limiting already exists. Don't expose user details beyond what's needed. |
| **Adding users from other barbershops**: OWNER adds a user who's already an employee elsewhere | LOW | The `Employee` table has a unique constraint on `(barbershopId, userId)` — a user can be an employee of multiple barbershops. This is by design. No cross-tenant data leakage. |
| **Exposing user email in response** | LOW | The `EmployeeListItem` already includes `user.email`. This is intentional — OWNER sees the email of their own employees. |

### 2.3 Risks of Clerk invitation flow

| Risk | Severity | Mitigation |
|------|----------|-----------|
| **API key exposure**: Clerk secret key must be available server-side | LOW | Already the case for webhook verification. Add to existing env vars. |
| **Rate limiting**: Clerk API has rate limits | LOW | Invitations are low-frequency (1-5 per barbershop setup). |
| **Inviting to wrong barbershop**: invitee might be assigned to wrong tenant | MEDIUM | The invitation metadata can include `barbershopId`. On acceptance, webhook creates user; then a second step assigns them as employee. |

---

## 3. Options Compared

### Option A: Add Employee by Email (lookup existing user) ✅ IMPLEMENTED — PR-065A

**What**: Change the add-employee form to accept an email address instead of (or in addition to) a user ID. The backend looks up the user by email and creates the employee link.

**Backend changes**:
- New endpoint OR modify `POST /employees` to accept `{ email?: string, userId?: string }`
- Backend: `prisma.user.findUnique({ where: { email } })` → if found, use their `id` as `userId`
- If not found, return `404` with message "No user found with that email"

**Mobile changes**:
- Change input label from "User ID" to "Email or User ID"
- Accept both formats; send email to backend
- Keep the same success/error flow

**Pros**:
- Minimal change — one field, one DB query
- Email is human-readable and OWNER likely knows their barbers' emails
- No Clerk API dependency
- No new infrastructure

**Cons**:
- User must already exist (still requires Clerk sign-up or seed)
- Email enumeration concern (mitigated by auth + rate limiting)
- Doesn't solve the "user doesn't exist yet" problem

**Complexity**: 🟢 LOW — backend ~10 lines, mobile ~5 lines
**MVP value**: 🟡 MEDIUM — improves UX but doesn't solve new-user problem
**Security**: 🟢 LOW risk — authenticated, rate-limited, no new data exposure

---

### Option B: Clerk Invitation Flow

**What**: Use Clerk's Invitations API (`POST /invitations`) to send an email invite. The invited user signs up via Clerk, the webhook creates the local User row, and a second step (or webhook-triggered automation) creates the employee link.

**Backend changes**:
- New endpoint: `POST /barbershops/:id/invitations` — calls Clerk API to create invitation with `public_metadata: { role: "BARBER", barbershopId }`
- On `user.created` webhook: if `public_metadata.barbershopId` exists, auto-create employee link
- Clerk SDK dependency (or raw REST calls to Clerk API)

**Mobile changes**:
- New "Invite Barber" form: email input + send button
- Success: show confirmation that invite was sent
- Employee appears in list after they accept and webhook fires

**Pros**:
- Solves the full flow: invite → signup → auto-assign
- No need for OWNER to know user IDs
- Professional UX

**Cons**:
- Requires Clerk API integration (Secret Key, API calls)
- Async flow: employee doesn't appear immediately
- Error handling for: invite already sent, email invalid, user already exists
- Higher implementation complexity
- Requires Clerk dashboard configuration (email templates, redirect URLs)

**Complexity**: 🔴 HIGH — new endpoint, Clerk API integration, webhook-triggered automation
**MVP value**: 🟢 HIGH — solves the real problem end-to-end
**Security**: 🟡 MEDIUM — Clerk API key must be managed; invitation metadata must be validated
**Depends on**: Clerk Invitations API (requires verifying in Clerk docs)

---

### Option C: Admin-Generated Invite Link

**What**: OWNER generates a sign-up link with pre-filled metadata (`role=BARBER`, `barbershopId=X`). They share this link with the barber (email, WhatsApp, etc.). The barber signs up via Clerk, and the webhook auto-creates the employee link.

**Backend changes**:
- New endpoint: `POST /barbershops/:id/invite-link` — generates a Clerk sign-up URL with `redirect_url` and metadata
- Clerk SDK or URL construction
- Webhook auto-assignment (same as Option B)

**Mobile changes**:
- "Get Invite Link" button → copies link to clipboard or opens share sheet
- Employee appears after signup + webhook

**Pros**:
- No email dependency — works with any sharing channel (WhatsApp, SMS, etc.)
- Share sheet / clipboard is simple mobile UX
- Same auto-assignment benefit as Option B

**Cons**:
- Same Clerk API dependency as Option B
- Less polished than email invite (manual sharing step)
- Link could be shared with wrong person
- Still async

**Complexity**: 🔴 HIGH — similar to Option B
**MVP value**: 🟡 MEDIUM — more flexible than email but less polished

---

### Option D: Keep Raw User ID (Current State)

**What**: Make no changes. Document the limitation clearly. OWNERs use Clerk Dashboard or seed script to find user IDs.

**Pros**:
- Zero implementation cost
- No security surface increase
- Works for MVP with technical OWNERs

**Cons**:
- Terrible UX for non-technical OWNERs
- Blocks real-world adoption
- Manual, error-prone

**Complexity**: 🟢 NONE
**MVP value**: 🔴 LOW — already implemented, blocks growth

---

## 4. Comparison Matrix

| Criteria | A: Email Lookup | B: Clerk Invite | C: Invite Link | D: Keep Raw ID |
|----------|----------------|-----------------|----------------|----------------|
| Implementation complexity | 🟢 Low | 🔴 High | 🔴 High | 🟢 None |
| Backend changes | ~15 lines | ~200 lines + Clerk SDK | ~200 lines + Clerk SDK | 0 |
| Mobile changes | ~10 lines (field label + validation) | New form + async state | New button + share sheet | 0 |
| Solves "user doesn't exist"? | ❌ No | ✅ Yes | ✅ Yes | ❌ No |
| Solves "need to know ID"? | ✅ Partially (email instead) | ✅ Yes | ✅ Yes | ❌ No |
| Clerk API dependency | ❌ None | ✅ Required | ✅ Required | ❌ None |
| Security risk | 🟢 Low | 🟡 Medium | 🟡 Medium | 🟢 Low |
| Async flow (user wait) | ❌ Sync | ✅ Async | ✅ Async | ❌ Sync |
| Test complexity | +2 API tests | +6+ API + webhook tests | +6+ API + webhook tests | 0 |

---

## 5. Recommended Path

### ✅ Implemented: Option A — Email Lookup (PR-065A)

Email lookup is now live. OWNERs can add employees by email. The mobile form auto-detects `@` to send `{ email }` vs `{ userId }`. Backend normalizes email (trim + lowercase) and looks up via `findUnique({ email })`.

### Next: Option B — Clerk Invitation (future)

**Why**:
1. **Lowest complexity that delivers real UX improvement.** OWNERs know their barbers' emails; they don't know Clerk UUIDs.
2. **No Clerk API dependency.** Keeps the architecture simple. Clerk invitation is a separate concern.
3. **Backward compatible.** The endpoint can accept both `email` and `userId`. Raw user ID still works.
4. **Security is straightforward.** Authenticated OWNER only, rate-limited, no new data exposure beyond what `EmployeeListItem` already returns.
5. **Immediate value.** An OWNER setting up their barbershop can type `barber@shop.com` instead of `user_<clerk-id>...`.

**Design sketch**:

```
POST /barbershops/:id/employees
Body: { userId?: string, email?: string }  // at least one required

Backend logic:
1. If userId provided → use it directly (existing behavior)
2. If email provided → prisma.user.findUnique({ where: { email } })
   - Found → use user.id as userId
   - Not found → 404 "No user found with that email. The user must sign up first."
3. Proceed with existing addEmployee(userId)
```

**Mobile**: Change the input label to "Email or User ID". Accept both. Keep the same validation (non-empty after trim). The backend handles the rest.

**Estimated effort**: 1 small PR (~30 lines backend, ~5 lines mobile, ~4 tests).

### After Option A: Option B — Clerk Invitation (future)

Once email lookup is working, the natural next step is:
1. If email lookup returns 404 → offer to "Invite this person"
2. Implement Clerk Invitations API
3. Auto-assign on webhook

This can be its own PR (or PRs) and doesn't need to be tackled now.

---

## 6. What NOT to Do

- ❌ **Do NOT add a public user search endpoint.** Email enumeration is a real risk. Only expose user lookup within the authenticated, role-gated `POST /employees` flow.
- ❌ **Do NOT auto-assign roles.** The backend `addEmployee` should continue to not modify `User.role`. Role management stays in Clerk metadata.
- ❌ **Do NOT invite users without verifying the barbershop context.** Any invitation must be scoped to the OWNER's barbershop.
- ❌ **Do NOT remove the userId path.** Keep backward compatibility for API/seed use cases.

---

## 7. Security Review Checklist

For whichever option is implemented:

- [ ] Only authenticated OWNER can look up users by email
- [ ] Email lookup returns minimal information (success/failure, no user details exposed)
- [ ] Rate limiting applies to employee creation endpoint (already exists via global rate limiter)
- [ ] Cross-tenant: OWNER A cannot add a user to OWNER B's barbershop (already enforced by `requireBarbershopAccess`)
- [ ] No user enumeration: identical error for "user not found" vs "invalid email" (or use generic messaging)
- [ ] If adding Clerk API integration: Secret Key stored in environment variables, never exposed to client
- [ ] If adding Clerk API integration: webhook metadata validated before auto-assignment
