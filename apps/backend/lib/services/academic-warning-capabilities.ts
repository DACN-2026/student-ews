export const ACADEMIC_WARNING_CAPABILITY_STATUSES = ["AVAILABLE", "UNAVAILABLE", "UNVERIFIED"] as const;

export type AcademicWarningCapabilityStatus = typeof ACADEMIC_WARNING_CAPABILITY_STATUSES[number];

export type AcademicWarningCapability = {
  status: AcademicWarningCapabilityStatus;
  reasonCode: string;
  description: string;
  evidence: string[];
};

export type AcademicWarningCapabilityName =
  | "FIRST_TERM_DETECTION"
  | "SUMMER_MAIN_TERM_MERGE_VERIFIED"
  | "YEAR_LEVEL_CLASSIFICATION"
  | "FAILED_CREDIT_CALCULATION"
  | "ACCUMULATED_DEBT_CREDIT_CALCULATION";

export type AcademicWarningCapabilitySnapshot = Record<AcademicWarningCapabilityName, AcademicWarningCapability>;

const CAPABILITY_DEFINITIONS: AcademicWarningCapabilitySnapshot = {
  FIRST_TERM_DETECTION: {
    status: "AVAILABLE",
    reasonCode: "EARLIEST_MAIN_TERM_SUMMARY_AVAILABLE",
    description: "The first main semester is derived from the student's earliest main-term summary in the same program.",
    evidence: ["student_term_summaries", "academic_terms", "academic_years"],
  },
  SUMMER_MAIN_TERM_MERGE_VERIFIED: {
    status: "UNVERIFIED",
    reasonCode: "SUMMER_MAIN_TERM_SOURCE_MERGE_UNVERIFIED",
    description: "The source contract does not establish whether summer results are merged into the preceding main term.",
    evidence: ["StudentTermSummary source contract", "grade import term mapping"],
  },
  YEAR_LEVEL_CLASSIFICATION: {
    status: "AVAILABLE",
    reasonCode: "CUMULATIVE_EARNED_CREDITS_AVAILABLE",
    description: "QD600 year level can be classified from cumulative earned credits when the assessment-term value is present.",
    evidence: ["SourceGrade.Dat_TL_HK", "student_term_summaries.cumulative_credits"],
  },
  FAILED_CREDIT_CALCULATION: {
    status: "AVAILABLE",
    reasonCode: "TERM_REGISTRATIONS_AND_FINAL_OUTCOMES_AVAILABLE",
    description: "Registered and failed credits can be calculated from distinct offerings and final graded outcomes in the assessment term.",
    evidence: ["student_course_offerings", "student_course_grades.score_status", "student_course_grades.is_pass"],
  },
  ACCUMULATED_DEBT_CREDIT_CALCULATION: {
    status: "UNVERIFIED",
    reasonCode: "DEBT_RESOLUTION_SEMANTICS_UNVERIFIED",
    description: "Historical failures cannot be converted into current debt without verified retry, elective replacement, and credit-recognition semantics.",
    evidence: ["student_course_offerings", "student_course_grades", "curriculum requirements"],
  },
};

export function createAcademicWarningCapabilitySnapshot(): AcademicWarningCapabilitySnapshot {
  return Object.fromEntries(
    Object.entries(CAPABILITY_DEFINITIONS).map(([name, capability]) => [
      name,
      { ...capability, evidence: [...capability.evidence] },
    ]),
  ) as AcademicWarningCapabilitySnapshot;
}

export type Qd600YearLevelClassification = {
  cumulativeCredits: number | null;
  yearLevel: 1 | 2 | 3 | 4 | null;
  dataStatus: "COMPLETE" | "INSUFFICIENT";
  reasonCode: string | null;
};

export function classifyQd600YearLevel(cumulativeCredits: number | null): Qd600YearLevelClassification {
  if (cumulativeCredits == null || !Number.isFinite(cumulativeCredits) || cumulativeCredits < 0) {
    return {
      cumulativeCredits: cumulativeCredits != null && Number.isFinite(cumulativeCredits) ? cumulativeCredits : null,
      yearLevel: null,
      dataStatus: "INSUFFICIENT",
      reasonCode: "CUMULATIVE_CREDITS_MISSING_OR_INVALID",
    };
  }

  const yearLevel = cumulativeCredits < 35 ? 1
    : cumulativeCredits < 70 ? 2
      : cumulativeCredits < 105 ? 3
        : 4;
  return { cumulativeCredits, yearLevel, dataStatus: "COMPLETE", reasonCode: null };
}

export type AssessmentTermCourseAttempt = {
  offeringId: string;
  academicTermId: string;
  credits: number;
  scoreStatus: string | null;
  hasFinalGrade: boolean;
  isPass: boolean | null;
  specialCode?: string | null;
};

