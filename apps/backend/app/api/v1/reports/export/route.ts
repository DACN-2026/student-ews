import { NextRequest } from "next/server";
import { requirePermission } from "@/lib/auth/authorize";
import { studentScopeWhere } from "@/lib/auth/data-scope";
import { ExportService, EXPORT_FORMATS, EXPORT_TYPES, parseExportParameter, type ExportFormat, type ExportType } from "@/lib/services/export";
import { prisma } from "@/lib/prisma";
import { apiErrorResponse, ApiError } from "@/lib/utils/api-error";

export const runtime = "nodejs";

function optional(searchParams: URLSearchParams, name: string) {
  return searchParams.get(name)?.trim() || undefined;
}

export async function GET(req: NextRequest) {
  try {
    const auth = await requirePermission("report.export", req);
    if (!auth.authorized) return auth.response;
    let format: ExportFormat;
    let type: ExportType;
    try {
      format = parseExportParameter(req.nextUrl.searchParams.get("format"), EXPORT_FORMATS, "format");
      type = parseExportParameter(req.nextUrl.searchParams.get("type"), EXPORT_TYPES, "type");
    } catch (error) {
      throw new ApiError(error instanceof Error ? error.message : "Invalid export parameter", "INVALID_EXPORT_PARAMETER", 400);
    }
    if (["warnings", "support", "student-profile"].includes(type)) {
      const warningAuth = await requirePermission("academic_warning.read", req);
      if (!warningAuth.authorized) return warningAuth.response;
    }
    if (format === "pdf" && !["warnings", "student-profile"].includes(type)) {
      throw new ApiError("PDF is supported for warnings and student-profile", "UNSUPPORTED_EXPORT_COMBINATION", 400);
    }
    const filters = {
      academicTermId: optional(req.nextUrl.searchParams, "academicTermId"),
      academicYearId: optional(req.nextUrl.searchParams, "academicYearId"),
      classCode: optional(req.nextUrl.searchParams, "classCode"),
      cohortId: optional(req.nextUrl.searchParams, "cohortId"),
      programCode: optional(req.nextUrl.searchParams, "programCode"),
      severity: optional(req.nextUrl.searchParams, "severity"),
      studentId: optional(req.nextUrl.searchParams, "studentId"),
    };
    if (filters.severity && !["high", "medium"].includes(filters.severity)) {
      throw new ApiError("severity must be high or medium", "INVALID_FILTER", 400);
    }
    if (type === "student-profile" && !filters.studentId) {
      throw new ApiError("studentId is required for student-profile", "INVALID_FILTER", 400);
    }
    const artifact = await ExportService.create(format, type, filters, await studentScopeWhere(auth.actor));
    if (!artifact) throw new ApiError("Export data was not found", "NOT_FOUND", 404);

    await prisma.auditLog.create({
      data: {
        actorId: auth.actor.userId,
        action: "report.export",
        resourceType: "Report",
        details: { format, type, filters, rowCount: artifact.rowCount },
      },
    });

    return new Response(new Uint8Array(artifact.body), {
      status: 200,
      headers: {
        "content-type": artifact.contentType,
        "content-length": String(artifact.body.byteLength),
        "content-disposition": `attachment; filename="${artifact.fileName}"; filename*=UTF-8''${encodeURIComponent(artifact.fileName)}`,
        "cache-control": "private, no-store",
        "x-content-type-options": "nosniff",
      },
    });
  } catch (error) {
    return apiErrorResponse(error, "Failed to export report");
  }
}
