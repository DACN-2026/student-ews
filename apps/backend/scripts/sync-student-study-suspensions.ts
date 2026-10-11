import fs from "node:fs";
import path from "node:path";
import { prisma } from "../lib/prisma";
import { syncStudentStudySuspensions } from "../lib/services/student-study-suspension";

async function main() {
  const report = { checkedAt: new Date().toISOString(), ...await syncStudentStudySuspensions(undefined, process.argv.includes("--apply")) };
  const day = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Ho_Chi_Minh" }).format(new Date());
  const target = path.resolve(__dirname, `../../../docs/reports/student-study-suspensions-${day}${report.applied ? "" : "-plan"}.json`);
  if (report.changes.length || !fs.existsSync(target)) fs.writeFileSync(target, JSON.stringify(report, null, 2) + "\n");
  process.stdout.write(JSON.stringify(report, null, 2));
}
main().catch(() => { process.stderr.write("Không thể đồng bộ trạng thái nghỉ học. Kiểm tra cấu hình database và migration.\n"); process.exitCode = 1; }).finally(() => prisma.$disconnect());
