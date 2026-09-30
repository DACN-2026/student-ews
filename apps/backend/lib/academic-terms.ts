export type AcademicTermLinkInput = {
  id: string;
  academicYearId: string;
  academicYearCode: string;
  termOrder: number;
  isSummer: boolean;
  startDate?: Date | string | null;
  endDate?: Date | string | null;
};

export type CurrentAcademicTermInput = AcademicTermLinkInput & {
  isCurrent: boolean;
  gradesFinalizedAt?: Date | string | null;
};

export type AcademicWarningRunMode = "OFFICIAL" | "SUMMER_MONITORING";

export class AcademicTermResolutionError extends Error {
  constructor(
    readonly code:
      | "CURRENT_MAIN_TERM_UNAVAILABLE"
      | "MULTIPLE_CURRENT_MAIN_TERMS"
      | "NO_PREVIOUS_MAIN_TERM_AVAILABLE"
      | "GRADES_NOT_FINALIZED"
      | "SUMMER_OFFICIAL_WARNING_NOT_ALLOWED"
      | "INVALID_WARNING_RUN_MODE",
    message: string,
  ) {
    super(message);
    this.name = "AcademicTermResolutionError";
  }
}

export type AcademicTermLinks = {
  previousMainTermId: string | null;
  nextMainTermId: string | null;
};

export const ACADEMIC_TERM_CAPABILITIES = {
  firstTermDetection: "FIRST_TERM_DETECTION_UNAVAILABLE",
  summerResultMerge: "SOURCE_MERGE_UNVERIFIED",
} as const;

export type NormalizedAcademicTerm = AcademicTermLinkInput & AcademicTermLinks & {
  kind: "MAIN" | "SUMMER";
  mainSequence: number | null;
  assessmentMainTermId: string | null;
  mergeStatus: "NOT_APPLICABLE" | "SOURCE_MERGE_UNVERIFIED";
};

export function configuredSummerTermCodes(raw = process.env.SUMMER_TERM_CODES || "") {
  return new Set(raw.split(",").map((code) => code.trim().toUpperCase()).filter(Boolean));
}

export function isConfiguredSummerTermCode(code: string, raw?: string) {
  return configuredSummerTermCodes(raw).has(code.trim().toUpperCase());
}

const dateValue = (value?: Date | string | null) => {
  if (!value) return null;
  const parsed = value instanceof Date ? value.getTime() : new Date(value).getTime();
  return Number.isFinite(parsed) ? parsed : null;
};

export function compareAcademicTerms(left: AcademicTermLinkInput, right: AcademicTermLinkInput) {
  const leftDate = dateValue(left.startDate);
  const rightDate = dateValue(right.startDate);
  if (leftDate != null && rightDate != null && leftDate !== rightDate) return leftDate - rightDate;
  return `${left.academicYearCode}|${String(left.termOrder).padStart(4, "0")}|${left.id}`.localeCompare(
    `${right.academicYearCode}|${String(right.termOrder).padStart(4, "0")}|${right.id}`,
  );
}

/**
 * Resolve the main terms immediately before and after every term. The
 * relationship is based on configured chronology, never on a term code such
 * as HK03.
 */
export function buildAcademicTermLinks(terms: AcademicTermLinkInput[]) {
  const ordered = [...terms].sort(compareAcademicTerms);
  const mainTerms = ordered.filter((term) => !term.isSummer);
  const links = new Map<string, AcademicTermLinks>();

  for (const term of ordered) {
    let previousMainTermId: string | null = null;
    let nextMainTermId: string | null = null;
    for (const mainTerm of mainTerms) {
      const comparison = compareAcademicTerms(mainTerm, term);
      if (comparison < 0) previousMainTermId = mainTerm.id;
      if (comparison > 0) {
        nextMainTermId = mainTerm.id;
        break;
      }
    }
    links.set(term.id, { previousMainTermId, nextMainTermId });
  }

  return links;
}

/**
 * Normalize chronology once for downstream rule evaluation. Summer terms never
 * receive a main-sequence number and therefore cannot make two main terms look
 * consecutive. Their relationship to the previous main term is descriptive
 * until the upstream aggregation contract is verified.
 */
