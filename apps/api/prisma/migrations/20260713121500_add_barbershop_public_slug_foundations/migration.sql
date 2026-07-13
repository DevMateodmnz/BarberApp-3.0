-- Add nullable public slug support for controlled future public-booking rollout.
-- Existing barbershops remain unpublished until a later provisioning slice assigns slugs.
ALTER TABLE "barbershops"
ADD COLUMN "public_slug" TEXT;

CREATE UNIQUE INDEX "barbershops_public_slug_key" ON "barbershops"("public_slug");

ALTER TABLE "barbershops"
ADD CONSTRAINT "barbershops_public_slug_canonical_chk"
CHECK (
  "public_slug" IS NULL
  OR (
    "public_slug" = lower("public_slug")
    AND char_length("public_slug") BETWEEN 3 AND 50
    AND "public_slug" ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'
  )
);
