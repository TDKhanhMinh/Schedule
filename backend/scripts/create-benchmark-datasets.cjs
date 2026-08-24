const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");

const outputDir = path.resolve(__dirname, "../solver/examples/benchmarks");
const version = "2026-08-24";

function writeJson(filename, value) {
  const filePath = path.join(outputDir, filename);
  const content = JSON.stringify(value, null, 2) + "\n";
  fs.writeFileSync(filePath, content, "utf8");
  return {
    file: filename,
    sha256: crypto.createHash("sha256").update(content).digest("hex").toUpperCase()
  };
}

function createTimeSlots(days, periods) {
  const slots = [];
  for (let day = 1; day <= days; day += 1) {
    for (let period = 1; period <= periods; period += 1) {
      slots.push({ id: `day-${day}-period-${period}`, day, period });
    }
  }
  return slots;
}

function createMediumLessons() {
  const lessons = [];
  for (let classIndex = 1; classIndex <= 10; classIndex += 1) {
    for (let lessonIndex = 1; lessonIndex <= 2; lessonIndex += 1) {
      const teacherIndex = ((classIndex - 1) * 2 + lessonIndex - 1) % 12 + 1;
      lessons.push({
        id: `lesson-${String(classIndex).padStart(2, "0")}-${lessonIndex}`,
        classId: `class-${String(classIndex).padStart(2, "0")}`,
        subjectId: `subject-${String(((classIndex + lessonIndex - 2) % 12) + 1).padStart(2, "0")}`,
        teacherId: `teacher-${String(teacherIndex).padStart(2, "0")}`,
        requiredSessions: 2
      });
    }
  }
  return lessons;
}

fs.mkdirSync(outputDir, { recursive: true });

const small = {
  schemaVersion: "1.0",
  jobId: "benchmark-small-feasible-v1",
  schoolId: "benchmark-school-small",
  timeSlots: [
    { id: "small-day-1-period-1", day: 1, period: 1 },
    { id: "small-day-1-period-2", day: 1, period: 2 },
    { id: "small-day-2-period-1", day: 2, period: 1 },
    { id: "small-day-2-period-2", day: 2, period: 2 }
  ],
  lessons: [
    { id: "small-lesson-1", classId: "class-7a", subjectId: "subject-math", teacherId: "teacher-1", requiredSessions: 2 },
    { id: "small-lesson-2", classId: "class-7a", subjectId: "subject-literature", teacherId: "teacher-2", requiredSessions: 1 },
    { id: "small-lesson-3", classId: "class-7b", subjectId: "subject-physics", teacherId: "teacher-1", requiredSessions: 1 },
    { id: "small-lesson-4", classId: "class-7b", subjectId: "subject-math", teacherId: "teacher-1", requiredSessions: 1 }
  ]
};

const medium = {
  schemaVersion: "1.0",
  jobId: "benchmark-medium-near-realistic-v1",
  schoolId: "benchmark-school-medium",
  timeSlots: createTimeSlots(5, 6),
  lessons: createMediumLessons(),
  options: { timeLimitSeconds: 5 }
};

const infeasible = {
  schemaVersion: "1.0",
  jobId: "benchmark-infeasible-teacher-conflict-v1",
  schoolId: "benchmark-school-infeasible",
  timeSlots: [{ id: "infeasible-day-1-period-1", day: 1, period: 1 }],
  lessons: [
    { id: "infeasible-lesson-a", classId: "class-7a", subjectId: "subject-math", teacherId: "teacher-1", requiredSessions: 1 },
    { id: "infeasible-lesson-b", classId: "class-7b", subjectId: "subject-physics", teacherId: "teacher-1", requiredSessions: 1 }
  ]
};

