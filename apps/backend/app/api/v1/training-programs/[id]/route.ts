import { requireApiPermission } from "@/lib/auth/authorize";
import { NextRequest } from "next/server";
import { TrainingProgramsService } from "@/lib/services/training-programs";
import { jsonResponse, errorResponse } from "@/lib/utils/api-response";
import { apiErrorResponse, readJsonObject } from "@/lib/utils/api-error";
import { recordAudit } from "@/lib/services/audit";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const access = await requireApiPermission(req);
    if (!access.authorized) return access.response;
    const { id } = await params;
    const program = await TrainingProgramsService.getProgramById(id);
    if (!program) return errorResponse("Training program not found", "NOT_FOUND", 404);
    return jsonResponse(program);
  } catch (err) {
    console.error("Get training program error:", err);
    return errorResponse("Internal server error", "INTERNAL_ERROR", 500);
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const access = await requireApiPermission(request);
    if (!access.authorized) return access.response;
    const { id } = await params;
    const body = await readJsonObject<{
      programName?: string;
      degreeLevel?: string;
      major?: string;
      studyType?: string;
      facultyCode?: string | null;
      status?: string;
      isActive?: boolean;
    }>(request);
    return jsonResponse(await TrainingProgramsService.updateProgram(id, body));
  } catch (error) {
    return apiErrorResponse(error, "Failed to update training program");
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const access = await requireApiPermission(request);
    if (!access.authorized) return access.response;
    const { id } = await params;
    await TrainingProgramsService.removeProgram(id);
    await recordAudit(request, { action: "training_program.delete", resourceType: "TrainingProgram", resourceId: id });
    return new Response(null, { status: 204 });
  } catch (error) {
    return apiErrorResponse(error, "Failed to delete training program");
  }
}
