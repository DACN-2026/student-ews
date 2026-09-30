import { sha256Hex } from "@/lib/utils/crypto";

export const ACADEMIC_WARNING_POLICY_SCHEMA_VERSION = 1 as const;
export const LEGACY_WARNING_ENGINE_VERSION = "academic-warning-legacy-v1";
export const QD600_PENDING_ENGINE_VERSION = "academic-warning-qd600-article18-pending-v1";
export const QD600_SOURCE_CODE = "QD600-DHDL-2021" as const;

export const LEGACY_WARNING_SIGNALS = [
  "REGISTRATION_BEHIND",
  "PROGRAM_PROGRESS_BEHIND",
  "LOW_TERM_GPA",
  "LOW_CUMULATIVE_GPA",
  "LOW_CONDUCT_SCORE",
  "ACADEMIC_WARNING_DECISION",
] as const;

export const QD600_REQUIRED_CAPABILITIES = [
  "FIRST_TERM_DETECTION",
  "YEAR_LEVEL_CLASSIFICATION",
  "FAILED_CREDIT_CALCULATION",
  "ACCUMULATED_DEBT_CREDIT_CALCULATION",
  "SUMMER_MAIN_TERM_MERGE_VERIFIED",
] as const;

type PolicyDefinitionBase = {
  schemaVersion: number;
  engineVersion: string;
  requiredCapabilities: string[];
};

export type LegacyAdvisoryPolicyDefinition = PolicyDefinitionBase & {
  evaluationProfile: "LEGACY_ADVISORY";
  executionMode: "LEGACY_SCALAR_RULES";
  advisory: {
    label: string;
    description?: string;
  };
  thresholds: {
    termGpa4Below: number;
    cumulativeGpa4Below: number;
    conductScoreBelow: number;
  };
  enabledSignals: string[];
};

export type Qd600PolicyDefinition = PolicyDefinitionBase & {
  evaluationProfile: "QD600_ARTICLE_18";
  executionMode: "NOT_YET_ACTIVE_FOR_EVALUATION";
  regulatory: {
    sourceCode: typeof QD600_SOURCE_CODE;
    sourceName: string;
    sourceVersion: string;
    issuedDate: string;
    effectiveFromAcademicYear: string;
    applicableFromCohort: string;
    applicableCohortIds: string[];
    articleRefs: string[];
    documentChecksum?: string;
  };
  thresholds: {
    failedCreditRatio: { operator: ">"; value: number };
    accumulatedDebtCredits: { operator: ">"; value: number };
    termGpa: {
      firstSemesterBelow: number;
      subsequentSemesterBelow: number;
    };
    cumulativeGpaByYear: Array<{
      yearLevel: number;
      gpa4Below: number;
    }>;
  };
  advisory: {
    earlyWarningMarginGpa4: number;
    advisoryOnly: true;
  };
};

export type AcademicWarningPolicyDefinition = LegacyAdvisoryPolicyDefinition | Qd600PolicyDefinition;

export class PolicyDefinitionError extends Error {
  readonly code: string;

  constructor(message: string, code = "INVALID_POLICY_DEFINITION") {
    super(message);
    this.name = "PolicyDefinitionError";
    this.code = code;
  }
}

function isObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function requiredString(value: unknown, field: string) {
  if (typeof value !== "string" || !value.trim()) throw new PolicyDefinitionError(`${field} is required`);
  return value.trim();
}

function numberInRange(value: unknown, field: string, min: number, max?: number) {
  if (typeof value !== "number" || !Number.isFinite(value) || value < min || (max !== undefined && value > max)) {
    throw new PolicyDefinitionError(`${field} must be between ${min} and ${max ?? "infinity"}`);
  }
  return value;
}

function stringArray(value: unknown, field: string) {
  if (!Array.isArray(value) || value.some((item) => typeof item !== "string" || !item.trim())) {
    throw new PolicyDefinitionError(`${field} must be an array of non-empty strings`);
  }
  return [...new Set(value.map((item) => item.trim()))];
}

function parseDefinitionBase(value: Record<string, unknown>) {
  if (value.schemaVersion !== ACADEMIC_WARNING_POLICY_SCHEMA_VERSION) {
    throw new PolicyDefinitionError(
      `schemaVersion must be ${ACADEMIC_WARNING_POLICY_SCHEMA_VERSION}`,
      "UNSUPPORTED_POLICY_SCHEMA_VERSION",
    );
  }
  return {
    schemaVersion: ACADEMIC_WARNING_POLICY_SCHEMA_VERSION,
    engineVersion: requiredString(value.engineVersion, "engineVersion"),
  };
}

