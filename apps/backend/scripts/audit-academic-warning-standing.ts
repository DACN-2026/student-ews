/** Read-only audit. Student details stay in the local report; stdout contains aggregate counts only. */
import fs from "node:fs";
import path from "node:path";
import { prisma } from "../lib/prisma";
import { findEarlyWarningPolicy } from "../lib/services/early-warning-policy";
import { AcademicWarningAutomationService } from "../lib/services/academic-warning-automation";
import { AcademicWarningsService } from "../lib/services/academic-warnings";
import { loadAcademicStandingSources, readStandingReview } from "../lib/services/academic-standing";
import { assessAcademicStanding, isRevokedStandingDecision, standingDecisionEffect, standingDecisionPeriod } from "../lib/services/academic-standing-rules";
import { calculateAssessmentTermFailedCredits } from "../lib/services/academic-warning-capabilities";
import { loadAcademicDebt } from "../lib/services/academic-debt";
import { sameDebtEvidence } from "../lib/services/academic-warning-evidence";
import { calculateAcademicWarningProgressSignals } from "../lib/services/academic-warning-progress";
import { courseOutcome, isConditionalCourse } from "../lib/academic-course-rules";
import { parseEarlyWarningSettings } from "../lib/services/early-warning-settings";

const object = (value: unknown): Record<string, unknown> => value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
const number = (value: unknown) => value == null || !Number.isFinite(Number(value)) ? null : Number(value);
const countBy = (rows: string[]) => rows.reduce<Record<string, number>>((counts, value) => { counts[value] = (counts[value] || 0) + 1; return counts; }, {});
const sameNumber = (a: unknown, b: unknown) => {
  const left = number(a), right = number(b);
  return left == null || right == null ? left === right : Math.abs(left - right) <= 1e-9;
};

