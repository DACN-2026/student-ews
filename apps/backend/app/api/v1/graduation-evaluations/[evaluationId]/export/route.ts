import { NextRequest } from "next/server";
import { GraduationEvaluationsService } from "@/lib/services/graduation-evaluations";
import { graduationEvaluationClassScope, requireGraduationEvaluationPermission } from "@/lib/auth/data-scope";
import { reportPdfBuffer, safeExportStem, workbookBuffer, type ExportTable } from "@/lib/services/export";
import { recordAudit } from "@/lib/services/audit";
import { apiErrorResponse } from "@/lib/utils/api-error";
import { errorResponse } from "@/lib/utils/api-response";

const statusLabel: Record<string, string> = {
  EXPECTED_ELIGIBLE: "Dự kiến đủ điều kiện",
  PENDING_GRADE: "Chờ kết quả điểm",
  PENDING_REQUIREMENT: "Chờ bổ sung điều kiện",
  NOT_ELIGIBLE: "Chưa đủ điều kiện",
  MANUAL_REVIEW: "Cần đối soát",
};

export async function GET(request: NextRequest, { params }: { params: Promise<{ evaluationId: string }> }) {
  try {
    const { evaluationId } = await params;
    const auth = await requireGraduationEvaluationPermission(request, evaluationId, "graduation.export");
    if (!auth.authorized) return auth.response;
    const format = new URL(request.url).searchParams.get("format") || "xlsx";
    if (format !== "xlsx" && format !== "pdf") {
      return errorResponse("format must be xlsx or pdf", "INVALID_FILTER", 400);
    }
    const [evaluation, students] = await Promise.all([
      GraduationEvaluationsService.getEvaluation(evaluationId),
      GraduationEvaluationsService.listStudents(
        evaluationId,
        {},
        1,
        10_000,
        await graduationEvaluationClassScope(auth.actor, evaluationId),
      ),
    ]);
    if (!evaluation) return errorResponse("Graduation evaluation not found", "NOT_FOUND", 404);
    const table: ExportTable = {
      title: "DỰ KIẾN SINH VIÊN TỐT NGHIỆP",
      subtitle: `${evaluation.evaluationCode} | ${evaluation.cohortCode || "Chưa rõ khóa"} | ${evaluation.programCode || "Chưa rõ CTĐT"} | Rule ${evaluation.ruleVersion}`,
      sheetName: "Dự kiến tốt nghiệp",
      columns: [
        { header: "MSSV", key: "studentCode", width: 16 },
        { header: "Họ tên", key: "studentName", width: 30 },
        { header: "Lớp", key: "className", width: 20 },
        { header: "TC đạt", key: "credits", width: 12 },
        { header: "GPA hệ 4", key: "gpa", width: 12 },
        { header: "CTĐT", key: "curriculum", width: 16 },
        { header: "GDTC", key: "physical", width: 16 },
        { header: "GDQP", key: "defense", width: 16 },
        { header: "Rèn luyện", key: "training", width: 16 },
        { header: "Kết luận", key: "status", width: 24 },
        { header: "Lý do", key: "reasons", width: 54 },
      ],
      rows: students.items.map((student) => ({
        studentCode: student.sStudentId,
        studentName: student.sStudentName,
        className: student.sClassName,
        credits: student.totalCredits,
        gpa: student.cumulativeGpa4,
        curriculum: student.curriculumStatus,
        physical: student.physicalEducationStatus,
        defense: student.nationalDefenseStatus,
        training: student.wholeCourseTrainingScore ?? student.trainingStatus,
        status: statusLabel[student.finalStatus] || student.finalStatus,
        reasons: Array.isArray(student.reasons)
          ? (student.reasons as Array<{ message?: string }>).map((reason) => reason.message).filter(Boolean).join("; ")
          : "",
      })),
      summary: [
        ["Tổng sinh viên", evaluation.totalStudents],
        ["Dự kiến đủ điều kiện", evaluation.expectedEligibleStudents],
        ["Chờ kết quả điểm", evaluation.pendingGradeStudents],
        ["Chưa đủ điều kiện", evaluation.notEligibleStudents],
      ],
    };
    const body = format === "xlsx" ? await workbookBuffer(table) : await reportPdfBuffer(table);
    const fileName = `${safeExportStem(`du_kien_tot_nghiep_${evaluation.evaluationCode}`)}.${format}`;
    await recordAudit(request, {
      action: "graduation_evaluation.export",
      resourceType: "graduation_evaluation",
      resourceId: evaluationId,
      details: { format, rowCount: students.items.length },
    });
    return new Response(new Uint8Array(body), {
      headers: {
        "content-type": format === "xlsx"
          ? "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
          : "application/pdf",
        "content-disposition": `attachment; filename="${fileName}"`,
        "cache-control": "private, no-store",
      },
    });
  } catch (error) {
    return apiErrorResponse(error, "Failed to export graduation evaluation");
  }
}
