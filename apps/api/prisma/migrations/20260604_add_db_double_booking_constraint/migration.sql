-- Enable btree_gist for GiST index on text/equality columns
CREATE EXTENSION IF NOT EXISTS btree_gist;

-- Prevent overlapping active appointments per employee
-- idempotent: skips if constraint already exists
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'no_double_booking' AND conrelid = 'appointments'::regclass
  ) THEN
    ALTER TABLE "appointments"
    ADD CONSTRAINT no_double_booking
    EXCLUDE USING gist (
      employee_id WITH =,
      tsrange(start_at, end_at, '[)') WITH &&
    ) WHERE (status IN ('PENDING', 'CONFIRMED', 'IN_PROGRESS'));
  END IF;
END $$;
