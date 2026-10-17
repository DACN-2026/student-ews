import type { AcademicTermLinkInput } from "../academic-terms";
import { compareAcademicTerms } from "../academic-terms";
import type { Qd600RuleEvaluation } from "./academic-warning-qd600-rules";
import type { StudentSourceQuality } from "./academic-source-quality";

export const STANDING_EFFECTS = ["APPROVED_LEAVE", "LEFT_PROGRAM", "RETURNED", "ACADEMIC_WARNING", "REPRIEVE", "STUDY_DEADLINE"] as const;
export type StandingEffect = typeof STANDING_EFFECTS[number];
export type StandingDecision = {
  id: string; termId: string; number: string; signedAt: string | null;
  name: string; typeName: string; fullText?: string; review?: {
    effect: StandingEffect; fromTermId: string; toTermId: string | null;
    reason: string; verifiedAt: string; verifiedBy: string; studyDeadline?: string | null;
  } | null;
};
export type StandingTerm = AcademicTermLinkInput & { label: string; beforeAdmission?: boolean };
export type StandingSources = {
  assessmentTermId: string; previousTermId: string | null;
  summaryPresent: boolean; registeredOfferings: number; summaryRegisteredCredits: number | null;
  previousSummaryPresent: boolean; previousRegisteredOfferings: number; previousRegisteredCredits: number | null;
  cohortCode: string; studyType: string; assessmentDate: string | null;
  beforeAdmission?: boolean;
  termResultsExpected?: boolean;
  terms: StandingTerm[]; decisions: StandingDecision[];
  sourceQuality?: StudentSourceQuality | null;
};
export type StandingAssessment = {
  excluded: boolean; exemption: { decisionId: string; number: string; effect: StandingEffect; reason: string } | null;
  notice1270Applicable: boolean; consecutiveOfficialWarnings: number; officialWarningCount: number;
  absenceEvidence: "REGISTERED" | "CONFIRMED_ZERO" | "UNVERIFIED";
  appealStatus: "NOT_ASSESSED" | "NEEDS_REVIEW" | "NO_REGISTRATION" | "REPEATED_REPRIEVE";
  rules: Qd600RuleEvaluation[];
};

