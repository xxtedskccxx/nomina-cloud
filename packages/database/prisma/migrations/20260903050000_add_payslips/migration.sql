-- CreateEnum
CREATE TYPE "PayslipStatus" AS ENUM ('DRAFT', 'PUBLISHED', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "PayslipMatchStatus" AS ENUM ('UNMATCHED', 'MATCHED', 'NEEDS_REVIEW');

-- CreateTable
CREATE TABLE "Payslip" (
    "id" TEXT NOT NULL,
    "employeeId" TEXT,
    "payrollPeriodId" TEXT NOT NULL,
    "originalFileName" VARCHAR(255) NOT NULL,
    "storageKey" VARCHAR(512) NOT NULL,
    "mimeType" VARCHAR(100) NOT NULL,
    "fileSize" INTEGER NOT NULL,
    "checksum" CHAR(64) NOT NULL,
    "status" "PayslipStatus" NOT NULL DEFAULT 'DRAFT',
    "matchStatus" "PayslipMatchStatus" NOT NULL DEFAULT 'UNMATCHED',
    "reviewReason" VARCHAR(255),
    "uploadedByUserId" TEXT,
    "uploadedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "publishedByUserId" TEXT,
    "publishedAt" TIMESTAMP(3),
    "archivedByUserId" TEXT,
    "archivedAt" TIMESTAMP(3),
    "replacedPayslipId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Payslip_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Payslip_storageKey_key" ON "Payslip"("storageKey");

-- CreateIndex
CREATE UNIQUE INDEX "Payslip_replacedPayslipId_key" ON "Payslip"("replacedPayslipId");

-- CreateIndex
CREATE INDEX "Payslip_employeeId_payrollPeriodId_idx" ON "Payslip"("employeeId", "payrollPeriodId");

-- CreateIndex
CREATE INDEX "Payslip_payrollPeriodId_status_idx" ON "Payslip"("payrollPeriodId", "status");

-- CreateIndex
CREATE INDEX "Payslip_employeeId_status_idx" ON "Payslip"("employeeId", "status");

-- CreateIndex
CREATE INDEX "Payslip_payrollPeriodId_checksum_idx" ON "Payslip"("payrollPeriodId", "checksum");

-- One current document per employee and period. Archived versions remain available for audit.
CREATE UNIQUE INDEX "payslip_employee_period_active_uidx"
  ON "Payslip"("employeeId", "payrollPeriodId")
  WHERE "employeeId" IS NOT NULL AND "status" IN ('DRAFT', 'PUBLISHED');

-- AddForeignKey
ALTER TABLE "Payslip" ADD CONSTRAINT "Payslip_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Payslip" ADD CONSTRAINT "Payslip_payrollPeriodId_fkey" FOREIGN KEY ("payrollPeriodId") REFERENCES "PayrollPeriod"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Payslip" ADD CONSTRAINT "Payslip_replacedPayslipId_fkey" FOREIGN KEY ("replacedPayslipId") REFERENCES "Payslip"("id") ON DELETE SET NULL ON UPDATE CASCADE;
