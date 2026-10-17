import { NextRequest } from "next/server";
import { GradesService } from "@/lib/services/grades";
import { jsonResponse, errorResponse } from "@/lib/utils/api-response";
import { requireStudentPermission } from "@/lib/auth/data-scope";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const auth = await requireStudentPermission(req, id, "grade.read");
    if (!auth.authorized) return auth.response;
    const { searchParams } = new URL(req.url);
    const academicYear = searchParams.get("academicYear") || undefined;
    const termCode = searchParams.get("termCode") || undefined;
    const courseCode = searchParams.get("courseCode") || undefined;
    const view = searchParams.get("view") || "best";
    if (view !== "best" && view !== "attempts") return errorResponse("view must be best or attempts", "INVALID_FILTER", 400);

    const items = await GradesService.list(id, { academicYear, termCode, courseCode, view });
    return jsonResponse({ items, total: items.length });
  } catch (err) {
    console.error("List grades error:", err);
    return errorResponse("Internal server error", "INTERNAL_ERROR", 500);
  }
}
