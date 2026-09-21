import { NextRequest } from "next/server";
import { StudentsService } from "@/lib/services/students";
import { jsonResponse, errorResponse, parsePagination } from "@/lib/utils/api-response";
import { requirePermission } from "@/lib/auth/authorize";
import { inaccessibleStudentTargetIndexes, studentScopeWhere } from "@/lib/auth/data-scope";
import { apiErrorResponse, readJsonBody } from "@/lib/utils/api-error";

export async function GET(req: NextRequest) {
  try {
    const auth = await requirePermission("student.read", req);
    if (!auth.authorized) return auth.response;
    const { searchParams } = new URL(req.url);
    const { page, pageSize } = parsePagination(searchParams);
    const classRoleValue = searchParams.get("class_role_id") ?? searchParams.get("classRoleId");
    const inClassValue = searchParams.get("is_in_class") ?? searchParams.get("isInClass");
    if (classRoleValue !== null && (!/^\d+$/.test(classRoleValue) || Number(classRoleValue) > 32767)) {
      return errorResponse("class_role_id must be a non-negative integer", "INVALID_REQUEST", 400);
    }
    if (inClassValue !== null && inClassValue !== "true" && inClassValue !== "false") {
      return errorResponse("is_in_class must be true or false", "INVALID_REQUEST", 400);
    }

    const filter = {
      search: searchParams.get("q") || searchParams.get("search") || undefined,
      cohortId: searchParams.get("cohortId") || searchParams.get("cohort_id") || undefined,
      classStudentId: searchParams.get("class_student_id") || searchParams.get("classStudentId") || undefined,
      gender: searchParams.get("gender") || undefined,
      studyProgramId: searchParams.get("studyProgramId") || undefined,
      classRoleId: classRoleValue === null ? undefined : Number(classRoleValue),
      isInClass: inClassValue === null ? undefined : inClassValue === "true",
      warningLevel: searchParams.get("warningLevel") || undefined,
    };

    const result = await StudentsService.list(filter, page, pageSize, await studentScopeWhere(auth.actor));
    return jsonResponse(result);
  } catch (err) {
    console.error("List students error:", err);
    return errorResponse("Internal server error", "INTERNAL_ERROR", 500);
  }
}

export async function POST(req: NextRequest) {
  try {
    const auth = await requirePermission("student.create", req);
    if (!auth.authorized) return auth.response;
    const body = await readJsonBody<{
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
