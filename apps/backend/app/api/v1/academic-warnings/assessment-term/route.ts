import { NextRequest } from "next/server";
import { requirePermission } from "@/lib/auth/authorize";
import { AcademicWarningsService } from "@/lib/services/academic-warnings";
import { apiErrorResponse } from "@/lib/utils/api-error";
import { jsonResponse } from "@/lib/utils/api-response";

export async function GET(req: NextRequest) {
  try {
    const auth = await requirePermission("academic_warning.calculate", req);
    if (!auth.authorized) return auth.response;
    const resolved = await AcademicWarningsService.resolveRunAssessmentTerm({ runMode: "OFFICIAL" });
    return jsonResponse({
      selectionMode: resolved.selectionMode,
      currentMainTerm: resolved.currentMainTerm ? {
        id: resolved.currentMainTerm.id,
        termCode: resolved.currentMainTerm.sTermCode,
        termName: resolved.currentMainTerm.sTermName,
        academicYear: resolved.currentAcademicYearCode,
      } : null,
      assessmentTerm: {
        id: resolved.assessmentTerm.id,
        termCode: resolved.assessmentTerm.sTermCode,
        termName: resolved.assessmentTerm.sTermName,
        academicYear: resolved.academicYearCode,
      },
      rationale: "PREVIOUS_MAIN_TERM",
    });
  } catch (error) {
    return apiErrorResponse(error, "Failed to resolve the academic warning assessment term");
  }
}
