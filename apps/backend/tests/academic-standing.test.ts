import assert from "node:assert/strict";
import test from "node:test";
import { assessAcademicStanding, standingDecisionEffect, standingDecisionPeriod, type StandingSources, type StandingDecision } from "../lib/services/academic-standing-rules";
import { readStandingReview, isBeforeCohortAdmission, verifyAcademicStandingDecision } from "../lib/services/academic-standing";
import { evaluateQd600Article18 } from "../lib/services/academic-warning-qd600-rules";
import { createQd600PolicyDefinition } from "../lib/services/academic-warning-policy";
import { createAcademicWarningCapabilitySnapshot, createQd600StudentCapabilityData } from "../lib/services/academic-warning-capabilities";
import { regulatoryAssessment } from "../lib/services/warning-regulatory-assessment";
import { prisma } from "../lib/prisma";

const terms = ["2023-2024", "2024-2025", "2025-2026"].flatMap(year => [1, 2].map(order => ({
  id: `${year}:${order}`, academicYearId: year, academicYearCode: year, termOrder: order, isSummer: false, label: `${year}:${order}`,
})));
function source(overrides: Partial<StandingSources> = {}): StandingSources {
  return { assessmentTermId: "2024-2025:2", previousTermId: "2024-2025:1", summaryPresent: false,
    registeredOfferings: 0, summaryRegisteredCredits: null, previousSummaryPresent: true, previousRegisteredCredits: 18,
    previousRegisteredOfferings: 6, cohortCode: "K48", studyType: "Chính quy", assessmentDate: "2025-06-30",
    terms, decisions: [], ...overrides };
}
function decision(effect: string, overrides: Partial<StandingDecision> = {}): StandingDecision {
  return { id: "decision", termId: "2024-2025:2", number: "100/QĐ-ĐHDL", signedAt: "2025-08-06", name: effect, typeName: effect, ...overrides };
}
const codes = (s: StandingSources) => assessAcademicStanding(s).rules.filter(rule => rule.isThresholdBreached).map(rule => rule.ruleCode);

test("missing summaries become persisted high-priority risk without fabricating GPA or an academic sanction", () => {
  const standing = source();
  assert.ok(codes(standing).includes("EARLY_MISSING_TERM_DATA"));
  assert.equal(assessAcademicStanding(standing).absenceEvidence, "UNVERIFIED");
  const result = evaluateQd600Article18({ policyDefinition: createQd600PolicyDefinition(),
    capabilities: createAcademicWarningCapabilitySnapshot({ debtVerified: true }),
    capabilityData: createQd600StudentCapabilityData({ assessmentTermId: standing.assessmentTermId, attempts: [], cumulativeCredits: null, isFirstMainSemester: null }),
    termGpa4: null, cumulativeGpa4: null, termKind: "MAIN", academicStandingSources: standing });
  assert.equal(result.businessStatus, "HIGH_RISK");
  assert.equal(regulatoryAssessment(result.rules), "UNRESOLVED");
  assert.equal(result.rules.find(rule => rule.ruleCode === "QD600_TERM_GPA")?.observedValue, null);
  assert.equal(result.rules.find(rule => rule.ruleCode === "EARLY_MISSING_TERM_DATA")?.sourceType, "OPERATIONAL");
});

test("no summary, confirmed zero registration and actual registration are separate facts", () => {
  assert.equal(assessAcademicStanding(source({ summaryPresent: true, summaryRegisteredCredits: 0 })).absenceEvidence, "CONFIRMED_ZERO");
  assert.equal(assessAcademicStanding(source({ registeredOfferings: 1 })).absenceEvidence, "REGISTERED");
  assert.equal(codes(source({ registeredOfferings: 1 })).includes("EARLY_NO_REGISTRATION"), false);
  assert.equal(codes(source({ registeredOfferings: 1 })).includes("EARLY_MISSING_TERM_DATA"), true);
  assert.equal(codes(source({ registeredOfferings: 1, termResultsExpected: false })).includes("EARLY_MISSING_TERM_DATA"), false);
});

