import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { NextRequest } from "next/server";
import { evaluate, evaluateSummerMonitoring } from "../lib/services/academic-warnings";
import {
  applyElectiveThreshold,
  evaluateCompletionPlan,
  evaluateProgress,
} from "../lib/services/training-progress";
import { hasInvalidUuidSegment, hasPermission, proxy, requiredPermission } from "../proxy";
import { checkLoginAttempt, clearLoginFailures, loginAttemptKey, recordLoginFailure } from "../lib/auth/login-rate-limit";
import { gradeImportRowKey, GradesService, parseCredits, parseDecimal, parseScore10, parseScore4 } from "../lib/services/grades";
import { parsePagination } from "../lib/utils/api-response";
import { AuthService } from "../lib/services/auth";
import { buildWarningTrend, selectLatestReportingPeriod, summarizeWarningTrend } from "../lib/services/reports";
import { POST as loginRoute } from "../app/api/v1/auth/login/route";
import { POST as refreshRoute } from "../app/api/v1/auth/refresh/route";
import { signAccessToken } from "../lib/auth/jwt";
import { assertWarningActionTransition, parseWarningActionStatus } from "../lib/services/warning-actions";
import { ApiError } from "../lib/utils/api-error";
import { classifyConductScore, conductApproval, isSummerConductTerm } from "../lib/services/conduct";
import { buildAcademicTermLinks, isConfiguredSummerTermCode, latestMainTerm } from "../lib/academic-terms";
import {
  buildExportFileName,
  parseExportParameter,
  reportPdfBuffer,
  safeExportStem,
  workbookBuffer,
} from "../lib/services/export";

const IDS = {
  student: "11111111-1111-4111-8111-111111111111",
  courseA: "22222222-2222-4222-8222-222222222222",
  courseB: "33333333-3333-4333-8333-333333333333",
  plan: "44444444-4444-4444-8444-444444444444",
  term: "55555555-5555-4555-8555-555555555555",
};

test("API permission policy follows the Phase 2 contract", () => {
  assert.equal(requiredPermission("/api/v1/students", "GET"), "student.read");
  assert.equal(requiredPermission("/api/v1/students/import", "POST"), "student.import");
  assert.equal(requiredPermission("/api/v1/students/x/decisions/y", "DELETE"), "decision.delete");
  assert.equal(requiredPermission("/api/v1/training-progress/plans/x/calculate", "POST"), "progress.calculate");
  assert.equal(requiredPermission("/api/v1/rbac/roles/x/permissions", "PUT"), "role.manage");
  assert.equal(requiredPermission("/api/v1/rbac/advisor-assignments", "POST"), "advisor_assignment.manage");
  assert.equal(requiredPermission("/api/v1/training-progress/completion-runs/preview", "POST"), "progress.calculate");
  assert.equal(requiredPermission("/api/v1/academic-warnings/actions", "POST"), "academic_warning.action.create");
  assert.equal(requiredPermission(`/api/v1/academic-warnings/actions/${IDS.plan}`, "PATCH"), "academic_warning.action.update");
  assert.equal(requiredPermission("/api/v1/reports/export", "GET"), "report.export");
});

test("Phase 3 export helpers produce real XLSX/PDF files and safe names", async () => {
  const table = {
    title: "Báo cáo thử nghiệm",
    sheetName: "Dữ liệu",
    columns: [
      { header: "MSSV", key: "studentCode" },
      { header: "Họ và tên", key: "studentName" },
    ],
    rows: [{ studentCode: "SV001", studentName: "Nguyễn Văn An" }],
  };
  const xlsx = await workbookBuffer(table);
  assert.equal(xlsx.subarray(0, 2).toString("ascii"), "PK");
  const pdf = await reportPdfBuffer(table);
  assert.equal(pdf.subarray(0, 4).toString("ascii"), "%PDF");
  assert.equal(safeExportStem("Hồ sơ: SV/001"), "Ho_so_SV_001");
  assert.equal(buildExportFileName("warnings", "xlsx", new Date("2026-09-19T00:00:00Z")), "bao_cao_canh_bao_2026-09-19.xlsx");
  assert.equal(parseExportParameter("pdf", ["xlsx", "pdf"] as const, "format"), "pdf");
  assert.throws(() => parseExportParameter("csv", ["xlsx", "pdf"] as const, "format"), /format must be one of/);
});

