# Legal & Rule Register

**Product:** School Timetable Optimizer  
**Scope:** V0.1 — trường THCS/THPT  
**Register version:** `RULE-REGISTER-0.1.0`  
**Checked on:** `2026-08-24`  
**Revalidated on:** `2026-09-03`
**Status:** Source-verified baseline; business approval pending

Tài liệu này là register phiên bản đầu cho các quy tắc pháp lý và quy tắc vận
hành ảnh hưởng đến xếp thời khóa biểu. Register không phải là quyết định pháp
lý thay cho cơ quan có thẩm quyền và không tự động biến thành hard-code trong
solver. Mỗi rule phải có nguồn, hiệu lực, phạm vi, phân loại, trạng thái phê
duyệt và mapping triển khai.

## 1. Quy ước register

| Trường                       | Ý nghĩa                                                                                                           |
| ---------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| `ruleId`                     | Mã ổn định của rule; không tái sử dụng cho một ý nghĩa khác.                                                      |
| `registerVersion`            | Phiên bản của bộ register; thay đổi semantics phải tăng version.                                                  |
| `source` / `sourceLocator`   | Văn bản hoặc quyết định nguồn và điều/khoản/bảng dùng để kiểm tra.                                                |
| `issuedOn` / `effectiveFrom` | Ngày ban hành và ngày bắt đầu hiệu lực của nguồn.                                                                 |
| `checkedOn`                  | Ngày gần nhất nhóm dự án kiểm tra nguồn chính thức.                                                               |
| `applicability`              | Cấp học, loại trường hoặc profile lịch mà rule áp dụng.                                                           |
| `classification`             | `HARD_LEGAL`, `HARD_CONFIGURED`, `SOFT_CONFIGURED` hoặc `REFERENCE`.                                              |
| `configurable`               | `false` nếu giá trị là baseline pháp lý; `true` nếu trường được chọn profile trong giới hạn nguồn.                |
| `approval`                   | Vai trò/người phê duyệt nghiệp vụ và trạng thái. Hiện chưa có tên stakeholder trường pilot nên không tự điền tên. |
| `implementationMapping`      | Field/domain rule tương ứng; ghi rõ nếu chưa có trong contract v1.                                                |

### Phân loại

- `HARD_LEGAL`: không được vi phạm khi rule áp dụng; thay đổi chỉ qua nguồn
  pháp lý mới hoặc bản register mới.
- `HARD_CONFIGURED`: sau khi trường xác nhận profile, validator/solver không
  được vi phạm giá trị đã chọn.
- `SOFT_CONFIGURED`: ưu tiên có trọng số; có thể vi phạm nhưng phải giải thích
  và ghi diagnostics.
- `REFERENCE`: dùng để giải thích hoặc kiểm tra dữ liệu, chưa phải constraint.

## 2. Nguồn chính thức đã kiểm tra

