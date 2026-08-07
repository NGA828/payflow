-- Setup wizard progress (Phase 2): highest wizard step the company has reached.
ALTER TABLE "Company" ADD COLUMN "setupStep" INTEGER NOT NULL DEFAULT 1;
