import { requireApiPermission } from "@/lib/auth/authorize";
import { NextRequest } from "next/server";
import { TrainingProgramsService } from "@/lib/services/training-programs";
import { apiErrorResponse, readJsonObject } from "@/lib/utils/api-error";
import { errorResponse, jsonResponse } from "@/lib/utils/api-response";
import { recordAudit } from "@/lib/services/audit";

interface Params { params: Promise<{ id: string }> }

export async function GET(_request: NextRequest, { params }: Params) {
  try {
    const access = await requireApiPermission(_request);
    if (!access.authorized) return access.response;
    const { id } = await params;
    const course = await TrainingProgramsService.getCourseById(id);
    if (!course) return errorResponse("Course not found", "NOT_FOUND", 404);
    return jsonResponse(course);
  } catch (error) {
    return apiErrorResponse(error, "Failed to load course");
  }
}

export async function PATCH(request: NextRequest, { params }: Params) {
  try {
    const access = await requireApiPermission(request);
    if (!access.authorized) return access.response;
    const { id } = await params;
    const body = await readJsonObject<{ courseCode?: string; courseName?: string }>(request);
    return jsonResponse(await TrainingProgramsService.updateCourse(id, body));
  } catch (error) {
    return apiErrorResponse(error, "Failed to update course");
  }
}

export async function DELETE(request: NextRequest, { params }: Params) {
  try {
    const access = await requireApiPermission(request);
    if (!access.authorized) return access.response;
    const { id } = await params;
    await TrainingProgramsService.removeCourse(id);
    await recordAudit(request, { action: "course.delete", resourceType: "Course", resourceId: id });
    return new Response(null, { status: 204 });
  } catch (error) {
    return apiErrorResponse(error, "Failed to delete course");
  }
}
