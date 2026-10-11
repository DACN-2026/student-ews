import { prisma } from "@/lib/prisma";
import { Prisma } from "@prisma/client";
import { ApiError } from "./utils/api-error";

/** Current monitoring excludes archived or departed students. The student
 * directory and individual historical records deliberately keep their scope. */
export type MonitoringPeriod = { yearCode: string; termOrder: number };
export function classMembershipWhere(period?: MonitoringPeriod, now = new Date()): Prisma.StudentWhereInput {
  return { deletedAt: null, sIsInClass: true, OR: period ? [
    { leftClassFromYear: null }, { leftClassFromYear: { gt: period.yearCode } },
    { leftClassFromYear: period.yearCode, leftClassFromTerm: { gt: period.termOrder } },
  ] : [{ leftClassEffectiveAt: null }, { leftClassEffectiveAt: { gt: now } }] };
}

export function suspensionWhere(period?: MonitoringPeriod, now = new Date()): Prisma.StudentStudySuspensionWhereInput {
  return { isRevoked: false, ...(period ? { AND: [
    { OR: [{ fromYear: { lt: period.yearCode } }, { fromYear: period.yearCode, fromTerm: { lte: period.termOrder } }] },
    { OR: [{ returnYear: null }, { returnYear: { gt: period.yearCode } }, { returnYear: period.yearCode, returnTerm: { gt: period.termOrder } }] },
  ] } : { fromCalendarActive: true, effectiveAt: { lte: now }, OR: [{ returnCalendarActive: false }, { returnEffectiveAt: null }, { returnEffectiveAt: { gt: now } }] }) };
}

export function monitoredStudentWhere(period?: MonitoringPeriod, now = new Date()): Prisma.StudentWhereInput {
  return { ...classMembershipWhere(period, now), studySuspensions: { none: suspensionWhere(period, now) } };
}

export type StudySuspension = { decisionId: string; decisionNumber: string; fromYear: string; fromTerm: number;
  effectiveAt: Date | string; returnYear?: string | null; returnTerm?: number | null; returnEffectiveAt?: Date | string | null; isRevoked?: boolean;
  fromCalendarActive?: boolean; returnCalendarActive?: boolean };
export function studentSuspension(student: { studySuspensions?: StudySuspension[] }, period?: MonitoringPeriod, now = new Date()) {
  return (student.studySuspensions || []).filter(row => !row.isRevoked && (period
    ? (row.fromYear < period.yearCode || row.fromYear === period.yearCode && row.fromTerm <= period.termOrder)
      && (!row.returnYear || row.returnYear > period.yearCode || row.returnYear === period.yearCode && row.returnTerm! > period.termOrder)
    : row.fromCalendarActive !== false && new Date(row.effectiveAt) <= now && (row.returnCalendarActive === false || !row.returnEffectiveAt || new Date(row.returnEffectiveAt) > now)))
    .sort((a, b) => b.fromYear.localeCompare(a.fromYear) || b.fromTerm - a.fromTerm).at(0) || null;
}

export function suspensionInfo(student: { studySuspensions?: StudySuspension[] }, period?: MonitoringPeriod) {
  const row = studentSuspension(student, period);
  return row ? { decisionId: row.decisionId, decisionNumber: row.decisionNumber, fromYear: row.fromYear, fromTerm: row.fromTerm,
    effectiveAt: new Date(row.effectiveAt).toISOString(), awaitingReturn: !row.returnEffectiveAt, returnYear: row.returnYear || null, returnTerm: row.returnTerm || null } : null;
}

export function studentIsInClass(student: { sIsInClass?: boolean; leftClassEffectiveAt?: Date | string | null }, now = new Date()) {
  return Boolean(student.sIsInClass && (!student.leftClassEffectiveAt || new Date(student.leftClassEffectiveAt) > now));
}

