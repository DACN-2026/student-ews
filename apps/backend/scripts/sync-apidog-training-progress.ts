import fs from "node:fs";
import path from "node:path";

function loadDatabaseUrl() {
  for (const name of [".env", ".env.local"]) {
    const file = path.resolve(process.cwd(), name);
    if (!fs.existsSync(file)) continue;
    for (const line of fs.readFileSync(file, "utf8").split(/\r?\n/)) {
      const match = line.match(/^DATABASE_URL=(.*)$/);
      if (match) process.env.DATABASE_URL = match[1].trim().replace(/^"|"$/g, "");
    }
  }
  if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is not configured");
}

function requirementType(value: string) {
  const normalized = value.trim().toLocaleLowerCase("vi");
  return normalized.includes("bắt") || normalized === "mandatory" ? "mandatory" : "elective";
}

async function removeLegacySeedDemo(prisma: Awaited<typeof import("../lib/prisma")>["prisma"]) {
  const [cohort, program, studentClass, students] = await Promise.all([
    prisma.cohort.findUnique({ where: { sCohortCode: "K44" } }),
    prisma.trainingProgram.findUnique({ where: { sProgramCode: "CNTT-K44" } }),
    prisma.class.findUnique({ where: { classId: "44K01" } }),
    prisma.student.findMany({
      where: { sStudentId: { in: ["SVDEMO001", "SVDEMO002", "SVDEMO003"] } },
      select: { id: true },
    }),
  ]);
  if (!cohort && !program && !studentClass && students.length === 0) return 0;

  const studentIds = students.map((student) => student.id);
  const plans = cohort && program
    ? await prisma.trainingProgressPlan.findMany({
        where: { cohortId: cohort.id, trainingProgramId: program.id },
        select: { id: true },
      })
    : [];
  const planIds = plans.map((plan) => plan.id);
  const registrationRuns = planIds.length
    ? await prisma.trainingProgressCalculationRun.findMany({
        where: { planId: { in: planIds } },
        select: { id: true },
      })
    : [];
  const registrationRunIds = registrationRuns.map((run) => run.id);
  const registrationResults = registrationRunIds.length
    ? await prisma.trainingProgressStudentResult.findMany({
        where: { runId: { in: registrationRunIds } },
        select: { id: true },
      })
    : [];
  const registrationResultIds = registrationResults.map((result) => result.id);
  const completionRuns = cohort && program
    ? await prisma.trainingProgressCompletionRun.findMany({
        where: { cohortId: cohort.id, trainingProgramId: program.id },
        select: { id: true },
      })
    : [];
  const completionRunIds = completionRuns.map((run) => run.id);
  const completionStudents = completionRunIds.length
    ? await prisma.trainingProgressCompletionStudentResult.findMany({
        where: { runId: { in: completionRunIds } },
        select: { id: true },
      })
    : [];
  const completionStudentIds = completionStudents.map((result) => result.id);
  const completionPlans = completionStudentIds.length
    ? await prisma.trainingProgressCompletionPlanResult.findMany({
        where: { studentResultId: { in: completionStudentIds } },
        select: { id: true },
      })
    : [];
  const completionPlanIds = completionPlans.map((result) => result.id);
  const warningRuns = cohort && program
    ? await prisma.academicWarningRun.findMany({
        where: { cohortId: cohort.id, trainingProgramId: program.id },
        select: { id: true },
      })
    : [];
  const warningRunIds = warningRuns.map((run) => run.id);
  const warningStudents = warningRunIds.length
    ? await prisma.academicWarningStudentResult.findMany({
        where: { runId: { in: warningRunIds } },
        select: { id: true },
      })
    : [];
  const warningStudentIds = warningStudents.map((result) => result.id);
  const offerings = studentIds.length
    ? await prisma.studentCourseOffering.findMany({
        where: { studentId: { in: studentIds } },
        select: { id: true },
      })
    : [];
  const offeringIds = offerings.map((offering) => offering.id);

  await prisma.$transaction(async (tx) => {
    if (warningStudentIds.length) {
      await tx.academicWarningReason.deleteMany({ where: { studentResultId: { in: warningStudentIds } } });
    }
    if (warningRunIds.length) {
      await tx.warningAction.deleteMany({ where: { runId: { in: warningRunIds } } });
      await tx.academicWarningGroupResult.deleteMany({ where: { runId: { in: warningRunIds } } });
      await tx.academicWarningStudentResult.deleteMany({ where: { runId: { in: warningRunIds } } });
      await tx.academicWarningRun.deleteMany({ where: { id: { in: warningRunIds } } });
    }
    if (completionPlanIds.length) {
      await tx.training_progress_completion_course_results.deleteMany({
        where: { plan_result_id: { in: completionPlanIds } },
      });
    }
    if (completionStudentIds.length) {
      await tx.trainingProgressCompletionPlanResult.deleteMany({
        where: { studentResultId: { in: completionStudentIds } },
      });
    }
    if (completionRunIds.length) {
      await tx.trainingProgressCompletionGroupResult.deleteMany({ where: { runId: { in: completionRunIds } } });
      await tx.trainingProgressCompletionStudentResult.deleteMany({ where: { runId: { in: completionRunIds } } });
      await tx.trainingProgressCompletionRun.deleteMany({ where: { id: { in: completionRunIds } } });
    }
    if (registrationResultIds.length) {
      await tx.trainingProgressCourseResult.deleteMany({
        where: { studentResultId: { in: registrationResultIds } },
      });
    }
    if (registrationRunIds.length) {
      await tx.trainingProgressGroupResult.deleteMany({ where: { runId: { in: registrationRunIds } } });
      await tx.trainingProgressStudentResult.deleteMany({ where: { runId: { in: registrationRunIds } } });
      await tx.trainingProgressCalculationRun.deleteMany({ where: { id: { in: registrationRunIds } } });
    }
    if (planIds.length) {
      await tx.trainingProgressPlanCourse.deleteMany({ where: { planId: { in: planIds } } });
      await tx.trainingProgressPlan.deleteMany({ where: { id: { in: planIds } } });
    }
    if (studentIds.length) {
      await tx.warningAction.deleteMany({ where: { studentId: { in: studentIds } } });
      await tx.studentCumulativeSummary.deleteMany({ where: { studentId: { in: studentIds } } });
      await tx.studentTermSummary.deleteMany({ where: { studentId: { in: studentIds } } });
      await tx.studentConductRecord.deleteMany({ where: { studentId: { in: studentIds } } });
      await tx.studentDecision.deleteMany({ where: { studentId: { in: studentIds } } });
      await tx.studentFeePolicy.deleteMany({ where: { studentId: { in: studentIds } } });
      await tx.unscopedGradeRecord.deleteMany({ where: { studentId: { in: studentIds } } });
      if (offeringIds.length) await tx.studentCourseGrade.deleteMany({ where: { offeringId: { in: offeringIds } } });
      await tx.studentCourseOffering.deleteMany({ where: { studentId: { in: studentIds } } });
      await tx.student.deleteMany({ where: { id: { in: studentIds } } });
    }
    if (studentClass) {
      await tx.classAdvisorAssignment.deleteMany({ where: { classId: studentClass.id } });
      await tx.class.delete({ where: { id: studentClass.id } });
    }
    if (program) await tx.trainingProgram.delete({ where: { id: program.id } });
    if (cohort) await tx.cohort.delete({ where: { id: cohort.id } });
    const demoPolicy = await tx.academicWarningPolicy.findFirst({ where: { name: "Chính sách cảnh báo demo" } });
    if (demoPolicy) {
      const references = await tx.academicWarningRun.count({ where: { policyId: demoPolicy.id } });
      if (!references) await tx.academicWarningPolicy.delete({ where: { id: demoPolicy.id } });
    }
  }, { maxWait: 10_000, timeout: 60_000 });

  return students.length + plans.length + completionRuns.length + warningRuns.length;
}

