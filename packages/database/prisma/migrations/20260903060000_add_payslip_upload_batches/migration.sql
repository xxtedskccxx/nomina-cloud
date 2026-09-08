-- Persist each bulk upload session independently from its payslips.
CREATE TYPE "PayslipMatchMethod" AS ENUM ('EXACT', 'NORMALIZED', 'MANUAL', 'UNMATCHED');
CREATE TYPE "PayslipUploadBatchStatus" AS ENUM ('PROCESSING', 'NEEDS_REVIEW', 'READY', 'COMPLETED', 'PARTIAL', 'FAILED');
CREATE TYPE "PayslipUploadItemStatus" AS ENUM ('PROCESSING', 'COMPLETED', 'NEEDS_REVIEW', 'DUPLICATE', 'INVALID', 'FAILED', 'SKIPPED');

ALTER TABLE "Payslip"
ADD COLUMN "matchMethod" "PayslipMatchMethod" NOT NULL DEFAULT 'UNMATCHED';

CREATE TABLE "PayslipUploadBatch" (
    "id" TEXT NOT NULL,
    "payrollPeriodId" TEXT NOT NULL,
    "createdByUserId" TEXT,
    "status" "PayslipUploadBatchStatus" NOT NULL DEFAULT 'PROCESSING',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),

    CONSTRAINT "PayslipUploadBatch_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "PayslipUploadItem" (
    "id" TEXT NOT NULL,
    "batchId" TEXT NOT NULL,
    "originalFileName" VARCHAR(255) NOT NULL,
    "checksum" CHAR(64),
    "stagingStorageKey" VARCHAR(512),
    "payslipId" TEXT,
    "duplicateOfPayslipId" TEXT,
    "status" "PayslipUploadItemStatus" NOT NULL DEFAULT 'PROCESSING',
    "matchMethod" "PayslipMatchMethod" NOT NULL DEFAULT 'UNMATCHED',
    "errorCode" VARCHAR(64),
    "message" VARCHAR(255),
    "attemptCount" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "completedAt" TIMESTAMP(3),

    CONSTRAINT "PayslipUploadItem_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "PayslipUploadBatch_payrollPeriodId_createdAt_idx" ON "PayslipUploadBatch"("payrollPeriodId", "createdAt");
CREATE INDEX "PayslipUploadBatch_status_createdAt_idx" ON "PayslipUploadBatch"("status", "createdAt");
CREATE UNIQUE INDEX "PayslipUploadItem_stagingStorageKey_key" ON "PayslipUploadItem"("stagingStorageKey");
CREATE UNIQUE INDEX "PayslipUploadItem_payslipId_key" ON "PayslipUploadItem"("payslipId");
CREATE UNIQUE INDEX "payslip_upload_item_batch_checksum_uidx" ON "PayslipUploadItem"("batchId", "checksum");
CREATE INDEX "PayslipUploadItem_batchId_status_idx" ON "PayslipUploadItem"("batchId", "status");
CREATE INDEX "PayslipUploadItem_batchId_createdAt_idx" ON "PayslipUploadItem"("batchId", "createdAt");

ALTER TABLE "PayslipUploadBatch" ADD CONSTRAINT "PayslipUploadBatch_payrollPeriodId_fkey"
  FOREIGN KEY ("payrollPeriodId") REFERENCES "PayrollPeriod"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "PayslipUploadItem" ADD CONSTRAINT "PayslipUploadItem_batchId_fkey"
  FOREIGN KEY ("batchId") REFERENCES "PayslipUploadBatch"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "PayslipUploadItem" ADD CONSTRAINT "PayslipUploadItem_payslipId_fkey"
  FOREIGN KEY ("payslipId") REFERENCES "Payslip"("id") ON DELETE SET NULL ON UPDATE CASCADE;
