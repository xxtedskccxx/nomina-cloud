-- Keep period date invariants enforced even when a future writer bypasses the API.
ALTER TABLE "PayrollPeriod"
  ADD CONSTRAINT "PayrollPeriod_dates_check"
  CHECK ("startDate" <= "endDate" AND "paymentDate" >= "endDate");
