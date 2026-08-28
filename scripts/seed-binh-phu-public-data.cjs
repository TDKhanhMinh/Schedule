const crypto = require("node:crypto");
const { Client } = require("pg");

const TENANT_ID = "34ec13a2-7f70-4325-8439-408885feca58";
const SCHOOL_ID = "00000000-0000-0000-0000-000000000001";
const PERIOD_ID = "00000000-0000-0000-0000-000000000101";
const VERSION_ID = "51a452c7-5cce-4472-87ff-f840fc4ca06c";
const SOURCE_REF = "https://thcsbinhphu.hoaloi.edu.vn/thoikhoabieu/";

function stableUuid(key) {
  const bytes = crypto.createHash("sha256").update(key).digest().subarray(0, 16);
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = bytes.toString("hex");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

const classes = [
  ["6A1", "Huỳnh Thế Bảo"],
  ["6A2", "Phạm Đình Lê Đại"],
  ["6A3", "Ngô Mỹ Hương"],
  ["6A4", "Nguyễn Kiều Oanh"],
  ["6A5", "Dương Thị Mộng"],
  ["6A6", "Trần Thị Anh Thư"],
  ["6A7", "Vũ Thị Thảo Nhi"],
  ["6A8", "Lê Thị Thủy"],
  ["6A9", "Nguyễn Thị Ngọc Bích"],
  ["6A10", "Nguyễn Ngọc Trang"],
  ["6A11", "Lê Ngọc Huyền"],
  ["6A12", "Nguyễn Mai Như"],
  ["6A13", "Võ Thị Kim Trang"],
  ["6A14", "Vũ Thị Hoa"],
  ["7A1", "Nguyễn Văn Lý"],
  ["7A2", "Nguyễn Thị Kiều Khanh"],
  ["7A3", "Đinh Thị Mỹ"],
  ["7A4", "Đặng Thị Sương"],
  ["7A5", "Hồ Xuân Hương"],
  ["7A6", "Nguyễn Thị Nhung"],
  ["7A7", "Lê Cẩm Tiên"],
  ["7A8", "Trương Tấn Tài"],
  ["7A9", "Nguyễn Thị Thanh Tuyền"],
  ["7A10", "Phạm Tiến Tư"],
  ["7A11", "Nguyễn Thị Linh Huệ"],
  ["7A12", "Nguyễn Thị Thu Hằng"],
  ["7A13", "Nguyễn Minh Thông"],
  ["7A14", "Nguyễn Thị Bích Loan"],
  ["8A1", "Nguyễn Thị Hải"],
  ["8A2", "Nguyễn Thị Nguyệt"],
  ["8A3", "Thượng Nguyệt Hằng"],
  ["8A4", "Vũ Thị Thương"],
  ["8A5", "Đỗ Thị Minh Tuyết"],
  ["8A6", "Khổng Thanh Thuỷ"],
  ["8A7", "Nguyễn Thị Kim Ngân"],
  ["8A8", "Nguyễn Thị Yến"],
  ["8A9", "Nguyễn Thị Loan"],
  ["8A10", "Bùi Quý Nhã"],
  ["8A11", "Bùi Thị Kim Ngân"],
  ["8A12", "Nguyễn Hoàng Trọng"],
  ["8A13", "Nguyễn Tiến Thành"],
  ["8A14", "Nguyễn Thụy Trúc Nhã"],
  ["8A15", "Nguyễn Thị Mỹ An"],
  ["9A1", "Đoàn Minh Đức"],
  ["9A2", "Võ Thị Nụ"],
  ["9A3", "Lê Thị Thanh Hằng"],
  ["9A4", "Nguyễn Thanh Trà"],
  ["9A5", "Nguyễn Thị Thúy Liễu"],
  ["9A6", "Võ Thị Tuyết Mai"],
  ["9A7", "Phạm Thị Minh Khang"],
  ["9A8", "Trần Đăng Duy"],
  ["9A9", "Nguyễn Thị Mỹ Dung"],
  ["9A10", "Trần Thị Kim Thanh"],
  ["9A11", "Phạm Trần Anh Tú"],
  ["9A12", "Trần Ngọc Thơ"],
];

const subjectRows = [
  ["MATH", "Toán"],
  ["LITERATURE", "Ngữ văn"],
  ["ENGLISH", "Tiếng Anh"],
  ["NATURAL_SCIENCE", "Khoa học tự nhiên"],
  ["HISTORY_GEOGRAPHY", "Lịch sử và Địa lí"],
  ["CIVICS", "Giáo dục công dân"],
  ["PHYSICAL_EDUCATION", "Giáo dục thể chất"],
  ["INFORMATICS", "Tin học"],
  ["TECHNOLOGY", "Công nghệ"],
  ["FINE_ARTS", "Mĩ thuật"],
  ["MUSIC", "Âm nhạc"],
  ["EXPERIENCE", "Hoạt động trải nghiệm"],
  ["LOCAL_EDUCATION", "Giáo dục địa phương"],
  ["LIFE_SKILLS", "Kĩ năng sống"],
  ["FLAG_CEREMONY", "Chào cờ"],
];

const rooms = [
  ["P-01", "Phòng 1", "STANDARD", 45],
  ["P-04", "Phòng 4", "STANDARD", 45],
  ["P-06", "Phòng 6", "STANDARD", 45],
  ["P-07", "Phòng 7", "STANDARD", 45],
  ["P-10", "Phòng 10", "STANDARD", 45],
  ["P-11", "Phòng 11", "STANDARD", 45],
  ["P-12", "Phòng 12", "STANDARD", 45],
  ["P-14", "Phòng 14", "STANDARD", 45],
  ["P-21", "Phòng 21", "STANDARD", 45],
  ["P-27", "Phòng 27", "MULTIPURPOSE", 60],
  ["P-28", "Phòng 28", "MULTIPURPOSE", 60],
  ["P-AV", "Phòng âm thanh - nghe nhìn", "SPECIALIZED", 60],
];

const supplementalTeachers = [
  ["BP-S-001", "H.Sâm"],
  ["BP-S-002", "B.Thái"],
  ["BP-S-003", "M.Tuyền"],
  ["BP-S-004", "H.Phát"],
  ["BP-S-005", "T.Vân"],
  ["BP-S-006", "T.Lê"],
  ["BP-S-007", "M.Duyên"],
  ["BP-S-008", "N.Quang"],
  ["BP-S-009", "Đt.Hải"],
  ["BP-S-010", "M.Thuỳ"],
  ["BP-S-011", "T.Ngữ"],
];

const rosterTeachers = classes.map(([classCode, displayName], index) => [
  `BP-GV-${String(index + 1).padStart(3, "0")}`,
  displayName,
  classCode,
]);

const teacherCodeByName = new Map(rosterTeachers.map(([code, displayName]) => [displayName, code]));
const teacherCode = {
  bao: teacherCodeByName.get("Huỳnh Thế Bảo"),
  myHuong: teacherCodeByName.get("Ngô Mỹ Hương"),
  thaoNhi: teacherCodeByName.get("Vũ Thị Thảo Nhi"),
  bich: teacherCodeByName.get("Nguyễn Thị Ngọc Bích"),
  maiNhu: teacherCodeByName.get("Nguyễn Mai Như"),
  ly: teacherCodeByName.get("Nguyễn Văn Lý"),
  my: teacherCodeByName.get("Đinh Thị Mỹ"),
  thuong: teacherCodeByName.get("Vũ Thị Thương"),
  nguyet: teacherCodeByName.get("Nguyễn Thị Nguyệt"),
  loan: teacherCodeByName.get("Nguyễn Thị Loan"),
  hai: teacherCodeByName.get("Nguyễn Thị Hải"),
  tuyet: teacherCodeByName.get("Đỗ Thị Minh Tuyết"),
  lienHuệ: teacherCodeByName.get("Nguyễn Thị Linh Huệ"),
  thanhTuyen: teacherCodeByName.get("Nguyễn Thị Thanh Tuyền"),
  thuyLiễu: teacherCodeByName.get("Nguyễn Thị Thúy Liễu"),
  duc: teacherCodeByName.get("Đoàn Minh Đức"),
  nu: teacherCodeByName.get("Võ Thị Nụ"),
  khang: teacherCodeByName.get("Phạm Thị Minh Khang"),
  duy: teacherCodeByName.get("Trần Đăng Duy"),
  myDung: teacherCodeByName.get("Nguyễn Thị Mỹ Dung"),
  hoXuanHuong: teacherCodeByName.get("Hồ Xuân Hương"),
};

const entry = (classCode, sourceDay, period, subject, teacher) => ({
  classCode,
  day: sourceDay - 1,
  period,
  subject,
  teacher,
});

// Nguồn thời khóa biểu công khai có cả buổi chiều. Schema hiện tại của dự án
// đặt unique (academic_period_id, day, period), nên seed các ô buổi sáng có
// định danh giáo viên để không tạo dữ liệu giả hoặc xung đột day/period.
const timetableEntries = [
  entry("6A1", 3, 1, "EXPERIENCE", teacherCode.bao),
  entry("6A1", 3, 2, "EXPERIENCE", teacherCode.bao),
  entry("6A1", 3, 3, "LIFE_SKILLS", teacherCode.bao),

  entry("7A1", 3, 1, "ENGLISH", "BP-S-001"),
  entry("7A1", 4, 1, "PHYSICAL_EDUCATION", "BP-S-002"),
  entry("7A1", 5, 1, "NATURAL_SCIENCE", teacherCode.thuyLiễu),
  entry("7A1", 6, 1, "NATURAL_SCIENCE", teacherCode.thuyLiễu),
  entry("7A1", 2, 2, "EXPERIENCE", teacherCode.ly),
  entry("7A1", 3, 2, "ENGLISH", "BP-S-001"),
  entry("7A1", 4, 2, "CIVICS", teacherCode.thuong),
  entry("7A1", 5, 2, "NATURAL_SCIENCE", teacherCode.thuyLiễu),
  entry("7A1", 6, 2, "INFORMATICS", "BP-S-011"),
  entry("7A1", 7, 2, "PHYSICAL_EDUCATION", "BP-S-002"),
  entry("7A1", 2, 3, "MATH", teacherCode.ly),
  entry("7A1", 3, 3, "NATURAL_SCIENCE", teacherCode.thuyLiễu),
  entry("7A1", 4, 3, "HISTORY_GEOGRAPHY", teacherCode.lienHuệ),
  entry("7A1", 5, 3, "ENGLISH", "BP-S-001"),
  entry("7A1", 6, 3, "HISTORY_GEOGRAPHY", teacherCode.lienHuệ),
  entry("7A1", 7, 3, "MATH", teacherCode.ly),
  entry("7A1", 2, 4, "MATH", teacherCode.ly),
  entry("7A1", 3, 4, "LITERATURE", teacherCode.my),
  entry("7A1", 4, 4, "HISTORY_GEOGRAPHY", teacherCode.lienHuệ),
  entry("7A1", 5, 4, "MATH", teacherCode.ly),
  entry("7A1", 6, 4, "LITERATURE", teacherCode.my),
  entry("7A1", 7, 4, "LITERATURE", teacherCode.my),
  entry("7A1", 2, 5, "TECHNOLOGY", "BP-S-003"),
  entry("7A1", 3, 5, "LITERATURE", teacherCode.my),
  entry("7A1", 4, 5, "MUSIC", teacherCode.tuyet),
  entry("7A1", 5, 5, "LOCAL_EDUCATION", teacherCode.maiNhu),
  entry("7A1", 6, 5, "LIFE_SKILLS", "BP-S-004"),

  entry("8A4", 5, 1, "EXPERIENCE", teacherCode.thuong),
  entry("8A4", 5, 2, "EXPERIENCE", teacherCode.thuong),
  entry("8A4", 5, 3, "LOCAL_EDUCATION", teacherCode.loan),
  entry("8A4", 5, 4, "LIFE_SKILLS", teacherCode.thuong),

  entry("9A1", 3, 1, "MUSIC", teacherCode.thaoNhi),
  entry("9A1", 4, 1, "LITERATURE", "BP-S-005"),
  entry("9A1", 5, 1, "FINE_ARTS", "BP-S-006"),
  entry("9A1", 6, 1, "LITERATURE", "BP-S-005"),
  entry("9A1", 7, 1, "ENGLISH", teacherCode.nu),
  entry("9A1", 2, 2, "EXPERIENCE", teacherCode.duc),
  entry("9A1", 3, 2, "PHYSICAL_EDUCATION", "BP-S-011"),
  entry("9A1", 4, 2, "CIVICS", teacherCode.khang),
  entry("9A1", 5, 2, "PHYSICAL_EDUCATION", "BP-S-011"),
  entry("9A1", 6, 2, "TECHNOLOGY", teacherCode.hoXuanHuong),
  entry("9A1", 7, 2, "ENGLISH", teacherCode.nu),
  entry("9A1", 2, 3, "NATURAL_SCIENCE", teacherCode.duc),
  entry("9A1", 3, 3, "MATH", teacherCode.thanhTuyen),
  entry("9A1", 4, 3, "LOCAL_EDUCATION", teacherCode.myDung),
  entry("9A1", 5, 3, "MATH", teacherCode.thanhTuyen),
  entry("9A1", 6, 3, "MATH", teacherCode.thanhTuyen),
  entry("9A1", 7, 3, "HISTORY_GEOGRAPHY", teacherCode.duy),
  entry("9A1", 2, 4, "LITERATURE", "BP-S-005"),
  entry("9A1", 3, 4, "NATURAL_SCIENCE", teacherCode.duc),
  entry("9A1", 4, 4, "INFORMATICS", "BP-S-009"),
  entry("9A1", 5, 4, "MATH", teacherCode.thanhTuyen),
  entry("9A1", 6, 4, "NATURAL_SCIENCE", teacherCode.duc),
  entry("9A1", 7, 4, "HISTORY_GEOGRAPHY", teacherCode.duy),
  entry("9A1", 2, 5, "LITERATURE", "BP-S-005"),
  entry("9A1", 3, 5, "HISTORY_GEOGRAPHY", teacherCode.duy),
  entry("9A1", 4, 5, "LIFE_SKILLS", teacherCode.duc),
  entry("9A1", 5, 5, "ENGLISH", teacherCode.nu),
  entry("9A1", 6, 5, "NATURAL_SCIENCE", teacherCode.duc),

  entry("9A2", 3, 1, "NATURAL_SCIENCE", teacherCode.thuyLiễu),
  entry("9A2", 4, 1, "HISTORY_GEOGRAPHY", teacherCode.duy),
  entry("9A2", 5, 1, "INFORMATICS", "BP-S-009"),
  entry("9A2", 6, 1, "MATH", teacherCode.thanhTuyen),
  entry("9A2", 7, 1, "FINE_ARTS", "BP-S-006"),
  entry("9A2", 2, 2, "EXPERIENCE", teacherCode.nu),
  entry("9A2", 3, 2, "NATURAL_SCIENCE", teacherCode.thuyLiễu),
  entry("9A2", 4, 2, "HISTORY_GEOGRAPHY", teacherCode.duy),
  entry("9A2", 5, 2, "MUSIC", teacherCode.thaoNhi),
  entry("9A2", 6, 2, "MATH", teacherCode.thanhTuyen),
  entry("9A2", 7, 2, "PHYSICAL_EDUCATION", "BP-S-011"),
  entry("9A2", 2, 3, "LITERATURE", "BP-S-010"),
  entry("9A2", 3, 3, "ENGLISH", teacherCode.nu),
  entry("9A2", 4, 3, "PHYSICAL_EDUCATION", "BP-S-011"),
  entry("9A2", 5, 3, "ENGLISH", teacherCode.nu),
  entry("9A2", 6, 3, "NATURAL_SCIENCE", teacherCode.thuyLiễu),
  entry("9A2", 7, 3, "NATURAL_SCIENCE", teacherCode.thuyLiễu),
  entry("9A2", 2, 4, "LITERATURE", "BP-S-010"),
  entry("9A2", 3, 4, "MATH", teacherCode.thanhTuyen),
  entry("9A2", 4, 4, "TECHNOLOGY", teacherCode.hoXuanHuong),
  entry("9A2", 5, 4, "ENGLISH", teacherCode.nu),
  entry("9A2", 6, 4, "CIVICS", teacherCode.khang),
  entry("9A2", 7, 4, "LITERATURE", "BP-S-010"),
  entry("9A2", 2, 5, "LIFE_SKILLS", teacherCode.nu),
  entry("9A2", 3, 5, "MATH", teacherCode.thanhTuyen),
  entry("9A2", 4, 5, "LOCAL_EDUCATION", teacherCode.myDung),
  entry("9A2", 6, 5, "LITERATURE", "BP-S-010"),
  entry("9A2", 7, 5, "HISTORY_GEOGRAPHY", teacherCode.duy),
];

function gradeOf(classCode) {
  return Number(classCode.match(/^\d+/)?.[0]);
}

function assertSeed() {
  const knownTeacherCodes = new Set([...rosterTeachers, ...supplementalTeachers].map(([code]) => code));
  for (const item of timetableEntries) {
    if (!knownTeacherCodes.has(item.teacher)) throw new Error(`Thiếu giáo viên trong seed: ${item.teacher}`);
  }
  if (
    new Set(timetableEntries.map((item) => `${item.classCode}:${item.day}:${item.period}`)).size !==
    timetableEntries.length
  ) {
    throw new Error("Seed thời khóa biểu có ô trùng ngày/tiết.");
  }
}

async function main() {
  assertSeed();
  const client = new Client({
    connectionString: process.env.SCHEDULE_DATABASE_URL ?? "postgresql://scheduler:scheduler@127.0.0.1:55432/scheduler",
  });
  await client.connect();
  try {
    await client.query("BEGIN");

    // Re-running this dedicated test seed replaces only its own school/period scope.
    await client.query(`DELETE FROM schedule_public_links WHERE schedule_version_id = $1`, [VERSION_ID]);
    await client.query(`DELETE FROM schedule_version_transitions WHERE schedule_version_id = $1`, [VERSION_ID]);
    await client.query(`DELETE FROM schedule_versions WHERE id = $1`, [VERSION_ID]);
    await client.query(
      `DELETE FROM teacher_subject_grade_assignments
        WHERE school_id = $1 AND academic_period_id = $2`,
      [SCHOOL_ID, PERIOD_ID],
    );
    await client.query(
      `DELETE FROM class_homeroom_assignments
        WHERE school_id = $1 AND academic_period_id = $2`,
      [SCHOOL_ID, PERIOD_ID],
    );
    await client.query(
      `DELETE FROM lesson_requirements
        WHERE school_id = $1 AND academic_period_id = $2`,
      [SCHOOL_ID, PERIOD_ID],
    );

    await client.query(
      `INSERT INTO tenants (id, slug, name, status)
       VALUES ($1, $2, $3, 'ACTIVE')
       ON CONFLICT (id) DO UPDATE SET slug = EXCLUDED.slug, name = EXCLUDED.name, status = 'ACTIVE', updated_at = now()`,
      [TENANT_ID, "binh-phu-public-test", "Dữ liệu kiểm thử công khai - THCS Bình Phú"],
    );
    await client.query(
      `INSERT INTO schools (id, tenant_id, code, name, timezone, status, education_level)
       VALUES ($1, $2, 'THCS-BINH-PHU', 'Trường THCS Bình Phú', 'Asia/Ho_Chi_Minh', 'ACTIVE', 'LOWER_SECONDARY')
       ON CONFLICT (id) DO UPDATE SET tenant_id = EXCLUDED.tenant_id, code = EXCLUDED.code,
         name = EXCLUDED.name, timezone = EXCLUDED.timezone, status = EXCLUDED.status,
         education_level = EXCLUDED.education_level, updated_at = now()`,
      [SCHOOL_ID, TENANT_ID],
    );
    await client.query(
      `INSERT INTO academic_periods
         (id, tenant_id, school_id, academic_year, term_code, name, starts_on, ends_on, status)
       VALUES ($1, $2, $3, '2025-2026', 'TERM_2', 'Năm học 2025-2026 · Học kỳ II', '2026-02-02', '2026-05-31', 'ACTIVE')
       ON CONFLICT (id) DO UPDATE SET tenant_id = EXCLUDED.tenant_id, school_id = EXCLUDED.school_id,
         academic_year = EXCLUDED.academic_year, term_code = EXCLUDED.term_code, name = EXCLUDED.name,
         starts_on = EXCLUDED.starts_on, ends_on = EXCLUDED.ends_on, status = EXCLUDED.status, updated_at = now()`,
      [PERIOD_ID, TENANT_ID, SCHOOL_ID],
    );

    for (const [classCode] of classes) {
      const id = stableUuid(`class:${classCode}`);
      await client.query(
        `INSERT INTO classes (id, tenant_id, school_id, code, name, grade, status)
         VALUES ($1, $2, $3, $4, $4, $5, 'ACTIVE')
         ON CONFLICT (school_id, code) DO UPDATE SET tenant_id = EXCLUDED.tenant_id,
           name = EXCLUDED.name, grade = EXCLUDED.grade, status = EXCLUDED.status, updated_at = now()`,
        [id, TENANT_ID, SCHOOL_ID, classCode, gradeOf(classCode)],
      );
    }

    const teachers = [...rosterTeachers.map(([code, name]) => [code, name]), ...supplementalTeachers];
    for (const [code, displayName] of teachers) {
      const id = stableUuid(`teacher:${code}`);
      await client.query(
        `INSERT INTO teachers (id, tenant_id, school_id, code, display_name, status)
         VALUES ($1, $2, $3, $4, $5, 'ACTIVE')
         ON CONFLICT (school_id, code) DO UPDATE SET tenant_id = EXCLUDED.tenant_id,
           display_name = EXCLUDED.display_name, status = EXCLUDED.status, updated_at = now()`,
        [id, TENANT_ID, SCHOOL_ID, code, displayName],
      );
    }

    for (const [code, name] of subjectRows) {
      const id = stableUuid(`subject:${code}`);
      await client.query(
        `INSERT INTO subjects (id, tenant_id, school_id, code, name, status)
         VALUES ($1, $2, $3, $4, $5, 'ACTIVE')
         ON CONFLICT (school_id, code) DO UPDATE SET tenant_id = EXCLUDED.tenant_id,
           name = EXCLUDED.name, status = EXCLUDED.status, updated_at = now()`,
        [id, TENANT_ID, SCHOOL_ID, code, name],
      );
    }

    for (const [code, name, roomType, capacity] of rooms) {
      const id = stableUuid(`room:${code}`);
      await client.query(
        `INSERT INTO rooms (id, tenant_id, school_id, code, name, room_type, capacity, status)
         VALUES ($1, $2, $3, $4, $5, $6, $7, 'ACTIVE')
         ON CONFLICT (school_id, code) DO UPDATE SET tenant_id = EXCLUDED.tenant_id,
           name = EXCLUDED.name, room_type = EXCLUDED.room_type, capacity = EXCLUDED.capacity,
           status = EXCLUDED.status, updated_at = now()`,
        [id, TENANT_ID, SCHOOL_ID, code, name, roomType, capacity],
      );
    }

    const slotTimes = [
      ["07:00", "07:45"],
      ["07:50", "08:35"],
      ["08:40", "09:25"],
      ["09:30", "10:15"],
      ["10:20", "11:05"],
    ];
    for (let day = 1; day <= 6; day += 1) {
      for (let period = 1; period <= 5; period += 1) {
        const id = stableUuid(`slot:${day}:${period}`);
        const [startsAt, endsAt] = slotTimes[period - 1];
        await client.query(
          `INSERT INTO time_slots
             (id, tenant_id, school_id, academic_period_id, day, period, shift_code, starts_at, ends_at)
           VALUES ($1, $2, $3, $4, $5, $6, 'MORNING', $7, $8)
           ON CONFLICT (academic_period_id, day, period) DO UPDATE SET tenant_id = EXCLUDED.tenant_id,
             school_id = EXCLUDED.school_id, shift_code = EXCLUDED.shift_code,
             starts_at = EXCLUDED.starts_at, ends_at = EXCLUDED.ends_at, updated_at = now()`,
          [id, TENANT_ID, SCHOOL_ID, PERIOD_ID, day, period, startsAt, endsAt],
        );
      }
    }

    const classId = (code) => stableUuid(`class:${code}`);
    const teacherId = (code) => stableUuid(`teacher:${code}`);
    const subjectId = (code) => stableUuid(`subject:${code}`);
    const lessonGroups = new Map();
    for (const item of timetableEntries) {
      const key = `${item.classCode}|${item.subject}|${item.teacher}`;
      const group = lessonGroups.get(key) ?? { ...item, count: 0 };
      group.count += 1;
      lessonGroups.set(key, group);
    }

    for (const item of timetableEntries) {
      const key = `${item.teacher}|${item.subject}|${gradeOf(item.classCode)}`;
      await client.query(
        `INSERT INTO teacher_subject_grade_assignments
           (id, tenant_id, school_id, academic_period_id, teacher_id, subject_id, grade, status, source_ref)
         VALUES ($1, $2, $3, $4, $5, $6, $7, 'ACTIVE', $8)
         ON CONFLICT (tenant_id, school_id, academic_period_id, teacher_id, subject_id, grade)
         DO UPDATE SET status = 'ACTIVE', source_ref = EXCLUDED.source_ref, updated_at = now()`,
        [
          stableUuid(`eligibility:${key}`),
          TENANT_ID,
          SCHOOL_ID,
          PERIOD_ID,
          teacherId(item.teacher),
          subjectId(item.subject),
          gradeOf(item.classCode),
          SOURCE_REF,
        ],
      );
    }

    for (const [key, item] of lessonGroups) {
      const id = stableUuid(`lesson:${key}`);
      await client.query(
        `INSERT INTO lesson_requirements
           (id, tenant_id, school_id, academic_period_id, class_id, subject_id, teacher_id, required_sessions, status)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'ACTIVE')
         ON CONFLICT (id) DO UPDATE SET tenant_id = EXCLUDED.tenant_id, school_id = EXCLUDED.school_id,
           academic_period_id = EXCLUDED.academic_period_id, class_id = EXCLUDED.class_id,
           subject_id = EXCLUDED.subject_id, teacher_id = EXCLUDED.teacher_id,
           required_sessions = EXCLUDED.required_sessions, status = EXCLUDED.status, updated_at = now()`,
        [
          id,
          TENANT_ID,
          SCHOOL_ID,
          PERIOD_ID,
          classId(item.classCode),
          subjectId(item.subject),
          teacherId(item.teacher),
          item.count,
        ],
      );
    }

    for (const [index, [classCode, homeroomName]] of classes.entries()) {
      const homeroomTeacherCode = `BP-GV-${String(index + 1).padStart(3, "0")}`;
      await client.query(
        `INSERT INTO class_homeroom_assignments
           (id, tenant_id, school_id, academic_period_id, class_id, teacher_id, weekly_reduction_periods, rule_code)
         VALUES ($1, $2, $3, $4, $5, $6, 4, 'TT_05_2025_D9_1')
         ON CONFLICT (tenant_id, school_id, academic_period_id, class_id)
         DO UPDATE SET teacher_id = EXCLUDED.teacher_id, weekly_reduction_periods = 4,
           rule_code = EXCLUDED.rule_code, updated_at = now()`,
        [
          stableUuid(`homeroom:${classCode}`),
          TENANT_ID,
          SCHOOL_ID,
          PERIOD_ID,
          classId(classCode),
          teacherId(homeroomTeacherCode),
        ],
      );
      if (!homeroomName) throw new Error(`Thiếu GVCN cho lớp ${classCode}`);
    }

    await client.query(
      `INSERT INTO schedule_versions
         (id, tenant_id, school_id, academic_period_id, version_number, status, created_by, revision,
          status_changed_by, status_changed_at, status_reason)
       VALUES ($1, $2, $3, $4, 1, 'DRAFT', 'seed-binh-phu-public-data', 1,
          'seed-binh-phu-public-data', now(), 'Dữ liệu công khai dùng cho kiểm thử local')
       ON CONFLICT (id) DO UPDATE SET tenant_id = EXCLUDED.tenant_id, school_id = EXCLUDED.school_id,
         academic_period_id = EXCLUDED.academic_period_id, status = 'DRAFT', revision = 1,
         status_changed_by = EXCLUDED.status_changed_by, status_changed_at = now(),
         status_reason = EXCLUDED.status_reason, updated_at = now()`,
      [VERSION_ID, TENANT_ID, SCHOOL_ID, PERIOD_ID],
    );

    const sessionIndexes = new Map();
    for (const item of timetableEntries) {
      const lessonKey = `${item.classCode}|${item.subject}|${item.teacher}`;
      const sessionIndex = sessionIndexes.get(lessonKey) ?? 0;
      sessionIndexes.set(lessonKey, sessionIndex + 1);
      await client.query(
        `INSERT INTO schedule_assignments
           (id, tenant_id, schedule_version_id, lesson_id, session_index, time_slot_id, room_id)
         VALUES ($1, $2, $3, $4, $5, $6, NULL)
         ON CONFLICT (id) DO UPDATE SET tenant_id = EXCLUDED.tenant_id,
           schedule_version_id = EXCLUDED.schedule_version_id, lesson_id = EXCLUDED.lesson_id,
           session_index = EXCLUDED.session_index, time_slot_id = EXCLUDED.time_slot_id, room_id = NULL`,
        [
          stableUuid(`assignment:${VERSION_ID}:${item.classCode}:${item.day}:${item.period}`),
          TENANT_ID,
          VERSION_ID,
          stableUuid(`lesson:${lessonKey}`),
          sessionIndex,
          stableUuid(`slot:${item.day}:${item.period}`),
        ],
      );
    }

    await client.query("COMMIT");
    console.log(
      JSON.stringify(
        {
          source: SOURCE_REF,
          school: "Trường THCS Bình Phú",
          academicPeriod: "2025-2026 · Học kỳ II",
          classes: classes.length,
          homeroomAssignments: classes.length,
          teachers: teachers.length,
          subjects: subjectRows.length,
          rooms: rooms.length,
          timetableEntries: timetableEntries.length,
          lessonRequirements: lessonGroups.size,
          teacherSubjectGradeAssignments: new Set(
            timetableEntries.map((item) => `${item.teacher}|${item.subject}|${gradeOf(item.classCode)}`),
          ).size,
          scheduleVersionId: VERSION_ID,
        },
        null,
        2,
      ),
    );
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    await client.end();
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
