import { hasPermission, type Actor } from "@/lib/auth/types";
import { ApiError } from "@/lib/utils/api-error";
import type { StudentFilter } from "./students";

export function parseStudentFilter(params: URLSearchParams, actor: Actor): StudentFilter {
  const role = params.get("class_role_id") ?? params.get("classRoleId");
  const membership = params.get("is_in_class") ?? params.get("isInClass");
  if (role !== null && (!/^\d+$/.test(role) || Number(role) > 32767)) throw new ApiError("Vai trò lớp không hợp lệ.", "INVALID_REQUEST", 400);
  if (membership !== null && !["true", "false"].includes(membership)) throw new ApiError("isInClass phải là true hoặc false.", "INVALID_REQUEST", 400);
  const warningLevel = params.get("warningLevel") || undefined;
  if (warningLevel && !hasPermission(actor, "academic_warning.read")) throw new ApiError("Bạn không có quyền lọc cảnh báo học tập.", "FORBIDDEN", 403);
  if (warningLevel && !["all", "red", "yellow", "green", "partial", "insufficient"].includes(warningLevel)) throw new ApiError("Mức cảnh báo không hợp lệ.", "INVALID_FILTER", 400);
  return { search: params.get("q") || params.get("search") || undefined,
    cohortId: params.get("cohortId") || params.get("cohort_id") || undefined,
    classStudentId: params.get("class_student_id") || params.get("classStudentId") || undefined,
    gender: params.get("gender") || undefined, studyProgramId: params.get("studyProgramId") || undefined,
    classRoleId: role === null ? undefined : Number(role), isInClass: membership === null ? undefined : membership === "true", warningLevel };
}
