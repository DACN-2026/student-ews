import { isK44StandardProgram, normalizeProgramCourseCode } from "./academic-course-rules";

export type K44ElectiveBlock = "A6" | "A7" | "B2" | "B3";

// CTĐT K44, PDF pages 23–30. B2 is specialization-specific: a course
// mandatory in one specialization may be elective in another.
const COMMON_BLOCKS = {
  A6: { requiredCredits: 9, courses: ["20CT1103", "20CT1203", "20TN1001", "20TN1002"] },
  A7: { requiredCredits: 6, courses: ["20NV0002", "20SP0001", "20QT0006", "20QT0001", "20QT0004"] },
  B3: { requiredCredits: 6, courses: ["20CT3108", "20CT3107", "20CT3106"] },
} as const;

const SPECIALIZATION_BLOCKS = {
  PM: { requiredCredits: 25, courses: ["20CT3104", "20CT4105", "20CT3205", "20CT4107", "20CT3208", "20CT3206", "20CT3113", "20CT4103", "20CT4104", "20CT3105", "20CT3207", "20CT4106"] },
  MMT: { requiredCredits: 25, courses: ["20CT3222", "20CT3103", "20CT3123", "20CT3124", "20CT3223", "20CT3224", "20CT3225", "20CT4122", "20CT4107", "20CT4126", "20CT4125", "20CT4124"] },
  KHDL: { requiredCredits: 26, courses: ["20CT3123", "20CT3103", "20CT3102", "20CT3213", "20CT3225", "20CT3214", "20CT3215", "20CT3216", "20CT4113", "20CT4114", "20CT4115", "20CT4116", "20CT4117", "20CT4118", "20CT4119"] },
} as const;

const BLOCK_NAMES: Record<K44ElectiveBlock, string> = {
  A6: "Toán học, Tin học, Khoa học tự nhiên",
  A7: "Khoa học xã hội và Nhân văn",
  B2: "Kiến thức chuyên ngành",
  B3: "Kiến thức bổ trợ",
};

// Course names and credits printed in CTĐT K44, pages 24–30. Keep the PDF
// codes here; historical API spellings are resolved only for membership.
const COURSE_ROWS: Array<[string, string, number]> = [
  ["20CT1103", "Bảo trì máy tính", 3], ["20CT1203", "Đồ họa ứng dụng", 3],
  ["20TN1001", "Toán cao cấp B1", 3], ["20TN1002", "Toán cao cấp B2", 3],
  ["20NV0002", "Kỹ năng soạn thảo văn bản hành chính", 3], ["20SP0001", "Tâm lý học đại cương", 3],
  ["20QT0006", "Đổi mới sáng tạo và khởi nghiệp", 3], ["20QT0001", "Kinh tế học đại cương", 3], ["20QT0004", "Nguyên lý kế toán", 3],
  ["20CT3108", "Phương pháp nghiên cứu khoa học", 3], ["20CT3107", "Lập trình mạng", 3], ["20CT3106", "Lập trình Python", 3],
  ["20CT3104", "Thiết kế giao diện", 3], ["20CT4105", "Dịch vụ Web", 3], ["20CT3205", "Phân tích và thiết kế phần mềm", 3],
  ["20CT4107", "Thương mại điện tử", 3], ["20CT3208", "Phát triển ứng dụng game", 3], ["20CT3206", "Kiểm thử phần mềm", 3],
  ["20CT3113", "Các phương pháp học máy", 4], ["20CT4103", "Phát triển ứng dụng Game nâng cao", 3],
  ["20CT4104", "Các công nghệ mới trong phát triển phần mềm", 3], ["20CT3105", "Lập trình Java", 3],
  ["20CT3207", "Lập trình Java nâng cao", 3], ["20CT4106", "Phát triển ứng dụng di động nâng cao", 3],
  ["20CT3222", "An toàn và bảo mật hệ thống", 3], ["20CT3103", "Phát triển ứng dụng web", 4],
  ["20CT3123", "Mật mã học và mã hóa thông tin", 4], ["20CT3124", "Chuyên đề mạng máy tính 1", 4],
  ["20CT3223", "Các công nghệ ảo hóa", 3], ["20CT3224", "Blockchain", 3], ["20CT3225", "Internet vạn vật", 3],
  ["20CT4122", "Triển khai hệ thống tích hợp", 3], ["20CT4126", "Voice over IP", 3],
  ["20CT4125", "Mạng thế hệ mới", 3], ["20CT4124", "Chuyên đề mạng máy tính 2", 3],
  ["20CT3102", "Phát triển ứng dụng di động", 3], ["20CT3213", "Lập trình song song", 3],
  ["20CT3214", "Học máy nâng cao", 3], ["20CT3215", "Tiền xử lý và phân tích dữ liệu", 3],
  ["20CT3216", "Lập trình python nâng cao", 3], ["20CT4113", "Thị giác máy tính", 4],
  ["20CT4114", "Xử lý ngôn ngữ tự nhiên", 3], ["20CT4115", "Mạng Neuron", 3], ["20CT4116", "Điện toán đám mây", 3],
  ["20CT4117", "Chuyên đề", 3], ["20CT4118", "Lập trình R cho Khoa học dữ liệu", 3], ["20CT4119", "Web ngữ nghĩa", 3],
];
const COURSE_DETAILS = Object.fromEntries(COURSE_ROWS.map(([code, courseName, credits]) => [code, { courseName, credits }]));

