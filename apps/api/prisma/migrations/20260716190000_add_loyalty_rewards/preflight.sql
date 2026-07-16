-- Read-only loyalty preflight.
-- New loyalty tables are additive; verify only that the referenced reward template
-- candidates stay tenant-scoped and that no pre-existing data violates the new FK targets.

SELECT id, barbershop_id, deleted_at
FROM promotions
WHERE deleted_at IS NOT NULL
LIMIT 1;

SELECT id, barbershop_id, phone_normalized
FROM customers
WHERE deleted_at IS NULL
LIMIT 1;
