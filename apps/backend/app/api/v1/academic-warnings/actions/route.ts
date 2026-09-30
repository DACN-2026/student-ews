import { NextRequest } from "next/server";
import { requirePermission } from "@/lib/auth/authorize";
import { prisma } from "@/lib/prisma";
import { apiErrorResponse, readJsonBody } from "@/lib/utils/api-error";
import { errorResponse, jsonResponse } from "@/lib/utils/api-response";
import { studentIdWhere } from "@/lib/utils/is-uuid";
import { requireStudentPermission, requireWarningRunPermission, studentScopeWhere } from "@/lib/auth/data-scope";
import { WarningActionsService } from "@/lib/services/warning-actions";

export async function GET(req: NextRequest) {
  try {
    const auth = await requirePermission("academic_warning.read", req);
    if (!auth.authorized) return auth.response;
    const studentIdentifier = req.nextUrl.searchParams.get("studentId");
    const runId = req.nextUrl.searchParams.get("runId");
    if (studentIdentifier) {
      const studentAuth = await requireStudentPermission(req, studentIdentifier, "academic_warning.read");
      if (!studentAuth.authorized) return studentAuth.response;
    }
    if (runId) {
      const runAuth = await requireWarningRunPermission(req, runId, "academic_warning.read");
      if (!runAuth.authorized) return runAuth.response;
    }
    const accessibleStudents = await prisma.student.findMany({
      where: { AND: [{ deletedAt: null }, await studentScopeWhere(auth.actor)] },
      select: { id: true },
    });
    let studentId: string | undefined;
    if (studentIdentifier) {
      const student = await prisma.student.findFirst({
        where: { ...studentIdWhere(studentIdentifier), deletedAt: null },
        select: { id: true },
      });
      if (!student) return jsonResponse({ items: [], total: 0 });
      studentId = student.id;
    }
    const actions = await prisma.warningAction.findMany({
      where: {
        studentId: { in: accessibleStudents.map((student) => student.id) },
        OR: [{ caseType: null }, { caseType: { not: "EARLY_WARNING_CASE" } }],
        ...(studentId ? { studentId } : {}),
        ...(runId ? { runId } : {}),
      },
      orderBy: { createdAt: "desc" },
      take: 500,
    });
    return jsonResponse({ items: actions, total: actions.length });
  } catch (error) {
    return apiErrorResponse(error, "Failed to list warning actions");
  }
}

export async function POST(req: NextRequest) {
  try {
    const auth = await requirePermission("academic_warning.action.create", req);
    if (!auth.authorized) return auth.response;
    const body = await readJsonBody<{
      studentId?: string;
      runId?: string;
      actionType?: string;
      note?: string;
      status?: string;
      assignedUserId?: string | null;
      dueDate?: string | null;
    }>(req);
    if (!body.studentId || !body.actionType || !body.note?.trim()) {
      return errorResponse("studentId, actionType, and note are required", "INVALID_REQUEST", 400);
    }
    const studentAuth = await requireStudentPermission(req, body.studentId, "academic_warning.action.create");
    if (!studentAuth.authorized) return studentAuth.response;
    if (body.runId) {
      const runAuth = await requireWarningRunPermission(req, body.runId, "academic_warning.action.create");
      if (!runAuth.authorized) return runAuth.response;
    }
    const student = await prisma.student.findFirst({
      where: { ...studentIdWhere(body.studentId), deletedAt: null },
      select: { id: true },
    });
    if (!student) return errorResponse("Student not found", "NOT_FOUND", 404);
    if (body.runId) {
      const result = await prisma.academicWarningStudentResult.findFirst({
        where: { runId: body.runId, studentId: student.id },
        select: { id: true },
      });
      if (!result) return errorResponse("Student is not part of the warning run", "INVALID_REQUEST", 400);
    }
    const action = await WarningActionsService.create({
      studentId: student.id,
      runId: body.runId,
      actionType: body.actionType,
      note: body.note,
      status: body.status,
      assignedUserId: body.assignedUserId,
      dueDate: body.dueDate,
    }, auth.actor);
    return jsonResponse(action, 201);
  } catch (error) {
    return apiErrorResponse(error, "Failed to create warning action");
  }
}
