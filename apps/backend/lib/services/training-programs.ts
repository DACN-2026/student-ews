import { prisma } from "@/lib/prisma";
import { ApiError } from "@/lib/utils/api-error";
import {
  Prisma,
  type AcademicTerm,
  type AcademicYear,
  type Course,
  type TrainingProgram,
} from "@prisma/client";
import { buildAcademicTermLinks, isConfiguredSummerTermCode } from "@/lib/academic-terms";

const dateOnly = (value: Date | null) => value ? value.toISOString().slice(0, 10) : null;

function mapProgram(program: TrainingProgram) {
  return {
    id: program.id,
    programCode: program.sProgramCode,
    programName: program.sProgramName,
    degreeLevel: program.sDegreeLevel,
    major: program.sMajor,
    majorName: program.sMajor,
    studyType: program.sStudyType,
    status: program.status,
    facultyCode: program.s_faculty_code,
  };
}

function mapCourse(course: Course) {
  return { id: course.id, courseCode: course.sCourseCode, courseName: course.sCourseName };
}

function mapAcademicYear(year: AcademicYear) {
  return {
    id: year.id,
    yearCode: year.sYearCode,
    startDate: dateOnly(year.startDate),
    endDate: dateOnly(year.endDate),
    status: year.status,
    isCurrent: year.isCurrent,
  };
}

function mapAcademicTerm(
  term: AcademicTerm,
  links: { previousMainTermId: string | null; nextMainTermId: string | null } = {
    previousMainTermId: null,
    nextMainTermId: null,
  },
) {
  return {
    id: term.id,
    academicYearId: term.academicYearId,
    termCode: term.sTermCode,
    termName: term.sTermName,
    termOrder: term.sTermOrder,
    isSummer: term.sIsSummer,
    startDate: dateOnly(term.startDate),
    endDate: dateOnly(term.endDate),
    status: term.status,
    isCurrent: term.isCurrent,
    ...links,
  };
}

async function loadAcademicTermLinks() {
  const [terms, years] = await Promise.all([
    prisma.academicTerm.findMany({ where: { deletedAt: null } }),
    prisma.academicYear.findMany({ where: { deletedAt: null }, select: { id: true, sYearCode: true } }),
  ]);
  const yearCodes = new Map(years.map((year) => [year.id, year.sYearCode]));
  return buildAcademicTermLinks(terms.map((term) => ({
    id: term.id,
    academicYearId: term.academicYearId,
    academicYearCode: yearCodes.get(term.academicYearId) || "",
    termOrder: term.sTermOrder,
    isSummer: term.sIsSummer,
    startDate: term.startDate,
    endDate: term.endDate,
  })));
}

type ProgramImportItem = {
  MaCTDT?: unknown;
  TenCTDT?: unknown;
  TrinhDoDaoTao?: unknown;
  ChuyenNganhDaoTao?: unknown;
  HinhThucDaoTao?: unknown;
  HocKy?: unknown;
  BatBuoc?: unknown;
  MaHP?: unknown;
  TenHP?: unknown;
  STC?: unknown;
  LT?: unknown;
  TH?: unknown;
  GhiChu?: unknown;
  YearStudy?: unknown;
  TermID?: unknown;
  BoMon?: unknown;
  Khoa?: unknown;
};

function requiredImportString(value: unknown, field: string, row: number) {
  const normalized = typeof value === "string" ? value.trim() : "";
  if (!normalized) throw new ApiError(`Row ${row}: ${field} is required`, "IMPORT_FAILED", 422);
  return normalized;
}

function importInteger(value: unknown, field: string, row: number, required = true) {
  if ((value === null || value === undefined || value === "") && !required) return null;
  const number = typeof value === "number" ? value : Number(String(value).trim());
  if (!Number.isInteger(number) || number < 0 || number > 32767 || (required && number === 0)) {
    throw new ApiError(`Row ${row}: ${field} must be a valid integer`, "IMPORT_FAILED", 422);
  }
  return number;
}

function importSemester(value: unknown, row: number) {
  const match = String(value ?? "").trim().match(/^(?:học\s*kỳ\s*)?(\d+)$/i);
  const semester = match ? Number(match[1]) : 0;
  if (semester < 1 || semester > 9) {
    throw new ApiError(`Row ${row}: HocKy must be between 1 and 9`, "IMPORT_FAILED", 422);
  }
  return semester;
}

