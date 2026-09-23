const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
const { PrismaClient } = require("@prisma/client");

const DOC_URL =
  "https://kg8vuz7mh4.apidog.io/l%E1%BA%A5y-danh-s%C3%A1ch-sinh-vi%C3%AAn-theo-m%C3%A3-l%E1%BB%9Bp-42667620e0";
const API_BASE = "https://quan-ly-dao-tao-api.nguyentronghieu.io.vn/api/v1";
const CLASS_CODES = [
  "ITK46A",
  "ITK46B",
  "ITK47A",
  "ITK47B",
  "ITK47C",
  "ITK48A",
  "ITK48B",
  "ITK49A",
  "ITK49B",
  "ITK49C",
];
const AUTH_TABLES = new Set([
  "_prisma_migrations",
  "users",
  "roles",
  "permissions",
  "user_roles",
  "role_permissions",
  "graduation_rules",
  "academic_warning_policies",
]);

function loadDatabaseUrl() {
  for (const name of [".env", ".env.local"]) {
    const file = path.resolve(__dirname, "..", name);
    if (!fs.existsSync(file)) continue;
    for (const line of fs.readFileSync(file, "utf8").split(/\r?\n/)) {
      const match = line.match(/^DATABASE_URL=(.*)$/);
      if (match) {
        process.env.DATABASE_URL = match[1].trim().replace(/^"|"$/g, "");
      }
    }
  }
  if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is not configured");
}

const clean = (value) => (value == null ? "" : String(value).trim());
const nullable = (value) => clean(value) || null;

function parseDate(value) {
  const text = clean(value);
  if (!text) return null;
  const vn = text.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (vn) {
    const [, day, month, year] = vn;
    return new Date(Date.UTC(Number(year), Number(month) - 1, Number(day)));
  }
  const parsed = new Date(text);
  if (Number.isNaN(parsed.getTime())) throw new Error(`Invalid date: ${text}`);
  return parsed;
}

function parseNumber(value, min = -Infinity, max = Infinity) {
  const text = clean(value).replace(",", ".");
  if (!text) return null;
  const parsed = Number(text);
  return Number.isFinite(parsed) && parsed >= min && parsed <= max ? parsed : null;
}

function parseInteger(value, fallback = 0) {
  const parsed = Number.parseInt(clean(value), 10);
  return Number.isInteger(parsed) ? parsed : fallback;
}

function marker(value) {
  if (typeof value === "boolean") return value;
  return ["x", "1", "true", "yes"].includes(clean(value).toLowerCase());
}

function normalizeTerm(value) {
  const text = clean(value).toUpperCase();
  const match = text.match(/^(?:HK)?0?(\d)$/);
  if (!match) throw new Error(`Invalid academic term: ${text}`);
  return `HK0${Number(match[1])}`;
}

function validYear(value) {
  return /^\d{4}-\d{4}$/.test(clean(value));
}

function termMeta(termCode) {
  const order = Number(termCode.slice(-1));
  return {
    order,
    name: order === 3 ? "Học kỳ hè" : `Học kỳ ${order}`,
    isSummer: order === 3,
  };
}

function cohortForClass(classCode) {
  const match = classCode.match(/^ITK(\d{2})/);
  if (!match) throw new Error(`Cannot derive cohort from class ${classCode}`);
  const number = Number(match[1]);
  const startYear = 1976 + number;
  return {
    code: `K${match[1]}`,
    name: `Khóa ${number} (${startYear}-${startYear + 4})`,
  };
}

async function fetchWithRetry(url, options, attempts = 4) {
  let lastError;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      const response = await fetch(url, { ...options, signal: AbortSignal.timeout(30_000) });
      if (!response.ok) {
        throw new Error(`${response.status} ${response.statusText}: ${(await response.text()).slice(0, 300)}`);
      }
      return response;
    } catch (error) {
      lastError = error;
      if (attempt < attempts) await new Promise((resolve) => setTimeout(resolve, 400 * attempt));
    }
  }
  throw lastError;
}

async function getApiKey() {
  if (process.env.APIDOG_SOURCE_API_KEY) return process.env.APIDOG_SOURCE_API_KEY;
  const html = await (await fetchWithRetry(DOC_URL)).text();
  const match = html.match(/mk_dev_[a-f0-9]+/i);
  if (!match) throw new Error("Could not find the published source API key in Apidog docs");
  return match[0];
}

async function createSourceClient() {
  const apiKey = await getApiKey();
  return async (endpoint, body) => {
    const response = await fetchWithRetry(`${API_BASE}/${endpoint}`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-API-KEY": apiKey },
      body: JSON.stringify(body),
    });
    const payload = await response.json();
    if (!payload || payload.ok !== true) {
      throw new Error(`${endpoint} returned an unsuccessful payload`);
    }
    return payload.body;
  };
}

async function mapLimit(items, limit, worker) {
  const result = new Array(items.length);
  let next = 0;
  async function run() {
    while (true) {
      const index = next;
      next += 1;
      if (index >= items.length) return;
      result[index] = await worker(items[index], index);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, run));
  return result;
}