function parseLegacyPolicyDefinition(value: Record<string, unknown>): LegacyAdvisoryPolicyDefinition {
  const base = parseDefinitionBase(value);
  if (value.executionMode !== "LEGACY_SCALAR_RULES") {
    throw new PolicyDefinitionError("LEGACY_ADVISORY executionMode must be LEGACY_SCALAR_RULES");
  }
  if (!isObject(value.advisory)) throw new PolicyDefinitionError("advisory metadata is required");
  if (!isObject(value.thresholds)) throw new PolicyDefinitionError("thresholds must be an object");
  const enabledSignals = stringArray(value.enabledSignals, "enabledSignals");
  const missingSignals = LEGACY_WARNING_SIGNALS.filter((signal) => !enabledSignals.includes(signal));
  if (missingSignals.length) {
    throw new PolicyDefinitionError(`enabledSignals is missing: ${missingSignals.join(", ")}`);
  }
  const requiredCapabilities = stringArray(value.requiredCapabilities, "requiredCapabilities");
  return {
    ...base,
    evaluationProfile: "LEGACY_ADVISORY",
    executionMode: "LEGACY_SCALAR_RULES",
    advisory: {
      label: requiredString(value.advisory.label, "advisory.label"),
      description: value.advisory.description === undefined
        ? undefined
        : requiredString(value.advisory.description, "advisory.description"),
    },
    thresholds: {
      termGpa4Below: numberInRange(value.thresholds.termGpa4Below, "thresholds.termGpa4Below", 0, 4),
      cumulativeGpa4Below: numberInRange(value.thresholds.cumulativeGpa4Below, "thresholds.cumulativeGpa4Below", 0, 4),
      conductScoreBelow: numberInRange(value.thresholds.conductScoreBelow, "thresholds.conductScoreBelow", 0, 100),
    },
    enabledSignals,
    requiredCapabilities,
  };
}

function parseGreaterThanThreshold(value: unknown, field: string, max?: number) {
  if (!isObject(value) || value.operator !== ">") {
    throw new PolicyDefinitionError(`${field}.operator must be >`);
  }
  return {
    operator: ">" as const,
    value: numberInRange(value.value, `${field}.value`, 0, max),
  };
}

