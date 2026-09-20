"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, Legend,
} from "recharts";
import SlideOverDrawer from "@/components/ui/SlideOverDrawer";

type Severity = "high" | "medium";

type WarningStudent = {
  studentId: string;
  studentCode: string;
  studentName: string;
  classCode: string;
  programCode: string;
  termGpa4: number | null;
  cumulativeGpa4: number | null;
  severity: Severity;
  reasonCodes: string[];
  reasonCount: number;
  academicWarningDecisions: number;
  resolvedActions: number;
  academicYear: string | null;
  termCode: string | null;
};

type ClassWarningBreakdown = {
  classCode: string;
  className: string;
  totalStudents: number;
  high: number;
  medium: number;
  warningStudents: number;
  warningRate: number;
};

type WarningReport = {
  items: WarningStudent[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
  counts: { students: number; evaluated: number; available: number; termGpaAvailable: number; cumulativeGpaAvailable: number; unassessed: number; high: number; medium: number; safe: number };
  policy: { name: string; termGpaThreshold: number; cumulativeGpaThreshold: number; configured: boolean };
  latestPeriod: { label: string; academicYear: string; termCode: string; termGpaAvailable: number } | null;
  trend: Array<{ label: string; high: number; medium: number; evaluated: number; available: number; termGpaAvailable: number }>;
  classBreakdown: ClassWarningBreakdown[];
  reportContext?: { isSummer: boolean; classification: string; participantStudents: number; scopedStudents: number; coverage: number; note: string | null };
  filterOptions?: { terms: Array<{ value: string; label: string; isSummer: boolean }> };
};

type DrawerFilter = { label: string; severity?: Severity; classCode?: string };
type ExportType = "warnings" | "progress" | "conduct" | "support";

const reasonLabel = (code: string) => {
  if (code === "LOW_CUMULATIVE_GPA") return "GPA tích lũy dưới ngưỡng";
  if (code === "LOW_TERM_GPA") return "GPA học kỳ dưới ngưỡng";
  if (code === "ACADEMIC_WARNING_DECISION") return "Có quyết định cảnh báo";
  return code;
};

type PieTooltipItem = {
  name?: string;
  value?: number;
  color?: string;
  severity?: Severity | null;
};

type PieTooltipProps = {
  active?: boolean;
  payload?: Array<{
    name?: string;
    value?: number;
    payload?: PieTooltipItem;
  }>;
  totalStudents: number;
};

function WarningPieTooltip({ active, payload, totalStudents }: PieTooltipProps) {
  if (!active || !payload || !payload.length) return null;
  const entry = payload[0];
  const item = entry.payload;
  const name = item?.name || entry.name || "";
  const value = Number(item?.value ?? entry.value ?? 0);
  const color = item?.color || "#64748B";
  const total = totalStudents > 0 ? totalStudents : 1;
  const percent = ((value / total) * 100).toFixed(1);

  return (
    <div className="bg-white px-3.5 py-2.5 rounded-xl border border-slate-200 shadow-xl text-xs space-y-1.5 min-w-[180px] pointer-events-none">
      <div className="flex items-center gap-2">
        <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: color }} />
        <span className="font-semibold text-slate-800 leading-tight">{name}</span>
      </div>
      <div className="flex items-baseline justify-between gap-3 pt-1 border-t border-slate-100">
        <span className="text-slate-500 text-[11px]">Số sinh viên:</span>
        <span className="font-mono text-sm font-bold text-slate-900">{value} SV</span>
      </div>
      <div className="flex items-baseline justify-between gap-3 text-[11px] text-slate-500">
        <span>Tỷ lệ:</span>
        <span className="font-mono font-semibold text-slate-700">{percent}%</span>
      </div>
    </div>
  );
}

type TrendTooltipProps = {
  active?: boolean;
  payload?: Array<{
    name?: string;
    value?: number;
    color?: string;
    payload?: { evaluated?: number; available?: number };
  }>;
  label?: string;
};

