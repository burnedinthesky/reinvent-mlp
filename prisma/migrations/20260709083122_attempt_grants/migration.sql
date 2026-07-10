-- CreateTable
CREATE TABLE "AttemptGrant" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "studentId" TEXT NOT NULL,
    "phase" TEXT NOT NULL,
    "bonus" INTEGER NOT NULL DEFAULT 0,
    CONSTRAINT "AttemptGrant_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "Student" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "AttemptGrant_studentId_phase_key" ON "AttemptGrant"("studentId", "phase");
