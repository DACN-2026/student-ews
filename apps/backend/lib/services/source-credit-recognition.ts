import { prisma } from "../prisma";
import { sourcePassOutcome, isConditionalCourse, type CourseOutcomeInput } from "../academic-course-rules";
import { isRevokedStandingDecision } from "./academic-standing-rules";

export type RecognitionPeriod = { academicYear: string; termCode: string; termOrder: number };
export type RecognizedCreditAttempt = CourseOutcomeInput & {
  courseCode: string; courseName: string; credits: number; academicYear: string; termCode: string;
  recognition: { sourceRecordId: string; decisionId: string; academicYear: string; termCode: string; kind?: "UNDATED_CERTIFICATE" };
};
export type SourceCreditRecognition = { attempts: RecognizedCreditAttempt[]; unresolvedCourseCodes: string[] };
const object = (value: unknown): Record<string, unknown> => value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
const text = (value: unknown) => typeof value === "string" ? value.trim() : "";
const decimal = (value: unknown) => value == null || typeof value === "string" && !value.trim() || !Number.isFinite(Number(value)) ? null : Number(value);
const normalize = (value: string) => value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/đ/g, "d");

/** R records are School-recognized credits, not missing ordinary registrations.
 * Their availability starts at the signed admission/transfer decision. The
 * original YearStudy/TermID and every source payload remain untouched. */
export async function loadSourceCreditRecognitionData(studentIds: string[]) {
  const records = await prisma.unscopedGradeRecord.findMany({ where: { studentId: { in: studentIds } } });
  if (!records.length) return { records, decisions: [], terms: [], years: [] };
  const decisions = await prisma.studentDecision.findMany({ where: { studentId: { in: [...new Set(records.map(row => row.studentId))] }, deletedAt: null } });
  const terms = await prisma.academicTerm.findMany({ where: { id: { in: [...new Set(decisions.map(row => row.academicTermId))] }, deletedAt: null } });
  const years = await prisma.academicYear.findMany({ where: { id: { in: [...new Set(terms.map(row => row.academicYearId))] }, deletedAt: null } });
  return { records, decisions, terms, years };
}

export async function loadSourceCreditRecognitions(studentIds: string[], programCode: string, cutoff: RecognitionPeriod, options: { includeUndatedConditional?: boolean } = {}, preloaded?: Awaited<ReturnType<typeof loadSourceCreditRecognitionData>>): Promise<Map<string, SourceCreditRecognition>> {
  const output = new Map<string, SourceCreditRecognition>(studentIds.map(id => [id, { attempts: [], unresolvedCourseCodes: [] }]));
  if (!studentIds.length) return output;
  const data = preloaded ?? await loadSourceCreditRecognitionData(studentIds);
  const records = data.records.filter(record => output.has(record.studentId));
  if (!records.length) return output;
  const { decisions, terms, years } = data;
  const yearById = new Map(years.map(year => [year.id, year.sYearCode]));
  const anchors = decisions.flatMap(decision => {
    const label = normalize(`${decision.sDecisionName} ${decision.sFullText}`);
    const term = terms.find(term => term.id === decision.academicTermId);
    const year = term && yearById.get(term.academicYearId);
    if (!term || !year || !/tiep nhan chuyen truong|chuyen truong den|chuyen nganh|chuyen khoa nganh/.test(label)
      || isRevokedStandingDecision({ fullText: decision.sFullText }) || !decision.sDecisionNumber.trim()
      || !decision.sSignDate || decision.sSignDate > new Date()) return [];
    return [{ studentId: decision.studentId, decisionId: decision.id, academicYear: year, termCode: term.sTermCode, termOrder: term.sTermOrder }];
  }).sort((a, b) => a.academicYear.localeCompare(b.academicYear) || a.termOrder - b.termOrder || a.decisionId.localeCompare(b.decisionId));
  for (const record of records) {
    const result = output.get(record.studentId)!;
    const source = object(record.sourcePayload);
    const code = record.sCourseCode || text(source.CurriculumID);
    const sourceProgram = text(source.StudyProgramID);
    // Ordinary rows quarantined from a request for the wrong program are not
    // transfer/waiver evidence. Keep the quarantine, but exclude it from this
    // program's recognition checks instead of blocking the student's history.
    if (record.reason === "API_PROGRAM_SCOPE_CONFLICT" && sourceProgram !== programCode
      && !["R", "M"].includes(text(source.DiemChuyenMien).toUpperCase())) continue;
    // A currently supplied M certificate with IsPass=true establishes today's
    // certificate outcome. It carries no study/decision period and must never
    // be injected into a historical assessment or an ordinary registration.
    if (options.includeUndatedConditional && text(source.DiemChuyenMien).toUpperCase() === "M" && sourcePassOutcome(source) === true
      && sourceProgram === programCode && code && record.sCredits! > 0 && isConditionalCourse(code, record.sCourseName)) {
      result.attempts.push({ courseCode: code, courseName: record.sCourseName || text(source.CurriculumName), credits: record.sCredits!,
        academicYear: "", termCode: "", isPass: true, isRecognized: true, scoreStatus: "graded", notScore: false,
        recognition: { kind: "UNDATED_CERTIFICATE", sourceRecordId: record.id, decisionId: "", academicYear: "", termCode: "" } });
      continue;
    }
    const matchingAnchors = anchors.filter(anchor => anchor.studentId === record.studentId);
    const anchor = matchingAnchors.length === 1 ? matchingAnchors[0] : undefined;
    const recognized = text(source.DiemChuyenMien).toUpperCase() === "R" && sourcePassOutcome(source) === true;
    if (!recognized || !anchor || sourceProgram !== programCode || !code || !(record.sCredits! > 0)) {
      result.unresolvedCourseCodes.push(code);
      continue;
    }
    // A later recognition must not erase a failure in an earlier assessment.
    if (anchor.academicYear > cutoff.academicYear || anchor.academicYear === cutoff.academicYear && anchor.termOrder > cutoff.termOrder) continue;
    result.attempts.push({ courseCode: code, courseName: record.sCourseName || text(source.CurriculumName), credits: record.sCredits!,
      academicYear: anchor.academicYear, termCode: anchor.termCode, isPass: true, isRecognized: true,
      scoreStatus: "graded", notScore: false, score10: decimal(source.DiemTK_10), score4: decimal(source.DiemTK_4), letterCode: text(source.DiemTK_Chu),
      recognition: { sourceRecordId: record.id, decisionId: anchor.decisionId, academicYear: anchor.academicYear, termCode: anchor.termCode } });
  }
  return output;
}
