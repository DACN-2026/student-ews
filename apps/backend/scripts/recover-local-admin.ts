import assert from "node:assert/strict";
import { prisma } from "../lib/prisma";
import { hashPassword } from "../lib/auth/password";

/** Explicit local recovery only; preview by default. Never print the password. */
async function main() {
  const apply = process.argv.includes("--apply");
  const user = await prisma.user.findFirstOrThrow({ where: { username: "admin", deletedAt: null } });
  assert.ok(user.isActive, "Admin account is inactive; password recovery must not reactivate it implicitly.");
  const adminRole = await prisma.role.findFirstOrThrow({ where: { code: "admin", isActive: true, deletedAt: null } });
  await prisma.userRole.findFirstOrThrow({ where: { userId: user.id, roleId: adminRole.id } });
  const activeSessions = await prisma.refreshToken.count({ where: { userId: user.id, revokedAt: null } });
  if (!apply) {
    console.log(JSON.stringify({ mode: "preview", username: user.username, accountActive: true, role: "admin", activeRefreshSessions: activeSessions, changesApplied: false }));
    return;
  }
  const password = process.env.RECOVERY_ADMIN_PASSWORD;
  assert.ok(password && password.length >= 8, "RECOVERY_ADMIN_PASSWORD is required and must contain at least eight characters.");
  const passwordHash = await hashPassword(password);
  await prisma.$transaction(async tx => {
    const changed = await tx.user.updateMany({
      where: { id: user.id, username: "admin", deletedAt: null, isActive: true, passwordHash: user.passwordHash },
      data: { passwordHash },
    });
    assert.equal(changed.count, 1, "Account changed since inspection; recovery cancelled.");
    await tx.refreshToken.updateMany({ where: { userId: user.id, revokedAt: null }, data: { revokedAt: new Date() } });
    await tx.auditLog.create({ data: { actorId: null, action: "LOCAL_ADMIN_PASSWORD_RECOVERY", resourceType: "User", resourceId: user.id,
      details: { username: user.username, source: "explicit_local_recovery", refreshSessionsRevoked: true } } });
  });
  console.log(JSON.stringify({ mode: "apply", username: user.username, passwordReset: true, refreshSessionsRevoked: true }));
}
main().catch(error => { console.error(error.message); process.exitCode = 1; }).finally(() => prisma.$disconnect());
