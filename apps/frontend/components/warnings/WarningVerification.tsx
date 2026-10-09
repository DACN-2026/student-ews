"use client";

import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { AlertCircle, CheckCircle2, ChevronDown, RefreshCw } from "lucide-react";
import { apiFetch } from "@/lib/api-client";
import { LoadingIndicator } from "@/components/ui/LoadingState";

type EvidenceCheck = { key: string; label: string; status: "MATCHED" | "CHANGED" | "UNAVAILABLE"; recorded: number | null; current: number | null };
type Course = { courseCode: string; courseName: string; credits: number; semesterNo?: number | null; status?: string; letter?: string | null; requirementType?: string; score10?: number | null; score4?: number | null; attemptCount?: number; passedAcademicYear?: string | null; passedTermCode?: string | null };
type CreditReason = { reasonCode: string; observedValue: string | number | null; thresholdValue: string | number | null; sourceType: string | null; severity: string; thresholdBreached: boolean; nearThreshold: boolean; details: Record<string, unknown> };
export type WarningEvidence = {
  context: { resultId: string; academicYear: string; termCode: string; programCode: string | null; capturedAt: string; checkedAt: string };
  checks: EvidenceCheck[];
  unavailableSources: string[];
  courseNames: Record<string, string>;
  debt: {
    accumulatedDebtCredits?: number | null;
    outstandingCourses?: string[];
    electiveSelections?: Array<{ semesterNo: number; requiredCredits: number | null; passedCredits: number; remainingDebtCredits: number; failedCourseCodes: string[] }>;
    replacements?: Array<{ semesterNo: number; donorCourseCode: string; settledDebtCredits: number; settledCourses: Array<{ courseCode: string; credits: number }> }>;
  } | null;
  term: { gpa4: number | null; cumulativeGpa4: number | null; registeredCredits: number | null; failedCredits: number | null; courses: Array<Course & { id: string; score4: number | null; score10: number | null; excludedFromGpa: boolean }> };
  progress: { latestSemester: number; expectedCredits: number; earnedCredits: number; electiveMissingCredits: number; missingRequiredCourses: Course[]; semesters: Array<{ semesterNo: number; plannedCredits: number | null; earnedCredits: number; mandatoryCredits: number | null; electivePlannedCredits: number | null; courses: Course[] }> } | null;
  graduation: { evaluationId: string; academicYear: string; termCode: string; capturedAt: string; sameAssessment: boolean; summary: { requiredCredits: number | null; completedCredits: number | null; remainingCredits: number | null }; electiveMissingCredits: number | null; missingRequiredCourses: Course[] } | null;
};
type Verification = { data: WarningEvidence | null; error: string; retry: () => void };
const VerificationContext = createContext<Verification>({ data: null, error: "", retry: () => {} });

export function WarningVerificationProvider({ caseId, resultId, children }: { caseId: string; resultId?: string; children: ReactNode }) {
  const [data, setData] = useState<WarningEvidence | null>(null);
  const [error, setError] = useState("");
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    void (async () => {
      try {
        const query = resultId ? `?${new URLSearchParams({ resultId })}` : "";
        const response = await apiFetch(`/api/v1/academic-warnings/interventions/${caseId}/evidence${query}`, { signal: controller.signal, cache: "no-store" });
        if (!response.ok) throw new Error(response.status === 403 ? "Không có quyền xem dữ liệu đối chiếu." : "Chưa tải được dữ liệu đối chiếu. Kết quả cảnh báo vẫn được giữ nguyên.");
        const result: WarningEvidence = await response.json();
        if (resultId && result.context.resultId !== resultId) throw new Error("Kết quả cảnh báo đã được cập nhật. Đóng và mở lại bảng chi tiết để xem đúng lần đánh giá.");
        if (!controller.signal.aborted) setData(result);
      } catch (failure) {
        if (!controller.signal.aborted) setError(failure instanceof Error ? failure.message : "Không thể tải dữ liệu đối chiếu.");
      }
    })();
    return () => controller.abort();
  }, [caseId, resultId, attempt]);
  const retry = () => { setError(""); setData(null); setAttempt((value) => value + 1); };
  return <VerificationContext.Provider value={{ data, error, retry }}>{children}</VerificationContext.Provider>;
}

