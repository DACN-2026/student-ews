import assert from "node:assert/strict";
import test from "node:test";
import { sourceGradeStatus } from "../lib/source-grade-status.cjs";
import { sourceAcademicPeriod } from "../lib/source-academic-period.cjs";
import { loadSourceQuality } from "../lib/services/academic-source-quality";
import { prisma } from "../lib/prisma";

test("blank historical results remain unknown; zero scores, official pass flags, VT and explicit pending stay distinct", () => {
  assert.equal(sourceGradeStatus({ isPass: false }), "unknown");
  assert.equal(sourceGradeStatus({ letter: "N/A", isPass: false }), "unknown");
  assert.equal(sourceGradeStatus({ score10: 0, score4: 0, isPass: false }), "graded");
  assert.equal(sourceGradeStatus({ isPass: true }), "graded");
  assert.equal(sourceGradeStatus({ special: "VT" }), "special");
  assert.equal(sourceGradeStatus({ notScore: true }), "pending");
});

test("academic periods use explicit source labels, preserve missing scope and quarantine conflicting labels", () => {
  const row = { YearStudy: "2025-2026", TermID: "HK03", NamHoc: "1", HocKy: "1", _TermID: 3 };
  assert.deepEqual(sourceAcademicPeriod("2025-2026", "HK03", [row]), { yearCode: "2025-2026", termCode: "HK03" });
  assert.deepEqual(sourceAcademicPeriod("1", "", [row]), { yearCode: "2025-2026", termCode: "HK03" });
  assert.equal(sourceAcademicPeriod("", "", [{ NamHoc: "1", HocKy: "1", _TermID: 3 }]), null);
  assert.equal(sourceAcademicPeriod("2025-2026", "HK02", [row]), null);
  assert.equal(sourceAcademicPeriod("", "", [row, { ...row, TermID: "HK02" }]), null);
});

test("source audit evidence is bounded to the requested term, authorized students and program", async () => {
  const original = prisma.auditLog.findFirst;
  let calls = 0;
  prisma.auditLog.findFirst = (async (query: { where: { resourceId: string } }) => {
    calls++;
    assert.equal(query.where.resourceId, "term");
    return { id: "audit", details: { schemaVersion: 1, checkedAt: "2026-10-11T00:00:00Z", students: [
      { studentId: "allowed", programCode: "program", issues: [{ code: "CONFLICT", summary: "Source conflict", blocking: true, evidence: { value: 1 } }] },
      { studentId: "outside", programCode: "program", issues: [{ code: "SECRET", summary: "Out of scope", blocking: true }] },
      { studentId: "allowed", programCode: "other", issues: [{ code: "OTHER_PROGRAM", summary: "Other scope", blocking: true }] },
    ] } };
  }) as unknown as typeof original;
  try {
    assert.equal((await loadSourceQuality([], "program", "term")).size, 0);
    assert.equal(calls, 0);
    const result = await loadSourceQuality(["allowed"], "program", "term");
    assert.equal(result.size, 1);
    assert.deepEqual(result.get("allowed")?.issues.map(issue => issue.code), ["CONFLICT"]);
  } finally { prisma.auditLog.findFirst = original; }
});
