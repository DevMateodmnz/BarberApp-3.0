-- CreateEnum
CREATE TYPE "EmployeeInvitationStatus" AS ENUM ('PENDING', 'ACCEPTED', 'REVOKED', 'EXPIRED', 'DELIVERY_FAILED');

-- CreateTable
CREATE TABLE "employee_invitations" (
    "id" TEXT NOT NULL,
    "barbershop_id" TEXT NOT NULL,
    "invited_by_user_id" TEXT NOT NULL,
    "email_normalized" TEXT NOT NULL,
    "invited_role" "UserRole" NOT NULL DEFAULT 'BARBER',
    "status" "EmployeeInvitationStatus" NOT NULL DEFAULT 'PENDING',
    "clerk_invitation_id" TEXT,
    "expires_at" TIMESTAMP(3),
    "last_sent_at" TIMESTAMP(3),
    "resend_count" INTEGER NOT NULL DEFAULT 0,
    "delivery_failure_code" TEXT,
    "accepted_at" TIMESTAMP(3),
    "revoked_at" TIMESTAMP(3),
    "user_id" TEXT,
    "employee_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "employee_invitations_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "employee_invitations_barbershop_id_email_normalized_key" ON "employee_invitations"("barbershop_id", "email_normalized");

-- CreateIndex
CREATE UNIQUE INDEX "employee_invitations_clerk_invitation_id_key" ON "employee_invitations"("clerk_invitation_id");

-- CreateIndex
CREATE INDEX "employee_invitations_barbershop_id_idx" ON "employee_invitations"("barbershop_id");

-- CreateIndex
CREATE INDEX "employee_invitations_invited_by_user_id_idx" ON "employee_invitations"("invited_by_user_id");

-- CreateIndex
CREATE INDEX "employee_invitations_user_id_idx" ON "employee_invitations"("user_id");

-- CreateIndex
CREATE INDEX "employee_invitations_employee_id_idx" ON "employee_invitations"("employee_id");

-- CreateIndex
CREATE INDEX "employee_invitations_barbershop_id_status_idx" ON "employee_invitations"("barbershop_id", "status");

-- AddForeignKey
ALTER TABLE "employee_invitations" ADD CONSTRAINT "employee_invitations_barbershop_id_fkey" FOREIGN KEY ("barbershop_id") REFERENCES "barbershops"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "employee_invitations" ADD CONSTRAINT "employee_invitations_invited_by_user_id_fkey" FOREIGN KEY ("invited_by_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "employee_invitations" ADD CONSTRAINT "employee_invitations_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "employee_invitations" ADD CONSTRAINT "employee_invitations_employee_id_fkey" FOREIGN KEY ("employee_id") REFERENCES "employees"("id") ON DELETE SET NULL ON UPDATE CASCADE;
