import fs from "node:fs/promises";
import path from "node:path";
import { Prisma } from "@prisma/client";
import { prisma } from "../lib/prisma";
import { EARLY_WARNING_CASE_TYPE, SUPERSEDED_EARLY_WARNING_CASE_TYPE } from "../lib/services/warning-case-types";

async function main() {
  const apply = process.argv.includes("--apply");
  const repairs = await prisma.$transaction(async tx => {
    const cases = await tx.warningAction.findMany({where:{caseType:EARLY_WARNING_CASE_TYPE}});
    const runIds = [...new Set(cases.flatMap(c => [c.sourceWarningRunId,c.latestWarningRunId].filter(Boolean) as string[]))];
    const runs = await tx.academicWarningRun.findMany({where:{id:{in:runIds}},select:{id:true,completedAt:true}});
    const runById = new Map(runs.map(r => [r.id,r]));
    const candidates = cases.filter(c => c.status === "OPEN" && c.actorId === null && c.assignedUserId === null && c.nextFollowUpAt === null);
    const changes = [];
    for (const duplicate of candidates) {
      const sourceTime = runById.get(duplicate.sourceWarningRunId || "")?.completedAt;
      const latestTime = runById.get(duplicate.latestWarningRunId || "")?.completedAt;
      const canonical = cases.filter(c => c.id !== duplicate.id && c.studentId === duplicate.studentId && c.status === "RESOLVED" && c.resolvedAt && duplicate.createdAt > c.resolvedAt && sourceTime && sourceTime <= c.resolvedAt && latestTime && latestTime <= c.resolvedAt && c.latestWarningResultId === duplicate.latestWarningResultId)
        .sort((a,b) => b.resolvedAt!.getTime()-a.resolvedAt!.getTime())[0];
      if (!canonical) continue;
      const events = await tx.warningActionEvent.findMany({where:{warningActionId:duplicate.id}});
      if (!events.length || events.some(e => !e.systemGenerated || e.actorUserId || !["CASE_CREATED","WARNING_DETECTED","RISK_STATUS_CHANGED"].includes(e.eventType))) continue;
      const change = {duplicateId:duplicate.id,canonicalId:canonical.id,studentId:duplicate.studentId,original:duplicate,events};
      if (apply) {
        const changed = await tx.warningAction.updateMany({where:{id:duplicate.id,caseType:EARLY_WARNING_CASE_TYPE,status:"OPEN",updatedAt:duplicate.updatedAt},data:{caseType:SUPERSEDED_EARLY_WARNING_CASE_TYPE}});
        if (changed.count !== 1) throw new Error("Case changed while repairing; no changes applied");
        await tx.auditLog.create({data:{action:"intervention.replay_duplicate_archive",resourceType:"WarningAction",resourceId:duplicate.id,details:JSON.parse(JSON.stringify({canonicalCaseId:canonical.id,reason:"Historical reconciliation created another OPEN case after this result was resolved",original:duplicate,eventIds:events.map(e=>e.id)}))}});
      }
      changes.push(change);
    }
    return changes;
  },{isolationLevel:Prisma.TransactionIsolationLevel.Serializable,timeout:30000});
  if (apply && repairs.length) {
    const auditPath=path.resolve("../../docs/reports/intervention-replay-repair-2026-10-09.json");
    await fs.writeFile(auditPath,JSON.stringify({appliedAt:new Date().toISOString(),repairs},null,2));
  }
  console.log(JSON.stringify({apply,count:repairs.length,cases:repairs.map(r=>({duplicateId:r.duplicateId,canonicalId:r.canonicalId,studentId:r.studentId}))}));
}
main().catch(error=>{console.error(error);process.exitCode=1;}).finally(()=>prisma.$disconnect());
