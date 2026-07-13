# Public booking pilot provisioning

For the full pilot release sequence, environment requirements, rollback plan, and limitations, see [`public-booking-pilot-runbook.md`](./public-booking-pilot-runbook.md).

Use this runbook to intentionally publish or unpublish a barbershop slug for the public-booking pilot.

## Assign a slug

```bash
npm run public-slug --workspace @barberapp/api -- \
  --barbershop-id <barbershop-id> \
  --slug "Barbería Central" \
  --dry-run
```

Remove `--dry-run` only after reviewing the printed canonical slug and target database.

## Unpublish a slug

```bash
npm run public-slug --workspace @barberapp/api -- \
  --barbershop-id <barbershop-id> \
  --unpublish \
  --dry-run
```

## Notes

- The command uses the configured `DATABASE_URL`.
- It prints the target environment and a password-free database target before writing.
- Slugs are normalized through `apps/api/src/lib/publicSlug.ts`.
- Unpublishing clears `Barbershop.publicSlug` only. It does not delete the shop, staff, services, or appointments.