export async function assertStudentSupportAllowed(studentId: string) {
  const student = await prisma.student.findFirst({ where: { id: studentId, deletedAt: null },
    select: { sIsInClass: true, leftClassEffectiveAt: true, studySuspensions: { where: suspensionWhere() } } });
  if (!student) throw new ApiError("Không tìm thấy hồ sơ sinh viên.", "NOT_FOUND", 404);
  if (student.sIsInClass === false || student.leftClassEffectiveAt && student.leftClassEffectiveAt <= new Date()) {
    throw new ApiError("Sinh viên đã rời lớp. Hồ sơ chỉ dùng để tra cứu lịch sử; không tiếp tục hỗ trợ.", "STUDENT_LEFT_CLASS", 409);
  }
  if (studentSuspension(student)) throw new ApiError("Sinh viên đang nghỉ học tạm thời / bảo lưu. Hồ sơ hỗ trợ được đóng băng đến khi quyết định tiếp nhận học lại có hiệu lực.", "STUDENT_STUDY_SUSPENDED", 409);
}

/** SQL callers use alias s; the selected period keeps pre-departure evaluations available. */
export function studentMonitoringSql(period?: MonitoringPeriod | string) {
  const leaveScope = typeof period === "string" ? Prisma.sql`NOT EXISTS (
    SELECT 1 FROM student_study_suspensions pause JOIN academic_terms pt ON pt.id = ${period}::uuid
    JOIN academic_years py ON py.id = pt.academic_year_id
    WHERE pause.student_id = s.id AND NOT pause.is_revoked
      AND (pause.from_year < py.s_year_code OR (pause.from_year = py.s_year_code AND pause.from_term <= pt.s_term_order))
      AND (pause.return_year IS NULL OR pause.return_year > py.s_year_code OR (pause.return_year = py.s_year_code AND pause.return_term > pt.s_term_order))
  )` : period ? Prisma.sql`NOT EXISTS (SELECT 1 FROM student_study_suspensions pause WHERE pause.student_id = s.id AND NOT pause.is_revoked
    AND (pause.from_year < ${period.yearCode} OR (pause.from_year = ${period.yearCode} AND pause.from_term <= ${period.termOrder}))
    AND (pause.return_year IS NULL OR pause.return_year > ${period.yearCode} OR (pause.return_year = ${period.yearCode} AND pause.return_term > ${period.termOrder})))`
    : Prisma.sql`NOT EXISTS (SELECT 1 FROM student_study_suspensions pause WHERE pause.student_id = s.id AND NOT pause.is_revoked
      AND pause.from_calendar_active AND pause.effective_at <= ${new Date()}
      AND (NOT pause.return_calendar_active OR pause.return_effective_at IS NULL OR pause.return_effective_at > ${new Date()}))`;
  if (typeof period === "string") return Prisma.sql`${leaveScope} AND (s.left_class_from_year IS NULL OR EXISTS (
    SELECT 1 FROM academic_terms departure_scope_term JOIN academic_years departure_scope_year
      ON departure_scope_year.id = departure_scope_term.academic_year_id
    WHERE departure_scope_term.id = ${period}::uuid AND (
      s.left_class_from_year > departure_scope_year.s_year_code OR
      (s.left_class_from_year = departure_scope_year.s_year_code AND s.left_class_from_term > departure_scope_term.s_term_order)
    )
  ))`;
  return period ? Prisma.sql`${leaveScope} AND (s.left_class_from_year IS NULL OR s.left_class_from_year > ${period.yearCode}
    OR (s.left_class_from_year = ${period.yearCode} AND s.left_class_from_term > ${period.termOrder}))`
    : Prisma.sql`${leaveScope} AND (s.left_class_effective_at IS NULL OR s.left_class_effective_at > ${new Date()})`;
}

/** Snapshots retain departed students for history. Filter them before counting
 * and paginating operational lists, rather than deleting their results. */
export async function departedStudentIds(period?: MonitoringPeriod): Promise<string[]> {
  const students = await prisma.student.findMany({
    where: { OR: [{ sIsInClass: false }, { deletedAt: { not: null } }, { studySuspensions: { some: suspensionWhere(period) } }, ...(period ? [
      { leftClassFromYear: { lt: period.yearCode } },
      { leftClassFromYear: period.yearCode, leftClassFromTerm: { lte: period.termOrder } },
    ] : [{ leftClassEffectiveAt: { lte: new Date() } }])] },
    select: { id: true },
    orderBy: { id: "asc" },
  });
  return students.map(student => student.id);
}

export async function monitoredStudentResultWhere(period?: MonitoringPeriod) {
  const ids = await departedStudentIds(period);
  return ids.length ? { studentId: { notIn: ids } } : {};
}
