-- CreateTable
CREATE TABLE "Student" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "nickname" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "code4" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "Submission" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "studentId" TEXT NOT NULL,
    "phase" TEXT NOT NULL,
    "payload" TEXT NOT NULL,
    "score" REAL NOT NULL,
    "score2" REAL,
    "flag" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Submission_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "Student" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "FogQuery" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "studentId" TEXT NOT NULL,
    "round" TEXT NOT NULL,
    "w" REAL NOT NULL,
    "b" REAL NOT NULL,
    "loss" REAL NOT NULL,
    "seq" INTEGER NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "FogQuery_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "Student" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "AppState" (
    "key" TEXT NOT NULL PRIMARY KEY,
    "value" TEXT NOT NULL
);

-- CreateTable
CREATE TABLE "Dataset" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "active" BOOLEAN NOT NULL DEFAULT false,
    "label" TEXT NOT NULL,
    "real48" TEXT NOT NULL,
    "points" TEXT NOT NULL,
    "config" TEXT NOT NULL,
    "meta" TEXT,
    "source" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateIndex
CREATE UNIQUE INDEX "Student_nickname_key" ON "Student"("nickname");

-- CreateIndex
CREATE UNIQUE INDEX "Student_token_key" ON "Student"("token");

-- CreateIndex
CREATE INDEX "Student_token_idx" ON "Student"("token");

-- CreateIndex
CREATE INDEX "Submission_studentId_phase_idx" ON "Submission"("studentId", "phase");

-- CreateIndex
CREATE INDEX "Submission_phase_idx" ON "Submission"("phase");

-- CreateIndex
CREATE INDEX "FogQuery_studentId_round_idx" ON "FogQuery"("studentId", "round");

-- CreateIndex
CREATE INDEX "FogQuery_round_idx" ON "FogQuery"("round");

-- CreateIndex
CREATE INDEX "Dataset_active_idx" ON "Dataset"("active");
