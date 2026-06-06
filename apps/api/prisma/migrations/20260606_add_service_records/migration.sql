-- CreateEnum
CREATE TYPE "PaymentMethod" AS ENUM ('CASH', 'CARD', 'TRANSFER', 'OTHER');

-- CreateTable
CREATE TABLE "service_records" (
    "id" TEXT NOT NULL,
    "barbershop_id" TEXT NOT NULL,
    "employee_id" TEXT NOT NULL,
    "service_id" TEXT NOT NULL,
    "appointment_id" TEXT,
    "client_name" TEXT,
    "price_cents" INTEGER NOT NULL,
    "payment_method" "PaymentMethod",
    "notes" TEXT,
    "performed_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "service_records_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "service_records_barbershop_id_idx" ON "service_records"("barbershop_id");

-- CreateIndex
CREATE INDEX "service_records_employee_id_idx" ON "service_records"("employee_id");

-- CreateIndex
CREATE INDEX "service_records_service_id_idx" ON "service_records"("service_id");

-- CreateIndex
CREATE INDEX "service_records_barbershop_id_performed_at_idx" ON "service_records"("barbershop_id", "performed_at");

-- CreateIndex
CREATE INDEX "service_records_employee_id_performed_at_idx" ON "service_records"("employee_id", "performed_at");

-- AddForeignKey
ALTER TABLE "service_records" ADD CONSTRAINT "service_records_barbershop_id_fkey" FOREIGN KEY ("barbershop_id") REFERENCES "barbershops"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "service_records" ADD CONSTRAINT "service_records_employee_id_fkey" FOREIGN KEY ("employee_id") REFERENCES "employees"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "service_records" ADD CONSTRAINT "service_records_service_id_fkey" FOREIGN KEY ("service_id") REFERENCES "services"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "service_records" ADD CONSTRAINT "service_records_appointment_id_fkey" FOREIGN KEY ("appointment_id") REFERENCES "appointments"("id") ON DELETE SET NULL ON UPDATE CASCADE;
