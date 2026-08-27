export const CONFLICT_CATALOG_VERSION = "CONFLICT-CATALOG-1.0.0" as const;
export const CONFLICT_CHAIN_CONTRACT_VERSION = "CONFLICT-CHAIN-1.0.0" as const;

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
    remediationHintVi: "Chọn đúng trường trước khi tải dữ liệu lên.",
  },
  {
    code: "FILE_REQUIRED",
    severity: "ERROR",
    entity: "IMPORT",
    messageTemplateVi: "Vui lòng chọn tệp Excel để tải lên.",
    remediationHintVi: "Chọn tệp .xlsx hoặc .xlsm theo mẫu đã phát hành.",
  },
  {
    code: "INVALID_FILE_TYPE",
    severity: "ERROR",
    entity: "IMPORT",
    messageTemplateVi: "Định dạng tệp không hợp lệ.",
    remediationHintVi: "Chỉ tải lên tệp Excel .xlsx hoặc .xlsm.",
  },
  {
    code: "INVALID_TEMPLATE",
    severity: "ERROR",
    entity: "IMPORT",
    messageTemplateVi: "Tệp Excel không khớp mẫu bắt buộc.",
    remediationHintVi: "Dùng mẫu MVP-0.1.0 và giữ nguyên tên các cột bắt buộc.",
  },
  {
    code: "INVALID_WORKBOOK",
    severity: "ERROR",
    entity: "IMPORT",
    messageTemplateVi: "Không thể đọc sổ làm việc Excel.",
    remediationHintVi: "Mở lại tệp bằng Excel, lưu thành .xlsx/.xlsm rồi tải lại mẫu chuẩn.",
  },
  {
    code: "INVALID_FILE_SIGNATURE",
    severity: "ERROR",
    entity: "IMPORT",
    messageTemplateVi: "Tệp không có chữ ký Excel hợp lệ.",
    remediationHintVi: "Không đổi đuôi tệp thủ công; xuất lại sổ làm việc từ Excel.",
  },
  {
    code: "WORKBOOK_PARSE_TIMEOUT",
    severity: "ERROR",
    entity: "IMPORT",
    messageTemplateVi: "Không thể đọc tệp Excel trong thời gian cho phép.",
    remediationHintVi: "Giảm kích thước sổ làm việc hoặc tách dữ liệu thành các tệp nhỏ hơn.",
  },
  {
    code: "WORKBOOK_TOO_LARGE",
    severity: "ERROR",
    entity: "IMPORT",
    messageTemplateVi: "Tệp Excel vượt quá kích thước cho phép.",
    remediationHintVi: "Giữ tệp trong giới hạn kích thước của MVP và loại bỏ dữ liệu thừa.",
  },
  {
    code: "FILE_TOO_LARGE",
    severity: "ERROR",
    entity: "IMPORT",
    messageTemplateVi: "Tệp Excel vượt quá kích thước cho phép.",
    remediationHintVi: "Giữ tệp trong giới hạn kích thước của MVP và loại bỏ dữ liệu thừa.",
  },
  {
    code: "WORKBOOK_LIMIT_EXCEEDED",
    severity: "ERROR",
    entity: "IMPORT",
    messageTemplateVi: "Sổ làm việc vượt giới hạn an toàn của MVP.",
    remediationHintVi: "Giảm số trang tính, hàng hoặc cột theo giới hạn trong mẫu.",
  },
  {
    code: "WORKBOOK_UNSAFE_CONTENT",
    severity: "ERROR",
    entity: "IMPORT",
    messageTemplateVi: "Sổ làm việc chứa nội dung không được hỗ trợ.",
    remediationHintVi: "Loại bỏ macro, công thức hoặc liên kết ngoài rồi lưu lại sổ làm việc.",
  },
  {
    code: "REQUIRED",
    severity: "ERROR",
    entity: "IMPORT",
    messageTemplateVi: "Trường bắt buộc đang để trống.",
    remediationHintVi: "Điền giá trị hợp lệ cho ô được đánh dấu trước khi xác nhận nhập dữ liệu.",
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
    messageTemplateVi: "Mã tham chiếu không tồn tại trong dữ liệu danh mục.",
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
    messageTemplateVi: "Dữ liệu nhập vẫn còn lỗi.",
    remediationHintVi: "Sửa toàn bộ lỗi trong phần xem trước rồi tải lại hoặc xác nhận nhập dữ liệu.",
  },
  {
    code: "PRESOLVE_FAILED",
    severity: "ERROR",
    entity: "JOB",
    messageTemplateVi: "Dữ liệu chắc chắn vô nghiệm trước khi gọi bộ tối ưu.",
    remediationHintVi: "Sửa các conflict trong báo cáo pre-solve rồi chạy lại.",
  },
  {
    code: "UNKNOWN_ALLOWED_SLOT",
    severity: "ERROR",
    entity: "SLOT",
    messageTemplateVi: "Yêu cầu tiết học tham chiếu khung tiết không tồn tại.",
    remediationHintVi: "Chọn khung tiết thuộc đúng khung năm học và cập nhật danh sách khung tiết cho phép.",
  },
  {
    code: "UNKNOWN_FIXED_SLOT",
    severity: "ERROR",
    entity: "SLOT",
    messageTemplateVi: "Yêu cầu tiết học tham chiếu khung tiết cố định không tồn tại.",
    remediationHintVi: "Bỏ khung tiết cố định không hợp lệ hoặc chọn một khung tiết đang tồn tại.",
  },
  {
    code: "LESSON_SLOT_CAPACITY_EXCEEDED",
    severity: "ERROR",
    entity: "LESSON",
    messageTemplateVi: "Yêu cầu tiết học cần nhiều buổi hơn số khung tiết khả dụng.",
    remediationHintVi: "Mở rộng các khung tiết cho phép hoặc giảm số tiết theo phạm vi đã duyệt.",
  },
  {
    code: "TOTAL_SLOT_CAPACITY_EXCEEDED",
    severity: "ERROR",
    entity: "CLASS",
    messageTemplateVi: "Tổng nhu cầu vượt sức chứa khung tiết theo lớp.",
    remediationHintVi: "Kiểm tra số tiết, số slot và phân bổ lesson theo từng lớp.",
  },
  {
    code: "CLASS_SLOT_CAPACITY_EXCEEDED",
    severity: "ERROR",
    entity: "CLASS",
    messageTemplateVi: "Lớp cần nhiều buổi hơn số khung tiết khả dụng.",
    remediationHintVi: "Mở rộng khung tiết của lớp hoặc điều chỉnh số tiết trong dữ liệu đầu vào.",
  },
  {
    code: "TEACHER_SLOT_CAPACITY_EXCEEDED",
    severity: "ERROR",
    entity: "TEACHER",
    messageTemplateVi: "Giáo viên cần nhiều buổi hơn số khung tiết khả dụng.",
    remediationHintVi: "Mở rộng lịch khả dụng hoặc điều chỉnh phân công giáo viên.",
  },
  {
    code: "FIXED_RESOURCE_CONFLICT",
    severity: "ERROR",
    entity: "JOB",
    messageTemplateVi: "Hai yêu cầu tiết học dùng cùng tài nguyên tại một khung tiết cố định.",
    remediationHintVi: "Đổi khung tiết cố định hoặc bỏ cố định một trong các yêu cầu tiết học bị trùng.",
  },
  {
    code: "ROOM_CAPABILITY_UNSATISFIED",
    severity: "ERROR",
    entity: "ROOM",
    messageTemplateVi: "Không có phòng đáp ứng năng lực yêu cầu.",
    remediationHintVi: "Khai báo phòng có đủ năng lực hoặc điều chỉnh yêu cầu phòng.",
  },
  {
    code: "ROOM_AVAILABILITY_CONFLICT",
    severity: "ERROR",
    entity: "ROOM",
    messageTemplateVi: "Không còn phòng khả dụng cho yêu cầu tiết học tại các khung tiết được phép.",
    remediationHintVi: "Mở rộng lịch phòng hoặc chọn khung tiết/phòng khác cho yêu cầu tiết học.",
  },
  {
    code: "CLASS_AVAILABILITY_CONFLICT",
    severity: "ERROR",
    entity: "CLASS",
    messageTemplateVi: "Lớp bị chặn tại các khung tiết mà yêu cầu tiết học đang cần.",
    remediationHintVi: "Mở rộng lịch lớp hoặc điều chỉnh khung tiết cố định/cho phép của yêu cầu tiết học.",
  },
  {
    code: "HARD_AVAILABILITY_CONFLICT",
    severity: "ERROR",
    entity: "TEACHER",
    messageTemplateVi: "Không còn khung tiết sau khi áp dụng ràng buộc sẵn sàng cứng.",
    remediationHintVi: "Mở rộng khung tiết hoặc điều chỉnh quy tắc sẵn sàng đã phê duyệt.",
  },
  {
    code: "NO_FEASIBLE_ASSIGNMENT",
    severity: "ERROR",
    entity: "JOB",
    messageTemplateVi: "Không tìm được phân công thỏa mãn các ràng buộc cứng.",
    remediationHintVi:
      "Xem các xung đột theo yêu cầu tiết học/lớp/giáo viên và nới dữ liệu đầu vào hoặc quy tắc phù hợp.",
  },
  {
    code: "PREFERENCE_VIOLATED",
    severity: "WARNING",
    entity: "TEACHER",
    messageTemplateVi: "Bộ tối ưu phải vi phạm một ưu tiên mềm.",
    remediationHintVi: "Rà soát lịch kết quả hoặc giảm mức ưu tiên nếu cần.",
  },
  {
    code: "TEACHER_SUBJECT_GRADE_NOT_ALLOWED",
    severity: "ERROR",
    entity: "TEACHER",
    messageTemplateVi: "Giáo viên chưa được phân công dạy môn và khối của yêu cầu tiết học.",
    remediationHintVi: "Bổ sung phân công chuyên môn cho giáo viên, môn và khối tương ứng hoặc đổi dữ liệu đầu vào.",
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
  conflictChain?: ConflictChain;
}

