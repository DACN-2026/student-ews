"use client";

import { useEffect, useRef, useState, type ReactNode, type RefObject } from "react";
import { createPortal } from "react-dom";
import { AlertCircle, CalendarClock, ChevronDown, ClipboardList, MessageSquarePlus } from "lucide-react";
import { apiFetch } from "@/lib/api-client";
import { useAuthStore } from "@/stores/authStore";
import { ALLOWED_TRANSITIONS, INTERVENTION_STATUS_LABELS, INTERVENTION_TYPE_LABELS, TRANSITION_ACTION_LABELS, type InterventionStatus } from "@/lib/intervention-workflow";
import { formatHistoryDate, formatWarningHistoryEvent, interventionHistoryDetails, type WarningHistoryEvent } from "@/lib/warning-history";
import { numericWarningValue, studentWarningEndpoint, warningReasonSummary, warningRuleCode, warningRuleResults, warningSemesterHistory, warningThresholdLabel, WARNING_STATE_LABELS, type ProfileWarningReason, type ProfileWarningScan } from "@/lib/student-warning-view";
import { getLegalInfo, getHumanUnEvaluatedExplanation, humanRuleName } from "@/lib/warning-rule-details";
import { LoadingIndicator } from "@/components/ui/LoadingState";
import ConfirmDialog from "@/components/ui/ConfirmDialog";
import WarningStudentDetailModal, { type WarningStudentDetailTarget } from "./WarningStudentDetailModal";
import { WarningVerificationProvider, WarningVerificationOverview, WarningCreditOverview, WarningReasonEvidence } from "./WarningVerification";