test("a signed leave freezes assessment from its effective term until a return decision, including late-issued decisions", () => {
  const leave = decision("Nghỉ học tạm thời");
  assert.equal(assessAcademicStanding(source({ decisions: [leave] })).excluded, true);
  assert.equal(assessAcademicStanding(source({ decisions: [leave], summaryPresent: true, summaryRegisteredCredits: 0 })).excluded, true);
  assert.equal(assessAcademicStanding(source({ decisions: [leave], registeredOfferings: 1 })).excluded, true);
  assert.equal(assessAcademicStanding(source({ decisions: [leave], assessmentTermId: "2025-2026:1" })).excluded, true);
  const review = { effect: "APPROVED_LEAVE" as const, fromTermId: "2024-2025:1", toTermId: "2025-2026:1", reason: "Đối chiếu kỳ nghỉ theo quyết định đã ký", verifiedBy: "advisor", verifiedAt: "2025-08-07" };
  assert.equal(assessAcademicStanding(source({ decisions: [{ ...leave, review }], assessmentTermId: "2025-2026:1" })).excluded, true);
  assert.equal(assessAcademicStanding(source({ decisions: [{ ...leave, review }], assessmentTermId: "2025-2026:2" })).excluded, true);
});

test("unsigned, future, irrelevant and incoming-transfer decisions cannot excuse absence", () => {
  for (const invalid of [decision("Nghỉ học tạm thời", { number: "" }), decision("Nghỉ học tạm thời", { signedAt: null }),
    decision("Nghỉ học tạm thời", { signedAt: "2099-01-01" }), decision("Nghỉ học tạm thời", { termId: "2025-2026:1" }),
    decision("Tiếp nhận Chuyển trường"), decision("Quyết định khác"), decision("Khen thưởng", { name: "Khen thưởng sinh viên tránh bị thôi học" })]) {
    assert.equal(assessAcademicStanding(source({ decisions: [invalid] })).excluded, false);
  }
  assert.equal(standingDecisionEffect(decision("Quyết định khác")), null);
});

test("return-to-study restores monitoring; withdrawal remains effective in subsequent terms", () => {
  const leave = decision("Nghỉ học tạm thời", { termId: "2024-2025:1", signedAt: "2024-09-01" });
  const returned = decision("Tiếp nhận Nghỉ học tạm thời", { id: "return", signedAt: "2025-02-01" });
  assert.equal(assessAcademicStanding(source({ decisions: [leave, returned] })).excluded, false);
  assert.equal(assessAcademicStanding(source({ decisions: [decision("Thôi học")], assessmentTermId: "2025-2026:1" })).excluded, true);
});

test("explicit leave semesters override the source recording bucket; summer leave does not excuse HK2", () => {
  const timeline = [...terms, { id: "2024-2025:3", academicYearId: "2024-2025", academicYearCode: "2024-2025", termOrder: 3, isSummer: true, label: "HK3" }];
  const leave = decision("Nghỉ học tạm thời", { fullText: "Nghỉ học tạm thời(HK3, 2024-2025; HK1, 2025-2026) (Nghỉ 1 học kỳ)" });
  assert.equal(assessAcademicStanding(source({ terms: timeline, decisions: [leave] })).excluded, false);
  assert.equal(assessAcademicStanding(source({ terms: timeline, decisions: [leave], assessmentTermId: "2025-2026:1" })).excluded, true);
  assert.equal(assessAcademicStanding(source({ terms: timeline, decisions: [leave, decision("Tiếp nhận Nghỉ học tạm thời", { id: "returned", termId: "2025-2026:1", signedAt: "2025-08-07" })], assessmentTermId: "2025-2026:1" })).excluded, false);
});

test("the stated leave end or arrow boundary never automatically resumes monitoring", () => {
  const leave = decision("Nghỉ học tạm thời", { termId: "2024-2025:1", fullText: "Nghỉ học tạm thời(NH 2024-2025) (Nghỉ 2 học kỳ)" });
  assert.equal(assessAcademicStanding(source({ decisions: [leave] })).excluded, true);
  assert.equal(assessAcademicStanding(source({ decisions: [leave], assessmentTermId: "2025-2026:1" })).excluded, true);
  const ranged = { ...leave, fullText: "Nghỉ học tạm thời(HK1, 2024-2025 đến hết HK1, 2025-2026)" };
  assert.equal(assessAcademicStanding(source({ decisions: [ranged], assessmentTermId: "2025-2026:1" })).excluded, true);
  const arrow = { ...leave, fullText: "Nghỉ học tạm thời(HK1, 2024-2025 => HK1, 2025-2026)" };
  assert.equal(assessAcademicStanding(source({ decisions: [arrow] })).excluded, true);
  assert.equal(assessAcademicStanding(source({ decisions: [arrow], assessmentTermId: "2025-2026:1" })).excluded, true);
  assert.equal(standingDecisionPeriod(arrow, terms).basis, "BOUNDARY_REVIEW");
});