function importAcademicSource(yearValue: unknown, termValue: unknown, row: number) {
  const yearCode = requiredImportString(yearValue, "YearStudy", row);
  const termCode = requiredImportString(termValue, "TermID", row).toUpperCase();
  const match = yearCode.match(/^(\d{4})-(\d{4})$/);
  if (!match || Number(match[2]) !== Number(match[1]) + 1) {
    throw new ApiError(`Row ${row}: YearStudy must contain consecutive years`, "IMPORT_FAILED", 422);
  }
  if (!new Set(["HK01", "HK02", "HK03"]).has(termCode)) {
    throw new ApiError(`Row ${row}: TermID must be HK01, HK02 or HK03`, "IMPORT_FAILED", 422);
  }
  return { yearCode, termCode };
}

export class TrainingProgramsService {
  static async getCurrentAcademicContext() {
    const activeTerm = await prisma.academicTerm.findFirst({
      where: { isCurrent: true, deletedAt: null },
      orderBy: { updatedAt: "desc" },
    });

    if (activeTerm) {
      const year = await prisma.academicYear.findUnique({
        where: { id: activeTerm.academicYearId },
      });
      const [links, allTerms, allYears] = await Promise.all([
        loadAcademicTermLinks(),
        prisma.academicTerm.findMany({ where: { deletedAt: null } }),
        prisma.academicYear.findMany({ where: { deletedAt: null }, select: { id: true, sYearCode: true } }),
      ]);
      const yearCodes = new Map(allYears.map((item) => [item.id, item.sYearCode]));
      const enrichedTerms = allTerms.map((term) => ({
        ...term,
        academicYearCode: yearCodes.get(term.academicYearId) || "",
        termOrder: term.sTermOrder,
        isSummer: term.sIsSummer,
      }));
      const preferredReportingTermId = activeTerm.sIsSummer
        ? links.get(activeTerm.id)?.previousMainTermId
        : activeTerm.id;
      const reportingTerm = preferredReportingTermId
        ? enrichedTerms.find((term) => term.id === preferredReportingTermId) || null
        : null;
      return {
        academicYearId: activeTerm.academicYearId,
        academicYearCode: year?.sYearCode,
        academicYearName: year?.sYearCode,
        academicTermId: activeTerm.id,
        termCode: activeTerm.sTermCode,
        termName: activeTerm.sTermName,
        startDate: activeTerm.startDate,
        endDate: activeTerm.endDate,
        isActive: activeTerm.isCurrent,
        isSummer: activeTerm.sIsSummer,
        ...links.get(activeTerm.id),
        defaultReportingTerm: reportingTerm ? {
          id: reportingTerm.id,
          academicYearId: reportingTerm.academicYearId,
          academicYearCode: reportingTerm.academicYearCode,
          termCode: reportingTerm.sTermCode,
          termName: reportingTerm.sTermName,
        } : null,
      };
    }

    const latestYear = await prisma.academicYear.findFirst({
      where: { deletedAt: null },
      orderBy: { sYearCode: "desc" },
    });
    const latestTerm = latestYear
      ? await prisma.academicTerm.findFirst({
          where: { academicYearId: latestYear.id, deletedAt: null, sIsSummer: false },
          orderBy: [{ sTermOrder: "desc" }, { updatedAt: "desc" }],
        })
      : null;

    if (latestTerm) {
      const [year, links] = await Promise.all([
        prisma.academicYear.findUnique({ where: { id: latestTerm.academicYearId } }),
        loadAcademicTermLinks(),
      ]);
      return {
        academicYearId: latestTerm.academicYearId,
        academicYearCode: year?.sYearCode,
        academicYearName: year?.sYearCode,
        academicTermId: latestTerm.id,
        termCode: latestTerm.sTermCode,
        termName: latestTerm.sTermName,
        startDate: latestTerm.startDate,
        endDate: latestTerm.endDate,
        isActive: latestTerm.isCurrent,
        isSummer: latestTerm.sIsSummer,
        ...links.get(latestTerm.id),
        defaultReportingTerm: {
          id: latestTerm.id,
          academicYearId: latestTerm.academicYearId,
          academicYearCode: year?.sYearCode,
          termCode: latestTerm.sTermCode,
          termName: latestTerm.sTermName,
        },
      };
    }

    return null;
  }