function period(year: string, term: string) {
  const termNo = Number(term.match(/\d+/)?.[0]);
  return `${termNo === 1 || termNo === 2 ? `HK${termNo}` : term} · ${year}`;
}
function date(value: string) {
  return new Date(value).toLocaleString("vi-VN", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });
}
function numeric(value: number | null | undefined) { return value == null || !Number.isFinite(value) ? "—" : String(value); }
function CheckStatus({ check }: { check?: EvidenceCheck }) {
  if (!check) return null;
  return <span className={`inline-flex shrink-0 items-center gap-1 text-[11px] font-medium ${check.status === "MATCHED" ? "text-emerald-700" : check.status === "CHANGED" ? "text-red-700" : "text-slate-500"}`}>
    {check.status === "MATCHED" ? <CheckCircle2 size={13} /> : <AlertCircle size={13} />}
    {check.status === "MATCHED" ? "Khớp nguồn" : check.status === "CHANGED" ? "Số liệu khác" : "Chưa đối chiếu đủ"}
  </span>;
}

export function WarningVerificationOverview() {
  const { data, error, retry } = useContext(VerificationContext);
  if (error) return <div role="alert" className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900"><p>{error}</p><button type="button" onClick={retry} className="mt-2 inline-flex items-center gap-1 font-semibold underline cursor-pointer"><RefreshCw size={12} />Thử đối chiếu lại</button></div>;
  if (!data) return <div className="rounded-xl border border-slate-200 bg-slate-50 p-3"><LoadingIndicator label="Đang đối chiếu nguồn tại học kỳ cảnh báo…" /></div>;
  const changed = data.checks.filter((check) => check.status === "CHANGED");
  const matched = data.checks.filter((check) => check.status === "MATCHED");
  const unavailable = data.checks.filter((check) => check.status === "UNAVAILABLE");
  return <section aria-label="Mốc và kết quả đối chiếu cảnh báo" className="rounded-xl border border-slate-200 bg-slate-50/60 p-3.5 text-xs space-y-2.5">
    <div className="flex flex-wrap items-center justify-between gap-2"><h3 className="font-semibold text-slate-900">Cảnh báo tại {period(data.context.academicYear, data.context.termCode)}</h3><span className="text-slate-500">CTĐT: {data.context.programCode || "Chưa xác định"}</span></div>
    <p className="text-[11px] text-slate-500">Ghi nhận {date(data.context.capturedAt)} · Đối chiếu {date(data.context.checkedAt)}</p>
    {(changed.length > 0 || matched.length === 0 || unavailable.length > 0 || data.unavailableSources.length > 0) && <div className="border-t border-slate-200 pt-2.5 space-y-1.5">
      {changed.length > 0 ? <p className="font-semibold text-red-700">Có {changed.length} số liệu khác với nguồn hiện tại. Cần kiểm tra trước khi kết luận.</p> : matched.length === 0 ? <p className="font-medium text-slate-600">Chưa có đủ nguồn để xác nhận số liệu cảnh báo.</p> : null}
      {(unavailable.length > 0 || data.unavailableSources.length > 0) && <p className="text-amber-800">Chưa đối chiếu đủ: {[...new Set([...unavailable.map((check) => check.label), ...data.unavailableSources])].join(", ")}.</p>}
    </div>}
  </section>;
}

