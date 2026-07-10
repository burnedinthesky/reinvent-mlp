-- Rename workshop phases: P4.5 -> P5, and the old P5 -> P6.
-- Order matters: shift the old P5 rows up to P6 FIRST so the P4.5 -> P5
-- rename can't collide with rows that were already P5.
UPDATE "Submission" SET "phase" = 'P6' WHERE "phase" = 'P5';
UPDATE "Submission" SET "phase" = 'P5' WHERE "phase" = 'P4.5';
