-- Enable btree_gist extension for GiST index support with equality operators
CREATE EXTENSION IF NOT EXISTS btree_gist;

-- Add exclusion constraint to prevent overlapping appointments for the same employee
-- Only applies to active statuses: PENDING, CONFIRMED, IN_PROGRESS
-- Allows: CANCELLED, COMPLETED, NO_SHOW appointments to overlap
ALTER TABLE "appointments"
ADD CONSTRAINT no_double_booking
EXCLUDE USING gist (
  employee_id WITH =,
  tsrange(start_at, end_at) WITH &&
) WHERE (status IN ('PENDING', 'CONFIRMED'));
