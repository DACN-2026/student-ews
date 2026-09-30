import { NextRequest } from "next/server";
import { requirePermission } from "@/lib/auth/authorize";
import { AcademicWarningAutomationService } from "@/lib/services/academic-warning-automation";
import { apiErrorResponse } from "@/lib/utils/api-error";
import { jsonResponse } from "@/lib/utils/api-response";

export async function POST(request: NextRequest) {
  try {
    const auth = await requirePermission("academic_warning.calculate", request);
    if (!auth.authorized) return auth.response;
    const facultyCode = await AcademicWarningAutomationService.actorFacultyCode(auth.actor);
    return jsonResponse(await AcademicWarningAutomationService.reconcilePastTermsWithGrades({
      actorId: auth.actor.userId,
      facultyCode,
    }));
  } catch (error) {
    return apiErrorResponse(error, "Failed to reconcile academic warning history");
  }
}
