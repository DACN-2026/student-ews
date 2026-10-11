import { prisma } from "@/lib/prisma";
import { buildAcademicTermLinks } from "../academic-terms";
import { ApiError } from "../utils/api-error";
import { loadSourceQuality } from "./academic-source-quality";
import { syncStudentClassDepartures } from "./student-class-departure";
import { STANDING_EFFECTS, assessAcademicStanding, isRevokedStandingDecision, standingDecisionPeriod, type StandingDecision, type StandingSources, type StandingEffect } from "./academic-standing-rules";

const object = (value: unknown): Record<string, unknown> => value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
export function readStandingReview(value: unknown): StandingDecision["review"] {
  const review = object(object(value).academicStandingReview);
  if (!STANDING_EFFECTS.includes(review.effect as StandingEffect) || typeof review.fromTermId !== "string"
    || (review.toTermId !== null && typeof review.toTermId !== "string") || typeof review.reason !== "string" || !review.reason.trim()
    || typeof review.verifiedBy !== "string" || !review.verifiedBy || typeof review.verifiedAt !== "string" || !Number.isFinite(Date.parse(review.verifiedAt))) return null;
  if (review.effect === "STUDY_DEADLINE" && (typeof review.studyDeadline !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(review.studyDeadline)
    || !Number.isFinite(Date.parse(review.studyDeadline)) || new Date(review.studyDeadline).toISOString().slice(0, 10) !== review.studyDeadline)) return null;
  return review as StandingDecision["review"];
}

/** Name contains the source's explicit admission-year range, not a guessed Kxx year. */
export function isBeforeCohortAdmission(academicYearCode: string, cohortName: string) {
  const admission = cohortName.match(/\((\d{4})\s*[-–]\s*\d{4}\)/)?.[1];
  return Boolean(admission && /^\d{4}-\d{4}$/.test(academicYearCode) && academicYearCode.slice(0, 4) < admission);
}