function apiOperations(): Set<string> {
  const root = process.cwd();
  const apiRoot = path.join(root, "app", "api", "v1");
  const files: string[] = [];
  const visit = (directory: string) => {
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
      const absolute = path.join(directory, entry.name);
      if (entry.isDirectory()) visit(absolute);
      else if (entry.name === "route.ts") files.push(absolute);
    }
  };
  visit(apiRoot);

  const actual = new Set<string>();
  for (const file of files) {
    const relative = path.relative(apiRoot, path.dirname(file)).split(path.sep).join("/");
    const routePath = `/${relative}`.replace(/\[([^\]]+)\]/g, "{param}");
    const source = fs.readFileSync(file, "utf8");
    for (const match of source.matchAll(/export\s+async\s+function\s+(GET|POST|PUT|PATCH|DELETE)\b/g)) {
      actual.add(`${match[1]} ${routePath}`);
    }
    for (const match of source.matchAll(/export\s+const\s+(GET|POST|PUT|PATCH|DELETE)\s*=/g)) {
      actual.add(`${match[1]} ${routePath}`);
    }
    for (const match of source.matchAll(/export\s*\{([^}]+)\}\s*from/g)) {
      for (const method of match[1].match(/\b(GET|POST|PUT|PATCH|DELETE)\b/g) || []) {
        actual.add(`${method} ${routePath}`);
      }
    }
  }

  return actual;
}

test("backend matches the supported API operation inventory", () => {
  const expected = JSON.parse(fs.readFileSync(
    path.join(process.cwd(), "tests", "fixtures", "api-operations.json"), "utf8",
  )) as string[];
  assert.deepEqual([...apiOperations()].sort(), expected);
});

test("backend exposes every external SWE OpenAPI method and path when supplied", (context) => {
  const specificationPath = process.env.SWE_OPENAPI_PATH || path.resolve(
    process.cwd(), "../../SWE/cntt-portal-v2/backend/internal/httpapi/docs/openapi.json",
  );
  if (!process.env.SWE_OPENAPI_PATH && !fs.existsSync(specificationPath)) {
    context.skip("External SWE specification is absent; the pre-split inventory is checked separately");
    return;
  }
  const actual = apiOperations();
  const specification = JSON.parse(fs.readFileSync(specificationPath, "utf8")) as {
    paths: Record<string, Record<string, unknown>>;
  };
  const expected = Object.entries(specification.paths).flatMap(([routePath, operations]) =>
    Object.keys(operations)
      .filter((method) => ["get", "post", "put", "patch", "delete"].includes(method))
      .map((method) => `${method.toUpperCase()} ${routePath.replace(/\{[^}]+\}/g, "{param}")}`),
  );
  assert.deepEqual(expected.filter((operation) => !actual.has(operation)), []);
});

test("backend accepts configured frontend origins and rejects forged origins including auth routes", async () => {
  const previous = process.env.ALLOWED_ORIGINS;
  process.env.ALLOWED_ORIGINS = "https://students.example.edu";
  try {
    const allowed = await proxy(new NextRequest("http://127.0.0.1:3001/api/v1/auth/login", {
      method: "POST", headers: { origin: "https://students.example.edu" },
    }));
    assert.equal(allowed.headers.get("x-middleware-next"), "1");

    for (const route of ["/auth/login", "/auth/refresh", "/auth/logout", "/students"]) {
      const denied = await proxy(new NextRequest(`http://127.0.0.1:3001/api/v1${route}`, {
        method: "POST",
        headers: { origin: "https://evil.example", "x-forwarded-host": "evil.example" },
      }));
      assert.equal(denied.status, 403);
      assert.equal((await denied.json()).error.code, "INVALID_ORIGIN");
    }
    const unsigned = await proxy(new NextRequest("http://127.0.0.1:3001/api/v1/students", {
      method: "POST", headers: { origin: "https://students.example.edu" },
    }));
    assert.equal(unsigned.status, 401);
  } finally {
    if (previous === undefined) delete process.env.ALLOWED_ORIGINS;
    else process.env.ALLOWED_ORIGINS = previous;
  }
});

