import { NextRequest } from "next/server";
import { TrainingProgramsService } from "@/lib/services/training-programs";
import { jsonResponse, errorResponse } from "@/lib/utils/api-response";
import { apiErrorResponse, readJsonBody } from "@/lib/utils/api-error";
import { requirePermission } from "@/lib/auth/authorize";
import { AcademicWarningAutomationService } from "@/lib/services/academic-warning-automation";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const terms = await TrainingProgramsService.listTerms(id);
    return jsonResponse({ items: terms, total: terms.length });
  } catch (err) {
    console.error("List terms error:", err);
    return errorResponse("Internal server error", "INTERNAL_ERROR", 500);
  }
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const auth = await requirePermission("academic_term.manage", req);
    if (!auth.authorized) return auth.response;
    const { id } = await params;
    const body = await readJsonBody<{
      termCode?: string;
      termName?: string;
      termOrder?: number;
      isSummer?: boolean;
      startDate?: string;
      endDate?: string;
      status?: string;
      isCurrent?: boolean;
    }>(req);
    if (!body.termCode || !body.termName || !Number.isInteger(body.termOrder) || Number(body.termOrder) < 1) {
      return errorResponse("termCode, termName and a valid termOrder are required", "INVALID_REQUEST", 400);
    }
    const created = await TrainingProgramsService.createTerm(id, {
      termCode: body.termCode,
      termName: body.termName,
      termOrder: Number(body.termOrder),
      isSummer: body.isSummer,
      startDate: body.startDate,
      endDate: body.endDate,
      status: body.status,
      isCurrent: body.isCurrent,
    });
    if (body.isCurrent && !body.isSummer) {
      try {
        await AcademicWarningAutomationService.reconcilePastTermsWithGrades({
          actorId: auth.actor.userId,
          facultyCode: null,
        });
      } catch (error) {
        console.error("Automatic warning reconciliation after term transition failed:", error);
      }
    }
    return jsonResponse(created, 201);
  } catch (error) {
    return apiErrorResponse(error, "Failed to create academic term");
  }
}
