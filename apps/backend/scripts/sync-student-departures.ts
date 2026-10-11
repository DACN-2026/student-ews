import fs from "node:fs";
import path from "node:path";
import { prisma } from "../lib/prisma";
import { syncStudentClassDepartures } from "../lib/services/student-class-departure";
async function main() {
  const report = { checkedAt: new Date().toISOString(), ...await syncStudentClassDepartures(undefined, process.argv.includes("--apply")) };
  const day = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Ho_Chi_Minh" }).format(new Date());
  const target = path.resolve(__dirname, `../../../docs/reports/student-departures-${day}${report.applied ? "" : "-plan"}.json`);
  // An idempotent repeat must not replace the evidence of the applied change.
  if (report.changes.length || !fs.existsSync(target)) fs.writeFileSync(target, JSON.stringify(report, null, 2) + "\n");
  console.log(JSON.stringify(report));
}
main().catch(error => { console.error(error.message); process.exitCode = 1; }).finally(() => prisma.$disconnect());