export function normalizeAcademicTerms(terms: AcademicTermLinkInput[]): NormalizedAcademicTerm[] {
  const ordered = [...terms].sort(compareAcademicTerms);
  const links = buildAcademicTermLinks(ordered);
  const mainSequenceById = new Map(
    ordered.filter((term) => !term.isSummer).map((term, index) => [term.id, index]),
  );
  return ordered.map((term) => {
    const termLinks = links.get(term.id) || { previousMainTermId: null, nextMainTermId: null };
    return {
      ...term,
      ...termLinks,
      kind: term.isSummer ? "SUMMER" : "MAIN",
      mainSequence: term.isSummer ? null : mainSequenceById.get(term.id) ?? null,
      assessmentMainTermId: term.isSummer ? termLinks.previousMainTermId : term.id,
      mergeStatus: term.isSummer ? "SOURCE_MERGE_UNVERIFIED" : "NOT_APPLICABLE",
    };
  });
}

export function areConsecutiveMainTerms(
  previousTermId: string,
  currentTermId: string,
  terms: NormalizedAcademicTerm[],
) {
  const byId = new Map(terms.map((term) => [term.id, term]));
  const previous = byId.get(previousTermId);
  const current = byId.get(currentTermId);
  return previous?.kind === "MAIN" && current?.kind === "MAIN" &&
    previous.mainSequence != null && current.mainSequence === previous.mainSequence + 1;
}

export function latestMainTerm<T extends AcademicTermLinkInput>(terms: T[]) {
  return [...terms].filter((term) => !term.isSummer).sort(compareAcademicTerms).at(-1) || null;
}

/**
 * Resolve the main academic term immediately preceding the configured current
 * main term. Calendar configuration is authoritative here: GPA and grade
 * availability must never influence this selection.
 */
export function resolvePreviousMainAssessmentTerm<T extends CurrentAcademicTermInput>(terms: T[]) {
  const currentMainTerms = terms.filter((term) => term.isCurrent && !term.isSummer);
  if (currentMainTerms.length === 0) {
    throw new AcademicTermResolutionError(
      "CURRENT_MAIN_TERM_UNAVAILABLE",
      "Không có kỳ chính hiện tại được cấu hình.",
    );
  }
  if (currentMainTerms.length > 1) {
    throw new AcademicTermResolutionError(
      "MULTIPLE_CURRENT_MAIN_TERMS",
      "Có nhiều hơn một kỳ chính được đánh dấu là kỳ hiện tại.",
    );
  }

  const currentMainTerm = currentMainTerms[0];
  const orderedMainTerms = terms.filter((term) => !term.isSummer).sort(compareAcademicTerms);
  const currentIndex = orderedMainTerms.findIndex((term) => term.id === currentMainTerm.id);
  const assessmentTerm = currentIndex > 0 ? orderedMainTerms[currentIndex - 1] : null;
  if (!assessmentTerm) {
    throw new AcademicTermResolutionError(
      "NO_PREVIOUS_MAIN_TERM_AVAILABLE",
      "Không có kỳ chính liền trước kỳ hiện tại để đánh giá cảnh báo học tập.",
    );
  }

  return { currentMainTerm, assessmentTerm };
}

/** Keep OFFICIAL/current and main/summer validation independent from evaluators. */
export function assertAcademicWarningAssessmentTermAllowed(
  term: Pick<CurrentAcademicTermInput, "isCurrent" | "isSummer" | "gradesFinalizedAt">,
  runMode: AcademicWarningRunMode,
) {
  if (term.isSummer && runMode !== "SUMMER_MONITORING") {
    throw new AcademicTermResolutionError(
      "SUMMER_OFFICIAL_WARNING_NOT_ALLOWED",
      "Không thể ban hành cảnh báo chính thức từ kỳ hè. Hãy chọn kỳ chính ngay trước hoặc dùng chế độ giám sát hè.",
    );
  }
  if (!term.isSummer && runMode === "SUMMER_MONITORING") {
    throw new AcademicTermResolutionError(
      "INVALID_WARNING_RUN_MODE",
      "Chế độ giám sát hè chỉ áp dụng cho kỳ được cấu hình là kỳ hè.",
    );
  }
  if (runMode === "OFFICIAL" && !term.gradesFinalizedAt) {
    throw new AcademicTermResolutionError(
      "GRADES_NOT_FINALIZED",
      "Điểm của học kỳ chính chưa được xác nhận chốt; chưa thể chạy đánh giá cảnh báo chính thức.",
    );
  }
}
