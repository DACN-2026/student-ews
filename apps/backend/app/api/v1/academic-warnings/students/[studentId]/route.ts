import { NextRequest } from "next/server";
import { requireStudentPermission } from "@/lib/auth/data-scope";
import { AcademicWarningsService } from "@/lib/services/academic-warnings";
import { apiErrorResponse } from "@/lib/utils/api-error";
import { errorResponse, jsonResponse } from "@/lib/utils/api-response";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ studentId: string }> },
) {
  try {
    const { studentId } = await params;
    const auth = await requireStudentPermission(request, studentId, "academic_warning.read");
    if (!auth.authorized) return auth.response;
    const overview = await AcademicWarningsService.getStudentOverview(studentId);
    if (!overview) return errorResponse("Student not found", "NOT_FOUND", 404);
    return jsonResponse(overview);
  } catch (error) {
    return apiErrorResponse(error, "Failed to load student academic warnings");
  }
}