test("login and refresh preserve HttpOnly cookies and API authorization after the split", async (context) => {
  const previousSecret = process.env.JWT_SECRET;
  process.env.JWT_SECRET = "test-only-secret-for-monorepo-cookie-regression";
  try {
    const actor = {
      userId: IDS.student, username: "migration-test", fullName: "Migration Test",
      grants: [{ role: "staff", scope: "system", permission: "student.read" }],
    };
    const signed = await signAccessToken(actor.userId, actor.username, actor);
    const tokens = {
      accessToken: signed.token, refreshToken: "test-refresh-before",
      expiresAt: signed.expiresAt.toISOString(),
    };
    // Stub persistence only; exercise real route handlers, JWT and cookies.
    const loginMock = context.mock.method(AuthService, "login", async () => ({
      user: { id: actor.userId, username: actor.username, fullName: actor.fullName, email: null, isActive: true },
      actor, tokens,
    }));
    const response = await loginRoute(new NextRequest("http://backend:3001/api/v1/auth/login", {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ username: actor.username, password: "test-only" }),
    }));
    assert.equal(response.status, 200);
    assert.equal(loginMock.mock.callCount(), 1);
    assert.equal(response.headers.getSetCookie().length, 2);
    for (const cookie of response.headers.getSetCookie()) {
      assert.match(cookie, /HttpOnly/i);
      assert.match(cookie, /SameSite=lax/i);
    }
    assert.equal(response.cookies.get("sms_access_token")?.path, "/");
    assert.equal(response.cookies.get("sms_refresh_token")?.path, "/api/v1/auth");
    assert.equal("tokens" in await response.json(), false);

    const cookieHeader = `sms_access_token=${response.cookies.get("sms_access_token")!.value}`;
    const authorized = await proxy(new NextRequest("http://backend:3001/api/v1/students", {
      headers: { cookie: cookieHeader },
    }));
    assert.equal(authorized.headers.get("x-middleware-next"), "1");
    const forbidden = await proxy(new NextRequest(`http://backend:3001/api/v1/students/${IDS.student}`, {
      method: "DELETE", headers: { cookie: cookieHeader },
    }));
    assert.equal(forbidden.status, 403);

    const refreshMock = context.mock.method(AuthService, "refresh", async () => ({
      ...tokens, refreshToken: "test-refresh-after",
    }));
    const refreshed = await refreshRoute(new NextRequest("http://backend:3001/api/v1/auth/refresh", {
      method: "POST", headers: { cookie: "sms_refresh_token=test-refresh-before" },
    }));
    assert.equal(refreshed.status, 200);
    assert.equal(refreshMock.mock.calls[0].arguments[0], "test-refresh-before");
    assert.equal(refreshed.cookies.get("sms_refresh_token")?.value, "test-refresh-after");
    assert.equal(refreshed.headers.getSetCookie().length, 2);
  } finally {
    if (previousSecret === undefined) delete process.env.JWT_SECRET;
    else process.env.JWT_SECRET = previousSecret;
  }
});

test("SWE pagination names and safety limits remain compatible", () => {
  assert.deepEqual(parsePagination(new URLSearchParams("page=2&page_size=25")), {
    page: 2,
    pageSize: 25,
    skip: 25,
    take: 25,
  });
  assert.equal(parsePagination(new URLSearchParams("page_size=999")).pageSize, 100);
});

test("API responses carry a safe correlation request id", async () => {
  const supplied = await proxy(new NextRequest("http://localhost/api/v1/healthz", {
    headers: { "x-request-id": "swe-parity-123" },
  }));
  assert.equal(supplied.headers.get("x-request-id"), "swe-parity-123");

  const replaced = await proxy(new NextRequest("http://localhost/api/v1/healthz", {
    headers: { "x-request-id": "invalid request id" },
  }));
  assert.match(replaced.headers.get("x-request-id") || "", /^[0-9a-f-]{36}$/i);
});

