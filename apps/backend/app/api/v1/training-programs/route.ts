import { requireApiPermission } from "@/lib/auth/authorize";
import { NextRequest } from "next/server";
import { TrainingProgramsService } from "@/lib/services/training-programs";
import { jsonResponse, errorResponse, parsePagination } from "@/lib/utils/api-response";
import { apiErrorResponse, readJsonObject } from "@/lib/utils/api-error";

export async function GET(request: NextRequest) {
  try {
    const access = await requireApiPermission(request);
    if (!access.authorized) return access.response;
    const { searchParams } = request.nextUrl;
    const { page, pageSize } = parsePagination(searchParams);
    return jsonResponse(await TrainingProgramsService.listPrograms(
      searchParams.get("q") || "",
      searchParams.get("includeArchived") === "true",
      page,
      pageSize,
    ));
  } catch (err) {
    console.error("List training programs error:", err);
    return errorResponse("Internal server error", "INTERNAL_ERROR", 500);
  }
}

export async function POST(request: NextRequest) {
  try {
    const access = await requireApiPermission(request);
    if (!access.authorized) return access.response;
    const body = await readJsonObject<{
      programCode?: string;
      programName?: string;
      degreeLevel?: string;
      major?: string;
      studyType?: string;
      facultyCode?: string;
      status?: string;
    }>(request);
    if (!body.programCode || !body.programName || !body.degreeLevel || !body.major || !body.studyType) {
      return errorResponse("programCode, programName, degreeLevel, major and studyType are required", "INVALID_REQUEST", 400);
    }
    return jsonResponse(await TrainingProgramsService.createProgram({
      programCode: body.programCode,
      programName: body.programName,
      degreeLevel: body.degreeLevel,
      major: body.major,
      studyType: body.studyType,
      facultyCode: body.facultyCode,
      status: body.status,
    }), 201);
  } catch (error) {
    return apiErrorResponse(error, "Failed to create training program");
  }
}
