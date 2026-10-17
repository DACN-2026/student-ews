import assert from "node:assert/strict";
import test, { type TestContext } from "node:test";
import ExcelJS from "exceljs";
import { prisma } from "../lib/prisma";
import { ExportService } from "../lib/services/export";
import { StudentsService } from "../lib/services/students";
import { ReportsService } from "../lib/services/reports";
import { StudentTrainingProgressService } from "../lib/services/student-training-progress";
import { dashboardProgressStatus } from "../lib/services/dashboard";

function replace(context: TestContext, target: object, key: string, value: unknown) {
  const record = target as Record<string, unknown>, previous = record[key];
  record[key] = value; context.after(() => { record[key] = previous; });
}

test("dashboard preserves an unresolved assessment rather than counting it as a failure", () => {
  assert.equal(dashboardProgressStatus("ON_TRACK"), "on_track");
  assert.equal(dashboardProgressStatus("BEHIND"), "behind_schedule");
  assert.equal(dashboardProgressStatus("UNKNOWN"), "data_error");
  assert.equal(dashboardProgressStatus(""), "data_error");
});

test("export selects published standard results by assessment chronology, not a later rerun of the past", async context => {
  const student = { id: "s", sStudentId: "S", sFullName: "Student", sClassStudentId: "C", sStudyProgramId: "P" };
  replace(context, prisma.student, "findMany", async () => [student]);
  const runs = [
    { id: "forecast", assessmentAcademicTermId: "now", status: "completed", evaluationMode: "graduation_forecast", publicationStatus: "active" },
    { id: "archived", assessmentAcademicTermId: "now", status: "completed", evaluationMode: "standard", publicationStatus: "archived" },
    { id: "old-rerun", assessmentAcademicTermId: "old", status: "completed", evaluationMode: "standard", publicationStatus: "active" },
    { id: "current-standard", assessmentAcademicTermId: "now", status: "completed", evaluationMode: "standard", publicationStatus: "active" },
  ];
  replace(context, prisma.trainingProgressCompletionRun, "findMany", async ({ where }: { where: Record<string, unknown> }) => runs.filter(r =>
    Object.entries(where).every(([key, value]) => value === undefined || r[key as keyof typeof r] === value)));
  replace(context, prisma.academicTerm, "findMany", async () => [
    { id: "old", academicYearId: "Y", sTermCode: "HK01", sTermOrder: 1 },
    { id: "now", academicYearId: "Y", sTermCode: "HK02", sTermOrder: 2 },
  ]);
  replace(context, prisma.academicYear, "findMany", async () => [{ id: "Y", sYearCode: "2025-2026" }]);
  replace(context, prisma.trainingProgressCompletionStudentResult, "findMany", async ({ where }: { where: { runId?: { in: string[] } } }) => runs
    .filter(r => !where.runId || where.runId.in.includes(r.id))
    .map(r => ({ studentId: "s", sStudentId: "S", sStudentName: "Student", runId: r.id, scheduleStatus: r.id === "current-standard" ? "pending_result" : "behind_schedule", pendingResultCourses: 1 })));
  const file = await ExportService.create("xlsx", "progress", {}, {});
  assert.ok(file); assert.equal(file.rowCount, 1);
  const workbook = new ExcelJS.Workbook(); await workbook.xlsx.load(file.body as never);
  let row: ExcelJS.Row | undefined;
  workbook.worksheets[0].eachRow(candidate => { if (candidate.getCell(1).value === "S") row = candidate; });
  assert.ok(row);
  assert.equal(row.getCell(5).value, "pending_result");
  assert.equal(row.getCell(11).value, "HK02 2025-2026");
});

test("departed directory records without a current assessment do not default to normal", async context => {
  const student = { id: "s", sStudentId: "S", sFullName: "Student", sIsInClass: false, studySuspensions: [] };
  replace(context, prisma.student, "findMany", async () => [student]);
  replace(context, prisma, "$queryRaw", async () => [{ id: "s" }]);
  replace(context, ReportsService, "academicWarningStudents", async () => ({ items: [] }));
  const result = await StudentsService.list({ isInClass: false }, 1, 20, {}, true);
  assert.equal(result.items[0].isInClass, false);
  assert.equal(result.items[0].warningInfo, null);
  assert.equal(result.items[0].warningLevel, "insufficient");
});

test("historical department results pass their period to evaluation and never reuse today's cached result", async context => {
  replace(context, StudentTrainingProgressService, "loadProgressBatch", async () => undefined);
  const student = { id: "historical-cache-test", sStudentId: "S", sFullName: "Student" };
  replace(context, prisma.student, "findMany", async (query: { where?: { OR?: unknown } }) => query.where?.OR ? [] : [student]);
  replace(context, StudentTrainingProgressService, "getStudentTrainingProgress", async (_id: string, _scope: unknown, assessment?: { academicYear: string }) => ({
    student: { id: student.id, studentCode: "S", fullName: "Student" }, curriculum: {},
    scheduleProgress: { progressStatus: assessment?.academicYear === "2024-2025" ? "BEHIND" : "ON_TRACK" },
  }));
  const scopeWhere = { sStudentId: "historical-cache-test" };
  const old = await StudentTrainingProgressService.getDepartmentProgressOverview({ scopeWhere, assessment: { academicYear: "2024-2025", termCode: "HK02", termOrder: 2, boundary: "END_OF_TERM" } });
  const current = await StudentTrainingProgressService.getDepartmentProgressOverview({ scopeWhere });
  assert.equal(old.kpi.behindCount, 1);
  assert.equal(current.kpi.onTrackCount, 1);
});