export type StudentInterventionCase = { caseId: string; interventionStatus: InterventionStatus; nextFollowUpAt: string | null; overdue?: boolean; latestWarningResultId?: string | null };
export type StudentWarningData = {
  presentationState: string; warningLevel: string; warningReasons: ProfileWarningReason[];
  warningInfo: { id: string; termGpa4: number | null; regulatoryCoverage?: string; ruleResults?: unknown } | null;
  warningHistory: ProfileWarningScan[]; interventionHistory: WarningHistoryEvent[];
  warningActions?: Array<{ id: string; actionType: string; status: string; note: string | null; actorName?: string; createdAt: string }>;
};
export type StudentInterventionDetail = { case: StudentInterventionCase; history: WarningHistoryEvent[] };
export type WarningWorkspaceStudent = { id: string; fullName: string; studentCode: string; classCode: string; programCode: string };
export type WarningWorkspaceDecision = { id: string; decisionName?: string; decisionNumber?: string; signDate?: string; createdAt?: string; isAcademicWarning?: boolean };
type Props = {
  student: WarningWorkspaceStudent; warning: StudentWarningData | null; interventionCase: StudentInterventionCase | null;
  decisions: WarningWorkspaceDecision[]; onUpdated: (warning: StudentWarningData, interventionCase: StudentInterventionCase) => void;
  initialDetail?: StudentInterventionDetail; layout?: "profile" | "drawer";
  onOverlayChange?: (open: boolean) => void; overlayContainer?: () => HTMLElement | null;
  interventionRef?: RefObject<HTMLElement | null>;
};
const control = "w-full min-w-0 rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm text-slate-800 outline-none focus:border-lime-600 focus:ring-2 focus:ring-lime-600/20 disabled:bg-slate-50 disabled:text-slate-500";
const action = "inline-flex items-center justify-center gap-2 rounded-lg px-3 py-2 text-xs font-semibold transition cursor-pointer focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-lime-600 disabled:cursor-wait disabled:opacity-50";
function localDateTime() {
  const date = new Date();
  return new Date(date.getTime() - date.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
}
function formatMetric(reason: ProfileWarningReason) {
  const number = numericWarningValue(reason.details.observedValue);
  if (number == null) return "Chưa có số liệu";
  const code = warningRuleCode(reason);
  return code.includes("CREDIT_RATIO") ? `${Math.round(number * 100)}%` : code.includes("GPA") ? number.toFixed(2) : `${number} TC`;
}
function Label({ children, htmlFor }: { children: ReactNode; htmlFor: string }) {
  return <label htmlFor={htmlFor} className="mb-1.5 block text-xs font-semibold text-slate-700">{children}</label>;
}

export default function StudentWarningWorkspace({ student, warning, interventionCase, decisions, onUpdated, initialDetail, layout = "profile", onOverlayChange, overlayContainer, interventionRef }: Props) {
  const { user, can } = useAuthStore();
  const [loadedDetail, setDetail] = useState<StudentInterventionDetail | null>(initialDetail || null);
  const [loadFailure, setLoadFailure] = useState<{ caseId: string; message: string } | null>(null);
  const [attempt, setAttempt] = useState(0);
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState<{ error: boolean; text: string } | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [resolveOpen, setResolveOpen] = useState(false);
  const [sourceTarget, setSourceTarget] = useState<WarningStudentDetailTarget | null>(null);
  const [form, setForm] = useState({ interventionType: "CONTACT", occurredAt: "", note: "" });
  const formRef = useRef<HTMLFormElement>(null);
  const formTriggerRef = useRef<HTMLButtonElement>(null);
  const mounted = useRef(true);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  useEffect(() => {
    onOverlayChange?.(Boolean(sourceTarget || resolveOpen));
    return () => onOverlayChange?.(false);
  }, [onOverlayChange, sourceTarget, resolveOpen]);
  const caseId = interventionCase?.caseId;
  const detail = loadedDetail?.case.caseId === caseId ? loadedDetail : null;
  const loadError = loadFailure && loadFailure.caseId === caseId ? loadFailure.message : "";
  useEffect(() => {
    if (!caseId) return;
    if (initialDetail?.case.caseId === caseId && attempt === 0) return;
    const controller = new AbortController();
    void (async () => {
      try {
        const response = await apiFetch(`/api/v1/academic-warnings/interventions/${caseId}`, { signal: controller.signal });
        if (!response.ok) throw new Error(response.status === 403 ? "Bạn chưa có quyền xem hồ sơ can thiệp này." : "Chưa tải được hồ sơ can thiệp.");
        const data: StudentInterventionDetail = await response.json();
        if (!controller.signal.aborted) { setDetail(data); setLoadFailure(null); }
      } catch (error) { if (!controller.signal.aborted) setLoadFailure({ caseId, message: error instanceof Error ? error.message : "Chưa tải được hồ sơ can thiệp." }); }
    })();
    return () => controller.abort();
  }, [caseId, attempt, initialDetail]);
  useEffect(() => { if (formOpen) formRef.current?.querySelector<HTMLInputElement>("input")?.focus(); }, [formOpen]);
  const current = detail?.case || interventionCase;
  const advisor = user?.role === "SYSTEM_ADMIN" || user?.role === "CLASS_ADVISOR";
  const canRecord = Boolean(detail && current?.interventionStatus !== "RESOLVED" && advisor && can("academic_warning.action.create"));
  const canChange = Boolean(detail && advisor && can("academic_warning.action.update"));
  const history = warningSemesterHistory(warning?.warningHistory || []);
  const selected = history.find(item => item.id === warning?.warningInfo?.id);
  const caseAssessment = history.find(item => item.id === current?.latestWarningResultId);
  const historicalCase = Boolean(caseId && warning?.warningInfo?.id && current?.latestWarningResultId !== warning.warningInfo.id);
  const state = warning?.presentationState || "INSUFFICIENT_DATA";
  const reasons = warning?.warningReasons || [];
  const unEvaluatedRules = warningRuleResults(warning?.warningInfo?.ruleResults).filter(rule => rule.evaluationStatus === "NOT_EVALUATED");
  const isUrgent = state === "HIGH_RISK" || state === "VERIFY_REQUIRED";
  const humanHistory = (warning?.interventionHistory || []).filter(event => !event.systemGenerated)
    .sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt));
  const recordedActions = humanHistory.filter(event => event.eventType === "INTERVENTION_RECORDED");
  const latestAction = recordedActions[0];
  const fullHistory = (warning?.interventionHistory || []).slice().sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt));
  const debtReasons = reasons.filter(reason => warningRuleCode(reason).includes("ACCUMULATED_DEBT"));
  const progressReasons = reasons.filter(reason => warningRuleCode(reason).includes("PROGRESS"));
  const ordinaryReasons = reasons.filter(reason => !debtReasons.includes(reason) && !progressReasons.includes(reason));
  const creditCriterion = (reason: ProfileWarningReason) => ({
    reasonCode: reason.reasonCode, details: reason.details, severity: reason.severity,
    observedValue: numericWarningValue(reason.details.observedValue), thresholdValue: numericWarningValue(reason.details.thresholdValue),
    sourceType: String(reason.details.sourceType || reason.sourceType || ""),
    thresholdBreached: Boolean(reason.details.isThresholdBreached), nearThreshold: Boolean(reason.details.isNearThreshold),
    thresholdLabel: warningThresholdLabel(reason), basis: warningRuleCode(reason).includes("PROGRESS") ? "Chuẩn tiến độ đào tạo của Trường" : reason.details.sourceType === "REGULATORY" ? "Điều 18 – Quyết định 600/QĐ-ĐHĐL" : "Ngưỡng theo dõi của hệ thống",
    ruleTitle: getLegalInfo(reason).title, ruleSummary: getLegalInfo(reason).summary,
  });
  async function refresh() {
    const [caseResponse, warningResponse] = await Promise.all([
      apiFetch(`/api/v1/academic-warnings/interventions/${caseId}`, { cache: "no-store" }),
      apiFetch(studentWarningEndpoint(student.id), { cache: "no-store" }),
    ]);
    if (!caseResponse.ok || !warningResponse.ok) throw new Error("Đã lưu thay đổi, nhưng chưa tải được dữ liệu mới. Hãy tải lại hồ sơ để xác nhận.");
    const [newDetail, newWarning]: [StudentInterventionDetail, StudentWarningData] = await Promise.all([caseResponse.json(), warningResponse.json()]);
    if (mounted.current) { setDetail(newDetail); onUpdated(newWarning, newDetail.case); }
  }
  async function mutate(path: string, method: string, body: Record<string, unknown>, success: string) {
    if (busy || !caseId) return;
    setBusy(true); setFeedback(null);
    let saved = false;
    try {
      const response = await apiFetch(`/api/v1/academic-warnings/interventions/${caseId}/${path}`, {
        method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
      });
      if (!response.ok) {
        const failure = await response.json().catch(() => null);
        if (response.status === 409) await refresh();
        throw new Error(failure?.error?.message || "Không thể lưu thay đổi. Vui lòng thử lại.");
      }
      saved = true;
      if (mounted.current) { setFormOpen(false); setResolveOpen(false); }
      await refresh();
      if (mounted.current) { setFeedback({ error: false, text: success }); formTriggerRef.current?.focus(); }
    } catch (error) { if (mounted.current) setFeedback({ error: true, text: error instanceof Error ? error.message : "Không thể lưu thay đổi." }); }
    finally { if (mounted.current) { setBusy(false); if (saved) setForm({ interventionType: "CONTACT", occurredAt: "", note: "" }); } }
  }
  function changeStatus(status: string) {
    if (status === "RESOLVED") { setResolveOpen(true); return; }
    void mutate("status", "PATCH", { status }, `Đã cập nhật: ${INTERVENTION_STATUS_LABELS[status]}.`);
  }
  function startForm() {
    setFormOpen(true); setFeedback(null);
    setForm(previous => ({ ...previous, occurredAt: previous.occurredAt || localDateTime() }));
  }
  const verification = Boolean(caseId && warning?.warningInfo?.id);
  const reasonContent = <>
    {verification && <WarningVerificationOverview />}
    <h3 id="profile-warning-reasons" className="text-sm font-bold text-slate-900">Vì sao sinh viên này được cảnh báo?</h3>
    {reasons.length === 0 ? <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50 p-5 text-xs text-slate-600">
      {state === "INSUFFICIENT_DATA" ? "Chưa đủ dữ liệu để xác định nguyên nhân. Kiểm tra bảng điểm và kết quả đánh giá trước khi kết luận." : "Chưa ghi nhận tiêu chí cần cảnh báo trong kết quả hiện tại."}
    </div> : <div className="space-y-4">
      {ordinaryReasons.length > 0 && <div className="space-y-3">
        <p className="flex items-center gap-1.5 text-xs font-semibold text-slate-800"><span className="h-2 w-2 rounded-full bg-red-500" aria-hidden="true" />Kết quả học vụ</p>
        {ordinaryReasons.map(reason => {
          const regulatory = reason.details.sourceType === "REGULATORY";
          const breached = regulatory && Boolean(reason.details.isThresholdBreached);
          const ratio = warningRuleCode(reason).includes("CREDIT_RATIO");
          return <article key={reason.id || reason.reasonCode} className="space-y-2.5 rounded-xl border border-slate-200 bg-white p-3.5">
            <div className="flex flex-wrap items-start justify-between gap-2"><h4 className="text-xs font-semibold text-slate-900">{reason.title || "Tiêu chí cần theo dõi"}</h4><span className={"text-[10px] font-semibold " + (breached || reason.severity === "high" ? "text-red-600" : "text-amber-700")}>{breached ? "Vượt ngưỡng" : reason.severity === "high" ? "Nguy cơ cao" : reason.details.isNearThreshold ? "Gần ngưỡng" : "Cần chú ý"}</span></div>
            <p className="text-[10px] text-slate-500">{regulatory ? "Tiêu chí theo QĐ600" : "Theo dõi sớm của hệ thống"}</p>
            <p className="text-xs leading-relaxed text-slate-600">{warningReasonSummary(reason)}</p>
            <dl className="grid grid-cols-2 gap-2.5 text-xs"><div className="min-w-0 rounded-lg border border-red-100 bg-red-50/50 p-2.5"><dt className="text-[11px] text-red-600">{ratio ? "Không đạt" : "Điểm đạt được"}</dt><dd className="mt-0.5 font-mono text-base font-bold text-red-800">{formatMetric(reason)}</dd></div><div className="min-w-0 rounded-lg border border-slate-200 bg-slate-50 p-2.5"><dt className="text-[11px] text-slate-500">Ngưỡng cảnh báo</dt><dd className="mt-0.5 font-mono text-base font-bold text-slate-800">{warningThresholdLabel(reason)}</dd></div></dl>
            {verification && <WarningReasonEvidence ruleCode={warningRuleCode(reason)} />}
            <WarningRuleDetails reason={reason} />
          </article>;
        })}
      </div>}
      {(debtReasons.length > 0 || progressReasons.length > 0) && <WarningCreditOverview debtReasons={debtReasons.map(creditCriterion)} progressReasons={progressReasons.map(creditCriterion)} onOpenGraduation={evaluationId => setSourceTarget({ kind: "graduation", evaluationId })} onOpenProgress={() => setSourceTarget({ kind: "progress" })} />}
    </div>}
    {unEvaluatedRules.length > 0 && <details className="rounded-xl border border-slate-200 bg-slate-50 p-3"><summary className="cursor-pointer text-xs font-semibold text-slate-700">Tiêu chí chưa đủ dữ liệu để đánh giá ({unEvaluatedRules.length})</summary><ul className="mt-3 space-y-3">{unEvaluatedRules.map((rule, index) => <li key={String(rule.ruleCode || index)} className="rounded-lg border border-slate-200 bg-white p-3 text-xs"><p className="font-semibold text-slate-800">{humanRuleName(rule.ruleCode)}</p><p className="mt-1.5 leading-relaxed text-slate-600">{getHumanUnEvaluatedExplanation(rule)}</p></li>)}</ul></details>}
    {warning?.warningInfo?.regulatoryCoverage === "PARTIAL" && <p className="flex items-start gap-2 rounded-lg border border-blue-100 bg-blue-50 p-3 text-xs leading-relaxed text-blue-800"><AlertCircle size={15} className="shrink-0" />Một số tiêu chí chưa đủ dữ liệu để đánh giá. Chưa thể kết luận đầy đủ các điều kiện theo quy chế.</p>}
  </>;
  return <div className="space-y-5" data-student-warning-workspace data-warning-result-id={warning?.warningInfo?.id} data-intervention-case-id={caseId}>
    <header className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs" aria-label="Trạng thái cảnh báo và can thiệp">
      <h2 className={isUrgent ? "font-medium text-red-600" : state === "MONITORING" ? "font-medium text-amber-700" : state === "INSUFFICIENT_DATA" ? "font-medium text-slate-600" : "font-medium text-emerald-700"}>{WARNING_STATE_LABELS[state]}</h2>
      {current && <span className={"text-[10px] font-semibold " + (current.interventionStatus === "RESOLVED" ? "text-emerald-700" : "text-blue-600")}>{INTERVENTION_STATUS_LABELS[current.interventionStatus]}</span>}
      {current?.overdue && <span className="text-[10px] font-semibold text-red-600">Quá hạn theo dõi</span>}
      {!verification && <span className="text-[11px] text-slate-500">{selected ? selected.termCode + " · " + selected.academicYear : "Chưa có kỳ đánh giá chính thức"}</span>}
    </header>
    {historicalCase && <p className="rounded-lg border border-blue-200 bg-blue-50 p-3 text-xs leading-relaxed text-blue-800">{caseAssessment ? `Hồ sơ can thiệp đang xem gắn với ${caseAssessment.termCode} · ${caseAssessment.academicYear}. ` : "Hồ sơ can thiệp đang xem chưa liên kết với kết quả đánh giá mới nhất. "}Số liệu học vụ bên dưới là kết quả chính thức mới nhất, cùng nguồn với hồ sơ sinh viên. Các cập nhật can thiệp được lưu vào hồ sơ đang mở.</p>}
    <div className="space-y-5">
      <section className="min-w-0" aria-labelledby="profile-warning-reasons">
        <div className="space-y-4">{verification ? <WarningVerificationProvider caseId={caseId!} resultId={warning!.warningInfo!.id}>{reasonContent}</WarningVerificationProvider> : reasonContent}</div>
      </section>
      <section ref={interventionRef} tabIndex={-1} className="min-w-0 scroll-mt-4 rounded-xl border border-slate-200 bg-white p-4 outline-none sm:p-5 focus-visible:ring-2 focus-visible:ring-lime-600" aria-labelledby="profile-intervention-title">
        <div className="flex items-center gap-2"><ClipboardList size={17} className="text-slate-500" /><h3 id="profile-intervention-title" className="text-sm font-bold text-slate-900">Can thiệp & theo dõi</h3></div>
        {caseId ? <>
          <div className="mt-4 flex items-center justify-between gap-2 border-b border-slate-100 pb-4"><span className="text-xs text-slate-500">Trạng thái xử lý</span><strong className={`text-xs ${current?.interventionStatus === "RESOLVED" ? "text-emerald-700" : "text-blue-700"}`}>{INTERVENTION_STATUS_LABELS[current?.interventionStatus || "OPEN"]}</strong></div>
          <dl className="mt-4 space-y-4 text-xs"><div><dt className="text-slate-500">Phụ trách hỗ trợ</dt><dd className="mt-1 font-medium text-slate-800">GVCN/CVHT lớp {student.classCode}</dd></div><div><dt className="flex items-center gap-1.5 text-slate-500"><CalendarClock size={14} />Lịch theo dõi tiếp theo</dt><dd className={`mt-1 font-semibold ${current?.overdue ? "text-red-700" : "text-slate-800"}`}>{current?.nextFollowUpAt ? formatHistoryDate(current.nextFollowUpAt) : "Chưa đặt lịch"}{current?.overdue && " · Quá hạn"}</dd></div><div><dt className="text-slate-500">Hoạt động gần nhất</dt><dd className="mt-1 leading-relaxed text-slate-700">{latestAction ? <>{INTERVENTION_TYPE_LABELS[String(latestAction.details.interventionType)] || "Hỗ trợ sinh viên"}<span className="mt-1 block text-slate-500">{formatHistoryDate(String(latestAction.details.occurredAt || latestAction.createdAt))} · {latestAction.actor?.displayName || "Cán bộ phụ trách"}</span></> : "Chưa ghi nhận hoạt động can thiệp"}</dd></div></dl>
          {!detail && !loadError && <div className="mt-4"><LoadingIndicator label="Đang tải hồ sơ can thiệp…" /></div>}
          {loadError && <div role="alert" className="mt-4 rounded-lg bg-amber-50 p-3 text-xs text-amber-900">{loadError}<button type="button" onClick={() => { setLoadFailure(null); setAttempt(value => value + 1); }} className="ml-2 font-semibold underline">Thử lại</button></div>}
          {canRecord && !formOpen && <button ref={formTriggerRef} type="button" onClick={startForm} disabled={busy} className={`${action} mt-5 w-full bg-slate-900 py-3 text-white hover:bg-slate-800`}><MessageSquarePlus size={16} />Ghi nhận can thiệp</button>}
          {canChange && !formOpen && <div className="mt-3 flex flex-wrap gap-2">{(ALLOWED_TRANSITIONS[current?.interventionStatus || ""] || []).map(status => <button key={status} type="button" disabled={busy} onClick={() => changeStatus(status)} className={`${action} border border-slate-200 text-slate-700 hover:bg-slate-50`}>{TRANSITION_ACTION_LABELS[status]}</button>)}</div>}
          {formOpen && canRecord && <form ref={formRef} onSubmit={event => {
            event.preventDefault();
            if (!form.occurredAt) return;
            void mutate("activities", "POST", { interventionType: form.interventionType, occurredAt: new Date(form.occurredAt).toISOString(), note: form.note.trim() || null }, "Đã lưu hoạt động can thiệp và cập nhật hồ sơ.");
          }} className="mt-5 space-y-4 border-t border-slate-200 pt-4" aria-label="Ghi nhận can thiệp trong hồ sơ">
            <h4 className="text-sm font-semibold text-slate-900">Ghi nhận can thiệp</h4>
            <fieldset disabled={busy} className="min-w-0 space-y-4">
              <div><Label htmlFor="profile-iv-type">Hình thức hỗ trợ</Label><select id="profile-iv-type" value={form.interventionType} onChange={event => setForm({ ...form, interventionType: event.target.value })} className={control}>{Object.entries(INTERVENTION_TYPE_LABELS).map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select></div>
              <div><Label htmlFor="profile-iv-date">Thời gian thực hiện *</Label><input id="profile-iv-date" type="datetime-local" required value={form.occurredAt} onChange={event => setForm({ ...form, occurredAt: event.target.value })} className={control} /></div>
              <div><Label htmlFor="profile-iv-note">Ghi chú <span className="font-normal text-slate-500">(không bắt buộc)</span></Label><textarea id="profile-iv-note" rows={4} value={form.note} onChange={event => setForm({ ...form, note: event.target.value })} placeholder="Ghi chú thêm về hoạt động hỗ trợ sinh viên…" className={control} /></div>
              <p className="text-[11px] leading-relaxed text-slate-500">{current?.interventionStatus === "OPEN" ? "Lưu hoạt động sẽ chuyển hồ sơ sang Đang xử lý. " : ""}Hoạt động được lưu vào nhật ký hỗ trợ.</p>
              <div className="flex justify-end gap-2"><button type="button" onClick={() => { setFormOpen(false); requestAnimationFrame(() => formTriggerRef.current?.focus()); }} className={`${action} text-slate-600 hover:bg-slate-50`}>Hủy</button><button type="submit" className={`${action} bg-slate-900 text-white hover:bg-slate-800`}>{busy ? "Đang lưu…" : "Lưu can thiệp"}</button></div>
            </fieldset>
          </form>}
          {detail && !canRecord && !canChange && <p className="mt-4 text-xs leading-relaxed text-slate-500">Bạn có thể xem thông tin hỗ trợ. GVCN/CVHT phụ trách hoặc quản trị viên sẽ cập nhật hoạt động can thiệp.</p>}
        </> : <p className="mt-4 rounded-lg bg-slate-50 p-3 text-xs leading-relaxed text-slate-600">Chưa có hồ sơ can thiệp để cập nhật. {reasons.length ? "Cần kiểm tra kết quả cảnh báo và hồ sơ can thiệp của sinh viên." : "Tiếp tục theo dõi các kỳ đánh giá tiếp theo."}</p>}
        {feedback && <p role={feedback.error ? "alert" : "status"} className={`mt-4 rounded-lg p-3 text-xs leading-relaxed ${feedback.error ? "bg-red-50 text-red-800" : "bg-emerald-50 text-emerald-800"}`}>{feedback.text}</p>}
      </section>
    </div>
    <section className="rounded-xl border border-slate-200 bg-white p-4 sm:p-5" aria-labelledby="profile-support-history">
      <div className="flex flex-wrap items-center justify-between gap-2"><h3 id="profile-support-history" className="text-sm font-bold text-slate-900">Nhật ký hỗ trợ</h3><span className="text-xs text-slate-500">{recordedActions.length} hoạt động đã ghi nhận</span></div>
      {humanHistory.length === 0 ? <p className="mt-3 text-xs text-slate-500">Chưa có hoạt động hỗ trợ được ghi nhận. Sau khi trao đổi với sinh viên, lưu nội dung và lịch hẹn ở phần Can thiệp & theo dõi.</p> : <>
        <SupportEvents events={humanHistory.slice(0, 4)} />
        {humanHistory.length > 4 && <details className="mt-3 border-t border-slate-100 pt-3"><summary className="cursor-pointer text-xs font-semibold text-slate-600">Xem thêm {humanHistory.length - 4} cập nhật hỗ trợ</summary><SupportEvents events={humanHistory.slice(4)} /></details>}
      </>}
      {Boolean(warning?.warningActions?.length) && <details className="mt-4 border-t border-slate-100 pt-3"><summary className="cursor-pointer text-xs font-semibold text-slate-600">Nhật ký hỗ trợ trước đây ({warning!.warningActions!.length})</summary><ul className="mt-3 divide-y divide-slate-100">{warning!.warningActions!.map(item => <li key={item.id} className="py-3 text-xs"><p className="font-medium text-slate-800">{item.actorName || "Cán bộ phụ trách"} · {formatHistoryDate(item.createdAt)}</p><p className="mt-1 whitespace-pre-wrap leading-relaxed text-slate-600">{item.note || "Chưa có ghi chú"}</p></li>)}</ul></details>}
    </section>
    <details className="group rounded-xl border border-slate-200 bg-white p-4 sm:p-5">
      <summary className="flex cursor-pointer list-none flex-wrap items-center justify-between gap-2 text-sm font-semibold text-slate-800"><span>Lịch sử đánh giá theo học kỳ</span><span className="flex items-center gap-2 text-xs font-normal text-slate-500">{history.length} học kỳ<ChevronDown size={16} className="group-open:rotate-180" /></span></summary>
      <p className="mt-3 text-xs text-slate-500">Mỗi học kỳ hiển thị kết quả chính thức gần nhất. Các lần tính lại cùng kỳ không được tính thành cảnh báo mới.</p>
      <ul className="mt-3 divide-y divide-slate-100">{history.map(item => <li key={item.id} className="flex flex-wrap items-center justify-between gap-2 py-3 text-xs"><span className="font-medium text-slate-800">{item.termCode} · {item.academicYear}{item.id === warning?.warningInfo?.id && <span className="ml-2 text-[11px] text-slate-500">Hiện tại</span>}</span><span className="flex flex-wrap gap-x-4 gap-y-1"><span className="text-slate-500">GPA kỳ: <strong className="font-mono text-slate-800">{item.termGpa4 == null ? "—" : Number(item.termGpa4).toFixed(2)}</strong></span><span className={item.businessStatus === "HIGH_RISK" || item.businessStatus === "VERIFY_REQUIRED" ? "text-red-700" : item.businessStatus === "MONITORING" ? "text-amber-700" : "text-slate-600"}>{WARNING_STATE_LABELS[item.businessStatus]} · {item.reasonCount} nguyên nhân</span></span></li>)}</ul>
      {!history.length && <p className="mt-3 text-xs text-slate-500">Chưa có kết quả đánh giá chính thức.</p>}
    </details>
    <details className="rounded-xl border border-slate-200 bg-white p-4 sm:p-5"><summary className="cursor-pointer text-xs font-semibold text-slate-600">Quyết định học vụ & lịch sử cập nhật chi tiết</summary>
      {decisions.filter(item => item.isAcademicWarning).map(item => <p key={item.id} className="mt-3 text-xs leading-relaxed text-slate-700">{item.decisionName} · Số {item.decisionNumber || "—"}{(item.signDate || item.createdAt) && ` · ${formatHistoryDate((item.signDate || item.createdAt)!)}`}</p>)}
      {fullHistory.length ? <SupportEvents events={fullHistory} /> : <p className="mt-3 text-xs text-slate-500">Chưa có lịch sử cập nhật.</p>}
    </details>
    {layout === "drawer" && (sourceTarget || resolveOpen) ? createPortal(overlays(), overlayContainer?.() || document.body) : overlays()}
  </div>;
  function overlays() {
    return <>
      <ConfirmDialog isOpen={resolveOpen} onClose={() => { if (!busy) setResolveOpen(false); }} onConfirm={() => void mutate("status", "PATCH", { status: "RESOLVED" }, "Đã hoàn tất hồ sơ can thiệp.")} loading={busy} title="Hoàn tất hồ sơ can thiệp?" confirmText="Hoàn tất" cancelText="Tiếp tục xử lý" message={<div className="space-y-3"><p>Hãy kiểm tra nội dung hỗ trợ đã ghi nhận trước khi hoàn tất. Mức nguy cơ học tập được đánh giá độc lập; hoàn tất can thiệp không xóa cảnh báo của sinh viên.</p>{feedback?.error && <p role="alert" className="rounded-lg bg-red-50 p-3 text-red-800">{feedback.text}</p>}</div>} />
      {sourceTarget && <WarningStudentDetailModal key={`${sourceTarget.kind}:${sourceTarget.evaluationId || ""}`} target={sourceTarget} student={student} onClose={() => setSourceTarget(null)} />}
    </>;
  }
}

