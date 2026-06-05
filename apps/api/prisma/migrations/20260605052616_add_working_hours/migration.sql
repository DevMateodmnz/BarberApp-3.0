-- CreateTable
CREATE TABLE "working_hours" (
    "id" TEXT NOT NULL,
    "barbershop_id" TEXT NOT NULL,
    "day_of_week" INTEGER NOT NULL,
    "open_time" TEXT NOT NULL,
    "close_time" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "working_hours_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "working_hours_barbershop_id_idx" ON "working_hours"("barbershop_id");

-- CreateIndex
CREATE UNIQUE INDEX "working_hours_barbershop_id_day_of_week_key" ON "working_hours"("barbershop_id", "day_of_week");

-- AddForeignKey
ALTER TABLE "working_hours" ADD CONSTRAINT "working_hours_barbershop_id_fkey" FOREIGN KEY ("barbershop_id") REFERENCES "barbershops"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Seed default working hours for existing barbershops
-- Monday-Friday: 09:00-19:00, Saturday: 09:00-14:00, Sunday: closed (no row)
INSERT INTO "working_hours" ("id", "barbershop_id", "day_of_week", "open_time", "close_time", "isActive", "created_at", "updated_at")
SELECT
  gen_random_uuid()::text,
  b.id,
  d.day,
  '09:00',
  CASE WHEN d.day = 6 THEN '14:00' ELSE '19:00' END,
  true,
  NOW(),
  NOW()
FROM "barbershops" b
CROSS JOIN (VALUES (1),(2),(3),(4),(5),(6)) AS d(day)
WHERE NOT EXISTS (
  SELECT 1 FROM "working_hours" wh
  WHERE wh."barbershop_id" = b.id AND wh."day_of_week" = d.day
);
