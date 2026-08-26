/// <reference types="jest" />

import { BadRequestException } from "@nestjs/common";
import { ApiExceptionFilter } from "./api-exception.filter";

describe("ApiExceptionFilter", () => {
  it("returns the canonical safe envelope and preserves structured details", () => {
    const body = jest.fn();
    const response = { status: jest.fn().mockReturnThis(), json: body };
    const request = {
      requestId: "request-001",
      originalUrl: "/api/v1/imports/preview",
      url: "/imports/preview",
    };
    const host = {
      switchToHttp: () => ({
        getResponse: () => response,
        getRequest: () => request,
      }),
    };

    new ApiExceptionFilter().catch(
      new BadRequestException({
        code: "INVALID_TEMPLATE",
        message: "Workbook không hợp lệ",
        missingColumns: ["Mã lớp"],
      }),
      host as never,
    );

    expect(response.status).toHaveBeenCalledWith(400);
    expect(body).toHaveBeenCalledWith(
      expect.objectContaining({
        statusCode: 400,
        code: "INVALID_TEMPLATE",
        message: "Workbook không hợp lệ",
        requestId: "request-001",
        path: "/api/v1/imports/preview",
        details: expect.objectContaining({ missingColumns: ["Mã lớp"] }),
      }),
    );
  });

  it("maps Multer file-size failures to a safe 400 error", () => {
    const body = jest.fn();
    const response = { status: jest.fn().mockReturnThis(), json: body };
    const host = {
      switchToHttp: () => ({
        getResponse: () => response,
        getRequest: () => ({ requestId: "request-002", originalUrl: "/api/v1/imports/preview" }),
      }),
    };

    new ApiExceptionFilter().catch(Object.assign(new Error("too large"), { code: "LIMIT_FILE_SIZE" }), host as never);

    expect(response.status).toHaveBeenCalledWith(400);
    expect(body).toHaveBeenCalledWith(
      expect.objectContaining({
        statusCode: 400,
        code: "FILE_TOO_LARGE",
        message: "File Excel vượt quá kích thước cho phép.",
      }),
    );
  });
});