function CourseList({ courses }: { courses: Course[] }) {
  return <ul className="divide-y divide-slate-100 rounded-lg border border-slate-200 bg-white">
    {courses.map((course) => <li key={course.courseCode} data-course-code={course.courseCode} data-course-status={course.status} className="flex flex-col sm:flex-row items-start justify-between gap-2 px-2.5 sm:px-3 py-2.5">
      <div className="min-w-0 flex-1"><p className="font-medium text-slate-800 leading-relaxed">{course.courseName}</p><p className="mt-0.5 text-[11px] text-slate-500"><span className="font-mono">{course.courseCode}</span>{course.semesterNo != null && ` · HK ${course.semesterNo}`}{course.requirementType && ` · ${course.requirementType === "mandatory" ? "Bắt buộc" : "Tự chọn"}`}</p>{course.attemptCount != null && <p className="mt-1 text-[11px] text-slate-500">{course.attemptCount > 0 ? `${course.attemptCount} lượt học · Điểm lượt gần nhất: ${numeric(course.score10)} / 10; ${numeric(course.score4)} / 4${course.letter ? ` (${course.letter})` : ""}` : "Chưa ghi nhận lượt học"}{course.passedAcademicYear && course.passedTermCode && ` · Đạt tại ${period(course.passedAcademicYear, course.passedTermCode)}`}</p>}</div>
      <div className="flex w-full items-center justify-between gap-2 sm:block sm:w-auto sm:text-right"><p className="font-mono font-semibold text-slate-800">{course.credits} TC</p><p className={`sm:mt-0.5 text-[11px] ${course.status === "PASSED" ? "text-emerald-700" : course.status === "FAILED" || course.letter === "VT" ? "text-red-700" : "text-slate-500"}`}>{course.status === "PASSED" ? "Đã đạt" : course.letter === "VT" ? "Vắng thi (VT)" : course.status === "FAILED" ? `Chưa đạt${course.letter ? ` (${course.letter})` : ""}` : course.status === "NO_SCORE" || course.status === "PENDING" ? "Đang học / chờ điểm" : course.status === "NOT_COMPLETED" && course.attemptCount === 0 ? "Chưa học" : "Chưa hoàn thành"}</p></div>
    </li>)}
  </ul>;
}

function DebtEvidence({ data }: { data: WarningEvidence }) {
  const debt = data.debt;
  if (!debt) return <p className="text-slate-500">Lần đánh giá này chưa lưu đủ bằng chứng nợ tín chỉ.</p>;
  const selections = debt.electiveSelections;
  const electiveDebt = selections?.reduce((sum, selection) => sum + selection.remainingDebtCredits, 0);
  const mandatoryDebt = electiveDebt != null && debt.accumulatedDebtCredits != null ? debt.accumulatedDebtCredits - electiveDebt : null;
  const outstanding = new Set(debt.outstandingCourses || []);
  const mandatory = data.progress?.missingRequiredCourses.filter((course) => outstanding.has(course.courseCode)) || [];
  return <div className="space-y-3">
    <p className="font-semibold text-slate-800">{mandatoryDebt != null ? `${mandatoryDebt} TC bắt buộc + ${electiveDebt} TC theo lựa chọn từng kỳ = ${debt.accumulatedDebtCredits} TC còn nợ.` : `${numeric(debt.accumulatedDebtCredits)} TC còn nợ tại mốc đánh giá.`}</p>
    {mandatory.length > 0 && <div className="space-y-2"><h4 className="font-semibold text-slate-700">Học phần bắt buộc còn nợ</h4><CourseList courses={mandatory} /></div>}
    {selections && <div className="space-y-2"><h4 className="font-semibold text-slate-700">Nợ tự chọn còn lại theo học kỳ</h4>
      {selections.filter((selection) => selection.remainingDebtCredits > 0).map((selection, index) => <div key={`${selection.semesterNo}-${index}`} className="rounded-lg border border-slate-200 bg-white p-3 space-y-1">
        <p className="flex justify-between gap-2 font-semibold text-slate-800"><span>HK {selection.semesterNo}</span><span className="text-red-700">Còn nợ {selection.remainingDebtCredits} TC</span></p>
        <p className="text-slate-600">Yêu cầu lựa chọn: {numeric(selection.requiredCredits)} TC · Đã đạt: {selection.passedCredits} TC</p>
        <p className="text-[11px] leading-relaxed text-slate-600">Môn không đạt liên quan: {selection.failedCourseCodes.map((code) => `${data.courseNames[code] || code} (${code})`).join("; ")}.</p>
      </div>)}
      <p className="text-[11px] text-slate-500 leading-relaxed">Nợ tự chọn tính theo số tín chỉ cần chọn của từng kỳ và phần đã được bù; không cộng toàn bộ tín chỉ của các môn từng không đạt.</p>
    </div>}
    {!!debt.replacements?.length && <details className="rounded-lg border border-slate-200 bg-white p-3"><summary className="cursor-pointer font-medium text-slate-700">Học phần đã bù nợ ({debt.replacements.length})</summary><ul className="mt-2 space-y-2 text-[11px] text-slate-600">{debt.replacements.map((replacement, index) => <li key={index}>HK {replacement.semesterNo}: {data.courseNames[replacement.donorCourseCode] || replacement.donorCourseCode} bù {replacement.settledDebtCredits} TC cho {replacement.settledCourses.map((course) => data.courseNames[course.courseCode] || course.courseCode).join(", ")}.</li>)}</ul></details>}
  </div>;
}

