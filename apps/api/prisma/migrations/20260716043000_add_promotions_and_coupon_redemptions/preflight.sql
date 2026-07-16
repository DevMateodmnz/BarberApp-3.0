-- Read-only promotions/coupon-redemption preflight.
-- Expected result: every query returns zero rows.

-- 1) Invalid appointment pricing snapshots.
SELECT id, service_price_cents, discount_cents, final_price_cents
FROM appointments
WHERE service_price_cents < 0
   OR discount_cents < 0
   OR discount_cents > service_price_cents
   OR final_price_cents <> (service_price_cents - discount_cents)
   OR final_price_cents < 0;

-- 2) Duplicate normalized codes per tenant.
SELECT barbershop_id, code_normalized, COUNT(*) AS duplicate_count
FROM promotions
GROUP BY barbershop_id, code_normalized
HAVING COUNT(*) > 1;

-- 3) Cross-tenant promotion/service links.
SELECT
  ps.promotion_id,
  ps.service_id,
  ps.barbershop_id AS link_barbershop_id,
  p.barbershop_id AS promotion_barbershop_id,
  s.barbershop_id AS service_barbershop_id
FROM promotion_services ps
JOIN promotions p ON p.id = ps.promotion_id
JOIN services s ON s.id = ps.service_id
WHERE ps.barbershop_id <> p.barbershop_id
   OR ps.barbershop_id <> s.barbershop_id;

-- 4) Cross-tenant redemption links.
SELECT
  pr.id,
  pr.barbershop_id AS redemption_barbershop_id,
  p.barbershop_id AS promotion_barbershop_id,
  a.barbershop_id AS appointment_barbershop_id,
  c.barbershop_id AS customer_barbershop_id
FROM promotion_redemptions pr
JOIN promotions p ON p.id = pr.promotion_id
JOIN appointments a ON a.id = pr.appointment_id
LEFT JOIN customers c ON c.id = pr.customer_id
WHERE pr.barbershop_id <> p.barbershop_id
   OR pr.barbershop_id <> a.barbershop_id
   OR (c.id IS NOT NULL AND pr.barbershop_id <> c.barbershop_id);

-- 5) Orphan links.
SELECT pr.id, pr.promotion_id, pr.appointment_id, pr.customer_id
FROM promotion_redemptions pr
LEFT JOIN promotions p ON p.id = pr.promotion_id
LEFT JOIN appointments a ON a.id = pr.appointment_id
LEFT JOIN customers c ON c.id = pr.customer_id
WHERE p.id IS NULL
   OR a.id IS NULL
   OR (pr.customer_id IS NOT NULL AND c.id IS NULL);

-- 6) Invalid promotion date or policy ranges.
SELECT id, starts_at, ends_at, discount_type, fixed_discount_cents, percentage_basis_points, minimum_price_cents
FROM promotions
WHERE starts_at >= ends_at
   OR (discount_type = 'FIXED' AND (fixed_discount_cents IS NULL OR fixed_discount_cents <= 0 OR percentage_basis_points IS NOT NULL))
   OR (discount_type = 'PERCENTAGE' AND (percentage_basis_points IS NULL OR percentage_basis_points NOT BETWEEN 1 AND 10000 OR fixed_discount_cents IS NOT NULL))
   OR minimum_price_cents < 0;

-- 7) Impossible redemption timestamps/states.
SELECT id, status, reserved_at, consumed_at, released_at, release_reason
FROM promotion_redemptions
WHERE (status = 'RESERVED' AND (consumed_at IS NOT NULL OR released_at IS NOT NULL OR release_reason IS NOT NULL))
   OR (status = 'CONSUMED' AND (consumed_at IS NULL OR released_at IS NOT NULL OR release_reason IS NOT NULL))
   OR (status = 'RELEASED' AND (consumed_at IS NOT NULL OR released_at IS NULL OR release_reason IS NULL));

-- 8) Negative counters.
SELECT id, active_redemption_count
FROM promotions
WHERE active_redemption_count < 0
UNION ALL
SELECT id, active_redemption_count
FROM promotion_customer_usages
WHERE active_redemption_count < 0;

-- 9) Usage aggregate inconsistencies.
SELECT
  p.id AS promotion_id,
  p.active_redemption_count AS stored_active_redemption_count,
  COUNT(pr.id) FILTER (WHERE pr.status IN ('RESERVED', 'CONSUMED')) AS computed_active_redemption_count
FROM promotions p
LEFT JOIN promotion_redemptions pr ON pr.promotion_id = p.id
GROUP BY p.id, p.active_redemption_count
HAVING p.active_redemption_count <> COUNT(pr.id) FILTER (WHERE pr.status IN ('RESERVED', 'CONSUMED'));

-- 10) Discount/final mismatch on redemptions.
SELECT id, service_price_cents, discount_cents, final_price_cents
FROM promotion_redemptions
WHERE discount_cents < 0
   OR discount_cents > service_price_cents
   OR final_price_cents <> (service_price_cents - discount_cents)
   OR final_price_cents < 0;