function parseQd600PolicyDefinition(value: Record<string, unknown>): Qd600PolicyDefinition {
  const base = parseDefinitionBase(value);
  if (value.executionMode !== "NOT_YET_ACTIVE_FOR_EVALUATION") {
    throw new PolicyDefinitionError("QD600_ARTICLE_18 is not active for evaluation", "QD600_EXECUTION_MODE_INVALID");
  }
  if (!isObject(value.regulatory)) throw new PolicyDefinitionError("regulatory metadata is required");
  const sourceCode = requiredString(value.regulatory.sourceCode, "regulatory.sourceCode");
  if (sourceCode !== QD600_SOURCE_CODE) {
    throw new PolicyDefinitionError(`regulatory.sourceCode must be ${QD600_SOURCE_CODE}`);
  }
  const articleRefs = stringArray(value.regulatory.articleRefs, "regulatory.articleRefs");
  if (!articleRefs.includes("Điều 18")) {
    throw new PolicyDefinitionError("regulatory.articleRefs must include Điều 18");
  }
  const applicableCohortIds = stringArray(
    value.regulatory.applicableCohortIds ?? [],
    "regulatory.applicableCohortIds",
  );
  if (applicableCohortIds.some((id) => !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id))) {
    throw new PolicyDefinitionError("regulatory.applicableCohortIds must contain UUIDs");
  }

  if (!isObject(value.thresholds)) throw new PolicyDefinitionError("thresholds must be an object");
  const failedCreditRatio = parseGreaterThanThreshold(value.thresholds.failedCreditRatio, "thresholds.failedCreditRatio", 1);
  const accumulatedDebtCredits = parseGreaterThanThreshold(value.thresholds.accumulatedDebtCredits, "thresholds.accumulatedDebtCredits");
  if (!isObject(value.thresholds.termGpa)) throw new PolicyDefinitionError("thresholds.termGpa must be an object");
  const termGpa = {
    firstSemesterBelow: numberInRange(value.thresholds.termGpa.firstSemesterBelow, "thresholds.termGpa.firstSemesterBelow", 0, 4),
    subsequentSemesterBelow: numberInRange(value.thresholds.termGpa.subsequentSemesterBelow, "thresholds.termGpa.subsequentSemesterBelow", 0, 4),
  };
  if (!Array.isArray(value.thresholds.cumulativeGpaByYear) || !value.thresholds.cumulativeGpaByYear.length) {
    throw new PolicyDefinitionError("thresholds.cumulativeGpaByYear must be a non-empty array");
  }
  const seenYearLevels = new Set<number>();
  const cumulativeGpaByYear = value.thresholds.cumulativeGpaByYear.map((item, index) => {
    if (!isObject(item)) throw new PolicyDefinitionError(`thresholds.cumulativeGpaByYear[${index}] must be an object`);
    const yearLevel = numberInRange(item.yearLevel, `thresholds.cumulativeGpaByYear[${index}].yearLevel`, 1);
    if (!Number.isInteger(yearLevel)) throw new PolicyDefinitionError(`thresholds.cumulativeGpaByYear[${index}].yearLevel must be an integer`);
    if (seenYearLevels.has(yearLevel)) throw new PolicyDefinitionError(`Duplicate cumulative GPA yearLevel ${yearLevel}`);
    seenYearLevels.add(yearLevel);
    return {
      yearLevel,
      gpa4Below: numberInRange(item.gpa4Below, `thresholds.cumulativeGpaByYear[${index}].gpa4Below`, 0, 4),
    };
  });

  if (!isObject(value.advisory)) throw new PolicyDefinitionError("advisory configuration is required");
  if (value.advisory.advisoryOnly !== true) throw new PolicyDefinitionError("advisory.advisoryOnly must be true");
  const requiredCapabilities = stringArray(value.requiredCapabilities, "requiredCapabilities");
  const missingCapabilities = QD600_REQUIRED_CAPABILITIES.filter((capability) => !requiredCapabilities.includes(capability));
  if (missingCapabilities.length) {
    throw new PolicyDefinitionError(`requiredCapabilities is missing: ${missingCapabilities.join(", ")}`);
  }

  return {
    ...base,
    evaluationProfile: "QD600_ARTICLE_18",
    executionMode: "NOT_YET_ACTIVE_FOR_EVALUATION",
    regulatory: {
      sourceCode: QD600_SOURCE_CODE,
      sourceName: requiredString(value.regulatory.sourceName, "regulatory.sourceName"),
      sourceVersion: requiredString(value.regulatory.sourceVersion, "regulatory.sourceVersion"),
      issuedDate: requiredString(value.regulatory.issuedDate, "regulatory.issuedDate"),
      effectiveFromAcademicYear: requiredString(value.regulatory.effectiveFromAcademicYear, "regulatory.effectiveFromAcademicYear"),
      applicableFromCohort: requiredString(value.regulatory.applicableFromCohort, "regulatory.applicableFromCohort"),
      applicableCohortIds,
      articleRefs,
      documentChecksum: value.regulatory.documentChecksum === undefined
        ? undefined
        : requiredString(value.regulatory.documentChecksum, "regulatory.documentChecksum"),
    },
    thresholds: { failedCreditRatio, accumulatedDebtCredits, termGpa, cumulativeGpaByYear },
    advisory: {
      earlyWarningMarginGpa4: numberInRange(value.advisory.earlyWarningMarginGpa4, "advisory.earlyWarningMarginGpa4", 0, 4),
      advisoryOnly: true,
    },
    requiredCapabilities,
  };
}

export function parseAcademicWarningPolicyDefinition(value: unknown): AcademicWarningPolicyDefinition {
  if (!isObject(value)) throw new PolicyDefinitionError("policyDefinition must be an object");
  if (value.evaluationProfile === "LEGACY_ADVISORY") return parseLegacyPolicyDefinition(value);
  if (value.evaluationProfile === "QD600_ARTICLE_18") return parseQd600PolicyDefinition(value);
  throw new PolicyDefinitionError("evaluationProfile must be LEGACY_ADVISORY or QD600_ARTICLE_18");
}

export function createLegacyAdvisoryPolicyDefinition(input: {
  label: string;
  termGpaThreshold: number;
  cumulativeGpaThreshold: number;
  conductScoreThreshold: number;
  engineVersion?: string;
  description?: string;
}): LegacyAdvisoryPolicyDefinition {
  return parseAcademicWarningPolicyDefinition({
    schemaVersion: ACADEMIC_WARNING_POLICY_SCHEMA_VERSION,
    engineVersion: input.engineVersion || LEGACY_WARNING_ENGINE_VERSION,
    evaluationProfile: "LEGACY_ADVISORY",
    executionMode: "LEGACY_SCALAR_RULES",
    advisory: {
      label: input.label,
      description: input.description || "Chính sách cảnh báo nội bộ dùng các scalar và signal legacy của SEWS.",
    },
    thresholds: {
      termGpa4Below: input.termGpaThreshold,
      cumulativeGpa4Below: input.cumulativeGpaThreshold,
      conductScoreBelow: input.conductScoreThreshold,
    },
    enabledSignals: [...LEGACY_WARNING_SIGNALS],
    requiredCapabilities: [],
  }) as LegacyAdvisoryPolicyDefinition;
}

