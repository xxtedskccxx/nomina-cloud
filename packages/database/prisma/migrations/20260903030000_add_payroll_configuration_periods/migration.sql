-- Payroll configuration, period lifecycle and participant snapshot structures.

CREATE TYPE "PayrollPeriodStatus" AS ENUM ('DRAFT', 'OPEN', 'LOCKED');

CREATE TYPE "PayrollCompensationCoverage" AS ENUM ('NONE', 'SINGLE', 'MULTIPLE');

CREATE TABLE "PayrollConfiguration" (
    "id" TEXT NOT NULL,
    "code" VARCHAR(64) NOT NULL,
    "name" VARCHAR(120) NOT NULL,
    "currency" VARCHAR(3) NOT NULL,
    "payFrequency" "PayFrequency" NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PayrollConfiguration_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "PayrollPeriod" (
    "id" TEXT NOT NULL,
    "payrollConfigurationId" TEXT NOT NULL,
    "code" VARCHAR(64) NOT NULL,
    "startDate" DATE NOT NULL,
    "endDate" DATE NOT NULL,
    "paymentDate" DATE NOT NULL,
    "status" "PayrollPeriodStatus" NOT NULL DEFAULT 'DRAFT',
    "openedAt" TIMESTAMP(3),
    "openedByUserId" TEXT,
    "lockedAt" TIMESTAMP(3),
    "lockedByUserId" TEXT,
    "reopenedAt" TIMESTAMP(3),
    "reopenedByUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PayrollPeriod_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "PayrollParticipant" (
    "id" TEXT NOT NULL,
    "payrollPeriodId" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "employmentId" TEXT NOT NULL,
    "compensationId" TEXT,
    "compensationCoverage" "PayrollCompensationCoverage" NOT NULL DEFAULT 'NONE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PayrollParticipant_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "PayrollConfiguration_code_key" ON "PayrollConfiguration"("code");
CREATE INDEX "PayrollConfiguration_isActive_idx" ON "PayrollConfiguration"("isActive");
CREATE INDEX "PayrollPeriod_payrollConfigurationId_status_idx" ON "PayrollPeriod"("payrollConfigurationId", "status");
CREATE INDEX "PayrollPeriod_payrollConfigurationId_startDate_idx" ON "PayrollPeriod"("payrollConfigurationId", "startDate");
CREATE INDEX "PayrollPeriod_payrollConfigurationId_endDate_idx" ON "PayrollPeriod"("payrollConfigurationId", "endDate");
CREATE UNIQUE INDEX "payroll_period_configuration_code_uidx" ON "PayrollPeriod"("payrollConfigurationId", "code");
CREATE INDEX "PayrollParticipant_payrollPeriodId_idx" ON "PayrollParticipant"("payrollPeriodId");
CREATE INDEX "PayrollParticipant_employeeId_idx" ON "PayrollParticipant"("employeeId");
CREATE INDEX "PayrollParticipant_employmentId_idx" ON "PayrollParticipant"("employmentId");
CREATE UNIQUE INDEX "payroll_participant_period_employee_uidx" ON "PayrollParticipant"("payrollPeriodId", "employeeId");

ALTER TABLE "PayrollPeriod"
  ADD CONSTRAINT "PayrollPeriod_payrollConfigurationId_fkey"
  FOREIGN KEY ("payrollConfigurationId") REFERENCES "PayrollConfiguration"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "PayrollParticipant"
  ADD CONSTRAINT "PayrollParticipant_payrollPeriodId_fkey"
  FOREIGN KEY ("payrollPeriodId") REFERENCES "PayrollPeriod"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "PayrollParticipant"
  ADD CONSTRAINT "PayrollParticipant_employeeId_fkey"
  FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "PayrollParticipant"
  ADD CONSTRAINT "PayrollParticipant_employmentId_fkey"
  FOREIGN KEY ("employmentId") REFERENCES "Employment"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "PayrollParticipant"
  ADD CONSTRAINT "PayrollParticipant_compensationId_fkey"
  FOREIGN KEY ("compensationId") REFERENCES "Compensation"("id") ON DELETE SET NULL ON UPDATE CASCADE;
