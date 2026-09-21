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
import { isApplicableGraduationRule, isExcludedFromGraduationCredits, resolveGraduationStatus } from "../lib/services/graduation-evaluations";
import { buildGraduationForecast, normalizeCourseCode } from "../lib/services/graduation-forecast";
import { evaluateStudentTrainingProgress } from "../lib/services/student-training-progress";

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
  assert.equal(requiredPermission("/api/v1/training-progress/runs", "GET"), "progress.read");
  assert.equal(requiredPermission("/api/v1/rbac/roles/x/permissions", "PUT"), "role.manage");
  assert.equal(requiredPermission("/api/v1/rbac/advisor-assignments", "POST"), "advisor_assignment.manage");
  assert.equal(requiredPermission("/api/v1/training-progress/completion-runs/preview", "POST"), "progress.calculate");
  assert.equal(requiredPermission("/api/v1/academic-warnings/actions", "POST"), "academic_warning.action.create");
  assert.equal(requiredPermission(`/api/v1/academic-warnings/actions/${IDS.plan}`, "PATCH"), "academic_warning.action.update");
  assert.equal(requiredPermission("/api/v1/reports/export", "GET"), "report.export");
  assert.equal(requiredPermission("/api/v1/graduation-evaluations", "GET"), "graduation.read");
  assert.equal(requiredPermission("/api/v1/graduation-evaluations", "POST"), "graduation.evaluate");
  assert.equal(requiredPermission(`/api/v1/graduation-evaluations/${IDS.plan}/export`, "GET"), "graduation.export");
});

test("graduation status uses the documented conservative priority", () => {
  assert.equal(resolveGraduationStatus([
    { ruleCode: "PROGRAM_COMPLETION", result: "PASS" },
    { ruleCode: "LEGAL", result: "NOT_AVAILABLE" },
    { ruleCode: "CUMULATIVE_GPA", result: "FAIL" },
  ]), "NOT_ELIGIBLE");
  assert.equal(resolveGraduationStatus([
    { ruleCode: "PROGRAM_COMPLETION", result: "PASS" },
    { ruleCode: "CUMULATIVE_GPA", result: "FAIL" },
  ]), "NOT_ELIGIBLE");
  assert.equal(resolveGraduationStatus([
    { ruleCode: "PROGRAM_COMPLETION", result: "PENDING" },
    { ruleCode: "CUMULATIVE_GPA", result: "PASS" },
  ]), "PENDING_GRADE");
  assert.equal(resolveGraduationStatus([
    { ruleCode: "PROGRAM_COMPLETION", result: "PASS" },
    { ruleCode: "CUMULATIVE_GPA", result: "PENDING" },
  ]), "PENDING_GRADE");
  assert.equal(resolveGraduationStatus([
    { ruleCode: "PROGRAM_COMPLETION", result: "PASS" },
    { ruleCode: "TOTAL_CREDITS", result: "PENDING" },
    { ruleCode: "CUMULATIVE_GPA", result: "PASS" },
  ]), "PENDING_GRADE");
  assert.equal(resolveGraduationStatus([
    { ruleCode: "PROGRAM_COMPLETION", result: "PASS" },
    { ruleCode: "20CT4202", result: "PENDING" },
    { ruleCode: "CUMULATIVE_GPA", result: "PASS" },
  ]), "PENDING_REQUIREMENT");
  assert.equal(resolveGraduationStatus([
    { ruleCode: "PROGRAM_COMPLETION", result: "PASS" },
    { ruleCode: "FOREIGN_LANGUAGE", result: "PENDING" },
  ]), "PENDING_REQUIREMENT");
  assert.equal(resolveGraduationStatus([
    { ruleCode: "PROGRAM_COMPLETION", result: "PASS" },
    { ruleCode: "PHYSICAL_EDUCATION", result: "PENDING" },
  ]), "PENDING_REQUIREMENT");
  assert.equal(resolveGraduationStatus([
    { ruleCode: "PROGRAM_COMPLETION", result: "PASS" },
    { ruleCode: "DISCIPLINE", result: "FAIL" },
  ]), "NOT_ELIGIBLE");
  assert.equal(resolveGraduationStatus([
    { ruleCode: "PROGRAM_COMPLETION", result: "PASS" },
    { ruleCode: "CUMULATIVE_GPA", result: "PASS" },
    { ruleCode: "TOTAL_CREDITS", result: "PASS" },
    { ruleCode: "PHYSICAL_EDUCATION", result: "PASS" },
    { ruleCode: "NATIONAL_DEFENSE", result: "PASS" },
    { ruleCode: "FOREIGN_LANGUAGE", result: "PASS" },
    { ruleCode: "DISCIPLINE", result: "PASS" },
    { ruleCode: "LEGAL", result: "PASS" },
  ]), "EXPECTED_ELIGIBLE");
});

