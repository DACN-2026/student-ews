import { prisma } from "@/lib/prisma";
import { Prisma } from "@prisma/client";
import { studentIdWhere } from "@/lib/utils/is-uuid";
import { ReportsService } from "@/lib/services/reports";

export interface StudentFilter {
  search?: string;
  cohortId?: string;
  classStudentId?: string;
  isInClass?: boolean;
  gender?: string;
  classRoleId?: number;
  studyProgramId?: string;
  warningLevel?: string;
}

export interface StudentUpsertInput {
  studentId: string;
  firstName: string;
  lastName: string;
  fullName?: string;
  birthDate: string | Date;
  birthPlace?: string | null;
  gender?: string | null;
  classRoleId?: number;
  permanentResidence?: string | null;
  isInClass?: boolean;
  classStudentId?: string | null;
  studyProgramId?: string | null;
}

async function orderedStudentPage(where: Prisma.StudentWhereInput, skip = 0, take?: number) {
  // Keep Prisma's permission/filter scope intact. Only IDs are read across the
  // scope; PostgreSQL sorts with Vietnamese collation and selects the page.
  const matching = await prisma.student.findMany({ where, select: { id: true } });
  if (!matching.length) return { total: 0, items: [] };
  const pageIds = await prisma.$queryRaw<Array<{ id: string }>>(Prisma.sql`
    SELECT s.id::text AS id
    FROM students s
    LEFT JOIN classes c ON c.class_id = s.s_class_student_id AND c.deleted_at IS NULL
    LEFT JOIN cohorts co ON co.id = c.cohort_id AND co.deleted_at IS NULL
    WHERE s.id IN (${Prisma.join(matching.map(student => Prisma.sql`${student.id}::uuid`))})
    ORDER BY
      substring(COALESCE(co.s_cohort_code, s.s_class_student_id) from 'K([0-9]+)')::integer ASC NULLS LAST,
      NULLIF(trim(s.s_class_student_id), '') COLLATE "vi-x-icu" ASC NULLS LAST,
      NULLIF(trim(s.s_last_name), '') COLLATE "vi-x-icu" ASC NULLS LAST,
      s.s_first_name COLLATE "vi-x-icu" ASC,
      s.s_full_name COLLATE "vi-x-icu" ASC,
      s.s_student_id ASC, s.id ASC
    ${take === undefined ? Prisma.empty : Prisma.sql`LIMIT ${take}`}
    OFFSET ${skip}
  `);
  if (!pageIds.length) return { total: matching.length, items: [] };
  const rows = await prisma.student.findMany({
    where: { AND: [where, { id: { in: pageIds.map(student => student.id) } }] },
  });
  const positions = new Map(pageIds.map((student, index) => [student.id, index]));
  rows.sort((left, right) => positions.get(left.id)! - positions.get(right.id)!);
  return { total: matching.length, items: rows };
}