| Source ID                      | Văn bản                                                                                                                          | Ngày ban hành                                         | Ngày hiệu lực                                                   | Phạm vi sử dụng trong register                                                   | Link                                                                                                                                                                                                                                                                                                                   |
| ------------------------------ | -------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------- | --------------------------------------------------------------- | -------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `SRC-TT05-2025`                | Thông tư `05/2025/TT-BGDĐT` quy định chế độ làm việc đối với giáo viên phổ thông, dự bị đại học                                  | `2025-03-07`                                          | `2025-04-22`                                                    | Thời gian làm việc, số tuần giảng dạy và định mức tiết dạy giáo viên phổ thông   | [Cổng TTĐT Chính phủ — metadata văn bản](https://vanban.chinhphu.vn/?classid=1&docid=213113&orggroupid=4&pageid=27160); [toàn văn trên Chinhphu.vn](https://xaydungchinhsach.chinhphu.vn/toan-van-thong-tu-05-2025-tt-bgddt-quy-dinh-che-do-lam-viec-doi-voi-giao-vien-pho-thong-du-bi-dai-hoc-119250311185323893.htm) |
| `SRC-CTGDPT-2018-CONSOLIDATED` | Văn bản hợp nhất chương trình GDPT ban hành từ Thông tư `32/2018/TT-BGDĐT`, có cập nhật `20/2021/TT-BGDĐT` và `13/2022/TT-BGDĐT` | Gốc `2018-12-26`; cập nhật `2021-07-01`, `2022-08-03` | Gốc `2019-02-15`; cập nhật tương ứng `2021-08-16`, `2022-08-03` | Thời lượng tiết học và profile số tiết trong buổi của THCS/THPT                  | [Bản hợp nhất trên website Bộ GDĐT](https://moet.gov.vn/content/vanban/Lists/VBPQ/Attachments/1483/vbhn-ttu-322018-202021-132022-ttbgddt.pdf); [chương trình tổng thể PDF](https://moet.gov.vn/content/vanban/Lists/VBPQ/Attachments/1483/vbhn-chuong-trinh-tong-the.pdf)                                              |
| `SRC-BLLD-2019`                | Bộ luật Lao động `45/2019/QH14`                                                                                                  | `2019-11-20`                                          | `2021-01-01`                                                    | Nghỉ hằng tuần và thời giờ nghỉ ngơi áp dụng làm ranh giới khi lập lịch làm việc | [Cổng Công báo Chính phủ — toàn văn](https://congbao.chinhphu.vn/detail/tai-ve?id=30232&slug=45-2019-qh14); [metadata trên Cổng TTĐT Chính phủ](https://vanban.chinhphu.vn/?classid=1&docid=198540&pageid=27160&typegroupid=3)                                                                                         |

`checkedOn` của cả hai nguồn là `2026-08-25` sau lần revalidation hiện tại. Trước pilot và production phải
kiểm tra lại hiệu lực, văn bản sửa đổi/thay thế và quy định triển khai của địa
phương/trường.

### Revalidation log — 2026-08-25

- Cổng Thông tin điện tử Chính phủ vẫn ghi nhận Thông tư `05/2025/TT-BGDĐT`
  ban hành ngày `2025-03-07`, có hiệu lực ngày `2025-04-22`, là nguồn hiện hành
  cho thời gian làm việc và định mức tiết dạy của giáo viên phổ thông.
- Bản hợp nhất Chương trình GDPT trên website Bộ GDĐT vẫn là nguồn được dùng
  cho profile THCS/THPT: mỗi tiết `45` phút và một buổi không bố trí quá `5`
  tiết trong profile một buổi/ngày.
- Lần kiểm tra này không thay đổi semantics của `RULE-REGISTER-0.1.0`, không
  thêm giá trị `45`, `5`, `19`, `17` hoặc công thức tải dạy vào CP-SAT v1, và
  không biến nguồn pháp lý thành approval của trường pilot.
- Nguồn chính thức được kiểm tra lại:
  `https://vanban.chinhphu.vn/?classid=1&docid=213113&pageid=27160&typegroupid=6`
  và các bản hợp nhất CTGDPT đã nêu trong bảng nguồn ở trên.
- Bộ luật Lao động `45/2019/QH14`, Điều 111, chỉ yêu cầu nghỉ hằng tuần ít
  nhất 24 giờ liên tục và cho phép người sử dụng lao động xác định ngày nghỉ
  cố định khác trong tuần. Văn bản không quy định mặc định mọi giáo viên phải
  nghỉ đúng 02 ngày/tuần hoặc mặc định tối đa 05 ngày có tiết.

## 3. Register phiên bản đầu

| Rule ID           | Quy tắc chuẩn hóa                                                                                                                                                                                              | Source / locator                                                                                                                              | Hiệu lực và áp dụng                                                                                                                                               | Phân loại / configurable                                                                                       | Approval                                                                                                                           | Mapping triển khai                                                                                                                                              |
| ----------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `RULE-EDU-001`    | Một tiết học có thời lượng chuẩn `45` phút.                                                                                                                                                                    | `SRC-CTGDPT-2018-CONSOLIDATED`; phần thời lượng giáo dục cấp THCS và THPT.                                                                    | Từ `2019-02-15`, được rà soát theo bản hợp nhất có cập nhật `2022-08-03`; THCS/THPT trong MVP.                                                                    | `HARD_LEGAL`; `false` trong profile pháp lý.                                                                   | `PENDING_STAKEHOLDER`: người phụ trách thời khóa biểu xác nhận profile; hiệu trưởng/phó hiệu trưởng phê duyệt áp dụng tại trường.  | Contract v1 chỉ có `TimeSlot.period`, chưa có `durationMinutes`; không được suy diễn rằng solver đang kiểm tra phút. Field đề xuất: `timeSlot.durationMinutes`. |
| `RULE-EDU-002`    | Profile một buổi/ngày không bố trí quá `5` tiết trong một buổi; profile hai buổi chỉ dùng khi trường đủ điều kiện và đã chọn cấu hình hợp lệ.                                                                  | `SRC-CTGDPT-2018-CONSOLIDATED`; phần thời lượng giáo dục cấp THCS và THPT.                                                                    | Theo chương trình GDPT hiện hành; áp dụng theo profile lịch của trường.                                                                                           | `HARD_CONFIGURED`; `true` cho `shiftProfile`, nhưng giá trị tối đa `5` không được tự ý tăng.                   | `PENDING_STAKEHOLDER`: timetable coordinator đề xuất; hiệu trưởng/phó hiệu trưởng phê duyệt profile.                               | Domain đề xuất `shiftCode`, `maxPeriodsPerShift`; chưa có trong migration/JSON/Python v1.                                                                       |
| `RULE-TEACH-001`  | Thời gian làm việc trong năm học của giáo viên phổ thông là `42` tuần: `37` tuần giảng dạy nội dung chương trình, gồm `35` tuần thực dạy và `2` tuần dự phòng; `3` tuần bồi dưỡng; `2` tuần chuẩn bị/tổng kết. | `SRC-TT05-2025`, Điều 5 khoản 1.                                                                                                              | Ban hành `2025-03-07`, hiệu lực `2025-04-22`; giáo viên trường phổ thông, trong đó có THCS/THPT.                                                                  | `HARD_LEGAL`; lịch ngày cụ thể `true` trong giới hạn khung năm học và quyết định có thẩm quyền.                | `PENDING_STAKEHOLDER`: trường xác nhận academic calendar; không thay đổi tổng baseline pháp lý.                                    | `academic_periods.starts_on/ends_on` mới là khoảng ngày; chưa có fields `teachingWeeks`, `reserveWeeks`, `trainingWeeks`, `preparationWeeks` trong contract v1. |
| `RULE-TEACH-002`  | Định mức tiết dạy trung bình mỗi tuần: giáo viên THCS `19` tiết; giáo viên THPT `17` tiết.                                                                                                                     | `SRC-TT05-2025`, Điều 7 khoản 3 điểm a.                                                                                                       | Hiệu lực `2025-04-22`; áp dụng cho trường THCS/THPT thông thường trong MVP. Các loại trường/đối tượng đặc thù phải có profile riêng, không tự áp dụng con số này. | `HARD_LEGAL`; `false` cho profile thường, có thể chọn rule profile khác chỉ khi đủ căn cứ pháp lý.             | `PENDING_STAKEHOLDER`: HR/ban giám hiệu xác nhận loại trường và profile giáo viên; hiệu trưởng/phó hiệu trưởng phê duyệt vận hành. | P2.1-T02 đọc từ rule snapshot parameter `weeklyNormBySchoolLevel`; không hard-code `19/17` vào CP-SAT và không coi đây là hard weekly cap.                      |
| `RULE-TEACH-003`  | Định mức năm học được tính bằng định mức trung bình tuần nhân số tuần giảng dạy; số tuần tính định mức không bao gồm tuần dự phòng.                                                                            | `SRC-TT05-2025`, Điều 7 khoản 2 và phần giải thích khoản 3.                                                                                   | Hiệu lực `2025-04-22`; dùng khi kiểm tra tải dạy theo academic period.                                                                                            | `HARD_LEGAL`; `false` về công thức, `true` về input calendar đã được phê duyệt.                                | `PENDING_STAKEHOLDER`: HR/ban giám hiệu xác nhận dữ liệu đầu vào; không tự coi dữ liệu demo là phê duyệt.                          | P2.1-T02 đọc từ rule snapshot parameter `teachingWeeksForNorm`; báo cáo annual được suy ra từ weekly average × số tuần đã approve.                              |
| `RULE-TEACH-004`  | Giảm định mức do kiêm nhiệm/chức trách chỉ áp dụng khi có quyết định phân công, mức giảm, người áp dụng và thời hạn được phê duyệt.                                                                            | Quyết định/bổ nhiệm/phân công chính thức của trường; URL và locator phải được lưu trong rule snapshot.                                        | Hiệu lực theo quyết định; scope bắt buộc có `teacherId`/`actorId` và academic period phù hợp.                                                                     | `HARD_CONFIGURED`; `reductionSessionsPerWeek >= 0`; không tự suy diễn mức giảm theo tên chức danh.             | `PENDING_STAKEHOLDER`: người đề xuất và hiệu trưởng/phó hiệu trưởng phê duyệt; mỗi rule phải có approval metadata.                 | P2.1-T02 dùng các rule code prefix `RULE-TEACH-REDUCTION-`, parameter `roleCode` và `reductionSessionsPerWeek`; kết quả có source/rule hash.                    |
| `RULE-TEACH-005`  | Giáo viên được nghỉ hằng tuần ít nhất `24` giờ liên tục; ngày nghỉ cụ thể do trường/người sử dụng lao động xác định theo lịch và nội quy. Không suy ra mặc định 02 ngày nghỉ hoặc hard cap 05 ngày có tiết.    | `SRC-BLLD-2019`, Điều 111 khoản 1–2.                                                                                                          | Hiệu lực `2021-01-01`; áp dụng khi profile lịch của trường đã xác định ngày nghỉ hằng tuần.                                                                       | `HARD_LEGAL`; ngày nghỉ cụ thể `true` theo lịch trường, nhưng không được tự chọn thay trường.                  | `PENDING_STAKEHOLDER`: hiệu trưởng/đơn vị quản lý xác nhận lịch làm việc và ngày nghỉ cố định.                                     | Contract solver v1 chưa có calendar working-day rule; không tạo rule Sunday hoặc `MAX_WORKING_DAYS=5` nếu chưa có quyết định/lịch trường.                       |
| `RULE-SCHOOL-001` | Một lớp, giáo viên hoặc phòng không được có hai assignment cùng một `TimeSlot`.                                                                                                                                | Rule bất biến của bài toán xếp thời khóa biểu; nguồn kỹ thuật `docs/domain-glossary.md` và solver contract v1, không phải một con số pháp lý. | Áp dụng trong mọi phiên bản lịch MVP; khi trường bật phòng trong solver phải áp dụng cả resource phòng.                                                           | `HARD_LEGAL` không phù hợp; phân loại đúng là `HARD_CONFIGURED` với `configurable=false` cho tính hợp lệ lịch. | `PENDING_STAKEHOLDER`: timetable coordinator xác nhận nghiệp vụ; product owner xác nhận contract.                                  | Solver v1 đang enforce class/teacher; room chưa có trong request nên chưa thể claim đã enforce resource phòng.                                                  |
| `RULE-SCHOOL-002` | `fixedSlotId` phải trỏ tới slot tồn tại; `allowedSlotIds` chỉ được chứa slot tồn tại; lesson không còn slot hợp lệ là `INFEASIBLE`.                                                                            | JSON Schema `solve-job-request`, TypeScript DTO và Python solver contract v1.                                                                 | Có hiệu lực từ `schemaVersion: 1.0`; áp dụng cho mọi job solver.                                                                                                  | `HARD_CONFIGURED`; `false` đối với tính hợp lệ payload.                                                        | `APPROVED_BY_CONTRACT`: duy trì bởi owner của API/solver contract; business approver không thay thế bằng rule kỹ thuật.            | Đã có trong NestJS DTO, Pydantic và CP-SAT diagnostics; cần giữ đồng bộ khi tăng schema version.                                                                |
| `RULE-SCHOOL-003` | Nguyện vọng/ưu tiên giáo viên không tự động là lệnh cấm; chỉ trở thành hard rule khi trường xác nhận mức “không thể dạy”, còn preference thông thường là soft rule có trọng số.                                | Project policy trong scope/workspace; chưa phải quy định pháp luật quốc gia.                                                                  | Áp dụng khi có dữ liệu availability/preferences của trường; cần version và nguồn.                                                                                 | `SOFT_CONFIGURED` mặc định; `true`; mức hard phải có explicit approval.                                        | `PENDING_STAKEHOLDER`: giáo viên cung cấp; timetable coordinator tổng hợp; hiệu trưởng/phó hiệu trưởng phê duyệt rule profile.     | `Preference`/`SoftConstraint` chưa có trong solver v1; không thêm vào request cho tới task rule model và availability.                                          |

## 4. Trạng thái và quyết định triển khai

- `Verified-source` chỉ có nghĩa là nhóm dự án đã truy xuất nguồn chính thức và
  ghi nhận metadata; không có nghĩa trường pilot đã phê duyệt áp dụng.
- Tất cả rule có tác động vận hành đang ở `PENDING_STAKEHOLDER` vì workspace
  chưa có tên người phụ trách thời khóa biểu/hiệu trưởng của trường pilot.
- `RULE-SCHOOL-002` là invariant của contract kỹ thuật nên có thể dùng cho
  validation local; nó không thay thế legal approval.
- Không đưa `45`, `5`, `19`, `17` hoặc công thức tải dạy vào CP-SAT v1 khi
  rule snapshot chưa được tạo và phê duyệt. P2.1-T01 đã tạo mapping/contract
  có version, source, effective date, scope, approval, snapshot hash và test;
  P2.1-T02 đã tạo teacher-load report ở server; report chỉ là average target
  trừ khi snapshot cấu hình rõ một hard cap.
- Không nạp `RULE-TEACHER-PREFERRED-OFF-DAYS` hoặc
  `RULE-TEACHER-MAX-WORKING-DAYS` làm mặc định production khi chưa có nguyện
  vọng từng giáo viên hoặc lịch làm việc được trường phê duyệt. Hai rule này là
  cấu hình nghiệp vụ, không phải mặc định pháp lý toàn quốc.
- Khi nguồn bị sửa/thay thế, tạo register version mới, giữ bản cũ để audit và
  không sửa ngược lịch sử của phiên bản đã dùng để tạo schedule.

## 5. Open approval gate

Để chuyển từ `Source-verified baseline` sang `Approved for pilot`, cần bổ sung:

1. Tên/chức danh người phụ trách thời khóa biểu và người phê duyệt cuối của
   trường pilot.
2. Profile lịch trường: 5 hay 6 ngày, một hay hai buổi, số tiết mỗi buổi,
   thời gian nghỉ giữa tiết và ngoại lệ địa phương.
3. Xác nhận loại trường/profile giáo viên để chọn đúng định mức, không áp dụng
   nhầm baseline THCS/THPT cho trường/đối tượng đặc thù.
4. P2.1-T03 chuẩn hóa `RULE-TEACHER-AVAILABILITY-*`: hard ban dùng
   `constraintType=UNAVAILABLE`; preference dùng `preferenceLevel=STRONG|SOFT`,
   `weight`, `dayOfWeek`, tùy chọn `shiftCode`/`period` và khoảng hiệu lực.
   Quy tắc availability và preference của giáo viên vẫn cần trường xác nhận
   source và approval trước pilot.
5. Quy tắc availability và preference của giáo viên: hard ban hay soft
   preference, trọng số và cách xử lý khi không khả thi.

Cho đến khi có các phê duyệt này, sổ đăng ký chỉ phù hợp làm đường cơ sở triển
khai và kiểm toán, không phải phê duyệt pháp lý/nghiệp vụ cuối cùng.
