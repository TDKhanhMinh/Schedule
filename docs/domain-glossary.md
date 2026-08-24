# Domain Glossary & Canonical Terminology

**Product:** School Timetable Optimizer  
**Scope:** V0.1 — THCS/THPT MVP  
**Version:** `2026-08-24`  
**Status:** Canonical terminology baseline for implementation

Tài liệu này là nguồn chuẩn cho tên gọi nghiệp vụ và mapping giữa giao diện,
NestJS, PostgreSQL và Python CP-SAT. Một thuật ngữ chỉ được dùng cho một khái
niệm; nếu một tên đang tồn tại vì tương thích contract thì phải ghi rõ đó là
wire name, không tạo thêm domain concept mới.

## 1. Quy ước bắt buộc

- Tên hiển thị tiếng Việt dùng cho người dùng; tên canonical tiếng Anh dùng
  trong domain code và tài liệu kỹ thuật.
- JSON/API và Pydantic dùng `camelCase`; PostgreSQL dùng `snake_case`;
  TypeScript/Python model dùng PascalCase.
- ID là chuỗi opaque. Không suy diễn ý nghĩa từ UUID, tên bảng hoặc tên file.
- `period` luôn có nghĩa là thứ tự tiết trong ngày. `academicPeriod` là kỳ
  thời gian/năm học; hai khái niệm này không được dùng thay thế nhau.
- `schemaVersion` là phiên bản contract của job; `scheduleVersion` là phiên
  bản nghiệp vụ của thời khóa biểu đã lưu. Hai loại version độc lập.
- `lessons[]` là tên field wire hiện tại để tương thích `schemaVersion: "1.0"`;
  domain concept chuẩn của từng phần tử là `LessonRequirement`, không phải một
  khái niệm thứ hai tên `Lesson`.

## 2. Glossary chuẩn

