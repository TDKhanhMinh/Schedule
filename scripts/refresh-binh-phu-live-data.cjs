const crypto = require("node:crypto");
const { Client } = require("pg");

const BASE_URL = "https://thcsbinhphu.hoaloi.edu.vn";
const SOURCE_REF = `${BASE_URL}/thoikhoabieu/`;
const TENANT_ID = "34ec13a2-7f70-4325-8439-408885feca58";
const SCHOOL_ID = "00000000-0000-0000-0000-000000000001";
const PERIOD_ID = "00000000-0000-0000-0000-000000000101";
const VERSION_ID = "51a452c7-5cce-4472-87ff-f840fc4ca06c";

const subjects = [
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

const subjectCodeBySourceName = new Map([
  ["Toán", "MATH"],
  ["Toán TS", "MATH"],
  ["Văn", "LITERATURE"],
  ["Văn TS", "LITERATURE"],
  ["T.Anh", "ENGLISH"],
  ["T.Anh TS", "ENGLISH"],
  ["KHTN", "NATURAL_SCIENCE"],
  ["LSĐL", "HISTORY_GEOGRAPHY"],
  ["GDCD", "CIVICS"],
  ["GDTC", "PHYSICAL_EDUCATION"],
  ["Tin", "INFORMATICS"],
  ["CNghệ", "TECHNOLOGY"],
  ["MT", "FINE_ARTS"],
  ["Nhạc", "MUSIC"],
  ["HĐTN", "EXPERIENCE"],
  ["HĐTN_1", "EXPERIENCE"],
  ["GDĐP", "LOCAL_EDUCATION"],
  ["KNS", "LIFE_SKILLS"],
]);

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

function stableUuid(key) {
  const bytes = crypto.createHash("sha256").update(key).digest().subarray(0, 16);
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = bytes.toString("hex");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

function cleanText(value) {
  return value
    .replace(/<br\s*\/?\s*>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&#39;/gi, "'")
    .replace(/&quot;/gi, '"')
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeName(value) {
  return value.normalize("NFC").replace(/\s+/g, " ").trim().toLowerCase();
}

// The public timetable uses abbreviated teacher labels in lesson cells while
// the class index stores homeroom teachers with their full names. Keep the
// source labels, but resolve aliases to the canonical teacher roster before
// writing professional assignments and lesson requirements.
const teacherAliasToRosterName = new Map([
  ["a.thư", "Trần Thị Anh Thư"],
  ["a.tú", "Phạm Trần Anh Tú"],
  ["b.ngân", "Bùi Thị Kim Ngân"],
  ["c.tiên", "Lê Cẩm Tiên"],
  ["đ.duy", "Trần Đăng Duy"],
  ["đ.mỹ", "Đinh Thị Mỹ"],
  ["đ.sương", "Đặng Thị Sương"],
  ["h.trọng", "Nguyễn Hoàng Trọng"],
  ["ht.bảo", "Huỳnh Thế Bảo"],
  ["hx.hương", "Hồ Xuân Hương"],
  ["k.ngân", "Nguyễn Thị Kim Ngân"],
  ["k.oanh", "Nguyễn Kiều Oanh"],
  ["kt.thuỷ", "Khổng Thanh Thuỷ"],
  ["l.hằng", "Lê Thị Thanh Hằng"],
  ["l.huệ", "Nguyễn Thị Linh Huệ"],
  ["lt.thủy", "Lê Thị Thủy"],
  ["m.an", "Nguyễn Thị Mỹ An"],
  ["m.dung", "Nguyễn Thị Mỹ Dung"],
  ["m.đức", "Đoàn Minh Đức"],
  ["m.hương", "Ngô Mỹ Hương"],
  ["m.khang", "Phạm Thị Minh Khang"],
  ["m.thông", "Nguyễn Minh Thông"],
  ["m.tuyết", "Đỗ Thị Minh Tuyết"],
  ["n.bích", "Nguyễn Thị Ngọc Bích"],
  ["n.huyền", "Lê Ngọc Huyền"],
  ["n.lý", "Nguyễn Văn Lý"],
  ["n.thơ", "Trần Ngọc Thơ"],
  ["n.trang", "Nguyễn Ngọc Trang"],
  ["nb.loan", "Nguyễn Thị Bích Loan"],
  ["nk.khanh", "Nguyễn Thị Kiều Khanh"],
  ["nm.như", "Nguyễn Mai Như"],
  ["nt.hải", "Nguyễn Thị Hải"],
  ["nt.loan", "Nguyễn Thị Loan"],
  ["nt.tuyền", "Nguyễn Thị Thanh Tuyền"],
  ["p.đại", "Phạm Đình Lê Đại"],
  ["pt.tư", "Phạm Tiến Tư"],
  ["q.nhã", "Bùi Quý Nhã"],
  ["t.liễu", "Nguyễn Thị Thúy Liễu"],
  ["t.mộng", "Dương Thị Mộng"],
  ["t.nguyệt", "Nguyễn Thị Nguyệt"],
  ["t.nhi", "Vũ Thị Thảo Nhi"],
  ["t.nhung", "Nguyễn Thị Nhung"],
  ["t.thành", "Nguyễn Tiến Thành"],
  ["t.trà", "Nguyễn Thanh Trà"],
  ["t.yến", "Nguyễn Thị Yến"],
  ["tk.thanh", "Trần Thị Kim Thanh"],
  ["tn.hằng", "Thượng Nguyệt Hằng"],
  ["tr.nhã", "Nguyễn Thụy Trúc Nhã"],
  ["tr.tài", "Trương Tấn Tài"],
  ["thu.hằng", "Nguyễn Thị Thu Hằng"],
  ["v.hoa", "Vũ Thị Hoa"],
  ["v.nụ", "Võ Thị Nụ"],
  ["v.thương", "Vũ Thị Thương"],
  ["vk.trang", "Võ Thị Kim Trang"],
  ["vt.mai", "Võ Thị Tuyết Mai"],
]);

function gradeOf(classCode) {
  return Number(classCode.match(/^\d+/)?.[0]);
}

function parseClasses(html) {
  const classPattern =
    /<td class="text-center"><a href="\/thoikhoabieu\/(?!gv-)([^\"]+)\/">([^<]+)<\/a><\/td>\s*<td><a href="\/thoikhoabieu\/[^\"]+\/">([^<]+)<\/a><\/td>/gi;
  return [...html.matchAll(classPattern)].map((match) => ({
    slug: match[1],
    code: match[2].trim().toUpperCase(),
    grade: gradeOf(match[2].trim().toUpperCase()),
    homeroom: cleanText(match[3]),
  }));
}

function parseTeacherOptions(html) {
  const options = new Map();
  const optionPattern = /<option value="\/thoikhoabieu\/(gv-[^\"]+)\/">([^<]*)<\/option>/gi;
  for (const match of html.matchAll(optionPattern)) {
    if (!match[1].includes("-P-")) options.set(match[1], cleanText(match[2]));
  }
  return options;
}

function parseClassTimetable(html, classInfo, teacherOptions) {
  const entries = [];
  const tablePattern =
    /<table[\s\S]*?<caption>\s*(Buổi sáng|Buổi chiều)\s*<\/caption>[\s\S]*?<tbody>([\s\S]*?)<\/tbody>[\s\S]*?<\/table>/gi;
  for (const table of html.matchAll(tablePattern)) {
    const shift = table[1].includes("sáng") ? "MORNING" : "AFTERNOON";
    for (const row of table[2].matchAll(/<tr>([\s\S]*?)<\/tr>/gi)) {
      const cells = [...row[1].matchAll(/<td[^>]*>([\s\S]*?)<\/td>/gi)].map((cell) => cell[1]);
      if (cells.length < 7) continue;
      const period = Number(cleanText(cells[0]));
      if (!period || period > 5) continue;
      for (let day = 0; day < 6; day += 1) {
        const subjectName = cleanText(cells[day + 1].match(/<strong[^>]*>([\s\S]*?)<\/strong>/i)?.[1] ?? "");
        const teacherMatch = cells[day + 1].match(/<a[^>]+href="\/thoikhoabieu\/(gv-[^"]+)\/"[^>]*>([\s\S]*?)<\/a>/i);
        if (!subjectName || !teacherMatch) continue;
        const baseSlug = teacherMatch[1].replace(/-P-.+$/, "");
        entries.push({
          classCode: classInfo.code,
          grade: classInfo.grade,
          day: day + 1,
          period,
          shift,
          subjectName,
          subjectCode: subjectCodeBySourceName.get(subjectName),
          teacherSlug: baseSlug,
          teacherName: teacherOptions.get(baseSlug) ?? cleanText(teacherMatch[2]).replace(/\s+P\..*$/, ""),
        });
      }
    }
  }
  return entries;
}

async function fetchClassTimetable(classInfo, teacherOptions) {
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    try {
      const response = await fetch(`${BASE_URL}/thoikhoabieu/${classInfo.slug}/`);
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      return parseClassTimetable(await response.text(), classInfo, teacherOptions);
    } catch (error) {
      if (attempt === 3) throw new Error(`Không đọc được ${classInfo.code}: ${error.message}`);
      await new Promise((resolve) => setTimeout(resolve, 250 * attempt));
    }
  }
  return [];
}

async function collectSourceData() {
  const indexHtml = await (await fetch(SOURCE_REF)).text();
  const classes = parseClasses(indexHtml);
  const teacherOptions = parseTeacherOptions(indexHtml);
  if (classes.length !== 55) throw new Error(`Nguồn trả về ${classes.length} lớp, cần kiểm tra trước khi nạp.`);

  const entries = [];
  for (let index = 0; index < classes.length; index += 8) {
    const batch = await Promise.all(
      classes.slice(index, index + 8).map((item) => fetchClassTimetable(item, teacherOptions)),
    );
    entries.push(...batch.flat());
    console.log(`Đã đọc ${Math.min(index + 8, classes.length)}/${classes.length} trang lớp.`);
  }
  for (const item of entries) {
    if (!item.subjectCode) throw new Error(`Môn chưa được chuẩn hóa: ${item.subjectName}`);
  }
  return { classes, teacherOptions, entries };
}

async function main() {
  const source = await collectSourceData();
  const rosterTeachers = source.classes.map((item, index) => [
    `BP-GV-${String(index + 1).padStart(3, "0")}`,
    item.homeroom,
  ]);
  const rosterByName = new Map(rosterTeachers.map(([code, name]) => [normalizeName(name), code]));
  const usedTeacherSlugs = new Set(source.entries.map((item) => item.teacherSlug));
  const sourceTeachers = new Map([...source.teacherOptions].filter(([slug]) => usedTeacherSlugs.has(slug)));
  for (const item of source.entries)
    if (!sourceTeachers.has(item.teacherSlug)) sourceTeachers.set(item.teacherSlug, item.teacherName);

  const teacherCodeBySlug = new Map();
  const teacherRows = new Map(rosterTeachers);
  let supplementalIndex = 1;
  for (const [slug, name] of sourceTeachers) {
    const canonicalName = teacherAliasToRosterName.get(normalizeName(name)) ?? name;
    const rosterCode = rosterByName.get(normalizeName(canonicalName));
    const code = rosterCode ?? `BP-SRC-${String(supplementalIndex++).padStart(3, "0")}`;
    teacherCodeBySlug.set(slug, code);
    if (!teacherRows.has(code)) teacherRows.set(code, canonicalName);
  }

  const lessonGroups = new Map();
  for (const item of source.entries.filter((entry) => entry.shift === "MORNING")) {
    const teacher = teacherCodeBySlug.get(item.teacherSlug);
    const key = `${item.classCode}|${item.subjectCode}|${teacher}`;
    const group = lessonGroups.get(key) ?? { ...item, teacher, count: 0 };
    group.count += 1;
    lessonGroups.set(key, group);
  }
  const eligibilityKeys = new Set(
    source.entries.map((item) => `${teacherCodeBySlug.get(item.teacherSlug)}|${item.subjectCode}|${item.grade}`),
  );

  const client = new Client({
    connectionString: process.env.SCHEDULE_DATABASE_URL ?? "postgresql://scheduler:scheduler@127.0.0.1:55432/scheduler",
  });
  await client.connect();
  try {
    await client.query("BEGIN");
    const version = await client.query(`SELECT status FROM schedule_versions WHERE id = $1`, [VERSION_ID]);
    if (version.rows[0]?.status !== "DRAFT") throw new Error("Phiên bản mặc định không còn ở trạng thái DRAFT.");
    await client.query(`DELETE FROM schedule_assignments WHERE schedule_version_id = $1`, [VERSION_ID]);
    await client.query(`UPDATE schedule_versions SET revision = revision + 1, updated_at = now() WHERE id = $1`, [
      VERSION_ID,
    ]);
    await client.query(
      `DELETE FROM teacher_subject_grade_assignments WHERE school_id = $1 AND academic_period_id = $2`,
      [SCHOOL_ID, PERIOD_ID],
    );
    await client.query(
      `UPDATE lesson_requirements SET status = 'ARCHIVED', updated_at = now() WHERE school_id = $1 AND academic_period_id = $2`,
      [SCHOOL_ID, PERIOD_ID],
    );
    await client.query(
      `UPDATE teachers SET status = 'ARCHIVED', updated_at = now()
        WHERE school_id = $1 AND code ~ '^BP-S(RC)?-[0-9]+$'`,
      [SCHOOL_ID],
    );

    await client.query(
      `INSERT INTO tenants (id, slug, name, status) VALUES ($1, 'binh-phu-public-test', $2, 'ACTIVE')
       ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name, status = 'ACTIVE', updated_at = now()`,
      [TENANT_ID, "Dữ liệu kiểm thử công khai - THCS Bình Phú"],
    );
    await client.query(
      `INSERT INTO schools (id, tenant_id, code, name, timezone, status, education_level)
       VALUES ($1, $2, 'THCS-BINH-PHU', 'Trường THCS Bình Phú', 'Asia/Ho_Chi_Minh', 'ACTIVE', 'LOWER_SECONDARY')
       ON CONFLICT (id) DO UPDATE SET tenant_id = EXCLUDED.tenant_id, code = EXCLUDED.code, name = EXCLUDED.name,
         timezone = EXCLUDED.timezone, status = EXCLUDED.status, education_level = EXCLUDED.education_level, updated_at = now()`,
      [SCHOOL_ID, TENANT_ID],
    );
    await client.query(
      `INSERT INTO academic_periods (id, tenant_id, school_id, academic_year, term_code, name, starts_on, ends_on, status)
       VALUES ($1, $2, $3, '2025-2026', 'TERM_2', 'Năm học 2025-2026 · Học kỳ II', '2026-02-02', '2026-05-31', 'ACTIVE')
       ON CONFLICT (id) DO UPDATE SET tenant_id = EXCLUDED.tenant_id, school_id = EXCLUDED.school_id,
         academic_year = EXCLUDED.academic_year, term_code = EXCLUDED.term_code, name = EXCLUDED.name,
         starts_on = EXCLUDED.starts_on, ends_on = EXCLUDED.ends_on, status = EXCLUDED.status, updated_at = now()`,
      [PERIOD_ID, TENANT_ID, SCHOOL_ID],
    );

    for (const [classCode, homeroomName] of source.classes.map((item) => [item.code, item.homeroom])) {
      const classId = stableUuid(`class:${classCode}`);
      const rosterCode = source.classes.findIndex((item) => item.code === classCode) + 1;
      const teacherCode = `BP-GV-${String(rosterCode).padStart(3, "0")}`;
      await client.query(
        `INSERT INTO classes (id, tenant_id, school_id, code, name, grade, status) VALUES ($1, $2, $3, $4, $4, $5, 'ACTIVE')
         ON CONFLICT (school_id, code) DO UPDATE SET tenant_id = EXCLUDED.tenant_id, name = EXCLUDED.name,
           grade = EXCLUDED.grade, status = EXCLUDED.status, updated_at = now()`,
        [classId, TENANT_ID, SCHOOL_ID, classCode, gradeOf(classCode)],
      );
      await client.query(
        `INSERT INTO class_homeroom_assignments
           (id, tenant_id, school_id, academic_period_id, class_id, teacher_id, weekly_reduction_periods, rule_code)
         VALUES ($1, $2, $3, $4, $5, $6, 4, 'TT_05_2025_D9_1')
         ON CONFLICT (tenant_id, school_id, academic_period_id, class_id) DO UPDATE SET teacher_id = EXCLUDED.teacher_id,
           weekly_reduction_periods = 4, rule_code = EXCLUDED.rule_code, updated_at = now()`,
        [
          stableUuid(`homeroom:${classCode}`),
          TENANT_ID,
          SCHOOL_ID,
          PERIOD_ID,
          classId,
          stableUuid(`teacher:${teacherCode}`),
        ],
      );
      if (!homeroomName) throw new Error(`Thiếu GVCN cho ${classCode}`);
    }

    for (const [code, displayName] of teacherRows) {
      await client.query(
        `INSERT INTO teachers (id, tenant_id, school_id, code, display_name, status) VALUES ($1, $2, $3, $4, $5, 'ACTIVE')
         ON CONFLICT (school_id, code) DO UPDATE SET tenant_id = EXCLUDED.tenant_id, display_name = EXCLUDED.display_name,
           status = EXCLUDED.status, updated_at = now()`,
        [stableUuid(`teacher:${code}`), TENANT_ID, SCHOOL_ID, code, displayName],
      );
    }
    for (const [code, name] of subjects) {
      await client.query(
        `INSERT INTO subjects (id, tenant_id, school_id, code, name, status) VALUES ($1, $2, $3, $4, $5, 'ACTIVE')
         ON CONFLICT (school_id, code) DO UPDATE SET tenant_id = EXCLUDED.tenant_id, name = EXCLUDED.name,
           status = EXCLUDED.status, updated_at = now()`,
        [stableUuid(`subject:${code}`), TENANT_ID, SCHOOL_ID, code, name],
      );
    }
    for (const [code, name, roomType, capacity] of rooms) {
      await client.query(
        `INSERT INTO rooms (id, tenant_id, school_id, code, name, room_type, capacity, status)
         VALUES ($1, $2, $3, $4, $5, $6, $7, 'ACTIVE')
         ON CONFLICT (school_id, code) DO UPDATE SET tenant_id = EXCLUDED.tenant_id, name = EXCLUDED.name,
           room_type = EXCLUDED.room_type, capacity = EXCLUDED.capacity, status = EXCLUDED.status, updated_at = now()`,
        [stableUuid(`room:${code}`), TENANT_ID, SCHOOL_ID, code, name, roomType, capacity],
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
        const [startsAt, endsAt] = slotTimes[period - 1];
        await client.query(
          `INSERT INTO time_slots (id, tenant_id, school_id, academic_period_id, day, period, shift_code, starts_at, ends_at)
           VALUES ($1, $2, $3, $4, $5, $6, 'MORNING', $7, $8)
           ON CONFLICT (academic_period_id, day, period) DO UPDATE SET tenant_id = EXCLUDED.tenant_id,
             school_id = EXCLUDED.school_id, shift_code = EXCLUDED.shift_code, starts_at = EXCLUDED.starts_at,
             ends_at = EXCLUDED.ends_at, updated_at = now()`,
          [stableUuid(`slot:${day}:${period}`), TENANT_ID, SCHOOL_ID, PERIOD_ID, day, period, startsAt, endsAt],
        );
      }
    }

    for (const item of source.entries) {
      await client.query(
        `INSERT INTO teacher_subject_grade_assignments
           (id, tenant_id, school_id, academic_period_id, teacher_id, subject_id, grade, status, source_ref)
         VALUES ($1, $2, $3, $4, $5, $6, $7, 'ACTIVE', $8)
         ON CONFLICT (tenant_id, school_id, academic_period_id, teacher_id, subject_id, grade)
         DO UPDATE SET status = 'ACTIVE', source_ref = EXCLUDED.source_ref, updated_at = now()`,
        [
          stableUuid(`eligibility:${teacherCodeBySlug.get(item.teacherSlug)}|${item.subjectCode}|${item.grade}`),
          TENANT_ID,
          SCHOOL_ID,
          PERIOD_ID,
          stableUuid(`teacher:${teacherCodeBySlug.get(item.teacherSlug)}`),
          stableUuid(`subject:${item.subjectCode}`),
          item.grade,
          SOURCE_REF,
        ],
      );
    }

    for (const [key, item] of lessonGroups) {
      await client.query(
        `INSERT INTO lesson_requirements
           (id, tenant_id, school_id, academic_period_id, class_id, subject_id, teacher_id, required_sessions, status)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'ACTIVE')
         ON CONFLICT (id) DO UPDATE SET tenant_id = EXCLUDED.tenant_id, school_id = EXCLUDED.school_id,
           academic_period_id = EXCLUDED.academic_period_id, class_id = EXCLUDED.class_id,
           subject_id = EXCLUDED.subject_id, teacher_id = EXCLUDED.teacher_id,
           required_sessions = EXCLUDED.required_sessions, status = 'ACTIVE', updated_at = now()`,
        [
          stableUuid(`lesson:${key}`),
          TENANT_ID,
          SCHOOL_ID,
          PERIOD_ID,
          stableUuid(`class:${item.classCode}`),
          stableUuid(`subject:${item.subjectCode}`),
          stableUuid(`teacher:${item.teacher}`),
          item.count,
        ],
      );
    }

    await client.query("COMMIT");
    console.log(
      JSON.stringify(
        {
          source: SOURCE_REF,
          school: "Trường THCS Bình Phú",
          classes: source.classes.length,
          classesByGrade: source.classes.reduce(
            (result, item) => ({ ...result, [item.grade]: (result[item.grade] ?? 0) + 1 }),
            {},
          ),
          teachers: teacherRows.size,
          subjects: subjects.length,
          subjectsByGrade: Object.fromEntries(
            [6, 7, 8, 9].map((grade) => [
              grade,
              [
                ...new Set(source.entries.filter((item) => item.grade === grade).map((item) => item.subjectCode)),
              ].sort(),
            ]),
          ),
          homeroomAssignments: source.classes.length,
          teacherSubjectGradeAssignments: eligibilityKeys.size,
          activeLessonRequirements: lessonGroups.size,
          morningSourceEntries: source.entries.filter((item) => item.shift === "MORNING").length,
          allSourceEntries: source.entries.length,
          scheduleAssignments: 0,
          note: "Nhu cầu tiết đã nạp để solver xếp lại; phiên bản lịch không giữ lại các ô nguồn có thể xung đột.",
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
