const fs = require("node:fs");
const path = require("node:path");

const migrationsDirectory = path.resolve(__dirname, "..", "backend", "database", "migrations");
const migrationFiles = fs
  .readdirSync(migrationsDirectory)
  .filter((file) => file.endsWith(".sql"))
  .sort();

if (migrationFiles.length === 0) {
  throw new Error("No SQL migrations found.");
}

const versions = migrationFiles.map((file) => {
  const match = /^(\d{3})_[a-z0-9_]+\.sql$/i.exec(file);
  if (!match) {
    throw new Error(`Migration filename must use NNN_name.sql: ${file}`);
  }

  return Number(match[1]);
});

versions.forEach((version, index) => {
  const expected = index + 1;
  if (version !== expected) {
    throw new Error(
      `Migration sequence is not contiguous: expected ${String(expected).padStart(3, "0")}, found ${version}.`,
    );
  }
});

for (const file of migrationFiles) {
  const content = fs.readFileSync(path.join(migrationsDirectory, file), "utf8");
  if (!/;\s*$/.test(content)) {
    throw new Error(`Migration must end with a semicolon: ${file}`);
  }
  if (/\bDROP\s+(TABLE|COLUMN|SCHEMA|DATABASE)\b|\bTRUNCATE\b|\bDELETE\s+FROM\b/i.test(content)) {
    throw new Error(`Destructive migration statement is not allowed in baseline check: ${file}`);
  }
}

console.log(`Migration check passed: ${migrationFiles.join(", ")}`);