| Thuật ngữ nghiệp vụ | Canonical name / identifier | Định nghĩa và ví dụ | Trường dữ liệu đề xuất | Mapping hiện tại và trạng thái |
| --- | --- | --- | --- | --- |
| Trường | `School` / `schoolId` | Đơn vị sở hữu toàn bộ dữ liệu xếp lịch. Ví dụ: “Trường THCS Demo”. | `id`, `name` | PostgreSQL `schools`; request/result scope bằng `schoolId`; Python giữ `schoolId`. **Đã có ở v1.** |
| Năm học/kỳ học | `AcademicPeriod` / `academicPeriodId` | Khoảng thời gian nghiệp vụ giới hạn dữ liệu, có thể biểu diễn “Năm học 2026-2027 · Học kỳ I”. | `id`, `schoolId`, `name`, `startsOn`, `endsOn` | PostgreSQL `academic_periods`; chưa truyền trong solver request v1, nên API phải chọn đúng period trước khi tạo payload. **DB có, solver scope chưa có.** |
| Khối | `Grade` / `grade` | Cấp lớp của lớp học, ví dụ khối 7; không phải một lớp cụ thể. | `grade` | PostgreSQL `classes.grade` với miền 6–12; chưa lặp lại trong solver payload vì `classId` đã là định danh tham chiếu. **Đã có ở DB.** |
| Lớp | `Class` / `classId` | Nhóm học sinh có cùng thời khóa biểu. Ví dụ “7A”. | `id`, `schoolId`, `name`, `grade` | PostgreSQL `classes`; `LessonRequirement.classId`; Python `classId`. **Đã có ở v1.** |
| Môn học | `Subject` / `subjectId` | Nội dung/môn được dạy, ví dụ Toán, Vật lý, Ngữ văn. | `id`, `schoolId`, `name` | PostgreSQL `subjects`; `LessonRequirement.subjectId`; Python `subjectId`. **Đã có ở v1.** |
| Giáo viên | `Teacher` / `teacherId` | Người thực hiện việc dạy một phân công. Ví dụ “Nguyễn An”. | `id`, `schoolId`, `displayName` | PostgreSQL `teachers`; `LessonRequirement.teacherId`; Python `teacherId`. **Đã có ở v1.** |
| Phòng | `Room` / `roomId` | Không gian vật lý được phép tổ chức tiết học. Ví dụ “Phòng A”. | `id`, `schoolId`, `name`, tùy chọn `capacity`/`roomType` | PostgreSQL `rooms`; chưa có `roomId` trong solver request/result và chưa có ràng buộc phòng trong CP-SAT v1. **Persistence có, solver chưa hỗ trợ.** |
| Ngày | `Day` / `day` | Chỉ số ngày trong lịch của trường, miền 1–7. Mapping chỉ số với thứ trong tuần phải được cấu hình từ nguồn dữ liệu, không tự suy đoán. | `dayNumber` hoặc API `day` | PostgreSQL/API/Python dùng `day`; schema giới hạn 1–7. **Đã có ở v1, mapping lịch cần chốt ở import.** |
| Ca học | `Shift` / `shiftCode` | Nhóm các tiết trong một buổi, ví dụ `MORNING` hoặc `AFTERNOON`; không phải một tiết. | `shiftCode`, `startTime`, `endTime`, hoặc bảng `shifts` | Chưa có trong migration và solver schema v1. **Khái niệm chuẩn cho Excel/domain tiếp theo, chưa được coi là capability đã triển khai.** |
| Tiết | `Period` / `period` | Thứ tự tiết trong một ngày, ví dụ tiết 1 hoặc tiết 2. | `periodNumber` hoặc API/DB `period` | PostgreSQL `time_slots.period`; API/Python `TimeSlot.period`, miền từ 1. **Đã có ở v1.** |
| Khung ngày-tiết | `TimeSlot` / `timeSlotId` | Một vị trí có thể xếp lịch, là cặp ngày + tiết. Ví dụ `(day: 1, period: 2)`. | `id`, `schoolId`, `day`, `period`, tương lai có `shiftCode` | PostgreSQL `time_slots`; request `timeSlots[]`; result gọi định danh là `slotId`. **Đã có ở v1.** |
| Phân công giảng dạy | `LessonRequirement` / `lessonRequirementId` | Quan hệ lớp–môn–giáo viên kèm số tiết cần xếp. Ví dụ 7A–Toán–Nguyễn An cần 2 tiết. | Domain identity `lessonRequirementId`; v1 wire item dùng `id`, result tham chiếu bằng `lessonId`; cùng các field `schoolId`, `classId`, `subjectId`, `teacherId`, `requiredSessions` | PostgreSQL `lesson_requirements`; TS/Python `LessonRequirement`; API v1 dùng collection `lessons[]` vì tương thích. **Đã có ở v1.** |
| Số tiết yêu cầu | `RequiredSessions` / `requiredSessions` | Tổng số lượt tiết phải được xếp cho một `LessonRequirement`; không phải số `TimeSlot` đã được gán. Ví dụ `2`. | `requiredSessions` | PostgreSQL `lesson_requirements.required_sessions`; API/Python cùng tên camelCase. **Đã có ở v1.** |
| Lượt tiết | `LessonSession` / `sessionIndex` | Một lần xuất hiện của một phân công; đánh số từ 0 trong contract để phân biệt các lượt cùng môn/lớp/giáo viên. | `lessonId`, `sessionIndex` | Không có bảng riêng; `lessonId` trỏ về item `id` của `lessons[]`/row `lesson_requirements`; xuất hiện trong `Assignment` và `optimization_assignments.session_index`. **Đã có ở result v1.** |
| Phân công vào lịch | `Assignment` / `assignment` | Kết quả gán một lượt tiết vào một khung ngày-tiết. Ví dụ `lessonId + sessionIndex + slotId`. | `lessonId`, `sessionIndex`, `slotId`, tương lai `roomId` | API/Python result `assignments[]`; PostgreSQL `optimization_assignments`. **Đã có ở v1, chưa gán phòng.** |
| Ràng buộc cứng | `HardConstraint` / `hardConstraint` | Điều kiện bắt buộc; vi phạm làm phương án không hợp lệ. Ví dụ mỗi lớp/giáo viên không thể có hai lượt cùng một `TimeSlot`, hoặc `fixedSlotId` phải tồn tại. | `type`, `scope`, `parameters`, `source`, `effectiveFrom` | Hiện được biểu diễn bằng `requiredSessions`, `allowedSlotIds`, `fixedSlotId` và luật CP-SAT; result ghi `diagnostics.conflicts`. **Đã có một phần ở v1.** |
| Ràng buộc mềm | `SoftConstraint` / `softConstraint` | Điều kiện ưu tiên nhưng có thể vi phạm với chi phí/trọng số, ví dụ tránh tiết cuối cho giáo viên. | `type`, `weight`, `scope`, `parameters`, `source`, `effectiveFrom` | Schema v1 chưa có `softConstraints` và solver chưa tối ưu trọng số. **Khái niệm thuộc MVP, capability follow-up.** |
| Nguyện vọng | `Preference` / `preference` | Mong muốn của giáo viên/trường dùng để tạo ràng buộc mềm hoặc cảnh báo; không tự động trở thành ràng buộc cứng. Ví dụ giáo viên ưu tiên không dạy tiết 5. | `actorType`, `actorId`, `constraintType`, `weight`, `allowedSlotIds`/`blockedSlotIds`, `reason` | Chưa có bảng/API/solver field v1. Khi triển khai phải map rõ sang `SoftConstraint` hoặc hard rule được phê duyệt. **Chưa triển khai.** |
| Job tối ưu | `OptimizationJob` / `jobId` | Một lần yêu cầu solver chạy bất đồng bộ, có vòng đời queue và kết quả. | `jobId`, `schemaVersion`, `status`, `requestedAt`, `completedAt` | BullMQ job `optimization.solve`; API `POST/GET /api/v1/optimization-jobs`; PostgreSQL tương lai dùng `optimization_runs`. **Queue/API đã có ở local.** |
| Lần chạy tối ưu | `OptimizationRun` / `runId` | Bản ghi/audit của một lần chạy solver, độc lập với phiên bản lịch được người dùng lưu. | `id`, `schoolId`, `status`, `contractVersion`, timestamps, diagnostics | PostgreSQL `optimization_runs`; API job id hiện chưa phải UUID `runId`. **Persistence baseline có, lifecycle đầy đủ follow-up.** |
| Phương án xếp thời khóa biểu | `ScheduleSolution` / `solution` | Tập `Assignment` do một `OptimizationRun` trả về, kèm trạng thái, objective và diagnostics. Ví dụ phương án `OPTIMAL` có 5 assignments và 0 conflicts. | `status`, `assignments`, `objectiveValue`, `diagnostics` | API/Python `SolveJobResult`; chưa có entity lưu độc lập. **Đã có ở result v1.** |
| Phiên bản thời khóa biểu | `ScheduleVersion` / `scheduleVersionId` | Snapshot nghiệp vụ có thể xem, chỉnh sửa, phê duyệt, khóa hoặc công bố; khác với kết quả tạm của một job. | `id`, `schoolId`, `academicPeriodId`, `versionNumber`, `status`, `sourceRunId`, `createdBy` | Chưa có bảng/API trong baseline; PostgreSQL `optimization_runs` không được gọi là `ScheduleVersion`. **Capability follow-up.** |
| Chẩn đoán | `Diagnostics` / `diagnostics` | Thông tin giải thích kết quả, gồm cảnh báo không chặn và xung đột làm phương án không khả thi. | `warnings[]`, `conflicts[]`, tương lai `ruleCode`/`source` | `SolveJobResult.diagnostics` và JSON schema/Pydantic cùng cấu trúc. **Đã có ở v1.** |
| Phiên bản contract | `ContractVersion` / `schemaVersion` | Phiên bản hình dạng và ý nghĩa của request/result giữa NestJS và Python; breaking change phải tăng version. | `schemaVersion` ở request/result; DB audit dùng `contract_version` | JSON Schema const `"1.0"`; TS/Python `CONTRACT_VERSION`; DB `optimization_runs.contract_version`. **Đã có ở v1.** |