function GradeEvidence({ data, cumulative, ratio }: { data: WarningEvidence; cumulative: boolean; ratio: boolean }) {
  return <div className="space-y-3">
    <p className="text-slate-700 leading-relaxed">{ratio ? `${numeric(data.term.failedCredits)} TC không đạt / ${numeric(data.term.registeredCredits)} TC đăng ký trong học kỳ đánh giá.` : `GPA ${cumulative ? "tích lũy" : "học kỳ"} hệ 4: ${numeric(cumulative ? data.term.cumulativeGpa4 : data.term.gpa4)}, theo bảng tổng hợp điểm của nguồn đào tạo.`}</p>
    <p className="text-[11px] leading-relaxed text-slate-500">Bảng dưới là các lượt học ở {period(data.context.academicYear, data.context.termCode)} đang lưu trong nguồn. GPA tổng hợp không được thay thế bằng điểm tốt nhất của một môn qua nhiều lần học.</p>
    {data.term.courses.length === 0 ? <p className="text-slate-500">Chưa có bảng điểm học phần ở học kỳ này.</p> : <ul className="divide-y divide-slate-100 rounded-lg border border-slate-200 bg-white">{data.term.courses.map((course) => <li key={course.id} className="px-3 py-2.5 space-y-1">
      <p className="font-medium text-slate-800 leading-relaxed">{course.courseName}</p>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-slate-500"><span className="font-mono">{course.courseCode}</span><span>{course.credits} TC</span><span>Điểm 10: <strong className="text-slate-700">{numeric(course.score10)}</strong></span><span>Điểm 4: <strong className="text-slate-700">{numeric(course.score4)}</strong></span><span className={course.status === "FAILED" ? "font-semibold text-red-700" : course.status === "PASSED" ? "font-semibold text-emerald-700" : "text-slate-500"}>{course.letter === "VT" ? "Vắng thi (VT)" : course.status === "PASSED" ? `Đạt${course.letter ? ` (${course.letter})` : ""}` : course.status === "FAILED" ? `Không đạt${course.letter ? ` (${course.letter})` : ""}` : course.status === "PENDING" ? "Chờ điểm" : "Chưa đủ dữ liệu"}</span>{course.excludedFromGpa && <span>Không tính GPA theo nguồn</span>}</div>
    </li>)}</ul>}
  </div>;
}

