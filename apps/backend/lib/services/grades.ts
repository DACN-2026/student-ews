import { prisma } from "@/lib/prisma";
import { studentIdWhere } from "@/lib/utils/is-uuid";
import crypto from "crypto";
import { Prisma } from "@prisma/client";
import { ApiError } from "@/lib/utils/api-error";
import { buildAcademicTermLinks, isConfiguredSummerTermCode } from "@/lib/academic-terms";

// ============================================================================
// Types — matches SWE model.go SourceYear/SourceTerm/SourceGrade
// ============================================================================

export interface SourceGrade {
  StudentID: string;
  StudyProgramID: string;
  YearStudy?: string;
  TermID?: string;
  CurriculumID: string;
  StudyUnitID: string;
  ScheduleStudyUnitID?: string;
  CurriculumName?: string;
  CurriculumNamePrint?: string;
  EnglishCurriculumName?: string;
  Credits: string;
  CurriculumGroupID?: string;
  DiemTK_10?: string;
  DiemTK_4?: string;
  DiemTK_Chu?: string;
  IsPass?: string;
  IsGather?: string;
  NotScore?: string;
  Note?: string;
  NotComputeAverageScore?: boolean;
  Dat_HK?: string;
  TB_HK_10?: string;
  TB_HK_4?: string;
  Dat_TL_HK?: string;
  TB_TL_HK_10?: string;
  TB_TL_HK_4?: string;
  DiemRenLuyenHK?: string;
  TenXepLoai?: string;
  MD5?: string;
  [key: string]: unknown;
}

interface SourceTerm {
  HocKy: string;
  DanhSachDiemHK: SourceGrade[];
}

interface SourceYear {
  NamHoc: string;
  DanhSachDiem: SourceTerm[];
}

class GradeRowImportError extends Error {
  constructor(
    readonly rowNumber: number,
    readonly studentId: string,
    readonly payload: string,
    cause: unknown,
  ) {
    super(cause instanceof Error ? cause.message : "Grade import failed", { cause });
    this.name = "GradeRowImportError";
  }
}

// ============================================================================
// Helpers — ported from SWE grades/service.go
// ============================================================================

export function parseDecimal(
  s: string | undefined | null,
  min: number,
  max: number,
  field = "numeric value",
): number | null {
  if (!s || s.trim() === "") return null;
  const v = Number(s.trim());
  if (!Number.isFinite(v) || v < min || v > max) {
    throw new ApiError(`Invalid ${field}: ${s}`, "INVALID_REQUEST", 400);
  }
  return v;
}

export function parseScore10(s: string | undefined | null): { value: number | null; special: string } {
  if (!s || s.trim() === "") return { value: null, special: "" };
  const trimmed = s.trim().toUpperCase();
  if (trimmed === "VT") return { value: null, special: "VT" };
  const v = Number(trimmed);
  if (!Number.isFinite(v) || v < 0 || v > 10) {
    throw new ApiError(`Invalid score_10: ${s}`, "INVALID_REQUEST", 400);
  }
  return { value: v, special: "" };
}

export function parseScore4(s: string | undefined | null): { value: number | null; special: string } {
  if (!s || s.trim() === "") return { value: null, special: "" };
  const trimmed = s.trim().toUpperCase();
  if (trimmed === "VT") return { value: null, special: "VT" };
  const v = Number(trimmed);
  if (!Number.isFinite(v) || v < 0 || v > 4) {
    throw new ApiError(`Invalid score_4: ${s}`, "INVALID_REQUEST", 400);
  }
  return { value: v, special: "" };
}

export function parseCredits(s: string | undefined | null): number {
  if (!s || s.trim() === "") {
    throw new ApiError("Credits are required", "INVALID_REQUEST", 400);
  }
  const v = Number(s.trim());
  if (!Number.isInteger(v) || v < 0 || v > 32767) {
    throw new ApiError(`Invalid credits: ${s}`, "INVALID_REQUEST", 400);
  }
  return v;
}

function isMarker(s: string | undefined | null): boolean {
  if (!s) return false;
  const t = s.trim().toLowerCase();
  return t === "x" || t === "1" || t === "true";
}

function normalizeTerm(s: string): string { return s.trim().toUpperCase(); }

