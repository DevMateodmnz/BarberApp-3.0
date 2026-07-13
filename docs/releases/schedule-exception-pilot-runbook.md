# Schedule exception pilot runbook

Use the operator-only schedule exception command to manage one barbershop-local
date at a time during the commercial pilot.

## Safety notes

- Run this from the repository root or `apps/api`.
- Verify `DATABASE_URL` points at the intended environment before writing.
- Use `--dry-run` first for every production change.
- This command updates only date-specific schedule exceptions.
- It does **not** modify weekly working hours or appointments.

## Command

```bash
npm run schedule-exception --workspace @barberapp/api -- \
  --barbershop-id <barbershop-id> \
  --date YYYY-MM-DD \
  [--closed | --interval HH:mm-HH:mm ... | --clear] \
  [--dry-run]
```

## Close one date

```bash
npm run schedule-exception --workspace @barberapp/api -- \
  --barbershop-id <barbershop-id> \
  --date 2026-12-25 \
  --closed \
  --dry-run
```

## Set custom intervals

```bash
npm run schedule-exception --workspace @barberapp/api -- \
  --barbershop-id <barbershop-id> \
  --date 2026-12-24 \
  --interval 09:00-13:00 \
  --interval 16:00-19:00 \
  --dry-run
```

## Clear an exception

```bash
npm run schedule-exception --workspace @barberapp/api -- \
  --barbershop-id <barbershop-id> \
  --date 2026-12-24 \
  --clear \
  --dry-run
```

## Expected output

The command prints:

- target environment;
- target database host/port/name without credentials;
- resolved barbershop identity;
- target local date;
- previous and next exception status;
- previous and next intervals;
- whether anything changed;
- whether the run was dry-run or write mode.
