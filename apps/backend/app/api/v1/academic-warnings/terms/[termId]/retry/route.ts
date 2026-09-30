import { NextRequest } from "next/server";
import { requirePermission } from "@/lib/auth/authorize";
import { AcademicWarningAutomationService } from "@/lib/services/academic-warning-automation";
import { apiErrorResponse } from "@/lib/utils/api-error";
import { jsonResponse } from "@/lib/utils/api-response";

interface Params { params: Promise<{ termId: string }> }

export async function POST(request: NextRequest, { params }: Params) {
  try {
    const auth = await requirePermission("academic_warning.calculate", request);
    if (!auth.authorized) return auth.response;
    const { termId } = await params;
    const body = await request.json().catch(() => ({})) as { confirmGradesFinalized?: boolean };
    const facultyCode = await AcademicWarningAutomationService.actorFacultyCode(auth.actor);
    const result = body.confirmGradesFinalized === true
      ? await AcademicWarningAutomationService.finalizeGradesAndRun({
          termId,
          actorId: auth.actor.userId,
          facultyCode,
        })
      : await AcademicWarningAutomationService.runForFinalizedMainTerm({
          termId,
          actorId: auth.actor.userId,
          facultyCode,
        });
    return jsonResponse(result);
  } catch (error) {
    return apiErrorResponse(error, "Failed to retry academic warning evaluation");
  }
}