async function main() {
  const termId = process.argv.find(arg => arg.startsWith("--term="))?.slice(7) || (await AcademicWarningsService.resolveRunAssessmentTerm({})).assessmentTerm.id;
  const term = await prisma.academicTerm.findUniqueOrThrow({ where: { id: termId } });
  const year = await prisma.academicYear.findUniqueOrThrow({ where: { id: term.academicYearId } });
  const { definition } = await findEarlyWarningPolicy();
  const scopes = await AcademicWarningAutomationService.evaluationScopes(definition.regulatory.applicableCohortIds);
  const [students, classes, decisions, types, summaries, offerings] = await Promise.all([
    prisma.student.findMany({ where: { deletedAt: null }, orderBy: { sStudentId: "asc" } }),
    prisma.class.findMany({ where: { deletedAt: null } }), prisma.studentDecision.findMany({ where: { deletedAt: null } }),
    prisma.decisionType.findMany({ where: { deletedAt: null } }),
    prisma.studentTermSummary.findMany({ where: { academicTermId: termId } }), prisma.studentCourseOffering.findMany({ where: { academicTermId: termId } }),
  ]);
  const grades = await prisma.studentCourseGrade.findMany({ where: { offeringId: { in: offerings.map(row => row.id) } } });
  const gradeById = new Map(grades.map(row => [row.offeringId, row]));
  const summaryByStudent = new Map(summaries.map(row => [`${row.studentId}:${row.sProgramCode}`, row]));
  const typeById = new Map(types.map(row => [row.decisionTypeId, row.decisionName]));
  const localDecisions = decisions.map(row => ({ id: row.id, termId: row.academicTermId, number: row.sDecisionNumber, signedAt: row.sSignDate?.toISOString() || null,
    name: row.sDecisionName, typeName: typeById.get(row.decisionTypeId) || "", fullText: row.sFullText, review: readStandingReview(row.sourcePayload) }));
  const discrepancies: Array<{ studentCode: string; field: string; recorded: unknown; expected: unknown }> = [];
  const missing: Array<Record<string, unknown>> = [];
  const exclusions: Array<Record<string, unknown>> = [];
  const standingRows: Array<Record<string, unknown>> = [];
  const currentStanding: Array<Record<string, unknown>> = [];
  const incompleteData: Array<Record<string, unknown>> = [];
  const missingResultIds: string[] = [];
  const allResults: Array<{ businessStatus: string }> = [];
  const ruleCoverage: string[] = [], debtCoverage: string[] = [], progressCoverage: string[] = [];
  let assessed = 0, gpaMissing = 0, scopedStudents = 0, missingRegistrations = 0, conditionalCount = 0, unresolvedGradeCount = 0;
  const currentTerm = await prisma.academicTerm.findFirst({ where: { isCurrent: true, deletedAt: null } });
  for (const scope of scopes) {
    const classCodes = new Set(classes.filter(row => row.cohortId === scope.cohortId).map(row => row.classId));
    const members = students.filter(row => row.sIsInClass && row.sStudyProgramId === scope.programCode && classCodes.has(row.sClassStudentId || ""));
    scopedStudents += members.length;
    const sources = await loadAcademicStandingSources(members.map(row => row.id), scope.programCode, termId, scope.cohortId);
    const leaveMembers = members.filter(student => sources.get(student.id)!.decisions.some(decision =>
      ["APPROVED_LEAVE", "LEFT_PROGRAM", "RETURNED"].includes(standingDecisionEffect(decision) || "") || isRevokedStandingDecision(decision)));
    if (currentTerm && leaveMembers.length) {
      const currentSources = await loadAcademicStandingSources(leaveMembers.map(row => row.id), scope.programCode, currentTerm.id, scope.cohortId);
      for (const student of leaveMembers) {
        const standing = assessAcademicStanding({ ...currentSources.get(student.id)!, termResultsExpected: false });
        currentStanding.push({ studentCode: student.sStudentId, studentName: student.sFullName, period: currentSources.get(student.id)!.terms.find(row => row.id === currentTerm.id)?.label,
          excluded: standing.excluded, exemption: standing.exemption, absenceEvidence: standing.absenceEvidence });
      }
    }
    const latest = await prisma.academicWarningRun.findFirst({ where: { assessmentAcademicTermId: termId, cohortId: scope.cohortId, trainingProgramId: scope.trainingProgramId,
      status: "completed", runMode: "OFFICIAL", executionProfile: "QD600_PARTIAL_REGULATORY" }, orderBy: [{ completedAt: "desc" }, { startedAt: "desc" }] });
    const results = latest ? await prisma.academicWarningStudentResult.findMany({ where: { runId: latest.id } }) : [];
    const resultByStudent = new Map(results.map(row => [row.studentId, row]));
    const snapshotStudents = object(latest?.sourceSnapshot).students;
    const snapshots = new Map((Array.isArray(snapshotStudents) ? snapshotStudents : []).map(row => [String(object(row).id), object(row)]));
    const eligibleIds = members.filter(row => !assessAcademicStanding(sources.get(row.id)!).excluded).map(row => row.id);
    const [debts, progress] = await Promise.all([
      loadAcademicDebt(eligibleIds, scope.trainingProgramId, termId),
      calculateAcademicWarningProgressSignals({ students: eligibleIds.map(id => ({ id })), cohortId: scope.cohortId,
        trainingProgramId: scope.trainingProgramId, assessmentTermId: termId, programCode: scope.programCode }),
    ]);
    for (const student of members) {
      const source = sources.get(student.id)!;
      const standing = assessAcademicStanding(source);
      const result = resultByStudent.get(student.id);
      const relevant = source.decisions.filter(row => standingDecisionEffect(row) || isRevokedStandingDecision(row));
      const identity = { studentCode: student.sStudentId, studentName: student.sFullName, classCode: student.sClassStudentId };
      if (relevant.length) standingRows.push({ ...identity, excluded: standing.excluded, exemption: standing.exemption, businessStatus: result?.businessStatus || null,
        consecutiveOfficialWarnings: standing.consecutiveOfficialWarnings,
        decisions: relevant.map(row => ({ number: row.number, signedAt: row.signedAt, name: row.name, fullText: row.fullText,
          effect: standingDecisionEffect(row), revoked: isRevokedStandingDecision(row), periodBasis: standingDecisionPeriod(row, source.terms).basis })) });
      if (!source.summaryPresent) missing.push({ ...identity, excluded: standing.excluded, exemption: standing.exemption, absenceEvidence: standing.absenceEvidence, businessStatus: result?.businessStatus || null });
      if (standing.excluded) {
        exclusions.push({ ...identity, exemption: standing.exemption });
        if (result) discrepancies.push({ studentCode: student.sStudentId, field: "excluded_student_has_result", recorded: result.businessStatus, expected: "EXCLUDED" });
        continue;
      }
      if (!result) { discrepancies.push({ studentCode: student.sStudentId, field: "missing_persisted_result", recorded: null, expected: "EVALUATED" }); continue; }
      assessed++; allResults.push(result); ruleCoverage.push(result.regulatoryCoverage || "UNKNOWN");
      if (!source.summaryPresent) missingResultIds.push(result.id);
      const snapshot = snapshots.get(student.id) || {};
      const capability = object(snapshot.qd600CapabilityData);
      const recordedDebt = object(capability.accumulatedDebtCreditCalculation);
      const recordedProgress = object(capability.trainingProgress);
      const summary = summaryByStudent.get(`${student.id}:${scope.programCode}`);
      if (summary?.gpa4 == null) {
        gpaMissing++;
        if (summary) incompleteData.push({ ...identity, field: "term_gpa_unavailable", sourceGpa4: object(summary.sourcePayload).TB_HK_4 ?? null });
      }
      if (standing.absenceEvidence !== "REGISTERED") missingRegistrations++;
      if (!sameNumber(result.termGpa4, summary?.gpa4)) discrepancies.push({ studentCode: student.sStudentId, field: "termGpa4", recorded: number(result.termGpa4), expected: number(summary?.gpa4) });
      if (!sameNumber(result.cumulativeGpa4, summary?.cumulativeGpa4)) discrepancies.push({ studentCode: student.sStudentId, field: "cumulativeGpa4", recorded: number(result.cumulativeGpa4), expected: number(summary?.cumulativeGpa4) });
      const studentOfferings = offerings.filter(row => row.studentId === student.id && row.sProgramCode === scope.programCode);
      const attempts = studentOfferings.map(row => {
        const grade = gradeById.get(row.id);
        const outcome = grade ? courseOutcome({ ...grade, score10: number(grade.score10), score4: number(grade.score4) }) : "unknown";
        if (isConditionalCourse(row.sCurriculumId, row.sCourseName)) conditionalCount++;
        else if (outcome === "unknown" || outcome === "pending") unresolvedGradeCount++;
        return { offeringId: row.id, academicTermId: termId, credits: row.sCredits, courseCode: row.sCurriculumId, courseName: row.sCourseName,
          scoreStatus: grade?.scoreStatus || null, hasFinalGrade: outcome === "passed" || outcome === "failed", isPass: outcome === "passed" ? true : outcome === "failed" ? false : null, specialCode: grade?.specialCode || null };
      });
      const failed = calculateAssessmentTermFailedCredits(termId, attempts);
      const recordedFailed = object(capability.failedCreditCalculation);
      for (const field of ["registeredCredits", "failedCredits", "failedCreditRatio"] as const) if (!sameNumber(recordedFailed[field], failed[field])) discrepancies.push({ studentCode: student.sStudentId, field, recorded: recordedFailed[field], expected: failed[field] });
      const debt = debts.get(student.id);
      debtCoverage.push(debt?.dataStatus || "MISSING");
      if (debt?.dataStatus !== "COMPLETE") incompleteData.push({ ...identity, field: "debt", evidence: debt || null });
      if (debt && (!sameNumber(recordedDebt.accumulatedDebtCredits, debt.accumulatedDebtCredits) || !sameDebtEvidence(recordedDebt, debt))) discrepancies.push({ studentCode: student.sStudentId, field: "debt_evidence", recorded: recordedDebt.accumulatedDebtCredits, expected: debt.accumulatedDebtCredits });
      const signal = progress.get(student.id);
      progressCoverage.push(signal?.dataStatus || "MISSING");
      if (signal?.dataStatus !== "COMPLETE") incompleteData.push({ ...identity, field: "progress", evidence: signal || null });
      if (signal && !sameNumber(recordedProgress.creditDeficit, signal.creditDeficit)) discrepancies.push({ studentCode: student.sStudentId, field: "progress_deficit", recorded: recordedProgress.creditDeficit, expected: signal.creditDeficit });
      if (result.academicWarningDecisions !== standing.officialWarningCount) discrepancies.push({ studentCode: student.sStudentId, field: "official_warning_count", recorded: result.academicWarningDecisions, expected: standing.officialWarningCount });
      if (!source.summaryPresent && result.businessStatus !== "HIGH_RISK") discrepancies.push({ studentCode: student.sStudentId, field: "missing_summary_priority", recorded: result.businessStatus, expected: "HIGH_RISK" });
    }
  }
  const missingInterventions = missingResultIds.length ? await prisma.warningAction.findMany({
    where: { caseType: "EARLY_WARNING_CASE", latestWarningResultId: { in: missingResultIds } },
    select: { studentId: true, status: true },
  }) : [];
  const summary = { checkedAt: new Date().toISOString(), period: `${term.sTermCode} (${year.sYearCode})`, students: students.length,
    activeRoster: students.filter(row => row.sIsInClass).length, scopes: scopes.length, scopedStudents, assessed, exclusions: exclusions.length,
    missingSummaries: missing.length, missingHighRisk: missing.filter(row => row.businessStatus === "HIGH_RISK").length,
    missingExempted: missing.filter(row => row.excluded).length, gpaMissing, missingRegistrations, conditionalCount, unresolvedGradeCount,
    decisionRecords: decisions.length, decisionLabels: countBy(decisions.map(row => row.sDecisionName)),
    revokedDecisions: localDecisions.filter(isRevokedStandingDecision).length,
    officialWarningDecisions: localDecisions.filter(row => standingDecisionEffect(row) === "ACADEMIC_WARNING").length,
    missingStudentsWithIntervention: new Set(missingInterventions.map(row => row.studentId)).size,
    missingInterventionStatuses: countBy(missingInterventions.map(row => row.status)),
    earlyWarningSettings: parseEarlyWarningSettings(definition.advisory.earlyWarning),
    businessStatuses: countBy(allResults.map(row => row.businessStatus)), regulatoryCoverage: countBy(ruleCoverage), debtCoverage: countBy(debtCoverage), progressCoverage: countBy(progressCoverage),
    discrepancyCount: discrepancies.length };
  const directory = path.resolve(process.cwd(), "../../docs/reports");
  const auditDate = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Ho_Chi_Minh" }).format(new Date());
  const outputPath = path.join(directory, `academic-warning-standing-audit-${auditDate}.json`);
  fs.mkdirSync(directory, { recursive: true });
  fs.writeFileSync(outputPath, JSON.stringify({ summary, exclusions, missing, standingStudents: standingRows, currentStanding, incompleteData, discrepancies }, null, 2) + "\n");
  console.log(JSON.stringify({ summary, outputPath }));
}
main().catch(error => { console.error(error instanceof Error ? error.message : "Audit failed"); process.exitCode = 1; }).finally(() => prisma.$disconnect());