export type ConflictChainNodeType = "CONSTRAINT" | "ENTITY" | "OUTCOME";

export interface ConflictChainNode {
  nodeId: string;
  type: ConflictChainNodeType;
  label: string;
  references: Record<string, string>;
}

export interface ConflictChain {
  contractVersion: typeof CONFLICT_CHAIN_CONTRACT_VERSION;
  chainId: string;
  rootCode: string;
  nodes: ConflictChainNode[];
  edges: Array<{ from: string; to: string; relation: "CAUSES" | "RESULTS_IN" }>;
}

export function createConflictChain(
  code: string,
  message: string,
  entityReferences: Record<string, string> = {},
  severity: ConflictSeverity = "ERROR",
): ConflictChain {
  const referenceEntries = Object.entries(entityReferences).sort(([left], [right]) => left.localeCompare(right));
  const chainId = `chain:${code}:${referenceEntries.map(([key, value]) => `${key}=${value}`).join("|") || "root"}`;
  const rootId = `${chainId}:constraint`;
  const outcomeId = `${chainId}:outcome`;
  const entityNodes = referenceEntries.map(([key, value]) => ({
    nodeId: `${chainId}:entity:${key}:${value}`,
    type: "ENTITY" as const,
    label: `${key}=${value}`,
    references: { [key]: value },
  }));
  return {
    contractVersion: CONFLICT_CHAIN_CONTRACT_VERSION,
    chainId,
    rootCode: code,
    nodes: [
      { nodeId: rootId, type: "CONSTRAINT", label: message, references: { code } },
      ...entityNodes,
      {
        nodeId: outcomeId,
        type: "OUTCOME",
        label: severity === "ERROR" ? "Không thể tạo lịch hợp lệ." : "Cần review kết quả.",
        references: { outcome: severity === "ERROR" ? "INFEASIBLE" : "REVIEW_REQUIRED" },
      },
    ],
    edges: [
      ...entityNodes.map((node) => ({ from: node.nodeId, to: rootId, relation: "CAUSES" as const })),
      { from: rootId, to: outcomeId, relation: "RESULTS_IN" },
    ],
  };
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
  const resolvedSeverity = severity ?? definition?.severity ?? "ERROR";
  return {
    catalogVersion: CONFLICT_CATALOG_VERSION,
    code,
    severity: resolvedSeverity,
    entity: definition?.entity ?? "JOB",
    message,
    remediationHint: definition?.remediationHintVi ?? "Kiểm tra lại dữ liệu và rule liên quan rồi thử lại.",
    entityReferences,
    conflictChain: createConflictChain(code, message, entityReferences, resolvedSeverity),
  };
}
