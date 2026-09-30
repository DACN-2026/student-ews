import { NextRequest } from "next/server";
import { AcademicWarningsService } from "@/lib/services/academic-warnings";
import { jsonResponse, errorResponse, parsePagination } from "@/lib/utils/api-response";
import { requireProgressScopePermission, runClassScopes, warningRunScopeWhere } from "@/lib/auth/data-scope";
import { requirePermission } from "@/lib/auth/authorize";
import { apiErrorResponse, readJsonBody } from "@/lib/utils/api-error";

export async function GET(req: NextRequest) {
  try {
    const auth = await requirePermission("academic_warning.read", req);
    if (!auth.authorized) return auth.response;
    const { searchParams } = new URL(req.url);
    const cohortId = searchParams.get("cohortId") || undefined;
    const trainingProgramId = searchParams.get("trainingProgramId") || undefined;
    const termId = searchParams.get("assessmentAcademicTermId") || searchParams.get("termId") || undefined;
    const academicYearId = searchParams.get("assessmentAcademicYearId") || undefined;
    const status = searchParams.get("status") || undefined;
    const { page, pageSize } = parsePagination(searchParams);

    const result = await AcademicWarningsService.listRuns(
      cohortId,
      trainingProgramId,
      termId,
      academicYearId,
      status,
      page,
      pageSize,
      await warningRunScopeWhere(auth.actor),
    );
    result.items = await AcademicWarningsService.scopeRunItems(result.items, await runClassScopes(
      auth.actor,
      result.items.map((item) => ({
        id: item.id,
        academicTermId: item.assessmentAcademicTermId,
        cohortId: item.cohortId,
        trainingProgramId: item.trainingProgramId,
      })),
    ));
    return jsonResponse(result);
  } catch (err) {
    console.error("List warning runs error:", err);
    return errorResponse("Internal server error", "INTERNAL_ERROR", 500);
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await readJsonBody<Record<string, any>>(req, 256 * 1024);
    if (!body.cohortId || !body.trainingProgramId) {
      return errorResponse("cohortId and trainingProgramId are required", "INVALID_REQUEST", 400);
    }
    const permission = await requirePermission("academic_warning.calculate", req);
    if (!permission.authorized) return permission.response;
    const resolvedTerm = await AcademicWarningsService.resolveRunAssessmentTerm({
      assessmentAcademicTermId: body.assessmentAcademicTermId,
      runMode: body.runMode,
    });
    const auth = await requireProgressScopePermission(req, {
      cohortId: body.cohortId,
      trainingProgramId: body.trainingProgramId,
      academicTermId: resolvedTerm.assessmentTerm.id,
    }, "academic_warning.calculate");
    if (!auth.authorized) return auth.response;
    const run = await AcademicWarningsService.createRun({
      cohortId: body.cohortId,
      trainingProgramId: body.trainingProgramId,
      assessmentAcademicTermId: body.assessmentAcademicTermId,
      expectedAssessmentAcademicTermId: resolvedTerm.assessmentTerm.id,
      createdBy: auth.actor.userId,
      runMode: body.runMode,
      executionProfile: body.executionProfile,
      policyId: body.policyId,
    });
    return jsonResponse(run, 201);
  } catch (err) {
    return apiErrorResponse(err, "Warning calculation failed");
  }
}