function validYear(s: string): boolean {
  const parts = s.trim().split("-");
  if (parts.length !== 2 || parts[0].length !== 4 || parts[1].length !== 4) return false;
  const a = parseInt(parts[0], 10);
  const b = parseInt(parts[1], 10);
  return !isNaN(a) && !isNaN(b) && b === a + 1;
}

export function gradeImportRowKey(year: string, term: string, grade: SourceGrade) {
  return [
    grade.StudentID.trim(),
    (grade.StudyProgramID || "").trim(),
    year.trim(),
    normalizeTerm(term),
    grade.StudyUnitID.trim(),
    (grade.ScheduleStudyUnitID || "").trim(),
  ].join("|");
}

// ============================================================================
// Service
// ============================================================================

export class GradesService {

  // ===================== List (existing — keep as-is, mostly correct) =====================

  static async list(
    studentId: string,
    filters: { academicYear?: string; termCode?: string; courseCode?: string } = {},
  ) {
    const student = await prisma.student.findFirst({
      where: { ...studentIdWhere(studentId), deletedAt: null },
    });
    if (!student) return [];

    const offerings = await prisma.studentCourseOffering.findMany({
      where: { studentId: student.id },
      orderBy: { createdAt: "desc" },
    });
    if (offerings.length === 0) return [];

    const offeringIds = offerings.map((o) => o.id);
    const [grades, terms, years] = await Promise.all([
      prisma.studentCourseGrade.findMany({ where: { offeringId: { in: offeringIds } } }),
      prisma.academicTerm.findMany({ where: { deletedAt: null } }),
      prisma.academicYear.findMany({ where: { deletedAt: null } }),
    ]);

    const gradeMap = Object.fromEntries(grades.map((g) => [g.offeringId, g]));
    const termMap = Object.fromEntries(terms.map((t) => [t.id, t]));
    const yearMap = Object.fromEntries(years.map((y) => [y.id, y]));
    const termLinks = buildAcademicTermLinks(terms.map((term) => ({
      id: term.id,
      academicYearId: term.academicYearId,
      academicYearCode: yearMap[term.academicYearId]?.sYearCode || "",
      termOrder: term.sTermOrder,
      isSummer: term.sIsSummer,
      startDate: term.startDate,
      endDate: term.endDate,
    })));

    return offerings
      .map((o) => {
        const grade = gradeMap[o.id];
        const term = termMap[o.academicTermId];
        const year = yearMap[o.academicYearId];
        const previousMainTerm = term
          ? termMap[termLinks.get(term.id)?.previousMainTermId || ""]
          : null;
        return {
          id: o.id,
          studentId: o.sStudentId,
          courseCode: o.sCurriculumId,
          courseName: o.sCourseName,
          credits: o.sCredits,
          academicYear: year?.sYearCode,
          termCode: term?.sTermCode,
          isSummer: Boolean(term?.sIsSummer),
          previousMainTermId: term ? termLinks.get(term.id)?.previousMainTermId || null : null,
          nextMainTermId: term ? termLinks.get(term.id)?.nextMainTermId || null : null,
          rankingMainTerm: previousMainTerm ? {
            id: previousMainTerm.id,
            termCode: previousMainTerm.sTermCode,
            termName: previousMainTerm.sTermName,
            academicYear: yearMap[previousMainTerm.academicYearId]?.sYearCode || null,
          } : null,
          programCode: o.sProgramCode,
          courseGroup: o.sCourseGroup,
          score10: grade?.score10 != null ? Number(grade.score10) : null,
          score4: grade?.score4 != null ? Number(grade.score4) : null,
          letterGrade: grade?.letterCode || null,
          specialCode: grade?.specialCode || null,
          isPassed: grade?.isPass ?? false,
          isGather: grade?.isGather ?? false,
          notScore: grade?.notScore ?? false,
          scoreStatus: grade?.scoreStatus || "graded",
          createdAt: o.createdAt,
        };
      })
      .filter((item) => {
        if (filters.academicYear && item.academicYear !== filters.academicYear) return false;
        if (filters.termCode && item.termCode !== filters.termCode) return false;
        if (filters.courseCode && item.courseCode !== filters.courseCode) return false;
        return true;
      });
  }

