import { prisma } from "@/lib/prisma";
import { isUUID, studentIdWhere } from "@/lib/utils/is-uuid";
import { ApiError } from "@/lib/utils/api-error";
import { Prisma, type DecisionType as DecisionTypeRecord } from "@prisma/client";
import { syncStudentClassDepartures } from "./student-class-departure";

function mapDecisionType(type: DecisionTypeRecord) {
  return {
    id: type.decisionTypeId,
    name: type.decisionName,
    category: type.category,
    isActive: type.isActive,
    createdAt: type.createdAt,
    updatedAt: type.updatedAt,
  };
}

export class DecisionsService {
  static async listTypes() {
    const types = await prisma.decisionType.findMany({
      where: { deletedAt: null },
      orderBy: { decisionTypeId: "asc" },
    });
    return types.map(mapDecisionType);
  }

  static async createType(data: { decisionTypeId?: number; decisionName: string; category?: string; isActive?: boolean }) {
    return prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext('decision_type_id'))`;
      const latest = data.decisionTypeId == null
        ? await tx.decisionType.findFirst({ orderBy: { decisionTypeId: "desc" } })
        : null;
      const created = await tx.decisionType.create({
        data: {
          decisionTypeId: data.decisionTypeId ?? (latest?.decisionTypeId || 0) + 1,
          decisionName: data.decisionName.trim(),
          category: data.category || "other",
          isActive: data.isActive ?? true,
        },
      });
      return mapDecisionType(created);
    });
  }

  static async updateType(id: number, data: { decisionName?: string; category?: string; isActive?: boolean }) {
    const updated = await prisma.decisionType.update({
      where: { decisionTypeId: id },
      data: {
        ...(data.decisionName !== undefined ? { decisionName: data.decisionName.trim() } : {}),
        ...(data.category !== undefined ? { category: data.category } : {}),
        ...(data.isActive !== undefined ? { isActive: data.isActive } : {}),
      },
    });
    await syncStudentClassDepartures(undefined, true);
    return mapDecisionType(updated);
  }

  static async removeType(id: number) {
    const removed = await prisma.decisionType.update({
      where: { decisionTypeId: id },
      data: { deletedAt: new Date(), isActive: false },
    });
    await syncStudentClassDepartures(undefined, true);
    return removed;
  }

  static async importTypes(items: Array<{
    id?: unknown;
    name?: unknown;
    decisionTypeId?: unknown;
    decisionName?: unknown;
    category?: unknown;
    isActive?: unknown;
  }>) {
    const normalized = items.map((item, index) => {
      const decisionTypeId = Number(item.id ?? item.decisionTypeId);
      const rawName = item.name ?? item.decisionName;
      const decisionName = typeof rawName === "string" ? rawName.trim() : "";
      if (!Number.isInteger(decisionTypeId) || decisionTypeId <= 0 || !decisionName) {
        throw new ApiError(`Invalid decision type at row ${index + 1}`, "IMPORT_FAILED", 422);
      }
      return {
        decisionTypeId,
        decisionName,
        category: typeof item.category === "string" && item.category.trim() ? item.category.trim() : "other",
        isActive: typeof item.isActive === "boolean" ? item.isActive : true,
      };
    });
    const result = await prisma.$transaction(async (tx) => {
      const existing = await tx.decisionType.findMany({
        where: { decisionTypeId: { in: normalized.map((item) => item.decisionTypeId) } },
        select: { decisionTypeId: true },
      });
      const existingIds = new Set(existing.map((item) => item.decisionTypeId));
      for (const item of normalized) {
        await tx.decisionType.upsert({
          where: { decisionTypeId: item.decisionTypeId },
          create: item,
          update: { ...item, deletedAt: null },
        });
      }
      return {
        total: normalized.length,
        created: normalized.filter((item) => !existingIds.has(item.decisionTypeId)).length,
        updated: normalized.filter((item) => existingIds.has(item.decisionTypeId)).length,
      };
    });
    await syncStudentClassDepartures(undefined, true);
    return result;
  }

  static async list(studentId: string) {
    const student = await prisma.student.findFirst({
      where: {
        ...studentIdWhere(studentId),
        deletedAt: null,
      },
    });

    if (!student) return [];

    const decisions = await prisma.studentDecision.findMany({
      where: { studentId: student.id, deletedAt: null },
      orderBy: { sSignDate: "desc" },
    });

    const typeIds = decisions.map((d) => d.decisionTypeId);
    const types = await prisma.decisionType.findMany({
      where: { decisionTypeId: { in: typeIds } },
    });
    const typeMap = Object.fromEntries(types.map((t) => [t.decisionTypeId, t]));

    return decisions.map((d) => ({
      id: d.id,
      studentId: d.studentId,
      decisionTypeId: d.decisionTypeId,
      decisionTypeName: typeMap[d.decisionTypeId]?.decisionName,
      category: typeMap[d.decisionTypeId]?.category,
      decisionNumber: d.sDecisionNumber,
      decisionName: d.sDecisionName,
      signDate: d.sSignDate ? new Date(d.sSignDate).toISOString().split("T")[0] : null,
      reason: d.sReason,
      fullText: d.sFullText,
      yearStudy: d.sYearStudy,
      termId: d.sTermId,
      isAcademicWarning: d.isAcademicWarning,
      createdAt: d.createdAt,
    }));
  }

  static async getById(decisionId: string, studentIdentifier?: string) {
    const decision = await prisma.studentDecision.findUnique({
      where: { id: decisionId },
    });

    if (!decision) return null;
    if (studentIdentifier) {
      const owner = await prisma.student.findFirst({
        where: { ...studentIdWhere(studentIdentifier), deletedAt: null },
        select: { id: true },
      });
      if (!owner || owner.id !== decision.studentId) return null;
    }

    const type = await prisma.decisionType.findUnique({
      where: { decisionTypeId: decision.decisionTypeId },
    });

    return {
      id: decision.id,
      studentId: decision.studentId,
      decisionTypeId: decision.decisionTypeId,
      decisionTypeName: type?.decisionName,
      category: type?.category,
      decisionNumber: decision.sDecisionNumber,
      decisionName: decision.sDecisionName,
      signDate: decision.sSignDate ? new Date(decision.sSignDate).toISOString().split("T")[0] : null,
      reason: decision.sReason,
      fullText: decision.sFullText,
      yearStudy: decision.sYearStudy,
      termId: decision.sTermId,
      isAcademicWarning: decision.isAcademicWarning,
      createdAt: decision.createdAt,
    };
  }

  static async create(studentId: string, data: any) {
    const student = await prisma.student.findFirst({
      where: {
        ...studentIdWhere(studentId),
        deletedAt: null,
      },
    });

    if (!student) throw new Error("Student not found");

    const term = await prisma.academicTerm.findFirst({
      where: { deletedAt: null },
      orderBy: [{ isCurrent: "desc" }, { updatedAt: "desc" }],
    });
    if (!term) throw new Error("No academic term found");
    const year = await prisma.academicYear.findUnique({ where: { id: term.academicYearId } });

    const created = await prisma.studentDecision.create({
      data: {
        studentId: student.id,
        academicYearId: term.academicYearId,
        academicTermId: term.id,
        decisionTypeId: Number(data.decisionTypeId) || 1,
        sStudentId: student.sStudentId,
        sYearStudy: data.yearStudy || year?.sYearCode || "",
        sTermId: data.termId || term.sTermCode,
        sDecisionNumber: data.decisionNumber || data.decisionNo || "",
        sDecisionName: data.decisionName || "",
        sSignDate: data.signDate ? new Date(data.signDate) : null,
        sReason: data.reason || "",
        sFullText: data.fullText || data.notes || "",
        isAcademicWarning: data.isAcademicWarning ?? false,
      },
    });

    await syncStudentClassDepartures([student.id], true);
    return this.getById(created.id);
  }

  static async update(studentIdentifier: string, decisionId: string, data: any) {
    const existing = await this.getById(decisionId, studentIdentifier);
    if (!existing) throw new ApiError("Decision not found for student", "NOT_FOUND", 404);
    const updateData: any = {};
    if (data.decisionTypeId) updateData.decisionTypeId = Number(data.decisionTypeId);
    if (data.decisionNumber) updateData.sDecisionNumber = data.decisionNumber;
    if (data.decisionName) updateData.sDecisionName = data.decisionName;
    if (data.signDate) updateData.sSignDate = new Date(data.signDate);
    if (data.reason !== undefined) updateData.sReason = data.reason;
    if (data.fullText !== undefined) updateData.sFullText = data.fullText;

    const updated = await prisma.studentDecision.update({
      where: { id: decisionId },
      data: updateData,
    });

    await syncStudentClassDepartures([updated.studentId], true);
    return this.getById(updated.id);
  }

  static async delete(studentIdentifier: string, decisionId: string) {
    const existing = await this.getById(decisionId, studentIdentifier);
    if (!existing) throw new ApiError("Decision not found for student", "NOT_FOUND", 404);
    await prisma.studentDecision.update({
      where: { id: decisionId },
      data: { deletedAt: new Date() },
    });
    await syncStudentClassDepartures([existing.studentId], true);
    return true;
  }

  static async importDecisions(items: any[], studentScope: Prisma.StudentWhereInput = {}) {
    const errors: string[] = [];
    const normalizeTermCode = (value: unknown) => {
      const code = String(value || "").trim().toUpperCase();
      if (code === "HK1") return "HK01";
      if (code === "HK2") return "HK02";
      if (code === "HK3" || code === "HE") return "HK03";
      return code;
    };
    const requestedPairs = items
      .map((item) => ({
        yearCode: String(item?.yearStudy ?? item?.academicYear ?? "").trim(),
        termCode: normalizeTermCode(item?.termId ?? item?.termCode),
      }))
      .filter((item) => item.yearCode && item.termCode);
    const requestedYearCodes = [...new Set(requestedPairs.map((item) => item.yearCode))];
    const years = requestedYearCodes.length
      ? await prisma.academicYear.findMany({
          where: { sYearCode: { in: requestedYearCodes }, deletedAt: null },
        })
      : [];
    const yearByCode = new Map(years.map((year) => [year.sYearCode, year]));

    const requestedTermCodes = [...new Set(requestedPairs.map((item) => item.termCode))];
    const requestedYearIds = years.map((year) => year.id);
    const terms = requestedYearIds.length && requestedTermCodes.length
      ? await prisma.academicTerm.findMany({
          where: {
            academicYearId: { in: requestedYearIds },
            sTermCode: { in: requestedTermCodes },
            deletedAt: null,
          },
        })
      : [];
    const termByKey = new Map(terms.map((term) => [`${term.academicYearId}|${term.sTermCode}`, term]));

    const targetByIndex = new Map<number, { yearId: string; yearCode: string; termId: string; termCode: string }>();
    items.forEach((item, index) => {
      const yearCode = String(item?.yearStudy ?? item?.academicYear ?? "").trim();
      const termCode = normalizeTermCode(item?.termId ?? item?.termCode);
      if (!yearCode || !termCode) {
        errors.push(`Row ${index + 1}: yearStudy and termId must be provided together`);
        return;
      }
      const year = yearByCode.get(yearCode);
      const term = year ? termByKey.get(`${year.id}|${termCode}`) : null;
      if (!year || !term) {
        errors.push(`Row ${index + 1}: academic term not found (${yearCode} ${termCode})`);
        return;
      }
      targetByIndex.set(index, { yearId: year.id, yearCode, termId: term.id, termCode });
    });

    const identifiers = [...new Set(items.map((item) => String(item?.studentId || "").trim()).filter(Boolean))];
    const uuidIds = identifiers.filter(isUUID);
    const students = await prisma.student.findMany({
      where: { AND: [{ deletedAt: null, OR: [{ sStudentId: { in: identifiers } }, { id: { in: uuidIds } }] }, studentScope] },
      select: { id: true, sStudentId: true },
    });
    const studentMap = new Map(students.flatMap((student) => [[student.id, student], [student.sStudentId, student]]));
    const typeIds = [...new Set(items.map((item) => Number(item?.decisionTypeId)).filter(Number.isInteger))];
    const validTypes = new Set((await prisma.decisionType.findMany({
      where: { decisionTypeId: { in: typeIds }, deletedAt: null, isActive: true },
      select: { decisionTypeId: true },
    })).map((type) => type.decisionTypeId));
    const existing = await prisma.studentDecision.findMany({
      where: {
        studentId: { in: students.map((student) => student.id) },
        academicTermId: { in: [...new Set([...targetByIndex.values()].map((target) => target.termId))] },
        deletedAt: null,
      },
      select: { studentId: true, academicTermId: true, decisionTypeId: true, sDecisionNumber: true },
    });
    const naturalKey = (studentId: string, termId: string, typeId: number, number: string) =>
      `${studentId}|${termId}|${typeId}|${number.trim()}`;
    const seen = new Set(existing.map((item) => naturalKey(item.studentId, item.academicTermId, item.decisionTypeId, item.sDecisionNumber)));
    const rows: Prisma.StudentDecisionCreateManyInput[] = [];

    items.forEach((item, index) => {
      const identifier = String(item?.studentId || "").trim();
      const student = studentMap.get(identifier);
      const typeId = Number(item?.decisionTypeId);
      const decisionNumber = String(item?.decisionNumber || "").trim();
      const signDate = item?.signDate ? new Date(item.signDate) : null;
      const target = targetByIndex.get(index);
      if (!target) return;
      if (!student) return errors.push(`Row ${index + 1}: student not found (${identifier || "missing studentId"})`);
      if (!validTypes.has(typeId)) return errors.push(`Row ${index + 1}: invalid decisionTypeId`);
      if (!decisionNumber) return errors.push(`Row ${index + 1}: decisionNumber is required`);
      if (signDate && Number.isNaN(signDate.getTime())) return errors.push(`Row ${index + 1}: invalid signDate`);
      const key = naturalKey(student.id, target.termId, typeId, decisionNumber);
      if (seen.has(key)) return errors.push(`Row ${index + 1}: duplicate decision skipped`);
      seen.add(key);
      rows.push({
        studentId: student.id,
        academicYearId: target.yearId,
        academicTermId: target.termId,
        decisionTypeId: typeId,
        sStudentId: student.sStudentId,
        sYearStudy: target.yearCode,
        sTermId: target.termCode,
        sDecisionNumber: decisionNumber,
        sDecisionName: String(item.decisionName || ""),
        sSignDate: signDate,
        sReason: String(item.reason || ""),
        sFullText: String(item.fullText || ""),
        isAcademicWarning: item.isAcademicWarning === true
          || item.isAcademicWarning === 1
          || ["1", "true", "x"].includes(String(item.isAcademicWarning || "").trim().toLowerCase()),
        sourcePayload: item,
      });
    });
    let imported = 0;
    if (rows.length) {
      await prisma.$transaction(async (tx) => {
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext('decision-import'))`;
        const concurrentExisting = await tx.studentDecision.findMany({
          where: {
            studentId: { in: students.map((student) => student.id) },
            academicTermId: { in: [...new Set(rows.map((row) => row.academicTermId))] },
            deletedAt: null,
          },
          select: { studentId: true, academicTermId: true, decisionTypeId: true, sDecisionNumber: true },
        });
        const concurrentKeys = new Set(concurrentExisting.map((item) => naturalKey(item.studentId, item.academicTermId, item.decisionTypeId, item.sDecisionNumber)));
        const freshRows = rows.filter((row) => !concurrentKeys.has(naturalKey(row.studentId, row.academicTermId, row.decisionTypeId, row.sDecisionNumber)));
        if (freshRows.length) await tx.studentDecision.createMany({ data: freshRows });
        imported = freshRows.length;
      });
    }
    if (imported) await syncStudentClassDepartures([...new Set(rows.map(row => row.studentId))], true);
    return { imported, skipped: items.length - imported, total: items.length, errors };
  }
}