const normalized = (value: string) => value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/đ/g, "d").replace(/Đ/g, "D").toLowerCase().trim().replace(/\s+/g, " ");
export function isRevokedStandingDecision(decision: Pick<StandingDecision, "fullText">) {
  return /^\[?(?:xoa|huy|thu hoi)\s+quyet dinh\b/.test(normalized(decision.fullText || ""));
}
/** Accept a canonical label or the source's anchored decision title, never incidental mentions. */
export function standingDecisionEffect(decision: StandingDecision): StandingEffect | null {
  if (isRevokedStandingDecision(decision) || !decision.number.trim() || !decision.signedAt || !Number.isFinite(Date.parse(decision.signedAt))) return null;
  if (decision.review) return decision.review.effect;
  const names = [decision.typeName, decision.name].map(normalized);
  if (names.includes("tiep nhan chuyen truong") || /^tiep nhan chuyen truong\b/.test(normalized(decision.fullText || ""))) return null;
  if (names.some(name => ["tiep nhan nghi hoc tam thoi", "tiep nhan sinh vien tro lai hoc", "tro lai hoc", "tiep tuc hoc"].includes(name))) return "RETURNED";
  if (names.some(name => ["thoi hoc", "buoc thoi hoc", "chuyen truong", "chuyen truong di", "chuyen di", "xoa ten"].includes(name))) return "LEFT_PROGRAM";
  if (names.some(name => ["nghi hoc tam thoi", "tam hoan chuong trinh", "bao luu ket qua hoc tap"].includes(name))) return "APPROVED_LEAVE";
  if (names.some(name => ["canh bao hoc tap", "canh bao ket qua hoc tap", "canh bao hoc vu"].includes(name))) return "ACADEMIC_WARNING";
  if (names.some(name => ["cuu xet hoc vu", "chap thuan cuu xet hoc vu"].includes(name))) return "REPRIEVE";
  const title = normalized(decision.fullText || "").split("(")[0].trim();
  if (["thoi hoc", "buoc thoi hoc", "chuyen truong", "chuyen truong di", "chuyen di", "xoa ten"].includes(title)) return "LEFT_PROGRAM";
  if (["canh bao hoc vu", "canh bao hoc tap", "canh bao ket qua hoc tap"].includes(title)) return "ACADEMIC_WARNING";
  if (["cuu xet hoc vu", "chap thuan cuu xet hoc vu"].includes(title)) return "REPRIEVE";
  return null;
}

/** Source TermID is the recording bucket; explicit periods in the decision take precedence. */
export function standingDecisionPeriod(decision: StandingDecision, terms: StandingTerm[], effect = standingDecisionEffect(decision)) {
  const text = normalized(decision.fullText || "").replace(/[–—]/g, "-");
  const mentions = [...text.matchAll(/\bhk\s*(iii|ii|i|[1-3])\s*,?\s*(?:nh\s*|nam hoc\s*)?(\d{4})\s*-\s*(\d{4})/g)].map(match => ({
    index: match.index!, term: terms.find(term => term.academicYearCode === `${match[2]}-${match[3]}`
      && term.termOrder === ({ i: 1, ii: 2, iii: 3 }[match[1] as "i" | "ii" | "iii"] || Number(match[1]))),
  }));
  const from = terms.find(term => term.id === (decision.review?.fromTermId || decision.termId));
  const to = decision.review?.toTermId ? terms.find(term => term.id === decision.review!.toTermId) : null;
  if (decision.review) return { from, to, explicit: true, appliesToTermIds: null, basis: "VERIFIED" as const, reprieveTermIds: [] as string[] };
  if (mentions.length && mentions.some(item => !item.term)) return { from: undefined, to: null, explicit: true, appliesToTermIds: null, basis: "UNRESOLVED" as const, reprieveTermIds: [] as string[] };
  const known = mentions.map(item => item.term!);
  if (["LEFT_PROGRAM", "RETURNED"].includes(effect || "") && known.length) {
    return { from: known[0], to: null, explicit: true, appliesToTermIds: null, basis: "EXPLICIT" as const, reprieveTermIds: [] as string[] };
  }
  if (effect === "ACADEMIC_WARNING" && known.length) {
    const rescueIndex = text.indexOf("cuu xet");
    const warningTerm = mentions.find(item => rescueIndex < 0 || item.index < rescueIndex)?.term || known[0];
    return { from: warningTerm, to: null, explicit: true, appliesToTermIds: null, basis: "EXPLICIT" as const,
      reprieveTermIds: rescueIndex >= 0 ? mentions.filter(item => item.index > rescueIndex).map(item => item.term!.id) : [] };
  }
  if (effect === "APPROVED_LEAVE") {
    if (known.length) {
      const range = known.length === 2 && /den(?: het)?\b|=>|->/.test(text);
      // An arrow may denote the return semester. Only periods strictly before that boundary are unambiguous.
      const inclusive = /den het\b/.test(text);
      const covered = range ? terms.filter(term => compareAcademicTerms(term, known[0]) >= 0
        && (inclusive ? compareAcademicTerms(term, known[1]) <= 0 : compareAcademicTerms(term, known[1]) < 0)) : known;
      return { from: [...known].sort(compareAcademicTerms)[0], to: null, explicit: true,
        appliesToTermIds: covered.map(term => term.id), basis: range && !inclusive ? "BOUNDARY_REVIEW" as const : "EXPLICIT" as const, reprieveTermIds: [] as string[] };
    }
    const year = text.match(/\b(?:nh|nam hoc)\s*(\d{4})\s*-\s*(\d{4})/);
    if (year) {
      const covered = terms.filter(term => !term.isSummer && term.academicYearCode === `${year[1]}-${year[2]}`).sort(compareAcademicTerms);
      return { from: covered[0], to: null, explicit: true, appliesToTermIds: covered.map(term => term.id), basis: "EXPLICIT" as const, reprieveTermIds: [] as string[] };
    }
  }
  return { from, to, explicit: false, appliesToTermIds: null, basis: "RECORDED_TERM_ONLY" as const, reprieveTermIds: [] as string[] };
}

/** Approved leave stays paused until a signed return decision takes effect.
 * The stated end of leave prompts verification; it never substitutes for return. */
export function resolveStudySuspensions(decisions: StandingDecision[], terms: StandingTerm[], now = new Date()) {
  const events = decisions.flatMap(decision => {
    const effect = standingDecisionEffect(decision);
    if (!["APPROVED_LEAVE", "RETURNED"].includes(effect || "") || !decision.signedAt || Date.parse(decision.signedAt) > now.getTime()) return [];
    const { from } = standingDecisionPeriod(decision, terms, effect);
    return from ? [{ decision, effect, from }] : [];
  }).sort((a, b) => compareAcademicTerms(a.from, b.from) || String(a.decision.signedAt).localeCompare(String(b.decision.signedAt)) || a.decision.id.localeCompare(b.decision.id));
  const intervals: Array<{ decisionId: string; decisionNumber: string; fromYear: string; fromTerm: number; effectiveAt: Date;
    returnDecisionId: string | null; returnYear: string | null; returnTerm: number | null; returnEffectiveAt: Date | null }> = [];
  for (const event of events) {
    const signed = new Date(event.decision.signedAt!);
    const effectiveAt = event.from.startDate && new Date(event.from.startDate) > signed ? new Date(event.from.startDate) : signed;
    if (event.effect === "APPROVED_LEAVE") intervals.push({ decisionId: event.decision.id, decisionNumber: event.decision.number,
      fromYear: event.from.academicYearCode, fromTerm: event.from.termOrder, effectiveAt,
      returnDecisionId: null, returnYear: null, returnTerm: null, returnEffectiveAt: null });
    else for (const interval of intervals.filter(item => !item.returnDecisionId)) {
      interval.returnDecisionId = event.decision.id; interval.returnYear = event.from.academicYearCode;
      interval.returnTerm = event.from.termOrder; interval.returnEffectiveAt = effectiveAt;
    }
  }
  return intervals;
}

export function assessAcademicStanding(source: StandingSources): StandingAssessment {
  const termById = new Map(source.terms.map(term => [term.id, term]));
  const assessment = termById.get(source.assessmentTermId);
  const applicable = Boolean(assessment && assessment.academicYearCode === "2024-2025" && assessment.termOrder === 2 && !assessment.isSummer
    && ["K45", "K46", "K47", "K48"].includes(source.cohortCode.toUpperCase()) && normalized(source.studyType) === "chinh quy");
  const result: StandingAssessment = { excluded: false, exemption: null, notice1270Applicable: applicable,
    consecutiveOfficialWarnings: 0, officialWarningCount: 0, absenceEvidence: source.registeredOfferings > 0 || (source.summaryRegisteredCredits ?? 0) > 0
      ? "REGISTERED" : source.summaryPresent && source.summaryRegisteredCredits === 0 ? "CONFIRMED_ZERO" : "UNVERIFIED",
    appealStatus: "NOT_ASSESSED", rules: [] };
  if (!assessment || assessment.isSummer) return result;
  if (source.beforeAdmission || assessment.beforeAdmission) { result.excluded = true; return result; }
  // Incoming transfer is an individual admission boundary, not an exemption
  // from later study. A cohort's earlier semesters are not this student's
  // missing registrations before their signed admission to the School.
  const incomingTransfers = source.decisions.flatMap(decision => {
    const title = normalized(`${decision.typeName} ${decision.name} ${decision.fullText || ""}`);
    if (!/tiep nhan chuyen truong|chuyen truong den/.test(title) || isRevokedStandingDecision(decision)
      || !decision.number.trim() || !decision.signedAt || !Number.isFinite(Date.parse(decision.signedAt)) || Date.parse(decision.signedAt) > Date.now()) return [];
    const period = standingDecisionPeriod(decision, source.terms);
    return period.from ? [period.from] : [];
  }).sort(compareAcademicTerms);
  if (incomingTransfers[0] && compareAcademicTerms(assessment, incomingTransfers[0]) < 0) { result.excluded = true; return result; }
  const decisions = source.decisions.flatMap(decision => {
    const effect = standingDecisionEffect(decision);
    const period = standingDecisionPeriod(decision, source.terms, effect);
    const from = period.from;
    const recorded = termById.get(decision.termId);
    const to = period.to;
    if (!effect || !from || !recorded || (!period.explicit && compareAcademicTerms(recorded, assessment) > 0) || compareAcademicTerms(from, assessment) > 0
      || Date.parse(decision.signedAt!) > Date.now()
      || (decision.review?.toTermId && !to)) return [];
    return [{ decision, effect, from, to, period }];
  }).sort((a, b) => compareAcademicTerms(a.from, b.from) || String(a.decision.signedAt).localeCompare(String(b.decision.signedAt)) || a.decision.id.localeCompare(b.decision.id));
  let exemption: typeof decisions[number] | null = null;
  for (const item of decisions) {
    if (item.effect === "RETURNED") { exemption = null; continue; }
    if (item.effect === "LEFT_PROGRAM") exemption = item;
    if (item.effect === "APPROVED_LEAVE" && (item.period.appliesToTermIds ? item.period.appliesToTermIds.includes(assessment.id)
      : !item.to ? item.from.id === assessment.id : compareAcademicTerms(assessment, item.to) <= 0)
      && exemption?.effect !== "LEFT_PROGRAM") exemption = item;
  }
  const suspension = resolveStudySuspensions(source.decisions, source.terms).filter(item =>
    (item.fromYear < assessment.academicYearCode || item.fromYear === assessment.academicYearCode && item.fromTerm <= assessment.termOrder)
    && (!item.returnYear || item.returnYear > assessment.academicYearCode || item.returnYear === assessment.academicYearCode && item.returnTerm! > assessment.termOrder)).at(-1);
  if (suspension && exemption?.effect !== "LEFT_PROGRAM") {
    result.excluded = true;
    result.exemption = { decisionId: suspension.decisionId, number: suspension.decisionNumber, effect: "APPROVED_LEAVE", reason: "Đang nghỉ học tạm thời; chờ quyết định tiếp nhận học lại có hiệu lực." };
    return result;
  }
  if (exemption?.effect === "APPROVED_LEAVE") exemption = null;
  if (exemption) {
    result.exemption = { decisionId: exemption.decision.id, number: exemption.decision.number, effect: exemption.effect,
      reason: exemption.decision.review?.reason || exemption.decision.name };
    // Leave excuses absence, not real failing grades earned while registered.
    result.excluded = exemption.effect === "LEFT_PROGRAM" || result.absenceEvidence !== "REGISTERED";
  }
  if (result.excluded) return result;
  const add = (ruleCode: Qd600RuleEvaluation["ruleCode"], explanation: string, observedValue: number | null, thresholdValue: number | null,
    triggered: boolean, dataStatus: Qd600RuleEvaluation["dataStatus"], reference: string | null = null) => {
    result.rules.push({ ruleCode, sourceType: "OPERATIONAL", evaluationStatus: dataStatus === "INSUFFICIENT" && !triggered ? "NOT_EVALUATED" : "EVALUATED",
      dataStatus, observedValue, thresholdValue, margin: null, isNearThreshold: false, isThresholdBreached: triggered, capabilityStatus: null,
      reasonCode: triggered || dataStatus === "INSUFFICIENT" ? ruleCode : null, explanation, riskLevel: triggered ? "RED" : "GREEN",
      regulatorySource: reference, articleRef: reference?.startsWith("TB1270") ? "Mục 2–3" : reference ? "Điều 18 khoản 2; Điều 19" : null });
  };
  if (!source.summaryPresent && source.termResultsExpected !== false) add("EARLY_MISSING_TERM_DATA", "Chưa có bảng tổng hợp học tập đúng chương trình trong kỳ xét và chưa có quyết định hợp lệ giải thích việc vắng dữ liệu. GVCN/CVHT cần ưu tiên xác minh đăng ký, tình trạng học hoặc lỗi dữ liệu nguồn. Không gán GPA bằng 0 và không kết luận sinh viên vi phạm học vụ.", null, null, true, "INSUFFICIENT");
  if (result.absenceEvidence !== "REGISTERED" && !result.exemption) {
    add("EARLY_NO_REGISTRATION", result.absenceEvidence === "CONFIRMED_ZERO"
      ? "Bảng tổng hợp ghi nhận 0 tín chỉ và chưa có học phần đăng ký hoặc quyết định giải thích hợp lệ. Ưu tiên liên hệ sinh viên, xác minh lý do chính đáng và thủ tục nghỉ học; chưa tự ban hành cảnh báo học vụ."
      : "Chưa ghi nhận đăng ký học phần. Cần xác minh dữ liệu nguồn và lý do với sinh viên; thiếu bản ghi chưa chứng minh sinh viên không đăng ký.", 0, 1, true,
      result.absenceEvidence === "CONFIRMED_ZERO" ? "COMPLETE" : "UNVERIFIED", applicable ? "TB1270-DHDL-2024-2025-HKII" : null);
    const previous = termById.get(source.previousTermId || "");
    if (previous && !previous.beforeAdmission && source.previousRegisteredOfferings === 0 && !(source.previousRegisteredCredits! > 0)) {
      const previousAssessment = assessAcademicStanding({ ...source, assessmentTermId: previous.id, previousTermId: null,
        summaryPresent: source.previousSummaryPresent, registeredOfferings: source.previousRegisteredOfferings,
        summaryRegisteredCredits: source.previousRegisteredCredits });
      if (!previousAssessment.excluded && !previousAssessment.exemption) add("EARLY_NO_REGISTRATION_CONSECUTIVE", "Hai kỳ chính liền nhau chưa ghi nhận đăng ký học phần và chưa có quyết định nghỉ hợp lệ cho từng kỳ. Ưu tiên xử lý nguy cơ gián đoạn học; cần xác minh trước khi đối chiếu diện buộc thôi học.", 2, 2, true,
        result.absenceEvidence === "CONFIRMED_ZERO" && source.previousSummaryPresent && source.previousRegisteredCredits === 0 ? "COMPLETE" : "UNVERIFIED",
        applicable ? "TB1270-DHDL-2024-2025-HKII" : null);
    }
  }
  const mainTerms = source.terms.filter(term => !term.isSummer && compareAcademicTerms(term, assessment) <= 0).sort(compareAcademicTerms);
  const warnedTerms = new Set(decisions.filter(item => item.effect === "ACADEMIC_WARNING" && !item.from.isSummer).map(item => item.from.id));
  result.officialWarningCount = warnedTerms.size;
  for (let index = mainTerms.length - 1; index >= 0 && warnedTerms.has(mainTerms[index].id); index--) result.consecutiveOfficialWarnings++;
  const sequenceLimit = applicable ? 2 : 3;
  add("ACADEMIC_WARNING_SEQUENCE_REVIEW", `Ghi nhận ${result.consecutiveOfficialWarnings} kỳ chính liên tiếp có quyết định cảnh báo học tập. ${applicable ? "TB1270 của đợt HKII 2024–2025 nêu từ 2 kỳ liên tiếp." : "QĐ600 Điều 18 khoản 2(a) nêu quá 2 lần liên tiếp (từ 3)."} Từ 2 kỳ cần ưu tiên hỗ trợ; không đếm màu cảnh báo nội bộ hoặc các lần chạy lại cùng kỳ.`, result.consecutiveOfficialWarnings, sequenceLimit, result.consecutiveOfficialWarnings >= 2, "PARTIAL", applicable ? "TB1270-DHDL-2024-2025-HKII" : "QD600-DHDL-2021");
  const reprieved = new Set(decisions.flatMap(item => item.effect === "REPRIEVE" && !item.from.isSummer ? [item.from.id] : item.period.reprieveTermIds)
    .filter(id => { const term = termById.get(id); return term && !term.isSummer && compareAcademicTerms(term, assessment) <= 0; }));
  const afterReprieve = reprieved.has(source.previousTermId || "") && result.consecutiveOfficialWarnings >= sequenceLimit;
  if (afterReprieve) add("ACADEMIC_REPRIEVE_FOLLOWUP", "Đã có quyết định cứu xét ở kỳ chính liền trước và tiếp tục đạt mốc cần rà soát diện buộc thôi học. Cần đối chiếu hồ sơ với Phòng CTSV; cứu xét không được coi là miễn mọi nguy cơ ở kỳ sau.", 1, 1, true, "PARTIAL", applicable ? "TB1270-DHDL-2024-2025-HKII" : null);
  if (applicable) {
    result.appealStatus = result.absenceEvidence === "CONFIRMED_ZERO" && !result.exemption ? "NO_REGISTRATION"
      : reprieved.has(source.previousTermId || "") && [...reprieved].some(id => mainTerms.findIndex(term => term.id === id) === mainTerms.length - 3)
        ? "REPEATED_REPRIEVE" : "NEEDS_REVIEW";
    add("ACADEMIC_APPEAL_ELIGIBILITY_REVIEW", result.appealStatus === "NO_REGISTRATION"
      ? "TB1270 lưu ý không giải quyết đơn cứu xét cho sinh viên không đăng ký học phần. Cần xác minh lý do và quyết định nghỉ hợp lệ; không tự bảo đảm được cứu xét."
      : "TB1270 yêu cầu đối chiếu lần thuộc diện buộc thôi học, lịch sử cứu xét và việc cải thiện kết quả. Đơn cứu xét lần đầu hoặc cam kết phải được đơn vị có thẩm quyền xem xét; không tự phê duyệt từ mức cảnh báo.", null, null, false, "INSUFFICIENT", "TB1270-DHDL-2024-2025-HKII");
  }
  return result;
}