async function main() {
  loadDatabaseUrl();
  const [{ prisma }, { TrainingProgressService }] = await Promise.all([
    import("../lib/prisma"),
    import("../lib/services/training-progress"),
  ]);
  const removedLegacyDemoRecords = process.argv.includes("--remove-legacy-demo")
    ? await removeLegacySeedDemo(prisma)
    : 0;

  const [studentCount, curriculumCount, offeringCount] = await Promise.all([
    prisma.student.count({ where: { deletedAt: null } }),
    prisma.trainingProgramCourse.count(),
    prisma.studentCourseOffering.count(),
  ]);
  if (studentCount < 600 || curriculumCount < 250 || offeringCount < 30_000) {
    throw new Error(
      `Apidog source validation failed: students=${studentCount}, curriculum=${curriculumCount}, offerings=${offeringCount}`,
    );
  }

  const periods = await prisma.$queryRaw<Array<{
    academic_term_id: string;
    academic_year_id: string;
    s_year_code: string;
    s_term_code: string;
    s_term_order: number;
  }>>`
    SELECT t.id::text AS academic_term_id, y.id::text AS academic_year_id,
           y.s_year_code, t.s_term_code, t.s_term_order
    FROM student_course_offerings o
    JOIN academic_terms t ON t.id = o.academic_term_id AND t.deleted_at IS NULL
    JOIN academic_years y ON y.id = t.academic_year_id AND y.deleted_at IS NULL
    WHERE t.s_is_summer = false
    GROUP BY t.id, y.id, y.s_year_code, t.s_term_code, t.s_term_order
    ORDER BY y.s_year_code DESC, t.s_term_order DESC
  `;
  const currentPeriod = periods[0];
  if (!currentPeriod) throw new Error("No main academic term with Apidog offerings was found");

  await prisma.$transaction(async (tx) => {
    await tx.academicYear.updateMany({ where: { isCurrent: true }, data: { isCurrent: false } });
    await tx.academicTerm.updateMany({ where: { isCurrent: true }, data: { isCurrent: false } });
    await tx.academicYear.update({
      where: { id: currentPeriod.academic_year_id },
      data: { isCurrent: true, status: "open" },
    });
    await tx.academicTerm.update({
      where: { id: currentPeriod.academic_term_id },
      data: { isCurrent: true, status: "open" },
    });
  });

  const scopes = await prisma.$queryRaw<Array<{
    cohort_id: string;
    cohort_code: string;
    training_program_id: string;
    program_code: string;
  }>>`
    SELECT DISTINCT co.id::text AS cohort_id, co.s_cohort_code AS cohort_code,
           tp.id::text AS training_program_id, tp.s_program_code AS program_code
    FROM students s
    JOIN classes c ON c.class_id = s.s_class_student_id AND c.deleted_at IS NULL
    JOIN cohorts co ON co.id = c.cohort_id AND co.deleted_at IS NULL
    JOIN training_programs tp ON tp.s_program_code = s.s_study_program_id AND tp.deleted_at IS NULL
    WHERE s.deleted_at IS NULL
      AND EXISTS (
        SELECT 1 FROM training_program_courses pc
        WHERE pc.training_program_id = tp.id AND pc.academic_term_id IS NOT NULL
      )
    ORDER BY co.s_cohort_code, tp.s_program_code
  `;

  const terms = await prisma.academicTerm.findMany({ where: { deletedAt: null } });
  const termsById = new Map(terms.map((term) => [term.id, term]));
  const createdPlanIds: string[] = [];
  const sourcePlanIds: string[] = [];

  for (const scope of scopes) {
    const requirements = await prisma.trainingProgramCourse.findMany({
      where: { trainingProgramId: scope.training_program_id, academicTermId: { not: null } },
      orderBy: [{ sSemesterNo: "asc" }, { courseId: "asc" }],
    });
    const catalog = await prisma.course.findMany({
      where: { id: { in: requirements.map((item) => item.courseId) }, deletedAt: null },
    });
    const catalogById = new Map(catalog.map((course) => [course.id, course]));
    const grouped = new Map<string, typeof requirements>();
    for (const requirement of requirements) {
      if (!requirement.academicTermId) continue;
      const rows = grouped.get(requirement.academicTermId) || [];
      rows.push(requirement);
      grouped.set(requirement.academicTermId, rows);
    }
    const maxSemester = Math.max(...requirements.map((item) => item.sSemesterNo));

    for (const [academicTermId, courses] of grouped) {
      const term = termsById.get(academicTermId);
      if (!term || term.sIsSummer) continue;
      const semesters = [...new Set(courses.map((course) => course.sSemesterNo))];
      if (semesters.length !== 1) {
        throw new Error(`${scope.program_code}/${term.sTermCode} maps to multiple curriculum semesters`);
      }
      const existing = await prisma.trainingProgressPlan.findFirst({
        where: {
          cohortId: scope.cohort_id,
          trainingProgramId: scope.training_program_id,
          academicTermId,
        },
        orderBy: { version: "desc" },
      });
      if (existing) {
        sourcePlanIds.push(existing.id);
        continue;
      }

      const plan = await prisma.$transaction(async (tx) => {
        const created = await tx.trainingProgressPlan.create({
          data: {
            cohortId: scope.cohort_id,
            trainingProgramId: scope.training_program_id,
            academicYearId: term.academicYearId,
            academicTermId,
            curriculumSemesterNo: semesters[0],
            version: 1,
            status: "locked",
            isCurrent: true,
            requiredElectiveCredits: 0,
            is_program_final: semesters[0] === maxSemester,
          },
        });
        await tx.trainingProgressPlanCourse.createMany({
          data: courses.map((course) => {
            const catalogCourse = catalogById.get(course.courseId);
            if (!catalogCourse) throw new Error(`Course ${course.courseId} is missing from the catalog`);
            const normalizedType = requirementType(course.sRequirementType);
            return {
              planId: created.id,
              courseId: course.courseId,
              sCourseCode: catalogCourse.sCourseCode,
              sCourseName: catalogCourse.sCourseName,
              sCredits: course.sCredits,
              requirementType: normalizedType,
              isRegistrationRequired: normalizedType === "mandatory",
            };
          }),
        });
        return created;
      });
      createdPlanIds.push(plan.id);
      sourcePlanIds.push(plan.id);
    }
  }

  const currentPlans = await prisma.trainingProgressPlan.findMany({
    where: {
      id: { in: sourcePlanIds },
      academicTermId: currentPeriod.academic_term_id,
      status: "locked",
    },
    orderBy: [{ cohortId: "asc" }, { trainingProgramId: "asc" }],
  });
  let registrationRuns = 0;
  for (const plan of currentPlans) {
    const existingRun = await prisma.trainingProgressCalculationRun.findFirst({
      where: { planId: plan.id, status: "completed" },
    });
    if (existingRun) continue;
    await TrainingProgressService.triggerCalculate(plan.id);
    registrationRuns += 1;
  }

  let completionRuns = 0;
  const currentScopeKeys = new Set(currentPlans.map((plan) => `${plan.cohortId}|${plan.trainingProgramId}`));
  for (const key of currentScopeKeys) {
    const [cohortId, trainingProgramId] = key.split("|");
    const existingRun = await prisma.trainingProgressCompletionRun.findFirst({
      where: {
        cohortId,
        trainingProgramId,
        assessmentAcademicTermId: currentPeriod.academic_term_id,
        status: "completed",
      },
    });
    if (existingRun) continue;
    await TrainingProgressService.triggerCompletionRun({
      cohortId,
      trainingProgramId,
      assessmentAcademicTermId: currentPeriod.academic_term_id,
    });
    completionRuns += 1;
  }

  console.log(JSON.stringify({
    source: { studentCount, curriculumCount, offeringCount },
    removedLegacyDemoRecords,
    currentPeriod: `${currentPeriod.s_year_code}/${currentPeriod.s_term_code}`,
    scopes: scopes.length,
    plansCreated: createdPlanIds.length,
    currentPlans: currentPlans.length,
    registrationRunsCreated: registrationRuns,
    completionRunsCreated: completionRuns,
  }));
}

main().catch((error) => {
  console.error(error instanceof Error ? error.stack : error);
  process.exitCode = 1;
});
