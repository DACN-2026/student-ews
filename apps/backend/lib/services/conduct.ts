import { prisma } from "@/lib/prisma";
import { ApiError } from "@/lib/utils/api-error";
import { studentIdWhere } from "@/lib/utils/is-uuid";
import { buildAcademicTermLinks } from "@/lib/academic-terms";

export type ConductClassification = "Xuất sắc" | "Tốt" | "Khá" | "Trung bình" | "Yếu" | "Kém";

export function classifyConductScore(score: number): ConductClassification {
  if (score >= 90) return "Xuất sắc";
  if (score >= 80) return "Tốt";
  if (score >= 65) return "Khá";
  if (score >= 50) return "Trung bình";
  if (score >= 35) return "Yếu";
  return "Kém";
}

export function conductApproval(statusId: string | null, lastScore: unknown) {
  if (statusId === "1" && lastScore != null) return { code: "approved", label: "Đã công nhận" };
  if (statusId === "0") return { code: "pending", label: "Chờ đánh giá" };
  return { code: "unknown", label: "Chưa xác định" };
}

export function isSummerConductTerm(_termCode: string | null | undefined, sourceFlag = false) {
  return sourceFlag;
}

function numberOrNull(value: unknown) {
  return value == null ? null : Number(value);
}

function serialize(record: {
  id: string;
  academicYearId: string;
  academicTermId: string;
  sClassStudentId: string | null;
  studentScore: unknown;
  classScore: unknown;
  departmentScore: unknown;
  statusId: string | null;
  lastScore: unknown;
  sourceUpdateDay: string | null;
  sourceUpdateStaff: string | null;
  createdAt: Date;
  updatedAt: Date;
}, period?: {
  yearCode: string;
  termCode: string;
  termName: string;
  isSummer: boolean;
  evaluationTerm?: { id: string; yearCode: string; termCode: string; termName: string } | null;
}) {
  const recognizedScore = record.statusId === "1" ? numberOrNull(record.lastScore) : null;
  const isSummer = isSummerConductTerm(period?.termCode, period?.isSummer);
  return {
    id: record.id,
    academicYearId: record.academicYearId,
    academicTermId: record.academicTermId,
    academicYear: period?.yearCode || null,
    termCode: period?.termCode || null,
    termName: period?.termName || null,
    isSummer,
    classCode: record.sClassStudentId,
    scores: {
      self: numberOrNull(record.studentScore),
      class: numberOrNull(record.classScore),
      department: numberOrNull(record.departmentScore),
      recognized: isSummer ? null : recognizedScore,
      sourceTemporary: isSummer ? numberOrNull(record.lastScore) : null,
    },
    approval: isSummer
      ? { code: "pending_evaluation", label: "Chờ sử dụng" }
      : conductApproval(record.statusId, record.lastScore),
    classification: isSummer || recognizedScore == null ? null : classifyConductScore(recognizedScore),
    evaluationTerm: isSummer ? period?.evaluationTerm || null : null,
    note: isSummer
      ? "Phát sinh trong kỳ hè, dùng khi đánh giá kỳ chính tiếp theo."
      : null,
    sourceStatusId: record.statusId,
    sourceUpdatedAt: record.sourceUpdateDay,
    sourceUpdatedBy: record.sourceUpdateStaff,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
  };
}

export class ConductService {
  static async listForStudent(studentIdentifier: string) {
    const student = await prisma.student.findFirst({
      where: { ...studentIdWhere(studentIdentifier), deletedAt: null },
      select: { id: true, sStudentId: true, sFullName: true },
    });
    if (!student) throw new ApiError("Student not found", "NOT_FOUND", 404);

    const records = await prisma.studentConductRecord.findMany({
      where: { studentId: student.id },
      orderBy: [{ academicYearId: "asc" }, { academicTermId: "asc" }],
    });
    const terms = await prisma.$queryRaw<Array<{
      id: string; academic_year_id: string; s_term_code: string; s_term_name: string; s_year_code: string; s_term_order: number;
      s_is_summer: boolean; start_date: Date | null; end_date: Date | null;
    }>>`
      SELECT t.id::text, t.academic_year_id::text, t.s_term_code, t.s_term_name, y.s_year_code,
             t.s_term_order, t.s_is_summer, t.start_date, t.end_date
      FROM academic_terms t JOIN academic_years y ON y.id = t.academic_year_id
      WHERE t.deleted_at IS NULL AND y.deleted_at IS NULL
    `;
    const links = buildAcademicTermLinks(terms.map((term) => ({
      id: term.id,
      academicYearId: term.academic_year_id,
      academicYearCode: term.s_year_code,
      termOrder: Number(term.s_term_order),
      isSummer: term.s_is_summer,
      startDate: term.start_date,
      endDate: term.end_date,
    })));
    const rawPeriods = new Map(terms.map((term) => [term.id, term]));
    const periods = new Map(terms.map((term) => {
      const evaluationTermId = links.get(term.id)?.nextMainTermId || null;
      const evaluationTerm = evaluationTermId ? rawPeriods.get(evaluationTermId) : null;
      return [term.id, {
      yearCode: term.s_year_code,
      termCode: term.s_term_code,
      termName: term.s_term_name,
      isSummer: term.s_is_summer,
      order: Number(term.s_term_order),
      evaluationTerm: evaluationTerm ? {
        id: evaluationTerm.id,
        yearCode: evaluationTerm.s_year_code,
        termCode: evaluationTerm.s_term_code,
        termName: evaluationTerm.s_term_name,
      } : null,
    }];
    }));
    const items = records
      .map((record) => serialize(record, periods.get(record.academicTermId)))
      .sort((a, b) => `${a.academicYear || ""}:${periods.get(a.academicTermId)?.order || 0}`
        .localeCompare(`${b.academicYear || ""}:${periods.get(b.academicTermId)?.order || 0}`));
    return {
      student: { id: student.id, studentCode: student.sStudentId, fullName: student.sFullName },
      items,
      total: items.length,
      approved: items.filter((item) => item.approval.code === "approved").length,
      pending: items.filter((item) => item.approval.code === "pending" || item.approval.code === "pending_evaluation").length,
    };
  }

  static async detailForStudent(studentIdentifier: string, academicTermId: string) {
    const list = await this.listForStudent(studentIdentifier);
    const item = list.items.find((record) => record.academicTermId === academicTermId);
    if (!item) throw new ApiError("Conduct record not found for the selected term", "NOT_FOUND", 404);
    return { student: list.student, item };
  }
}