test("K44 global credit thresholds do not apply to a different program", () => {
  const scope = { trainingProgramId: "cq25-id", cohortId: "k49-id" };
  assert.equal(isApplicableGraduationRule({ ruleCode: "TOTAL_CREDITS", trainingProgramId: null, cohortId: null }, scope), false);
  assert.equal(isApplicableGraduationRule({ ruleCode: "ELECTIVE_CREDITS", trainingProgramId: "cq22-id", cohortId: null }, scope), false);
  assert.equal(isApplicableGraduationRule({ ruleCode: "TOTAL_CREDITS", trainingProgramId: "cq25-id", cohortId: null }, scope), true);
});

test("graduation credit calculation excludes physical education and national defense", () => {
  assert.equal(isExcludedFromGraduationCredits("TC1001", "Giáo dục thể chất 1"), true);
  assert.equal(isExcludedFromGraduationCredits("QP1001", "Giáo dục quốc phòng"), true);
  assert.equal(isExcludedFromGraduationCredits("20CT4201", "Thực tập nghề nghiệp"), false);
  assert.equal(isExcludedFromGraduationCredits("20CT4202", "Đồ án tốt nghiệp"), false);
});

test("graduation forecast handles missing, pass, fail, no score, repeats and duplicate curriculum rows", () => {
  const courses = [
    { courseId: "a", courseCode: "A", courseName: "Môn A", credits: 3, requirementType: "mandatory", semesterNo: 1 },
    { courseId: "b", courseCode: "B", courseName: "Môn B", credits: 4, requirementType: "mandatory", semesterNo: 2 },
    { courseId: "c", courseCode: "C", courseName: "Môn C", credits: 2, requirementType: "mandatory", semesterNo: 3 },
    { courseId: "d", courseCode: "D", courseName: "Môn D", credits: 1, requirementType: "mandatory", semesterNo: 4 },
  ];
  const forecast = buildGraduationForecast({
    courses: [...courses, { ...courses[0] }],
    grades: [
      { courseCode: "B", isPassed: false, scoreStatus: "graded", score10: 3 },
      { courseCode: "B", isPassed: true, scoreStatus: "graded", score10: 6 },
      { courseCode: "B", isPassed: true, scoreStatus: "graded", score10: 6 },
      { courseCode: "C", isPassed: false, scoreStatus: "graded", letterGrade: "F" },
      { courseCode: "D", isPassed: false, scoreStatus: "pending", notScore: true },
      { courseCode: "X", courseName: "Ngoài CTĐT", isPassed: true, scoreStatus: "graded" },
    ],
    requiredElectiveCredits: 0,
    requiredTotalCredits: 10,
  });
  assert.equal(forecast.summary.requiredCredits, 10);
  assert.equal(forecast.summary.completedCredits, 4);
  assert.deepEqual(forecast.missingRequiredCourses.map((course) => course.courseCode), ["A", "C", "D"]);
  assert.deepEqual(forecast.failedCourses.map((course) => course.courseCode), ["C"]);
  assert.deepEqual(forecast.noScoreCourses.map((course) => course.courseCode), ["D"]);
  assert.equal(forecast.unmatchedGrades.length, 1);
});

test("graduation forecast caps elective credits and uses configured minimum", () => {
  const courses = ["E1", "E2", "E3", "E4"].map((code) => ({ courseId: code, courseCode: code, courseName: code, credits: 3, requirementType: "elective", semesterNo: 2 }));
  const grades = ["E1", "E2", "E3"].map((courseCode) => ({ courseCode, isPassed: true, scoreStatus: "graded" }));
  const complete = buildGraduationForecast({ courses, grades, requiredElectiveCredits: 6 });
  assert.equal(complete.requirements.electives.completedCredits, 6);
  assert.equal(complete.requirements.electives.remainingCredits, 0);
  assert.equal(complete.requirements.electives.excessCredits, 3);
  assert.equal(complete.electiveOptions.length, 0);
  const short = buildGraduationForecast({ courses, grades: grades.slice(0, 1), requiredElectiveCredits: 6 });
  assert.equal(short.requirements.electives.remainingCredits, 3);
  assert.equal(short.electiveOptions.length, 3);
  const unspecified = buildGraduationForecast({ courses, grades });
  assert.equal(unspecified.summary.remainingCredits, null);
});

