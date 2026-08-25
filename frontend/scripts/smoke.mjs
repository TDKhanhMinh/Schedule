import assert from "node:assert/strict";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";

const dist = resolve(import.meta.dirname, "..", "dist");
assert.ok(existsSync(join(dist, "index.html")), "dist/index.html is missing; run the frontend build first");

const html = readFileSync(join(dist, "index.html"), "utf8");
assert.match(html, /<div id="root"><\/div>/, "the Vite root mount is missing");

const assets = readdirSync(join(dist, "assets"));
const javascript = assets.find((asset) => asset.endsWith(".js"));
const stylesheet = assets.find((asset) => asset.endsWith(".css"));
assert.ok(javascript, "the production JavaScript asset is missing");
assert.ok(stylesheet, "the production CSS asset is missing");

const bundle = readFileSync(join(dist, "assets", javascript), "utf8");
for (const marker of [
  "School Timetable",
  "/master-data",
  "/imports",
  "/timetable",
  "Upload & Preview",
  "Tải báo cáo lỗi Excel",
  "Nhập tay & chỉnh sửa dữ liệu",
  "Khóa các lesson đã thống nhất",
  "LOCKED-ASSIGNMENTS-1.0.0",
  "Lịch sử chỉnh tay",
  "P2.3-T06",
  "Compare / clone / rollback phương án",
  "SCHEDULE-VERSION-OPS-1.0.0",
]) {
  assert.ok(bundle.includes(marker), `bundle marker missing: ${marker}`);
}

console.log(
  `Frontend smoke passed: ${javascript} + ${stylesheet}; dashboard/master-data/import/timetable markers present.`,
);
