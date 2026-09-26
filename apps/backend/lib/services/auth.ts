import { prisma } from "@/lib/prisma";
import { comparePassword } from "@/lib/auth/password";
import { signAccessToken } from "@/lib/auth/jwt";
import { randomToken, sha256Hex } from "@/lib/utils/crypto";
import { getActorById } from "@/lib/auth/get-actor";
import type { Actor, AuthTokens, UserProfile } from "@/lib/auth/types";

export class AuthService {
  static async login(
    username: string,
    password: string
  ): Promise<{ user: UserProfile; tokens: AuthTokens; actor: Actor } | null> {
    const trimmed = username.trim();
    if (!trimmed || !password) return null;

    const user = await prisma.user.findFirst({
      where: {
        username: trimmed,
        deletedAt: null,
      },
    });

    if (!user || !user.isActive) return null;

    const passwordValid = await comparePassword(password, user.passwordHash);
    if (!passwordValid) return null;

    const actor = await getActorById(user.id);
    if (!actor) return null;

    const { token: accessToken, expiresAt } = await signAccessToken(user.id, user.username, actor, "15m");

    // Create refresh token
    const rawRefresh = randomToken(48);
    const tokenHash = sha256Hex(rawRefresh);
    const refreshExpiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000); // 30 days

    await prisma.$transaction(async (tx) => {
      const retentionCutoff = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
      await tx.refreshToken.deleteMany({
        where: {
          OR: [
            { expiresAt: { lt: retentionCutoff } },
            { revokedAt: { lt: retentionCutoff } },
          ],
        },
      });
      await tx.refreshToken.create({
        data: {
          userId: user.id,
          tokenHash,
          expiresAt: refreshExpiresAt,
        },
      });
    });

    const context = await AuthService.resolveUserContext(user.id);

    return {
      user: {
        id: user.id,
        username: user.username,
        email: user.email,
        fullName: user.fullName,
        isActive: user.isActive,
        facultyCode: context.facultyCode,
        className: context.className,
        classFullName: context.classFullName,
      },
      tokens: {
        accessToken,
        refreshToken: rawRefresh,
        expiresAt: expiresAt.toISOString(),
      },
      actor,
    };
  }

  static async refresh(rawRefreshToken: string): Promise<AuthTokens | null> {
    const trimmed = rawRefreshToken.trim();
    if (!trimmed) return null;

    const tokenHash = sha256Hex(trimmed);

    const tokenRecord = await prisma.refreshToken.findFirst({
      where: {
        tokenHash,
        revokedAt: null,
        expiresAt: { gt: new Date() },
      },
    });

    if (!tokenRecord) return null;

    const user = await prisma.user.findFirst({
      where: { id: tokenRecord.userId, deletedAt: null, isActive: true },
    });

    if (!user) return null;

    const actor = await getActorById(user.id);
    if (!actor) return null;

    // Rotate refresh token
    const newRawRefresh = randomToken(48);
    const newTokenHash = sha256Hex(newRawRefresh);
    const newRefreshExpiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);

    try {
      await prisma.$transaction(async (tx) => {
        const newTokenRecord = await tx.refreshToken.create({
          data: {
            userId: tokenRecord.userId,
            tokenHash: newTokenHash,
            expiresAt: newRefreshExpiresAt,
          },
        });
        const revoked = await tx.refreshToken.updateMany({
          where: {
            id: tokenRecord.id,
            revokedAt: null,
            expiresAt: { gt: new Date() },
          },
          data: {
            revokedAt: new Date(),
            replacedBy: newTokenRecord.id,
          },
        });
        if (revoked.count !== 1) throw new Error("REFRESH_TOKEN_ALREADY_ROTATED");
      });
    } catch (error) {
      if (error instanceof Error && error.message === "REFRESH_TOKEN_ALREADY_ROTATED") return null;
      throw error;
    }

    // Generate new access token
    const { token: accessToken, expiresAt } = await signAccessToken(
      user.id,
      user.username,
      actor,
      "15m"
    );

    return {
      accessToken,
      refreshToken: newRawRefresh,
      expiresAt: expiresAt.toISOString(),
    };
  }

  static async revoke(rawRefreshToken: string | null): Promise<void> {
    if (!rawRefreshToken) return;
    await prisma.refreshToken.updateMany({
      where: { tokenHash: sha256Hex(rawRefreshToken), revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }

  private static async resolveUserContext(userId: string) {
    const [lecturer, advisorAssignment] = await Promise.all([
      prisma.lecturerProfile.findUnique({
        where: { userId },
        select: { facultyCode: true, staffCode: true },
      }),
      prisma.classAdvisorAssignment.findFirst({
        where: { userId, status: "active", revokedAt: null },
        orderBy: { assignedAt: "desc" },
      }),
    ]);

    let className: string | null = null;
    let classFullName: string | null = null;
    if (advisorAssignment) {
      const cls = await prisma.class.findUnique({
        where: { id: advisorAssignment.classId },
        select: { classId: true, className: true },
      });
      if (cls) {
        className = cls.classId;
        classFullName = cls.className;
      }
    }

    return {
      facultyCode: lecturer?.facultyCode || null,
      className,
      classFullName,
    };
  }

  static async getMe(userId: string): Promise<{ user: UserProfile; actor: Actor } | null> {
    const user = await prisma.user.findUnique({
      where: { id: userId, deletedAt: null },
    });

    if (!user) return null;

    const actor = await getActorById(userId);
    if (!actor) return null;

    const context = await AuthService.resolveUserContext(userId);

    return {
      user: {
        id: user.id,
        username: user.username,
        email: user.email,
        fullName: user.fullName,
        isActive: user.isActive,
        facultyCode: context.facultyCode,
        className: context.className,
        classFullName: context.classFullName,
      },
      actor,
    };
  }
}
