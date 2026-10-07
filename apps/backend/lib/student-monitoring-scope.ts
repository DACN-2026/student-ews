import { prisma } from "@/lib/prisma";
import type { Prisma } from "@prisma/client";

/** Current monitoring excludes archived or departed students. The student
 * directory and individual historical records deliberately keep their scope. */
export const monitoredStudentWhere = {
  deletedAt: null,
  sIsInClass: true,
} satisfies Prisma.StudentWhereInput;

/** Snapshots retain departed students for history. Filter them before counting
 * and paginating operational lists, rather than deleting their results. */
export async function departedStudentIds(): Promise<string[]> {
  const students = await prisma.student.findMany({
    where: { OR: [{ sIsInClass: false }, { deletedAt: { not: null } }] },
    select: { id: true },
    orderBy: { id: "asc" },
  });
  return students.map(student => student.id);
}

export async function monitoredStudentResultWhere() {
  const ids = await departedStudentIds();
  return ids.length ? { studentId: { notIn: ids } } : {};
}