export type FailedCreditCalculation = {
  registeredCredits: number;
  failedCredits: number;
  failedCreditRatio: number | null;
  dataStatus: "COMPLETE" | "PARTIAL" | "INSUFFICIENT";
  reasonCodes: string[];
  distinctOfferingCount: number;
  duplicateRowsDiscarded: number;
};

function sameAttempt(left: AssessmentTermCourseAttempt, right: AssessmentTermCourseAttempt) {
  return left.academicTermId === right.academicTermId &&
    left.credits === right.credits &&
    left.scoreStatus === right.scoreStatus &&
    left.hasFinalGrade === right.hasFinalGrade &&
    left.isPass === right.isPass &&
    (left.specialCode || null) === (right.specialCode || null);
}

/**
 * Calculate credits for one assessment term only. A failure is a final graded
 * outcome with isPass=false; missing, pending, and special outcomes remain
 * unresolved and therefore make the result partial instead of becoming fails.
 */
export function calculateAssessmentTermFailedCredits(
  assessmentTermId: string,
  attempts: AssessmentTermCourseAttempt[],
): FailedCreditCalculation {
  const byOffering = new Map<string, AssessmentTermCourseAttempt>();
  const conflictingOfferings = new Set<string>();
  let duplicateRowsDiscarded = 0;

  for (const attempt of attempts) {
    if (attempt.academicTermId !== assessmentTermId) continue;
    const existing = byOffering.get(attempt.offeringId);
    if (!existing) {
      byOffering.set(attempt.offeringId, attempt);
      continue;
    }
    duplicateRowsDiscarded += 1;
    if (!sameAttempt(existing, attempt)) conflictingOfferings.add(attempt.offeringId);
  }

  let registeredCredits = 0;
  let failedCredits = 0;
  let unresolvedOutcomes = 0;
  let invalidCredits = 0;

  for (const attempt of byOffering.values()) {
    if (!Number.isFinite(attempt.credits) || attempt.credits < 0) {
      invalidCredits += 1;
      continue;
    }
    registeredCredits += attempt.credits;
    if (conflictingOfferings.has(attempt.offeringId)) {
      unresolvedOutcomes += 1;
      continue;
    }
    const isFinalAbsence = attempt.scoreStatus?.trim().toLowerCase() === "special" &&
      attempt.specialCode?.trim().toUpperCase() === "VT" && attempt.isPass === false;
    if ((!attempt.hasFinalGrade && !isFinalAbsence) || attempt.isPass == null) {
      unresolvedOutcomes += 1;
      continue;
    }
    if (!attempt.isPass) failedCredits += attempt.credits;
  }

  const reasonCodes: string[] = [];
  if (registeredCredits === 0) reasonCodes.push("NO_REGISTERED_CREDITS");
  if (unresolvedOutcomes > 0) reasonCodes.push("UNRESOLVED_GRADE_OUTCOMES");
  if (invalidCredits > 0) reasonCodes.push("INVALID_CREDIT_VALUES");
  if (conflictingOfferings.size > 0) reasonCodes.push("CONFLICTING_DUPLICATE_OFFERINGS");

  const dataStatus = registeredCredits === 0
    ? "INSUFFICIENT"
    : reasonCodes.length > 0
      ? "PARTIAL"
      : "COMPLETE";

  return {
    registeredCredits,
    failedCredits,
    failedCreditRatio: dataStatus === "COMPLETE" ? failedCredits / registeredCredits : null,
    dataStatus,
    reasonCodes,
    distinctOfferingCount: byOffering.size,
    duplicateRowsDiscarded,
  };
}

export type AccumulatedDebtCreditCalculation = {
  accumulatedDebtCredits: null;
  dataStatus: "UNVERIFIED";
  reasonCode: "DEBT_RESOLUTION_SEMANTICS_UNVERIFIED";
};

export function unavailableAccumulatedDebtCreditCalculation(): AccumulatedDebtCreditCalculation {
  return {
    accumulatedDebtCredits: null,
    dataStatus: "UNVERIFIED",
    reasonCode: "DEBT_RESOLUTION_SEMANTICS_UNVERIFIED",
  };
}

export function createQd600StudentCapabilityData(input: {
  cumulativeCredits: number | null;
  assessmentTermId: string;
  attempts: AssessmentTermCourseAttempt[];
  isFirstMainSemester: boolean | null;
}) {
  return {
    usedForEvaluation: false as const,
    firstTermClassification: {
      isFirstMainSemester: input.isFirstMainSemester,
      dataStatus: input.isFirstMainSemester == null ? "INSUFFICIENT" as const : "COMPLETE" as const,
      reasonCode: input.isFirstMainSemester == null ? "FIRST_MAIN_SEMESTER_UNRESOLVED" : null,
    },
    yearLevelClassification: classifyQd600YearLevel(input.cumulativeCredits),
    failedCreditCalculation: calculateAssessmentTermFailedCredits(input.assessmentTermId, input.attempts),
    accumulatedDebtCreditCalculation: unavailableAccumulatedDebtCreditCalculation(),
  };
}
