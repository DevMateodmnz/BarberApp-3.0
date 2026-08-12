-- Read-only customer-domain preflight.
--
-- Expected result after a correct backfill:
--   - zero duplicate customer identity groups
--   - zero cross-barbershop appointment/customer links
--   - zero orphan customer references on appointments
--   - zero malformed normalized phones on customers
--   - zero inconsistent first/last seen windows

-- 1) Duplicate identity groups in the directory.
SELECT
  barbershop_id,
  phone_normalized,
  COUNT(*) AS duplicate_count
FROM customers
GROUP BY barbershop_id, phone_normalized
HAVING COUNT(*) > 1
ORDER BY duplicate_count DESC, barbershop_id, phone_normalized;

-- 2) Cross-tenant appointment/customer links.
SELECT
  a.id AS appointment_id,
  a.barbershop_id AS appointment_barbershop_id,
  c.id AS customer_id,
  c.barbershop_id AS customer_barbershop_id
FROM appointments a
JOIN customers c ON c.id = a.customer_id
WHERE a.barbershop_id IS DISTINCT FROM c.barbershop_id;

-- 3) Orphan customer references.
SELECT
  a.id AS appointment_id,
  a.customer_id
FROM appointments a
LEFT JOIN customers c ON c.id = a.customer_id
WHERE a.customer_id IS NOT NULL
  AND c.id IS NULL;

-- 4) Malformed normalized phones that should never back a directory identity.
SELECT
  id,
  barbershop_id,
  phone_normalized
FROM customers
WHERE phone_normalized !~ '^\+[1-9][0-9]{7,19}$';

-- 5) Inconsistent customer visit windows.
SELECT
  c.id,
  c.barbershop_id,
  c.first_seen_at,
  c.last_seen_at,
  MIN(a.start_at) AS linked_first_start_at,
  MAX(a.start_at) AS linked_last_start_at
FROM customers c
LEFT JOIN appointments a
  ON a.customer_id = c.id
 AND a.barbershop_id = c.barbershop_id
 AND a.deleted_at IS NULL
GROUP BY c.id, c.barbershop_id, c.first_seen_at, c.last_seen_at
HAVING c.first_seen_at > c.last_seen_at
    OR (
      COUNT(a.id) > 0
      AND (
        c.first_seen_at <> MIN(a.start_at)
        OR c.last_seen_at <> MAX(a.start_at)
      )
    );
