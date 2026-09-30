import { NextRequest } from "next/server";
import { requirePermission } from "@/lib/auth/authorize";
import { AcademicWarningAutomationService } from "@/lib/services/academic-warning-automation";
import { apiErrorResponse } from "@/lib/utils/api-error";
import { jsonResponse } from "@/lib/utils/api-response";

interface Params { params: Promise<{ id: string; termId: string }> }

export async function POST(request: NextRequest, { params }: Params) {
  try {
    const auth = await requirePermission("academic_term.manage", request);
    if (!auth.authorized) return auth.response;
    const { id, termId } = await params;
    const result = await AcademicWarningAutomationService.finalizeGradesAndRun({
      termId,
      academicYearId: id,
      actorId: auth.actor.userId,
    });
    return jsonResponse(result);
  } catch (error) {
    return apiErrorResponse(error, "Failed to finalize semester grades and run academic warning evaluation");
  }
}