export function createQd600PolicyDefinition(input: {
  engineVersion?: string;
  earlyWarningMarginGpa4?: number;
  applicableCohortIds?: string[];
} = {}): Qd600PolicyDefinition {
  return parseAcademicWarningPolicyDefinition({
    schemaVersion: ACADEMIC_WARNING_POLICY_SCHEMA_VERSION,
    engineVersion: input.engineVersion || QD600_PENDING_ENGINE_VERSION,
    evaluationProfile: "QD600_ARTICLE_18",
    executionMode: "NOT_YET_ACTIVE_FOR_EVALUATION",
    regulatory: {
      sourceCode: QD600_SOURCE_CODE,
      sourceName: "Quyết định 600/QĐ-ĐHĐL ban hành Quy chế đào tạo trình độ đại học của Trường Đại học Đà Lạt",
      sourceVersion: "600/QĐ-ĐHĐL@2021-08-31",
      issuedDate: "2021-08-31",
      effectiveFromAcademicYear: "2021-2022",
      applicableFromCohort: "K45",
      applicableCohortIds: input.applicableCohortIds || [],
      articleRefs: ["Điều 18"],
      documentChecksum: "6e1932e7a8463e7f64785894f97a27c6783d50d0833f7b1632e343e2906bd3d3",
    },
    thresholds: {
      failedCreditRatio: { operator: ">", value: 0.5 },
      accumulatedDebtCredits: { operator: ">", value: 24 },
      termGpa: { firstSemesterBelow: 0.8, subsequentSemesterBelow: 1 },
      cumulativeGpaByYear: [
        { yearLevel: 1, gpa4Below: 1.2 },
        { yearLevel: 2, gpa4Below: 1.4 },
        { yearLevel: 3, gpa4Below: 1.6 },
        { yearLevel: 4, gpa4Below: 1.8 },
      ],
    },
    advisory: { earlyWarningMarginGpa4: input.earlyWarningMarginGpa4 ?? 0.2, advisoryOnly: true },
    requiredCapabilities: [...QD600_REQUIRED_CAPABILITIES],
  }) as Qd600PolicyDefinition;
}

export function normalizeAcademicWarningPolicyInput(input: {
  name?: string;
  policyDefinition?: unknown;
  definition?: unknown;
  termGpaThreshold?: number;
  cumulativeGpaThreshold?: number;
  conductScoreThreshold?: number;
}) {
  const termGpaThreshold = input.termGpaThreshold ?? 2;
  const cumulativeGpaThreshold = input.cumulativeGpaThreshold ?? 2;
  const conductScoreThreshold = input.conductScoreThreshold ?? 50;
  const suppliedDefinition = input.policyDefinition ?? input.definition;
  return {
    definition: suppliedDefinition === undefined
      ? createLegacyAdvisoryPolicyDefinition({
          label: input.name || "Chính sách cảnh báo nội bộ legacy",
          termGpaThreshold,
          cumulativeGpaThreshold,
          conductScoreThreshold,
        })
      : parseAcademicWarningPolicyDefinition(suppliedDefinition),
    termGpaThreshold,
    cumulativeGpaThreshold,
    conductScoreThreshold,
  };
}

export function assertPolicyExecutable(
  definition: AcademicWarningPolicyDefinition,
): asserts definition is LegacyAdvisoryPolicyDefinition {
  if (definition.evaluationProfile !== "LEGACY_ADVISORY" || definition.executionMode !== "LEGACY_SCALAR_RULES") {
    throw new PolicyDefinitionError(
      "QĐ600 Điều 18 is defined but not active for evaluation",
      "POLICY_NOT_ACTIVE_FOR_EVALUATION",
    );
  }
}

export function academicWarningPolicyDefinitionHash(definition: AcademicWarningPolicyDefinition) {
  return sha256Hex(JSON.stringify(definition));
}

export function createAcademicWarningPolicySnapshot(input: {
  id: string;
  name: string;
  policyVersion: number;
  definition: AcademicWarningPolicyDefinition;
  definitionHash?: string | null;
}) {
  const policyDefinition = JSON.parse(JSON.stringify(input.definition)) as AcademicWarningPolicyDefinition;
  return {
    id: input.id,
    name: input.name,
    policyVersion: input.policyVersion,
    schemaVersion: policyDefinition.schemaVersion,
    engineVersion: policyDefinition.engineVersion,
    evaluationProfile: policyDefinition.evaluationProfile,
    executionMode: policyDefinition.executionMode,
    definitionHash: input.definitionHash || academicWarningPolicyDefinitionHash(policyDefinition),
    policyDefinition,
  };
}

export function assertPolicyDefinitionMutable(input: { completedOfficialRunCount: number }) {
  if (input.completedOfficialRunCount > 0) {
    throw new PolicyDefinitionError(
      "A policy used by a completed official run is immutable; create a new version instead",
      "POLICY_VERSION_IMMUTABLE",
    );
  }
}