test("grade import rejects malformed numeric data instead of silently storing null", () => {
  assert.deepEqual(parseScore10("VT"), { value: null, special: "VT" });
  assert.deepEqual(parseScore4("3.5"), { value: 3.5, special: "" });
  assert.equal(parseCredits("3"), 3);
  assert.equal(parseDecimal("8.25", 0, 10, "gpa"), 8.25);
  assert.throws(() => parseScore10("ten"), /Invalid score_10/);
  assert.throws(() => parseScore4("4.5"), /Invalid score_4/);
  assert.throws(() => parseCredits("2.5"), /Invalid credits/);
  assert.throws(() => parseDecimal("NaN", 0, 10, "gpa"), /Invalid gpa/);
});

test("grade import identity deduplicates repeated rows without merging two programs", () => {
  const grade = {
    StudentID: " SV001 ", StudyProgramID: "CTDT-A", CurriculumID: "HP001",
    StudyUnitID: "UNIT-1", ScheduleStudyUnitID: "SCHEDULE-1", Credits: "3",
  };
  const key = gradeImportRowKey("2025-2026", "hk01", grade);
  assert.equal(key, gradeImportRowKey("2025-2026", "HK01", grade));
  assert.notEqual(key, gradeImportRowKey("2025-2026", "HK01", { ...grade, StudyProgramID: "CTDT-B" }));
  assert.equal(new Set([key, key]).size, 1);
});

test("grade import rejects missing year, term and source identifiers before persistence", async () => {
  await assert.rejects(() => GradesService.importGrades([{ NamHoc: "2025", DanhSachDiem: [] }]), /Invalid year format/);
  await assert.rejects(() => GradesService.importGrades([{
    NamHoc: "2025-2026", DanhSachDiem: [{ HocKy: "HK04", DanhSachDiemHK: [] }],
  }]), /Invalid term code/);
  await assert.rejects(() => GradesService.importGrades([{
    NamHoc: "2025-2026",
    DanhSachDiem: [{ HocKy: "HK01", DanhSachDiemHK: [{ StudentID: "", StudyProgramID: "A", CurriculumID: "HP", StudyUnitID: "", Credits: "3" }] }],
  }]), /StudentID, CurriculumID, and StudyUnitID are required/);
});

test("admin and explicit grants authorize; unrelated grants do not", () => {
  const base = { sub: "u", username: "u", jti: "j", scopes: [], permissions: [] };
  assert.equal(hasPermission({ ...base, roles: ["admin"] }, "student.delete"), true);
  assert.equal(hasPermission({ ...base, roles: ["staff"], permissions: ["student.read"] }, "student.read"), true);
  assert.equal(hasPermission({ ...base, roles: ["staff"], permissions: ["student.read"] }, "student.delete"), false);
});

test("API boundary rejects malformed UUID path segments", () => {
  assert.equal(hasInvalidUuidSegment("/api/v1/training-progress/plans/not-a-uuid"), true);
  assert.equal(hasInvalidUuidSegment(`/api/v1/training-progress/plans/${IDS.plan}`), false);
  assert.equal(hasInvalidUuidSegment("/api/v1/training-progress/plans/clone-preview"), false);
  assert.equal(hasInvalidUuidSegment("/api/v1/academic-warnings/runs/bad/students"), true);
});

test("login rate limiter blocks the sixth failure and can be reset", () => {
  const key = loginAttemptKey("127.0.0.1", `test-${Date.now()}`);
  for (let index = 0; index < 5; index++) recordLoginFailure(key, 1_000);
  assert.equal(checkLoginAttempt(key, 1_001).allowed, false);
  clearLoginFailures(key);
  assert.equal(checkLoginAttempt(key, 1_001).allowed, true);
});

test("progress evaluation detects missing, outside-plan, and elective-credit gaps", () => {
  const result = evaluateProgress(
    [
      { courseId: IDS.courseA, courseCode: "A", courseName: "A", credits: 3, requirementType: "mandatory", choiceGroupCode: null, isRegistrationRequired: true },
      { courseId: IDS.courseB, courseCode: "B", courseName: "B", credits: 2, requirementType: "elective", choiceGroupCode: null, isRegistrationRequired: false },
    ],
    [{ courseId: IDS.courseB, courseCode: "B", courseName: "B", credits: 2 }],
    false,
  );
  applyElectiveThreshold(result, 3);
  assert.equal(result.status, "fail");
  assert.equal(result.missingMandatoryCourses, 1);
  assert.equal(result.missingCredits, 1);
});