  static async listPrograms(search = "", includeArchived = false, page = 1, pageSize = 20) {
    const query = search.trim();
    const where: Prisma.TrainingProgramWhereInput = {
      deletedAt: null,
      ...(!includeArchived ? { status: "active" } : {}),
      ...(query
        ? {
            OR: [
              { sProgramCode: { contains: query, mode: "insensitive" } },
              { sProgramName: { contains: query, mode: "insensitive" } },
            ],
          }
        : {}),
    };
    const [total, programs] = await Promise.all([
      prisma.trainingProgram.count({ where }),
      prisma.trainingProgram.findMany({
        where,
        skip: (page - 1) * pageSize,
        take: pageSize,
        orderBy: [{ sProgramName: "asc" }, { sProgramCode: "asc" }],
      }),
    ]);

    const programCourses = await prisma.trainingProgramCourse.groupBy({
      by: ["trainingProgramId"],
      _count: { _all: true },
    });
    const courseCounts = Object.fromEntries(
      programCourses.map((pc) => [pc.trainingProgramId, pc._count._all])
    );

    const items = programs.map((p) => ({
      ...mapProgram(p),
      courseCount: courseCounts[p.id] || 0,
      createdAt: p.createdAt,
      updatedAt: p.updatedAt,
    }));
    return { items, total, page, pageSize };
  }

  static async getProgramById(id: string) {
    const program = await prisma.trainingProgram.findFirst({
      where: {
        OR: [{ id }, { sProgramCode: id }],
        deletedAt: null,
      },
    });

    if (!program) return null;

    const programCourses = await prisma.trainingProgramCourse.findMany({
      where: { trainingProgramId: program.id },
      orderBy: [{ sSemesterNo: "asc" }],
    });

    const courseIds = programCourses.map((pc) => pc.courseId);
    const termIds = programCourses.map((pc) => pc.academicTermId).filter(Boolean) as string[];

    const [courses, terms, allYears] = await Promise.all([
      prisma.course.findMany({ where: { id: { in: courseIds } } }),
      termIds.length > 0
        ? prisma.academicTerm.findMany({
            where: { id: { in: termIds } },
          })
        : [],
      prisma.academicYear.findMany(),
    ]);

    const yearMap = Object.fromEntries(allYears.map((y) => [y.id, y]));
    const courseMap = Object.fromEntries(courses.map((c) => [c.id, c]));
    const termMap = Object.fromEntries(
      terms.map((t: any) => [t.id, { ...t, academicYear: yearMap[t.academicYearId] }])
    );

    return {
      id: program.id,
      programCode: program.sProgramCode,
      programName: program.sProgramName,
      major: program.sMajor,
      majorName: program.sMajor,
      degreeLevel: program.sDegreeLevel,
      studyType: program.sStudyType,
      status: program.status,
      facultyCode: program.s_faculty_code,
      courses: programCourses.map((pc) => {
        const c = courseMap[pc.courseId];
        const t = pc.academicTermId ? termMap[pc.academicTermId] : null;
        return {
          id: pc.id,
          courseId: pc.courseId,
          courseCode: c?.sCourseCode || pc.sNote || "HP",
          courseName: c?.sCourseName || "Học phần",
          credits: pc.sCredits,
          semesterNo: pc.sSemesterNo,
          requirementType: pc.sRequirementType,
          theoryHours: pc.sTheoryHours,
          practiceHours: pc.sPracticeHours,
          departmentCode: pc.sDepartmentCode,
          facultyCode: pc.sFacultyCode,
          note: pc.sNote,
          academicTermId: pc.academicTermId,
          academicYearId: t?.academicYearId || null,
          yearCode: t?.academicYear?.sYearCode || pc.sYearStudy || `Năm ${Math.ceil(pc.sSemesterNo / 2)}`,
          termCode: t?.sTermCode || pc.sTermId || `Học kỳ ${pc.sSemesterNo}`,
          termName: t?.sTermName || (pc.sSemesterNo % 2 === 1 ? "Học kỳ 1" : "Học kỳ 2"),
        };
      }),
      createdAt: program.createdAt,
      updatedAt: program.updatedAt,
    };
  }

