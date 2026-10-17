"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowLeft, Check, Info, Save } from "lucide-react";
import { apiFetch } from "@/lib/api-client";
import { useAuthStore } from "@/stores/authStore";
import { useUnsavedChanges } from "@/lib/use-unsaved-changes";
import ForbiddenState from "@/components/ui/ForbiddenState";
import LoadingState from "@/components/ui/LoadingState";
import WarningPolicyReference, { WarningRegulationDocument } from "./WarningPolicyReference";
import WarningNumberField from "./WarningNumberField";
import ConductSourceNotice from "./ConductSourceNotice";
import {
  conductSignalsAvailable, gpaAdvisoryExample, signalFields, signalGroups, signalDisplayValue, signalStoredValue,
  validateWarningConfiguration, warningNumber, warningConfigurationKey,
  type CreditField, type OptionalField, type WarningConfiguration, type WarningSettings,
} from "@/lib/early-warning-configuration";

const inputClass = "min-h-11 w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm text-slate-800 transition-colors hover:border-slate-400 focus:border-lime-700 focus:outline-none focus:ring-2 focus:ring-lime-700/25 disabled:bg-slate-50";
const sectionClass = "rounded-xl border border-slate-200 bg-white";

export default function EarlyWarningSettingsPage() {
  const { can, status } = useAuthStore();
  const permitted = can("academic_warning.policy.manage");
  const [configuration, setConfiguration] = useState<WarningConfiguration | null>(null);
  const [savedConfiguration, setSavedConfiguration] = useState<WarningConfiguration | null>(null);
  const [error, setError] = useState("");
  const [conflict, setConflict] = useState(false);
  const [success, setSuccess] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [retry, setRetry] = useState(0);
  const [exampleYear, setExampleYear] = useState(1);

  useEffect(() => {
    if (!permitted || status !== "authenticated") return;
    const controller = new AbortController();
    void (async () => {
      await Promise.resolve();
      if (controller.signal.aborted) return;
      setLoading(true); setError(""); setConflict(false); setSuccess("");
      try {
        const response = await apiFetch("/api/v1/academic-warnings/policies/early-warning", { signal: controller.signal, cache: "no-store" });
        const data = await response.json();
        if (!response.ok) throw new Error(data.error?.message || "Không thể tải cấu hình.");
        if (!controller.signal.aborted) {
          setConfiguration(data); setSavedConfiguration(data);
        }
      } catch (failure) { if (!controller.signal.aborted) setError(failure instanceof Error ? failure.message : "Không thể tải cấu hình."); }
      finally { if (!controller.signal.aborted) setLoading(false); }
    })();
    return () => controller.abort();
  }, [permitted, status, retry]);

  const errors = configuration ? validateWarningConfiguration(configuration) : {};
  const invalid = Object.keys(errors).length > 0;
  const dirty = Boolean(configuration && savedConfiguration && (
    warningConfigurationKey(configuration) !== warningConfigurationKey(savedConfiguration)
  ));
  useUnsavedChanges(dirty);
  function edited() { setSuccess(""); setError(""); }
  function setting(key: keyof WarningSettings, value: WarningSettings[keyof WarningSettings]) {
    if ((key === "conductScoreBelow" || key === "conductScoreDrop") && value !== null
      && configuration && !conductSignalsAvailable(configuration.settings)) return;
    setConfiguration(previous => previous ? { ...previous, settings: { ...previous.settings, [key]: value } } : previous);
    edited();
  }
  function discard() {
    setConfiguration(savedConfiguration);
    edited();
  }
  async function save(event: React.FormEvent) {
    event.preventDefault();
    if (!configuration || !permitted || saving || !dirty) return;
    if (invalid) { setError("Kiểm tra các ô được đánh dấu trước khi lưu."); return; }
    setSaving(true); setError(""); setSuccess("");
    const nextSettings = { ...configuration.settings };
    try {
      const response = await apiFetch("/api/v1/academic-warnings/policies/early-warning", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ basePolicyId: configuration.id, name: configuration.name.trim(), marginGpa4: configuration.marginGpa4, settings: nextSettings }),
      });
      const data = await response.json();
      if (!response.ok) { setConflict(response.status === 409); throw new Error(data.error?.message || "Không thể lưu cấu hình."); }
      const saved = { ...configuration, name: configuration.name.trim(), settings: nextSettings, id: data.id, version: data.version };
      setConfiguration(saved); setSavedConfiguration(saved); setConflict(false);
      setSuccess(`Đã lưu phiên bản ${data.version}. Cấu hình được dùng cho các lần đánh giá tiếp theo. Muốn cập nhật học kỳ đã có kết quả, hãy chạy lại đánh giá trong Cảnh báo học tập.`);
    } catch (failure) { setError(failure instanceof Error ? failure.message : "Không thể lưu cấu hình."); }
    finally { setSaving(false); }
  }

  if (status !== "loading" && status !== "idle" && !permitted) return <ForbiddenState title="Không có quyền cấu hình chính sách" description="Chức năng này dành cho người được cấp quyền quản lý chính sách cảnh báo học tập." requiredPermission="academic_warning.policy.manage" />;
  if (loading) return <div className="mx-auto max-w-6xl p-4 sm:p-6"><LoadingState variant="page" label="Đang tải cấu hình cảnh báo học tập…" /></div>;

  function creditPair(title: string, description: string, monitoring: CreditField, high: CreditField, max: number) {
    if (!configuration) return null;
    const lower = configuration.settings[monitoring];
    const upper = configuration.settings[high];
    return <fieldset className="min-w-0 space-y-4 border-t border-slate-100 px-5 py-5 sm:px-6">
      <legend className="sr-only">{title}</legend>
      <div><h3 className="text-sm font-semibold text-slate-900">{title}</h3><p className="mt-1.5 text-xs leading-5 text-slate-600">{description}</p></div>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <WarningNumberField id={monitoring} label="Cần chú ý từ" unit="tín chỉ" value={lower} min={1} max={max} onChange={value => setting(monitoring, value)} error={errors[monitoring]} />
        <WarningNumberField id={high} label="Nguy cơ cao từ" unit="tín chỉ" value={upper} min={1} max={max} onChange={value => setting(high, value)} error={errors[high]} />
      </div>
      {!errors[monitoring] && !errors[high] && <p className="flex flex-wrap items-center gap-x-4 gap-y-2 rounded-lg bg-slate-50 px-3 py-2.5 text-xs leading-5" aria-live="polite">
        <span className="font-medium text-amber-800">Cần chú ý: {warningNumber(lower)} đến dưới {warningNumber(upper)} TC</span>
        <span className="font-medium text-red-700">Nguy cơ cao: từ {warningNumber(upper)} TC</span>
      </p>}
      {monitoring === "progressMonitoringFrom" && <p className="text-xs leading-5 text-slate-500">Học phần bắt buộc đến hạn chưa hoàn thành vẫn cần chú ý. Nếu số tín chỉ bắt buộc còn thiếu đạt ngưỡng nguy cơ cao, hệ thống ưu tiên mức nguy cơ cao kể cả khi tổng tín chỉ không thiếu.</p>}
    </fieldset>;
  }

  const selectedYear = configuration?.regulatory.cumulativeGpaByYear.find(year => year.yearLevel === exampleYear)
    || configuration?.regulatory.cumulativeGpaByYear[0];
  const enabledSignals = configuration ? (Object.keys(signalFields) as OptionalField[]).filter(key => configuration.settings[key] !== null).length : 0;
  const conductAvailable = configuration ? conductSignalsAvailable(configuration.settings) : false;

  return <div className="mx-auto max-w-6xl space-y-5 p-4 sm:p-6">
    <header className="flex flex-wrap items-start justify-between gap-4">
      <div><h1 className="text-2xl font-bold tracking-tight text-slate-900">Cấu hình Cảnh báo học tập</h1>
        <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-600">Thiết lập ngưỡng theo dõi từ kết quả học kỳ chính trước để giáo viên chủ nhiệm và cố vấn học tập chủ động hỗ trợ sinh viên.</p>
      </div>
      <Link href="/reports" className="inline-flex min-h-10 items-center gap-2 rounded-lg px-2 text-xs font-semibold text-slate-600 hover:text-lime-800 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-lime-700"><ArrowLeft size={15} aria-hidden="true" />Về Cảnh báo học tập</Link>
    </header>
    <WarningRegulationDocument />
    {error && <div id="configuration-error" role="alert" className="scroll-mt-6 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm leading-6 text-red-800">{error}
      {(!configuration || conflict) && <button type="button" onClick={() => setRetry(value => value + 1)} className="ml-2 min-h-9 font-semibold underline underline-offset-4 focus-visible:outline-2 focus-visible:outline-offset-2">{conflict ? "Tải bản mới và bỏ thay đổi đang nhập" : "Thử tải lại"}</button>}
    </div>}
    {configuration && <form onSubmit={save} noValidate>
      <fieldset disabled={saving} className="min-w-0">
        <legend className="sr-only">Cấu hình ngưỡng hỗ trợ sớm</legend>
        <div className="grid items-start gap-6 xl:grid-cols-[minmax(0,1fr)_18rem]">
          <div className="min-w-0 space-y-5">
            <section className={`${sectionClass} p-5 sm:p-6`} aria-labelledby="policy-title">
              <div className="flex flex-wrap items-center justify-between gap-2"><h2 id="policy-title" className="font-semibold text-slate-900">Chính sách đang áp dụng</h2><span className="inline-flex items-center gap-1.5 text-xs text-slate-500"><Check size={14} aria-hidden="true" />Phiên bản {configuration.version}</span></div>
              <label htmlFor="policy-name" className="mt-4 block text-xs font-medium text-slate-700">Tên chính sách</label>
              <input id="policy-name" required maxLength={200} value={configuration.name} onChange={event => { setConfiguration({ ...configuration, name: event.target.value }); edited(); }} className={`${inputClass} mt-2`} aria-invalid={Boolean(errors.name)} aria-describedby={errors.name ? "policy-name-error" : "policy-name-help"} />
              {errors.name ? <p id="policy-name-error" className="mt-1.5 text-xs text-red-700">{errors.name}</p> : <p id="policy-name-help" className="mt-2 text-xs leading-5 text-slate-500">Tên dùng để nhận biết chính sách và các phiên bản cấu hình.</p>}
              <p className="mt-4 flex items-start gap-2 rounded-lg bg-lime-50 px-3 py-3 text-xs leading-5 text-lime-900"><Info size={16} aria-hidden="true" className="mt-0.5 shrink-0" /><span>“Cần chú ý” và “Nguy cơ cao” là mức ưu tiên hỗ trợ của hệ thống. Thay đổi cấu hình không tự ban hành quyết định cảnh báo học vụ.</span></p>
            </section>
            <section className={sectionClass} aria-labelledby="primary-thresholds-title">
              <div className="px-5 py-5 sm:px-6"><h2 id="primary-thresholds-title" className="font-semibold text-slate-900">Ngưỡng hỗ trợ sớm</h2><p className="mt-2 text-xs leading-5 text-slate-600">Xem cách phân mức ngay dưới mỗi tiêu chí. Thống nhất các ngưỡng với khoa và cố vấn học tập trước khi áp dụng.</p></div>
              {creditPair("Tín chỉ nợ tích lũy", "Tín chỉ học phần chưa đạt còn nợ đến hết kỳ xét, sau khi đối chiếu học lại và học phần thay thế hợp lệ.", "debtMonitoringFrom", "debtHighRiskFrom", 24)}
              {creditPair("Chậm tiến độ học tập", "Số tín chỉ còn thiếu so với lộ trình đến hết kỳ xét của chương trình đào tạo (CTĐT).", "progressMonitoringFrom", "progressHighRiskFrom", 200)}
              <div className="space-y-4 border-t border-slate-100 px-5 py-5 sm:px-6"><div><h3 className="text-sm font-semibold text-slate-900">GPA tích lũy sát ngưỡng học vụ</h3><p className="mt-1.5 text-xs leading-5 text-slate-600">Thêm một khoảng phía trên ngưỡng GPA trong quy chế để phát hiện sinh viên cần hỗ trợ trước khi xuống dưới ngưỡng đó.</p></div>
                <div className="max-w-xs"><WarningNumberField id="marginGpa4" label="Khoảng theo dõi sớm" value={configuration.marginGpa4} min={0} max={4} step={0.01} unit="điểm / 4" onChange={value => { setConfiguration({ ...configuration, marginGpa4: value }); edited(); }} error={errors.marginGpa4} /></div>
                <div className="rounded-lg border border-slate-200 bg-slate-50 p-3.5"><div className="flex flex-wrap items-center justify-between gap-2"><label htmlFor="gpa-example-year" className="text-xs font-semibold text-slate-700">Ví dụ theo trình độ năm học</label>
                  <select id="gpa-example-year" value={selectedYear?.yearLevel || 1} onChange={event => setExampleYear(Number(event.target.value))} className="min-h-9 rounded-md border border-slate-300 bg-white px-2 text-xs text-slate-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-lime-700">{configuration.regulatory.cumulativeGpaByYear.map((year, index, years) => <option key={year.yearLevel} value={year.yearLevel}>Năm {year.yearLevel}{index === years.length - 1 ? " trở lên" : ""}</option>)}</select>
                </div>{selectedYear && <div className="mt-3 space-y-1.5 text-xs leading-5" aria-live="polite"><p className="font-medium text-amber-800">{gpaAdvisoryExample(selectedYear.gpa4Below, configuration.marginGpa4)}</p><p className="text-slate-600">GPA dưới {warningNumber(selectedYear.gpa4Below)}: đối chiếu ngưỡng học vụ trong Điều 18.</p></div>}</div>
                <p className="text-xs leading-5 text-slate-500">Nhập 0 để tắt riêng tín hiệu sát ngưỡng. GPA luôn dùng thang điểm 4.</p>
              </div>
            </section>
            <section className={sectionClass} aria-labelledby="additional-signals-title">
              <div className="border-b border-slate-100 px-5 py-5 sm:px-6"><div className="flex flex-wrap items-center justify-between gap-2"><h2 id="additional-signals-title" className="font-semibold text-slate-900">Tiêu chí theo dõi bổ sung</h2><span className="text-xs tabular-nums text-slate-500">{enabledSignals}/8 đang bật</span></div><p className="mt-2 text-xs leading-5 text-slate-600">Bật những tiêu chí phù hợp với nhu cầu hỗ trợ. Khi đạt ngưỡng, sinh viên được đưa vào mức Cần chú ý; mức Nguy cơ cao từ các tiêu chí khác vẫn được ưu tiên.</p></div>
              <div className="space-y-6 px-5 py-5 sm:px-6">{signalGroups.map(group => <section key={group.title} aria-label={group.title}>
                <h3 className="mb-3 text-xs font-semibold text-slate-500">{group.title}</h3>
                {group.fields.some(key => key === "conductScoreBelow") && <ConductSourceNotice available={conductAvailable} />}
                <div className="grid gap-3 sm:grid-cols-2">{group.fields.map(key => {
                  const field = signalFields[key]; const value = configuration.settings[key]; const enabled = value !== null; const scale = field.scale || 1;
                  const unavailable = (key === "conductScoreBelow" || key === "conductScoreDrop") && !conductAvailable;
                  return <div key={key} className={`rounded-lg border p-4 transition-colors ${enabled ? "border-lime-200 bg-lime-50/30" : "border-slate-200 bg-white"}`}>
                    <label className={`flex min-h-10 items-start gap-2.5 text-sm font-medium ${unavailable && !enabled ? "cursor-not-allowed text-slate-400" : "cursor-pointer text-slate-900"}`}><input type="checkbox" checked={enabled} disabled={unavailable && !enabled} aria-describedby={unavailable ? "conduct-source-notice" : undefined} onChange={event => setting(key, event.target.checked ? field.suggested : null)} className="mt-0.5 size-4 shrink-0 accent-lime-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-lime-700" /><span>{field.label}</span></label>
                    <p className="mt-2 min-h-10 text-xs leading-5 text-slate-600">{field.description}</p>
                    {enabled ? <div className="mt-3"><WarningNumberField id={`signal-${key}`} label={field.inputLabel} value={signalDisplayValue(key, value)} unit={field.unit} min={field.min * scale} max={field.max * scale} step={field.step * scale} onChange={next => setting(key, signalStoredValue(key, next))} error={errors[key]} /></div> : <p className="mt-3 text-xs text-slate-500">{unavailable ? "Chờ xác nhận nguồn điểm" : "Đang tắt"}</p>}
                  </div>;
                })}</div>
              </section>)}
                {errors.recognizedConductStatusIds && <p role="alert" className="text-xs leading-5 text-red-700">{errors.recognizedConductStatusIds}</p>}
              </div>
            </section>
          </div>
          <WarningPolicyReference regulatory={configuration.regulatory} />
        </div>
      </fieldset>
      {success && <div role="status" className="mt-5 flex items-start gap-2 rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm leading-6 text-emerald-800"><Check size={18} aria-hidden="true" className="mt-0.5 shrink-0" /><div>{success}<Link href="/reports" className="ml-1 font-semibold underline underline-offset-4 focus-visible:outline-2 focus-visible:outline-offset-2">Mở Cảnh báo học tập</Link></div></div>}
      <div className="sticky bottom-0 z-10 mt-6 flex flex-col gap-3 border-t border-slate-200 bg-white px-4 py-4 shadow-[0_-4px_16px_rgba(15,23,42,0.04)] sm:flex-row sm:items-center sm:justify-between sm:rounded-t-xl">
        <div><p className={`text-xs font-medium ${invalid || error ? "text-red-700" : "text-slate-800"}`} aria-live="polite">{saving ? "Đang lưu cấu hình…" : error ? "Cấu hình chưa được lưu" : invalid ? "Cần kiểm tra các ô được đánh dấu" : dirty ? "Có thay đổi chưa lưu" : `Đang sử dụng phiên bản ${configuration.version}`}{error && <a href="#configuration-error" className="ml-2 inline-flex min-h-8 items-center underline underline-offset-4 focus-visible:outline-2 focus-visible:outline-offset-2">Xem lỗi</a>}</p><p className="mt-1 text-xs leading-5 text-slate-500">Lưu tạo phiên bản mới. Kết quả đánh giá đã lưu chỉ cập nhật khi chạy lại.</p></div>
        <div className="flex shrink-0 gap-2"><button type="button" onClick={discard} disabled={!dirty || saving} className="min-h-11 rounded-lg px-3 text-sm font-medium text-slate-600 transition-colors hover:bg-slate-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-lime-700 disabled:cursor-default disabled:opacity-40">Hủy thay đổi</button><button type="submit" disabled={!dirty || invalid || saving} className="inline-flex min-h-11 flex-1 items-center justify-center gap-2 rounded-lg bg-lime-700 px-4 text-sm font-semibold text-white transition-colors hover:bg-lime-800 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-lime-700 disabled:cursor-not-allowed disabled:opacity-50 sm:flex-none"><Save size={16} aria-hidden="true" />{saving ? "Đang lưu…" : "Lưu cấu hình"}</button></div>
      </div>
    </form>}
  </div>;
}
