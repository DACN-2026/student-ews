import { NextRequest } from "next/server";
import { StudentTrainingProgressService } from "@/lib/services/student-training-progress";
import { jsonResponse, errorResponse } from "@/lib/utils/api-response";
import { requireStudentPermission } from "@/lib/auth/data-scope";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const auth = await requireStudentPermission(req, id, "progress.read");
    if (!auth.authorized) return auth.response;

    const result = await StudentTrainingProgressService.getStudentTrainingProgress(id);
    if (!result) {
      return errorResponse("Không tìm thấy thông tin tiến độ đào tạo của sinh viên", "NOT_FOUND", 404);
    }
    return jsonResponse(result);
  } catch (err) {
    console.error("Get student training progress error:", err);
    return errorResponse("Internal server error", "INTERNAL_ERROR", 500);
  }
}
