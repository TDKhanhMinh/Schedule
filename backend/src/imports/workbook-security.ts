import { BadRequestException } from "@nestjs/common";
import ExcelJS from "exceljs";
import JSZip from "jszip";

export const MAX_WORKBOOK_SIZE_BYTES = 5 * 1024 * 1024;
export const MAX_WORKBOOK_UNCOMPRESSED_BYTES = 50 * 1024 * 1024;
export const MAX_WORKBOOK_SHEETS = 10;
export const MAX_WORKBOOK_ROWS = 10_000;
export const MAX_WORKBOOK_COLUMNS = 50;
export const MAX_WORKBOOK_PARSE_TIMEOUT_MS = 5_000;

type ZipEntry = JSZip.JSZipObject & {
  _data?: { uncompressedSize?: number };
};

export function assertExcelExtension(filename: string) {
  if (!/\.(xlsx|xlsm)$/i.test(filename)) {
    throw new BadRequestException({
      code: "INVALID_FILE_TYPE",
      message: "Định dạng tệp không hợp lệ. Chỉ hỗ trợ tệp Excel .xlsx hoặc .xlsm.",
    });
  }
}

export async function preflightWorkbook(buffer: Uint8Array) {
  if (buffer.length > MAX_WORKBOOK_SIZE_BYTES) {
    throw new BadRequestException({
      code: "WORKBOOK_TOO_LARGE",
      message: "Tệp Excel vượt quá giới hạn kích thước cho phép.",
      maxBytes: MAX_WORKBOOK_SIZE_BYTES,
    });
  }
  if (!hasZipSignature(buffer)) {
    throw new BadRequestException({
      code: "INVALID_FILE_SIGNATURE",
      message: "Tệp không có chữ ký Excel hợp lệ.",
    });
  }

  let zip: JSZip;
  try {
    zip = await JSZip.loadAsync(buffer);
  } catch {
    throw new BadRequestException({
      code: "INVALID_WORKBOOK",
      message: "Tệp Excel bị hỏng hoặc không phải sổ làm việc hợp lệ.",
    });
  }

  const entries = Object.values(zip.files) as ZipEntry[];
  const uncompressedBytes = entries.reduce((total, entry) => total + (entry._data?.uncompressedSize ?? 0), 0);
  if (uncompressedBytes > MAX_WORKBOOK_UNCOMPRESSED_BYTES) {
    throw new BadRequestException({
      code: "WORKBOOK_UNSAFE_CONTENT",
      message: "Sổ làm việc sau giải nén vượt quá giới hạn an toàn.",
      maxUncompressedBytes: MAX_WORKBOOK_UNCOMPRESSED_BYTES,
    });
  }

  const entryNames = entries.map((entry) => entry.name);
  if (entryNames.some((name) => /(^|\/)(externalLinks?|vbaProject\.bin)(\/|$)/i.test(name))) {
    throw new BadRequestException({
      code: "WORKBOOK_UNSAFE_CONTENT",
      message: "Sổ làm việc chứa macro hoặc liên kết ngoài không được hỗ trợ.",
    });
  }

  const workbookEntry = entries.find((entry) => entry.name === "xl/workbook.xml");
  if (!workbookEntry) {
    throw new BadRequestException({
      code: "INVALID_WORKBOOK",
      message: "Sổ làm việc thiếu cấu trúc Excel bắt buộc.",
    });
  }

  const workbookXml = await workbookEntry.async("string");
  const sheetCount = countMatches(workbookXml, /<(?:x:)?sheet(?:\s|>)/g);
  if (sheetCount === 0) {
    throw new BadRequestException({
      code: "INVALID_TEMPLATE",
      message: "Tệp Excel không có trang tính dữ liệu.",
    });
  }
  if (sheetCount > MAX_WORKBOOK_SHEETS) {
    throw new BadRequestException({
      code: "WORKBOOK_LIMIT_EXCEEDED",
      message: "Sổ làm việc vượt quá số trang tính cho phép.",
      limit: "sheets",
      max: MAX_WORKBOOK_SHEETS,
    });
  }

  for (const entry of entries.filter((item) => /^xl\/worksheets\/sheet\d+\.xml$/i.test(item.name))) {
    const xml = await entry.async("string");
    if (/<(?:x:)?f(?:\s|>)/i.test(xml) || /<(?:x:)?hyperlink(?:\s|>)/i.test(xml)) {
      throw new BadRequestException({
        code: "WORKBOOK_UNSAFE_CONTENT",
        message: "Sổ làm việc chứa công thức hoặc liên kết không được phép.",
      });
    }

    const rowCount = countMatches(xml, /<(?:x:)?row(?:\s|>)/g);
    if (rowCount > MAX_WORKBOOK_ROWS) {
      throw new BadRequestException({
        code: "WORKBOOK_LIMIT_EXCEEDED",
        message: "Sổ làm việc vượt quá số hàng cho phép.",
        limit: "rows",
        max: MAX_WORKBOOK_ROWS,
      });
    }

    let maxColumn = 0;
    for (const match of xml.matchAll(/<(?:x:)?c\b[^>]*\br="([A-Z]+)\d+"/gi)) {
      maxColumn = Math.max(maxColumn, columnNumber(match[1]));
    }
    if (maxColumn > MAX_WORKBOOK_COLUMNS) {
      throw new BadRequestException({
        code: "WORKBOOK_LIMIT_EXCEEDED",
        message: "Sổ làm việc vượt quá số cột cho phép.",
        limit: "columns",
        max: MAX_WORKBOOK_COLUMNS,
      });
    }
  }

  for (const entry of entries.filter((item) => /\.rels$/i.test(item.name))) {
    const xml = await entry.async("string");
    if (/relationships\/hyperlink|TargetMode\s*=\s*["']External["']/i.test(xml)) {
      throw new BadRequestException({
        code: "WORKBOOK_UNSAFE_CONTENT",
        message: "Sổ làm việc chứa liên kết ngoài không được phép.",
      });
    }
  }
}

export function assertWorkbookLimits(workbook: ExcelJS.Workbook) {
  if (workbook.worksheets.length > MAX_WORKBOOK_SHEETS) {
    throw new BadRequestException({
      code: "WORKBOOK_LIMIT_EXCEEDED",
      message: "Sổ làm việc vượt quá số trang tính cho phép.",
      limit: "sheets",
      max: MAX_WORKBOOK_SHEETS,
    });
  }

  for (const worksheet of workbook.worksheets) {
    if (worksheet.rowCount > MAX_WORKBOOK_ROWS) {
      throw new BadRequestException({
        code: "WORKBOOK_LIMIT_EXCEEDED",
        message: "Sổ làm việc vượt quá số hàng cho phép.",
        limit: "rows",
        max: MAX_WORKBOOK_ROWS,
      });
    }
    if (worksheet.columnCount > MAX_WORKBOOK_COLUMNS) {
      throw new BadRequestException({
        code: "WORKBOOK_LIMIT_EXCEEDED",
        message: "Sổ làm việc vượt quá số cột cho phép.",
        limit: "columns",
        max: MAX_WORKBOOK_COLUMNS,
      });
    }
  }
}

export function assertNoDangerousCells(workbook: ExcelJS.Workbook) {
  for (const worksheet of workbook.worksheets) {
    worksheet.eachRow({ includeEmpty: false }, (row) => {
      row.eachCell({ includeEmpty: false }, (cell) => {
        const value = cell.value;
        const hasFormula =
          cell.type === ExcelJS.ValueType.Formula ||
          (typeof value === "object" && value !== null && ("formula" in value || "sharedFormula" in value));
        if (hasFormula || cell.hyperlink) {
          throw new BadRequestException({
            code: "WORKBOOK_UNSAFE_CONTENT",
            message: "Sổ làm việc chứa công thức hoặc liên kết không được phép.",
            sheet: worksheet.name,
            cell: cell.address,
          });
        }
      });
    });
  }
}

function hasZipSignature(buffer: Uint8Array) {
  return (
    buffer.length >= 4 &&
    buffer[0] === 0x50 &&
    buffer[1] === 0x4b &&
    [0x03, 0x05, 0x07].includes(buffer[2]) &&
    [0x04, 0x06, 0x08].includes(buffer[3])
  );
}

function countMatches(value: string, pattern: RegExp) {
  return value.match(pattern)?.length ?? 0;
}

function columnNumber(column: string) {
  return [...column.toUpperCase()].reduce((total, character) => total * 26 + character.charCodeAt(0) - 64, 0);
}