  static async createProgram(data: {
    programCode: string;
    programName: string;
    degreeLevel: string;
    major: string;
    studyType: string;
    facultyCode?: string;
    status?: string;
  }) {
    const created = await prisma.trainingProgram.create({
      data: {
        sProgramCode: data.programCode.trim(),
        sProgramName: data.programName.trim(),
        sDegreeLevel: data.degreeLevel.trim(),
        sMajor: data.major.trim(),
        sStudyType: data.studyType.trim(),
        s_faculty_code: data.facultyCode?.trim() || null,
        status: data.status || "active",
        isActive: data.status !== "archived",
      },
    });
    return mapProgram(created);
  }

  static async updateProgram(id: string, data: {
    programName?: string;
    degreeLevel?: string;
    major?: string;
    studyType?: string;
    facultyCode?: string | null;
    status?: string;
    isActive?: boolean;
  }) {
    const updated = await prisma.trainingProgram.update({
      where: { id },
      data: {
        ...(data.programName !== undefined ? { sProgramName: data.programName.trim() } : {}),
        ...(data.degreeLevel !== undefined ? { sDegreeLevel: data.degreeLevel.trim() } : {}),
        ...(data.major !== undefined ? { sMajor: data.major.trim() } : {}),
        ...(data.studyType !== undefined ? { sStudyType: data.studyType.trim() } : {}),
        ...(data.facultyCode !== undefined ? { s_faculty_code: data.facultyCode?.trim() || null } : {}),
        ...(data.status !== undefined ? { status: data.status } : {}),
        ...(data.isActive !== undefined ? { isActive: data.isActive } : {}),
      },
    });
    return mapProgram(updated);
  }

  static async setProgramStatus(id: string, status: string) {
    if (status !== "active" && status !== "archived") {
      throw new ApiError("Status must be active or archived", "VALIDATION_ERROR", 422);
    }
    const program = await prisma.trainingProgram.findFirst({ where: { id, deletedAt: null } });
    if (!program) throw new ApiError("Training program not found", "NOT_FOUND", 404);
    const updated = await prisma.trainingProgram.update({
      where: { id },
      data: { status, isActive: status === "active" },
    });
    return mapProgram(updated);
  }

  static async removeProgram(id: string) {
    return prisma.trainingProgram.update({
      where: { id },
      data: { deletedAt: new Date(), isActive: false, status: "archived" },
    });
  }