function ProgressEvidence({ data, listedSemesters = [], hideMandatory = false }: { data: WarningEvidence; listedSemesters?: number[]; hideMandatory?: boolean }) {
  const progress = data.progress;
  if (!progress) return <p className="text-slate-500">Chưa đối chiếu được tiến độ của đúng CTĐT tại học kỳ này.</p>;
  const requiredMissing = progress.missingRequiredCourses.reduce((sum, course) => sum + course.credits, 0);
  return <div className="space-y-3">
    <p className="font-semibold text-slate-800">Đến hết HK {progress.latestSemester}: {progress.expectedCredits} TC theo lộ trình − {progress.earnedCredits} TC đã đạt = {Math.max(0, progress.expectedCredits - progress.earnedCredits)} TC thiếu tiến độ.</p>
    <p className="text-[11px] text-slate-500">Các cột tín chỉ không tính học phần điều kiện. {listedSemesters.length > 0 ? "Các kỳ đang có danh sách môn được trình bày ở trên; chọn kỳ khác để xem thêm." : "Chọn học kỳ để kiểm tra các môn và tín chỉ đã đạt."}</p>
    <div className="rounded-lg border border-slate-200 bg-white px-3 py-2">
      <div className="grid grid-cols-4 gap-2 border-b border-slate-100 pb-2 text-[11px] font-medium text-slate-500"><span>Học kỳ</span><span className="text-right">Kế hoạch</span><span className="text-right">Đã đạt</span><span className="text-right">Lệch</span></div>
      {progress.semesters.map((semester) => listedSemesters.includes(semester.semesterNo) ? <div key={semester.semesterNo} className="grid grid-cols-4 gap-2 border-b border-slate-100 last:border-0 py-2.5 text-[11px]">
        <span>HK {semester.semesterNo}</span><span className="text-right font-mono">{numeric(semester.plannedCredits)}</span><span className="text-right font-mono">{semester.earnedCredits}</span><span className={`text-right font-mono ${semester.plannedCredits != null && semester.earnedCredits < semester.plannedCredits ? "text-red-700" : "text-emerald-700"}`}>{semester.plannedCredits == null ? "—" : `${semester.earnedCredits > semester.plannedCredits ? "+" : ""}${semester.earnedCredits - semester.plannedCredits}`}</span>
      </div> : <details key={semester.semesterNo} className="border-b border-slate-100 last:border-0">
        <summary className="grid grid-cols-4 gap-2 list-none cursor-pointer py-2.5 text-[11px] focus-visible:outline-2 focus-visible:outline-lime-600" aria-label={`Xem học phần học kỳ ${semester.semesterNo}`}>
          <span className="inline-flex items-center gap-1 font-medium text-slate-700"><ChevronDown size={12} />HK {semester.semesterNo}</span><span className="text-right font-mono">{numeric(semester.plannedCredits)}</span><span className="text-right font-mono">{semester.earnedCredits}</span><span className={`text-right font-mono ${semester.plannedCredits != null && semester.earnedCredits < semester.plannedCredits ? "text-red-700" : "text-emerald-700"}`}>{semester.plannedCredits == null ? "—" : `${semester.earnedCredits > semester.plannedCredits ? "+" : ""}${semester.earnedCredits - semester.plannedCredits}`}</span>
        </summary>
        <div className="pb-3 space-y-2">
          <p className="text-[11px] leading-relaxed text-slate-500">Kế hoạch: {numeric(semester.mandatoryCredits)} TC bắt buộc + {numeric(semester.electivePlannedCredits)} TC tự chọn. Các môn tự chọn là danh sách lựa chọn; không cần hoàn thành tất cả. Môn có lượt học đạt được ghi nhận tín chỉ; điểm hiển thị thuộc lượt học gần nhất.</p>
          <CourseList courses={semester.courses} />
        </div>
      </details>)}
    </div>
    {!hideMandatory && progress.missingRequiredCourses.length > 0 && <div className="space-y-2"><h4 className="font-semibold text-slate-800">{progress.missingRequiredCourses.length} môn bắt buộc đến hạn chưa hoàn thành ({requiredMissing} TC)</h4><CourseList courses={progress.missingRequiredCourses} /></div>}
    <p className="text-[11px] leading-relaxed text-slate-600">Theo yêu cầu môn và nhóm trong CTĐT đến mốc này, còn thiếu {requiredMissing} TC bắt buộc và {progress.electiveMissingCredits} TC tự chọn. Tổng yêu cầu môn trong CTĐT có thể khác tổng tín chỉ lộ trình từng học kỳ ở trên.</p>
    {data.graduation && <details className="rounded-lg border border-slate-200 bg-white p-3"><summary className="cursor-pointer font-semibold text-slate-800">Đối chiếu thêm với Dự kiến tốt nghiệp</summary><div className="mt-2.5 space-y-2">
      <p className="text-[11px] text-slate-500">Mốc xét: {period(data.graduation.academicYear, data.graduation.termCode)} · Ghi nhận {date(data.graduation.capturedAt)}</p>
      {!data.graduation.sameAssessment && <p className="text-[11px] text-amber-800">Đợt tốt nghiệp này xét ở học kỳ khác với cảnh báo; số liệu được trình bày theo đúng mốc của từng đợt.</p>}
      <p className="font-semibold text-slate-800">Toàn khóa: đã đạt {numeric(data.graduation.summary.completedCredits)} / {numeric(data.graduation.summary.requiredCredits)} TC; còn thiếu {numeric(data.graduation.summary.remainingCredits)} TC.</p>
      <p className="text-slate-600 leading-relaxed">Tốt nghiệp xét toàn bộ CTĐT, gồm cả học phần ở các kỳ chưa đến hạn. Thiếu tiến độ chỉ đối chiếu lộ trình đến hết HK {progress.latestSemester}.</p>
      <CourseList courses={data.graduation.missingRequiredCourses} />
    </div></details>}
    {!data.graduation && <p className="text-[11px] text-slate-500">Chưa có dữ liệu Dự kiến tốt nghiệp để đối chiếu thêm.</p>}
  </div>;
}

