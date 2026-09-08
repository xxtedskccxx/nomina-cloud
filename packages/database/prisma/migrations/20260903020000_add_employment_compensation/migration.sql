-- Employment and compensation are calendar-domain records. The application
-- stores their dates as PostgreSQL DATE values to avoid timezone shifts.

-- CreateEnum
CREATE TYPE "EmploymentType" AS ENUM ('FULL_TIME', 'PART_TIME', 'CONTRACTOR', 'TEMPORARY', 'INTERN');

-- CreateEnum
CREATE TYPE "EmploymentRecordStatus" AS ENUM ('ACTIVE', 'ENDED');

-- CreateEnum
CREATE TYPE "PayFrequency" AS ENUM ('MONTHLY', 'BIWEEKLY', 'WEEKLY', 'HOURLY');

-- CreateTable
CREATE TABLE "Employment" (
    "id" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "employmentType" "EmploymentType" NOT NULL,
    "startDate" DATE NOT NULL,
    "endDate" DATE,
    "status" "EmploymentRecordStatus" NOT NULL DEFAULT 'ACTIVE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Employment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Compensation" (
    "id" TEXT NOT NULL,
    "employmentId" TEXT NOT NULL,
    "amount" DECIMAL(18,2) NOT NULL,
    "currency" VARCHAR(3) NOT NULL,
    "payFrequency" "PayFrequency" NOT NULL,
    "effectiveFrom" DATE NOT NULL,
    "effectiveTo" DATE,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Compensation_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Employment_employeeId_status_idx" ON "Employment"("employeeId", "status");

-- CreateIndex
CREATE INDEX "Employment_employeeId_startDate_idx" ON "Employment"("employeeId", "startDate");

-- CreateIndex
CREATE INDEX "Compensation_employmentId_effectiveFrom_idx" ON "Compensation"("employmentId", "effectiveFrom");

-- CreateIndex
CREATE INDEX "Compensation_employmentId_effectiveTo_idx" ON "Compensation"("employmentId", "effectiveTo");

-- The service also locks the employee row before checking this invariant.
CREATE UNIQUE INDEX "Employment_one_active_per_employee_uidx"
  ON "Employment"("employeeId")
  WHERE "status" = 'ACTIVE';

-- AddForeignKey
ALTER TABLE "Employment" ADD CONSTRAINT "Employment_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Compensation" ADD CONSTRAINT "Compensation_employmentId_fkey" FOREIGN KEY ("employmentId") REFERENCES "Employment"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
