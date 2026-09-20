import { NextRequest } from "next/server";
import { GraduationEvaluationsService } from "@/lib/services/graduation-evaluations";
import { graduationEvaluationScopeWhere, requireProgressScopePermission } from "@/lib/auth/data-scope";
import { requirePermission } from "@/lib/auth/authorize";
import { apiErrorResponse, readJsonBody } from "@/lib/utils/api-error";
import { errorResponse, jsonResponse, parsePagination } from "@/lib/utils/api-response";
import { recordAudit } from "@/lib/services/audit";

export async function GET(request: NextRequest) {
  try {
    const auth = await requirePermission("graduation.read", request);
    if (!auth.authorized) return auth.response;
    const { searchParams } = new URL(request.url);
    const { page, pageSize } = parsePagination(searchParams);
    return jsonResponse(await GraduationEvaluationsService.listEvaluations({
      cohortId: searchParams.get("cohortId") || undefined,
      trainingProgramId: searchParams.get("trainingProgramId") || undefined,
      termId: searchParams.get("assessmentAcademicTermId") || searchParams.get("termId") || undefined,
      status: searchParams.get("status") || undefined,
    }, page, pageSize, await graduationEvaluationScopeWhere(auth.actor)));
  } catch (error) {
    return apiErrorResponse(error, "Failed to list graduation evaluations");
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await readJsonBody<{
      cohortId?: unknown;
      trainingProgramId?: unknown;
      assessmentAcademicTermId?: unknown;
      specialization?: unknown;
      targetType?: unknown;
    }>(request, 256 * 1024);
    if (
      typeof body.cohortId !== "string" ||
      typeof body.trainingProgramId !== "string" ||
      typeof body.assessmentAcademicTermId !== "string"
    ) {
      return errorResponse("cohortId, trainingProgramId, and assessmentAcademicTermId are required", "INVALID_REQUEST", 400);
    }
    const auth = await requireProgressScopePermission(request, {
      cohortId: body.cohortId,
      trainingProgramId: body.trainingProgramId,
      academicTermId: body.assessmentAcademicTermId,
    }, "graduation.evaluate");
    if (!auth.authorized) return auth.response;
    const evaluation = await GraduationEvaluationsService.createEvaluation({
      cohortId: body.cohortId,
      trainingProgramId: body.trainingProgramId,
      assessmentAcademicTermId: body.assessmentAcademicTermId,
      specialization: typeof body.specialization === "string" ? body.specialization : null,
      targetType: typeof body.targetType === "string" ? body.targetType : undefined,
      evaluatedBy: auth.actor.userId,
    });
    await recordAudit(request, {
      action: "graduation_evaluation.create",
      resourceType: "graduation_evaluation",
      resourceId: evaluation.id,
      details: {
        evaluationCode: evaluation.evaluationCode,
        cohortId: body.cohortId,
        trainingProgramId: body.trainingProgramId,
        assessmentAcademicTermId: body.assessmentAcademicTermId,
        totalStudents: evaluation.totalStudents,
        ruleVersion: evaluation.ruleVersion,
      },
    });
    return jsonResponse(evaluation, 201);
  } catch (error) {
    return apiErrorResponse(error, "Graduation evaluation failed");
  }
}