export class StudentsService {
  static async list(
    filter: StudentFilter = {},
    page = 1,
    pageSize = 20,
    scope: Prisma.StudentWhereInput = {},
    includeAcademicWarnings = false,
  ) {
    const where: Prisma.StudentWhereInput = {
      deletedAt: null,
      AND: [scope],
    };

    if (filter.search && filter.search.trim()) {
      const q = filter.search.trim();
      where.OR = [
        { sStudentId: { contains: q, mode: "insensitive" } },
        { sFullName: { contains: q, mode: "insensitive" } },
      ];
    }

    if (filter.cohortId) {
      let cohortUuid = filter.cohortId;
      const isGuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(filter.cohortId);
      if (!isGuid) {
        const cohortRecord = await prisma.cohort.findFirst({
          where: { sCohortCode: filter.cohortId, deletedAt: null },
          select: { id: true },
        });
        if (cohortRecord) {
          cohortUuid = cohortRecord.id;
        }
      }
      const cohortClasses = await prisma.class.findMany({
        where: { cohortId: cohortUuid, deletedAt: null },
        select: { classId: true },
      });
      const classCodes = cohortClasses.map((c) => c.classId);
      where.sClassStudentId = { in: classCodes };
    }

    if (filter.classStudentId) {
      where.sClassStudentId = filter.classStudentId;
    }

    if (filter.isInClass !== undefined) {
      where.sIsInClass = filter.isInClass;
    }

    if (filter.gender) {
      where.sGender = filter.gender;
    }

    if (filter.classRoleId !== undefined) {
      where.sClassRoleId = filter.classRoleId;
    }

    if (filter.studyProgramId) {
      where.sStudyProgramId = filter.studyProgramId;
    }

    let warningFilterReport: Awaited<ReturnType<typeof ReportsService.academicWarningStudents>> | null = null;
    if (includeAcademicWarnings && filter.warningLevel && filter.warningLevel !== "all") {
      warningFilterReport = await ReportsService.academicWarningStudents({
        severity: filter.warningLevel === "red" ? "high" : filter.warningLevel === "yellow" ? "medium" : undefined,
        presentationState: filter.warningLevel === "green" || filter.warningLevel === "partial"
          ? "NORMAL"
          : filter.warningLevel === "insufficient"
            ? "INSUFFICIENT_DATA"
            : undefined,
        includeAllStates: true,
        page: 1,
        pageSize: 1000,
      }, where);
      const matchingIds = warningFilterReport.items.map((warning) => warning.studentId);
      where.id = { in: matchingIds };
    }

    const skip = (page - 1) * pageSize;
    const take = pageSize;

    const { total, items } = await orderedStudentPage(where, skip, take);

    const studentIds = items.map((s) => s.id);
    const warningRows = !includeAcademicWarnings
      ? []
      : warningFilterReport
      ? warningFilterReport.items.filter((warning) => studentIds.includes(warning.studentId))
      : studentIds.length
        ? (await ReportsService.academicWarningStudents(
            { page: 1, pageSize: 1000, includeAllStates: true },
            { id: { in: studentIds } },
          )).items
        : [];
    const warningMap = new Map<string, any>();
    for (const warning of warningRows) {
      warningMap.set(warning.studentId, {
        maxSeverity: warning.severity,
        reasonCount: warning.reasonCount,
        termGpa4: warning.termGpa4,
        cumulativeGpa4: warning.cumulativeGpa4,
        academicWarningDecisions: warning.academicWarningDecisions,
        dataStatus: warning.dataStatus,
        presentationState: warning.presentationState,
      });
    }

    // Resolve class and cohort metadata
    const classIds = Array.from(new Set(items.map((s) => s.sClassStudentId).filter(Boolean) as string[]));
    const classes = classIds.length
      ? await prisma.class.findMany({
          where: { classId: { in: classIds }, deletedAt: null },
          select: { classId: true, className: true, cohortId: true },
        })
      : [];
    const cohortIds = Array.from(new Set(classes.map((c) => c.cohortId).filter(Boolean) as string[]));
    const cohorts = cohortIds.length
      ? await prisma.cohort.findMany({
          where: { id: { in: cohortIds }, deletedAt: null },
          select: { id: true, sCohortCode: true, sCohortName: true },
        })
      : [];
    const cohortMap = new Map(cohorts.map((c) => [c.id, c.sCohortCode]));
    const classMap = new Map(
      classes.map((c) => [
        c.classId,
        {
          className: c.className,
          cohortCode: c.cohortId ? cohortMap.get(c.cohortId) : null,
        },
      ])
    );

    return {
      items: items.map((s) => mapStudent(
        s,
        includeAcademicWarnings ? warningMap.get(s.id) : undefined,
        s.sClassStudentId ? classMap.get(s.sClassStudentId) : undefined,
        includeAcademicWarnings,
      )),
      total,
      page,
      pageSize,
      totalPages: Math.ceil(total / pageSize),
    };
  }

