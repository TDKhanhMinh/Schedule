export const CONFLICT_CATALOG_VERSION = "CONFLICT-CATALOG-1.0.0" as const;

export type ConflictSeverity = "ERROR" | "WARNING" | "INFO";
export type ConflictEntity = "IMPORT" | "JOB" | "LESSON" | "CLASS" | "TEACHER" | "ROOM" | "SLOT" | "RULE";

export interface ConflictDefinition {
  code: string;
  severity: ConflictSeverity;
  entity: ConflictEntity;
  messageTemplateVi: string;
  remediationHintVi: string;
}

export const CONFLICT_CATALOG = [
  {
    code: "SCHOOL_REQUIRED",
    severity: "ERROR",
    entity: "IMPORT",
    messageTemplateVi: "schoolId là bắt buộc.",
    remediationHintVi: "Chọn đúng trường trước khi upload dữ liệu.",
  },
  {
    code: "FILE_REQUIRED",
    severity: "ERROR",
    entity: "IMPORT",
    messageTemplateVi: "Vui lòng chọn file Excel để upload.",
    remediationHintVi: "Chọn file .xlsx hoặc .xlsm theo template đã phát hành.",
  },
  {
    code: "INVALID_FILE_TYPE",
    severity: "ERROR",
    entity: "IMPORT",
    messageTemplateVi: "Định dạng file không hợp lệ.",
    remediationHintVi: "Chỉ upload file Excel .xlsx hoặc .xlsm.",
  },
  {
    code: "INVALID_TEMPLATE",
    severity: "ERROR",
    entity: "IMPORT",
    messageTemplateVi: "File Excel không khớp template bắt buộc.",
    remediationHintVi: "Dùng template MVP-0.1.0 và giữ nguyên tên các cột bắt buộc.",
  },
  {
    code: "INVALID_WORKBOOK",
    severity: "ERROR",
    entity: "IMPORT",
    messageTemplateVi: "Không thể đọc workbook Excel.",
    remediationHintVi: "Mở lại file bằng Excel, lưu thành .xlsx/.xlsm rồi upload lại template chuẩn.",
  },
  {
    code: "INVALID_FILE_SIGNATURE",
    severity: "ERROR",
    entity: "IMPORT",
    messageTemplateVi: "File không có chữ ký Excel hợp lệ.",
    remediationHintVi: "Không đổi đuôi file thủ công; xuất lại workbook từ Excel.",
  },
  {
    code: "WORKBOOK_PARSE_TIMEOUT",
    severity: "ERROR",
    entity: "IMPORT",
    messageTemplateVi: "Không thể đọc file Excel trong thời gian cho phép.",
    remediationHintVi: "Giảm kích thước workbook hoặc tách dữ liệu thành các file nhỏ hơn.",
  },
  {
    code: "WORKBOOK_TOO_LARGE",
    severity: "ERROR",
    entity: "IMPORT",
    messageTemplateVi: "File Excel vượt quá kích thước cho phép.",
    remediationHintVi: "Giữ file trong giới hạn kích thước của MVP và loại bỏ dữ liệu thừa.",
  },
  {
    code: "FILE_TOO_LARGE",
    severity: "ERROR",
    entity: "IMPORT",
    messageTemplateVi: "File Excel vượt quá kích thước cho phép.",
    remediationHintVi: "Giữ file trong giới hạn kích thước của MVP và loại bỏ dữ liệu thừa.",
  },
  {
    code: "WORKBOOK_LIMIT_EXCEEDED",
    severity: "ERROR",
    entity: "IMPORT",
    messageTemplateVi: "Workbook vượt giới hạn an toàn của MVP.",
    remediationHintVi: "Giảm số sheet, hàng hoặc cột theo giới hạn trong template.",
  },
  {
    code: "WORKBOOK_UNSAFE_CONTENT",
    severity: "ERROR",
    entity: "IMPORT",
    messageTemplateVi: "Workbook chứa nội dung không được hỗ trợ.",
    remediationHintVi: "Loại bỏ macro, công thức hoặc liên kết ngoài rồi lưu lại workbook.",
  },
  {
    code: "REQUIRED",
    severity: "ERROR",
    entity: "IMPORT",
    messageTemplateVi: "Trường bắt buộc đang để trống.",
    remediationHintVi: "Điền giá trị hợp lệ cho ô được đánh dấu trước khi Confirm Import.",
  },
  {
    code: "INVALID_NUMBER",
    severity: "ERROR",
    entity: "IMPORT",
    messageTemplateVi: "Giá trị số không hợp lệ.",
    remediationHintVi: "Nhập số nguyên dương trong giới hạn của template.",
  },
  {
    code: "UNKNOWN_REFERENCE",
    severity: "ERROR",
    entity: "IMPORT",
    messageTemplateVi: "Mã tham chiếu không tồn tại trong master data.",
    remediationHintVi: "Dùng đúng mã lớp, môn, giáo viên hoặc phòng đã được khai báo.",
  },
  {
    code: "DUPLICATE",
    severity: "ERROR",
    entity: "IMPORT",
    messageTemplateVi: "Dòng dữ liệu bị trùng khóa nghiệp vụ.",
    remediationHintVi: "Xóa dòng trùng hoặc điều chỉnh lớp, môn và giáo viên trước khi import.",
  },
  {
    code: "IMPORT_HAS_ERRORS",
    severity: "ERROR",
    entity: "IMPORT",
    messageTemplateVi: "Dữ liệu import vẫn còn lỗi.",
    remediationHintVi: "Sửa toàn bộ lỗi trong Preview rồi upload lại hoặc Confirm Import.",
  },
  {
    code: "PRESOLVE_FAILED",
    severity: "ERROR",
    entity: "JOB",
    messageTemplateVi: "Dữ liệu chắc chắn vô nghiệm trước khi gọi solver.",
    remediationHintVi: "Sửa các conflict trong báo cáo pre-solve rồi chạy lại.",
  },
  {
    code: "UNKNOWN_ALLOWED_SLOT",
    severity: "ERROR",
    entity: "SLOT",
    messageTemplateVi: "Lesson tham chiếu slot không tồn tại.",
    remediationHintVi: "Chọn slot thuộc đúng academic period và cập nhật danh sách allowed slots.",
  },
  {
    code: "UNKNOWN_FIXED_SLOT",
    severity: "ERROR",
    entity: "SLOT",
    messageTemplateVi: "Lesson tham chiếu fixed slot không tồn tại.",
    remediationHintVi: "Bỏ fixed slot không hợp lệ hoặc chọn một slot đang tồn tại.",
  },
  {
    code: "LESSON_SLOT_CAPACITY_EXCEEDED",
    severity: "ERROR",
    entity: "LESSON",
    messageTemplateVi: "Lesson cần nhiều session hơn số slot khả dụng.",
    remediationHintVi: "Mở rộng allowed slots hoặc giảm số tiết của lesson theo scope đã duyệt.",
  },
  {
    code: "TOTAL_SLOT_CAPACITY_EXCEEDED",
    severity: "ERROR",
    entity: "CLASS",
    messageTemplateVi: "Tổng nhu cầu vượt sức chứa class-slot.",
    remediationHintVi: "Kiểm tra số tiết, số slot và phân bổ lesson theo từng lớp.",
  },
  {
    code: "CLASS_SLOT_CAPACITY_EXCEEDED",
    severity: "ERROR",
    entity: "CLASS",
    messageTemplateVi: "Lớp cần nhiều session hơn số slot khả dụng.",
    remediationHintVi: "Mở rộng slot của lớp hoặc điều chỉnh số tiết trong input.",
  },
  {
    code: "TEACHER_SLOT_CAPACITY_EXCEEDED",
    severity: "ERROR",
    entity: "TEACHER",
    messageTemplateVi: "Giáo viên cần nhiều session hơn số slot khả dụng.",
    remediationHintVi: "Mở rộng lịch khả dụng hoặc điều chỉnh phân công giáo viên.",
  },
  {
    code: "FIXED_RESOURCE_CONFLICT",
    severity: "ERROR",
    entity: "JOB",
    messageTemplateVi: "Hai lesson dùng cùng tài nguyên tại một fixed slot.",
    remediationHintVi: "Đổi fixed slot hoặc bỏ cố định một trong các lesson bị trùng.",
  },
  {
    code: "ROOM_CAPABILITY_UNSATISFIED",
    severity: "ERROR",
    entity: "ROOM",
    messageTemplateVi: "Không có phòng đáp ứng capability yêu cầu.",
    remediationHintVi: "Khai báo phòng có đủ capability hoặc điều chỉnh yêu cầu phòng.",
  },
  {
    code: "HARD_AVAILABILITY_CONFLICT",
    severity: "ERROR",
    entity: "TEACHER",
    messageTemplateVi: "Không còn slot sau khi áp dụng ràng buộc availability cứng.",
    remediationHintVi: "Mở rộng slot hoặc điều chỉnh rule availability đã approve.",
  },
  {
    code: "NO_FEASIBLE_ASSIGNMENT",
    severity: "ERROR",
    entity: "JOB",
    messageTemplateVi: "Không tìm được assignment thỏa mãn các hard constraints.",
    remediationHintVi: "Xem các conflict theo lesson/lớp/giáo viên và nới input hoặc rule phù hợp.",
  },
  {
    code: "PREFERENCE_VIOLATED",
    severity: "WARNING",
    entity: "TEACHER",
    messageTemplateVi: "Solver phải vi phạm một preference mềm.",
    remediationHintVi: "Review lịch kết quả hoặc giảm mức ưu tiên của preference nếu cần.",
  },
] as const satisfies readonly ConflictDefinition[];

const catalogByCode = new Map<string, ConflictDefinition>(
  CONFLICT_CATALOG.map((definition) => [definition.code, definition]),
);

export interface ConflictDiagnostic {
  catalogVersion: typeof CONFLICT_CATALOG_VERSION;
  code: string;
  severity: ConflictSeverity;
  entity: ConflictEntity;
  message: string;
  remediationHint: string;
  entityReferences: Record<string, string>;
}

export function getConflictDefinition(code: string): ConflictDefinition | undefined {
  return catalogByCode.get(code);
}

export function createConflictDiagnostic(
  code: string,
  message: string,
  entityReferences: Record<string, string> = {},
  severity?: ConflictSeverity,
): ConflictDiagnostic {
  const definition = getConflictDefinition(code);
  return {
    catalogVersion: CONFLICT_CATALOG_VERSION,
    code,
    severity: severity ?? definition?.severity ?? "ERROR",
    entity: definition?.entity ?? "JOB",
    message,
    remediationHint: definition?.remediationHintVi ?? "Kiểm tra lại dữ liệu và rule liên quan rồi thử lại.",
    entityReferences,
  };
}