  static async importPrograms(items: ProgramImportItem[]) {
    const normalized = items.map((item, index) => {
      const row = index + 1;
      const requirementType = requiredImportString(item.BatBuoc, "BatBuoc", row);
      if (requirementType !== "Bắt Buộc" && requirementType !== "Tự Chọn") {
        throw new ApiError(`Row ${row}: BatBuoc must be Bắt Buộc or Tự Chọn`, "IMPORT_FAILED", 422);
      }
      return {
        programCode: requiredImportString(item.MaCTDT, "MaCTDT", row),
        programName: requiredImportString(item.TenCTDT, "TenCTDT", row),
        degreeLevel: requiredImportString(item.TrinhDoDaoTao, "TrinhDoDaoTao", row),
        major: requiredImportString(item.ChuyenNganhDaoTao, "ChuyenNganhDaoTao", row),
        studyType: requiredImportString(item.HinhThucDaoTao, "HinhThucDaoTao", row),
        semesterNo: importSemester(item.HocKy, row),
        requirementType,
        courseCode: requiredImportString(item.MaHP, "MaHP", row),
        courseName: requiredImportString(item.TenHP, "TenHP", row),
        credits: importInteger(item.STC, "STC", row)!,
        theoryHours: importInteger(item.LT, "LT", row, false),
        practiceHours: importInteger(item.TH, "TH", row, false),
        note: typeof item.GhiChu === "string" ? item.GhiChu.trim() || null : null,
        departmentCode: typeof item.BoMon === "string" ? item.BoMon.trim() || null : null,
        facultyCode: typeof item.Khoa === "string" ? item.Khoa.trim() || null : null,
        ...importAcademicSource(item.YearStudy, item.TermID, row),
      };
    });

    return prisma.$transaction(async (tx) => {
      let created = 0;
      let updated = 0;
      for (const item of normalized) {
        const existingProgram = await tx.trainingProgram.findUnique({
          where: { sProgramCode: item.programCode },
        });
        if (existingProgram && existingProgram.status !== "active") {
          throw new ApiError(`Training program ${item.programCode} is archived`, "IMPORT_FAILED", 422);
        }
        const program = await tx.trainingProgram.upsert({
          where: { sProgramCode: item.programCode },
          create: {
            sProgramCode: item.programCode,
            sProgramName: item.programName,
            sDegreeLevel: item.degreeLevel,
            sMajor: item.major,
            sStudyType: item.studyType,
          },
          update: {
            sProgramName: item.programName,
            sDegreeLevel: item.degreeLevel,
            sMajor: item.major,
            sStudyType: item.studyType,
            deletedAt: null,
            isActive: true,
          },
        });
        const course = await tx.course.upsert({
          where: { sCourseCode: item.courseCode },
          create: { sCourseCode: item.courseCode, sCourseName: item.courseName },
          update: { sCourseName: item.courseName, deletedAt: null },
        });
        const year = await tx.academicYear.upsert({
          where: { sYearCode: item.yearCode },
          create: { sYearCode: item.yearCode },
          update: { deletedAt: null },
        });
        for (const term of [
          { code: "HK01", name: "Học kỳ 1", order: 1, summer: false },
          { code: "HK02", name: "Học kỳ 2", order: 2, summer: false },
          {
            code: "HK03",
            name: isConfiguredSummerTermCode("HK03") ? "Học kỳ hè" : "Học kỳ 3",
            order: 3,
            summer: isConfiguredSummerTermCode("HK03"),
          },
        ]) {
          await tx.academicTerm.upsert({
            where: { academicYearId_sTermCode: { academicYearId: year.id, sTermCode: term.code } },
            create: {
              academicYearId: year.id,
              sTermCode: term.code,
              sTermName: term.name,
              sTermOrder: term.order,
              sIsSummer: term.summer,
            },
            update: { deletedAt: null },
          });
        }
        const academicTerm = await tx.academicTerm.findUniqueOrThrow({
          where: { academicYearId_sTermCode: { academicYearId: year.id, sTermCode: item.termCode } },
        });
        const existingCourse = await tx.trainingProgramCourse.findUnique({
          where: { trainingProgramId_courseId: { trainingProgramId: program.id, courseId: course.id } },
        });
        await tx.trainingProgramCourse.upsert({
          where: { trainingProgramId_courseId: { trainingProgramId: program.id, courseId: course.id } },
          create: {
            trainingProgramId: program.id,
            courseId: course.id,
            academicTermId: academicTerm.id,
            sSemesterNo: item.semesterNo,
            sCredits: item.credits,
            sTheoryHours: item.theoryHours,
            sPracticeHours: item.practiceHours,
            sRequirementType: item.requirementType,
            sNote: item.note,
            sYearStudy: item.yearCode,
            sTermId: item.termCode,
            sDepartmentCode: item.departmentCode,
            sFacultyCode: item.facultyCode,
          },
          update: {
            academicTermId: academicTerm.id,
            sSemesterNo: item.semesterNo,
            sCredits: item.credits,
            sTheoryHours: item.theoryHours,
            sPracticeHours: item.practiceHours,
            sRequirementType: item.requirementType,
            sNote: item.note,
            sYearStudy: item.yearCode,
            sTermId: item.termCode,
            sDepartmentCode: item.departmentCode,
            sFacultyCode: item.facultyCode,
          },
        });
        if (existingCourse) updated++;
        else created++;
      }
      return { total: normalized.length, created, updated };
    }, { maxWait: 10_000, timeout: 120_000 });
  }

  static async getProgramCourses(id: string) {
    const program = await this.getProgramById(id);
    return program ? program.courses : [];
  }

