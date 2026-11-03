-- Isolated tests only; no operational account enrollment or migration authorized.
ALTER TABLE "User" ADD COLUMN "authVersion" integer NOT NULL DEFAULT 0 CHECK ("authVersion" >= 0);