test("course matching uses exact normalized code, then unique normalized name without guessing suffixes", () => {
  const courses = [{ courseId: "one", courseCode: "20CT4105D", courseName: "Cơ sở dữ liệu", credits: 3, requirementType: "mandatory", semesterNo: 5 }];
  assert.notEqual(normalizeCourseCode("20CT4105D"), normalizeCourseCode("20CT4105"));
  const forecast = buildGraduationForecast({
    courses,
    grades: [{ courseCode: "20CT4105", courseName: "  CƠ SỞ   DỮ LIỆU ", isPassed: true, scoreStatus: "graded" }],
    schedule: [{ courseCode: "20CT4105", courseName: "Cơ sở dữ liệu", academicYear: "2026-2027", termCode: "HK2", semesterNo: 5 }],
    requiredElectiveCredits: 0,
    requiredTotalCredits: 3,
  });
  assert.equal(forecast.summary.completedCredits, 3);
  assert.equal(forecast.unmatchedGrades.length, 0);
});

test("different curriculum codes with the same name are not silently treated as equivalent", () => {
  const forecast = buildGraduationForecast({
    courses: [
      { courseId: "old", courseCode: "OLD", courseName: "Toán rời rạc", credits: 3, requirementType: "mandatory", semesterNo: 1 },
      { courseId: "new", courseCode: "NEW", courseName: "Toán rời rạc", credits: 3, requirementType: "mandatory", semesterNo: 1 },
    ],
    grades: [{ courseCode: "NEW", courseName: "Toán rời rạc", isPassed: true, scoreStatus: "graded" }],
    requiredElectiveCredits: 0,
    requiredTotalCredits: 6,
  });
  assert.equal(forecast.summary.requiredCredits, 6);
  assert.equal(forecast.summary.completedCredits, 3);
  assert.equal(forecast.warnings.length, 1);
});

test("graduation forecast groups only configured elective minima and schedules missing final courses", () => {
  const forecast = buildGraduationForecast({
    courses: [
      { courseId: "final", courseCode: "F", courseName: "Final", credits: 4, requirementType: "mandatory", semesterNo: 8 },
      { courseId: "e1", courseCode: "E1", courseName: "Elective 1", credits: 3, requirementType: "elective", semesterNo: 8 },
      { courseId: "e2", courseCode: "E2", courseName: "Elective 2", credits: 3, requirementType: "elective", semesterNo: 8 },
    ],
    grades: [{ courseCode: "E1", isPassed: true, scoreStatus: "graded" }],
    requiredElectiveCredits: 6,
    schedule: [
      { courseId: "final", academicYear: "2027-2028", termCode: "HK2", semesterNo: 8, isProgramFinal: true },
      { courseId: "e1", academicYear: "2027-2028", termCode: "HK2", semesterNo: 8, choiceGroupCode: "SPECIALIZED:6" },
      { courseId: "e2", academicYear: "2027-2028", termCode: "HK2", semesterNo: 8, choiceGroupCode: "SPECIALIZED:6" },
    ],
  });
  assert.equal(forecast.electiveGroups[0].remainingCredits, 3);
  assert.deepEqual(forecast.graduationRequirements.map((course) => course.courseCode), ["F"]);
  assert.deepEqual(forecast.remainingBySemester[0].courses.map((course) => course.courseCode), ["F"]);
});

test("elective credits from an overfilled group cannot cover another group's shortfall", () => {
  const courses = ["A1", "B1", "B2", "B3"].map((code) => ({ courseId: code, courseCode: code, courseName: code, credits: 3, requirementType: "elective", semesterNo: 4 }));
  const schedule = courses.map((course) => ({ courseId: course.courseId, academicYear: "2026-2027", termCode: "HK1", semesterNo: 4,
    choiceGroupCode: course.courseCode.startsWith("A") ? "A:6" : "B:6" }));
  const forecast = buildGraduationForecast({ courses, schedule, requiredElectiveCredits: 12,
    grades: ["A1", "B1", "B2", "B3"].map((courseCode) => ({ courseCode, isPassed: true, scoreStatus: "graded" })) });
  assert.equal(forecast.requirements.electives.passedCredits, 12);
  assert.equal(forecast.requirements.electives.completedCredits, 9);
  assert.equal(forecast.requirements.electives.remainingCredits, 3);
});