  static async addProgramCourse(
    programId: string,
    data: {
      courseId?: string;
      courseCode?: string;
      courseName?: string;
      semesterNo: number;
      credits: number;
      theoryHours?: number | null;
      practiceHours?: number | null;
      requirementType: string;
      departmentCode?: string | null;
      facultyCode?: string | null;
      note?: string | null;
      academicTermId?: string | null;
      yearStudy?: string | null;
      termId?: string | null;
    }
  ) {
    // Resolve courseId
    let cId = data.courseId;
    if (!cId && data.courseCode) {
      let existingCourse = await prisma.course.findFirst({
        where: { sCourseCode: data.courseCode },
      });
      if (!existingCourse) {
        existingCourse = await prisma.course.create({
          data: {
            sCourseCode: data.courseCode,
            sCourseName: data.courseName || data.courseCode,
          },
        });
      }
      cId = existingCourse.id;
    }

    if (!cId) {
      throw new Error("Course ID or Course Code is required");
    }

    return prisma.trainingProgramCourse.create({
      data: {
        trainingProgramId: programId,
        courseId: cId,
        sSemesterNo: data.semesterNo,
        sCredits: data.credits,
        sTheoryHours: data.theoryHours ?? null,
        sPracticeHours: data.practiceHours ?? null,
        sRequirementType: data.requirementType,
        sDepartmentCode: data.departmentCode ?? null,
        sFacultyCode: data.facultyCode ?? null,
        sNote: data.note ?? null,
        academicTermId: data.academicTermId ?? null,
        sYearStudy: data.yearStudy ?? null,
        sTermId: data.termId ?? null,
      },
    });
  }

  static async updateProgramCourse(
    programId: string,
    courseIdInProgram: string,
    data: {
      semesterNo?: number;
      credits?: number;
      theoryHours?: number | null;
      practiceHours?: number | null;
      requirementType?: string;
      departmentCode?: string | null;
      facultyCode?: string | null;
      note?: string | null;
      academicTermId?: string | null;
      yearStudy?: string | null;
      termId?: string | null;
    }
  ) {
    const existing = await prisma.trainingProgramCourse.findFirst({
      where: { id: courseIdInProgram, trainingProgramId: programId },
    });
    if (!existing) throw new Error("Program course not found");
    const updateData: any = {};
    if (data.semesterNo !== undefined) updateData.sSemesterNo = data.semesterNo;
    if (data.credits !== undefined) updateData.sCredits = data.credits;
    if (data.theoryHours !== undefined) updateData.sTheoryHours = data.theoryHours;
    if (data.practiceHours !== undefined) updateData.sPracticeHours = data.practiceHours;
    if (data.requirementType !== undefined) updateData.sRequirementType = data.requirementType;
    if (data.departmentCode !== undefined) updateData.sDepartmentCode = data.departmentCode;
    if (data.facultyCode !== undefined) updateData.sFacultyCode = data.facultyCode;
    if (data.note !== undefined) updateData.sNote = data.note;
    if (data.academicTermId !== undefined) updateData.academicTermId = data.academicTermId;
    if (data.yearStudy !== undefined) updateData.sYearStudy = data.yearStudy;
    if (data.termId !== undefined) updateData.sTermId = data.termId;

    return prisma.trainingProgramCourse.update({
      where: { id: courseIdInProgram },
      data: updateData,
    });
  }

  static async deleteProgramCourse(programId: string, courseIdInProgram: string) {
    const deleted = await prisma.trainingProgramCourse.deleteMany({
      where: { id: courseIdInProgram, trainingProgramId: programId },
    });
    if (!deleted.count) throw new Error("Program course not found");
    return true;
  }

  static async listCourses(search?: string, page = 1, pageSize = 50) {
    const where: any = { deletedAt: null };
    if (search && search.trim()) {
      where.OR = [
        { sCourseCode: { contains: search.trim(), mode: "insensitive" } },
        { sCourseName: { contains: search.trim(), mode: "insensitive" } },
      ];
    }

    const skip = (page - 1) * pageSize;
    const take = pageSize;

    const [total, items] = await Promise.all([
      prisma.course.count({ where }),
      prisma.course.findMany({
        where,
        skip,
        take,
        orderBy: { sCourseCode: "asc" },
      }),
    ]);

    return {
      items: items.map((c) => ({
        ...mapCourse(c),
        createdAt: c.createdAt,
        updatedAt: c.updatedAt,
      })),
      total,
      page,
      pageSize,
    };
  }

  static async getCourseById(id: string) {
    const course = await prisma.course.findFirst({ where: { id, deletedAt: null } });
    return course
      ? {
          ...mapCourse(course),
          createdAt: course.createdAt,
          updatedAt: course.updatedAt,
        }
      : null;
  }

  static async createCourse(data: { courseCode: string; courseName: string }) {
    const created = await prisma.course.create({
      data: { sCourseCode: data.courseCode.trim().toUpperCase(), sCourseName: data.courseName.trim() },
    });
    return mapCourse(created);
  }