test("progress evaluation handles repeated registrations, outside credits and elective alternatives", () => {
  const outside = { courseId: IDS.courseB, courseCode: "OUT", courseName: "Ngoài CTĐT", credits: 3 };
  const result = evaluateProgress([
    { courseId: IDS.courseA, courseCode: "A1", courseName: "Tự chọn 1", credits: 2, requirementType: "elective", choiceGroupCode: "ALT", isRegistrationRequired: false },
    { courseId: IDS.plan, courseCode: "A2", courseName: "Tự chọn 2", credits: 2, requirementType: "elective", choiceGroupCode: "ALT", isRegistrationRequired: false },
  ], [
    { courseId: IDS.courseA, courseCode: "A1", courseName: "Tự chọn 1", credits: 2 },
    outside,
    outside,
  ], false);
  assert.equal(result.status, "pass");
  assert.equal(result.choiceGroupResults[0].status, "pass");
  assert.equal(result.outsidePlanCourses, 1);
  assert.equal(result.outsidePlanCredits, 3);
});

test("completion distinguishes pending results from forecast assumptions", () => {
  const plan = {
    id: IDS.plan,
    version: 1,
    academicTermId: IDS.term,
    academicYearCode: "2026-2027",
    termOrder: 1,
    termCode: "HK01",
    curriculumSemesterNo: 1,
    requiredElective: 0,
    status: "locked",
    isCurrent: true,
    isProgramFinal: false,
    courses: [
      { courseId: IDS.courseA, courseCode: "A", courseName: "A", credits: 3, requirementType: "mandatory", choiceGroupCode: null, isRegistrationRequired: true },
    ],
  };
  const standard = evaluateCompletionPlan(plan, new Map(), true, new Set([IDS.courseA]), true, false);
  assert.equal(standard.isPass, false);
  assert.equal(standard.pendingOnly, true);
  assert.equal(standard.pendingResultCourses, 1);
  const forecast = evaluateCompletionPlan(plan, new Map(), true, new Set([IDS.courseA]), true, true);
  assert.equal(forecast.isPass, true);
  assert.equal(forecast.courses[0].pendingResult, true);
});

test("warning evaluation promotes high-severity cumulative GPA and decision reasons", () => {
  const student = {
    id: IDS.student,
    classId: null,
    cohortId: null,
    code: "SV001",
    name: "Sinh viên",
    classCode: "",
    className: "",
    programCode: "CNTT",
  };
  const summaries = new Map([[IDS.student, {
    termSummaryId: IDS.term,
    cumulativeSummaryId: IDS.courseA,
    registered: 12,
    termGPA4: 1.9,
    termGPA10: 4.8,
    cumulativeGPA4: 1.8,
    cumulativeGPA10: 4.5,
  }]]);
  const decisions = new Map([[IDS.student, [{
    id: IDS.plan,
    number: "QD-01",
    name: "Cảnh báo",
    fullText: "",
    signDate: null,
  }]]]);
  const result = evaluate(student, new Map(), new Map(), summaries, decisions, {
    termGpaThreshold: 2,
    cumulativeGpaThreshold: 2,
  });
  assert.equal(result.maxSeverity, "high");
  assert.deepEqual(result.reasons.map((reason) => reason.reasonCode), [
    "LOW_TERM_GPA",
    "LOW_CUMULATIVE_GPA",
    "ACADEMIC_WARNING_DECISION",
  ]);
  assert.equal(result.reasons[0].sourceId, IDS.term);
  assert.equal(result.reasons[1].sourceId, IDS.courseA);
  assert.equal(result.reasons[1].sourceType, "student_cumulative_summary");
});