export async function loadAcademicStandingSources(studentIds: string[], programCode: string, assessmentTermId: string, cohortId: string) {
  const result = new Map<string, StandingSources>();
  if (!studentIds.length) return result;
  const [terms, years, cohort, program] = await Promise.all([
    prisma.academicTerm.findMany({ where: { deletedAt: null } }),
    prisma.academicYear.findMany({ where: { deletedAt: null }, select: { id: true, sYearCode: true } }),
    prisma.cohort.findUnique({ where: { id: cohortId } }),
    prisma.trainingProgram.findFirst({ where: { sProgramCode: programCode, deletedAt: null } }),
  ]);
  const yearsById = new Map(years.map(year => [year.id, year.sYearCode]));
  const timeline = terms.map(term => ({ id: term.id, academicYearId: term.academicYearId, academicYearCode: yearsById.get(term.academicYearId) || "",
    termOrder: term.sTermOrder, isSummer: term.sIsSummer, startDate: term.startDate, endDate: term.endDate,
    label: `${term.sTermCode} (${yearsById.get(term.academicYearId) || ""})`,
    beforeAdmission: isBeforeCohortAdmission(yearsById.get(term.academicYearId) || "", cohort?.sCohortName || "") }));
  const assessment = terms.find(term => term.id === assessmentTermId);
  if (!assessment) throw new ApiError("Không tìm thấy kỳ xét học vụ.", "NOT_FOUND", 404);
  const previousTermId = buildAcademicTermLinks(timeline).get(assessmentTermId)?.previousMainTermId || null;
  const periodIds = [assessmentTermId, ...(previousTermId ? [previousTermId] : [])];
  const [summaries, offerings, decisions] = await Promise.all([
    prisma.studentTermSummary.findMany({ where: { studentId: { in: studentIds }, sProgramCode: programCode, academicTermId: { in: periodIds } },
      select: { studentId: true, academicTermId: true, registeredCredits: true } }),
    prisma.studentCourseOffering.findMany({ where: { studentId: { in: studentIds }, sProgramCode: programCode, academicTermId: { in: periodIds } },
      // Zero-credit SHCD activity records do not establish course registration.
      select: { studentId: true, academicTermId: true, sCredits: true } }),
    prisma.studentDecision.findMany({ where: { studentId: { in: studentIds }, deletedAt: null } }),
  ]);
  const types = decisions.length ? await prisma.decisionType.findMany({ where: { decisionTypeId: { in: [...new Set(decisions.map(decision => decision.decisionTypeId))] }, deletedAt: null } }) : [];
  const typeById = new Map(types.map(type => [type.decisionTypeId, type.decisionName]));
  const qualityByStudent = await loadSourceQuality(studentIds, programCode, assessmentTermId);
  const sumByPeriod = new Map(summaries.map(summary => [`${summary.studentId}:${summary.academicTermId}`, summary]));
  const offeringCounts = new Map<string, number>();
  for (const offering of offerings) { if (offering.sCredits <= 0) continue; const key = `${offering.studentId}:${offering.academicTermId}`; offeringCounts.set(key, (offeringCounts.get(key) || 0) + 1); }
  const numeric = (value: unknown) => value == null || !Number.isFinite(Number(value)) ? null : Number(value);
  for (const studentId of studentIds) {
    const summary = sumByPeriod.get(`${studentId}:${assessmentTermId}`), previous = sumByPeriod.get(`${studentId}:${previousTermId}`);
    result.set(studentId, { assessmentTermId, previousTermId, summaryPresent: Boolean(summary),
      registeredOfferings: offeringCounts.get(`${studentId}:${assessmentTermId}`) || 0, summaryRegisteredCredits: numeric(summary?.registeredCredits),
      previousSummaryPresent: Boolean(previous), previousRegisteredOfferings: offeringCounts.get(`${studentId}:${previousTermId}`) || 0,
      previousRegisteredCredits: numeric(previous?.registeredCredits), cohortCode: cohort?.sCohortCode || "", studyType: program?.sStudyType || "",
      assessmentDate: assessment.endDate?.toISOString() || null, terms: timeline,
      beforeAdmission: isBeforeCohortAdmission(yearsById.get(assessment.academicYearId) || "", cohort?.sCohortName || ""),
      sourceQuality: qualityByStudent.get(studentId) || null,
      decisions: decisions.filter(decision => decision.studentId === studentId).map(decision => ({ id: decision.id, termId: decision.academicTermId,
        number: decision.sDecisionNumber, signedAt: decision.sSignDate?.toISOString() || null, name: decision.sDecisionName,
        typeName: typeById.get(decision.decisionTypeId) || "", fullText: decision.sFullText, review: readStandingReview(decision.sourcePayload) })),
    });
  }
  return result;
}

