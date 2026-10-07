import { prisma } from "@/lib/prisma";

/** Shared append-only history for case detail and the student's profile.
 * Callers must authorize the student/case before requesting these IDs. */
export async function loadWarningActionHistory(caseIds: string[]) {
  if (!caseIds.length) return [];
  const events = await prisma.warningActionEvent.findMany({
    where: { warningActionId: { in: caseIds } },
    orderBy: [{ createdAt: "asc" }, { id: "asc" }],
  });
  const actorIds = [...new Set(events.flatMap(event => event.actorUserId ? [event.actorUserId] : []))];
  const resultId = (details: unknown) => details && typeof details === "object" && "warningResultId" in details && typeof details.warningResultId === "string" ? details.warningResultId : null;
  const resultIds = [...new Set(events.flatMap(event => resultId(event.details) ? [resultId(event.details)!] : []))];
  const runIds = [...new Set(events.flatMap(event => event.sourceRunId ? [event.sourceRunId] : []))];
  const [actors, results, runs] = await Promise.all([
    actorIds.length ? prisma.user.findMany({ where: { id: { in: actorIds } }, select: { id: true, fullName: true } }) : [],
    resultIds.length ? prisma.academicWarningStudentResult.findMany({
      where: { id: { in: resultIds }, runId: { in: runIds } },
      select: { id: true, runId: true, termGpa4: true, cumulativeGpa4: true, reasonCount: true },
    }) : [],
    runIds.length ? prisma.academicWarningRun.findMany({ where: { id: { in: runIds } }, select: { id: true, assessmentAcademicTermId: true } }) : [],
  ]);
  const terms = runs.length ? await prisma.academicTerm.findMany({
    where: { id: { in: [...new Set(runs.map(run => run.assessmentAcademicTermId))] } },
    select: { id: true, sTermCode: true, academicYearId: true },
  }) : [];
  const years = terms.length ? await prisma.academicYear.findMany({
    where: { id: { in: [...new Set(terms.map(term => term.academicYearId))] } }, select: { id: true, sYearCode: true },
  }) : [];
  const resultById = new Map(results.map(result => [result.id, result]));
  const termByRun = new Map(runs.map(run => [run.id, terms.find(term => term.id === run.assessmentAcademicTermId)]));
  const yearById = new Map(years.map(year => [year.id, year.sYearCode]));
  const actorById = new Map(actors.map(actor => [actor.id, actor.fullName]));
  return events.map(event => {
    const term = event.sourceRunId ? termByRun.get(event.sourceRunId) : null;
    const result = resultById.get(resultId(event.details) || "");
    const matchingResult = result?.runId === event.sourceRunId ? result : null;
    return {
      id: event.id,
      caseId: event.warningActionId,
      eventType: event.eventType,
      actor: event.actorUserId ? { userId: event.actorUserId, displayName: actorById.get(event.actorUserId) || null } : null,
      systemGenerated: event.systemGenerated,
      sourceRunId: event.sourceRunId,
      createdAt: event.createdAt,
      details: event.details,
      warningContext: term ? {
        termCode: term.sTermCode,
        academicYear: yearById.get(term.academicYearId) || null,
        // Always use this event's persisted result, never the latest result.
        result: matchingResult ? {
          termGpa4: matchingResult.termGpa4 != null ? Number(matchingResult.termGpa4) : null,
          cumulativeGpa4: matchingResult.cumulativeGpa4 != null ? Number(matchingResult.cumulativeGpa4) : null,
          reasonCount: matchingResult.reasonCount,
        } : null,
      } : null,
    };
  });
}