  static async getById(id: string) {
    const student = await prisma.student.findFirst({
      where: {
        ...studentIdWhere(id),
        deletedAt: null,
      },
    });

    if (!student) return null;

    const [cumulative, terms] = await Promise.all([
      prisma.studentCumulativeSummary.findFirst({
        where: { studentId: student.id },
      }),
      prisma.studentTermSummary.findMany({
        where: { studentId: student.id },
        orderBy: { createdAt: "desc" },
      }),
    ]);

    const [program, studentClass] = await Promise.all([
      student.sStudyProgramId
        ? prisma.trainingProgram.findFirst({
            where: { sProgramCode: student.sStudyProgramId, deletedAt: null },
          })
        : null,
      student.sClassStudentId
        ? prisma.class.findFirst({
            where: { classId: student.sClassStudentId, deletedAt: null },
          })
        : null,
    ]);
    const [cohort, advisorAssignment] = await Promise.all([
      studentClass?.cohortId
        ? prisma.cohort.findFirst({ where: { id: studentClass.cohortId, deletedAt: null } })
        : null,
      studentClass
        ? prisma.classAdvisorAssignment.findFirst({
            where: { classId: studentClass.id, status: "active", revokedAt: null },
            orderBy: { assignedAt: "desc" },
          })
        : null,
    ]);
    const advisor = advisorAssignment
      ? await prisma.user.findFirst({
          where: { id: advisorAssignment.userId, deletedAt: null, isActive: true },
          select: { id: true, fullName: true },
        })
      : null;

    return {
      ...mapStudent(student),
      cumulative: cumulative ? {
        cumulativeGpa4: cumulative.cumulativeGpa4 != null ? Number(cumulative.cumulativeGpa4) : null,
        cumulativeGpa10: cumulative.cumulativeGpa10 != null ? Number(cumulative.cumulativeGpa10) : null,
        cumulativeCredits: cumulative.cumulativeCredits != null ? Number(cumulative.cumulativeCredits) : null,
      } : null,
      termSummaries: terms.map((t) => ({
        id: t.id,
        academicTermId: t.academicTermId,
        gpa4: t.gpa4 != null ? Number(t.gpa4) : null,
        gpa10: t.gpa10 != null ? Number(t.gpa10) : null,
        creditsEarned: t.creditsEarned != null ? Number(t.creditsEarned) : null,
        registeredCredits: Number(t.registeredCredits),
        classificationName: t.classificationName,
      })),
      program: program ? {
        id: program.id,
        code: program.sProgramCode,
        name: program.sProgramName,
        degreeLevel: program.sDegreeLevel,
        major: program.sMajor,
        studyType: program.sStudyType,
        facultyCode: program.s_faculty_code,
      } : null,
      class: studentClass ? {
        id: studentClass.id,
        code: studentClass.classId,
        name: studentClass.className,
      } : null,
      cohort: cohort ? {
        code: cohort.sCohortCode,
        name: cohort.sCohortName,
      } : null,
      advisor: advisor ? {
        id: advisor.id,
        fullName: advisor.fullName,
      } : null,
    };
  }

  static async create(input: StudentUpsertInput) {
    const fullName = input.fullName || `${input.lastName} ${input.firstName}`.trim();
    const birthDate = new Date(input.birthDate);

    const created = await prisma.student.create({
      data: {
        sStudentId: input.studentId,
        sFirstName: input.firstName,
        sLastName: input.lastName,
        sFullName: fullName,
        sBirthDate: birthDate,
        sBirthPlace: input.birthPlace || null,
        sGender: input.gender || null,
        sClassRoleId: input.classRoleId ?? 0,
        sPermanentResidence: input.permanentResidence || null,
        sIsInClass: input.isInClass ?? true,
        sClassStudentId: input.classStudentId || null,
        sStudyProgramId: input.studyProgramId || null,
      },
    });

    return mapStudent(created);
  }

  static async update(id: string, input: Partial<StudentUpsertInput>) {
    const data: Prisma.StudentUpdateInput = {};

    if (input.studentId) data.sStudentId = input.studentId;
    if (input.firstName) data.sFirstName = input.firstName;
    if (input.lastName) data.sLastName = input.lastName;
    if (input.fullName) data.sFullName = input.fullName;
    if (input.birthDate) data.sBirthDate = new Date(input.birthDate);
    if (input.birthPlace !== undefined) data.sBirthPlace = input.birthPlace;
    if (input.gender !== undefined) data.sGender = input.gender;
    if (input.classRoleId !== undefined) data.sClassRoleId = input.classRoleId;
    if (input.permanentResidence !== undefined) data.sPermanentResidence = input.permanentResidence;
    if (input.isInClass !== undefined) data.sIsInClass = input.isInClass;
    if (input.classStudentId !== undefined) data.sClassStudentId = input.classStudentId;
    if (input.studyProgramId !== undefined) data.sStudyProgramId = input.studyProgramId;

    const student = await prisma.student.findFirst({
      where: { ...studentIdWhere(id), deletedAt: null },
    });

    if (!student) throw new Error("Student not found");

    const updated = await prisma.student.update({
      where: { id: student.id },
      data,
    });

    return mapStudent(updated);
  }

  static async delete(id: string) {
    const student = await prisma.student.findFirst({
      where: { ...studentIdWhere(id), deletedAt: null },
    });
    if (!student) return false;

    await prisma.student.update({
      where: { id: student.id },
      data: { deletedAt: new Date() },
    });
    return true;
  }

  static async exportAll(scope: Prisma.StudentWhereInput = {}) {
    const { items } = await orderedStudentPage({ deletedAt: null, AND: [scope] });
    return items.map((s) => mapStudent(s));
  }