async function fetchSourceData() {
  const call = await createSourceClient();
  console.log("Fetching students from 10 classes...");
  const classResults = await mapLimit(CLASS_CODES, 5, async (classCode) => ({
    classCode,
    students: await call("LayDanhSachSinhVienTheoLop", { Id: classCode }),
  }));

  const studentsByCode = new Map();
  for (const { classCode, students } of classResults) {
    if (!Array.isArray(students)) throw new Error(`Student response for ${classCode} is not an array`);
    for (const student of students) {
      const code = clean(student.StudentID);
      if (!code) throw new Error(`A student in ${classCode} has no StudentID`);
      studentsByCode.set(code, student);
    }
  }
  const students = [...studentsByCode.values()];
  if (students.length < 600) throw new Error(`Safety check failed: only ${students.length} students were returned`);

  const studentProgramCodes = [...new Set(students.map((item) => clean(item.StudyProgramID)).filter(Boolean))];
  const programCodes = [...new Set([
    ...studentProgramCodes,
    ...studentProgramCodes.filter((code) => code.includes("-")).map((code) => code.split("-")[0]),
  ])].sort();

  console.log(`Fetching curricula for ${programCodes.length} programs...`);
  const curriculumResults = await mapLimit(programCodes, 5, async (programCode) => {
    const body = await call("LayDanhSachHocPhanTheoCTDT", { p1: programCode });
    const rows = body?.tbStudyPrograms;
    if (!Array.isArray(rows)) throw new Error(`Curriculum response for ${programCode} is invalid`);
    return rows;
  });
  const curricula = curriculumResults.flat();
  if (curricula.length < 250) throw new Error(`Safety check failed: only ${curricula.length} curriculum rows were returned`);

  console.log(`Fetching grades, decisions and fee policies for ${students.length} students...`);
  const perStudent = await mapLimit(students, 8, async (student, index) => {
    const studentId = clean(student.StudentID);
    const programCode = clean(student.StudyProgramID);
    const [grades, decisions, feePolicies] = await Promise.all([
      call("LayBangDiemSinhVien", { p1: studentId, p2: programCode, p3: "ALL", p4: "ALL" }),
      call("LayDanhSachQuyetDinh", { p1: studentId }),
      call("LayDanhSachMienGiamHocPhi", { p1: studentId }),
    ]);
    if ((index + 1) % 50 === 0 || index + 1 === students.length) {
      console.log(`Fetched ${index + 1}/${students.length} students`);
    }
    return {
      studentId,
      grades: Array.isArray(grades) ? grades : [],
      decisions: Array.isArray(decisions) ? decisions : [],
      feePolicies: Array.isArray(feePolicies) ? feePolicies : [],
    };
  });

  const decisions = perStudent.flatMap((item) => item.decisions);
  const feePolicies = perStudent.flatMap((item) => item.feePolicies);
  const gradeRows = [];
  const unscopedGradeRows = [];
  for (const item of perStudent) {
    for (const year of item.grades) {
      for (const term of year.DanhSachDiem || []) {
        const grades = term.DanhSachDiemHK || [];
        const firstGrade = grades[0] || {};
        const yearCode = clean(year.NamHoc) || clean(firstGrade.NamHoc) || clean(firstGrade.YearStudy);
        const rawTerm = clean(term.HocKy) || clean(term.TermID) || clean(firstGrade.HocKy) || clean(firstGrade.TermID);
        if (!validYear(yearCode) || !rawTerm) {
          for (const grade of grades) {
            unscopedGradeRows.push({
              studentId: clean(grade.StudentID) || item.studentId,
              reason: "MISSING_ACADEMIC_PERIOD",
              grade,
            });
          }
          continue;
        }
        const termCode = normalizeTerm(rawTerm);
        for (const grade of grades) {
          gradeRows.push({ studentId: item.studentId, yearCode, termCode, grade });
        }
      }
    }
  }
  if (gradeRows.length < 30_000) throw new Error(`Safety check failed: only ${gradeRows.length} grade rows were returned`);
  if (unscopedGradeRows.length) {
    console.log(`Preserving ${unscopedGradeRows.length} grade rows without an academic year/term as unscoped source records.`);
  }

  const sanitizedCurricula = deduplicateCurricula(curricula, gradeRows);

  const academicYears = [...new Set([
    ...gradeRows.map((row) => row.yearCode),
    ...sanitizedCurricula.map((row) => clean(row.YearStudy)).filter(validYear),
  ])].sort();
  const conductRequests = academicYears.flatMap((yearCode) =>
    ["HK01", "HK02", "HK03"].flatMap((termCode) =>
      CLASS_CODES.map((classCode) => ({ yearCode, termCode, classCode })),
    ),
  );
  console.log(`Fetching official conduct data for ${conductRequests.length} class periods...`);
  const conductResults = await mapLimit(conductRequests, 8, async (request, index) => {
    const body = await call("LayBangDiemRenLuyenTheoLop", {
      YearStudy: request.yearCode,
      TermId: request.termCode,
      Id: request.classCode,
    });
    const records = body?.resultDanhSach;
    if (!Array.isArray(records)) {
      throw new Error(`Conduct response for ${request.classCode}/${request.yearCode}/${request.termCode} is invalid`);
    }
    if ((index + 1) % 25 === 0 || index + 1 === conductRequests.length) {
      console.log(`Fetched conduct data for ${index + 1}/${conductRequests.length} class periods`);
    }
    return records
      .filter((record) => [
        record.StudentScore,
        record.ClassScore,
        record.DepartmentScore,
        record.StatusID,
        record.LastScore,
        record.UpdateDay,
        record.UpdateStaff,
      ].some((value) => clean(value) !== ""))
      .map((record) => ({ ...request, record }));
  });

  return {
    classResults,
    students,
    programCodes,
    curricula: sanitizedCurricula,
    gradeRows,
    unscopedGradeRows,
    conductRows: conductResults.flat(),
    decisions,
    feePolicies,
  };
}

function deduplicateCurricula(curricula, gradeRows) {
  const gradeCountByCode = new Map();
  for (const { grade } of gradeRows) {
    const code = clean(grade.CurriculumID);
    if (code) gradeCountByCode.set(code, (gradeCountByCode.get(code) || 0) + 1);
  }

  const byProgramAndName = new Map();
  for (const row of curricula) {
    const program = clean(row.MaCTDT);
    const name = clean(row.TenHP).toLowerCase().replace(/\s+/g, " ");
    if (!program || !name) continue;
    const key = `${program}|${name}`;
    const list = byProgramAndName.get(key) || [];
    list.push(row);
    byProgramAndName.set(key, list);
  }

  const deduplicated = [];
  const removed = [];

  for (const rows of byProgramAndName.values()) {
    if (rows.length === 1) {
      deduplicated.push(rows[0]);
      continue;
    }

    // Sort to prioritize the best candidate:
    // 1. Highest number of student grade records matching this course code
    // 2. If tied, prefer later semester (avoids dump into HK1 for upper-year courses)
    // 3. If tied, stable alphabetical by course code
    rows.sort((a, b) => {
      const countA = gradeCountByCode.get(clean(a.MaHP)) || 0;
      const countB = gradeCountByCode.get(clean(b.MaHP)) || 0;
      if (countA !== countB) return countB - countA;

      const semA = Number(String(a.HocKy || "").replace(/\D/g, "")) || 1;
      const semB = Number(String(b.HocKy || "").replace(/\D/g, "")) || 1;
      if (semA !== semB) return semB - semA;

      return clean(a.MaHP).localeCompare(clean(b.MaHP));
    });

    const chosen = rows[0];
    deduplicated.push(chosen);
    for (let i = 1; i < rows.length; i++) {
      removed.push({
        program: clean(chosen.MaCTDT),
        courseName: clean(chosen.TenHP),
        kept: {
          code: clean(chosen.MaHP),
          semester: clean(chosen.HocKy),
          grades: gradeCountByCode.get(clean(chosen.MaHP)) || 0,
        },
        dropped: {
          code: clean(rows[i].MaHP),
          semester: clean(rows[i].HocKy),
          grades: gradeCountByCode.get(clean(rows[i].MaHP)) || 0,
        },
      });
    }
  }

  if (removed.length > 0) {
    console.log(`Deduplicated ${removed.length} redundant curriculum course(s) within programs:`);
    for (const item of removed) {
      console.log(
        ` - [${item.program}] "${item.courseName}": Kept ${item.kept.code} (${item.kept.semester}, ${item.kept.grades} grades), Dropped duplicate ${item.dropped.code} (${item.dropped.semester}, ${item.dropped.grades} grades)`,
      );
    }
  }

  return deduplicated;
}

