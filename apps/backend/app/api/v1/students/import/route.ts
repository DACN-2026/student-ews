import { NextRequest } from "next/server";
import { StudentsService } from "@/lib/services/students";
import { jsonResponse, errorResponse } from "@/lib/utils/api-response";
import { apiErrorResponse, readJsonBody } from "@/lib/utils/api-error";
import { requirePermission } from "@/lib/auth/authorize";
import { inaccessibleStudentTargetIndexes, studentScopeWhere } from "@/lib/auth/data-scope";
import { prisma } from "@/lib/prisma";

export async function POST(req: NextRequest) {
  try {
    const auth = await requirePermission("student.import", req);
    if (!auth.authorized) return auth.response;
    const body = await readJsonBody<unknown>(req, 5 * 1024 * 1024);
    if (!Array.isArray(body)) {
      return errorResponse("Expected an array of students", "INVALID_REQUEST", 400);
    }
    const scope = await studentScopeWhere(auth.actor);
    const codes = body.flatMap(item => typeof item?.studentId === "string" ? [item.studentId.trim()] : []);
    const existing = await prisma.student.findMany({ where: { AND: [scope, { sStudentId: { in: codes } }] },
      select: { sStudentId: true, sClassStudentId: true, sStudyProgramId: true } });
    const existingByCode = new Map(existing.map(row => [row.sStudentId, row]));
    const targets = body.map(item => {
      const current = existingByCode.get(typeof item?.studentId === "string" ? item.studentId.trim() : "");
      return { classStudentId: item?.classStudentId === undefined ? current?.sClassStudentId : item.classStudentId,
        studyProgramId: item?.studyProgramId === undefined ? current?.sStudyProgramId : item.studyProgramId };
    });
    const inaccessible = await inaccessibleStudentTargetIndexes(auth.actor, targets);
    if (inaccessible.length) {
      return errorResponse(`Rows outside data scope: ${inaccessible.slice(0, 20).map((index) => index + 1).join(", ")}`, "NOT_FOUND", 404);
    }

    const result = await StudentsService.importBatch(body, scope, req.nextUrl.searchParams.get("preview") === "true");
    return jsonResponse(result);
  } catch (err) {
    return apiErrorResponse(err, "Failed to import students");
  }
}
