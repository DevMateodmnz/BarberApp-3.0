-- Read-only employee-schedule preflight.
-- Run after the employee schedule tables exist and before any production deploy.
-- Expected result: every query returns zero rows.

-- 1) Employee rows without valid barbershop ownership.
SELECT
  e.id AS employee_id,
  e.barbershop_id
FROM employees e
LEFT JOIN barbershops b ON b.id = e.barbershop_id
WHERE b.id IS NULL;

-- 2) Cross-tenant or orphan employee working intervals.
SELECT
  ewi.id AS interval_id,
  ewi.barbershop_id AS interval_barbershop_id,
  ewi.employee_id,
  e.barbershop_id AS employee_barbershop_id
FROM employee_working_intervals ewi
LEFT JOIN employees e
  ON e.id = ewi.employee_id
 AND e.barbershop_id = ewi.barbershop_id
WHERE e.id IS NULL;

-- 3) Invalid employee working interval weekdays or windows.
SELECT
  id,
  employee_id,
  day_of_week,
  open_time,
  close_time
FROM employee_working_intervals
WHERE day_of_week NOT BETWEEN 0 AND 6
   OR open_time !~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'
   OR close_time !~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'
   OR open_time >= close_time;

-- 4) Overlapping employee working intervals (future-proof even though one interval/day is enforced).
SELECT
  a.employee_id,
  a.day_of_week,
  a.id AS left_interval_id,
  b.id AS right_interval_id,
  a.open_time AS left_open_time,
  a.close_time AS left_close_time,
  b.open_time AS right_open_time,
  b.close_time AS right_close_time
FROM employee_working_intervals a
JOIN employee_working_intervals b
  ON a.employee_id = b.employee_id
 AND a.day_of_week = b.day_of_week
 AND a.id < b.id
WHERE a.open_time < b.close_time
  AND b.open_time < a.close_time;

-- 5) Cross-tenant or orphan employee exceptions.
SELECT
  ese.id AS exception_id,
  ese.barbershop_id AS exception_barbershop_id,
  ese.employee_id,
  e.barbershop_id AS employee_barbershop_id
FROM employee_schedule_exceptions ese
LEFT JOIN employees e
  ON e.id = ese.employee_id
 AND e.barbershop_id = ese.barbershop_id
WHERE e.id IS NULL;

-- 6) Duplicate employee exceptions by logical date.
SELECT
  employee_id,
  local_date,
  COUNT(*) AS duplicate_count
FROM employee_schedule_exceptions
GROUP BY employee_id, local_date
HAVING COUNT(*) > 1;

-- 7) Orphan employee exception intervals.
SELECT
  esei.id AS interval_id,
  esei.schedule_exception_id
FROM employee_schedule_exception_intervals esei
LEFT JOIN employee_schedule_exceptions ese
  ON ese.id = esei.schedule_exception_id
WHERE ese.id IS NULL;

-- 8) Invalid employee exception intervals.
SELECT
  id,
  schedule_exception_id,
  open_time,
  close_time
FROM employee_schedule_exception_intervals
WHERE open_time !~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'
   OR close_time !~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'
   OR open_time >= close_time;

-- 9) Overlapping employee exception intervals per exception.
SELECT
  a.schedule_exception_id,
  a.id AS left_interval_id,
  b.id AS right_interval_id,
  a.open_time AS left_open_time,
  a.close_time AS left_close_time,
  b.open_time AS right_open_time,
  b.close_time AS right_close_time
FROM employee_schedule_exception_intervals a
JOIN employee_schedule_exception_intervals b
  ON a.schedule_exception_id = b.schedule_exception_id
 AND a.id < b.id
WHERE a.open_time < b.close_time
  AND b.open_time < a.close_time;