async function createManyInChunks(model, data, size = 500) {
  for (let index = 0; index < data.length; index += size) {
    await model.createMany({ data: data.slice(index, index + size) });
  }
}

function sourceHash(data) {
  return crypto.createHash("sha256").update(JSON.stringify(data)).digest("hex");
}

function deterministicUuid(value) {
  const hex = sourceHash(value).slice(0, 32).split("");
  hex[12] = "5";
  hex[16] = ((Number.parseInt(hex[16], 16) & 0x3) | 0x8).toString(16);
  const compact = hex.join("");
  return `${compact.slice(0, 8)}-${compact.slice(8, 12)}-${compact.slice(12, 16)}-${compact.slice(16, 20)}-${compact.slice(20)}`;
}

function buildAcademicKeys(source) {
  const keys = new Set();
  const add = (year, term) => {
    const yearCode = clean(year);
    if (!validYear(yearCode)) return;
    try {
      keys.add(`${yearCode}|${normalizeTerm(term)}`);
    } catch {}
  };
  for (const row of source.curricula) add(row.YearStudy, row.TermID);
  for (const row of source.gradeRows) add(row.yearCode, row.termCode);
  for (const row of source.conductRows) add(row.yearCode, row.termCode);
  for (const row of source.decisions) add(row.YearStudy, row.TermID);
  for (const row of source.feePolicies) add(row.YearStudy, row.TermID);
  // Academic years in this system always expose the three standard terms,
  // including a term that currently has no source records.
  const years = [...new Set([...keys].map((key) => key.split("|")[0]))];
  for (const year of years) {
    for (const term of ["HK01", "HK02", "HK03"]) keys.add(`${year}|${term}`);
  }
  return [...keys].sort();
}

function latestSourceMainTermKey(source) {
  const keys = [...new Set(source.gradeRows
    .map((row) => `${row.yearCode}|${row.termCode}`)
    .filter((key) => !key.endsWith("|HK03")))];
  keys.sort((left, right) => {
    const [leftYear, leftTerm] = left.split("|");
    const [rightYear, rightTerm] = right.split("|");
    return leftYear.localeCompare(rightYear) || termMeta(leftTerm).order - termMeta(rightTerm).order;
  });
  const current = keys.at(-1);
  if (!current) throw new Error("No main academic term with source registrations was found");
  return current;
}

function planRequirementType(value) {
  const normalized = clean(value).toLocaleLowerCase("vi");
  return normalized.includes("bắt") || normalized === "mandatory" ? "mandatory" : "elective";
}

function scoreParts(value, max) {
  const text = clean(value).toUpperCase();
  if (!text) return { value: null, special: null };
  const number = Number(text.replace(",", "."));
  if (Number.isFinite(number) && number >= 0 && number <= max) return { value: number, special: null };
  return { value: null, special: text.slice(0, 16) };
}

