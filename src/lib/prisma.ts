import { PrismaBetterSqlite3 } from "@prisma/adapter-better-sqlite3";
import { PrismaClient } from "#/generated/prisma/client";

const globalForPrisma = globalThis as unknown as {
    prisma: PrismaClient | undefined;
};

// Prisma 7 talks to SQLite through a driver adapter. The DATABASE_URL
// (file:./prisma/dev.db) is resolved by prisma.config.ts for the CLI; here we
// point the adapter at the same file.
const adapter = new PrismaBetterSqlite3({
    url: process.env["DATABASE_URL"] ?? "file:./prisma/dev.db",
});

export const prisma =
    globalForPrisma.prisma ??
    new PrismaClient({
        adapter,
        log: ["error", "warn"],
    });

if (process.env["NODE_ENV"] !== "production") globalForPrisma.prisma = prisma;
