import { prisma } from "../lib/prisma";
import { 
  getStandardSemesterPlannedCredits,
  isConditionalCourse,
} from "../lib/services/student-training-progress";

async function run() {
  console.log("Testing isConditionalCourse:");
  console.log("QP2101D:", isConditionalCourse("QP2101D", "Giáo dục quốc phòng và an ninh 1"));
  console.log("25TC1001:", isConditionalCourse("25TC1001", "Giáo dục thể chất 1"));
  console.log("TC1001D:", isConditionalCourse("TC1001D", "Giáo dục thể chất 1"));
  console.log("20CT1101 (Nhập môn CNTT):", isConditionalCourse("20CT1101", "Nhập môn ngành Công nghệ Thông tin"));
  console.log("20CT1102 (Lập trình cấu trúc):", isConditionalCourse("20CT1102", "Nguyên lý lập trình cấu trúc"));
  console.log("SHCD01:", isConditionalCourse("SHCD01", "Tuần sinh hoạt công dân"));
}

run().catch(console.error).finally(() => prisma.$disconnect());
