# Physical QA — barber commissions and liquidations

Do not repeat unrelated MVP QA. Use a test shop with one OWNER, two BARBER users,
and a service with a known price.

1. **OWNER configuration** — Open Commissions, select each active barber, set a
   default and one override, save, leave/reopen the screen, and verify persisted
   effective percentages. Confirm a BARBER sees no settings controls.
2. **Completed appointment accrual** — Create and progress one cash/external
   appointment to `COMPLETED`. Refresh Commissions and verify gross, snapped
   percentage, rounded commission, customer, service, and date.
3. **Historical rate preservation** — Change the barber override, complete a
   second appointment, and verify the first row retains its old rate/amount while
   only the second uses the new rate.
4. **OWNER overview** — Switch between both barbers and adjacent months. Confirm
   totals and rows change, empty periods are honest, and pull-to-refresh works.
5. **BARBER isolation** — Sign in as each BARBER. Verify “My commissions” shows
   only their own totals, entries, and liquidation history; confirm there is no
   barber selector or mutation action.
6. **Liquidation creation** — As OWNER, preview the selected barber/month,
   compare entry count/total, confirm creation, and verify entries move from
   unsettled to an `OPEN` liquidation.
7. **Retry/double submit** — Rapidly tap Create twice and retry after temporarily
   interrupting the response. Verify one liquidation exists and no entry is
   claimed twice.
8. **Mark paid** — Confirm Mark paid and verify the actor/timestamp-backed `PAID`
   status appears for OWNER and the matching BARBER.
9. **Paid immutability** — Verify the paid liquidation has no void/edit action;
   a stale/manual void request must fail and totals/history must remain unchanged.
10. **Failure feedback** — Test load, save, preview, create, and pay with the API
    unavailable. Verify visible errors/retry, no authoritative zero replaces
    failed data, inputs remain usable, and no false success appears.
11. **Appointment regression** — Complete one normal appointment through the
    existing detail flow and verify its lifecycle timestamp, loyalty side effect
    (when enabled), and commission accrual all persist together exactly once.

Physical QA and production readiness are not marked passed by this checklist.