async function replaceBusinessData(prisma, source) {
  const tableRows = await prisma.$queryRawUnsafe(
    "SELECT tablename FROM pg_tables WHERE schemaname = 'public' ORDER BY tablename",
  );
  const domainTables = tableRows.map((row) => row.tablename).filter((table) => !AUTH_TABLES.has(table));
  if (!domainTables.includes("students") || !domainTables.includes("student_course_grades")) {
    throw new Error("Safety check failed: expected domain tables are missing");
  }
  console.log(`Replacing data in ${domainTables.length} business tables; authentication/RBAC tables are preserved.`);

  await prisma.$transaction(async (tx) => {
    const quoted = domainTables.map((table) => `"${table.replaceAll('"', '""')}"`).join(", ");
    await tx.$executeRawUnsafe(`TRUNCATE TABLE ${quoted} RESTART IDENTITY CASCADE`);

    const cohortMap = new Map();
    for (const classCode of CLASS_CODES) {
      const cohort = cohortForClass(classCode);
      if (!cohortMap.has(cohort.code)) cohortMap.set(cohort.code, { id: crypto.randomUUID(), ...cohort });
    }
    await tx.cohort.createMany({
      data: [...cohortMap.values()].map((item) => ({
        id: item.id,
        sCohortCode: item.code,
        sCohortName: item.name,
      })),
    });
    const classRows = CLASS_CODES.map((classCode) => ({
        id: crypto.randomUUID(),
        classId: classCode,
        className: classCode,
        cohortId: cohortMap.get(cohortForClass(classCode).code).id,
    }));
    await tx.class.createMany({ data: classRows });
    const classByCode = new Map(classRows.map((row) => [row.classId, row]));

    const existingPolicy = await tx.academicWarningPolicy.findFirst({ where: { status: "active" } });
    if (!existingPolicy) {
      await tx.academicWarningPolicy.create({
        data: {
          name: "Chính sách cảnh báo học vụ chuẩn (Quy chế đào tạo)",
          termGpaThreshold: 2.00,
          cumulativeGpaThreshold: 2.00,
          conductScoreThreshold: 50,
          version: 1,
          status: "active",
        },
      });
    }

    const studentRows = source.students.map((item) => {
      const birthDate = parseDate(item.BirthDay);
      if (!birthDate) throw new Error(`Missing birth date for student ${clean(item.StudentID)}`);
      return {
        id: crypto.randomUUID(),
        sStudentId: clean(item.StudentID),
        sFirstName: clean(item.FirstName),
        sLastName: clean(item.LastName),
        sFullName: clean(item.StudentNameWithoutID) || clean(item.StudentName) || `${clean(item.LastName)} ${clean(item.FirstName)}`.trim(),
        sBirthDate: birthDate,
        sBirthPlace: nullable(item.BirthPlace),
        sGender: nullable(item.Gender),
        sClassRoleId: parseInteger(item.ClassRoleID),
        sPermanentResidence: nullable(item.PermanentResidence),
        sIsInClass: item.IsInClass !== false,
        sClassStudentId: nullable(item.ClassStudentID),
        sStudyProgramId: nullable(item.StudyProgramID),
      };
    });
    await createManyInChunks(tx.student, studentRows);
    const studentIdMap = new Map(studentRows.map((row) => [row.sStudentId, row.id]));

    const programSource = new Map();
    for (const row of source.curricula) {
      const code = clean(row.MaCTDT);
      if (code && !programSource.has(code)) programSource.set(code, row);
    }
    const programRows = source.programCodes.map((code) => {
      const row = programSource.get(code) || {};
      return {
        id: crypto.randomUUID(),
        sProgramCode: code,
        sProgramName: clean(row.TenCTDT) || code,
        sDegreeLevel: clean(row.TrinhDoDaoTao) || "Đại học",
        sMajor: clean(row.ChuyenNganhDaoTao) || "Công nghệ thông tin",
        sStudyType: clean(row.HinhThucDaoTao) || "Chính quy",
        s_faculty_code: nullable(row.Khoa),
      };
    });
    await tx.trainingProgram.createMany({ data: programRows });
    const programIdMap = new Map(programRows.map((row) => [row.sProgramCode, row.id]));

    const courseSource = new Map();
    for (const row of source.curricula) {
      const code = clean(row.MaHP);
      if (code) courseSource.set(code, clean(row.TenHP) || code);
    }
    for (const { grade } of source.gradeRows) {
      const code = clean(grade.CurriculumID);
      if (code && !courseSource.has(code)) {
        courseSource.set(code, clean(grade.CurriculumNamePrint) || clean(grade.CurriculumName) || code);
      }
    }
    for (const { grade } of source.unscopedGradeRows) {
      const code = clean(grade.CurriculumID);
      if (code && !courseSource.has(code)) {
        courseSource.set(code, clean(grade.CurriculumNamePrint) || clean(grade.CurriculumName) || code);
      }
    }
    const courseRows = [...courseSource].map(([code, name]) => ({
      id: crypto.randomUUID(),
      sCourseCode: code,
      sCourseName: name,
    }));
    await createManyInChunks(tx.course, courseRows);
    const courseIdMap = new Map(courseRows.map((row) => [row.sCourseCode, row.id]));

    const academicKeys = buildAcademicKeys(source);
    const currentAcademicKey = latestSourceMainTermKey(source);
    const [currentYearCode] = currentAcademicKey.split("|");
    const yearCodes = [...new Set(academicKeys.map((key) => key.split("|")[0]))];
    const yearRows = yearCodes.map((code) => ({
      id: crypto.randomUUID(),
      sYearCode: code,
      status: code === currentYearCode ? "open" : "draft",
      isCurrent: code === currentYearCode,
    }));
    await tx.academicYear.createMany({ data: yearRows });
    const yearIdMap = new Map(yearRows.map((row) => [row.sYearCode, row.id]));
    const termRows = academicKeys.map((key) => {
      const [yearCode, termCode] = key.split("|");
      const meta = termMeta(termCode);
      return {
        id: crypto.randomUUID(),
        academicYearId: yearIdMap.get(yearCode),
        sTermCode: termCode,
        sTermName: meta.name,
        sTermOrder: meta.order,
        sIsSummer: meta.isSummer,
        status: key === currentAcademicKey ? "open" : "draft",
        isCurrent: key === currentAcademicKey,
      };
    });
    await tx.academicTerm.createMany({ data: termRows });
    const termIdMap = new Map(academicKeys.map((key, index) => [key, termRows[index].id]));

    const curriculumMap = new Map();
    for (const row of source.curricula) {
      const programCode = clean(row.MaCTDT);
      const courseCode = clean(row.MaHP);
      if (!programIdMap.has(programCode) || !courseIdMap.has(courseCode)) continue;
      const key = `${programCode}|${courseCode}`;
      const yearCode = clean(row.YearStudy);
      let termCode = null;
      try { termCode = normalizeTerm(row.TermID); } catch {}
      const semesterMatch = clean(row.HocKy).match(/(\d+)/);
      curriculumMap.set(key, {
        id: crypto.randomUUID(),
        trainingProgramId: programIdMap.get(programCode),
        courseId: courseIdMap.get(courseCode),
        sSemesterNo: semesterMatch ? Number(semesterMatch[1]) : 1,
        sCredits: parseInteger(row.STC, 1),
        sTheoryHours: parseNumber(row.LT, 0, 32767),
        sPracticeHours: parseNumber(row.TH, 0, 32767),
        sRequirementType: clean(row.BatBuoc) || "Bắt Buộc",
        sNote: nullable(row.GhiChu),
        sYearStudy: validYear(yearCode) ? yearCode : null,
        sTermId: termCode,
        sDepartmentCode: nullable(row.BoMon),
        sFacultyCode: nullable(row.Khoa),
        academicTermId: validYear(yearCode) && termCode ? termIdMap.get(`${yearCode}|${termCode}`) || null : null,
      });
    }
    // Normalize semesters and inherit base courses for specialized branch programs
    for (const [programCode, progId] of programIdMap.entries()) {
      if (!programCode.includes("-")) continue;
      const [baseCode] = programCode.split("-");
      const baseProgId = programIdMap.get(baseCode);
      if (!baseProgId) continue;

      const progCourses = [...curriculumMap.values()].filter((c) => c.trainingProgramId === progId);
      const baseCourses = [...curriculumMap.values()].filter((c) => c.trainingProgramId === baseProgId);

      const nonSem1Semesters = progCourses.map((c) => c.sSemesterNo).filter((s) => s > 1);
      const minSpecializedSemester = nonSem1Semesters.length > 0 ? Math.min(...nonSem1Semesters) : 5;

      const baseByCourseId = new Map(baseCourses.map((c) => [c.courseId, c]));

      for (const pc of progCourses) {
        const base = baseByCourseId.get(pc.courseId);
        if (pc.sSemesterNo === 1 && base && base.sSemesterNo > 1 && base.sSemesterNo < minSpecializedSemester) {
          pc.sSemesterNo = base.sSemesterNo;
        }
      }

      const existingCourseIds = new Set(progCourses.map((c) => c.courseId));
      for (const bc of baseCourses) {
        if (!existingCourseIds.has(bc.courseId) && bc.sSemesterNo < minSpecializedSemester) {
          const key = `${programCode}|inherit_${bc.courseId}`;
          curriculumMap.set(key, {
            ...bc,
            id: crypto.randomUUID(),
            trainingProgramId: progId,
          });
          existingCourseIds.add(bc.courseId);
        }
      }
    }

    const programCourseRows = [...curriculumMap.values()];
    await createManyInChunks(tx.trainingProgramCourse, programCourseRows);

    const scopeMap = new Map();
    for (const student of studentRows) {
      const studentClass = classByCode.get(student.sClassStudentId);
      const trainingProgramId = programIdMap.get(student.sStudyProgramId);
      if (!studentClass || !trainingProgramId) continue;
      const key = `${studentClass.cohortId}|${trainingProgramId}`;
      if (!scopeMap.has(key)) {
        scopeMap.set(key, { cohortId: studentClass.cohortId, trainingProgramId });
      }
    }

    const coursesByProgramAndTerm = new Map();
    for (const course of programCourseRows) {
      if (!course.academicTermId) continue;
      const key = `${course.trainingProgramId}|${course.academicTermId}`;
      const rows = coursesByProgramAndTerm.get(key) || [];
      rows.push(course);
      coursesByProgramAndTerm.set(key, rows);
    }

    const planRows = [];
    const coursesForPlanKey = new Map();
    for (const scope of scopeMap.values()) {
      const groups = [...coursesByProgramAndTerm.entries()]
        .filter(([key]) => key.startsWith(`${scope.trainingProgramId}|`))
        .map(([key, courses]) => ({ academicTermId: key.split("|")[1], courses }));
      if (!groups.length) {
        throw new Error(`No curriculum rows with an academic term for program ${scope.trainingProgramId}`);
      }
      const maxSemester = Math.max(...groups.flatMap((group) => group.courses.map((course) => course.sSemesterNo)));
      for (const group of groups) {
        const semesters = [...new Set(group.courses.map((course) => course.sSemesterNo))];
        if (semesters.length !== 1) {
          throw new Error(`Source curriculum maps multiple semesters to term ${group.academicTermId}`);
        }
        const term = termRows.find((item) => item.id === group.academicTermId);
        if (!term) throw new Error(`Cannot resolve curriculum term ${group.academicTermId}`);
        const id = crypto.randomUUID();
        const planKey = `${scope.cohortId}|${scope.trainingProgramId}|${group.academicTermId}`;
        planRows.push({
          id,
          cohortId: scope.cohortId,
          trainingProgramId: scope.trainingProgramId,
          academicYearId: term.academicYearId,
          academicTermId: group.academicTermId,
          curriculumSemesterNo: semesters[0],
          version: 1,
          status: "locked",
          isCurrent: true,
          requiredElectiveCredits: 0,
          is_program_final: semesters[0] === maxSemester,
        });
        coursesForPlanKey.set(planKey, { planId: id, courses: group.courses });
      }
    }
    await createManyInChunks(tx.trainingProgressPlan, planRows, 200);

    const catalogById = new Map(courseRows.map((course) => [course.id, course]));
    const planCourseRows = [];
    for (const { planId, courses } of coursesForPlanKey.values()) {
      for (const course of courses) {
        const catalog = catalogById.get(course.courseId);
        if (!catalog) throw new Error(`Cannot resolve course ${course.courseId} for progress plan`);
        const requirementType = planRequirementType(course.sRequirementType);
        planCourseRows.push({
          id: crypto.randomUUID(),
          planId,
          courseId: course.courseId,
          sCourseCode: catalog.sCourseCode,
          sCourseName: catalog.sCourseName,
          sCredits: course.sCredits,
          requirementType,
          isRegistrationRequired: requirementType === "mandatory",
        });
      }
    }
    await createManyInChunks(tx.trainingProgressPlanCourse, planCourseRows, 400);

    const batchId = crypto.randomUUID();
    await tx.gradeImportBatch.create({
      data: {
        id: batchId,
        sourceHash: sourceHash({ scoped: source.gradeRows, unscoped: source.unscopedGradeRows }),
        status: "running",
        totalRows: source.gradeRows.length + source.unscopedGradeRows.length,
      },
    });

    const unscopedGradeRows = source.unscopedGradeRows.map((item) => {
      const grade = item.grade;
      const studentCode = clean(grade.StudentID) || item.studentId;
      const studentId = studentIdMap.get(studentCode);
      if (!studentId) throw new Error(`Cannot resolve unscoped grade student ${studentCode}`);
      const credits = parseNumber(grade.Credits, 0, 32767);
      return {
        id: crypto.randomUUID(),
        studentId,
        sStudentId: studentCode,
        sCourseCode: nullable(grade.CurriculumID),
        sCourseName: nullable(grade.CurriculumNamePrint) || nullable(grade.CurriculumName),
        sCredits: credits == null ? null : Math.trunc(credits),
        reason: item.reason,
        sourcePayload: grade,
        sourceMd5: nullable(grade.MD5),
        gradeImportBatchId: batchId,
      };
    });
    await createManyInChunks(tx.unscopedGradeRecord, unscopedGradeRows, 400);

    const offeringMap = new Map();
    const gradeMap = new Map();
    const summaryMap = new Map();
    for (const item of source.gradeRows) {
      const grade = item.grade;
      const studentCode = clean(grade.StudentID) || item.studentId;
      const studentId = studentIdMap.get(studentCode);
      const termId = termIdMap.get(`${item.yearCode}|${item.termCode}`);
      const courseCode = clean(grade.CurriculumID);
      const courseId = courseIdMap.get(courseCode);
      if (!studentId || !termId || !courseId) throw new Error(`Cannot resolve grade dependencies for ${studentCode}/${courseCode}`);
      const studyUnitId = clean(grade.StudyUnitID);
      const scheduleStudyUnitId = clean(grade.ScheduleStudyUnitID);
      const offeringKey = `${studentId}|${termId}|${studyUnitId}|${scheduleStudyUnitId}`;
      const offeringId = offeringMap.get(offeringKey)?.id || crypto.randomUUID();
      offeringMap.set(offeringKey, {
        id: offeringId,
        studentId,
        academicYearId: yearIdMap.get(item.yearCode),
        academicTermId: termId,
        courseId,
        sStudentId: studentCode,
        sProgramCode: nullable(grade.StudyProgramID),
        sCurriculumId: courseCode,
        sStudyUnitId: studyUnitId,
        sScheduleStudyUnitId: scheduleStudyUnitId,
        sCourseName: clean(grade.CurriculumNamePrint) || clean(grade.CurriculumName) || courseCode,
        sCourseNameEng: nullable(grade.EnglishCurriculumName),
        sCourseGroup: nullable(clean(grade.CurriculumGroupID).toUpperCase()),
        sCredits: parseInteger(grade.Credits),
        sourcePayload: grade,
        sourceMd5: nullable(grade.MD5),
        gradeImportBatchId: batchId,
      });
      const score10 = scoreParts(grade.DiemTK_10, 10);
      const score4 = scoreParts(grade.DiemTK_4, 4);
      let letter = nullable(grade.DiemTK_Chu);
      let special = score10.special || score4.special;
      if (letter && (letter.toUpperCase() === "VT" || (score10.value == null && score4.value == null && letter.toUpperCase() !== "N/A"))) {
        special ||= letter.slice(0, 16);
        letter = null;
      }
      const notScore = marker(grade.NotScore);
      gradeMap.set(offeringKey, {
        offeringId,
        score10: score10.value,
        score4: score4.value,
        letterCode: letter,
        specialCode: special,
        isPass: marker(grade.IsPass),
        isGather: marker(grade.IsGather),
        notScore,
        notComputeAverageScore: marker(grade.NotComputeAverageScore),
        note: nullable(grade.Note),
        scoreStatus: notScore ? "pending" : special ? "special" : "graded",
        sourcePayload: grade,
        sourceMd5: nullable(grade.MD5),
        gradeImportBatchId: batchId,
      });
      const programCode = clean(grade.StudyProgramID);
      const summaryKey = `${studentId}|${programCode}|${termId}`;
      if (!summaryMap.has(summaryKey)) {
        summaryMap.set(summaryKey, {
          id: crypto.randomUUID(),
          studentId,
          academicTermId: termId,
          creditsEarned: parseNumber(grade.Dat_HK),
          registeredCredits: 0,
          gpa10: parseNumber(grade.TB_HK_10, 0, 10),
          gpa4: parseNumber(grade.TB_HK_4, 0, 4),
          cumulativeCredits: parseNumber(grade.Dat_TL_HK),
          cumulativeGpa10: parseNumber(grade.TB_TL_HK_10, 0, 10),
          cumulativeGpa4: parseNumber(grade.TB_TL_HK_4, 0, 4),
          conductScore: parseNumber(grade.DiemRenLuyenHK),
          classificationName: nullable(grade.TenXepLoai),
          sourcePayload: grade,
          gradeImportBatchId: batchId,
          sProgramCode: programCode,
          _yearCode: item.yearCode,
          _termCode: item.termCode,
        });
      }
    }

    for (const offering of offeringMap.values()) {
      const key = `${offering.studentId}|${clean(offering.sProgramCode)}|${offering.academicTermId}`;
      const summary = summaryMap.get(key);
      if (summary) summary.registeredCredits += offering.sCredits;
    }
    const summaryRows = [...summaryMap.values()];
    await createManyInChunks(tx.studentCourseOffering, [...offeringMap.values()], 250);
    await createManyInChunks(tx.studentCourseGrade, [...gradeMap.values()], 250);
    await createManyInChunks(
      tx.studentTermSummary,
      summaryRows.map(({ _yearCode, _termCode, ...row }) => row),
      400,
    );

    const conductMap = new Map();
    for (const item of source.conductRows) {
      const record = item.record;
      const studentCode = clean(record.StudentID);
      const studentId = studentIdMap.get(studentCode);
      const academicYearId = yearIdMap.get(item.yearCode);
      const academicTermId = termIdMap.get(`${item.yearCode}|${item.termCode}`);
      if (!studentId || !academicYearId || !academicTermId) continue;
      conductMap.set(`${studentId}|${academicTermId}`, {
        id: crypto.randomUUID(),
        studentId,
        academicYearId,
        academicTermId,
        sStudentId: studentCode,
        sClassStudentId: nullable(record.ClassStudentID) || item.classCode,
        orders: parseNumber(record.Orders, -32768, 32767) == null
          ? null
          : Math.trunc(parseNumber(record.Orders, -32768, 32767)),
        studentScore: parseNumber(record.StudentScore),
        classScore: parseNumber(record.ClassScore),
        departmentScore: parseNumber(record.DepartmentScore),
        statusId: nullable(record.StatusID),
        lastScore: parseNumber(record.LastScore),
        sourceUpdateDay: nullable(record.UpdateDay),
        sourceUpdateStaff: nullable(record.UpdateStaff),
        sourcePayload: record,
      });
    }
    await createManyInChunks(tx.studentConductRecord, [...conductMap.values()], 400);
    await tx.$executeRawUnsafe(`
      UPDATE student_term_summaries AS summary
      SET conduct_score = COALESCE(conduct.last_score, conduct.student_score), updated_at = now()
      FROM student_conduct_records AS conduct
      WHERE summary.student_id = conduct.student_id
        AND summary.academic_term_id = conduct.academic_term_id
        AND COALESCE(conduct.last_score, conduct.student_score) IS NOT NULL
    `);

    const latestSummary = new Map();
    for (const row of summaryRows) {
      const key = `${row.studentId}|${row.sProgramCode}`;
      const sortKey = `${row._yearCode}|${row._termCode}`;
      if (!latestSummary.has(key) || sortKey > latestSummary.get(key).sortKey) {
        latestSummary.set(key, { row, sortKey });
      }
    }
    const cumulativeRows = [...latestSummary.values()].map(({ row }) => {
      const cumulativeRegisteredCredits = [...offeringMap.values()]
        .filter((offering) => {
          if (offering.studentId !== row.studentId || clean(offering.sProgramCode) !== row.sProgramCode) return false;
          const term = termRows.find((item) => item.id === offering.academicTermId);
          const year = yearRows.find((item) => item.id === offering.academicYearId);
          return `${year.sYearCode}|${term.sTermCode}` <= `${row._yearCode}|${row._termCode}`;
        })
        .reduce((sum, offering) => sum + offering.sCredits, 0);
      return {
        id: crypto.randomUUID(),
        studentId: row.studentId,
        sProgramCode: row.sProgramCode,
        gradeImportBatchId: batchId,
        cumulativeCredits: row.cumulativeCredits,
        cumulativeGpa10: row.cumulativeGpa10,
        cumulativeGpa4: row.cumulativeGpa4,
        sourceTermSummaryId: row.id,
        sourceAcademicYearId: yearIdMap.get(row._yearCode),
        sourceAcademicTermId: row.academicTermId,
        cumulativeRegisteredCredits,
      };
    });
    await createManyInChunks(tx.studentCumulativeSummary, cumulativeRows, 400);
    await tx.gradeImportBatch.update({
      where: { id: batchId },
      data: {
        status: "completed",
        importedRows: offeringMap.size + unscopedGradeRows.length,
        completedAt: new Date(),
      },
    });

    const decisionTypes = new Map();
    for (const item of source.decisions) {
      const id = parseInteger(item.DecisionTypeID);
      if (id > 0 && !decisionTypes.has(id)) {
        decisionTypes.set(id, { decisionTypeId: id, decisionName: clean(item.DecisionName) || `Loại quyết định ${id}` });
      }
    }
    if (decisionTypes.size) await tx.decisionType.createMany({ data: [...decisionTypes.values()] });
    const decisionRows = [];
    const decisionKeys = new Set();
    for (const item of source.decisions) {
      const studentCode = clean(item.StudentID);
      const studentId = studentIdMap.get(studentCode);
      const yearCode = clean(item.YearStudy);
      let termCode;
      try { termCode = normalizeTerm(item.TermID); } catch { continue; }
      const academicTermId = termIdMap.get(`${yearCode}|${termCode}`);
      const decisionTypeId = parseInteger(item.DecisionTypeID);
      const number = clean(item.DecisionNumber);
      const key = `${studentId}|${decisionTypeId}|${number}`;
      if (!studentId || !academicTermId || !decisionTypes.has(decisionTypeId) || decisionKeys.has(key)) continue;
      decisionKeys.add(key);
      const searchable = `${clean(item.DecisionName)} ${clean(item.Reason)}`;
      decisionRows.push({
        id: crypto.randomUUID(),
        studentId,
        academicYearId: yearIdMap.get(yearCode),
        academicTermId,
        decisionTypeId,
        sStudentId: studentCode,
        sYearStudy: yearCode,
        sTermId: termCode,
        sDecisionNumber: number,
        sDecisionAlias: clean(item.DecisionAlias),
        sSignStaff: clean(item.SignStaff),
        sSignDate: parseDate(item.SignDate),
        sDecisionName: clean(item.DecisionName),
        sReason: clean(item.Reason),
        sFullText: clean(item.FullText),
        sUpdateStaff: nullable(item.UpdateStaff),
        sUpdateDate: parseDate(item.UpdateDate),
        sourcePayload: item,
        isAcademicWarning: /cảnh báo|buộc thôi học|đình chỉ học/i.test(searchable),
      });
    }
    await createManyInChunks(tx.studentDecision, decisionRows, 400);

    const feeTypes = new Map();
    for (const item of source.feePolicies) {
      const id = clean(item.FeeObjectDicID);
      if (id && !feeTypes.has(id)) feeTypes.set(id, { feeObjectDicId: id, feeObjectDicName: clean(item.FeeObjectDicName) || id });
    }
    if (feeTypes.size) await tx.feePolicyType.createMany({ data: [...feeTypes.values()] });
    const feeRows = [];
    const usedFeeObjectIds = new Set();
    for (let feeIndex = 0; feeIndex < source.feePolicies.length; feeIndex += 1) {
      const item = source.feePolicies[feeIndex];
      const studentCode = clean(item.StudentID);
      const studentId = studentIdMap.get(studentCode);
      const yearCode = clean(item.YearStudy);
      let termCode;
      try { termCode = normalizeTerm(item.TermID); } catch { continue; }
      const academicTermId = termIdMap.get(`${yearCode}|${termCode}`);
      const typeId = clean(item.FeeObjectDicID);
      if (!studentId || !academicTermId || !feeTypes.has(typeId)) continue;
      const coefficient = clean(item.Coefficient);
      let feeObjectId = BigInt(clean(item.FeeObjectID) || 0);
      while (usedFeeObjectIds.has(feeObjectId.toString())) feeObjectId += 1n;
      usedFeeObjectIds.add(feeObjectId.toString());
      feeRows.push({
        id: crypto.randomUUID(),
        studentId,
        academicYearId: yearIdMap.get(yearCode),
        academicTermId,
        feeObjectDicId: typeId,
        sStudentId: studentCode,
        // Some source rows reuse FeeObjectID across students. The original value
        // remains in sourcePayload; this internal key must satisfy the DB's unique index.
        sFeeObjectId: feeObjectId,
        sYearStudy: yearCode,
        sTermId: termCode,
        sFeeObjectDicName: clean(item.FeeObjectDicName) || typeId,
        sCoefficient: coefficient,
        coefficientPercent: parseNumber(coefficient.replace("%", ""), 0, 100) ?? 0,
        sDecisionNumber: clean(item.DecisionNumber),
        sourcePayload: item,
      });
    }
    await createManyInChunks(tx.studentFeePolicy, feeRows, 400);
  }, { maxWait: 30_000, timeout: 600_000 });
}

