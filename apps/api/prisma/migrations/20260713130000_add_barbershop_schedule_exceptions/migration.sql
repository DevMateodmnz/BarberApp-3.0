CREATE TABLE "barbershop_schedule_exceptions" (
    "id" TEXT NOT NULL,
    "barbershop_id" TEXT NOT NULL,
    "local_date" TEXT NOT NULL,
    "is_closed" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "barbershop_schedule_exceptions_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "barbershop_schedule_exceptions_local_date_format_check"
      CHECK ("local_date" ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$')
);

CREATE TABLE "barbershop_schedule_exception_intervals" (
    "id" TEXT NOT NULL,
    "schedule_exception_id" TEXT NOT NULL,
    "open_time" TEXT NOT NULL,
    "close_time" TEXT NOT NULL,
    "position" INTEGER NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "barbershop_schedule_exception_intervals_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "barbershop_schedule_exception_intervals_open_time_format_check"
      CHECK ("open_time" ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'),
    CONSTRAINT "barbershop_schedule_exception_intervals_close_time_format_check"
      CHECK ("close_time" ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'),
    CONSTRAINT "barbershop_schedule_exception_intervals_order_check"
      CHECK ("open_time" < "close_time")
);

CREATE UNIQUE INDEX "barbershop_schedule_exceptions_barbershop_id_local_date_key"
  ON "barbershop_schedule_exceptions"("barbershop_id", "local_date");

CREATE INDEX "barbershop_schedule_exceptions_barbershop_id_idx"
  ON "barbershop_schedule_exceptions"("barbershop_id");

CREATE UNIQUE INDEX "barbershop_schedule_exception_intervals_schedule_exception_id_position_key"
  ON "barbershop_schedule_exception_intervals"("schedule_exception_id", "position");

CREATE INDEX "barbershop_schedule_exception_intervals_schedule_exception_id_idx"
  ON "barbershop_schedule_exception_intervals"("schedule_exception_id");

ALTER TABLE "barbershop_schedule_exceptions"
  ADD CONSTRAINT "barbershop_schedule_exceptions_barbershop_id_fkey"
  FOREIGN KEY ("barbershop_id") REFERENCES "barbershops"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "barbershop_schedule_exception_intervals"
  ADD CONSTRAINT "barbershop_schedule_exception_intervals_schedule_exception_id_fkey"
  FOREIGN KEY ("schedule_exception_id") REFERENCES "barbershop_schedule_exceptions"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
