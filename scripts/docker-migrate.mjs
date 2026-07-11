import { createRequire } from "node:module";
import { mkdir, readdir, readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";

const require = createRequire(import.meta.url);
const Database = require("../.output/server/node_modules/better-sqlite3");

function sqlitePath(url) {
    if (!url.startsWith("file:")) {
        throw new Error("Docker runtime requires a file: SQLite DATABASE_URL");
    }
    const value = url.slice("file:".length);
    return value.startsWith("/") ? value : resolve(value);
}

function tableExists(db, name) {
    return Boolean(
        db
            .prepare(
                "SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = ?"
            )
            .get(name)
    );
}

const databasePath = sqlitePath(
    process.env.DATABASE_URL || "file:/app/data/workshop.db"
);
await mkdir(dirname(databasePath), { recursive: true });

const db = new Database(databasePath);
db.pragma("foreign_keys = ON");
db.pragma("journal_mode = WAL");
db.exec(`
    CREATE TABLE IF NOT EXISTS "_docker_migrations" (
        "name" TEXT NOT NULL PRIMARY KEY,
        "appliedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
    )
`);

const applied = new Set(
    db
        .prepare('SELECT "name" FROM "_docker_migrations"')
        .all()
        .map((row) => row.name)
);

// Existing Prisma-managed databases already record these names. Treat both
// ledgers as authoritative so moving an existing DB into Docker is safe.
if (tableExists(db, "_prisma_migrations")) {
    for (const row of db
        .prepare(
            'SELECT "migration_name" FROM "_prisma_migrations" WHERE "finished_at" IS NOT NULL'
        )
        .all()) {
        applied.add(row.migration_name);
    }
}

const migrationsDir = resolve("prisma/migrations");
const migrations = (await readdir(migrationsDir, { withFileTypes: true }))
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort();

for (const name of migrations) {
    if (applied.has(name)) continue;
    const sql = await readFile(
        resolve(migrationsDir, name, "migration.sql"),
        "utf8"
    );
    db.transaction(() => {
        db.exec(sql);
        db.prepare('INSERT INTO "_docker_migrations" ("name") VALUES (?)').run(
            name
        );
    })();
    console.log(`[database] applied ${name}`);
}

db.close();