async function supplementMonitoringData(prisma, source) {
  console.log("Supplementing unscoped grades and official conduct data without replacing existing records.");
  await prisma.$transaction(async (tx) => {
    const students = await tx.student.findMany({
      where: { deletedAt: null },
      select: { id: true, sStudentId: true },
    });
    const studentIdMap = new Map(students.map((student) => [student.sStudentId, student.id]));
    const years = await tx.academicYear.findMany({
      where: { deletedAt: null },
      select: { id: true, sYearCode: true },
    });
    const yearIdMap = new Map(years.map((year) => [year.sYearCode, year.id]));
    const terms = await tx.academicTerm.findMany({
      where: { deletedAt: null },
      select: { id: true, academicYearId: true, sTermCode: true },
    });
    const yearCodeById = new Map(years.map((year) => [year.id, year.sYearCode]));
    const termIdMap = new Map(terms.map((term) => [
      `${yearCodeById.get(term.academicYearId)}|${term.sTermCode}`,
      term.id,
    ]));
    const latestBatch = await tx.gradeImportBatch.findFirst({
      where: { status: "completed" },
      orderBy: { completedAt: "desc" },
      select: { id: true },
    });

    const unscopedRows = source.unscopedGradeRows.map((item) => {
      const grade = item.grade;
      const studentCode = clean(grade.StudentID) || item.studentId;
      const studentId = studentIdMap.get(studentCode);
      if (!studentId) throw new Error(`Cannot resolve unscoped grade student ${studentCode}`);
      const credits = parseNumber(grade.Credits, 0, 32767);
      return {
        id: deterministicUuid(`unscoped|${studentCode}|${item.reason}|${JSON.stringify(grade)}`),
        studentId,
        sStudentId: studentCode,
        sCourseCode: nullable(grade.CurriculumID),
        sCourseName: nullable(grade.CurriculumNamePrint) || nullable(grade.CurriculumName),
        sCredits: credits == null ? null : Math.trunc(credits),
        reason: item.reason,
        sourcePayload: grade,
        sourceMd5: nullable(grade.MD5),
        gradeImportBatchId: latestBatch?.id || null,
      };
    });
    for (let index = 0; index < unscopedRows.length; index += 400) {
      await tx.unscopedGradeRecord.createMany({
        data: unscopedRows.slice(index, index + 400),
        skipDuplicates: true,
      });
    }

    const conductMap = new Map();
    for (const item of source.conductRows) {
      const record = item.record;
      const studentCode = clean(record.StudentID);
      const studentId = studentIdMap.get(studentCode);
      const academicYearId = yearIdMap.get(item.yearCode);
      const academicTermId = termIdMap.get(`${item.yearCode}|${item.termCode}`);
      if (!studentId || !academicYearId || !academicTermId) continue;
      const order = parseNumber(record.Orders, -32768, 32767);
      conductMap.set(`${studentId}|${academicTermId}`, {
        id: deterministicUuid(`conduct|${studentId}|${academicTermId}`),
        studentId,
        academicYearId,
        academicTermId,
        sStudentId: studentCode,
        sClassStudentId: nullable(record.ClassStudentID) || item.classCode,
        orders: order == null ? null : Math.trunc(order),
        studentScore: parseNumber(record.StudentScore),
        classScore: parseNumber(record.ClassScore),
        departmentScore: parseNumber(record.DepartmentScore),
        statusId: nullable(record.StatusID),
        lastScore: parseNumber(record.LastScore),
        sourceUpdateDay: nullable(record.UpdateDay),
        sourceUpdateStaff: nullable(record.UpdateStaff),
        sourcePayload: record,
      });
    }
    for (let index = 0; index < conductMap.size; index += 400) {
      await tx.studentConductRecord.createMany({
        data: [...conductMap.values()].slice(index, index + 400),
        skipDuplicates: true,
      });
    }
    await tx.$executeRawUnsafe(`
      UPDATE student_term_summaries AS summary
      SET conduct_score = COALESCE(conduct.last_score, conduct.student_score), updated_at = now()
      FROM student_conduct_records AS conduct
      WHERE summary.student_id = conduct.student_id
        AND summary.academic_term_id = conduct.academic_term_id
        AND COALESCE(conduct.last_score, conduct.student_score) IS NOT NULL
    `);
  }, { maxWait: 30_000, timeout: 180_000 });
}

