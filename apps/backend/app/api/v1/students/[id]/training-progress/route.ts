import { NextRequest } from "next/server";
import { StudentTrainingProgressService } from "@/lib/services/student-training-progress";
import { jsonResponse, errorResponse } from "@/lib/utils/api-response";
import { requireStudentPermission } from "@/lib/auth/data-scope";
import { prisma } from "@/lib/prisma";
import { ApiError, apiErrorResponse } from "@/lib/utils/api-error";
import { isUUID, studentIdWhere } from "@/lib/utils/is-uuid";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const auth = await requireStudentPermission(req, id, "progress.read");
    if (!auth.authorized) return auth.response;

    const warningResultId = req.nextUrl.searchParams.get("warningResultId");
    let assessment: Parameters<typeof StudentTrainingProgressService.getStudentTrainingProgress>[2];
    if (warningResultId !== null) {
      if (!isUUID(warningResultId)) throw new ApiError("Mã kết quả cảnh báo không hợp lệ.", "INVALID_REQUEST", 400);
      const warningAuth = await requireStudentPermission(req, id, "academic_warning.read");
      if (!warningAuth.authorized) return warningAuth.response;
      const student = await prisma.student.findFirstOrThrow({ where: { ...studentIdWhere(id), deletedAt: null }, select: { id: true } });
      const result = await prisma.academicWarningStudentResult.findFirst({ where: { id: warningResultId, studentId: student.id } });
      if (!result) throw new ApiError("Không tìm thấy kết quả cảnh báo của sinh viên.", "NOT_FOUND", 404);
      const run = await prisma.academicWarningRun.findFirst({ where: { id: result.runId, status: "completed" } });
      if (!run) throw new ApiError("Đợt cảnh báo chưa hoàn tất.", "NOT_FOUND", 404);
      const term = await prisma.academicTerm.findUniqueOrThrow({ where: { id: run.assessmentAcademicTermId } });
      const year = await prisma.academicYear.findUniqueOrThrow({ where: { id: term.academicYearId } });
      assessment = { academicYear: year.sYearCode, termCode: term.sTermCode, termOrder: term.sTermOrder,
        boundary: "END_OF_TERM", programCode: result.sProgramCode || undefined, cohortId: run.cohortId };
    }
    const result = await StudentTrainingProgressService.getStudentTrainingProgress(id, undefined, assessment);
    if (!result) {
      return errorResponse("Không tìm thấy thông tin tiến độ đào tạo của sinh viên", "NOT_FOUND", 404);
    }
    return jsonResponse(result);
  } catch (err) {
    return apiErrorResponse(err, "Get student training progress error");
  }
}
