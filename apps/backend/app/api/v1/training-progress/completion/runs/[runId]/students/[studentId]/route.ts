import { NextRequest } from "next/server";
import { TrainingProgressService } from "@/lib/services/training-progress";
import { apiErrorResponse } from "@/lib/utils/api-error";
import { errorResponse, jsonResponse } from "@/lib/utils/api-response";
import {
  completionRunClassScope,
  requireCompletionRunPermission,
  requireStudentPermission,
} from "@/lib/auth/data-scope";

interface Params {
  params: Promise<{ runId: string; studentId: string }>;
}

export async function GET(request: NextRequest, { params }: Params) {
  try {
    const { runId, studentId } = await params;
    const runAuth = await requireCompletionRunPermission(request, runId, "progress.read");
    if (!runAuth.authorized) return runAuth.response;
    const studentAuth = await requireStudentPermission(request, studentId, "progress.read");
    if (!studentAuth.authorized) return studentAuth.response;
    const result = await TrainingProgressService.getCompletionStudentDetail(
      runId,
      studentId,
      await completionRunClassScope(runAuth.actor, runId),
    );
    if (!result) return errorResponse("Completion student result not found", "NOT_FOUND", 404);
    return jsonResponse(result);
  } catch (error) {
    return apiErrorResponse(error, "Failed to load completion student result");
  }
}
