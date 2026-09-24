import { NextRequest } from "next/server";
import { StudentTrainingProgressService } from "@/lib/services/student-training-progress";
import { jsonResponse, errorResponse, parsePagination } from "@/lib/utils/api-response";
import { requirePermission } from "@/lib/auth/authorize";
import { studentScopeWhere } from "@/lib/auth/data-scope";

export async function GET(req: NextRequest) {
  try {
    let auth = await requirePermission("progress.read", req);
    if (!auth.authorized) {
      auth = await requirePermission("student.read", req);
      if (!auth.authorized) return auth.response;
    }

    const { searchParams } = new URL(req.url);
    const { page, pageSize } = parsePagination(searchParams);

    const search = searchParams.get("q") || searchParams.get("search") || undefined;
    const cohortId = searchParams.get("cohortId") || searchParams.get("cohort_id") || undefined;
    const classStudentId = searchParams.get("classStudentId") || searchParams.get("class_student_id") || undefined;
    const studyProgramId = searchParams.get("studyProgramId") || searchParams.get("programCode") || undefined;
    const statusParam = (searchParams.get("status") || searchParams.get("progressStatus") || "ALL").toUpperCase();
    const progressStatus = statusParam === "ON_TRACK" || statusParam === "BEHIND" ? statusParam : "ALL";

    const scopeWhere = await studentScopeWhere(auth.actor);

    const result = await StudentTrainingProgressService.getDepartmentProgressOverview({
      page,
      pageSize,
      search,
      cohortId,
      classStudentId,
      studyProgramId,
      progressStatus,
      scopeWhere,
    });

    return jsonResponse(result);
  } catch (err) {
    console.error("Get training progress overview error:", err);
    return errorResponse("Internal server error", "INTERNAL_ERROR", 500);
  }
}