const entries = [
  {
    id: "small-feasible",
    category: "feasible-small",
    filename: "small-feasible.json",
    payload: small,
    expectedStatus: "OPTIMAL",
    expectedAssignmentCount: 5,
    expectedConflictContains: [],
    constraints: [
      "Each class has at most one lesson session per time slot.",
      "The same teacher has at most one lesson session per time slot.",
      "All required sessions must be assigned."
    ]
  },
  {
    id: "medium-near-realistic",
    category: "near-realistic-medium",
    filename: "medium-near-realistic.json",
    payload: medium,
    expectedStatus: "OPTIMAL",
    expectedAssignmentCount: 40,
    expectedConflictContains: [],
    constraints: [
      "10 classes, 12 teachers, 12 subjects, 5 days and 6 periods per day.",
      "Each lesson requirement needs two sessions.",
      "Class and teacher hard conflicts are prohibited."
    ]
  },
  {
    id: "infeasible-teacher-conflict",
    category: "intentionally-infeasible",
    filename: "infeasible-teacher-conflict.json",
    payload: infeasible,
    expectedStatus: "INFEASIBLE",
    expectedAssignmentCount: 0,
    expectedConflictContains: ["No feasible assignment satisfies all hard class and teacher constraints"],
    constraints: [
      "Two classes require the same teacher in the only available time slot.",
      "The expected result is INFEASIBLE with no assignments."
    ]
  }
];

const datasets = entries.map((entry) => {
  const checksum = writeJson(entry.filename, entry.payload);
  return {
    id: entry.id,
    category: entry.category,
    file: entry.filename,
    sha256: checksum.sha256,
    expectedStatus: entry.expectedStatus,
    expectedAssignmentCount: entry.expectedAssignmentCount,
    expectedConflictContains: entry.expectedConflictContains,
    constraints: entry.constraints,
    rowCounts: {
      timeSlots: entry.payload.timeSlots.length,
      lessons: entry.payload.lessons.length,
      requiredSessions: entry.payload.lessons.reduce((sum, lesson) => sum + lesson.requiredSessions, 0)
    }
  };
});

writeJson("manifest.json", {
  benchmarkVersion: "1.0",
  contractVersion: "1.0",
  generatedFor: "School Timetable Optimizer V0.1 THCS/THPT MVP",
  generatedOn: version,
  piiPolicy: "opaque synthetic identifiers only; no names, emails, phones or student data",
  datasets
});

fs.writeFileSync(
  path.join(outputDir, "README.md"),
  [
    "# Solver benchmark datasets",
    "",
    "Version: `1.0` · Generated: `2026-08-24` · Contract: `schemaVersion: 1.0`",
    "",
    "These are deterministic, synthetic, PII-free CP-SAT benchmark inputs for the THCS/THPT MVP. The manifest records expected status, assignment count, hard-constraint intent and SHA-256 for every payload.",
    "",
    "| Dataset | Size | Expected | Purpose |",
    "| --- | ---: | --- | --- |",
    "| `small-feasible.json` | 4 slots / 4 lesson requirements / 5 sessions | `OPTIMAL`, 5 assignments | Fast smoke baseline |",
    "| `medium-near-realistic.json` | 30 slots / 20 lesson requirements / 40 sessions | `OPTIMAL`, 40 assignments | Near-realistic capacity sample |",
    "| `infeasible-teacher-conflict.json` | 1 slot / 2 lesson requirements / 2 sessions | `INFEASIBLE`, 0 assignments | Explicit hard teacher conflict |",
    "",
    "Run the deterministic verification from the repository root:",
    "",
    "```powershell",
    "& .\\backend\\solver\\.venv\\Scripts\\python.exe -c \"import sys,unittest; sys.path.insert(0,'backend/solver/src'); suite=unittest.defaultTestLoader.loadTestsFromName('test_benchmarks', module=None); result=unittest.TextTestRunner(verbosity=2).run(suite); raise SystemExit(not result.wasSuccessful())\"",
    "```",
    "",
    "Do not use these synthetic datasets as school-pilot approval evidence. A pilot dataset must be anonymized, separately approved and assigned its own version/hash.",
    ""
  ].join("\n"),
  "utf8"
);
