import { requireApiPermission } from "@/lib/auth/authorize";
import { NextRequest } from "next/server";
import { TrainingProgramsService } from "@/lib/services/training-programs";
import { jsonResponse, errorResponse } from "@/lib/utils/api-response";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const access = await requireApiPermission(req);
    if (!access.authorized) return access.response;
    const { id } = await params;
    const semesterNo = Number(req.nextUrl.searchParams.get("semesterNo") || 0);
    const courses = (await TrainingProgramsService.getProgramCourses(id))
      .filter((course) => !semesterNo || course.semesterNo === semesterNo);
    return jsonResponse({ items: courses, total: courses.length });
  } catch (err) {
    console.error("Get program courses error:", err);
    return errorResponse("Internal server error", "INTERNAL_ERROR", 500);
  }
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const access = await requireApiPermission(req);
    if (!access.authorized) return access.response;
    const { id } = await params;
    const body = await req.json();
    if (!body.semesterNo || !body.credits || !body.requirementType) {
      return errorResponse("Missing required fields: semesterNo, credits, requirementType", "INVALID_REQUEST", 400);
    }
    const item = await TrainingProgramsService.addProgramCourse(id, body);
    return jsonResponse(item, 201);
  } catch (err: any) {
    console.error("Add program course error:", err);
    return errorResponse(err.message || "Internal server error", "INTERNAL_ERROR", 500);
  }
}