function WarningTrendTooltip({ active, payload, label }: TrendTooltipProps) {
  if (!active || !payload || !payload.length) return null;
  const evaluated = Number(payload[0]?.payload?.evaluated ?? 0);
  const available = Number(payload[0]?.payload?.available ?? 0);
  return (
    <div className="bg-white px-3.5 py-2.5 rounded-xl border border-slate-200 shadow-xl text-xs space-y-2 min-w-[180px] pointer-events-none">
      <div className="font-bold text-slate-900 pb-1 border-b border-slate-100 flex items-center justify-between">
        <span>{label}</span>
        <span className="text-[10px] text-slate-400 font-normal">Học kỳ</span>
      </div>
      <div className="space-y-1">
        {payload.map((entry) => (
          <div key={entry.name} className="flex items-center justify-between gap-3 text-[11px] text-slate-600">
            <div className="flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: entry.color }} />
              <span>{entry.name}</span>
            </div>
            <span className="font-mono font-bold text-slate-900">{entry.value} SV</span>
          </div>
        ))}
      </div>
      <div className="flex items-center justify-between gap-3 pt-1 border-t border-slate-100 text-[11px] text-slate-500">
        <span>Đủ dữ liệu phân loại</span>
        <span className="font-mono font-semibold text-slate-700">{evaluated} SV</span>
      </div>
      <div className="flex items-center justify-between gap-3 text-[11px] text-slate-500">
        <span>Có dữ liệu trong kỳ</span>
        <span className="font-mono font-semibold text-slate-700">{available} SV</span>
      </div>
    </div>
  );
}

