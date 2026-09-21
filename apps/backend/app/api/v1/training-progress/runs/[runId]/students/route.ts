import { NextRequest } from "next/server";
import { TrainingProgressService } from "@/lib/services/training-progress";
import { jsonResponse, errorResponse, parsePagination } from "@/lib/utils/api-response";
import { progressRunClassScope, requireProgressRunPermission } from "@/lib/auth/data-scope";

export async function GET(req: NextRequest, { params }: { params: Promise<{ runId: string }> }) {
  try {
    const { runId } = await params;
    const auth = await requireProgressRunPermission(req, runId, "progress.read");
    if (!auth.authorized) return auth.response;
    const url = new URL(req.url);
    const status = url.searchParams.get("status") || undefined;
    const classId = url.searchParams.get("classId") || undefined;
    const { page, pageSize } = parsePagination(url.searchParams, 1000);
    const result = await TrainingProgressService.listStudentResults(
      runId,
      status,
      classId,
      page,
      pageSize,
      await progressRunClassScope(auth.actor, runId),
    );
    return jsonResponse(result);
  } catch (e: any) {
    return errorResponse(e.message || "Internal server error", "INTERNAL_ERROR", 500);
  }
}
