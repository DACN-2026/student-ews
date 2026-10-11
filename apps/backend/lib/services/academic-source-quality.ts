import { prisma } from "../prisma";

export type SourceQualityIssue = { code: string; summary: string; blocking: boolean; evidence: Record<string, unknown> };
export type StudentSourceQuality = { auditId: string; checkedAt: string; issues: SourceQualityIssue[] };
const object = (value: unknown): Record<string, unknown> => value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};

/** A successful audit replaces the previous observation for this assessment period. */
export async function loadSourceQuality(studentIds: string[], programCode: string, termId: string) {
  const result = new Map<string, StudentSourceQuality>();
  if (!studentIds.length) return result;
  const audit = await prisma.auditLog.findFirst({ where: { action: "academic_warning.source.audit", resourceType: "AcademicTerm", resourceId: termId },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }], select: { id: true, details: true } });
  const details = object(audit?.details), rows = details.students;
  if (!audit || details.schemaVersion !== 1 || typeof details.checkedAt !== "string" || !Number.isFinite(Date.parse(details.checkedAt)) || !Array.isArray(rows)) return result;
  const allowed = new Set(studentIds);
  for (const item of rows) {
    const row = object(item);
    if (typeof row.studentId !== "string" || !allowed.has(row.studentId) || row.programCode !== programCode || !Array.isArray(row.issues)) continue;
    const issues = row.issues.map(object).filter(issue => typeof issue.code === "string" && typeof issue.summary === "string" && typeof issue.blocking === "boolean")
      .map(issue => ({ code: issue.code as string, summary: issue.summary as string, blocking: issue.blocking as boolean, evidence: object(issue.evidence) }));
    result.set(row.studentId, { auditId: audit.id, checkedAt: details.checkedAt, issues });
  }
  return result;
}
