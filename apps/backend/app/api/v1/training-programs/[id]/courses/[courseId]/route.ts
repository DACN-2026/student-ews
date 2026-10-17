import { requireApiPermission } from "@/lib/auth/authorize";
import { NextRequest } from "next/server";
import { TrainingProgramsService } from "@/lib/services/training-programs";
import { jsonResponse, errorResponse } from "@/lib/utils/api-response";
import { recordAudit } from "@/lib/services/audit";

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; courseId: string }> }
) {
  try {
    const access = await requireApiPermission(req);
    if (!access.authorized) return access.response;
    const { id, courseId } = await params;
    const body = await req.json();
    const updated = await TrainingProgramsService.updateProgramCourse(id, courseId, body);
    return jsonResponse(updated);
  } catch (err: any) {
    console.error("Update program course error:", err);
    return errorResponse(err.message || "Internal server error", "INTERNAL_ERROR", 500);
  }
}

export const PATCH = PUT;

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; courseId: string }> }
) {
  try {
    const access = await requireApiPermission(req);
    if (!access.authorized) return access.response;
    const { id, courseId } = await params;
    await TrainingProgramsService.deleteProgramCourse(id, courseId);
    await recordAudit(req, { action: "training_program_course.delete", resourceType: "TrainingProgramCourse", details: { trainingProgramId: id, courseId } });
    return new Response(null, { status: 204 });
  } catch (err: any) {
    console.error("Delete program course error:", err);
    return errorResponse(err.message || "Internal server error", "INTERNAL_ERROR", 500);
  }
}
