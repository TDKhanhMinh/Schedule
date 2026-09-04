import assert from "node:assert/strict";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";

const dist = resolve(import.meta.dirname, "..", "dist");
assert.ok(existsSync(join(dist, "index.html")), "dist/index.html is missing; run the frontend build first");

const html = readFileSync(join(dist, "index.html"), "utf8");
assert.match(html, /<div id="root"><\/div>/, "the Vite root mount is missing");

const assets = readdirSync(join(dist, "assets"));
const javascriptAssets = assets.filter((asset) => asset.endsWith(".js"));
const stylesheet = assets.find((asset) => asset.endsWith(".css"));
assert.ok(javascriptAssets.length > 0, "the production JavaScript asset is missing");
assert.ok(stylesheet, "the production CSS asset is missing");

const bundle = javascriptAssets.map((asset) => readFileSync(join(dist, "assets", asset), "utf8")).join("\n");
for (const marker of [
  "Thời khóa biểu trường học",
  "/master-data",
  "/data-quality",
  "/timetable",
  "Quét dữ liệu trước khi xếp TKB",
  "Lỗi chặn",
  "Chọn trường",
  "Chưa có phân công để hiển thị",
  "Theo dõi và điều khiển tác vụ",
  "Tổng hợp tải dạy giáo viên",
  "Tự động phân công giáo viên vào lớp",
  "Xác nhận phân công",
  "Xuất Excel",
  "CHỈ ĐỌC CÔNG KHAI",
]) {
  assert.ok(bundle.includes(marker), `bundle marker missing: ${marker}`);
}
for (const removedMarker of ["Tải lên và xem trước", "Xác nhận nhập dữ liệu", "Tải báo cáo lỗi Excel"]) {
  assert.ok(!bundle.includes(removedMarker), `legacy import marker still present: ${removedMarker}`);
}

console.log(
  `Frontend smoke passed: ${javascriptAssets.join(", ")} + ${stylesheet}; dashboard/master-data/data-quality/timetable markers present.`,
);