type CreditCriterion = CreditReason & { thresholdLabel: string; basis: string; ruleTitle: string; ruleSummary: string };
export function WarningCreditOverview({ debtReasons, progressReasons, onOpenGraduation, onOpenProgress }: { debtReasons: CreditCriterion[]; progressReasons: CreditCriterion[]; onOpenGraduation: (evaluationId?: string) => void; onOpenProgress: () => void }) {
  const { data } = useContext(VerificationContext);
  const reasons = [...debtReasons, ...progressReasons];
  if (!reasons.length) return null;
  const highRisk = reasons.some((reason) => reason.severity === "high" || (reason.sourceType === "REGULATORY" && reason.thresholdBreached));
  const debtReason = debtReasons.find((reason) => reason.sourceType === "ADVISORY") || debtReasons[0];
  const progressReason = progressReasons[0];
  const missingRequiredCount = Array.isArray(progressReason?.details.missingRequiredCourses) ? progressReason.details.missingRequiredCourses.length : 0;
  const recordedRequiredCredits = progressReason?.details.missingRequiredCredits;
  const missingRequiredCredits = typeof recordedRequiredCredits === "number" || (typeof recordedRequiredCredits === "string" && recordedRequiredCredits.trim() !== "") ? Number(recordedRequiredCredits) : null;
  const metric = (value: string | number | null | undefined) => value == null || value === "" ? "—" : `${value} TC`;
  const checks = data?.checks.filter((check) => (check.key === "debt" && debtReasons.length > 0) || (check.key === "progress" && progressReasons.length > 0)) || [];
  const changed = checks.filter((check) => check.status === "CHANGED");
  const title = debtReason && progressReason ? "Nợ tín chỉ và tiến độ học tập" : debtReason ? "Nợ tín chỉ" : "Tiến độ học tập";
  return <section aria-label={title} className="rounded-xl border border-slate-200/90 bg-white p-3.5 text-xs space-y-3">
    <div className="flex flex-wrap items-start justify-between gap-2"><h3 className="font-bold text-[13px] text-slate-900">{title}</h3><span className={`text-[10px] font-semibold ${highRisk ? "text-red-600" : "text-amber-700"}`}>{highRisk ? "Nguy cơ cao" : "Cần chú ý"}</span></div>
    <div className={`grid grid-cols-1 gap-2.5 ${debtReason && progressReason ? "sm:grid-cols-2" : ""}`}>
      {debtReason && <button type="button" aria-haspopup="dialog" aria-label="Tín chỉ còn nợ: xem chi tiết Dự kiến tốt nghiệp" disabled={!data} onClick={() => onOpenGraduation(data?.graduation?.evaluationId)} className="rounded-lg border border-red-100 bg-red-50/40 p-3 space-y-1.5 text-left transition hover:border-red-300 hover:bg-red-50 cursor-pointer focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-lime-600 disabled:cursor-wait disabled:opacity-70"><p className="font-semibold text-slate-700">Tín chỉ còn nợ</p><p className="font-mono text-lg font-bold text-red-700">{metric(debtReason.observedValue)}</p><p className="text-[11px] leading-relaxed text-slate-600">Nợ còn lại sau học lại và bù môn tự chọn cùng nhóm.</p><CheckStatus check={checks.find((check) => check.key === "debt")} />{debtReasons.map((reason) => <p key={reason.reasonCode} className="border-t border-red-100 pt-1.5 text-[11px] text-slate-600">{reason.sourceType === "REGULATORY" ? "Tiêu chí QĐ600" : "Theo dõi của hệ thống"}: <strong>{reason.thresholdLabel}</strong> · {reason.sourceType === "REGULATORY" && reason.thresholdBreached ? "Vượt ngưỡng" : reason.severity === "high" ? "Nguy cơ cao" : reason.nearThreshold ? "Gần ngưỡng" : "Cần chú ý"}</p>)}<span className="flex items-center gap-1 pt-1 text-[11px] font-semibold text-red-700">Xem Dự kiến tốt nghiệp <ChevronDown size={12} className="-rotate-90" /></span></button>}
      {progressReason && <button type="button" aria-haspopup="dialog" aria-label="Thiếu so với lộ trình: xem chi tiết Tiến độ học tập" onClick={onOpenProgress} className="rounded-lg border border-slate-200 bg-slate-50/70 p-3 space-y-1.5 text-left transition hover:border-slate-400 hover:bg-slate-100 cursor-pointer focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-lime-600"><p className="font-semibold text-slate-700">Thiếu so với lộ trình</p><p className="font-mono text-lg font-bold text-red-700">{metric(progressReason.observedValue)}</p><p className="text-[11px] leading-relaxed text-slate-600">{progressReason.details.latestCompletedSemester != null ? `Đến hết HK ${progressReason.details.latestCompletedSemester}: ` : "Đến mốc đánh giá: "}{metric(progressReason.details.expectedCredits as number | null)} kế hoạch − {metric(progressReason.details.earnedCredits as number | null)} đã đạt.</p><CheckStatus check={checks.find((check) => check.key === "progress")} />{progressReasons.map((reason) => <p key={reason.reasonCode} className="border-t border-slate-200 pt-1.5 text-[11px] text-slate-600">{Number(reason.observedValue) < 4 && Number(reason.details.missingRequiredCredits) > 0 ? "Chưa hoàn thành môn bắt buộc đến hạn" : `${reason.severity === "high" ? "Mức nguy cơ cao" : "Mức cần chú ý"}: ${reason.thresholdLabel}`}</p>)}<span className="flex items-center gap-1 pt-1 text-[11px] font-semibold text-slate-700">Xem Tiến độ học tập <ChevronDown size={12} className="-rotate-90" /></span></button>}
    </div>
    {missingRequiredCount > 0 && <p className="rounded-lg border border-red-100 bg-red-50/30 p-2.5 text-[11px] font-medium text-red-700">Còn {missingRequiredCount} môn bắt buộc đến hạn chưa hoàn thành ({numeric(missingRequiredCredits)} TC). Tín chỉ tự chọn dư không thay thế các môn này.</p>}
    {debtReason && progressReason && <p className="text-[11px] leading-relaxed text-slate-500">Hai chỉ số được đối chiếu chung danh sách học phần. Nợ phản ánh nghĩa vụ học phần chưa được giải quyết; tiến độ so sánh với lộ trình đến mốc đánh giá. Không cộng hai số này thành tổng nợ.</p>}
    {changed.map((check) => <p key={check.key} role="alert" className="rounded-lg bg-amber-50 p-2.5 text-amber-900">{check.label}: đã lưu {numeric(check.recorded)}, nguồn cùng mốc {numeric(check.current)}. Cần xác minh số liệu trước khi kết luận.</p>)}
    <details className="border-t border-slate-100 pt-2.5"><summary className="cursor-pointer font-medium text-[11px] text-slate-500">Căn cứ và ngưỡng đánh giá ({reasons.length} tiêu chí)</summary><ul className="mt-2 space-y-3 text-[11px] text-slate-600">{reasons.map((reason) => <li key={reason.reasonCode}><p className="font-semibold text-slate-700">{reason.ruleTitle}</p><p className="mt-1 leading-relaxed">{reason.ruleSummary}</p><p className="mt-1">Căn cứ: {reason.basis}</p></li>)}</ul></details>
  </section>;
}

