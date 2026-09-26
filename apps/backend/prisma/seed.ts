import { PrismaClient } from "@prisma/client";
import { hashPassword } from "../lib/auth/password";

const prisma = new PrismaClient();

function getSeedPassword(envVar: string, defaultName: string): string {
  const explicit = process.env[envVar]?.trim();
  if (explicit) return explicit;
  const common = process.env.SEED_DEMO_PASSWORD?.trim();
  if (common) return common;
  if (process.env.NODE_ENV === "production") {
    throw new Error(`Environment variable ${envVar} is required for seeding in production environments`);
  }
  return `${defaultName}@Dev2026`;
}

const permissions = [
  ["student.read", "Xem sinh viên", "student", "read"],
  ["student.create", "Tạo sinh viên", "student", "create"],
  ["student.update", "Cập nhật sinh viên", "student", "update"],
  ["student.delete", "Xóa sinh viên", "student", "delete"],
  ["student.import", "Nhập sinh viên", "student", "import"],
  ["student.export", "Xuất sinh viên", "student", "export"],
  ["grade.read", "Xem điểm", "grade", "read"],
  ["grade.import", "Nhập điểm", "grade", "import"],
  ["grade.export", "Xuất điểm", "grade", "export"],
  ["decision.read", "Xem quyết định", "decision", "read"],
  ["decision.create", "Tạo quyết định", "decision", "create"],
  ["decision.update", "Cập nhật quyết định", "decision", "update"],
  ["decision.delete", "Xóa quyết định", "decision", "delete"],
  ["decision.import", "Nhập quyết định", "decision", "import"],
  ["decision.export", "Xuất quyết định", "decision", "export"],
  ["fee_policy.read", "Xem chính sách học phí", "fee_policy", "read"],
  ["fee_policy.create", "Tạo chính sách học phí", "fee_policy", "create"],
  ["fee_policy.update", "Cập nhật chính sách học phí", "fee_policy", "update"],
  ["fee_policy.delete", "Xóa chính sách học phí", "fee_policy", "delete"],
  ["fee_policy.import", "Nhập chính sách học phí", "fee_policy", "import"],
  ["fee_policy.export", "Xuất chính sách học phí", "fee_policy", "export"],
  ["class.manage", "Quản lý lớp và khóa", "class", "manage"],
  ["academic_term.manage", "Quản lý học kỳ và CTĐT", "academic_term", "manage"],
  ["progress.read", "Xem tiến độ", "progress", "read"],
  ["progress.plan.manage", "Quản lý kế hoạch tiến độ", "progress", "manage"],
  ["progress.calculate", "Tính tiến độ", "progress", "calculate"],
  ["graduation.read", "Xem dự kiến tốt nghiệp", "graduation", "read"],
  ["graduation.evaluate", "Chạy đánh giá tốt nghiệp", "graduation", "evaluate"],
  ["graduation.export", "Xuất kết quả dự kiến tốt nghiệp", "graduation", "export"],
  ["academic_warning.read", "Xem cảnh báo", "academic_warning", "read"],
  ["academic_warning.calculate", "Tính cảnh báo", "academic_warning", "calculate"],
  ["academic_warning.policy.manage", "Quản lý chính sách cảnh báo", "academic_warning_policy", "manage"],
  ["academic_warning.action.create", "Tạo hồ sơ hỗ trợ", "academic_warning_action", "create"],
  ["academic_warning.action.update", "Cập nhật hồ sơ hỗ trợ", "academic_warning_action", "update"],
  ["report.export", "Xuất báo cáo", "report", "export"],
  ["user.manage", "Quản lý tài khoản", "user", "manage"],
  ["role.manage", "Quản lý vai trò và quyền", "role", "manage"],
  ["advisor_assignment.manage", "Quản lý phân công cố vấn", "advisor_assignment", "manage"],
] as const;

