/** K44 requirements apply to the current cohorts. Keep source codes and attempts intact. */
export const ACADEMIC_RULE_VERSION = "k44-qd600-2026-v1";

// Only confirmed alternatives for certificate requirements. Academic course aliases
// need program-scoped evidence; identical names alone do not establish equivalence.
export const COURSE_CODE_ALIASES: Readonly<Record<string, string>> = {
  TC1001D: "TC1001", "25TC1001": "TC1001",
  TC1002C: "TC1002", TC1002D: "TC1002", TC1003D: "TC1002", TC1004D: "TC1002",
  TC1005D: "TC1002", TC1006D: "TC1002", TC1007D: "TC1002",
  "25TC2001": "TC1002", "25TC2002": "TC1002", "25TC2003": "TC1002",
  TC2003D: "TC2003", "25TC3001": "TC2003", "25TC3002": "TC2003", "25TC3003": "TC2003",
  QP2101D: "QP2101", QP2102D: "QP2102", QP2103D: "QP2103", QP2104D: "QP2104",
};

export function normalizeCourseCode(value?: string | null): string {
  const code = (value ?? "").normalize("NFKC").trim().replace(/\s+/g, "").toUpperCase();
  return COURSE_CODE_ALIASES[code] ?? code;
}

export function normalizeCourseName(value?: string | null): string {
  return (value ?? "").normalize("NFKC").trim().replace(/\s+/g, " ").toLocaleLowerCase("vi");
}

export function isConditionalCourse(code?: string | null, name?: string | null): boolean {
  const normalizedCode = normalizeCourseCode(code);
  const normalizedName = normalizeCourseName(name);
  return /^(?:QP\d|(?:25)?TC\d|SHCD)/.test(normalizedCode) ||
    /giáo dục (?:thể chất|quốc phòng)|sinh hoạt công dân/.test(normalizedName);
}

export type CourseOutcomeInput = {
  isPass?: boolean | null;
  isPassed?: boolean | null;
  scoreStatus?: string | null;
  notScore?: boolean | null;
  score10?: number | null;
  score4?: number | null;
  letterCode?: string | null;
  letterGrade?: string | null;
  specialCode?: string | null;
};

export function courseOutcome(grade: CourseOutcomeInput): "passed" | "failed" | "pending" | "unknown" {
  const letter = (grade.specialCode || grade.letterCode || grade.letterGrade || "").trim().toUpperCase();
  // Absence is final even if a contradictory source pending flag is present.
  if (letter === "VT") return "failed";
  if (grade.notScore === true || grade.scoreStatus === "pending") return "pending";
  const pass = grade.isPass ?? grade.isPassed;
  if (grade.scoreStatus === "graded" && pass === true) return "passed";
  if (grade.scoreStatus === "graded" && pass === false &&
      (grade.score10 != null || grade.score4 != null || Boolean(letter))) return "failed";
  return "unknown";
}

export type CertificateAttempt = CourseOutcomeInput & {
  courseCode?: string | null;
  courseName?: string | null;
  credits?: number | null;
};

function certificatePart(code?: string | null): { kind: "physical" | "defense"; part: number } | null {
  const normalized = normalizeCourseCode(code);
  const defense = normalized.match(/^QP210([1-4])$/);
  if (defense) return { kind: "defense", part: Number(defense[1]) };
  if (normalized === "TC1001") return { kind: "physical", part: 1 };
  if (/^TC100[2-7]D?$/.test(normalized)) return { kind: "physical", part: 2 };
  if (normalized === "TC2003" || normalized === "TC2003D" || /^25TC300[1-3]$/.test(normalized))
    return { kind: "physical", part: 3 };
  return null;
}

export function assessCertificateRequirements(attempts: CertificateAttempt[]) {
  const assess = (kind: "physical" | "defense", requiredParts: number[]) => {
    const evidence = attempts.flatMap((attempt) => {
      const part = certificatePart(attempt.courseCode);
      return part?.kind === kind ? [{ ...attempt, part: part.part, outcome: courseOutcome(attempt) }] : [];
    });
    const passedParts = requiredParts.filter((part) => evidence.some((item) => item.part === part && item.outcome === "passed" && (kind !== "physical" || (item.credits ?? 0) >= 1)));
    const remainingParts = requiredParts.filter((part) => !passedParts.includes(part));
    const pendingCanComplete = remainingParts.length > 0 && remainingParts.every((part) => evidence.some((item) => item.part === part && item.outcome === "pending"));
    const status = remainingParts.length === 0 ? "PASSED" : pendingCanComplete ? "PENDING" : evidence.length ? "NOT_PASSED" : "NOT_AVAILABLE";
    return { status, passedParts, remainingParts, evidence, recognizedCredits: kind === "physical" ? passedParts.length : null, source: "course_results", version: ACADEMIC_RULE_VERSION };
  };
  return { physical: assess("physical", [1, 2, 3]), defense: assess("defense", [1, 2, 3, 4]) };
}

export function isK44StandardProgram(programCode?: string | null): boolean {
  return /^CQ2[2-5]CT(?:-(?:PM|MMT|KHDL))?$/.test((programCode ?? "").toUpperCase());
}

export function normalizeProgramCourseCode(value?: string | null, programCode?: string | null): string {
  const code = normalizeCourseCode(value);
  if (programCode?.toUpperCase() === "CQ22CT-PM") {
    const verified: Record<string, string> = { TN1008D: "20TN1202", TN1001D: "20TN1201", "20CT3102D": "20CT3132D" };
    return verified[code] ?? code;
  }
  return code;
}

export const K44_ELECTIVE_GROUPS = ["A6:9", "A7:6", "B2:25", "B3:6"] as const;

export function curriculumElectiveGroup(code: string, programCode?: string | null): string | null {
  if (!isK44StandardProgram(programCode)) return null;
  const normalized = normalizeProgramCourseCode(code, programCode);
  if (["20CT1103", "20CT1203", "20TN1201", "20TN2102"].includes(normalized)) return "A6:9";
  if (["20NV0002", "20SP0001", "20QT0006", "20QT0001", "20QT0004"].includes(normalized)) return "A7:6";
  if (["20CT3106", "20CT3106D", "20CT3107", "20CT3107D", "20CT3108", "20CT3108D"].includes(normalized)) return "B3:6";
  // These are the elective specialization offerings in the verified CTDT API.
  if (/^20CT(?:3|4)\d{3}D?$/.test(normalized)) return "B2:25";
  return null;
}
