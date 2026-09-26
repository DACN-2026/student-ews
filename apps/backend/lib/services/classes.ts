import { prisma } from "@/lib/prisma";
import { ApiError } from "@/lib/utils/api-error";
import { Prisma } from "@prisma/client";

export class ClassesService {
  static async list(search = "", page = 1, pageSize = 20, scopeWhere: Prisma.ClassWhereInput = {}) {
    const query = search.trim();
    const where: Prisma.ClassWhereInput = {
      AND: [
        { deletedAt: null },
        scopeWhere,
        ...(query
          ? [
              {
                OR: [
                  { classId: { contains: query, mode: "insensitive" as Prisma.QueryMode } },
                  { className: { contains: query, mode: "insensitive" as Prisma.QueryMode } },
                ],
              },
            ]
          : []),
      ],
    };
    const [total, classes] = await Promise.all([
      prisma.class.count({ where }),
      prisma.class.findMany({
        where,
        skip: (page - 1) * pageSize,
        take: pageSize,
        orderBy: [{ className: "asc" }, { classId: "asc" }],
      }),
    ]);

    const cohortIds = classes.map((c) => c.cohortId).filter(Boolean) as string[];
    const cohorts = await prisma.cohort.findMany({
      where: { id: { in: cohortIds } },
    });
    const cohortMap = Object.fromEntries(cohorts.map((c) => [c.id, c]));

    // Count students for each class
    const counts = await prisma.student.groupBy({
      by: ["sClassStudentId"],
      _count: { _all: true },
      where: { deletedAt: null },
    });

    const countMap: Record<string, number> = {};
    for (const c of counts) {
      if (c.sClassStudentId) {
        countMap[c.sClassStudentId] = c._count._all;
      }
    }

    const items = classes.map((c) => {
      const cohort = c.cohortId ? cohortMap[c.cohortId] : null;
      return {
        id: c.id,
        classId: c.classId,
        className: c.className,
        cohortId: c.cohortId,
        cohortCode: cohort?.sCohortCode,
        cohortName: cohort?.sCohortName,
        studentCount: countMap[c.classId] || 0,
        createdAt: c.createdAt,
        updatedAt: c.updatedAt,
      };
    });
    return { items, total, page, pageSize };
  }

  static async getById(id: string, scopeWhere: Prisma.ClassWhereInput = {}) {
    const cls = await prisma.class.findFirst({
      where: {
        AND: [
          { OR: [{ id }, { classId: id }] },
          { deletedAt: null },
          scopeWhere,
        ],
      },
    });

    if (!cls) return null;

    const cohort = cls.cohortId
      ? await prisma.cohort.findUnique({ where: { id: cls.cohortId } })
      : null;

    const studentCount = await prisma.student.count({
      where: { sClassStudentId: cls.classId, deletedAt: null },
    });

    return {
      id: cls.id,
      classId: cls.classId,
      className: cls.className,
      cohortId: cls.cohortId,
      cohort,
      studentCount,
      createdAt: cls.createdAt,
      updatedAt: cls.updatedAt,
    };
  }

  static async create(data: { classId: string; className: string; cohortId?: string }) {
    if (data.cohortId) {
      const cohort = await prisma.cohort.findFirst({ where: { id: data.cohortId, deletedAt: null } });
      if (!cohort) throw new ApiError("Cohort not found", "VALIDATION_ERROR", 422);
    }
    const created = await prisma.class.create({
      data: {
        classId: data.classId,
        className: data.className,
        cohortId: data.cohortId || null,
      },
    });
    return created;
  }

  static async update(id: string, data: { classId?: string; className?: string; cohortId?: string | null; isActive?: boolean }) {
    if (data.cohortId) {
      const cohort = await prisma.cohort.findFirst({ where: { id: data.cohortId, deletedAt: null } });
      if (!cohort) throw new ApiError("Cohort not found", "VALIDATION_ERROR", 422);
    }
    return prisma.class.update({
      where: { id },
      data: {
        ...(data.classId !== undefined ? { classId: data.classId.trim() } : {}),
        ...(data.className !== undefined ? { className: data.className.trim() } : {}),
        ...(data.cohortId !== undefined ? { cohortId: data.cohortId || null } : {}),
        ...(data.isActive !== undefined ? { isActive: data.isActive } : {}),
      },
    });
  }

  static async remove(id: string) {
    return prisma.class.update({ where: { id }, data: { deletedAt: new Date(), isActive: false } });
  }

  static async import(items: Array<{ classId?: unknown; className?: unknown }>) {
    const normalized = items.map((item, index) => {
      const classId = typeof item.classId === "string" ? item.classId.trim() : "";
      const className = typeof item.className === "string" ? item.className.trim() : "";
      if (!classId || !className) {
        throw new ApiError(`Invalid class at row ${index + 1}`, "IMPORT_FAILED", 422);
      }
      return { classId, className };
    });

    return prisma.$transaction(async (tx) => {
      const existing = await tx.class.findMany({
        where: { classId: { in: normalized.map((item) => item.classId) } },
        select: { classId: true },
      });
      const existingCodes = new Set(existing.map((item) => item.classId));
      for (const item of normalized) {
        await tx.class.upsert({
          where: { classId: item.classId },
          create: { classId: item.classId, className: item.className },
          update: { className: item.className, deletedAt: null, isActive: true },
        });
      }
      return {
        total: normalized.length,
        created: normalized.filter((item) => !existingCodes.has(item.classId)).length,
        updated: normalized.filter((item) => existingCodes.has(item.classId)).length,
      };
    });
  }
}