  static async importBatch(items: StudentUpsertInput[], scope: Prisma.StudentWhereInput = {}) {
    const errors: { studentId: string; message: string }[] = [];
    const unique = new Map<string, StudentUpsertInput>();
    for (const item of items) {
      const code = item.studentId?.trim();
      const birthDate = new Date(item.birthDate);
      if (!code || !item.firstName?.trim() || !item.lastName?.trim() || Number.isNaN(birthDate.getTime())) {
        errors.push({ studentId: code || "", message: "studentId, firstName, lastName and a valid birthDate are required" });
        continue;
      }
      if (unique.has(code)) {
        errors.push({ studentId: code, message: "Duplicate studentId in import batch" });
        continue;
      }
      unique.set(code, { ...item, studentId: code });
    }
    const validItems = [...unique.values()];
    const existing = await prisma.student.findMany({
      where: { sStudentId: { in: validItems.map((item) => item.studentId) } },
      select: { id: true, sStudentId: true },
    });
    const accessibleExisting = await prisma.student.findMany({
      where: { AND: [{ sStudentId: { in: validItems.map((item) => item.studentId) } }, scope] },
      select: { sStudentId: true },
    });
    const accessibleCodes = new Set(accessibleExisting.map((student) => student.sStudentId));
    const outsideScope = new Set(
      existing.filter((student) => !accessibleCodes.has(student.sStudentId)).map((student) => student.sStudentId),
    );
    for (const code of outsideScope) errors.push({ studentId: code, message: "Existing student is outside data scope" });
    const scopedItems = validItems.filter((item) => !outsideScope.has(item.studentId));
    const existingByCode = new Map(existing.map((student) => [student.sStudentId, student.id]));
    const dataFor = (item: StudentUpsertInput) => ({
      sStudentId: item.studentId,
      sFirstName: item.firstName.trim(),
      sLastName: item.lastName.trim(),
      sFullName: item.fullName?.trim() || `${item.lastName} ${item.firstName}`.trim(),
      sBirthDate: new Date(item.birthDate),
      sBirthPlace: item.birthPlace || null,
      sGender: item.gender || null,
      sClassRoleId: item.classRoleId ?? 0,
      sPermanentResidence: item.permanentResidence || null,
      sIsInClass: item.isInClass ?? true,
      sClassStudentId: item.classStudentId || null,
      sStudyProgramId: item.studyProgramId || null,
      deletedAt: null,
    });
    await prisma.$transaction(async (tx) => {
      const newRows = scopedItems.filter((item) => !existingByCode.has(item.studentId)).map(dataFor);
      if (newRows.length) await tx.student.createMany({ data: newRows });
      for (const item of scopedItems) {
        const id = existingByCode.get(item.studentId);
        if (id) await tx.student.update({ where: { id }, data: dataFor(item) });
      }
    });
    return { total: items.length, imported: scopedItems.length, errors };
  }
}

function mapStudent(
  s: any,
  warningResult?: any,
  classMeta?: { className?: string | null; cohortCode?: string | null },
  includeAcademicWarnings = false,
) {
  let warningLevel: "red" | "yellow" | "green" | "insufficient" = "green";
  if (warningResult?.presentationState === "HIGH_RISK" || warningResult?.presentationState === "VERIFY_REQUIRED") {
    warningLevel = "red";
  } else if (warningResult?.presentationState === "MONITORING") {
    warningLevel = "yellow";
  } else if (warningResult?.presentationState === "INSUFFICIENT_DATA") {
    warningLevel = "insufficient";
  }

  return {
    id: s.id,
    studentId: s.sStudentId,
    studentCode: s.sStudentId,
    firstName: s.sFirstName,
    lastName: s.sLastName,
    fullName: s.sFullName,
    birthDate: s.sBirthDate ? new Date(s.sBirthDate).toISOString().split("T")[0] : null,
    birthPlace: s.sBirthPlace,
    gender: s.sGender,
    classRoleId: s.sClassRoleId,
    permanentResidence: s.sPermanentResidence,
    isInClass: s.sIsInClass,
    classStudentId: s.sClassStudentId,
    className: classMeta?.className || s.sClassStudentId,
    classId: s.sClassStudentId,
    cohortCode: classMeta?.cohortCode || null,
    studyProgramId: s.sStudyProgramId,
    ...(includeAcademicWarnings ? {
      warningLevel,
      warningInfo: warningResult ? {
        maxSeverity: warningResult.maxSeverity,
        reasonCount: warningResult.reasonCount,
        termGpa4: warningResult.termGpa4 != null ? Number(warningResult.termGpa4) : null,
        cumulativeGpa4: warningResult.cumulativeGpa4 != null ? Number(warningResult.cumulativeGpa4) : null,
        academicWarningDecisions: warningResult.academicWarningDecisions || 0,
        dataStatus: warningResult.dataStatus,
        presentationState: warningResult.presentationState,
      } : null,
    } : {}),
    createdAt: s.createdAt,
    updatedAt: s.updatedAt,
  };
}