test("incomplete curriculum coverage does not publish a precise remaining total", () => {
  const forecast = buildGraduationForecast({
    courses: [{ courseId: "m", courseCode: "M", courseName: "Mandatory", credits: 3, requirementType: "mandatory", semesterNo: 1 }],
    grades: [{ courseCode: "M", isPassed: true, scoreStatus: "graded" }],
    requiredElectiveCredits: 6,
    requiredTotalCredits: 9,
  });
  assert.equal(forecast.summary.requiredCredits, 9);
  assert.equal(forecast.summary.remainingCredits, null);
  assert.ok(forecast.warnings.some((warning) => warning.includes("không đủ")));
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
  assert.equal(result.registeredElectiveCredits, 2);
  assert.equal(result.outsidePlanCourses, 1);
  assert.equal(result.outsidePlanCredits, 3);
});

test("progress elective groups allow multiple valid selections and count their credits once", () => {
  const courses = [
    { courseId: IDS.courseA, courseCode: "A1", courseName: "Tự chọn 1", credits: 2, requirementType: "elective", choiceGroupCode: "SPECIALIZED", isRegistrationRequired: false },
    { courseId: IDS.courseB, courseCode: "A2", courseName: "Tự chọn 2", credits: 3, requirementType: "elective", choiceGroupCode: "SPECIALIZED", isRegistrationRequired: false },
  ];
  const registration = evaluateProgress(courses, [
    { courseId: IDS.courseA, courseCode: "A1", courseName: "Tự chọn 1", credits: 2 },
    { courseId: IDS.courseB, courseCode: "A2", courseName: "Tự chọn 2", credits: 3 },
  ], false);
  applyElectiveThreshold(registration, 5);
  assert.equal(registration.status, "pass");
  assert.equal(registration.registeredElectiveCredits, 5);
  assert.equal(registration.choiceGroupResults[0].registeredCourses, 2);

  const evidence = new Map(courses.map((course) => [course.courseId, {
    offeringId: course.courseId,
    studentId: IDS.student,
    courseId: course.courseId,
    academicYear: "2026-2027",
    termCode: "HK01",
    termOrder: 1,
    scoreStatus: "graded",
  }]));
  const completion = evaluateCompletionPlan({
    id: IDS.plan,
    version: 1,
    academicTermId: IDS.term,
    academicYearCode: "2026-2027",
    termOrder: 1,
    termCode: "HK01",
    curriculumSemesterNo: 1,
    requiredElective: 5,
    status: "locked",
    isCurrent: true,
    isProgramFinal: false,
    courses,
  }, evidence, true);
  assert.equal(completion.isPass, true);
  assert.equal(completion.passedElectiveCredits, 5);
});

