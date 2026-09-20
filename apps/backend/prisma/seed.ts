import { PrismaClient } from "@prisma/client";
import { hashPassword } from "../lib/auth/password";

const prisma = new PrismaClient();

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
  const permissionRows = await Promise.all(permissions.map(([code, name, resource, action]) =>
    prisma.permission.upsert({
      where: { code },
      update: { name, resource, action, isAssignable: true },
      create: { code, name, resource, action, isAssignable: true },
    }),
  ));

  const adminRole = await prisma.role.upsert({
    where: { code: "admin" },
    update: { name: "Quản trị hệ thống", dataScope: "system", isSystem: true, isActive: true, deletedAt: null },
    create: { code: "admin", name: "Quản trị hệ thống", dataScope: "system", isSystem: true },
  });
  const advisorRole = await prisma.role.upsert({
    where: { code: "class_advisor" },
    update: { name: "Cố vấn học tập", dataScope: "assigned_classes", isSystem: true, isActive: true, deletedAt: null },
    create: { code: "class_advisor", name: "Cố vấn học tập", dataScope: "assigned_classes", isSystem: true },
  });

  await prisma.rolePermission.createMany({
    data: permissionRows.map((permission) => ({ roleId: adminRole.id, permissionId: permission.id })),
    skipDuplicates: true,
  });
  const advisorCodes = new Set([
    "student.read",
    "grade.read",
    "decision.read",
    "progress.read",
    "graduation.read",
    "graduation.export",
    "academic_warning.read",
    "academic_warning.action.create",
    "academic_warning.action.update",
    "report.export",
  ]);
  await prisma.rolePermission.createMany({
    data: permissionRows
      .filter((permission) => advisorCodes.has(permission.code))
      .map((permission) => ({ roleId: advisorRole.id, permissionId: permission.id })),
    skipDuplicates: true,
  });

  const adminUsername = process.env.SEED_ADMIN_USERNAME || "admin";
  const adminPassword = process.env.SEED_ADMIN_PASSWORD || "Admin@123456";
  const advisorUsername = process.env.SEED_ADVISOR_USERNAME || "advisor.demo";
  const advisorPassword = process.env.SEED_ADVISOR_PASSWORD || "Advisor@123456";
  const [existingAdmin, existingAdvisor] = await Promise.all([
    prisma.user.findUnique({ where: { username: adminUsername }, select: { passwordHash: true } }),
    prisma.user.findUnique({ where: { username: advisorUsername }, select: { passwordHash: true } }),
  ]);
  const [adminPasswordHash, advisorPasswordHash] = await Promise.all([
    existingAdmin?.passwordHash || hashPassword(adminPassword),
    existingAdvisor?.passwordHash || hashPassword(advisorPassword),
  ]);
  const admin = await prisma.user.upsert({
    where: { username: adminUsername },
    update: { fullName: "Quản trị SEWS", isActive: true, deletedAt: null },
    create: { username: adminUsername, fullName: "Quản trị SEWS", passwordHash: adminPasswordHash },
  });
  const advisor = await prisma.user.upsert({
    where: { username: advisorUsername },
    update: { fullName: "Cố vấn", isActive: true, deletedAt: null },
    create: { username: advisorUsername, fullName: "Cố vấn", passwordHash: advisorPasswordHash },
  });
  await prisma.userRole.createMany({
    data: [
      { userId: admin.id, roleId: adminRole.id },
      { userId: advisor.id, roleId: advisorRole.id },
    ],
    skipDuplicates: true,
  });
  return {
    adminUsername,
    adminPassword,
    advisorUsername,
    advisorPassword,
    adminCreated: !existingAdmin,
    advisorCreated: !existingAdvisor,
  };
}

async function main() {
  const accounts = await seedRbac();
  console.log("SEWS authentication and RBAC seed completed. Business data is imported from Apidog separately.");
  console.log(`Admin: ${accounts.adminUsername}${accounts.adminCreated ? ` / ${accounts.adminPassword}` : " (existing password preserved)"}`);
  console.log(`Advisor: ${accounts.advisorUsername}${accounts.advisorCreated ? ` / ${accounts.advisorPassword}` : " (existing password preserved)"}`);
  console.log("Change these passwords immediately outside local development environments.");
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