test("warning thresholds are exclusive and missing GPA is never treated as safe evidence", () => {
  const student = {
    id: IDS.student, classId: null, cohortId: null, code: "SV001", name: "Sinh viên",
    classCode: "", className: "", programCode: "CNTT",
  };
  const exactBoundary = new Map([[IDS.student, {
    termSummaryId: IDS.term,
    cumulativeSummaryId: IDS.courseA,
    registered: 12,
    termGPA4: 2,
    termGPA10: null,
    cumulativeGPA4: 2,
    cumulativeGPA10: null,
  }]]);
  const boundary = evaluate(student, new Map(), new Map(), exactBoundary, new Map(), {
    termGpaThreshold: 2, cumulativeGpaThreshold: 2,
  });
  assert.equal(boundary.reasonCount, 0);
  assert.equal(boundary.dataError, null);

  const missing = evaluate(student, new Map(), new Map(), new Map(), new Map(), {
    termGpaThreshold: 2, cumulativeGpaThreshold: 2,
  });
  assert.equal(missing.reasonCount, 0);
  assert.equal(missing.maxSeverity, "none");
  assert.equal(missing.dataError, "missing student term summary");
});

test("conduct scores use S5 classification boundaries and explicit approval mapping", () => {
  assert.equal(classifyConductScore(100), "Xuất sắc");
  assert.equal(classifyConductScore(90), "Xuất sắc");
  assert.equal(classifyConductScore(89), "Tốt");
  assert.equal(classifyConductScore(80), "Tốt");
  assert.equal(classifyConductScore(65), "Khá");
  assert.equal(classifyConductScore(50), "Trung bình");
  assert.equal(classifyConductScore(35), "Yếu");
  assert.equal(classifyConductScore(34), "Kém");
  assert.equal(conductApproval("1", 49).code, "approved");
  assert.equal(conductApproval("0", null).code, "pending");
  assert.equal(isSummerConductTerm("HK03"), false);
  assert.equal(isSummerConductTerm("HK02", true), true);
  assert.equal(isSummerConductTerm("HK02"), false);
});

test("summer identity comes from an explicit flag or configured import convention, not HK03 itself", () => {
  assert.equal(isConfiguredSummerTermCode("HK03", ""), false);
  assert.equal(isConfiguredSummerTermCode("PHU", "HK03, PHU"), true);
  assert.equal(isConfiguredSummerTermCode("HK03", "HK03, PHU"), true);
});

test("warning evaluation adds LOW_CONDUCT_SCORE only for approved recognized scores", () => {
  const student = {
    id: IDS.student, classId: null, cohortId: null, code: "SV001", name: "Sinh viên",
    classCode: "", className: "", programCode: "CNTT",
  };
  const approved = new Map([[IDS.student, { id: IDS.plan, score: 49, statusId: "1" }]]);
  const result = evaluate(student, new Map(), new Map(), new Map(), new Map(), {
    termGpaThreshold: 2,
    cumulativeGpaThreshold: 2,
    conductScoreThreshold: 50,
  }, approved);
  assert.equal(result.reasons[0].reasonCode, "LOW_CONDUCT_SCORE");
  assert.equal(result.reasons[0].sourceType, "student_conduct_record");
  assert.equal(result.reasons[0].sourceId, IDS.plan);

  approved.set(IDS.student, { id: IDS.plan, score: 49, statusId: "0" });
  assert.equal(evaluate(student, new Map(), new Map(), new Map(), new Map(), {
    termGpaThreshold: 2, cumulativeGpaThreshold: 2, conductScoreThreshold: 50,
  }, approved).reasonCount, 0);
});

test("warning action state machine accepts workflow paths and rejects invalid jumps", () => {
  assert.equal(parseWarningActionStatus("OPEN"), "OPEN");
  assert.doesNotThrow(() => assertWarningActionTransition("OPEN", "IN_PROGRESS"));
  assert.doesNotThrow(() => assertWarningActionTransition("IN_PROGRESS", "ESCALATED"));
  assert.doesNotThrow(() => assertWarningActionTransition("ESCALATED", "RESOLVED"));
  assert.doesNotThrow(() => assertWarningActionTransition("RESOLVED", "REOPENED"));
  assert.throws(
    () => assertWarningActionTransition("OPEN", "RESOLVED"),
    (error: unknown) => error instanceof ApiError && error.code === "INVALID_STATUS_TRANSITION" && error.status === 409,
  );
  assert.throws(() => parseWarningActionStatus("CLOSED"), /status must be one of/);
});

