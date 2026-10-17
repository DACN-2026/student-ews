import { requireApiPermission } from "@/lib/auth/authorize";
import { TrainingProgramsService } from "@/lib/services/training-programs";
import { jsonResponse, errorResponse } from "@/lib/utils/api-response";

export async function GET(request: Request) {
  try {
    const access = await requireApiPermission(request);
    if (!access.authorized) return access.response;
    const context = await TrainingProgramsService.getCurrentAcademicContext();
    return jsonResponse(context);
  } catch (err) {
    console.error("Academic context error:", err);
    return errorResponse("Internal server error", "INTERNAL_ERROR", 500);
  }
}