test("separate elective minima still require physical education when overall credits are met", () => {
  const courses = [
    { courseId: IDS.courseA, courseCode: "GDTC", courseName: "Thể chất", credits: 1, requirementType: "elective", choiceGroupCode: "GDTC3:1", isRegistrationRequired: false },
    { courseId: IDS.courseB, courseCode: "A", courseName: "Tự chọn A", credits: 3, requirementType: "elective", choiceGroupCode: "DAI_CUONG:6", isRegistrationRequired: false },
    { courseId: IDS.plan, courseCode: "B", courseName: "Tự chọn B", credits: 3, requirementType: "elective", choiceGroupCode: "DAI_CUONG:6", isRegistrationRequired: false },
  ];
  const registrations = courses.slice(1).map((course) => ({ courseId: course.courseId, courseCode: course.courseCode, courseName: course.courseName, credits: course.credits }));
  const registration = evaluateProgress(courses, registrations, false);
  applyElectiveThreshold(registration, 6);
  assert.equal(registration.status, "fail");
  assert.equal(registration.choiceGroupResults.find((group) => group.code === "GDTC3:1")?.status, "missing");

  const evidence = new Map(courses.slice(1).map((course) => [course.courseId, {
    offeringId: course.courseId, studentId: IDS.student, courseId: course.courseId,
    academicYear: "2026-2027", termCode: "HK01", termOrder: 1, scoreStatus: "graded",
  }]));
  const completion = evaluateCompletionPlan({
    id: IDS.plan, version: 1, academicTermId: IDS.term, academicYearCode: "2026-2027",
    termOrder: 1, termCode: "HK01", curriculumSemesterNo: 3, requiredElective: 6,
    status: "locked", isCurrent: true, isProgramFinal: false, courses,
  }, evidence, true);
  assert.equal(completion.isPass, false);
  assert.equal(completion.choiceGroups.find((group) => group.code === "GDTC3:1")?.status, "missing");
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

test("curriculum import deduplicates redundant courses by prioritizing real student grades and semesters", () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { deduplicateCurricula } = require("../scripts/import-apidog-data.cjs");
  const curricula = [
    { MaCTDT: "CQ22CT-PM", MaHP: "20TN1202", TenHP: "Toán rời rạc", STC: 4, HocKy: "Học kỳ 1", BatBuoc: "Bắt Buộc" },
    { MaCTDT: "CQ22CT-PM", MaHP: "TN1008D", TenHP: "Toán rời rạc", STC: 4, HocKy: "Học kỳ 1", BatBuoc: "Bắt Buộc" },
    { MaCTDT: "CQ22CT-PM", MaHP: "20CT3102D", TenHP: "Phát triển ứng dụng di động", STC: 3, HocKy: "Học kỳ 1", BatBuoc: "Bắt Buộc" },
    { MaCTDT: "CQ22CT-PM", MaHP: "20CT3132D", TenHP: "Phát triển ứng dụng di động", STC: 3, HocKy: "Học kỳ 6", BatBuoc: "Bắt Buộc" },
  ];
  const gradeRows = [
    { grade: { CurriculumID: "20TN1202" } },
    { grade: { CurriculumID: "20TN1202" } },
    { grade: { CurriculumID: "20CT3132D" } },
  ];

  const result = deduplicateCurricula(curricula, gradeRows);
  assert.equal(result.length, 2);
  const math = result.find((c: Record<string, unknown>) => c.TenHP === "Toán rời rạc");
  assert.equal(math.MaHP, "20TN1202");
  const mobile = result.find((c: Record<string, unknown>) => c.TenHP === "Phát triển ứng dụng di động");
  assert.equal(mobile.MaHP, "20CT3132D");
  assert.equal(mobile.HocKy, "Học kỳ 6");
});

// ============================================================================
// STUDENT TRAINING PROGRESS SPEC TESTS: TC01 - TC15
// ============================================================================

const defaultTimeline = {
  currentAcademicYear: "2026-2027",
  currentTermCode: "HK01",
  expectedYear: 2,
  expectedSemester: "HK1",
  expectedSemesterNo: 3,
};

const defaultStudent = {
  id: IDS.student,
  studentCode: "2549A067",
  fullName: "Trịnh Minh Bảo",
  classCode: "ITK49A",
  className: "ITK49A",
  cohortCode: "K49",
  programCode: "CQ25CT",
};

test("Training Progress TC01: Môn bắt buộc PASS -> cộng tín chỉ -> PASSED", () => {
  const result = evaluateStudentTrainingProgress({
    student: defaultStudent,
    curriculum: [
      { courseId: "c1", courseCode: "20CT1101", courseName: "Nhập môn CNTT", credits: 3, requirementType: "mandatory", semesterNo: 1 },
    ],
    grades: [
      { courseCode: "20CT1101", courseName: "Nhập môn CNTT", credits: 3, isPass: true, notScore: false, scoreStatus: "graded", score10: 7.0 },
    ],
    timeline: defaultTimeline,
  });
  assert.equal(result.courseStatus.passed.length, 1);
  assert.equal(result.courseStatus.passed[0].status, "PASSED");
  assert.equal(result.summary.completedCredits, 3);
});

test("Training Progress TC02: Môn bắt buộc FAIL -> không cộng tín chỉ -> FAILED", () => {
  const result = evaluateStudentTrainingProgress({
    student: defaultStudent,
    curriculum: [
      { courseId: "c1", courseCode: "20CT1101", courseName: "Nhập môn CNTT", credits: 3, requirementType: "mandatory", semesterNo: 1 },
    ],
    grades: [
      { courseCode: "20CT1101", courseName: "Nhập môn CNTT", credits: 3, isPass: false, notScore: false, scoreStatus: "graded", score10: 2.0 },
    ],
    timeline: defaultTimeline,
  });
  assert.equal(result.courseStatus.failed.length, 1);
  assert.equal(result.courseStatus.failed[0].status, "FAILED");
  assert.equal(result.summary.completedCredits, 0);
});

test("Training Progress TC03: Có record nhưng chưa có điểm -> NO_SCORE -> không mặc định đang học", () => {
  const result = evaluateStudentTrainingProgress({
    student: defaultStudent,
    curriculum: [
      { courseId: "c1", courseCode: "20CT1101", courseName: "Nhập môn CNTT", credits: 3, requirementType: "mandatory", semesterNo: 1 },
    ],
    grades: [
      { courseCode: "20CT1101", courseName: "Nhập môn CNTT", credits: 3, isPass: false, notScore: true, scoreStatus: "pending" },
    ],
    timeline: defaultTimeline,
  });
  assert.equal(result.courseStatus.noScore.length, 1);
  assert.equal(result.courseStatus.noScore[0].status, "NO_SCORE");
  assert.equal(result.summary.completedCredits, 0);
});

test("Training Progress TC04: Không có record -> NOT_COMPLETED", () => {
  const result = evaluateStudentTrainingProgress({
    student: defaultStudent,
    curriculum: [
      { courseId: "c1", courseCode: "20CT1101", courseName: "Nhập môn CNTT", credits: 3, requirementType: "mandatory", semesterNo: 1 },
    ],
    grades: [],
    timeline: defaultTimeline,
  });
  assert.equal(result.courseStatus.notCompleted.length, 1);
  assert.equal(result.courseStatus.notCompleted[0].status, "NOT_COMPLETED");
  assert.equal(result.summary.completedCredits, 0);
});

test("Training Progress TC05: Học lại một môn 2 lần, lần sau PASS -> course completed -> tín chỉ chỉ cộng 1 lần", () => {
  const result = evaluateStudentTrainingProgress({
    student: defaultStudent,
    curriculum: [
      { courseId: "c1", courseCode: "20CT1101", courseName: "Nhập môn CNTT", credits: 3, requirementType: "mandatory", semesterNo: 1 },
    ],
    grades: [
      { courseCode: "20CT1101", courseName: "Nhập môn CNTT", credits: 3, isPass: false, notScore: false, scoreStatus: "graded", score10: 3.0 },
      { courseCode: "20CT1101", courseName: "Nhập môn CNTT", credits: 3, isPass: true, notScore: false, scoreStatus: "graded", score10: 6.5 },
    ],
    timeline: defaultTimeline,
  });
  assert.equal(result.courseStatus.passed.length, 1);
  assert.equal(result.summary.completedCredits, 3);
  assert.equal(result.courseStatus.passed[0].attemptCount, 2);
});

test("Training Progress TC06: Nhóm tự chọn cần 6 TC, SV đạt 9 TC -> credited = 6, extra = 3, remaining = 0", () => {
  const result = evaluateStudentTrainingProgress({
    student: defaultStudent,
    curriculum: [
      { courseId: "e1", courseCode: "E1", courseName: "Tự chọn 1", credits: 3, requirementType: "elective", choiceGroupCode: "GROUP_A:6", semesterNo: 2 },
      { courseId: "e2", courseCode: "E2", courseName: "Tự chọn 2", credits: 3, requirementType: "elective", choiceGroupCode: "GROUP_A:6", semesterNo: 2 },
      { courseId: "e3", courseCode: "E3", courseName: "Tự chọn 3", credits: 3, requirementType: "elective", choiceGroupCode: "GROUP_A:6", semesterNo: 2 },
    ],
    grades: [
      { courseCode: "E1", courseName: "Tự chọn 1", isPass: true, notScore: false, scoreStatus: "graded" },
      { courseCode: "E2", courseName: "Tự chọn 2", isPass: true, notScore: false, scoreStatus: "graded" },
      { courseCode: "E3", courseName: "Tự chọn 3", isPass: true, notScore: false, scoreStatus: "graded" },
    ],
    timeline: defaultTimeline,
  });
  const group = result.electiveGroups.find((g) => g.code === "GROUP_A:6");
  assert.ok(group);
  assert.equal(group.passedCredits, 9);
  assert.equal(group.creditedCredits, 6);
  assert.equal(group.extraCredits, 3);
  assert.equal(group.remainingCredits, 0);
  assert.equal(group.status, "PASS");
});

test("Training Progress TC07: Nhóm tự chọn cần 6 TC, SV đạt 3 TC -> remaining = 3", () => {
  const result = evaluateStudentTrainingProgress({
    student: defaultStudent,
    curriculum: [
      { courseId: "e1", courseCode: "E1", courseName: "Tự chọn 1", credits: 3, requirementType: "elective", choiceGroupCode: "GROUP_A:6", semesterNo: 2 },
      { courseId: "e2", courseCode: "E2", courseName: "Tự chọn 2", credits: 3, requirementType: "elective", choiceGroupCode: "GROUP_A:6", semesterNo: 2 },
    ],
    grades: [
      { courseCode: "E1", courseName: "Tự chọn 1", isPass: true, notScore: false, scoreStatus: "graded" },
    ],
    timeline: defaultTimeline,
  });
  const group = result.electiveGroups.find((g) => g.code === "GROUP_A:6");
  assert.ok(group);
  assert.equal(group.passedCredits, 3);
  assert.equal(group.creditedCredits, 3);
  assert.equal(group.remainingCredits, 3);
  assert.equal(group.status, "FAIL");
});

test("Training Progress TC08: Hai nhóm tự chọn A dư 3 TC, B thiếu 3 TC -> A không bù B", () => {
  const result = evaluateStudentTrainingProgress({
    student: defaultStudent,
    curriculum: [
      { courseId: "a1", courseCode: "A1", courseName: "A1", credits: 3, requirementType: "elective", choiceGroupCode: "GROUP_A:3", semesterNo: 2 },
      { courseId: "a2", courseCode: "A2", courseName: "A2", credits: 3, requirementType: "elective", choiceGroupCode: "GROUP_A:3", semesterNo: 2 },
      { courseId: "b1", courseCode: "B1", courseName: "B1", credits: 3, requirementType: "elective", choiceGroupCode: "GROUP_B:3", semesterNo: 2 },
    ],
    grades: [
      { courseCode: "A1", courseName: "A1", isPass: true, notScore: false, scoreStatus: "graded" },
      { courseCode: "A2", courseName: "A2", isPass: true, notScore: false, scoreStatus: "graded" },
    ],
    timeline: defaultTimeline,
  });
  const groupA = result.electiveGroups.find((g) => g.code === "GROUP_A:3");
  const groupB = result.electiveGroups.find((g) => g.code === "GROUP_B:3");
  assert.ok(groupA && groupB);
  assert.equal(groupA.creditedCredits, 3);
  assert.equal(groupA.extraCredits, 3);
  assert.equal(groupB.creditedCredits, 0);
  assert.equal(groupB.remainingCredits, 3);
  assert.equal(groupB.status, "FAIL");
});

test("Training Progress TC09: Môn kỳ trước chưa hoàn thành -> PAST_DUE -> overdueCredits tăng", () => {
  // expectedSemesterNo is 3; course is semester 1
  const result = evaluateStudentTrainingProgress({
    student: defaultStudent,
    curriculum: [
      { courseId: "c1", courseCode: "PAST_COURSE", courseName: "Môn kỳ 1", credits: 4, requirementType: "mandatory", semesterNo: 1 },
    ],
    grades: [],
    timeline: defaultTimeline, // expectedSemesterNo = 3
  });
  assert.equal(result.courseStatus.pastDue.length, 1);
  assert.equal(result.scheduleProgress.overdueCredits, 4);
  assert.equal(result.scheduleProgress.isBehind, true);
});

test("Training Progress TC10: Môn kỳ tương lai đã PASS -> AHEAD -> aheadCredits tăng", () => {
  // expectedSemesterNo is 3; course is semester 5
  const result = evaluateStudentTrainingProgress({
    student: defaultStudent,
    curriculum: [
      { courseId: "c5", courseCode: "FUTURE_COURSE", courseName: "Môn kỳ 5", credits: 3, requirementType: "mandatory", semesterNo: 5 },
    ],
    grades: [
      { courseCode: "FUTURE_COURSE", courseName: "Môn kỳ 5", isPass: true, notScore: false, scoreStatus: "graded" },
    ],
    timeline: defaultTimeline, // expectedSemesterNo = 3
  });
  assert.equal(result.scheduleProgress.aheadCredits, 3);
  assert.equal(result.scheduleProgress.isAhead, true);
});

test("Training Progress TC11: Môn kỳ tương lai chưa học -> FUTURE -> không cảnh báo", () => {
  // expectedSemesterNo is 3; course is semester 5
  const result = evaluateStudentTrainingProgress({
    student: defaultStudent,
    curriculum: [
      { courseId: "c5", courseCode: "FUTURE_COURSE", courseName: "Môn kỳ 5", credits: 3, requirementType: "mandatory", semesterNo: 5 },
    ],
    grades: [],
    timeline: defaultTimeline, // expectedSemesterNo = 3
  });
  assert.equal(result.courseStatus.future.length, 1);
  assert.equal(result.scheduleProgress.overdueCredits, 0);
  assert.equal(result.scheduleProgress.isBehind, false);
});

test("Training Progress TC12: Course bảng điểm không match CTĐT -> UNMATCHED -> không cộng tín chỉ", () => {
  const result = evaluateStudentTrainingProgress({
    student: defaultStudent,
    curriculum: [
      { courseId: "c1", courseCode: "20CT1101", courseName: "Nhập môn CNTT", credits: 3, requirementType: "mandatory", semesterNo: 1 },
    ],
    grades: [
      { courseCode: "UNRELATED_001", courseName: "Môn ngoài lề", credits: 3, isPass: true, notScore: false, scoreStatus: "graded" },
    ],
    timeline: defaultTimeline,
  });
  assert.equal(result.courseStatus.unmatched.length, 1);
  assert.equal(result.summary.completedCredits, 0);
});

test("Training Progress TC13: CTĐT có record trùng -> không double-count", () => {
  const result = evaluateStudentTrainingProgress({
    student: defaultStudent,
    curriculum: [
      { courseId: "c1_a", courseCode: "20CT1101", courseName: "Nhập môn CNTT", credits: 3, requirementType: "mandatory", semesterNo: 1 },
      { courseId: "c1_b", courseCode: "20CT1101", courseName: "Nhập môn CNTT", credits: 3, requirementType: "mandatory", semesterNo: 1 },
    ],
    grades: [
      { courseCode: "20CT1101", courseName: "Nhập môn CNTT", isPass: true, notScore: false, scoreStatus: "graded" },
    ],
    timeline: defaultTimeline,
  });
  assert.equal(result.curriculum.totalCourses, 1);
  assert.equal(result.summary.completedCredits, 3);
});

test("Training Progress TC14: Thiếu totalCredits/elective rule -> không bịa % tiến độ -> trả unknown + warning", () => {
  const result = evaluateStudentTrainingProgress({
    student: defaultStudent,
    curriculum: [
      { courseId: "c1", courseCode: "20CT1101", courseName: "Nhập môn CNTT", credits: 3, requirementType: "mandatory", semesterNo: 1 },
      { courseId: "e1", courseCode: "ELEC1", courseName: "Tự chọn 1", credits: 3, requirementType: "elective", semesterNo: 2 },
    ],
    grades: [
      { courseCode: "20CT1101", courseName: "Nhập môn CNTT", isPass: true, notScore: false, scoreStatus: "graded" },
    ],
    timeline: defaultTimeline,
    rules: {
      requiredTotalCredits: null, // rule missing
    },
  });
  assert.equal(result.summary.requiredCredits, null);
  assert.equal(result.summary.progressPercent, null);
  assert.ok(result.warnings.some((w) => w.includes("chưa cấu hình") || w.includes("UNKNOWN_REQUIREMENT")));
});

test("Training Progress TC15: Sinh viên vừa thiếu môn kỳ trước vừa học trước kỳ sau -> isBehind = true, isAhead = true", () => {
  // expectedSemesterNo = 3
  const result = evaluateStudentTrainingProgress({
    student: defaultStudent,
    curriculum: [
      { courseId: "c1", courseCode: "OLD_COURSE", courseName: "Môn kỳ 1", credits: 3, requirementType: "mandatory", semesterNo: 1 },
      { courseId: "c5", courseCode: "AHEAD_COURSE", courseName: "Môn kỳ 5", credits: 4, requirementType: "mandatory", semesterNo: 5 },
    ],
    grades: [
      // Did not pass OLD_COURSE, but passed AHEAD_COURSE
      { courseCode: "AHEAD_COURSE", courseName: "Môn kỳ 5", isPass: true, notScore: false, scoreStatus: "graded" },
    ],
    timeline: defaultTimeline,
  });
  assert.equal(result.scheduleProgress.isBehind, true);
  assert.equal(result.scheduleProgress.isAhead, true);
  assert.equal(result.scheduleProgress.overdueCredits, 3);
  assert.equal(result.scheduleProgress.aheadCredits, 4);
});