export default function ReportsPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [report, setReport] = useState<WarningReport | null>(null);
  const [loadError, setLoadError] = useState("");
  const [exporting, setExporting] = useState<"xlsx" | "pdf" | null>(null);
  const [exportType, setExportType] = useState<ExportType>("warnings");
  const [exportError, setExportError] = useState("");
  const [drawerFilter, setDrawerFilter] = useState<DrawerFilter | null>(null);
  const [drawerData, setDrawerData] = useState<WarningReport | null>(null);
  const [drawerLoading, setDrawerLoading] = useState(false);
  const [drawerError, setDrawerError] = useState("");
  const [drawerPage, setDrawerPage] = useState(1);
  const [search, setSearch] = useState("");
  const [selectedTermId, setSelectedTermId] = useState("");

  useEffect(() => {
    async function loadReport() {
      try {
        setLoading(true);
        setLoadError("");
        const params = new URLSearchParams({ pageSize: "20" });
        if (selectedTermId) params.set("academicTermId", selectedTermId);
        const response = await fetch(`/api/v1/reports/academic-warnings?${params.toString()}`);
        if (!response.ok) throw new Error("Không thể tải dữ liệu cảnh báo học vụ");
        setReport(await response.json());
      } catch (error) {
        setLoadError(error instanceof Error ? error.message : "Không thể tải báo cáo");
      } finally {
        setLoading(false);
      }
    }
    void loadReport();
  }, [selectedTermId]);

  const loadDrawer = useCallback(async (filter: DrawerFilter, page: number, query: string) => {
    try {
      setDrawerLoading(true);
      setDrawerError("");
      const params = new URLSearchParams({ page: String(page), pageSize: "20" });
      if (filter.severity) params.set("severity", filter.severity);
      if (filter.classCode) params.set("classCode", filter.classCode);
      if (query.trim()) params.set("search", query.trim());
      if (selectedTermId) params.set("academicTermId", selectedTermId);
      const response = await fetch(`/api/v1/reports/academic-warnings?${params.toString()}`);
      if (!response.ok) throw new Error("Không thể tải danh sách sinh viên");
      setDrawerData(await response.json());
    } catch (error) {
      setDrawerData(null);
      setDrawerError(error instanceof Error ? error.message : "Không thể tải danh sách sinh viên");
    } finally {
      setDrawerLoading(false);
    }
  }, [selectedTermId]);

  useEffect(() => {
    if (!drawerFilter) return;
    const timeout = window.setTimeout(() => void loadDrawer(drawerFilter, drawerPage, search), 200);
    return () => window.clearTimeout(timeout);
  }, [drawerFilter, drawerPage, loadDrawer, search]);

  const openStudents = (filter: DrawerFilter) => {
    setDrawerFilter(filter);
    setDrawerData(null);
    setDrawerError("");
    setDrawerPage(1);
    setSearch("");
  };

  const handleExport = async (format: "xlsx" | "pdf") => {
    try {
      setExporting(format);
      setExportError("");
      const type = format === "pdf" ? "warnings" : exportType;
      const params = new URLSearchParams({ format, type });
      if (selectedTermId) params.set("academicTermId", selectedTermId);
      const response = await fetch(`/api/v1/reports/export?${params.toString()}`);
      if (!response.ok) {
        const payload = await response.json().catch(() => null);
        throw new Error(payload?.error?.message || "Không thể tạo file báo cáo");
      }
      const url = URL.createObjectURL(await response.blob());
      const link = document.createElement("a");
      link.href = url;
      const disposition = response.headers.get("content-disposition") || "";
      const encodedName = disposition.match(/filename\*=UTF-8''([^;]+)/i)?.[1];
      link.download = encodedName ? decodeURIComponent(encodedName) : `bao_cao.${format}`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
    } catch (error) {
      setExportError(error instanceof Error ? error.message : "Không thể xuất báo cáo");
    } finally {
      setExporting(null);
    }
  };

  if (loading) {
    return (
      <div className="p-6 max-w-7xl mx-auto space-y-5" aria-label="Đang tải báo cáo">
        <div className="h-20 rounded-2xl bg-slate-100 animate-pulse" />
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          {[0, 1, 2, 3].map((item) => <div key={item} className="h-28 rounded-2xl bg-slate-100 animate-pulse" />)}
        </div>
        <div className="h-80 rounded-2xl bg-slate-100 animate-pulse" />
      </div>
    );
  }

  if (!report || loadError) {
    return <div className="p-6 max-w-7xl mx-auto"><div className="rounded-2xl border border-red-200 bg-red-50 p-6 text-sm text-red-800">{loadError || "Chưa có dữ liệu báo cáo."}</div></div>;
  }

  const { counts } = report;
  const evaluatedRate = counts.students ? (counts.evaluated / counts.students) * 100 : 0;
  const levelCounts = [
    { name: "Đỏ – Nguy cơ cao", value: counts.high, color: "#DC2626", severity: "high" as const },
    { name: "Vàng – Cần lưu ý", value: counts.medium, color: "#EAB308", severity: "medium" as const },
    { name: "Xanh – Không có cảnh báo", value: counts.safe, color: "#22C55E", severity: null },
    { name: "Xám – Chưa đủ dữ liệu kỳ", value: counts.unassessed, color: "#94A3B8", severity: null },
  ];

  return (
    <div className="p-6 space-y-6 max-w-7xl mx-auto">
      <header className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="w-2.5 h-2.5 rounded-full bg-[var(--color-primary)]" />
            <span className="text-xs font-semibold text-[var(--color-primary)] uppercase tracking-wider">Kỳ thống kê: {report.latestPeriod?.label || "chưa xác định"}</span>
          </div>
          <h1 className="text-2xl sm:text-3xl font-bold text-slate-900 tracking-tight" style={{ fontFamily: "Outfit, sans-serif" }}>Báo cáo tổng hợp học vụ & cảnh báo sớm</h1>
          <p className="text-xs sm:text-sm text-slate-500 mt-1">Bấm vào mức cảnh báo hoặc lớp để xem danh sách sinh viên tương ứng.</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <label className="sr-only" htmlFor="report-term">Kỳ thống kê</label>
          <select
            id="report-term"
            value={selectedTermId}
            onChange={(event) => setSelectedTermId(event.target.value)}
            className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-primary)]"
          >
            <option value="">Tự động: kỳ chính gần nhất</option>
            {(report.filterOptions?.terms || []).filter((term) => !term.isSummer).map((term) => (
              <option key={term.value} value={term.value}>{term.label}</option>
            ))}
            {(report.filterOptions?.terms || []).some((term) => term.isSummer) && (
              <optgroup label="Kỳ phụ, số liệu mô tả">
                {(report.filterOptions?.terms || []).filter((term) => term.isSummer).map((term) => (
                  <option key={term.value} value={term.value}>{term.label}</option>
                ))}
              </optgroup>
            )}
          </select>
          <label className="sr-only" htmlFor="report-export-type">Loại dữ liệu xuất</label>
          <select id="report-export-type" value={exportType} onChange={(event) => setExportType(event.target.value as ExportType)} disabled={Boolean(exporting)} className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-primary)]">
            <option value="warnings">Danh sách cảnh báo</option>
            <option value="progress">Tiến độ CTĐT</option>
            <option value="conduct">Kết quả rèn luyện</option>
            <option value="support">Nhật ký hỗ trợ</option>
          </select>
          <button type="button" disabled={Boolean(exporting)} onClick={() => void handleExport("xlsx")} className="px-4 py-2 border border-slate-200 text-slate-700 text-xs font-semibold rounded-xl hover:bg-slate-50 active:scale-[0.98] transition bg-white disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-primary)]">{exporting === "xlsx" ? "Đang tạo XLSX..." : "Xuất Excel (.xlsx)"}</button>
          <button type="button" disabled={Boolean(exporting)} onClick={() => void handleExport("pdf")} className="px-4 py-2 bg-[var(--color-primary)] text-white text-xs font-semibold rounded-xl hover:opacity-90 active:scale-[0.98] transition disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-primary)]">{exporting === "pdf" ? "Đang tạo PDF..." : "Xuất PDF tổng hợp"}</button>
        </div>
      </header>

      {exportError && <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-xs text-red-800">{exportError}</div>}
      {report.reportContext?.isSummer && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-xs leading-5 text-amber-900">
          <strong>Kỳ thống kê: Học kỳ hè (kỳ phụ).</strong> {report.reportContext.note} Có {report.reportContext.participantStudents}/{report.reportContext.scopedStudents} sinh viên có dữ liệu ({(report.reportContext.coverage * 100).toFixed(1)}%).
        </div>
      )}
      {!report.policy.configured && (
        <div className="rounded-xl border border-blue-200 bg-blue-50/70 px-4 py-3 text-xs text-blue-900">
          Chưa có chính sách cảnh báo được kích hoạt. Báo cáo đang dùng ngưỡng mặc định: GPA học kỳ dưới {report.policy.termGpaThreshold.toFixed(1)} là Cần lưu ý; GPA tích lũy dưới {report.policy.cumulativeGpaThreshold.toFixed(1)} là Nguy cơ cao.
        </div>
      )}

      <section className="grid grid-cols-2 lg:grid-cols-4 gap-3" aria-label="Chỉ số cảnh báo">
        <div className="p-4 bg-white border border-slate-200 rounded-2xl shadow-xs">
          <span className="text-[10px] uppercase font-bold text-slate-400 block">Tổng sinh viên</span>
          <span className="text-2xl font-bold font-mono text-slate-900 mt-1 block">{counts.students}</span>
          <span className="text-[11px] text-slate-500">{counts.unassessed} chưa đủ dữ liệu đánh giá</span>
        </div>
        <button type="button" onClick={() => openStudents({ label: "Nguy cơ cao", severity: "high" })} className="text-left p-4 border border-red-200 bg-red-50/40 rounded-2xl shadow-xs hover:border-red-400 hover:-translate-y-0.5 active:translate-y-0 transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-400">
          <span className="text-[10px] uppercase font-bold text-red-700 block">Nguy cơ cao (Mức Đỏ)</span>
          <span className="text-2xl font-bold font-mono text-red-600 mt-1 block">{counts.high}</span>
          <span className="text-[11px] text-red-700">{counts.cumulativeGpaAvailable} SV có GPA tích lũy · Xem danh sách →</span>
        </button>
        <button type="button" onClick={() => openStudents({ label: "Cần lưu ý", severity: "medium" })} className="text-left p-4 border border-amber-200 bg-amber-50/40 rounded-2xl shadow-xs hover:border-amber-400 hover:-translate-y-0.5 active:translate-y-0 transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-400">
          <span className="text-[10px] uppercase font-bold text-amber-700 block">Cần lưu ý (Mức Vàng)</span>
          <span className="text-2xl font-bold font-mono text-amber-600 mt-1 block">{counts.medium}</span>
          <span className="text-[11px] text-amber-700">{counts.termGpaAvailable ? `${counts.termGpaAvailable} SV có GPA học kỳ · Xem danh sách →` : "Chưa có GPA học kỳ để xác định"}</span>
        </button>
        <div className="p-4 bg-white border border-emerald-200 rounded-2xl shadow-xs">
          <span className="text-[10px] uppercase font-bold text-emerald-700 block">Đủ dữ liệu phân loại</span>
          <span className="text-2xl font-bold font-mono text-emerald-600 mt-1 block">{evaluatedRate.toFixed(1)}%</span>
          <span className="text-[11px] text-emerald-700">{counts.available}/{counts.students} có dữ liệu kỳ</span>
        </div>
      </section>

      <section className="grid grid-cols-1 lg:grid-cols-12 gap-5">
        <div className="lg:col-span-5 bg-white rounded-2xl border border-slate-200 shadow-xs p-5">
          <div className="flex items-center justify-between mb-4">
            <div><h2 className="font-bold text-slate-900 text-sm" style={{ fontFamily: "Outfit, sans-serif" }}>Phân bố mức cảnh báo</h2><p className="text-xs text-slate-400">Theo {report.latestPeriod?.label || "kỳ gần nhất đủ dữ liệu"} · {report.latestPeriod?.termGpaAvailable || 0}/{counts.students} SV có GPA học kỳ</p></div>
            <span className="text-xs font-semibold px-2 py-0.5 rounded-md bg-slate-100 text-slate-600">{counts.students} SV</span>
          </div>
          <div className="h-[230px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie data={levelCounts} cx="50%" cy="50%" innerRadius={55} outerRadius={85} paddingAngle={4} dataKey="value">
                  {levelCounts.map((entry) => (
                    <Cell
                      key={entry.name}
                      fill={entry.color}
                      cursor={entry.severity ? "pointer" : "default"}
                      onClick={() => entry.severity && openStudents({ label: entry.name, severity: entry.severity })}
                    />
                  ))}
                </Pie>
                <Tooltip content={<WarningPieTooltip totalStudents={counts.students} />} />
                <Legend wrapperStyle={{ fontSize: 12 }} />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </div>
        <div className="lg:col-span-7 bg-white rounded-2xl border border-slate-200 shadow-xs p-5">
          <div className="flex items-center justify-between mb-4"><div><h2 className="font-bold text-slate-900 text-sm" style={{ fontFamily: "Outfit, sans-serif" }}>Xu hướng cảnh báo theo học kỳ</h2><p className="text-xs text-slate-400">Mỗi cột dùng dữ liệu của chính kỳ đó · kết thúc tại kỳ gần nhất đủ độ phủ</p></div><span className="text-xs font-semibold text-slate-500">Đơn vị: Sinh viên</span></div>
          <div className="h-[230px] w-full">
            {report.trend.length ? (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={report.trend} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#F1F5F9" />
                  <XAxis dataKey="label" tick={{ fontSize: 10, fill: "#64748B" }} tickLine={false} axisLine={false} />
                  <YAxis tick={{ fontSize: 11, fill: "#64748B" }} tickLine={false} axisLine={false} />
                  <Tooltip content={<WarningTrendTooltip />} />
                  <Legend wrapperStyle={{ fontSize: 11 }} />
                  <Bar dataKey="high" name="Nguy cơ cao (Đỏ)" fill="#EF4444" radius={[4, 4, 0, 0]} />
                  <Bar dataKey="medium" name="Cần lưu ý (Vàng)" fill="#F59E0B" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <div className="h-full grid place-items-center text-xs text-slate-400">Chưa có dữ liệu GPA theo kỳ.</div>
            )}
          </div>
        </div>
      </section>

      <section className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden">
        <div className="p-4 border-b border-slate-100 bg-slate-50/60 flex items-center justify-between"><div><h2 className="font-bold text-slate-900 text-sm" style={{ fontFamily: "Outfit, sans-serif" }}>Cảnh báo theo lớp sinh viên</h2><p className="text-xs text-slate-400">Bấm vào bất kỳ vị trí nào trên dòng để xem sinh viên cảnh báo của lớp</p></div><span className="text-xs font-semibold text-slate-600 bg-white border border-slate-200 px-2.5 py-1 rounded-lg">{report.classBreakdown.length} lớp</span></div>
        <div className="overflow-x-auto"><table className="w-full text-left text-xs">
          <thead><tr className="border-b border-slate-200 bg-slate-50/80 text-slate-500 font-semibold uppercase text-[11px]"><th className="px-4 py-3.5">Lớp học</th><th className="px-4 py-3.5 text-center">Sĩ số</th><th className="px-4 py-3.5 text-center">Nguy cơ cao</th><th className="px-4 py-3.5 text-center">Cần lưu ý</th><th className="px-4 py-3.5 text-center">Tổng cảnh báo</th><th className="px-4 py-3.5 text-right">Tỷ lệ cảnh báo</th></tr></thead>
          <tbody className="divide-y divide-slate-100">{report.classBreakdown.map((row) => <tr
            key={row.classCode}
            tabIndex={0}
            aria-label={`Xem sinh viên cảnh báo lớp ${row.classCode}`}
            onClick={() => openStudents({ label: `Tất cả cảnh báo · ${row.classCode}`, classCode: row.classCode })}
            onKeyDown={(event) => {
              if (event.key !== "Enter" && event.key !== " ") return;
              event.preventDefault();
              openStudents({ label: `Tất cả cảnh báo · ${row.classCode}`, classCode: row.classCode });
            }}
            className="group cursor-pointer hover:bg-[var(--color-primary-light)]/45 focus-visible:bg-[var(--color-primary-light)]/45 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[var(--color-primary)] transition-colors"
            title={`Xem sinh viên cảnh báo lớp ${row.classCode}`}
          >
            <td className="px-4 py-3"><div className="flex w-full items-center justify-between gap-3 text-left font-semibold text-slate-800 group-hover:text-[var(--color-primary)]"><span><span className="block">{row.classCode}</span><span className="text-[10px] text-slate-400 font-normal">{row.className}</span></span><span aria-hidden="true" className="text-sm text-slate-300 opacity-0 -translate-x-1 transition group-hover:translate-x-0 group-hover:opacity-100 group-focus-visible:translate-x-0 group-focus-visible:opacity-100">→</span></div></td>
            <td className="px-4 py-3 text-center font-mono text-slate-700">{row.totalStudents}</td>
            <td className="px-4 py-3 text-center"><span className="inline-block min-w-8 rounded-full border border-red-200 bg-red-50 px-2 py-0.5 font-mono font-bold text-red-600">{row.high}</span></td>
            <td className="px-4 py-3 text-center"><span className="inline-block min-w-8 rounded-full border border-amber-200 bg-amber-50 px-2 py-0.5 font-mono font-bold text-amber-600">{row.medium}</span></td>
            <td className="px-4 py-3 text-center"><span className="font-mono font-bold text-slate-900">{row.warningStudents} SV</span></td>
            <td className="px-4 py-3 text-right"><span className="font-mono font-bold text-slate-700">{row.warningRate}%</span></td>
          </tr>)}</tbody>
        </table></div>
      </section>

      <SlideOverDrawer isOpen={Boolean(drawerFilter)} onClose={() => setDrawerFilter(null)} title={drawerFilter?.label || "Sinh viên cảnh báo"} subtitle={drawerData ? `${drawerData.total} sinh viên phù hợp` : "Đang lọc dữ liệu cảnh báo"} width="4xl">
        <div className="sticky top-0 z-10 bg-white pb-3"><label className="block text-[11px] font-semibold text-slate-500 mb-1.5" htmlFor="warning-student-search">Tìm sinh viên</label><input id="warning-student-search" value={search} onChange={(event) => { setSearch(event.target.value); setDrawerPage(1); }} placeholder="Nhập MSSV hoặc họ tên..." className="w-full rounded-xl border border-slate-200 px-3.5 py-2.5 text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)]" /></div>
        {drawerLoading ? <div className="space-y-3">{[0, 1, 2, 3].map((item) => <div key={item} className="h-20 rounded-xl bg-slate-100 animate-pulse" />)}</div> : drawerError ? <div className="rounded-xl border border-red-200 bg-red-50 py-10 px-4 text-center text-sm text-red-700">{drawerError}</div> : !drawerData?.items.length ? <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50 py-14 text-center text-sm text-slate-500">Không có sinh viên phù hợp với bộ lọc này.</div> : <div className="space-y-3">{drawerData.items.map((student) => <article key={student.studentId} className="rounded-xl border border-slate-200 p-4 hover:border-slate-300 transition-colors"><div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3"><div className="min-w-0"><div className="flex items-center gap-2 flex-wrap"><h3 className="font-semibold text-slate-900">{student.studentName}</h3><span className={`rounded-md px-2 py-0.5 text-[10px] font-bold ${student.severity === "high" ? "bg-red-100 text-red-700" : "bg-amber-100 text-amber-700"}`}>{student.severity === "high" ? "Nguy cơ cao" : "Cần lưu ý"}</span></div><p className="mt-1 text-xs text-slate-500 font-mono">{student.studentCode} · {student.classCode} · {student.programCode}</p><div className="mt-2 flex flex-wrap gap-1.5">{student.reasonCodes.map((reason) => <span key={reason} className="rounded-md bg-slate-100 px-2 py-1 text-[10px] font-medium text-slate-600">{reasonLabel(reason)}</span>)}</div></div><div className="flex items-center gap-4 sm:text-right"><div><span className="block text-[10px] text-slate-400">GPA kỳ</span><strong className="font-mono text-sm text-slate-800">{student.termGpa4?.toFixed(2) ?? "—"}</strong></div><div><span className="block text-[10px] text-slate-400">GPA tích lũy</span><strong className="font-mono text-sm text-slate-800">{student.cumulativeGpa4?.toFixed(2) ?? "—"}</strong></div><button type="button" onClick={() => router.push(`/students/${student.studentId}`)} className="rounded-lg border border-[var(--color-primary)]/50 px-3 py-2 text-xs font-semibold text-[var(--color-primary)] hover:bg-[var(--color-primary-light)] active:scale-[0.98] transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-primary)]">Hồ sơ →</button></div></div></article>)}</div>}
        {drawerData && drawerData.totalPages > 1 && <div className="flex items-center justify-between border-t border-slate-100 pt-4"><span className="text-xs text-slate-500">Trang {drawerData.page}/{drawerData.totalPages}</span><div className="flex gap-2"><button type="button" disabled={drawerPage <= 1} onClick={() => setDrawerPage((value) => value - 1)} className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-semibold disabled:opacity-40">Trang trước</button><button type="button" disabled={drawerPage >= drawerData.totalPages} onClick={() => setDrawerPage((value) => value + 1)} className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-semibold disabled:opacity-40">Trang sau</button></div></div>}
      </SlideOverDrawer>
    </div>
  );
}