async function verify(prisma) {
  const counts = {};
  for (const model of [
    "cohort",
    "class",
    "student",
    "trainingProgram",
    "course",
    "trainingProgramCourse",
    "trainingProgressPlan",
    "trainingProgressPlanCourse",
    "academicYear",
    "academicTerm",
    "studentCourseOffering",
    "studentCourseGrade",
    "unscopedGradeRecord",
    "studentTermSummary",
    "studentConductRecord",
    "studentCumulativeSummary",
    "decisionType",
    "studentDecision",
    "feePolicyType",
    "studentFeePolicy",
  ]) {
    counts[model] = await prisma[model].count();
  }
  return counts;
}

async function main() {
  loadDatabaseUrl();
  const source = await fetchSourceData();
  const sourceSummary = {
    classes: source.classResults.length,
    students: source.students.length,
    programs: source.programCodes.length,
    curriculumRows: source.curricula.length,
    gradeRows: source.gradeRows.length,
    unscopedGradeRows: source.unscopedGradeRows.length,
    conductRows: source.conductRows.length,
    decisions: source.decisions.length,
    feePolicies: source.feePolicies.length,
  };
  console.log("Source validated:", JSON.stringify(sourceSummary));
  const shouldApply = process.argv.includes("--apply");
  const shouldSupplement = process.argv.includes("--supplement");
  if (!shouldApply && !shouldSupplement) {
    console.log("Fetch-only mode complete. Pass --supplement to add monitoring data or --apply to replace business data.");
    return;
  }
  const prisma = new PrismaClient();
  try {
    const identity = await prisma.$queryRawUnsafe(
      "SELECT current_database() AS database, inet_server_addr()::text AS host, inet_server_port() AS port",
    );
    console.log("Database target:", JSON.stringify(identity[0]));
    if (shouldSupplement) {
      await supplementMonitoringData(prisma, source);
    } else {
      await replaceBusinessData(prisma, source);
    }
    console.log("Database counts:", JSON.stringify(await verify(prisma)));
  } finally {
    await prisma.$disconnect();
  }
}

if (require.main === module) {
  main().catch((error) => {
    console.error(error?.stack || error);
    process.exitCode = 1;
  });
}

module.exports = { deduplicateCurricula };
