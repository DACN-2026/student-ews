import { NextRequest } from "next/server";
import { StudentsService } from "@/lib/services/students";
import { jsonResponse } from "@/lib/utils/api-response";
import { requirePermission } from "@/lib/auth/authorize";
import { studentScopeWhere } from "@/lib/auth/data-scope";
import { parseStudentFilter } from "@/lib/services/student-filters";
import { hasPermission } from "@/lib/auth/types";
import { apiErrorResponse } from "@/lib/utils/api-error";

export async function GET(req: NextRequest) {
  try {
    const auth = await requirePermission("student.export", req);
    if (!auth.authorized) return auth.response;
    const students = await StudentsService.exportAll(await studentScopeWhere(auth.actor), parseStudentFilter(req.nextUrl.searchParams, auth.actor), hasPermission(auth.actor, "academic_warning.read"));
    return jsonResponse(students);
  } catch (err) {
    return apiErrorResponse(err, "Không thể xuất danh sách sinh viên.");
  }
}
