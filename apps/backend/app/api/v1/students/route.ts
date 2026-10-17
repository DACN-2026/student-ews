import { parseStudentFilter } from "@/lib/services/student-filters";
import { NextRequest } from "next/server";
import { StudentsService } from "@/lib/services/students";
import { jsonResponse, errorResponse, parsePagination } from "@/lib/utils/api-response";
import { requirePermission } from "@/lib/auth/authorize";
import { inaccessibleStudentTargetIndexes, studentScopeWhere } from "@/lib/auth/data-scope";
import { apiErrorResponse, readJsonObject } from "@/lib/utils/api-error";
import { hasPermission } from "@/lib/auth/types";

export async function GET(req: NextRequest) {
  try {
    const auth = await requirePermission("student.read", req);
    if (!auth.authorized) return auth.response;
    const { searchParams } = new URL(req.url);
    const { page, pageSize } = parsePagination(searchParams);
    const canReadWarnings = hasPermission(auth.actor, "academic_warning.read");
    const filter = parseStudentFilter(searchParams, auth.actor);

    const result = await StudentsService.list(
      filter,
      page,
      pageSize,
      await studentScopeWhere(auth.actor),
      canReadWarnings,
    );
    return jsonResponse(result);
  } catch (err) {
    return apiErrorResponse(err, "Không thể tải danh sách sinh viên.");
  }
}

export async function POST(req: NextRequest) {
  try {
    const auth = await requirePermission("student.create", req);
    if (!auth.authorized) return auth.response;
    const body = await readJsonObject<{
      studentId?: string;
      firstName?: string;
      lastName?: string;
      birthDate?: string;
      fullName?: string;
      birthPlace?: string | null;
      gender?: string | null;
      classRoleId?: number;
      permanentResidence?: string | null;
      isInClass?: boolean;
      classStudentId?: string | null;
      studyProgramId?: string | null;
    }>(req);
    if (!body.studentId || !body.firstName || !body.lastName || !body.birthDate) {
      return errorResponse("Missing required student fields", "INVALID_REQUEST", 400);
    }
    if ((await inaccessibleStudentTargetIndexes(auth.actor, [body])).length) {
      return errorResponse("Target class or program is outside data scope", "NOT_FOUND", 404);
    }

    const student = await StudentsService.create({
      studentId: body.studentId,
      firstName: body.firstName,
      lastName: body.lastName,
      birthDate: body.birthDate,
      fullName: body.fullName,
      birthPlace: body.birthPlace,
      gender: body.gender,
      classRoleId: body.classRoleId,
      permanentResidence: body.permanentResidence,
      isInClass: body.isInClass,
      classStudentId: body.classStudentId,
      studyProgramId: body.studyProgramId,
    });
    return jsonResponse(student, 201);
  } catch (err) {
    return apiErrorResponse(err, "Failed to create student");
  }
}