## 3. Mapping contract v1

| Domain concept | TypeScript/NestJS | JSON wire | Python/Pydantic | PostgreSQL |
| --- | --- | --- | --- | --- |
| Khung ngày-tiết | `TimeSlot` | `timeSlots[].{id,day,period}` | `TimeSlot` | `time_slots` |
| Phân công giảng dạy | `LessonRequirement` | `lessons[]` | `LessonRequirement` | `lesson_requirements` |
| Lượt tiết đã gán | `Assignment` | `assignments[].{lessonId,sessionIndex,slotId}` | `Assignment` | `optimization_assignments` |
| Kết quả phương án | `SolveJobResult` | `status`, `assignments`, `objectiveValue`, `diagnostics` | `SolveJobResult` | `optimization_runs` + assignments khi persistence được nối |
| Phiên bản contract | `CONTRACT_VERSION` | `schemaVersion` | `CONTRACT_VERSION` | `contract_version` |

### 3.1. Những tên không được dùng thay thế

- Không dùng “tiết” để chỉ cả ngày + tiết; dùng `TimeSlot` cho vị trí đầy đủ.
- Không dùng “kỳ” hoặc `period` để chỉ `AcademicPeriod`.
- Không gọi `OptimizationRun` là `ScheduleVersion`; run có thể tạo ra nhiều
  bản lưu/sửa về sau.
- Không gọi `Preference` là `HardConstraint` nếu chưa có quyết định nghiệp vụ
  và rule version tương ứng.
- Không đổi `lessons[]` thành `lessonRequirements[]` trong `schemaVersion: 1.0`
  mà không có migration/versioning; domain code vẫn dùng `LessonRequirement`.

## 4. Khoảng trống contract cần theo dõi

Các mục dưới đây đã có tên chuẩn nhưng chưa được giả định là đã triển khai trong
solver contract v1:

1. `academicPeriodId` trong request và phạm vi dữ liệu theo học kỳ.
2. `shiftCode`/ca học và mapping ngày trong import Excel.
3. `roomId` trong assignment cùng hard/soft room constraints.
4. `SoftConstraint` và `Preference` có trọng số, nguồn, ngày hiệu lực.
5. `ScheduleVersion` với trạng thái draft/approved/published/locked.

Khi một mục được triển khai, phải cập nhật đồng thời glossary này, JSON Schema,
TypeScript contract, Pydantic model, migration nếu cần và test tương ứng. Không
được thêm field ở một adapter rồi để adapter còn lại âm thầm bỏ qua.
