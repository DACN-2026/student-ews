import assert from "node:assert/strict";
import test from "node:test";
import {
  createAcademicWarningPolicySnapshot,
  createLegacyAdvisoryPolicyDefinition,
  createQd600PolicyDefinition,
} from "../lib/services/academic-warning-policy";
import {
  QD600_EXECUTION_PROFILE,
  resolveQd600PolicyApplicability,
} from "../lib/services/academic-warning-qd600-rules";
import {
  resolveAcademicWarningExecutionProfile,
  validateAcademicWarningRunPolicyContract,
} from "../lib/services/academic-warnings";
import { assertAcademicWarningAssessmentTermAllowed } from "../lib/academic-terms";

const CONFIGURED_COHORT_ID = "ff5fd648-e1d0-432c-aa82-dbea3f074151";
const UNCONFIGURED_COHORT_ID = "00000000-0000-4000-8000-000000000047";
const POLICY_ID = "4c7432f3-d208-4c12-b511-8b8c7c9b0ddc";

const qd600Definition = createQd600PolicyDefinition({ applicableCohortIds: [CONFIGURED_COHORT_ID] });
const qd600DraftPolicy = {
  id: POLICY_ID,
  status: "draft",
  policyDefinition: qd600Definition,
};

function hasErrorCode(code: string) {
  return (error: unknown) => error instanceof Error && "code" in error && error.code === code;
}

test("configured cohort UUID is APPLICABLE", () => {
  assert.deepEqual(resolveQd600PolicyApplicability(qd600Definition, CONFIGURED_COHORT_ID), {
    status: "APPLICABLE",
    reasonCode: null,
  });
});

test("unconfigured cohort is NOT_APPLICABLE", () => {
  assert.deepEqual(resolveQd600PolicyApplicability(qd600Definition, UNCONFIGURED_COHORT_ID), {
    status: "NOT_APPLICABLE",
    reasonCode: "REGULATORY_POLICY_NOT_APPLICABLE",
  });
});

test("missing cohort is COHORT_UNRESOLVED", () => {
  assert.deepEqual(resolveQd600PolicyApplicability(qd600Definition, null), {
    status: "UNRESOLVED",
    reasonCode: "REGULATORY_POLICY_COHORT_UNRESOLVED",
  });
});

test("Kxx-looking unconfigured cohort does not become applicable", () => {
  assert.equal(resolveQd600PolicyApplicability(qd600Definition, UNCONFIGURED_COHORT_ID).status, "NOT_APPLICABLE");
});

test("QD600 run requires explicit policyId", () => {
  assert.throws(() => validateAcademicWarningRunPolicyContract({
    executionProfile: QD600_EXECUTION_PROFILE,
    runMode: "OFFICIAL",
    cohortId: CONFIGURED_COHORT_ID,
    policyId: undefined,
    policy: null,
  }), hasErrorCode("QD600_POLICY_REQUIRED"));
});

test("QD600 run rejects a policy with the wrong definition type", () => {
  const legacyDefinition = createLegacyAdvisoryPolicyDefinition({
    label: "Legacy",
    termGpaThreshold: 2,
    cumulativeGpaThreshold: 2,
    conductScoreThreshold: 50,
  });
  assert.throws(() => validateAcademicWarningRunPolicyContract({
    executionProfile: QD600_EXECUTION_PROFILE,
    runMode: "OFFICIAL",
    cohortId: CONFIGURED_COHORT_ID,
    policyId: POLICY_ID,
    policy: { id: POLICY_ID, status: "active", policyDefinition: legacyDefinition },
  }), hasErrorCode("QD600_POLICY_TYPE_REQUIRED"));
});

test("QD600 policy never silently falls back to legacy execution", () => {
  assert.throws(() => validateAcademicWarningRunPolicyContract({
    runMode: "OFFICIAL",
    cohortId: CONFIGURED_COHORT_ID,
    policyId: POLICY_ID,
    policy: qd600DraftPolicy,
  }), hasErrorCode("QD600_EXECUTION_PROFILE_REQUIRED"));
});

test("a finalized current MAIN term is eligible for the explicit QD600 workflow", () => {
  assert.doesNotThrow(() => assertAcademicWarningAssessmentTermAllowed({
    isCurrent: true,
    isSummer: false,
    gradesFinalizedAt: "2026-12-20T08:00:00.000Z",
  }, "OFFICIAL"));
});

test("legacy execution profile remains available", () => {
  const legacyDefinition = createLegacyAdvisoryPolicyDefinition({
    label: "Legacy",
    termGpaThreshold: 2,
    cumulativeGpaThreshold: 2,
    conductScoreThreshold: 50,
  });
  assert.equal(resolveAcademicWarningExecutionProfile(), "LEGACY_SCALAR_RULES");
  assert.equal(validateAcademicWarningRunPolicyContract({
    runMode: "OFFICIAL",
    cohortId: CONFIGURED_COHORT_ID,
    policyId: "00000000-0000-4000-8000-000000000001",
    policy: { id: "00000000-0000-4000-8000-000000000001", status: "active", policyDefinition: legacyDefinition },
  }).executionProfile, "LEGACY_SCALAR_RULES");
});

test("contract validation does not mutate a historical policy snapshot", () => {
  const legacyDefinition = createLegacyAdvisoryPolicyDefinition({
    label: "Historical legacy",
    termGpaThreshold: 2,
    cumulativeGpaThreshold: 2,
    conductScoreThreshold: 50,
  });
  const snapshot = createAcademicWarningPolicySnapshot({
    id: "00000000-0000-4000-8000-000000000001",
    name: "Historical legacy",
    policyVersion: 1,
    definition: legacyDefinition,
  });
  const before = structuredClone(snapshot);
  validateAcademicWarningRunPolicyContract({
    executionProfile: QD600_EXECUTION_PROFILE,
    runMode: "OFFICIAL",
    cohortId: CONFIGURED_COHORT_ID,
    policyId: POLICY_ID,
    policy: qd600DraftPolicy,
  });
  assert.deepEqual(snapshot, before);
});

test("QD600 controlled run requires the draft lifecycle state", () => {
  assert.throws(() => validateAcademicWarningRunPolicyContract({
    executionProfile: QD600_EXECUTION_PROFILE,
    runMode: "OFFICIAL",
    cohortId: CONFIGURED_COHORT_ID,
    policyId: POLICY_ID,
    policy: { ...qd600DraftPolicy, status: "archived" },
  }), hasErrorCode("QD600_POLICY_LIFECYCLE_INVALID"));
});

test("QD600 controlled run requires explicit OFFICIAL mode", () => {
  assert.throws(() => validateAcademicWarningRunPolicyContract({
    executionProfile: QD600_EXECUTION_PROFILE,
    cohortId: CONFIGURED_COHORT_ID,
    policyId: POLICY_ID,
    policy: qd600DraftPolicy,
  }), hasErrorCode("QD600_RUN_MODE_REQUIRED"));
});
