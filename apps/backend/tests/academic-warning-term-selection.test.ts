import assert from "node:assert/strict";
import test from "node:test";
import {
  AcademicTermResolutionError,
  assertAcademicWarningAssessmentTermAllowed,
  resolvePreviousMainAssessmentTerm,
} from "../lib/academic-terms";
import {
  describeAcademicWarningReportEvaluationState,
  selectLatestReportingPeriod,
  summarizeWarningBusinessStatuses,
} from "../lib/services/reports";

type Term = {
  id: string;
  academicYearId: string;
  academicYearCode: string;
  termOrder: number;
  isSummer: boolean;
  isCurrent: boolean;
  startDate?: string;
};

const previous: Term = {
  id: "main-previous",
  academicYearId: "2025",
  academicYearCode: "2025-2026",
  termOrder: 2,
  isSummer: false,
  isCurrent: false,
  startDate: "2026-01-15",
};

const current: Term = {
  id: "main-current",
  academicYearId: "2026",
  academicYearCode: "2026-2027",
  termOrder: 1,
  isSummer: false,
  isCurrent: true,
  startDate: "2026-09-01",
};

test("automatic warning assessment selects the main term immediately before current", () => {
  const resolved = resolvePreviousMainAssessmentTerm([previous, current]);
  assert.equal(resolved.currentMainTerm.id, "main-current");
  assert.equal(resolved.assessmentTerm.id, "main-previous");
});

test("automatic warning assessment ignores a chronologically newest summer term", () => {
  const summer: Term = {
    id: "summer",
    academicYearId: "2026",
    academicYearCode: "2026-2027",
    termOrder: 3,
    isSummer: true,
    isCurrent: false,
    startDate: "2027-06-01",
  };
  assert.equal(resolvePreviousMainAssessmentTerm([previous, current, summer]).assessmentTerm.id, previous.id);
});

test("automatic warning assessment ignores future main terms", () => {
  const future: Term = {
    id: "main-future",
    academicYearId: "2026",
    academicYearCode: "2026-2027",
    termOrder: 2,
    isSummer: false,
    isCurrent: false,
    startDate: "2027-01-15",
  };
  assert.equal(resolvePreviousMainAssessmentTerm([previous, current, future]).assessmentTerm.id, previous.id);
});

test("automatic warning assessment fails explicitly when no previous main term exists", () => {
  assert.throws(
    () => resolvePreviousMainAssessmentTerm([current]),
    (error) => error instanceof AcademicTermResolutionError && error.code === "NO_PREVIOUS_MAIN_TERM_AVAILABLE",
  );
});

test("multiple current main terms are a configuration error", () => {
  assert.throws(
    () => resolvePreviousMainAssessmentTerm([current, { ...current, id: "other-current" }]),
    (error) => error instanceof AcademicTermResolutionError && error.code === "MULTIPLE_CURRENT_MAIN_TERMS",
  );
});

test("MAIN + not finalized cannot run an OFFICIAL warning evaluation", () => {
  assert.throws(
    () => assertAcademicWarningAssessmentTermAllowed({ isCurrent: true, isSummer: false, gradesFinalizedAt: null }, "OFFICIAL"),
    (error) => error instanceof AcademicTermResolutionError && error.code === "GRADES_NOT_FINALIZED",
  );
});

test("current MAIN may be evaluated once grades are explicitly finalized", () => {
  assert.doesNotThrow(() => assertAcademicWarningAssessmentTermAllowed({
    isCurrent: true,
    isSummer: false,
    gradesFinalizedAt: "2026-12-20T08:00:00.000Z",
  }, "OFFICIAL"));
});

