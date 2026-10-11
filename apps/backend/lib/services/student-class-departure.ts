import { Prisma } from "@prisma/client";
import { prisma } from "../prisma";
import { compareAcademicTerms } from "../academic-terms";
import { ApiError } from "../utils/api-error";
import { standingDecisionEffect, standingDecisionPeriod, type StandingDecision, type StandingTerm } from "./academic-standing-rules";
import { readStandingReview } from "./academic-standing";
import { syncStudentStudySuspensions } from "./student-study-suspension";

export function resolveClassDeparture(decisions: StandingDecision[], terms: StandingTerm[], now = new Date()) {
  const events = decisions.flatMap(decision => {
    const effect = standingDecisionEffect(decision);
    if (!["LEFT_PROGRAM", "RETURNED"].includes(effect || "") || !decision.signedAt || Date.parse(decision.signedAt) > now.getTime()) return [];
    const { from } = standingDecisionPeriod(decision, terms, effect);
    if (!from) return [];
    return [{ decision, effect, from }];
  }).sort((a, b) => compareAcademicTerms(a.from, b.from) || String(a.decision.signedAt).localeCompare(String(b.decision.signedAt)) || a.decision.id.localeCompare(b.decision.id));
  let departure: typeof events[number] | null = null;
  for (const event of events) {
    // A future return cannot reactivate the student today.
    if (event.effect === "RETURNED" && (!event.from.startDate || event.from.startDate <= now)) departure = null;
    else if (event.effect === "LEFT_PROGRAM") departure = event;
  }
  if (!departure) return null;
  const signed = new Date(departure.decision.signedAt!);
  return { decisionId: departure.decision.id, yearCode: departure.from.academicYearCode, termOrder: departure.from.termOrder,
    effectiveAt: departure.from.startDate && new Date(departure.from.startDate) > signed ? new Date(departure.from.startDate) : signed };
}

/** Materialize decision scope without changing source membership or deleting history. */
export async function syncStudentClassDepartures(studentIds?: string[], apply = false, actorId?: string) {
  const departureResult = await prisma.$transaction(async tx => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext('student-class-departure'))`;
    const [students, decisions, types, terms, years] = await Promise.all([
      tx.student.findMany({ where: { deletedAt: null, ...(studentIds ? { id: { in: studentIds } } : {}) } }),
      tx.studentDecision.findMany({ where: { deletedAt: null, ...(studentIds ? { studentId: { in: studentIds } } : {}) } }),
      tx.decisionType.findMany({ where: { deletedAt: null } }),
      tx.academicTerm.findMany({ where: { deletedAt: null } }),
      tx.academicYear.findMany({ where: { deletedAt: null } }),
    ]);
    const yearById = new Map(years.map(year => [year.id, year.sYearCode]));
    const typeById = new Map(types.map(type => [type.decisionTypeId, type.decisionName]));
    const timeline: StandingTerm[] = terms.map(term => ({ id: term.id, academicYearId: term.academicYearId,
      academicYearCode: yearById.get(term.academicYearId) || "", termOrder: term.sTermOrder, isSummer: term.sIsSummer,
      startDate: term.startDate, endDate: term.endDate, label: term.sTermName }));
    const changes = [];
    for (const student of students) {
      const departure = resolveClassDeparture(decisions.filter(row => row.studentId === student.id).map(row => ({ id: row.id,
        termId: row.academicTermId, number: row.sDecisionNumber, signedAt: row.sSignDate?.toISOString() || null,
        name: row.sDecisionName, typeName: typeById.get(row.decisionTypeId) || "", fullText: row.sFullText,
        review: readStandingReview(row.sourcePayload) })), timeline);
      const data = { leftClassDecisionId: departure?.decisionId || null, leftClassFromYear: departure?.yearCode || null,
        leftClassFromTerm: departure?.termOrder ?? null, leftClassEffectiveAt: departure?.effectiveAt || null };
      if (student.leftClassDecisionId === data.leftClassDecisionId && student.leftClassFromYear === data.leftClassFromYear
        && student.leftClassFromTerm === data.leftClassFromTerm && student.leftClassEffectiveAt?.getTime() === data.leftClassEffectiveAt?.getTime()) continue;
      const change = { studentId: student.id, studentCode: student.sStudentId, studentName: student.sFullName,
        before: { decisionId: student.leftClassDecisionId, yearCode: student.leftClassFromYear, termOrder: student.leftClassFromTerm,
          effectiveAt: student.leftClassEffectiveAt?.toISOString() || null },
        after: departure ? { ...departure, effectiveAt: departure.effectiveAt.toISOString() } : null };
      changes.push(change);
      if (apply) {
        const updated = await tx.student.updateMany({ where: { id: student.id, updatedAt: student.updatedAt }, data });
        if (!updated.count) throw new ApiError("Hồ sơ đã thay đổi trong lúc đồng bộ trạng thái rời lớp.", "CONFLICT", 409);
        await tx.auditLog.create({ data: { actorId, action: "student.departure.sync", resourceType: "Student", resourceId: student.id,
          details: change as Prisma.InputJsonObject } });
      }
    }
    return { applied: apply, checked: students.length, changes };
  }, { timeout: 30_000 });
  const suspensions = await syncStudentStudySuspensions(studentIds, apply, actorId);
  return { ...departureResult, suspensions };
}
