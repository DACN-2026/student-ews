import { NextRequest } from "next/server";
import { TrainingProgressService } from "@/lib/services/training-progress";
import { jsonResponse, errorResponse } from "@/lib/utils/api-response";
import {
  progressRunClassScope,
  requireProgressRunPermission,
  requireStudentPermission,
} from "@/lib/auth/data-scope";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ runId: string; studentId: string }> }
) {
  try {
    const { runId, studentId } = await params;
    const auth = await requireProgressRunPermission(req, runId, "progress.read");
    if (!auth.authorized) return auth.response;
    const studentAuth = await requireStudentPermission(req, studentId, "progress.read");
    if (!studentAuth.authorized) return studentAuth.response;

    const detail = await TrainingProgressService.getStudentCourseDetail(
      runId,
      studentId,
      await progressRunClassScope(auth.actor, runId),
    );
    if (!detail) return errorResponse("Không tìm thấy kết quả sinh viên này.", "NOT_FOUND", 404);

    return jsonResponse(detail);
  } catch (e: any) {
    return errorResponse(e.message || "Internal server error", "INTERNAL_ERROR", 500);
  }
}