test("warning trend separates conclusively evaluated and partially available data", () => {
  const trend = summarizeWarningTrend([
    { studentId: "a", academicTermId: "t2", gpa4: null, cumulativeGpa4: 1.2 },
    { studentId: "b", academicTermId: "t1", gpa4: 1.7, cumulativeGpa4: 2.5 },
    { studentId: "c", academicTermId: "t1", gpa4: 3.2, cumulativeGpa4: 3.1 },
  ], 2, 2);

  assert.deepEqual(trend, {
    high: 1,
    medium: 1,
    evaluated: 3,
    available: 3,
    termGpaAvailable: 2,
    cumulativeGpaAvailable: 3,
  });
});

test("reporting period selects the latest term with representative GPA coverage", () => {
  const selected = selectLatestReportingPeriod([
    { label: "HK02", termGpaAvailable: 577, isSummer: false },
    { label: "HK03", termGpaAvailable: 620, isSummer: true },
    { label: "HK01 current", termGpaAvailable: 0 },
  ], 625);

  assert.equal(selected?.label, "HK02");
});

test("academic term links use configured chronology instead of term codes", () => {
  const terms = [
    { id: "main-a", academicYearId: "y1", academicYearCode: "2025-2026", termOrder: 1, isSummer: false, startDate: "2025-09-01" },
    { id: "main-b", academicYearId: "y1", academicYearCode: "2025-2026", termOrder: 2, isSummer: false, startDate: "2026-01-15" },
    { id: "summer-custom", academicYearId: "y1", academicYearCode: "2025-2026", termOrder: 9, isSummer: true, startDate: "2026-06-01" },
    { id: "main-c", academicYearId: "y2", academicYearCode: "2026-2027", termOrder: 1, isSummer: false, startDate: "2026-09-01" },
  ];
  const links = buildAcademicTermLinks(terms);
  assert.deepEqual(links.get("summer-custom"), { previousMainTermId: "main-b", nextMainTermId: "main-c" });
  assert.equal(latestMainTerm(terms)?.id, "main-c");
});

test("summer monitoring never applies minimum-credit or GPA warning rules", () => {
  const student = {
    id: IDS.student, classId: null, cohortId: null, code: "SV001", name: "Sinh viên",
    classCode: "", className: "", programCode: "CNTT",
  };
  const result = evaluateSummerMonitoring(
    student,
    new Map([[IDS.student, {
      termSummaryId: IDS.term,
      cumulativeSummaryId: null,
      registered: 2,
      termGPA4: 0.5,
      termGPA10: 1,
      cumulativeGPA4: 1.5,
      cumulativeGPA10: 4,
    }]]),
    new Map([[IDS.student, { offeringCount: 1, registeredCredits: 2, pendingResults: 0, failedCourses: 1 }]]),
  );
  assert.equal(result.registrationStatus, "participating");
  assert.deepEqual(result.reasons.map((reason) => reason.reasonCode), ["SUMMER_COURSE_NOT_PASSED"]);
  assert.equal(result.maxSeverity, "medium");
});

test("warning trend uses only data from each exact term and omits empty future terms", () => {
  const trend = buildWarningTrend([
    { id: "t1", academicYear: "2025-2026", termCode: "HK01", termOrder: 1, label: "HK01 (2025-2026)" },
    { id: "t2", academicYear: "2025-2026", termCode: "HK02", termOrder: 2, label: "HK02 (2025-2026)" },
    { id: "t3", academicYear: "2025-2026", termCode: "HK03", termOrder: 3, label: "HK03 (2025-2026)" },
  ], [
    { studentId: "a", academicTermId: "t1", gpa4: 1.8, cumulativeGpa4: 1.9 },
    { studentId: "b", academicTermId: "t1", gpa4: 1.7, cumulativeGpa4: 2.5 },
    { studentId: "a", academicTermId: "t2", gpa4: null, cumulativeGpa4: 1.8 },
  ], [], 2, 2);

  assert.deepEqual(trend.map(({ label, high, medium, evaluated }) => ({ label, high, medium, evaluated })), [
    { label: "HK01 (2025-2026)", high: 1, medium: 1, evaluated: 2 },
    { label: "HK02 (2025-2026)", high: 1, medium: 0, evaluated: 1 },
  ]);
});
