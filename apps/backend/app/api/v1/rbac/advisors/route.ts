import { requireApiPermission } from "@/lib/auth/authorize";
import { NextRequest } from "next/server";
import { RbacService } from "@/lib/services/rbac";
import { jsonResponse, errorResponse } from "@/lib/utils/api-response";
import { requirePermission } from "@/lib/auth/authorize";
import { apiErrorResponse, readJsonObject } from "@/lib/utils/api-error";
import { recordAudit } from "@/lib/services/audit";

export async function GET(request: Request) {
  try {
    const access = await requireApiPermission(request);
    if (!access.authorized) return access.response;
    const advisors = await RbacService.listAdvisors();
    return jsonResponse({ items: advisors, total: advisors.length });
  } catch (err) {
    console.error("List advisors error:", err);
    return errorResponse("Internal server error", "INTERNAL_ERROR", 500);
  }
}

export async function POST(req: NextRequest) {
  try {
    const auth = await requirePermission("advisor_assignment.manage", req);
    if (!auth.authorized) return auth.response;
    const body = await readJsonObject<{ userId?: string; classId?: string; academicTermId?: string }>(req);
    if (!body.userId || !body.classId || !body.academicTermId) {
      return errorResponse("userId, classId and academicTermId are required", "INVALID_REQUEST", 400);
    }
    const assignment = await RbacService.assignAdvisor({
      userId: body.userId,
      classId: body.classId,
      academicTermId: body.academicTermId,
      assignedById: auth.actor.userId,
    });
    await recordAudit(req, {
      action: "advisor_assignment.create",
      resourceType: "ClassAdvisorAssignment",
      resourceId: assignment.id,
      details: { userId: body.userId, classId: body.classId, academicTermId: body.academicTermId },
    });
    return jsonResponse(assignment, 201);
  } catch (err) {
    return apiErrorResponse(err, "Failed to assign advisor");
  }
}