  static async updateCourse(id: string, data: { courseCode?: string; courseName?: string }) {
    const course = await prisma.course.findFirst({ where: { id, deletedAt: null } });
    if (!course) throw new ApiError("Course not found", "NOT_FOUND", 404);
    const updated = await prisma.course.update({
      where: { id },
      data: {
        ...(data.courseCode !== undefined ? { sCourseCode: data.courseCode.trim().toUpperCase() } : {}),
        ...(data.courseName !== undefined ? { sCourseName: data.courseName.trim() } : {}),
      },
    });
    return mapCourse(updated);
  }

  static async removeCourse(id: string) {
    return prisma.course.update({ where: { id }, data: { deletedAt: new Date() } });
  }

  static async listAcademicYears(search = "", page = 1, pageSize = 20) {
    const query = search.trim();
    const where: Prisma.AcademicYearWhereInput = {
      deletedAt: null,
      ...(query ? { sYearCode: { contains: query, mode: "insensitive" } } : {}),
    };
    const [total, years] = await Promise.all([
      prisma.academicYear.count({ where }),
      prisma.academicYear.findMany({
        where,
        skip: (page - 1) * pageSize,
        take: pageSize,
        orderBy: { sYearCode: "desc" },
      }),
    ]);
    const [terms, links] = await Promise.all([
      prisma.academicTerm.findMany({
        where: { academicYearId: { in: years.map((year) => year.id) }, deletedAt: null },
        orderBy: { sTermOrder: "asc" },
      }),
      loadAcademicTermLinks(),
    ]);

    const termsByYear: Record<string, any[]> = {};
    for (const t of terms) {
      if (!termsByYear[t.academicYearId]) termsByYear[t.academicYearId] = [];
      termsByYear[t.academicYearId].push(mapAcademicTerm(t, links.get(t.id)));
    }

    const items = years.map((y) => ({
      ...mapAcademicYear(y),
      terms: termsByYear[y.id] || [],
    }));
    return { items, total, page, pageSize };
  }

  static async getAcademicYearById(id: string) {
    const year = await prisma.academicYear.findFirst({ where: { id, deletedAt: null } });
    if (!year) return null;
    const [terms, links] = await Promise.all([
      prisma.academicTerm.findMany({
        where: { academicYearId: year.id, deletedAt: null },
        orderBy: { sTermOrder: "asc" },
      }),
      loadAcademicTermLinks(),
    ]);
    return {
      ...mapAcademicYear(year),
      terms: terms.map((term) => mapAcademicTerm(term, links.get(term.id))),
      createdAt: year.createdAt,
      updatedAt: year.updatedAt,
    };
  }

  static async createAcademicYear(data: {
    yearCode: string;
    startDate?: string | Date;
    endDate?: string | Date;
    status?: string;
    isCurrent?: boolean;
  }) {
    return prisma.$transaction(async (tx) => {
      if (data.isCurrent) await tx.academicYear.updateMany({ where: { isCurrent: true }, data: { isCurrent: false } });
      const created = await tx.academicYear.create({
        data: {
          sYearCode: data.yearCode.trim(),
          startDate: data.startDate ? new Date(data.startDate) : null,
          endDate: data.endDate ? new Date(data.endDate) : null,
          status: data.status || "draft",
          isCurrent: Boolean(data.isCurrent),
        },
      });
      return mapAcademicYear(created);
    });
  }

  static async removeAcademicYear(id: string) {
    return prisma.academicYear.update({ where: { id }, data: { deletedAt: new Date(), isCurrent: false } });
  }

  static async updateAcademicYear(id: string, data: {
    yearCode?: string;
    startDate?: string | Date | null;
    endDate?: string | Date | null;
    status?: string;
    isCurrent?: boolean;
  }) {
    return prisma.$transaction(async (tx) => {
      const year = await tx.academicYear.findFirst({ where: { id, deletedAt: null } });
      if (!year) throw new ApiError("Academic year not found", "NOT_FOUND", 404);
      if (data.isCurrent) await tx.academicYear.updateMany({ where: { isCurrent: true, id: { not: id } }, data: { isCurrent: false } });
      const updated = await tx.academicYear.update({
        where: { id },
        data: {
          ...(data.yearCode !== undefined ? { sYearCode: data.yearCode.trim() } : {}),
          ...(data.startDate !== undefined ? { startDate: data.startDate ? new Date(data.startDate) : null } : {}),
          ...(data.endDate !== undefined ? { endDate: data.endDate ? new Date(data.endDate) : null } : {}),
          ...(data.status !== undefined ? { status: data.status } : {}),
          ...(data.isCurrent !== undefined ? { isCurrent: data.isCurrent } : {}),
        },
      });
      return mapAcademicYear(updated);
    });
  }