test("source-deleted decisions never excuse absence, even with stale verified metadata", () => {
  const revoked = decision("Nghỉ học tạm thời", { fullText: "[Xóa quyết định 931/QĐ-ĐHDL]" });
  assert.equal(standingDecisionEffect(revoked), null);
  assert.equal(assessAcademicStanding(source({ decisions: [revoked] })).excluded, false);
  assert.equal(standingDecisionEffect({ ...revoked, review: { effect: "APPROVED_LEAVE", fromTermId: revoked.termId, toTermId: revoked.termId, reason: "Old review", verifiedAt: "2025-08-06", verifiedBy: "advisor" } }), null);
});

test("generic decision types recognize anchored academic warnings and correctly separate reprieve terms", () => {
  const previous = decision("Quyết định khác", { id: "older", termId: "2024-2025:2", fullText: "Cảnh báo học vụ(HK1, NH 2024-2025)" });
  const now = decision("Quyết định khác", { termId: "2025-2026:1", fullText: "Cảnh báo học vụ(HK 2, 2024-2025 - Cứu xét HKI, 2025-2026)" });
  assert.equal(standingDecisionEffect(now), "ACADEMIC_WARNING");
  const assessed = assessAcademicStanding(source({ registeredOfferings: 1, decisions: [previous, now] }));
  assert.equal(assessed.consecutiveOfficialWarnings, 2);
  assert.equal(assessed.officialWarningCount, 2);
  assert.deepEqual(standingDecisionPeriod(now, terms).reprieveTermIds, ["2025-2026:1"]);
  assert.equal(standingDecisionEffect(decision("Quyết định khác", { fullText: "Khen thưởng (không thuộc diện cảnh báo học vụ)" })), null);
});

test("two absent terms are not inferred before admission and an approved preceding leave breaks the absence sequence", () => {
  const absent = source({ previousSummaryPresent: false, previousRegisteredCredits: null, previousRegisteredOfferings: 0 });
  assert.ok(codes(absent).includes("EARLY_NO_REGISTRATION_CONSECUTIVE"));
  assert.equal(assessAcademicStanding(absent).rules.find(rule => rule.ruleCode === "EARLY_NO_REGISTRATION_CONSECUTIVE")?.dataStatus, "UNVERIFIED");
  assert.equal(codes({ ...absent, terms: terms.map(term => ({ ...term, beforeAdmission: term.id === absent.previousTermId })) }).includes("EARLY_NO_REGISTRATION_CONSECUTIVE"), false);
  assert.equal(codes({ ...absent, decisions: [decision("Nghỉ học tạm thời", { termId: absent.previousTermId! })] }).includes("EARLY_NO_REGISTRATION_CONSECUTIVE"), false);
  assert.equal(assessAcademicStanding({ ...absent, beforeAdmission: true }).excluded, true);
  assert.equal(isBeforeCohortAdmission("2024-2025", "Khóa 49 (2025-2029)"), true);
  assert.equal(isBeforeCohortAdmission("2025-2026", "Khóa 49 (2025-2029)"), false);
});

test("TB1270 thresholds apply only to its stated cohort, study type and assessment term", () => {
  const warnings = [decision("Cảnh báo học tập", { id: "prior", termId: "2024-2025:1" }), decision("Cảnh báo học tập"), decision("Cảnh báo học tập", { id: "duplicate" })];
  const assessed = assessAcademicStanding(source({ summaryPresent: true, registeredOfferings: 1, decisions: warnings }));
  assert.equal(assessed.notice1270Applicable, true);
  assert.equal(assessed.consecutiveOfficialWarnings, 2);
  assert.equal(assessed.rules.find(rule => rule.ruleCode === "ACADEMIC_WARNING_SEQUENCE_REVIEW")?.thresholdValue, 2);
  for (const outside of [{ cohortCode: "K49" }, { studyType: "Vừa làm vừa học" }, { assessmentTermId: "2025-2026:2" }]) {
    const other = assessAcademicStanding(source({ registeredOfferings: 1, decisions: warnings, ...outside }));
    assert.equal(other.notice1270Applicable, false);
    assert.equal(other.rules.find(rule => rule.ruleCode === "ACADEMIC_WARNING_SEQUENCE_REVIEW")?.thresholdValue, 3);
  }
  assert.equal(assessAcademicStanding(source({ decisions: [decision("Buộc thôi học")] })).consecutiveOfficialWarnings, 0);
});

