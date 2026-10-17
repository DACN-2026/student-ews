import { NextRequest } from "next/server";
import { TrainingProgressService } from "@/lib/services/training-progress";
import { jsonResponse, errorResponse, parsePagination } from "@/lib/utils/api-response";
import { progressPlanScopeWhere, requireProgressScopePermission } from "@/lib/auth/data-scope";
import { requirePermission } from "@/lib/auth/authorize";
import { apiErrorResponse, readJsonObject } from "@/lib/utils/api-error";

export async function GET(req: NextRequest) {
  try {
    const auth = await requirePermission("progress.read", req);
    if (!auth.authorized) return auth.response;
    const { searchParams } = new URL(req.url);
    const cohortId = searchParams.get("cohortId") || undefined;
    const trainingProgramId = searchParams.get("trainingProgramId") || undefined;
    const termId = searchParams.get("academicTermId") || searchParams.get("termId") || undefined;
    const activeOnly = searchParams.get("activeOnly") === "true";
    const { page, pageSize } = parsePagination(searchParams);

    const result = await TrainingProgressService.listPlans(
      cohortId,
      trainingProgramId,
      termId,
      activeOnly,
      page,
      pageSize,
      await progressPlanScopeWhere(auth.actor),
      searchParams.get("includeArchived") === "true",
    );
    return jsonResponse(result);
  } catch (err) {
    console.error("List progress plans error:", err);
    return errorResponse("Internal server error", "INTERNAL_ERROR", 500);
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await readJsonObject<Record<string, any>>(req, 2 * 1024 * 1024);
    if (
      typeof body.cohortId !== "string" ||
      typeof body.academicTermId !== "string" ||
      !Number.isInteger(Number(body.curriculumSemesterNo)) ||
      Number(body.curriculumSemesterNo) < 1
    ) {
      return errorResponse("Missing required plan fields", "INVALID_REQUEST", 400);
    }

    if (!body.trainingProgramId) {
      return errorResponse("trainingProgramId is required", "INVALID_REQUEST", 400);
    }
    const auth = await requireProgressScopePermission(req, {
      cohortId: body.cohortId,
      trainingProgramId: body.trainingProgramId,
      academicTermId: body.academicTermId,
    }, "progress.plan.manage");
    if (!auth.authorized) return auth.response;

    const plan = await TrainingProgressService.createPlan({
      cohortId: body.cohortId,
      trainingProgramId: body.trainingProgramId,
      academicTermId: body.academicTermId,
      curriculumSemesterNo: Number(body.curriculumSemesterNo),
      requiredElectiveCredits: body.requiredElectiveCredits === undefined ? undefined : Number(body.requiredElectiveCredits),
      isProgramFinal: body.isProgramFinal,
      courseIds: body.courseIds,
    });
    return jsonResponse(plan, 201);
  } catch (err) {
    return apiErrorResponse(err, "Failed to create progress plan");
  }
}