  // ===================== Summaries (existing — correct) =====================

  static async summaries(studentId: string) {
    const student = await prisma.student.findFirst({
      where: { ...studentIdWhere(studentId), deletedAt: null },
    });
    if (!student) return { terms: [], cumulative: null, conductRecords: [], unscopedGrades: [] };

    const [termSummaries, cumulativeSummary, conductRecords, unscopedGrades] = await Promise.all([
      prisma.studentTermSummary.findMany({
        where: { studentId: student.id },
        orderBy: { createdAt: "asc" },
      }),
      prisma.studentCumulativeSummary.findFirst({
        where: { studentId: student.id },
      }),
      prisma.studentConductRecord.findMany({
        where: { studentId: student.id },
        orderBy: { createdAt: "asc" },
      }),
      prisma.unscopedGradeRecord.findMany({
        where: { studentId: student.id },
        orderBy: { createdAt: "asc" },
      }),
    ]);

    const terms = await prisma.academicTerm.findMany({ where: { deletedAt: null } });
    const termMap = Object.fromEntries(terms.map((t) => [t.id, t]));
    const yearIds = [...new Set(terms.map((term) => term.academicYearId))];
    const years = await prisma.academicYear.findMany({ where: { id: { in: yearIds } } });
    const yearMap = Object.fromEntries(years.map((year) => [year.id, year]));
    const termLinks = buildAcademicTermLinks(terms.map((term) => ({
      id: term.id,
      academicYearId: term.academicYearId,
      academicYearCode: yearMap[term.academicYearId]?.sYearCode || "",
      termOrder: term.sTermOrder,
      isSummer: term.sIsSummer,
      startDate: term.startDate,
      endDate: term.endDate,
    })));

    const mappedTerms = termSummaries.map((t) => ({
      id: t.id,
      termCode: termMap[t.academicTermId]?.sTermCode,
      termName: termMap[t.academicTermId]?.sTermName,
      academicYear: yearMap[termMap[t.academicTermId]?.academicYearId]?.sYearCode,
      isSummer: Boolean(termMap[t.academicTermId]?.sIsSummer),
      previousMainTermId: termLinks.get(t.academicTermId)?.previousMainTermId || null,
      nextMainTermId: termLinks.get(t.academicTermId)?.nextMainTermId || null,
      programCode: t.sProgramCode,
      registeredCredits: Number(t.registeredCredits),
      creditsEarned: t.creditsEarned != null ? Number(t.creditsEarned) : null,
      gpa10: t.gpa10 != null ? Number(t.gpa10) : null,
      gpa4: t.gpa4 != null ? Number(t.gpa4) : null,
      cumulativeGpa10: t.cumulativeGpa10 != null ? Number(t.cumulativeGpa10) : null,
      cumulativeGpa4: t.cumulativeGpa4 != null ? Number(t.cumulativeGpa4) : null,
      conductScore: t.conductScore != null ? Number(t.conductScore) : null,
      classificationName: t.classificationName,
    }));
    mappedTerms.sort((left, right) =>
      `${left.academicYear || ""}|${left.termCode || ""}`.localeCompare(
        `${right.academicYear || ""}|${right.termCode || ""}`,
      ),
    );

    const cumulative = cumulativeSummary
      ? {
          cumulativeCredits: cumulativeSummary.cumulativeCredits != null ? Number(cumulativeSummary.cumulativeCredits) : null,
          cumulativeRegisteredCredits: Number(cumulativeSummary.cumulativeRegisteredCredits),
          cumulativeGpa10: cumulativeSummary.cumulativeGpa10 != null ? Number(cumulativeSummary.cumulativeGpa10) : null,
          cumulativeGpa4: cumulativeSummary.cumulativeGpa4 != null ? Number(cumulativeSummary.cumulativeGpa4) : null,
          refreshedAt: cumulativeSummary.refreshedAt,
        }
      : null;

    const mappedConductRecords = conductRecords.map((record) => {
      const term = termMap[record.academicTermId];
      return {
        id: record.id,
        academicYear: yearMap[term?.academicYearId]?.sYearCode,
        termCode: term?.sTermCode,
        isSummer: Boolean(term?.sIsSummer),
        evaluationTermId: term?.sIsSummer ? termLinks.get(term.id)?.nextMainTermId || null : term?.id || null,
        classStudentId: record.sClassStudentId,
        studentScore: record.studentScore != null ? Number(record.studentScore) : null,
        classScore: record.classScore != null ? Number(record.classScore) : null,
        departmentScore: record.departmentScore != null ? Number(record.departmentScore) : null,
        finalScore: record.lastScore != null
          ? Number(record.lastScore)
          : record.studentScore != null
            ? Number(record.studentScore)
            : null,
        statusId: record.statusId,
        updateDay: record.sourceUpdateDay,
        updateStaff: record.sourceUpdateStaff,
      };
    });
    mappedConductRecords.sort((left, right) =>
      `${left.academicYear || ""}|${left.termCode || ""}`.localeCompare(
        `${right.academicYear || ""}|${right.termCode || ""}`,
      ),
    );

    const mappedUnscopedGrades = unscopedGrades.map((grade) => ({
      id: grade.id,
      courseCode: grade.sCourseCode,
      courseName: grade.sCourseName,
      credits: grade.sCredits,
      reason: grade.reason,
      createdAt: grade.createdAt,
    }));

    return {
      terms: mappedTerms,
      cumulative,
      conductRecords: mappedConductRecords,
      unscopedGrades: mappedUnscopedGrades,
    };
  }

