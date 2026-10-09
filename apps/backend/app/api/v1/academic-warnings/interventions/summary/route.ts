import { NextRequest } from "next/server";
import { requirePermission } from "@/lib/auth/authorize";
import { InterventionCasesService } from "@/lib/services/intervention-cases";
import { apiErrorResponse } from "@/lib/utils/api-error";
import { errorResponse, jsonResponse } from "@/lib/utils/api-response";
import { prisma } from "@/lib/prisma";

export async function GET(req: NextRequest) {
  try {
    const auth = await requirePermission("academic_warning.read", req);
    if (!auth.authorized) return auth.response;
    const academicTermId = req.nextUrl.searchParams.get("academicTermId") || undefined;
    if (academicTermId && !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(academicTermId)) {
      return errorResponse("Invalid academic term ID", "INVALID_ACADEMIC_TERM", 400);
    }
    if (academicTermId && !await prisma.academicTerm.findFirst({ where: { id: academicTermId, deletedAt: null }, select: { id: true } })) {
      return errorResponse("Academic term not found", "INVALID_ACADEMIC_TERM", 400);
    }
    return jsonResponse(await InterventionCasesService.summary(auth.actor, { academicTermId }));
  } catch (error) {
    return apiErrorResponse(error, "Failed to summarize intervention cases");
  }
}