export function WarningReasonEvidence({ ruleCode }: { ruleCode: string }) {
  const { data, error } = useContext(VerificationContext);
  const kind = ruleCode.includes("ACCUMULATED_DEBT") ? "debt" : ruleCode.includes("PROGRESS") ? "progress" : ruleCode.includes("FAILED_CREDIT_RATIO") ? "failedRatio" : ruleCode.includes("CUMULATIVE_GPA") ? "cumulativeGpa" : ruleCode.includes("TERM_GPA") ? "termGpa" : null;
  if (!kind) return null;
  if (!data) return error ? <p className="text-[11px] text-slate-500">Chưa tải được bằng chứng; thử đối chiếu lại ở đầu bảng chi tiết.</p> : <LoadingIndicator label="Đang tải bằng chứng đối chiếu…" />;
  const check = data.checks.find((item) => item.key === kind);
  return <details className="group rounded-lg border border-slate-200 bg-slate-50/50 p-3 text-xs">
    <summary className="flex flex-wrap cursor-pointer list-none items-center gap-2 font-semibold text-slate-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-lime-600"><ChevronDown size={14} className="shrink-0 transition-transform group-open:rotate-180" /><span>{kind === "debt" ? "Xem học phần và cách tính nợ" : kind === "progress" ? "Kiểm chứng tiến độ và học phần còn thiếu" : `Xem bảng điểm ${period(data.context.academicYear, data.context.termCode)}`}</span><span className="ml-auto"><CheckStatus check={check} /></span></summary>
    <div className="mt-3 space-y-3 border-t border-slate-200 pt-3">
      {check?.status === "CHANGED" && <p role="alert" className="rounded-lg bg-amber-50 p-2.5 text-amber-900">Kết quả cảnh báo đã lưu: {numeric(check.recorded)}. Nguồn hiện tại cùng mốc: {numeric(check.current)}. {check.recorded === check.current && "Tổng số không đổi nhưng học phần hoặc cách phân bổ đã thay đổi. "}Cần xác minh thay đổi; bằng chứng chi tiết bên dưới không thay thế kết quả đã lưu.</p>}
      <p className="text-[11px] text-slate-500">{kind === "debt" ? "Cách tính nợ được lưu cùng lần đánh giá cảnh báo. Tên học phần được đối chiếu theo CTĐT." : "Chi tiết nguồn đang lưu được đối chiếu lại tại đúng học kỳ cảnh báo."}</p>
      {kind === "debt" ? <DebtEvidence data={data} /> : kind === "progress" ? <ProgressEvidence data={data} /> : <GradeEvidence data={data} cumulative={kind === "cumulativeGpa"} ratio={kind === "failedRatio"} />}
    </div>
  </details>;
}
