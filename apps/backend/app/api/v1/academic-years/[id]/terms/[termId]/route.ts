import { NextRequest } from "next/server";
import { TrainingProgramsService } from "@/lib/services/training-programs";
import { apiErrorResponse, readJsonBody } from "@/lib/utils/api-error";
import { errorResponse, jsonResponse } from "@/lib/utils/api-response";
import { recordAudit } from "@/lib/services/audit";
import { requirePermission } from "@/lib/auth/authorize";
import { AcademicWarningAutomationService } from "@/lib/services/academic-warning-automation";

interface Params { params: Promise<{ id: string; termId: string }> }

export async function GET(_request: NextRequest, { params }: Params) {
  try {
    const { id, termId } = await params;
    const term = await TrainingProgramsService.getTermById(id, termId);
    if (!term) return errorResponse("Academic term not found", "NOT_FOUND", 404);
    return jsonResponse(term);
  } catch (error) {
    return apiErrorResponse(error, "Failed to load academic term");
  }
}

export async function PATCH(request: NextRequest, { params }: Params) {
  try {
    const auth = await requirePermission("academic_term.manage", request);
    if (!auth.authorized) return auth.response;
    const { id, termId } = await params;
    const body = await readJsonBody<{
      termCode?: string;
      termName?: string;
      termOrder?: number;
      isSummer?: boolean;
      startDate?: string | null;
      endDate?: string | null;
      status?: string;
      isCurrent?: boolean;
    }>(request);
    if (body.termCode !== undefined && !body.termCode.trim()) {
      return errorResponse("termCode cannot be empty", "INVALID_REQUEST", 400);
    }
    if (body.termName !== undefined && !body.termName.trim()) {
      return errorResponse("termName cannot be empty", "INVALID_REQUEST", 400);
    }
    if (body.termOrder !== undefined && (!Number.isInteger(body.termOrder) || body.termOrder < 1)) {
      return errorResponse("termOrder must be a positive integer", "INVALID_REQUEST", 400);
    }
    const updated = await TrainingProgramsService.updateTerm(id, termId, body);
    if (body.isCurrent && !updated.isSummer) {
      try {
        await AcademicWarningAutomationService.reconcilePastTermsWithGrades({
          actorId: auth.actor.userId,
          facultyCode: null,
        });
      } catch (error) {
        console.error("Automatic warning reconciliation after term transition failed:", error);
      }
    }
    return jsonResponse(updated);
  } catch (error) {
    return apiErrorResponse(error, "Failed to update academic term");
  }
}

export async function DELETE(request: NextRequest, { params }: Params) {
  try {
    const { id, termId } = await params;
    await TrainingProgramsService.removeTerm(id, termId);
    await recordAudit(request, { action: "academic_term.delete", resourceType: "AcademicTerm", resourceId: termId, details: { academicYearId: id } });
    return new Response(null, { status: 204 });
  } catch (error) {
    return apiErrorResponse(error, "Failed to delete academic term");
  }
}
