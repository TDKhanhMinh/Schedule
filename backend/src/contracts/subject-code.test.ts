import { deriveSubjectCode } from "./subject-code";

describe("deriveSubjectCode", () => {
  it.each([
    ["Vật lí", "VL"],
    ["Khoa học tự nhiên", "KHTN"],
    ["Giáo dục thể chất", "GDTC"],
    ["Hoạt động trải nghiệm", "HDTN"],
  ])("derives %s as %s", (name, code) => {
    expect(deriveSubjectCode(name)).toBe(code);
  });
});