/** Records verification of an existing signed decision; it never creates/approves a school decision. */
export async function verifyAcademicStandingDecision(studentId: string, data: Record<string, unknown>, actorId: string) {
  if (typeof data.decisionId !== "string" || typeof data.fromTermId !== "string" || !STANDING_EFFECTS.includes(data.effect as StandingEffect)
    || typeof data.reason !== "string" || !data.reason.trim() || data.reason.length > 2000
    || (data.toTermId !== undefined && data.toTermId !== null && typeof data.toTermId !== "string")) throw new ApiError("Cần chọn quyết định, loại hiệu lực, kỳ áp dụng và lý do đã xác minh.", "INVALID_REQUEST", 422);
  const [decision, terms, years] = await Promise.all([
    prisma.studentDecision.findFirst({ where: { id: data.decisionId, studentId, deletedAt: null } }),
    prisma.academicTerm.findMany({ where: { deletedAt: null } }),
    prisma.academicYear.findMany({ where: { deletedAt: null }, select: { id: true, sYearCode: true } }),
  ]);
  if (!decision) throw new ApiError("Không tìm thấy quyết định của sinh viên.", "NOT_FOUND", 404);
  if (isRevokedStandingDecision({ fullText: decision.sFullText })) throw new ApiError("Nguồn đã ghi nhận xóa/hủy quyết định; không thể dùng làm căn cứ miễn hoặc xử lý học vụ.", "REVOKED_DECISION", 422);
  if (!decision.sDecisionNumber.trim() || !decision.sSignDate || decision.sSignDate.getTime() > Date.now()) throw new ApiError("Chỉ xác minh quyết định đã có số và ngày ký hợp lệ.", "UNSIGNED_DECISION", 422);
  const from = terms.find(term => term.id === data.fromTermId), to = data.toTermId ? terms.find(term => term.id === data.toTermId) : null;
  if (!from || from.sIsSummer || data.toTermId && (!to || to.sIsSummer)) throw new ApiError("Kỳ áp dụng phải là học kỳ chính hợp lệ.", "INVALID_REQUEST", 422);
  const yearById = new Map(years.map(year => [year.id, year.sYearCode]));
  const order = (term: typeof from) => `${yearById.get(term.academicYearId)}:${term.sTermOrder}`;
  if (to && order(to) < order(from)) throw new ApiError("Kỳ kết thúc phải từ kỳ bắt đầu trở đi.", "INVALID_REQUEST", 422);
  if (data.effect === "APPROVED_LEAVE" && !to) throw new ApiError("Cần xác minh cả kỳ bắt đầu và kết thúc của quyết định nghỉ học.", "INVALID_REQUEST", 422);
  if (data.effect === "STUDY_DEADLINE" && (typeof data.studyDeadline !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(data.studyDeadline) || !Number.isFinite(Date.parse(data.studyDeadline)) || new Date(data.studyDeadline).toISOString().slice(0, 10) !== data.studyDeadline)) throw new ApiError("Cần nhập hạn đào tạo tối đa đã đối chiếu từ quyết định.", "INVALID_REQUEST", 422);
  const review = { effect: data.effect as StandingEffect, fromTermId: from.id, toTermId: to?.id || null, reason: data.reason.trim(),
    verifiedBy: actorId, verifiedAt: new Date().toISOString(), studyDeadline: data.effect === "STUDY_DEADLINE" ? data.studyDeadline as string : null };
  await prisma.$transaction(async tx => {
    const updated = await tx.studentDecision.updateMany({ where: { id: decision.id, studentId, deletedAt: null, updatedAt: decision.updatedAt },
      data: { sourcePayload: { ...object(decision.sourcePayload), academicStandingReview: review } } });
    if (!updated.count) throw new ApiError("Quyết định đã thay đổi. Tải lại để xác minh.", "CONFLICT", 409);
    await tx.auditLog.create({ data: { actorId, action: "academic_warning.decision.verify", resourceType: "StudentDecision", resourceId: decision.id,
      details: { studentId, previous: readStandingReview(decision.sourcePayload) || null, review } } });
  });
  await syncStudentClassDepartures([studentId], true, actorId);
  return { decisionId: decision.id, review };
}

export async function studentStandingReviewContext(studentId: string, termId: string) {
  const student = await prisma.student.findFirst({ where: { id: studentId, deletedAt: null } });
  const studentClass = student && await prisma.class.findFirst({ where: { classId: student.sClassStudentId || "", deletedAt: null } });
  if (!student?.sStudyProgramId || !studentClass?.cohortId) throw new ApiError("Chưa xác định được chương trình hoặc khóa học của sinh viên.", "STUDENT_SCOPE_UNAVAILABLE", 422);
  const sources = await loadAcademicStandingSources([student.id], student.sStudyProgramId, termId, studentClass.cohortId);
  const source = sources.get(student.id)!;
  return { period: source.terms.find(term => term.id === termId), assessment: assessAcademicStanding(source), sourceQuality: source.sourceQuality,
    decisions: source.decisions.map(decision => ({ ...decision, isRevoked: isRevokedStandingDecision(decision), periodBasis: standingDecisionPeriod(decision, source.terms).basis })),
    terms: source.terms.filter(term => !term.isSummer).map(term => ({ id: term.id, label: term.label })) };
}