function WarningRuleDetails({ reason }: { reason: ProfileWarningReason }) {
  const info = getLegalInfo(reason);
  return <details className="group border-t border-slate-100 pt-2.5 text-[11px]"><summary className="flex cursor-pointer list-none flex-wrap items-center justify-between gap-2 text-slate-500 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-lime-600"><span>Căn cứ: <strong className="font-medium text-slate-700">{reason.details.sourceType === "REGULATORY" ? "Điều 18 – Quyết định 600/QĐ-ĐHĐL" : "Tiêu chí theo dõi của hệ thống"}</strong></span><span className="font-semibold text-lime-600"><span className="group-open:hidden">Xem nội dung quy định</span><span className="hidden group-open:inline">Ẩn nội dung quy định</span></span></summary><div className="mt-2 rounded-lg bg-slate-50 p-3"><p className="font-semibold text-slate-800">{info.title}</p><p className="mt-1.5 leading-relaxed text-slate-600">{info.summary}</p></div></details>;
}

function SupportEvents({ events }: { events: WarningHistoryEvent[] }) {
  return <ol className="mt-4 divide-y divide-slate-100">{events.map(event => {
    const item = formatWarningHistoryEvent(event);
    if (event.eventType === "INTERVENTION_RECORDED") {
      const activity = interventionHistoryDetails(event);
      return <li key={event.id} className="py-4 first:pt-0" data-support-activity={event.id}>
        <div className="flex flex-wrap items-start justify-between gap-2 text-xs"><span className="font-semibold text-slate-900">{activity.typeLabel}</span><span className="text-[11px] text-slate-500">Ghi nhận <time dateTime={event.createdAt}>{formatHistoryDate(event.createdAt)}</time></span></div>
        <dl className="mt-2.5 space-y-2 text-xs"><div className="flex flex-wrap gap-x-2 gap-y-1"><dt className="text-slate-500">Thời gian thực hiện:</dt><dd className="font-medium text-slate-700"><time dateTime={activity.occurredAt}>{formatHistoryDate(activity.occurredAt)}</time></dd></div><div className="flex flex-wrap gap-x-2 gap-y-1"><dt className="text-slate-500">Người ghi nhận:</dt><dd className="font-medium text-slate-700">{item.actorName}</dd></div>
          <div className="rounded-lg border border-slate-100 bg-slate-50/70 p-3"><dt className="mb-1 font-medium text-slate-600">Ghi chú</dt><dd className="whitespace-pre-wrap break-words leading-relaxed text-slate-800">{activity.note || <span className="text-slate-500">Không có ghi chú</span>}</dd></div>
          {activity.legacyResult && <div><dt className="font-medium text-slate-600">Kết quả đã ghi nhận</dt><dd className="mt-1 whitespace-pre-wrap break-words leading-relaxed text-slate-700">{activity.legacyResult}</dd></div>}
          {activity.legacyFollowUpAt && <div className="flex flex-wrap gap-x-2 gap-y-1"><dt className="text-slate-500">Lịch theo dõi đã ghi nhận:</dt><dd className="text-slate-700">{formatHistoryDate(activity.legacyFollowUpAt)}</dd></div>}
        </dl>
      </li>;
    }
    return <li key={event.id} className="py-3 first:pt-0"><div className="flex flex-wrap items-center justify-between gap-2 text-xs"><span className="font-semibold text-slate-800">{item.title} <span className="font-normal text-slate-500">· {item.actorName}</span></span><time dateTime={event.createdAt} className="text-[11px] text-slate-500">{formatHistoryDate(event.createdAt)}</time></div>{item.detail && <p className="mt-1.5 whitespace-pre-wrap text-xs leading-relaxed text-slate-600">{item.detail}</p>}</li>;
  })}</ol>;
}