test("older MAIN also requires explicit grade finalization", () => {
  assert.throws(
    () => assertAcademicWarningAssessmentTermAllowed({ isCurrent: false, isSummer: false, gradesFinalizedAt: null }, "OFFICIAL"),
    (error) => error instanceof AcademicTermResolutionError && error.code === "GRADES_NOT_FINALIZED",
  );
  assert.doesNotThrow(() => assertAcademicWarningAssessmentTermAllowed({
    isCurrent: false,
    isSummer: false,
    gradesFinalizedAt: "2026-06-20T08:00:00.000Z",
  }, "OFFICIAL"));
});

test("SUMMER_MONITORING compatibility remains unchanged", () => {
  assert.doesNotThrow(() => assertAcademicWarningAssessmentTermAllowed({ isCurrent: false, isSummer: true, gradesFinalizedAt: null }, "SUMMER_MONITORING"));
  assert.throws(
    () => assertAcademicWarningAssessmentTermAllowed({ isCurrent: false, isSummer: true, gradesFinalizedAt: new Date() }, "OFFICIAL"),
    (error) => error instanceof AcademicTermResolutionError && error.code === "SUMMER_OFFICIAL_WARNING_NOT_ALLOWED",
  );
});

test("zero warning runs is represented as no completed official run", () => {
  assert.deepEqual(describeAcademicWarningReportEvaluationState(57, [], false), {
    hasCompletedOfficialRun: false,
    persistedResultCount: 0,
    persistedInsufficientDataCount: 0,
    noPersistedResultCount: 57,
  });
});

test("no-run state does not manufacture persisted INSUFFICIENT_DATA results", () => {
  const state = describeAcademicWarningReportEvaluationState(57, [], false);
  assert.equal(state.persistedInsufficientDataCount, 0);
  assert.equal(state.noPersistedResultCount, 57);
});

test("persisted INSUFFICIENT_DATA remains a real result of a completed run", () => {
  const row = {
    studentId: "student-1",
    maxSeverity: "none",
    reasonCount: 0,
    dataError: "MISSING_TERM_GPA",
    termGpa4: null,
    cumulativeGpa4: 2.5,
    businessStatus: "INSUFFICIENT_DATA",
  };
  const state = describeAcademicWarningReportEvaluationState(1, [row], true);
  assert.equal(state.hasCompletedOfficialRun, true);
  assert.equal(state.persistedResultCount, 1);
  assert.equal(state.persistedInsufficientDataCount, 1);
  assert.equal(state.noPersistedResultCount, 0);
  assert.equal(selectLatestReportingPeriod([{ label: "HK02", evaluated: 0, insufficient: 1, isSummer: false }])?.label, "HK02");
});

test("report auto-period remains the latest main term backed by persisted results", () => {
  const selected = selectLatestReportingPeriod([
    { label: "HK02 2025-2026", evaluated: 56, insufficient: 1, isSummer: false },
    { label: "HK01 2026-2027", evaluated: 0, insufficient: 0, isSummer: false },
  ]);
  assert.equal(selected?.label, "HK02 2025-2026");
});

test("persisted faculty overview keeps QD600 business statuses separate", () => {
  const rows = ["NORMAL", "PARTIAL_NO_RISK", "MONITORING", "HIGH_RISK", "VERIFY_REQUIRED", "INSUFFICIENT_DATA"].map((businessStatus, index) => ({
    studentId: `student-${index}`,
    maxSeverity: businessStatus === "HIGH_RISK" || businessStatus === "VERIFY_REQUIRED" ? "high" : "none",
    reasonCount: businessStatus === "NORMAL" || businessStatus === "INSUFFICIENT_DATA" ? 0 : 1,
    dataError: businessStatus === "INSUFFICIENT_DATA" ? "qd600_regulatory_coverage_insufficient" : null,
    businessStatus,
  }));
  assert.deepEqual(summarizeWarningBusinessStatuses(rows), {
    NORMAL: 1,
    PARTIAL_NO_RISK: 1,
    MONITORING: 1,
    HIGH_RISK: 1,
    VERIFY_REQUIRED: 1,
    INSUFFICIENT_DATA: 1,
  });
});
