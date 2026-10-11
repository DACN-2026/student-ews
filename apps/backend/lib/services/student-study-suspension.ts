import { Prisma } from "@prisma/client";
import { prisma } from "../prisma";
import { readStandingReview } from "./academic-standing";
import { resolveStudySuspensions } from "./academic-standing-rules";

export async function syncStudentStudySuspensions(studentIds?: string[], apply = false, actorId?: string) {
  return prisma.$transaction(async tx => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext('student-study-suspension'))`;
    const [students, decisions, types, terms, years, existing] = await Promise.all([
      tx.student.findMany({ where: { deletedAt: null, ...(studentIds ? { id: { in: studentIds } } : {}) }, select: { id: true, sStudentId: true } }),
      tx.studentDecision.findMany({ where: { deletedAt: null, ...(studentIds ? { studentId: { in: studentIds } } : {}) } }),
      tx.decisionType.findMany({ where: { deletedAt: null } }),
      tx.academicTerm.findMany({ where: { deletedAt: null } }),
      tx.academicYear.findMany({ where: { deletedAt: null } }),
      tx.studentStudySuspension.findMany({ where: studentIds ? { studentId: { in: studentIds } } : {} }),
    ]);
    const yearById = new Map(years.map(year => [year.id, year.sYearCode]));
    const typeById = new Map(types.map(type => [type.decisionTypeId, type.decisionName]));
    const timeline = terms.map(term => ({ id: term.id, academicYearId: term.academicYearId, academicYearCode: yearById.get(term.academicYearId) || "",
      termOrder: term.sTermOrder, isSummer: term.sIsSummer, startDate: term.startDate, endDate: term.endDate, label: term.sTermName }));
    const currentTerms = terms.filter(term => term.isCurrent && !term.sIsSummer);
    const current = currentTerms.length === 1 ? currentTerms[0] : null;
    const activeByCalendar = (year: string, order: number, effectiveAt: Date) => current
      ? year < (yearById.get(current.academicYearId) || "") || year === yearById.get(current.academicYearId) && order <= current.sTermOrder
      : Boolean(timeline.find(term => term.academicYearCode === year && term.termOrder === order)?.startDate && effectiveAt <= new Date());
    const candidates = students.flatMap(student => resolveStudySuspensions(decisions.filter(row => row.studentId === student.id).map(row => ({
      id: row.id, termId: row.academicTermId, number: row.sDecisionNumber, signedAt: row.sSignDate?.toISOString() || null,
      name: row.sDecisionName, typeName: typeById.get(row.decisionTypeId) || "", fullText: row.sFullText, review: readStandingReview(row.sourcePayload),
    })), timeline).map(interval => ({ studentId: student.id, ...interval, isRevoked: false,
      fromCalendarActive: activeByCalendar(interval.fromYear, interval.fromTerm, interval.effectiveAt),
      returnCalendarActive: Boolean(interval.returnYear && interval.returnTerm && interval.returnEffectiveAt
        && activeByCalendar(interval.returnYear, interval.returnTerm, interval.returnEffectiveAt)) })));
    const serial = (value: object) => JSON.stringify(value);
    const comparable = (row: (typeof existing)[number]) => ({ studentId: row.studentId, decisionId: row.decisionId,
      decisionNumber: row.decisionNumber, fromYear: row.fromYear, fromTerm: row.fromTerm, effectiveAt: row.effectiveAt,
      returnDecisionId: row.returnDecisionId, returnYear: row.returnYear, returnTerm: row.returnTerm,
      returnEffectiveAt: row.returnEffectiveAt, isRevoked: row.isRevoked, fromCalendarActive: row.fromCalendarActive, returnCalendarActive: row.returnCalendarActive });
    const changes: Array<{ studentId: string; decisionId: string; before: object | null; after: object }> = [];
    const desired = new Set(candidates.map(row => row.decisionId));
    for (const candidate of candidates) {
      const previous = existing.find(row => row.decisionId === candidate.decisionId);
      if (previous && serial(comparable(previous)) === serial(candidate)) continue;
      changes.push({ studentId: candidate.studentId, decisionId: candidate.decisionId, before: previous ? comparable(previous) : null, after: candidate });
      if (apply) await tx.studentStudySuspension.upsert({ where: { decisionId: candidate.decisionId }, create: candidate, update: candidate });
    }
    for (const previous of existing.filter(row => !row.isRevoked && !desired.has(row.decisionId))) {
      changes.push({ studentId: previous.studentId, decisionId: previous.decisionId, before: comparable(previous), after: { ...comparable(previous), isRevoked: true } });
      if (apply) await tx.studentStudySuspension.update({ where: { id: previous.id }, data: { isRevoked: true } });
    }
    if (apply) for (const change of changes) await tx.auditLog.create({ data: { actorId, action: "student.study_suspension.sync",
      resourceType: "Student", resourceId: change.studentId, details: JSON.parse(serial(change)) as Prisma.InputJsonObject } });
    return { applied: apply, checked: students.length, changes };
  }, { timeout: 30_000 });
}
