# MVP 1.1.1 — Node 20 Date Compatibility

**Date**: 2026-07-13
**Status**: Patch release prepared for publication after green GitHub Actions CI

## Summary

- `mvp-1.1.0` was published from `49f69c4e323eab5f2226458979e7d2046ec208fa` but was **not** deployed.
- GitHub Actions runs `29286481967` and `29286691380` exposed a real Node `20.20.2` midnight-conversion defect in `apps/api/src/lib/dateUtils.ts`.
- The defect caused timezone-aware local-midnight conversion to fail in API CI, cascading into public-booking and scheduling test failures.
- `mvp-1.1.1` fixes the runtime compatibility issue without changing public API contracts, booking behavior, Prisma schema, or migrations.
- Physical Android QA recorded for `mvp-1.1.0` remains valid because this patch only repairs runtime date/time compatibility.
- Full automated validation and production-parity smoke were rerun for the repaired candidate.
- `mvp-1.1.1` is the only release eligible for deployment; `mvp-1.1.0` is superseded before deployment and must remain immutable.

## Technical detail

- Root cause: some Intl/ICU combinations format local midnight as `24:00` when callers request `hour12: false`, which broke local date/time equality matching in `localDateTimeToUtc()`.
- Fix: `apps/api/src/lib/dateUtils.ts` now requests a strict `h23` hour cycle without `hour12: false`, producing stable `00..23` hour values under both Node 20 and Node 24.
- Regression coverage was added in `apps/api/tests/unit/dateUtils.test.ts` for:
  - Argentina midnight conversion
  - UTC / east-of-UTC / west-of-UTC midnight conversion
  - `getUtcRangeForLocalDate()` normal-day behavior
  - DST spring-forward and fall-back day ranges
  - midnight formatter normalization

## Validation summary

- Node `20.20.2`: API typecheck, lint, unit, integration, and db suites passed after the fix.
- Node `24.15.0`: focused date/time and related API suites passed.
- `npm run qa:public-booking`: passed, including nested production-parity smoke.

## Deployment guidance

- Deploy `mvp-1.1.1` after the patch tag is published and green CI is confirmed.
- Do **not** deploy `mvp-1.1.0`.
- Do **not** move or recreate `mvp-1.1.0`.