async function seedRbac() {
  const permissionRows = await Promise.all(
    permissions.map(([code, name, resource, action]) =>
      prisma.permission.upsert({
        where: { code },
        update: { name, resource, action, isAssignable: true },
        create: { code, name, resource, action, isAssignable: true },
      }),
    ),
  );

  const adminRole = await prisma.role.upsert({
    where: { code: "admin" },
    update: { name: "Quản trị hệ thống", dataScope: "system", isSystem: true, isActive: true, deletedAt: null },
    create: { code: "admin", name: "Quản trị hệ thống", dataScope: "system", isSystem: true },
  });

  const facultyRole = await prisma.role.upsert({
    where: { code: "faculty_manager" },
    update: { name: "Ban chủ nhiệm Khoa", dataScope: "faculty", isSystem: true, isActive: true, deletedAt: null },
    create: { code: "faculty_manager", name: "Ban chủ nhiệm Khoa", dataScope: "faculty", isSystem: true },
  });

  const advisorRole = await prisma.role.upsert({
    where: { code: "class_advisor" },
    update: { name: "Cố vấn học tập", dataScope: "assigned_classes", isSystem: true, isActive: true, deletedAt: null },
    create: { code: "class_advisor", name: "Cố vấn học tập", dataScope: "assigned_classes", isSystem: true },
  });

  const facultyManagerCodes = new Set([
    "student.read",
    "student.export",
    "grade.read",
    "decision.read",
    "fee_policy.read",
    "progress.read",
    "progress.calculate",
    "graduation.read",
    "graduation.evaluate",
    "graduation.export",
    "academic_warning.read",
    "academic_warning.calculate",
    "academic_warning.action.create",
    "academic_warning.action.update",
    "report.export",
  ]);

  const advisorCodes = new Set([
    "student.read",
    "grade.read",
    "decision.read",
    "fee_policy.read",
    "progress.read",
    "graduation.read",
    "graduation.export",
    "academic_warning.read",
    "academic_warning.action.create",
    "academic_warning.action.update",
    "report.export",
  ]);

  await prisma.rolePermission.deleteMany({
    where: { roleId: { in: [adminRole.id, facultyRole.id, advisorRole.id] } },
  });

  await prisma.rolePermission.createMany({
    data: [
      ...permissionRows.map((permission) => ({ roleId: adminRole.id, permissionId: permission.id })),
      ...permissionRows
        .filter((permission) => facultyManagerCodes.has(permission.code))
        .map((permission) => ({ roleId: facultyRole.id, permissionId: permission.id })),
      ...permissionRows
        .filter((permission) => advisorCodes.has(permission.code))
        .map((permission) => ({ roleId: advisorRole.id, permissionId: permission.id })),
    ],
    skipDuplicates: true,
  });

  // 1. Admin Account
  const adminUsername = process.env.SEED_ADMIN_USERNAME || "admin";
  const adminPassword = getSeedPassword("SEED_ADMIN_PASSWORD", "Admin");
  const existingAdmin = await prisma.user.findUnique({
    where: { username: adminUsername },
    select: { passwordHash: true },
  });
  const adminPasswordHash = existingAdmin?.passwordHash || (await hashPassword(adminPassword));
  const admin = await prisma.user.upsert({
    where: { username: adminUsername },
    update: { fullName: "Quản trị SEWS", isActive: true, deletedAt: null },
    create: { username: adminUsername, fullName: "Quản trị SEWS", passwordHash: adminPasswordHash },
  });
  await prisma.userRole.upsert({
    where: { userId_roleId: { userId: admin.id, roleId: adminRole.id } },
    update: {},
    create: { userId: admin.id, roleId: adminRole.id },
  });

  // 2. Ban chu nhiem Khoa Account
  const deanUsername = process.env.SEED_DEAN_USERNAME || "dean.demo";
  const deanPassword = getSeedPassword("SEED_DEAN_PASSWORD", "Dean");
  const existingDean = await prisma.user.findUnique({
    where: { username: deanUsername },
    select: { passwordHash: true },
  });
  const deanPasswordHash = existingDean?.passwordHash || (await hashPassword(deanPassword));
  const dean = await prisma.user.upsert({
    where: { username: deanUsername },
    update: { fullName: "Ban chủ nhiệm Khoa", isActive: true, deletedAt: null },
    create: { username: deanUsername, fullName: "Ban chủ nhiệm Khoa", passwordHash: deanPasswordHash },
  });
  await prisma.userRole.upsert({
    where: { userId_roleId: { userId: dean.id, roleId: facultyRole.id } },
    update: {},
    create: { userId: dean.id, roleId: facultyRole.id },
  });

  // Resolve facultyCode dynamically from active TrainingProgram
  let facultyCode = process.env.SEED_FACULTY_CODE?.trim();
  if (facultyCode) {
    const validProgram = await prisma.trainingProgram.findFirst({
      where: { s_faculty_code: facultyCode, deletedAt: null, isActive: true },
      select: { s_faculty_code: true },
    });
    if (!validProgram) {
      throw new Error(`Configured SEED_FACULTY_CODE="${facultyCode}" does not match any active TrainingProgram`);
    }
  } else {
    const validProgram = await prisma.trainingProgram.findFirst({
      where: { s_faculty_code: { not: null }, deletedAt: null, isActive: true },
      select: { s_faculty_code: true },
      orderBy: { s_faculty_code: "asc" },
    });
    if (!validProgram?.s_faculty_code) {
      throw new Error("Cannot seed faculty_manager: No active TrainingProgram with facultyCode found in database");
    }
    facultyCode = validProgram.s_faculty_code;
  }

  const deanStaffCode = process.env.SEED_DEAN_STAFF_CODE || `CB_${dean.username.replace(/[^A-Za-z0-9]/g, "_").toUpperCase()}`;
  await prisma.lecturerProfile.upsert({
    where: { userId: dean.id },
    update: { facultyCode, staffCode: deanStaffCode },
    create: { userId: dean.id, staffCode: deanStaffCode, facultyCode },
  });

  // 3. GVCN / CVHT Account
  const advisorUsername = process.env.SEED_ADVISOR_USERNAME || "advisor.demo";
  const advisorPassword = getSeedPassword("SEED_ADVISOR_PASSWORD", "Advisor");
  const existingAdvisor = await prisma.user.findUnique({
    where: { username: advisorUsername },
    select: { passwordHash: true },
  });
  const advisorPasswordHash = existingAdvisor?.passwordHash || (await hashPassword(advisorPassword));
  const advisor = await prisma.user.upsert({
    where: { username: advisorUsername },
    update: { fullName: "Cố vấn học tập", isActive: true, deletedAt: null },
    create: { username: advisorUsername, fullName: "Cố vấn học tập", passwordHash: advisorPasswordHash },
  });
  await prisma.userRole.upsert({
    where: { userId_roleId: { userId: advisor.id, roleId: advisorRole.id } },
    update: {},
    create: { userId: advisor.id, roleId: advisorRole.id },
  });

  const advisorStaffCode = process.env.SEED_ADVISOR_STAFF_CODE || `CB_${advisor.username.replace(/[^A-Za-z0-9]/g, "_").toUpperCase()}`;
  await prisma.lecturerProfile.upsert({
    where: { userId: advisor.id },
    update: { staffCode: advisorStaffCode },
    create: { userId: advisor.id, staffCode: advisorStaffCode },
  });

  // Check if advisor already has an active assignment
  const existingAdvisorAssignment = await prisma.classAdvisorAssignment.findFirst({
    where: { userId: advisor.id, status: "active", revokedAt: null },
    orderBy: { assignedAt: "desc" },
  });

  let assignedClassCode: string | null = null;
  let assignedTermCode: string | null = null;

  if (existingAdvisorAssignment) {
    const [c, t] = await Promise.all([
      prisma.class.findUnique({ where: { id: existingAdvisorAssignment.classId }, select: { classId: true } }),
      prisma.academicTerm.findUnique({ where: { id: existingAdvisorAssignment.academicTermId }, select: { sTermCode: true } }),
    ]);
    assignedClassCode = c?.classId || existingAdvisorAssignment.classId;
    assignedTermCode = t?.sTermCode || existingAdvisorAssignment.academicTermId;
  } else {
    // Resolve target AcademicTerm
    let targetTermId = process.env.SEED_ADVISOR_TERM_ID?.trim();
    if (!targetTermId && process.env.SEED_ADVISOR_TERM_CODE?.trim()) {
      const termByCode = await prisma.academicTerm.findFirst({
        where: { sTermCode: process.env.SEED_ADVISOR_TERM_CODE.trim(), deletedAt: null },
        select: { id: true },
      });
      targetTermId = termByCode?.id;
    }
    if (!targetTermId) {
      const activeTerm = await prisma.academicTerm.findFirst({
        where: { OR: [{ isCurrent: true }, { status: "active" }], deletedAt: null },
        select: { id: true },
        orderBy: { sTermCode: "desc" },
      });
      targetTermId = activeTerm?.id;
    }
    if (!targetTermId) {
      const anyTerm = await prisma.academicTerm.findFirst({
        where: { deletedAt: null },
        select: { id: true },
        orderBy: { sTermCode: "desc" },
      });
      targetTermId = anyTerm?.id;
    }

    if (!targetTermId) {
      console.warn("WARNING: No valid AcademicTerm found in database to assign advisor.demo.");
    } else {
      // Find all classes already assigned to ANY advisor in this term
      const occupiedInTerm = await prisma.classAdvisorAssignment.findMany({
        where: { academicTermId: targetTermId, status: "active", revokedAt: null },
        select: { classId: true },
      });
      const occupiedClassIds = new Set(occupiedInTerm.map((item) => item.classId));

      let chosenClass: { id: string; classId: string } | null = null;

      // If explicit class requested via env
      const explicitClassCode = process.env.SEED_ADVISOR_CLASS_CODE?.trim();
      const explicitClassId = process.env.SEED_ADVISOR_CLASS_ID?.trim();
      if (explicitClassId || explicitClassCode) {
        const foundExplicit = await prisma.class.findFirst({
          where: {
            OR: [
              ...(explicitClassId ? [{ id: explicitClassId }] : []),
              ...(explicitClassCode ? [{ classId: explicitClassCode }] : []),
            ],
            deletedAt: null,
            isActive: true,
          },
          select: { id: true, classId: true },
        });
        if (foundExplicit) {
          if (occupiedClassIds.has(foundExplicit.id)) {
            console.warn(
              `WARNING: Requested class "${foundExplicit.classId}" is already assigned to another advisor in term. Looking for an unassigned class deterministically...`
            );
          } else {
            chosenClass = foundExplicit;
          }
        }
      }

      // If no explicit class or explicit was occupied, deterministically pick an unoccupied class with active students
      if (!chosenClass) {
        const activeStudents = await prisma.student.findMany({
          where: { sClassStudentId: { not: null }, sIsInClass: true, deletedAt: null },
          select: { sClassStudentId: true },
          distinct: ["sClassStudentId"],
          orderBy: { sClassStudentId: "asc" },
        });
        const activeStudentClassCodes = activeStudents
          .map((s) => s.sClassStudentId)
          .filter((code): code is string => Boolean(code));

        const candidateWithStudents = await prisma.class.findFirst({
          where: {
            id: { notIn: Array.from(occupiedClassIds) },
            classId: { in: activeStudentClassCodes },
            deletedAt: null,
            isActive: true,
          },
          select: { id: true, classId: true },
          orderBy: { classId: "asc" },
        });
        if (candidateWithStudents) {
          chosenClass = candidateWithStudents;
        } else {
          // Fallback to any active class without assignment
          const fallbackCandidate = await prisma.class.findFirst({
            where: {
              id: { notIn: Array.from(occupiedClassIds) },
              deletedAt: null,
              isActive: true,
            },
            select: { id: true, classId: true },
            orderBy: { classId: "asc" },
          });
          chosenClass = fallbackCandidate || null;
        }
      }

      if (chosenClass) {
        const assignment = await prisma.classAdvisorAssignment.create({
          data: {
            userId: advisor.id,
            classId: chosenClass.id,
            academicTermId: targetTermId,
            status: "active",
            assignedById: admin.id,
          },
          select: { id: true, classId: true, academicTermId: true },
        });

        const term = await prisma.academicTerm.findUnique({
          where: { id: assignment.academicTermId },
          select: { sTermCode: true },
        });
        assignedClassCode = chosenClass.classId;
        assignedTermCode = term?.sTermCode || assignment.academicTermId;
      } else {
        console.warn(
          "WARNING: Could not find any unoccupied active Class in target term to assign advisor.demo. Existing business assignments preserved."
        );
      }
    }
  }

  return {
    adminUsername,
    deanUsername,
    facultyCode,
    advisorUsername,
    assignedClassCode,
    assignedTermCode,
    adminCreated: !existingAdmin,
    deanCreated: !existingDean,
    advisorCreated: !existingAdvisor,
  };
}

async function main() {
  const accounts = await seedRbac();
  console.log("SEWS authentication and RBAC seed completed. Business data is imported separately.");
  console.log(`- Admin account: ${accounts.adminUsername} (status: ${accounts.adminCreated ? "created" : "existing"})`);
  console.log(`- Dean account: ${accounts.deanUsername} (faculty: ${accounts.facultyCode}, status: ${accounts.deanCreated ? "created" : "existing"})`);
  if (accounts.assignedClassCode) {
    console.log(`- Advisor account: ${accounts.advisorUsername} (class: ${accounts.assignedClassCode}, term: ${accounts.assignedTermCode}, status: ${accounts.advisorCreated ? "created" : "existing"})`);
  } else {
    console.log(`- Advisor account: ${accounts.advisorUsername} (no class assigned, status: ${accounts.advisorCreated ? "created" : "existing"})`);
  }
  console.log("Passwords configured via environment variables or development defaults. Passwords are never logged.");
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
