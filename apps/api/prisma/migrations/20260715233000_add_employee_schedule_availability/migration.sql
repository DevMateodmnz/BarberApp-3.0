CREATE TYPE "EmployeeScheduleMode" AS ENUM (
  'INHERIT_BARBERSHOP',
  'CUSTOM'
);

CREATE TYPE "EmployeeScheduleExceptionType" AS ENUM (
  'FULL_DAY_OFF',
  'CUSTOM_HOURS'
);

ALTER TABLE "employees"
  ADD COLUMN "schedule_mode" "EmployeeScheduleMode" NOT NULL DEFAULT 'INHERIT_BARBERSHOP';

CREATE UNIQUE INDEX "employees_id_barbershop_id_key"
  ON "employees"("id", "barbershop_id");

CREATE TABLE "employee_working_intervals" (
  "id" TEXT NOT NULL,
  "barbershop_id" TEXT NOT NULL,
  "employee_id" TEXT NOT NULL,
  "day_of_week" INTEGER NOT NULL,
  "open_time" TEXT NOT NULL,
  "close_time" TEXT NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "employee_working_intervals_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "employee_working_intervals_day_of_week_check"
    CHECK ("day_of_week" BETWEEN 0 AND 6),
  CONSTRAINT "employee_working_intervals_open_time_format_check"
    CHECK ("open_time" ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'),
  CONSTRAINT "employee_working_intervals_close_time_format_check"
    CHECK ("close_time" ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'),
  CONSTRAINT "employee_working_intervals_order_check"
    CHECK ("open_time" < "close_time")
);

CREATE UNIQUE INDEX "employee_working_intervals_employee_id_day_of_week_key"
  ON "employee_working_intervals"("employee_id", "day_of_week");

CREATE INDEX "employee_working_intervals_employee_id_idx"
  ON "employee_working_intervals"("employee_id");

CREATE INDEX "employee_working_intervals_barbershop_id_day_of_week_idx"
  ON "employee_working_intervals"("barbershop_id", "day_of_week");

ALTER TABLE "employee_working_intervals"
  ADD CONSTRAINT "employee_working_intervals_employee_id_barbershop_id_fkey"
  FOREIGN KEY ("employee_id", "barbershop_id") REFERENCES "employees"("id", "barbershop_id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "employee_working_intervals"
  ADD CONSTRAINT "employee_working_intervals_barbershop_id_fkey"
  FOREIGN KEY ("barbershop_id") REFERENCES "barbershops"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "employee_schedule_exceptions" (
  "id" TEXT NOT NULL,
  "barbershop_id" TEXT NOT NULL,
  "employee_id" TEXT NOT NULL,
  "local_date" TEXT NOT NULL,
  "type" "EmployeeScheduleExceptionType" NOT NULL,
  "reason" VARCHAR(500),
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "employee_schedule_exceptions_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "employee_schedule_exceptions_local_date_format_check"
    CHECK ("local_date" ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$')
);

CREATE UNIQUE INDEX "employee_schedule_exceptions_employee_id_local_date_key"
  ON "employee_schedule_exceptions"("employee_id", "local_date");

CREATE INDEX "employee_schedule_exceptions_employee_id_local_date_idx"
  ON "employee_schedule_exceptions"("employee_id", "local_date");

CREATE INDEX "employee_schedule_exceptions_barbershop_id_local_date_idx"
  ON "employee_schedule_exceptions"("barbershop_id", "local_date");

ALTER TABLE "employee_schedule_exceptions"
  ADD CONSTRAINT "employee_schedule_exceptions_employee_id_barbershop_id_fkey"
  FOREIGN KEY ("employee_id", "barbershop_id") REFERENCES "employees"("id", "barbershop_id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "employee_schedule_exceptions"
  ADD CONSTRAINT "employee_schedule_exceptions_barbershop_id_fkey"
  FOREIGN KEY ("barbershop_id") REFERENCES "barbershops"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "employee_schedule_exception_intervals" (
  "id" TEXT NOT NULL,
  "schedule_exception_id" TEXT NOT NULL,
  "open_time" TEXT NOT NULL,
  "close_time" TEXT NOT NULL,
  "position" INTEGER NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "employee_schedule_exception_intervals_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "employee_schedule_exception_intervals_open_time_format_check"
    CHECK ("open_time" ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'),
  CONSTRAINT "employee_schedule_exception_intervals_close_time_format_check"
    CHECK ("close_time" ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'),
  CONSTRAINT "employee_schedule_exception_intervals_order_check"
    CHECK ("open_time" < "close_time")
);

CREATE UNIQUE INDEX "employee_schedule_exception_intervals_schedule_exception_id_position_key"
  ON "employee_schedule_exception_intervals"("schedule_exception_id", "position");

CREATE INDEX "employee_schedule_exception_intervals_schedule_exception_id_idx"
  ON "employee_schedule_exception_intervals"("schedule_exception_id");

ALTER TABLE "employee_schedule_exception_intervals"
  ADD CONSTRAINT "employee_schedule_exception_intervals_schedule_exception_id_fkey"
  FOREIGN KEY ("schedule_exception_id") REFERENCES "employee_schedule_exceptions"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
