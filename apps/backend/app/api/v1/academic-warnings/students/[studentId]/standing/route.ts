import { NextRequest } from "next/server";
import { requireStudentPermission } from "@/lib/auth/data-scope";
import { prisma } from "@/lib/prisma";
import { studentIdWhere } from "@/lib/utils/is-uuid";
import { AcademicWarningsService } from "@/lib/services/academic-warnings";
import { studentStandingReviewContext, verifyAcademicStandingDecision } from "@/lib/services/academic-standing";
import { apiErrorResponse, ApiError, readJsonBody } from "@/lib/utils/api-error";
import { jsonResponse } from "@/lib/utils/api-response";

export async function GET(request: NextRequest, { params }: { params: Promise<{ studentId: string }> }) {
  try {
    const { studentId } = await params;
    const auth = await requireStudentPermission(request, studentId, "academic_warning.read");
    if (!auth.authorized) return auth.response;
    const student = await prisma.student.findFirst({ where: { ...studentIdWhere(studentId), deletedAt: null }, select: { id: true } });
    if (!student) throw new ApiError("Không tìm thấy sinh viên.", "NOT_FOUND", 404);
    const termId = request.nextUrl.searchParams.get("termId") || (await AcademicWarningsService.resolveRunAssessmentTerm({})).assessmentTerm.id;
    return jsonResponse(await studentStandingReviewContext(student.id, termId));
  } catch (error) { return apiErrorResponse(error, "Không thể tải đối chiếu đăng ký và quyết định học vụ."); }
}

export async function POST(request: NextRequest, { params }: { params: Promise<{ studentId: string }> }) {
  try {
    const { studentId } = await params;
    const auth = await requireStudentPermission(request, studentId, "academic_warning.action.update");
    if (!auth.authorized) return auth.response;
    const student = await prisma.student.findFirst({ where: { ...studentIdWhere(studentId), deletedAt: null }, select: { id: true } });
    if (!student) throw new ApiError("Không tìm thấy sinh viên.", "NOT_FOUND", 404);
    const body = await readJsonBody<unknown>(request);
    if (!body || typeof body !== "object" || Array.isArray(body)) throw new ApiError("Nội dung xác minh không hợp lệ.", "INVALID_REQUEST", 422);
    return jsonResponse(await verifyAcademicStandingDecision(student.id, body as Record<string, unknown>, auth.actor.userId));
  } catch (error) { return apiErrorResponse(error, "Không thể lưu xác minh quyết định học vụ."); }
}
