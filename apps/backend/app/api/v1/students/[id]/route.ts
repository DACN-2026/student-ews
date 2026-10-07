import { NextRequest } from "next/server";
import { StudentsService } from "@/lib/services/students";
import { jsonResponse, errorResponse } from "@/lib/utils/api-response";
import { inaccessibleStudentTargetIndexes, requireStudentPermission } from "@/lib/auth/data-scope";
import { apiErrorResponse, readJsonBody } from "@/lib/utils/api-error";
import { recordAudit } from "@/lib/services/audit";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const auth = await requireStudentPermission(req, id, "student.read");
    if (!auth.authorized) return auth.response;
    const student = await StudentsService.getById(id);
    if (!student) {
      return errorResponse("Student not found", "NOT_FOUND", 404);
    }
    return jsonResponse(student);
  } catch (err) {
    console.error("Get student error:", err);
    return errorResponse("Internal server error", "INTERNAL_ERROR", 500);
  }
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const auth = await requireStudentPermission(req, id, "student.update");
    if (!auth.authorized) return auth.response;
    const body = await readJsonBody<Record<string, unknown>>(req);
    const current = await StudentsService.getById(id);
    if (!current) return errorResponse("Student not found", "NOT_FOUND", 404);
    const target = {
      classStudentId: body.classStudentId === undefined ? current.classStudentId : typeof body.classStudentId === "string" ? body.classStudentId : null,
      studyProgramId: body.studyProgramId === undefined ? current.studyProgramId : typeof body.studyProgramId === "string" ? body.studyProgramId : null,
    };
    if ((await inaccessibleStudentTargetIndexes(auth.actor, [target])).length) {
      return errorResponse("Target class or program is outside data scope", "NOT_FOUND", 404);
    }
    const updated = await StudentsService.update(id, body);
    if (current.isInClass !== updated.isInClass) {
      await recordAudit(req, {
        action: "student.membership.update", resourceType: "Student", resourceId: current.id,
        details: { studentCode: current.studentCode, previousIsInClass: current.isInClass, isInClass: updated.isInClass },
      });
    }
    return jsonResponse(updated);
  } catch (err) {
    return apiErrorResponse(err, "Failed to update student");
  }
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const auth = await requireStudentPermission(req, id, "student.delete");
    if (!auth.authorized) return auth.response;
    const deleted = await StudentsService.delete(id);
    if (!deleted) return errorResponse("Student not found", "NOT_FOUND", 404);
    await recordAudit(req, { action: "student.delete", resourceType: "Student", resourceId: id });
    return new Response(null, { status: 204 });
  } catch (err) {
    return apiErrorResponse(err, "Failed to delete student");
  }
}