export function k44ElectiveMembership(courseCode: string, programCode: string): {
  block: K44ElectiveBlock;
  requiredCredits: number;
  curriculumCourseCode: string;
} | null {
  if (!isK44StandardProgram(programCode)) return null;
  const sourceCode = normalizeProgramCourseCode(courseCode, programCode);
  // Source catalog spellings of K44 courses. This mapping is for membership
  // and duplicate-credit protection; source attempts are never rewritten.
  const code = ({ "20TN1201": "20TN1001", "20TN2102": "20TN1002", "TN1001D": "20TN1001" } as Record<string, string>)[sourceCode]
    ?? sourceCode.replace(/^(20(?:CT|TN)\d{4})D$/, "$1");
  for (const [block, definition] of Object.entries(COMMON_BLOCKS)) {
    if ((definition.courses as readonly string[]).includes(code)) {
      return { block: block as K44ElectiveBlock, requiredCredits: definition.requiredCredits, curriculumCourseCode: code };
    }
  }
  const specialization = programCode.toUpperCase().split("-")[1] as keyof typeof SPECIALIZATION_BLOCKS;
  const definition = SPECIALIZATION_BLOCKS[specialization];
  if (definition && (definition.courses as readonly string[]).includes(code)) {
    return { block: "B2", requiredCredits: definition.requiredCredits, curriculumCourseCode: code };
  }
  return null;
}

/** Alternatives for learning again: exclude the failed course and every prior
 * offering, regardless of outcome (passed, failed, VT, or awaiting a score).
 * This is the curriculum choice list, not automatic credit recognition. */
export function k44ElectiveAlternatives(courseCode: string, programCode: string, studiedCourseCodes: Iterable<string> = []) {
  const membership = k44ElectiveMembership(courseCode, programCode);
  if (!membership) return null;
  const studied = new Set([membership.curriculumCourseCode]);
  for (const code of studiedCourseCodes) {
    const prior = k44ElectiveMembership(code, programCode);
    if (prior) studied.add(prior.curriculumCourseCode);
  }
  const specialization = programCode.toUpperCase().split("-")[1] as keyof typeof SPECIALIZATION_BLOCKS;
  const definition = membership.block === "B2" ? SPECIALIZATION_BLOCKS[specialization] : COMMON_BLOCKS[membership.block];
  return {
    block: membership.block,
    blockName: BLOCK_NAMES[membership.block],
    courses: definition.courses.filter(code => !studied.has(code)).map(code => ({
      courseCode: code,
      ...COURSE_DETAILS[code],
    })),
  };
}
