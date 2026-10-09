import assert from "node:assert/strict";
import test from "node:test";
import { compareStudentOrder, compareStudentRows, orderedStudentResultPage } from "../lib/student-list-order";
import { prisma } from "../lib/prisma";
import { TrainingProgressService } from "../lib/services/training-progress";
import { AcademicWarningsService } from "../lib/services/academic-warnings";
import { workbookBuffer } from "../lib/services/export";
import ExcelJS from "exceljs";

const students = [
  { id: "49", sStudentId: "SV49", sStudentName: "Nguyễn Văn An", sClassStudentId: "ITK49A" },
  { id: "46b", sStudentId: "SV46B", sStudentName: "Nguyễn Văn An", sClassStudentId: "ITK46B" },
  { id: "t", sStudentId: "SV01", sStudentName: "Bùi Văn Tuấn", sClassStudentId: "ITK46A" },
  { id: "48", sStudentId: "SV48", sStudentName: "Nguyễn Văn An", sClassStudentId: "ITK48A" },
  { id: "dd", sStudentId: "SV02", sStudentName: "Đinh Xuân Đức", sClassStudentId: "ITK46A" },
  { id: "47", sStudentId: "SV47", sStudentName: "Nguyễn Văn An", sClassStudentId: "ITK47A" },
  { id: "a", sStudentId: "SV99", sStudentName: "Trương Kim An", sClassStudentId: "ITK46A" },
  { id: "d", sStudentId: "SV03", sStudentName: "Hán Quang Dũng", sClassStudentId: "ITK46A" },
];
const expected = ["a", "d", "dd", "t", "46b", "47", "48", "49"];

test("student lists order cohorts and classes before Vietnamese given names, regardless of student codes", () => {
  assert.deepEqual([...students].sort(compareStudentRows).map(row => row.id), expected);
  assert.deepEqual([...students].reverse().sort(compareStudentRows).map(row => row.id), expected);
});

test("cohorts and class suffixes use numeric order and students without a class remain last", () => {
  const rows = ["ITK100A", "ITK49A10", "ITK49A2", "ITK9A", "—", "ITK46A"].map(classCode => ({ classCode }));
  assert.deepEqual(rows.sort(compareStudentOrder).map(row => row.classCode), ["ITK9A", "ITK46A", "ITK49A2", "ITK49A10", "ITK100A", "—"]);
});

test("Vietnamese diacritics are preserved, normalized Unicode ties use stable student IDs, and missing names remain last", () => {
  const rows = [
    { id: "2", classCode: "ITK46A", fullName: "Nguyễn Văn Đức" },
    { id: "3", classCode: "ITK46A", fullName: "Nguyễn Văn Dũng" },
    { id: "1", classCode: "ITK46A", fullName: "Nguyễn Văn Đức".normalize("NFD") },
    { id: "0", classCode: "ITK46A", fullName: "" },
  ];
  assert.deepEqual(rows.sort(compareStudentOrder).map(row => row.id), ["3", "1", "2", "0"]);
});

test("pagination orders the entire scope before slicing and restores order after a database fetch", async () => {
  const loadedIds: string[][] = [];
  const readPage = (page: number) => orderedStudentResultPage(
    async () => [...students],
    async ids => { loadedIds.push(ids); return [...ids].reverse().map(id => ({ id, detail: true })); },
    page, 3,
  );
  const pages = await Promise.all([readPage(1), readPage(2), readPage(3)]);
  assert.deepEqual(pages.flatMap(page => page.items.map(row => row.id)), expected);
  assert.ok(pages.every(page => page.total === students.length));
  assert.deepEqual(loadedIds, [expected.slice(0, 3), expected.slice(3, 6), expected.slice(6)]);
});

test("empty and out-of-range pages do not load detailed student data", async () => {
  let detailReads = 0;
  const load = async () => { detailReads++; return []; };
  assert.deepEqual(await orderedStudentResultPage(async () => [], load, 1, 20), { total: 0, items: [] });
  assert.deepEqual(await orderedStudentResultPage(async () => [...students], load, 99, 20), { total: 8, items: [] });
  assert.equal(detailReads, 0);
});

test("Excel exports retain every sorted student, including the first rows below the report title", async () => {
  const sorted = [...students].sort(compareStudentRows);
  const buffer = await workbookBuffer({
    title: "Danh sách sinh viên", sheetName: "Sinh viên",
    columns: [{ header: "MSSV", key: "code" }, { header: "Họ và tên", key: "name" }, { header: "Lớp", key: "class" }],
    rows: sorted.map(row => ({ code: row.sStudentId, name: row.sStudentName, class: row.sClassStudentId })),
  });
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(Uint8Array.from(buffer).buffer);
  const sheet = workbook.worksheets[0];
  assert.equal(sheet.getRow(4).getCell(1).value, "MSSV");
  assert.equal(sheet.rowCount, sorted.length + 4);
  assert.deepEqual(sorted.map((_, index) => sheet.getRow(index + 5).getCell(1).value), sorted.map(row => row.sStudentId));
  assert.deepEqual(sorted.map((_, index) => sheet.getRow(index + 5).getCell(2).value), sorted.map(row => row.sStudentName));
});

type QueryWhere = { AND?: QueryWhere[]; classId?: { in: string[] }; id?: { in: string[] }; runId?: string };
function replace(target: object, method: string, implementation: unknown) {
  const record = target as Record<string, unknown>;
  const original = record[method];
  record[method] = implementation;
  return () => { record[method] = original; };
}

for (const service of ["registration", "completion", "warning"] as const) {
  test(`${service} results retain class permissions and sort names before paginating`, async () => {
    const model = service === "registration" ? prisma.trainingProgressStudentResult
      : service === "completion" ? prisma.trainingProgressCompletionStudentResult : prisma.academicWarningStudentResult;
    const cleanup = [
      replace(prisma.student, "findMany", async () => []),
      replace(model, "findMany", async ({ where, select }: { where: QueryWhere; select?: unknown }) => {
        const scope = where.AND?.[0] || where;
        assert.equal(scope.runId, "RUN");
        assert.deepEqual(scope.classId, { in: ["ITK46A"] });
        const selectedIds = where.AND?.[1]?.id?.in;
        if (!select) assert.deepEqual(selectedIds, ["dd", "t"]);
        return students.filter(row => scope.classId!.in.includes(row.sClassStudentId) && (!selectedIds || selectedIds.includes(row.id)))
          .map(row => ({ ...row, studentId: row.id, sClassName: row.sClassStudentId }));
      }),
    ];
    try {
      const result = service === "registration"
        ? await TrainingProgressService.listStudentResults("RUN", undefined, undefined, 2, 2, ["ITK46A"])
        : service === "completion"
          ? await TrainingProgressService.listCompletionStudents("RUN", undefined, undefined, undefined, 2, 2, ["ITK46A"])
          : await AcademicWarningsService.listStudentResults("RUN", undefined, undefined, undefined, undefined, undefined, 2, 2, ["ITK46A"]);
      assert.equal(result.total, 4);
      assert.deepEqual(result.items.map(row => row.studentName), ["Đinh Xuân Đức", "Bùi Văn Tuấn"]);
    } finally { cleanup.reverse().forEach(restore => restore()); }
  });
}