  // ===================== Export =====================

  static async exportGrades(studentId: string) {
    return this.list(studentId);
  }

  // ===================== REAL Import Engine (ported from SWE grades/service.go) =====================

  static async importGrades(
    input: SourceYear[],
    idempotencyKey?: string,
    studentScope: Prisma.StudentWhereInput = {},
  ) {
    // Validate and flatten
    const uniqueRows = new Map<string, { year: string; term: string; grade: SourceGrade; payload: string; row: number }>();
    for (const y of input) {
      if (!validYear(y.NamHoc)) throw new ApiError(`Invalid year format: ${y.NamHoc}`, "INVALID_REQUEST", 400);
      for (const t of (y.DanhSachDiem || [])) {
        const term = normalizeTerm(t.HocKy);
        if (term !== "HK01" && term !== "HK02" && term !== "HK03") {
          throw new ApiError(`Invalid term code: ${t.HocKy}`, "INVALID_REQUEST", 400);
        }
        for (const g of (t.DanhSachDiemHK || [])) {
          if (!g.StudentID?.trim() || !g.CurriculumID?.trim() || !g.StudyUnitID?.trim()) {
            throw new ApiError("StudentID, CurriculumID, and StudyUnitID are required", "INVALID_REQUEST", 400);
          }
          const key = gradeImportRowKey(y.NamHoc, term, g);
          uniqueRows.set(key, { year: y.NamHoc, term, grade: g, payload: JSON.stringify(g), row: uniqueRows.size });
        }
      }
    }
    const rows = [...uniqueRows.values()];

    // Create hash
    const hash = crypto.createHash("sha256").update(JSON.stringify(input)).digest("hex");

    const batchState = await prisma.$transaction(async (tx) => {
      if (idempotencyKey) {
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`grade-import:${idempotencyKey}`}))`;
        const existing = await tx.gradeImportBatch.findFirst({ where: { idempotencyKey } });
        if (existing) {
          if (existing.sourceHash !== hash) throw new ApiError("Idempotency key was used with another payload", "IDEMPOTENCY_CONFLICT", 409);
          if (existing.status === "completed") {
            return { cached: { batchId: existing.id, total: existing.totalRows, imported: existing.importedRows } };
          }
          if (existing.status === "running") throw new ApiError("An import with this idempotency key is running", "IMPORT_IN_PROGRESS", 409);
          await tx.gradeImportBatch.update({ where: { id: existing.id }, data: { idempotencyKey: null } });
        }
      }
      return {
        batch: await tx.gradeImportBatch.create({
          data: {
            sourceHash: hash,
            idempotencyKey: idempotencyKey || null,
            status: "running",
            totalRows: rows.length,
          },
        }),
      };
    });
    if ("cached" in batchState) return batchState.cached;
    const batch = batchState.batch;

    try {
      const studentCodes = [...new Set(rows.map((row) => row.grade.StudentID.trim()))];
      const students = await prisma.student.findMany({
        where: { AND: [{ sStudentId: { in: studentCodes }, deletedAt: null }, studentScope] },
        select: { id: true, sStudentId: true },
      });
      const studentByCode = new Map(students.map((student) => [student.sStudentId, student]));
      const inaccessible = studentCodes.filter((code) => !studentByCode.has(code));
      if (inaccessible.length) {
        throw new ApiError(`Students not found or outside data scope: ${inaccessible.slice(0, 10).join(", ")}`, "NOT_FOUND", 404);
      }

      await prisma.$transaction(async (tx) => {
        const yearIds = new Map<string, string>();
        for (const yearCode of [...new Set(rows.map((row) => row.year))]) {
          const result: Array<{ id: string }> = await tx.$queryRaw`
          INSERT INTO academic_years (s_year_code) VALUES (${yearCode})
          ON CONFLICT (s_year_code) DO UPDATE SET deleted_at = NULL, updated_at = now()
          RETURNING id::text
        `;
          yearIds.set(yearCode, result[0].id);
        }

        const termIds = new Map<string, string>();
        for (const key of [...new Set(rows.map((row) => `${row.year}|${row.term}`))]) {
          const [yearCode, termCode] = key.split("|");
          const yearId = yearIds.get(yearCode)!;
          const parsedOrder = Number(termCode.match(/(\d+)$/)?.[1]);
          const termOrder = Number.isInteger(parsedOrder) && parsedOrder > 0 ? parsedOrder : 1;
          const isSummer = isConfiguredSummerTermCode(termCode);
          const termName = isSummer ? "Học kỳ hè" : `Học kỳ ${termOrder}`;
          const result: Array<{ id: string }> = await tx.$queryRaw`
          INSERT INTO academic_terms (academic_year_id, s_term_code, s_term_name, s_term_order, s_is_summer)
          VALUES (${yearId}::uuid, ${termCode}, ${termName}, ${termOrder}::smallint, ${isSummer})
          ON CONFLICT (academic_year_id, s_term_code) DO UPDATE SET deleted_at = NULL, updated_at = now()
          RETURNING id::text
        `;
          termIds.set(key, result[0].id);
        }

        const courseRows = new Map<string, string>();
        for (const row of rows) {
          const code = row.grade.CurriculumID.trim();
          const name = (row.grade.CurriculumNamePrint || row.grade.CurriculumName || "").trim();
          if (!name) throw new ApiError(`Course name is required for ${code}`, "INVALID_REQUEST", 400);
          courseRows.set(code, name);
        }
        const courseByCode = new Map<string, string>();
        for (const [courseCode, courseName] of courseRows) {
          const result: Array<{ id: string }> = await tx.$queryRaw`
          INSERT INTO courses (s_course_code, s_course_name) VALUES (${courseCode}, ${courseName})
          ON CONFLICT (s_course_code) DO UPDATE SET
            s_course_name = EXCLUDED.s_course_name, deleted_at = NULL, updated_at = now()
          RETURNING id::text
        `;
          courseByCode.set(courseCode, result[0].id);
        }

        for (const [index, row] of rows.entries()) {
          try {
            await this.importRow(
              tx,
              batch.id,
              row.grade,
              row.payload,
              studentByCode.get(row.grade.StudentID.trim())!,
              yearIds.get(row.year)!,
              termIds.get(`${row.year}|${row.term}`)!,
              courseByCode.get(row.grade.CurriculumID.trim())!,
            );
          } catch (error) {
            throw new GradeRowImportError(index + 1, row.grade.StudentID.trim(), row.payload, error);
          }
        }

        await this.refreshImportedScopes(tx, batch.id, rows);

        await tx.gradeImportBatch.update({
          where: { id: batch.id },
          data: { status: "completed", importedRows: rows.length, completedAt: new Date() },
        });
        await tx.auditLog.create({
          data: {
            action: "import_completed",
            resourceType: "grade_import_batch",
            resourceId: batch.id,
            details: { total: rows.length, imported: rows.length },
          },
        });
      }, { maxWait: 10_000, timeout: 120_000 });

      return { batchId: batch.id, total: rows.length, imported: rows.length };
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : "Grade import failed";
      await prisma.$transaction(async (tx) => {
        if (e instanceof GradeRowImportError) {
          await tx.gradeImportError.create({
            data: {
              gradeImportBatchId: batch.id,
              rowNumber: e.rowNumber,
              studentId: e.studentId || null,
              message: message.slice(0, 2000),
              payload: JSON.parse(e.payload) as Prisma.InputJsonValue,
            },
          });
        }
        await tx.gradeImportBatch.update({
          where: { id: batch.id },
          data: { status: "failed", errorMessage: message.slice(0, 2000), completedAt: new Date() },
        });
        await tx.auditLog.create({
          data: {
            action: "import_failed",
            resourceType: "grade_import_batch",
            resourceId: batch.id,
            details: {
              ...(e instanceof GradeRowImportError
                ? { row: e.rowNumber, studentId: e.studentId }
                : {}),
              message: message.slice(0, 1000),
            },
          },
        });
      });
      throw e;
    }
  }

  // ===================== Import Single Row (ported from SWE importRow()) =====================

  private static async importRow(
    tx: Prisma.TransactionClient,
    batchId: string,
    g: SourceGrade,
    payload: string,
    student: { id: string; sStudentId: string },
    yearId: string,
    termId: string,
    courseId: string,
  ) {
    const courseName = (g.CurriculumNamePrint || g.CurriculumName || "").trim();

    const credits = parseCredits(g.Credits);
    const programCode = (g.StudyProgramID || "").trim();
    const studyUnitId = g.StudyUnitID.trim();
    const scheduleStudyUnitId = (g.ScheduleStudyUnitID || "").trim();
    const courseNameEng = (g.EnglishCurriculumName || "").trim();
    const courseGroup = (g.CurriculumGroupID || "").trim().toUpperCase();

    // Upsert offering
    const offeringResult: Array<{ id: string }> = await tx.$queryRaw`
      INSERT INTO student_course_offerings (student_id, academic_year_id, academic_term_id, course_id,
        s_student_id, s_program_code, s_curriculum_id, s_study_unit_id, s_schedule_study_unit_id,
        s_course_name, s_course_name_eng, s_course_group, s_credits, source_payload, source_md5, grade_import_batch_id)
      VALUES (${student.id}::uuid, ${yearId}::uuid, ${termId}::uuid, ${courseId}::uuid,
        ${g.StudentID.trim()}, NULLIF(${programCode},''), ${g.CurriculumID.trim()}, ${studyUnitId}, ${scheduleStudyUnitId},
        ${courseName}, NULLIF(${courseNameEng},''), NULLIF(${courseGroup},''), ${credits}::smallint,
        ${payload}::jsonb, NULLIF(${(g.MD5 || "").trim()},''), ${batchId}::uuid)
      ON CONFLICT (student_id, academic_term_id, s_study_unit_id, s_schedule_study_unit_id) DO UPDATE SET
        course_id = EXCLUDED.course_id, s_program_code = EXCLUDED.s_program_code, s_curriculum_id = EXCLUDED.s_curriculum_id,
        s_course_name = EXCLUDED.s_course_name, s_course_name_eng = EXCLUDED.s_course_name_eng,
        s_course_group = EXCLUDED.s_course_group, s_credits = EXCLUDED.s_credits,
        source_payload = EXCLUDED.source_payload, source_md5 = EXCLUDED.source_md5,
        grade_import_batch_id = EXCLUDED.grade_import_batch_id, updated_at = now()
      RETURNING id::text
    `;
    const offeringId = offeringResult[0].id;

    // Parse scores
    const s10 = parseScore10(g.DiemTK_10);
    const s4 = parseScore4(g.DiemTK_4);
    let letter = (g.DiemTK_Chu || "").trim();
    let special = s10.special || s4.special;
    if (letter === "VT" || (s10.value == null && s4.value == null && letter !== "" && letter.toUpperCase() !== "N/A")) {
      special = letter;
      letter = "";
    }

    let scoreStatus = "graded";
    if (isMarker(g.NotScore)) {
      scoreStatus = "pending";
    } else if (special) {
      scoreStatus = "special";
    }

    // Upsert grade
    await tx.$executeRaw`
      INSERT INTO student_course_grades (offering_id, score_10, score_4, letter_code, special_code,
        is_pass, is_gather, not_score, not_compute_average_score, note, score_status,
        source_payload, source_md5, grade_import_batch_id)
      VALUES (${offeringId}::uuid, ${s10.value}::decimal, ${s4.value}::decimal,
        NULLIF(${letter},''), NULLIF(${special},''),
        ${isMarker(g.IsPass)}, ${isMarker(g.IsGather)}, ${isMarker(g.NotScore)}, ${g.NotComputeAverageScore ?? false},
        NULLIF(${(g.Note || "").trim()},''), ${scoreStatus},
        ${payload}::jsonb, NULLIF(${(g.MD5 || "").trim()},''), ${batchId}::uuid)
      ON CONFLICT (offering_id) DO UPDATE SET
        score_10 = EXCLUDED.score_10, score_4 = EXCLUDED.score_4, letter_code = EXCLUDED.letter_code,
        special_code = EXCLUDED.special_code, is_pass = EXCLUDED.is_pass, is_gather = EXCLUDED.is_gather,
        not_score = EXCLUDED.not_score, not_compute_average_score = EXCLUDED.not_compute_average_score,
        note = EXCLUDED.note, score_status = EXCLUDED.score_status, source_payload = EXCLUDED.source_payload,
        source_md5 = EXCLUDED.source_md5, grade_import_batch_id = EXCLUDED.grade_import_batch_id, updated_at = now()
    `;

    // Upsert term summary
    const creditsEarned = parseDecimal(g.Dat_HK, -1e9, 1e9, "credits_earned");
    const gpa10 = parseDecimal(g.TB_HK_10, 0, 10, "gpa_10");
    const gpa4 = parseDecimal(g.TB_HK_4, 0, 4, "gpa_4");
    const cumCredits = parseDecimal(g.Dat_TL_HK, -1e9, 1e9, "cumulative_credits");
    const cumGpa10 = parseDecimal(g.TB_TL_HK_10, 0, 10, "cumulative_gpa_10");
    const cumGpa4 = parseDecimal(g.TB_TL_HK_4, 0, 4, "cumulative_gpa_4");
    const conductScore = parseDecimal(g.DiemRenLuyenHK, -1e9, 1e9, "conduct_score");
    const classification = (g.TenXepLoai || "").trim();

    await tx.$executeRaw`
      INSERT INTO student_term_summaries (student_id, s_program_code, academic_term_id,
        credits_earned, registered_credits, gpa_10, gpa_4, cumulative_credits,
        cumulative_gpa_10, cumulative_gpa_4, conduct_score, classification_name,
        source_payload, grade_import_batch_id)
      VALUES (${student.id}::uuid, ${programCode}, ${termId}::uuid,
        ${creditsEarned}::decimal, 0::decimal, ${gpa10}::decimal, ${gpa4}::decimal, ${cumCredits}::decimal,
        ${cumGpa10}::decimal, ${cumGpa4}::decimal, ${conductScore}::decimal, NULLIF(${classification},''),
        ${payload}::jsonb, ${batchId}::uuid)
      ON CONFLICT (student_id, s_program_code, academic_term_id) DO UPDATE SET
        credits_earned = EXCLUDED.credits_earned, gpa_10 = EXCLUDED.gpa_10, gpa_4 = EXCLUDED.gpa_4,
        cumulative_credits = EXCLUDED.cumulative_credits, cumulative_gpa_10 = EXCLUDED.cumulative_gpa_10,
        cumulative_gpa_4 = EXCLUDED.cumulative_gpa_4, conduct_score = EXCLUDED.conduct_score,
        classification_name = EXCLUDED.classification_name, source_payload = EXCLUDED.source_payload,
        grade_import_batch_id = EXCLUDED.grade_import_batch_id, updated_at = now()
    `;
  }

  // ===================== Refresh Scopes (ported from SWE refreshImportedScopes()) =====================

  private static async refreshImportedScopes(
    tx: Prisma.TransactionClient,
    batchId: string,
    rows: { year: string; term: string; grade: SourceGrade }[],
  ) {
    const scopes = new Set<string>();
    for (const row of rows) {
      const key = `${row.grade.StudentID.trim()}|${(row.grade.StudyProgramID || "").trim()}|${row.year}|${row.term}`;
      scopes.add(key);
    }

    for (const key of scopes) {
      const [studentCode, programCode, yearCode, termCode] = key.split("|");

      // Resolve IDs
      const ids: Array<{ student_id: string; term_id: string }> = await tx.$queryRaw`
        SELECT s.id::text as student_id, t.id::text as term_id
        FROM students s
        JOIN academic_years y ON y.s_year_code = ${yearCode}
        JOIN academic_terms t ON t.academic_year_id = y.id AND t.s_term_code = ${termCode}
        WHERE s.s_student_id = ${studentCode} AND s.deleted_at IS NULL
      `;
      if (ids.length === 0) continue;

      const studentId = ids[0].student_id;
      const termId = ids[0].term_id;

      // Delete stale offerings (same scope, different batch)
      if (programCode) {
        await tx.$executeRaw`
          DELETE FROM student_course_offerings
          WHERE student_id = ${studentId}::uuid AND academic_term_id = ${termId}::uuid
            AND s_program_code = ${programCode} AND grade_import_batch_id <> ${batchId}::uuid
        `;
      }

      // Recalculate registered credits
      if (programCode) {
        await tx.$executeRaw`
          UPDATE student_term_summaries SET
            registered_credits = (SELECT COALESCE(SUM(o.s_credits),0) FROM student_course_offerings o
              WHERE o.student_id = ${studentId}::uuid AND o.academic_term_id = ${termId}::uuid AND o.s_program_code = ${programCode}),
            updated_at = now()
          WHERE student_id = ${studentId}::uuid AND academic_term_id = ${termId}::uuid AND s_program_code = ${programCode}
        `;
      }

      // Refresh cumulative summary
      await this.refreshCumulativeSummary(tx, studentId, programCode);
    }
  }

  // ===================== Refresh Cumulative (ported from SWE refreshCumulativeSummary()) =====================

  private static async refreshCumulativeSummary(
    tx: Prisma.TransactionClient,
    studentId: string,
    programCode: string,
  ) {
    if (!programCode) return;

    await tx.$executeRaw`
      WITH latest AS (
        SELECT s.id, s.student_id, s.s_program_code, s.cumulative_credits, s.cumulative_gpa_10, s.cumulative_gpa_4,
          (SELECT COALESCE(SUM(o.s_credits),0) FROM student_course_offerings o WHERE o.student_id = s.student_id AND o.s_program_code = s.s_program_code) AS cumulative_registered_credits,
          s.academic_term_id, t.academic_year_id, s.grade_import_batch_id
        FROM student_term_summaries s
        JOIN academic_terms t ON t.id = s.academic_term_id
        JOIN academic_years y ON y.id = t.academic_year_id
        WHERE s.student_id = ${studentId}::uuid AND s.s_program_code = ${programCode}
        ORDER BY y.s_year_code DESC, t.s_term_order DESC, s.id DESC
        LIMIT 1
      )
      INSERT INTO student_cumulative_summaries (student_id, s_program_code, cumulative_credits, cumulative_gpa_10, cumulative_gpa_4,
        cumulative_registered_credits, source_term_summary_id, source_academic_year_id, source_academic_term_id, grade_import_batch_id, refreshed_at)
      SELECT student_id, s_program_code, cumulative_credits, cumulative_gpa_10, cumulative_gpa_4,
        cumulative_registered_credits, id, academic_year_id, academic_term_id, grade_import_batch_id, now()
      FROM latest
      ON CONFLICT (student_id, s_program_code) DO UPDATE SET
        cumulative_credits = EXCLUDED.cumulative_credits,
        cumulative_gpa_10 = EXCLUDED.cumulative_gpa_10,
        cumulative_gpa_4 = EXCLUDED.cumulative_gpa_4,
        cumulative_registered_credits = EXCLUDED.cumulative_registered_credits,
        source_term_summary_id = EXCLUDED.source_term_summary_id,
        source_academic_year_id = EXCLUDED.source_academic_year_id,
        source_academic_term_id = EXCLUDED.source_academic_term_id,
        grade_import_batch_id = EXCLUDED.grade_import_batch_id,
        refreshed_at = EXCLUDED.refreshed_at,
        updated_at = now()
    `;
  }
}
