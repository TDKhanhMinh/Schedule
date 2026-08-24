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
});
