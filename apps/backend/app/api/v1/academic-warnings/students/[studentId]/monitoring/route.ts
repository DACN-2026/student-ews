import { NextRequest } from "next/server";
import { requireStudentPermission } from "@/lib/auth/data-scope";
import { previewCurrentTermMonitoring } from "@/lib/services/early-warning-monitoring";
import { apiErrorResponse } from "@/lib/utils/api-error";
import { jsonResponse } from "@/lib/utils/api-response";

export async function GET(request: NextRequest, { params }: { params: Promise<{ studentId: string }> }) {
  try {
    const { studentId } = await params;
    const auth = await requireStudentPermission(request, studentId, "academic_warning.read");
    if (!auth.authorized) return auth.response;
    return jsonResponse(await previewCurrentTermMonitoring(studentId));
  } catch (error) { return apiErrorResponse(error, "Không thể tải theo dõi trong kỳ."); }
}
