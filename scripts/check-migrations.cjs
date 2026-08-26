const fs = require("node:fs");
const path = require("node:path");

const migrationsDirectory = path.resolve(__dirname, "..", "backend", "database", "migrations");
const migrationFiles = fs
  .readdirSync(migrationsDirectory)
  .filter((file) => file.endsWith(".sql"))
  .sort();

if (migrationFiles.length === 0) {
  throw new Error("Không tìm thấy migration SQL nào.");
}

const versions = migrationFiles.map((file) => {
  const match = /^(\d{3})_[a-z0-9_]+\.sql$/i.exec(file);
  if (!match) {
    throw new Error(`Tên tệp migration phải theo dạng NNN_name.sql: ${file}`);
  }

  return Number(match[1]);
});

versions.forEach((version, index) => {
  const expected = index + 1;
  if (version !== expected) {
    throw new Error(`Chuỗi migration không liên tục: cần ${String(expected).padStart(3, "0")}, nhưng nhận ${version}.`);
  }
});

for (const file of migrationFiles) {
  const content = fs.readFileSync(path.join(migrationsDirectory, file), "utf8");
  if (!/;\s*$/.test(content)) {
    throw new Error(`Migration phải kết thúc bằng dấu chấm phẩy: ${file}`);
  }
  if (/\bDROP\s+(TABLE|COLUMN|SCHEMA|DATABASE)\b|\bTRUNCATE\b|\bDELETE\s+FROM\b/i.test(content)) {
    throw new Error(`Không cho phép câu lệnh migration phá hủy trong kiểm tra đường cơ sở: ${file}`);
  }
}

console.log(`Kiểm tra migration đạt: ${migrationFiles.join(", ")}`);