test("maximum training duration is excluded from warning criteria even with a verified expired deadline", () => {
  const result = assessAcademicStanding(source({ summaryPresent: true, summaryRegisteredCredits: 0 }));
  assert.equal(result.appealStatus, "NO_REGISTRATION");
  assert.equal(result.rules.some(rule => String(rule.ruleCode) === "ACADEMIC_STUDY_DURATION_REVIEW"), false);
  const reviewed = decision("Quyết định khác", { review: { effect: "STUDY_DEADLINE", fromTermId: "2024-2025:2", toTermId: null, reason: "Hạn theo hồ sơ", verifiedAt: "2025-08-07", verifiedBy: "advisor", studyDeadline: "2025-06-29" } });
  assert.equal(codes(source({ registeredOfferings: 1, summaryPresent: true, decisions: [reviewed] })).map(String).includes("ACADEMIC_STUDY_DURATION_REVIEW"), false);
  assert.equal(codes(source({ registeredOfferings: 1, summaryPresent: true, decisions: [reviewed], assessmentDate: null })).map(String).includes("ACADEMIC_STUDY_DURATION_REVIEW"), false);
  assert.equal(readStandingReview({ academicStandingReview: { effect: "APPROVED_LEAVE" } }), null);
});

test("verification requires a signed existing decision, an inclusive valid leave period and audited source metadata", async () => {
  const cleanups: Array<() => void> = [];
  const mock = (target: object, key: string, replacement: unknown) => { const record = target as Record<string, unknown>; const old = record[key]; record[key] = replacement; cleanups.push(() => { record[key] = old; }); };
  let updates = 0, audits = 0, revoked = false;
  mock(prisma.studentDecision, "findFirst", async (query: { where: { studentId: string } }) => { assert.equal(query.where.studentId, "student"); return { id: "decision", sDecisionNumber: "100/QĐ", sFullText: revoked ? "[Xóa quyết định 100/QĐ]" : "", sSignDate: new Date("2025-01-01"), updatedAt: new Date(), sourcePayload: { original: "preserved" } }; });
  mock(prisma.academicTerm, "findMany", async () => terms.map(term => ({ id: term.id, academicYearId: term.academicYearId, sTermOrder: term.termOrder, sIsSummer: false })));
  mock(prisma.academicYear, "findMany", async () => terms.map(term => ({ id: term.academicYearId, sYearCode: term.academicYearCode })));
  mock(prisma, "$transaction", async (callback: (tx: unknown) => Promise<unknown>) => callback({
    $executeRaw: async () => 0,
    student: { findMany: async () => [] },
    studentStudySuspension: { findMany: async () => [] },
    decisionType: { findMany: async () => [] },
    academicTerm: prisma.academicTerm,
    academicYear: prisma.academicYear,
    studentDecision: { findMany: async () => [], updateMany: async (query: { data: { sourcePayload: Record<string, unknown> } }) => { updates++; assert.equal(query.data.sourcePayload.original, "preserved"); assert.equal(readStandingReview(query.data.sourcePayload)?.verifiedBy, "advisor"); return { count: 1 }; } },
    auditLog: { create: async () => { audits++; } },
  }));
  const body = { decisionId: "decision", effect: "APPROVED_LEAVE", fromTermId: "2024-2025:2", toTermId: "2025-2026:1", reason: "Đã đối chiếu quyết định", verifiedBy: "forged-user" };
  try {
    for (const invalid of [{ ...body, reason: "" }, { ...body, toTermId: null }, { ...body, toTermId: "2024-2025:1" }, { ...body, effect: "STUDY_DEADLINE", studyDeadline: "2025-02-30" }]) await assert.rejects(verifyAcademicStandingDecision("student", invalid, "advisor"));
    assert.equal(updates, 0);
    revoked = true;
    await assert.rejects(verifyAcademicStandingDecision("student", body, "advisor"), (error: unknown) => (error as { code?: string }).code === "REVOKED_DECISION");
    assert.equal(updates, 0); assert.equal(audits, 0);
    revoked = false;
    await verifyAcademicStandingDecision("student", body, "advisor");
    assert.equal(updates, 1); assert.equal(audits, 1);
  } finally { cleanups.reverse().forEach(cleanup => cleanup()); }
});