  static async listTerms(yearId: string) {
    const [terms, links] = await Promise.all([
      prisma.academicTerm.findMany({
        where: { academicYearId: yearId, deletedAt: null },
        orderBy: { sTermOrder: "asc" },
      }),
      loadAcademicTermLinks(),
    ]);
    return terms.map((term) => mapAcademicTerm(term, links.get(term.id)));
  }

  static async getTermById(yearId: string, termId: string) {
    const term = await prisma.academicTerm.findFirst({
      where: { id: termId, academicYearId: yearId, deletedAt: null },
    });
    if (!term) return null;
    const links = await loadAcademicTermLinks();
    return mapAcademicTerm(term, links.get(term.id));
  }

  static async createTerm(yearId: string, data: {
    termCode: string;
    termName: string;
    termOrder: number;
    isSummer?: boolean;
    startDate?: string | Date;
    endDate?: string | Date;
    status?: string;
    isCurrent?: boolean;
  }) {
    return prisma.$transaction(async (tx) => {
      const year = await tx.academicYear.findFirst({ where: { id: yearId, deletedAt: null } });
      if (!year) throw new Error("Academic year not found");
      if (data.isCurrent) await tx.academicTerm.updateMany({ where: { isCurrent: true }, data: { isCurrent: false } });
      const created = await tx.academicTerm.create({
        data: {
          academicYearId: yearId,
          sTermCode: data.termCode.trim(),
          sTermName: data.termName.trim(),
          sTermOrder: data.termOrder,
          sIsSummer: Boolean(data.isSummer),
          startDate: data.startDate ? new Date(data.startDate) : null,
          endDate: data.endDate ? new Date(data.endDate) : null,
          status: data.status || "draft",
          isCurrent: Boolean(data.isCurrent),
        },
      });
      return mapAcademicTerm(created);
    });
  }

  static async updateTerm(yearId: string, termId: string, data: {
    termCode?: string;
    termName?: string;
    termOrder?: number;
    isSummer?: boolean;
    startDate?: string | Date | null;
    endDate?: string | Date | null;
    status?: string;
    isCurrent?: boolean;
  }) {
    return prisma.$transaction(async (tx) => {
      const term = await tx.academicTerm.findFirst({
        where: { id: termId, academicYearId: yearId, deletedAt: null },
      });
      if (!term) throw new ApiError("Academic term not found", "NOT_FOUND", 404);
      if (data.isCurrent) await tx.academicTerm.updateMany({ where: { isCurrent: true, id: { not: termId } }, data: { isCurrent: false } });
      const updated = await tx.academicTerm.update({
        where: { id: termId },
        data: {
          ...(data.termCode !== undefined ? { sTermCode: data.termCode.trim() } : {}),
          ...(data.termName !== undefined ? { sTermName: data.termName.trim() } : {}),
          ...(data.termOrder !== undefined ? { sTermOrder: data.termOrder } : {}),
          ...(data.isSummer !== undefined ? { sIsSummer: data.isSummer } : {}),
          ...(data.startDate !== undefined ? { startDate: data.startDate ? new Date(data.startDate) : null } : {}),
          ...(data.endDate !== undefined ? { endDate: data.endDate ? new Date(data.endDate) : null } : {}),
          ...(data.status !== undefined ? { status: data.status } : {}),
          ...(data.isCurrent !== undefined ? { isCurrent: data.isCurrent } : {}),
        },
      });
      return mapAcademicTerm(updated);
    });
  }

  static async removeTerm(yearId: string, termId: string) {
    const result = await prisma.academicTerm.updateMany({
      where: { id: termId, academicYearId: yearId, deletedAt: null },
      data: { deletedAt: new Date(), isCurrent: false },
    });
    if (!result.count) throw new ApiError("Academic term not found", "NOT_FOUND", 404);
  }
}
