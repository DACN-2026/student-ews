"use client";

import { useState, useEffect, useMemo } from "react";
import { useRouter } from "next/navigation";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend,
  ResponsiveContainer, Line, PieChart, Pie, Cell, ComposedChart, Scatter,
} from "recharts";
import FilterBar from "@/components/ui/FilterBar";
import { apiFetch } from "@/lib/api-client";

interface FilterState {
  academicYear?: string;
  termCode?: string;
  programCode?: string;
  classId?: string;
  gpaScope: "cumulative" | "term";
  gpaAggregation: "average" | "median";
}
interface DashboardMetric {
  value: number | null;
  numerator?: number;
  denominator?: number;
  status: "available" | "unavailable";
}

interface FilterOption {
  value: string;
  label: string;
  isSummer?: boolean;
}

interface ProgressPoint {
  code: string;
  name: string;
  total: number;
  pass: number;
  fail: number;
  pending: number;
  error: number;
}

const THEME_COLORS = {
  primary: "#90C63B",
  active: "#F97316",
  red: "#EF4444",
  yellow: "#F59E0B",
  green: "#10B981",
  blue: "#3B82F6",
  purple: "#8B5CF6",
  slate: "#94A3B8",
};

const CHART_PALETTE = ["#3B82F6", "#10B981", "#F59E0B", "#F97316", "#8B5CF6", "#64748B"];

export default function DashboardPage() {
  const router = useRouter();

  // Filters state
  const [filters, setFilters] = useState<FilterState>({
    academicYear: "",
    termCode: "",
    programCode: "",
    classId: "",
    gpaScope: "cumulative",
    gpaAggregation: "average",
  });

  const [completionBreakdown, setCompletionBreakdown] = useState<"program" | "cohort">("program");
  const [registrationBreakdown, setRegistrationBreakdown] = useState<"program" | "cohort">("program");

  // Options
  const [academicYears, setAcademicYears] = useState<ApiData[]>([]);
  const [programs, setPrograms] = useState<ApiData[]>([]);
  const [classes, setClasses] = useState<ApiData[]>([]);
  const [summaryData, setSummaryData] = useState<ApiData>(null);
  const [warningStudents, setWarningStudents] = useState<ApiData[]>([]);
  const [mounted, setMounted] = useState(false);
  const [summaryError, setSummaryError] = useState<string | null>(null);
  const [summaryReload, setSummaryReload] = useState(0);

  // Recharts needs to render after client hydration.
  useEffect(() => {
    const frame = window.requestAnimationFrame(() => setMounted(true));
    return () => window.cancelAnimationFrame(frame);
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    async function loadSummary() {
      setSummaryError(null);
      try {
        const params = new URLSearchParams({
          gpaScope: filters.gpaScope,
          gpaAggregation: filters.gpaAggregation,
        });
        if (filters.academicYear) params.set("academicYear", filters.academicYear);
        if (filters.termCode) params.set("termCode", filters.termCode);
        if (filters.programCode) params.set("programCode", filters.programCode);
        if (filters.classId) params.set("classId", filters.classId);
        const response = await apiFetch(`/api/v1/dashboard/summary?${params.toString()}`, { signal: controller.signal });
        if (!response.ok) {
          const payload = await response.json().catch(() => null);
          throw new Error(payload?.error?.message || `Không thể tải dữ liệu tổng quan (HTTP ${response.status})`);
        }
        const data = await response.json();
        setSummaryData(data);
        setWarningStudents(data.academicWarnings?.items || []);
        const options = data.filterOptions || {};
        const optionTerms = Array.isArray(options.terms) ? options.terms : [];
        const optionYear = data.filter?.academicYear || data.currentAcademicYear?.yearCode || "";
        setAcademicYears((options.academicYears || []).map((item: FilterOption) => ({
          id: item.value,
          sYearCode: item.value,
          terms: item.value === optionYear
            ? optionTerms.map((term: FilterOption) => ({
                id: term.value,
                sTermCode: term.value,
                sTermName: term.label,
                isSummer: Boolean(term.isSummer),
              }))
            : [],
        })));
        setPrograms((options.programs || []).map((item: FilterOption) => ({
          id: item.value,
          programCode: item.value,
          programName: item.label,
        })));
        setClasses((options.classes || []).map((item: FilterOption) => ({
          id: item.value,
          classId: item.label,
          className: item.label,
        })));
      } catch (err) {
        if (!(err instanceof Error && err.name === "AbortError")) {
          setSummaryError(err instanceof Error ? err.message : "Không thể tải dữ liệu tổng quan");
        }
      } finally {
        // Loading placeholders are driven by the presence of summary data.
      }
    }
    void loadSummary();
    return () => controller.abort();
  }, [filters, summaryReload]);

  // Filtered terms based on selected year
  const termOptions = useMemo(() => {
    if (!Array.isArray(academicYears)) return [];
    if (!filters.academicYear) {
      return academicYears.flatMap((y) => y?.terms || []);
    }
    const foundYear = academicYears.find((y) => y?.sYearCode === filters.academicYear || y?.yearCode === filters.academicYear);
    return foundYear?.terms || [];
  }, [academicYears, filters.academicYear]);

  // Derived metrics
  const totalStudents = summaryData?.totalStudents ?? 0;
  const redCount = summaryData?.counts?.red ?? 0;
  const yellowCount = summaryData?.counts?.yellow ?? 0;
  const warningTotal = redCount + yellowCount;
  const gpaMetric = summaryData?.metrics?.averageGpa as DashboardMetric | undefined;
  const completionMetric = summaryData?.metrics?.completionRate as DashboardMetric | undefined;
  const conductMetric = summaryData?.metrics?.averageConductScore as DashboardMetric | undefined;
  const graduationForecastMetric = summaryData?.metrics?.graduationForecastRate as DashboardMetric | undefined;
  const selectedClass = classes.find((item) => item.id === filters.classId);
  const metricPercent = (metric?: DashboardMetric) => metric?.status === "available" && typeof metric.value === "number"
    ? `${metric.value.toFixed(1)}%`
    : "—";
  const metricRatio = (metric: DashboardMetric | undefined, unavailableLabel: string) => metric?.status === "available"
    ? `${metric.numerator ?? 0}/${metric.denominator ?? 0} SV`
    : unavailableLabel;

  const gradeDistributionData = Array.isArray(summaryData?.gradeDistribution) ? summaryData.gradeDistribution : [];
  const gpaTrendData = Array.isArray(summaryData?.gpaTrend) ? summaryData.gpaTrend : [];
  const conductDistributionData = Array.isArray(summaryData?.conductDistribution)
    ? summaryData.conductDistribution.filter((item: { count: number }) => item.count > 0)
    : [];
  const toPercentages = (items: ProgressPoint[]) => items
    .filter((item) => item.code !== "all" && Number(item.total) > 0)
    .map((item) => ({
      ...item,
      pass: (Number(item.pass || 0) * 100) / Number(item.total),
      fail: (Number(item.fail || 0) * 100) / Number(item.total),
      pending: (Number(item.pending || 0) * 100) / Number(item.total),
      error: (Number(item.error || 0) * 100) / Number(item.total),
    }));
  const programProgressData = toPercentages(summaryData?.programProgress || []);
  const cohortProgressData = toPercentages(summaryData?.cohortProgress || []);
  const programRegistrationData = toPercentages(summaryData?.programRegistrationProgress || []);
  const cohortRegistrationData = toPercentages(summaryData?.registrationProgress || []);
  const warningByClassData = Array.isArray(summaryData?.warningByClass) ? summaryData.warningByClass.slice(0, 7) : [];
  const mainTermOptions = termOptions.filter((term: ApiData) => !term.isSummer);
  const summerTermOptions = termOptions.filter((term: ApiData) => term.isSummer);
  const summerContext = summaryData?.summerContext;

  return (
    <div className="p-6 space-y-6 max-w-7xl mx-auto">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="w-2.5 h-2.5 rounded-full bg-[var(--color-primary)] animate-pulse" />
            <span className="text-xs font-semibold text-[var(--color-primary)] uppercase tracking-wider">
              {summaryData?.currentTerm
                ? `${summaryData.currentTerm.academicYear} • ${summaryData.currentTerm.termName}`
                : "TOÀN BỘ DỮ LIỆU HIỆN CÓ"}
            </span>
          </div>
          <h1
            className="text-2xl sm:text-3xl font-bold text-slate-900 tracking-tight"
            style={{ fontFamily: "Be Vietnam Pro, sans-serif" }}
          >
            Dashboard Ban chủ nhiệm Khoa
          </h1>
          <p className="text-xs sm:text-sm text-slate-500 mt-0.5">
            Theo dõi kết quả, tiến độ CTĐT và cảnh báo sớm học vụ theo phạm vi được phân quyền
          </p>
        </div>

        <div className="flex items-center gap-2.5">
          <button
            type="button"
            onClick={() => window.location.reload()}
            className="px-3 py-2 text-xs font-semibold text-slate-700 bg-white hover:bg-slate-50 border border-slate-200 rounded-xl transition-colors shadow-xs flex items-center gap-1.5 cursor-pointer"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M21.5 2v6h-6M21.34 15.57a10 10 0 1 1-.57-8.38l5.67-5.67" />
            </svg>
            <span>Làm mới</span>
          </button>
          <button
            type="button"
            onClick={() => router.push("/reports")}
            className="px-3.5 py-2 rounded-xl bg-red-600 hover:bg-red-700 text-white text-xs font-semibold shadow-xs transition-colors flex items-center gap-1.5 cursor-pointer"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
              <line x1="12" y1="9" x2="12" y2="13" />
              <line x1="12" y1="17" x2="12.01" y2="17" />
            </svg>
            <span>Xử lý Cảnh báo</span>
          </button>
        </div>
      </div>

      {/* 1. Filter Bar */}
      <FilterBar
        onReset={() =>
          setFilters({
            academicYear: "",
            termCode: "",
            programCode: "",
            classId: "",
            gpaScope: "cumulative",
            gpaAggregation: "average",
          })
        }
        actions={
          <div className="flex items-center gap-1.5 text-xs text-slate-500 font-medium bg-slate-50 px-3 py-1.5 rounded-xl border border-slate-200/80">
            <span>Dữ liệu:</span>
            <span className="font-semibold text-slate-800">
              {summaryData?.currentTerm
                ? `${summaryData.currentTerm.academicYear} · ${summaryData.currentTerm.termName}`
                : filters.academicYear || "Tất cả dữ liệu hiện có"}
              {filters.programCode ? ` · ${filters.programCode}` : ""}
              {filters.classId ? ` · ${selectedClass?.classId || selectedClass?.className || filters.classId}` : ""}
            </span>
          </div>
        }
      >
        <select
          value={filters.academicYear}
          onChange={(e) => setFilters({ ...filters, academicYear: e.target.value, termCode: "" })}
          className="bg-white border border-slate-200 rounded-xl px-3 py-2 text-xs font-medium text-slate-700 focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)]"
        >
          <option value="">Tất cả năm học</option>
          {academicYears.map((y) => (
            <option key={y.id} value={y.sYearCode || y.yearCode}>
              {y.sYearCode || y.yearCode}
            </option>
          ))}
        </select>

        <select
          value={filters.termCode}
          onChange={(e) => setFilters({ ...filters, termCode: e.target.value })}
          className="bg-white border border-slate-200 rounded-xl px-3 py-2 text-xs font-medium text-slate-700 focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)]"
        >
          <option value="">Tất cả học kỳ</option>
          {mainTermOptions.length > 0 && (
            <optgroup label="Học kỳ chính">
              {mainTermOptions.map((t: ApiData) => (
                <option key={t.id} value={t.sTermCode || t.termCode}>
                  {t.sTermCode || t.termCode} - {t.sTermName || t.termName}
                </option>
              ))}
            </optgroup>
          )}
          {summerTermOptions.length > 0 && (
            <optgroup label="Kỳ phụ">
              {summerTermOptions.map((t: ApiData) => (
                <option key={t.id} value={t.sTermCode || t.termCode}>
                  {t.sTermCode || t.termCode} - {t.sTermName || t.termName} (Kỳ phụ)
                </option>
              ))}
            </optgroup>
          )}
        </select>

        <select
          value={filters.programCode}
          onChange={(e) => setFilters({ ...filters, programCode: e.target.value })}
          className="bg-white border border-slate-200 rounded-xl px-3 py-2 text-xs font-medium text-slate-700 focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)]"
        >
          <option value="">Tất cả CTĐT</option>
          {programs.map((p) => (
            <option key={p.id} value={p.programCode}>
              {p.programCode} - {p.programName}
            </option>
          ))}
        </select>

        <select
          value={filters.classId}
          onChange={(e) => setFilters({ ...filters, classId: e.target.value })}
          className="bg-white border border-slate-200 rounded-xl px-3 py-2 text-xs font-medium text-slate-700 focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)]"
        >
          <option value="">Tất cả lớp học</option>
          {classes.map((c) => (
            <option key={c.id} value={c.id}>
              {c.classId} - {c.className}
            </option>
          ))}
        </select>
      </FilterBar>

      {summaryError && (
        <section className="flex flex-col gap-3 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 sm:flex-row sm:items-center sm:justify-between" role="alert">
          <div>
            <h2 className="text-sm font-bold text-red-900">Chưa thể tải dữ liệu tổng quan</h2>
            <p className="mt-0.5 text-xs text-red-700">{summaryError}</p>
          </div>
          <button
            type="button"
            onClick={() => setSummaryReload((value) => value + 1)}
            className="w-fit rounded-xl border border-red-200 bg-white px-3 py-2 text-xs font-semibold text-red-700 transition-colors hover:bg-red-100"
          >
            Thử lại
          </button>
        </section>
      )}

      {summerContext?.isSummer && (
        <section className="rounded-2xl border border-amber-200 bg-amber-50/70 px-4 py-3" role="status" aria-label="Ngữ cảnh dữ liệu học kỳ hè">
          <div className="flex items-start gap-3">
            <span className="mt-0.5 grid size-7 shrink-0 place-items-center rounded-lg bg-amber-100 text-sm font-bold text-amber-800" aria-hidden="true">i</span>
            <div>
              <h2 className="text-sm font-bold text-amber-950">Bạn đang xem dữ liệu học kỳ hè (kỳ phụ)</h2>
              <p className="mt-0.5 text-xs leading-5 text-amber-800">
                Có <strong>{summerContext.participantStudents}/{summerContext.scopedStudents} sinh viên</strong> trong phạm vi tham gia ({(Number(summerContext.coverage || 0) * 100).toFixed(1)}%).
                Các chỉ số là số liệu mô tả và có thể không đại diện cho toàn khoa.
              </p>
            </div>
          </div>
        </section>
      )}

      {/* 2. 6 KPI Metric Cards */}
      <div>
        <div className="mb-3">
          <h2 className="text-sm font-bold text-slate-900 uppercase tracking-wider" style={{ fontFamily: "Be Vietnam Pro, sans-serif" }}>
            Tổng quan chỉ số chính
          </h2>
          <p className="text-xs text-slate-500">Các chỉ số đo lường học vụ và tiến độ đào tạo thời gian thực</p>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-6 gap-3">
          {/* Card 1: Sinh viên */}
          <div className="bg-white border border-slate-200/90 rounded-2xl p-4 shadow-xs hover:border-[var(--color-primary)] transition-all">
            <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider block">Sinh viên</span>
            <div className="text-2xl font-bold text-slate-900 mt-1" style={{ fontFamily: "Be Vietnam Pro, sans-serif" }}>
              {totalStudents}
            </div>
            <p className="text-[10px] text-slate-400 mt-1">Đang theo học</p>
          </div>

          {/* Card 2: Rèn luyện */}
          <div className="bg-violet-50/20 border border-violet-200/90 rounded-2xl p-4 shadow-xs hover:border-violet-400 transition-all">
            <span className="text-[11px] font-semibold text-violet-800 uppercase tracking-wider block">Điểm rèn luyện TB</span>
            <div className="text-2xl font-bold text-violet-700 mt-1 font-mono">
              {conductMetric?.status === "available" && typeof conductMetric.value === "number" ? conductMetric.value.toFixed(1) : "—"}
            </div>
            <p className="text-[10px] text-violet-700/80 mt-1">{conductMetric?.numerator ?? 0}/{totalStudents} SV đã công nhận</p>
          </div>

          {/* Card 3: GPA tích lũy TB */}
          <div className="bg-white border border-slate-200/90 rounded-2xl p-4 shadow-xs hover:border-[var(--color-primary)] transition-all">
            <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider block">
              GPA {filters.gpaScope === "term" ? "học kỳ" : "tích lũy"} {filters.gpaAggregation === "average" ? "TB" : "trung vị"}
            </span>
            <div className="text-2xl font-bold text-blue-600 mt-1" style={{ fontFamily: "JetBrains Mono, monospace" }}>
              {gpaMetric?.status === "available" && typeof gpaMetric.value === "number" ? gpaMetric.value.toFixed(2) : "—"}
            </div>
            <p className="text-[10px] text-slate-400 mt-1">
              {gpaMetric?.status === "available" ? `${gpaMetric.denominator}/${totalStudents} SV · Hệ 4` : "Chưa có dữ liệu GPA"}
            </p>
          </div>

          {/* Card 4: Tiến độ CTĐT */}
          <div className="bg-white border border-emerald-200/80 rounded-2xl p-4 shadow-xs bg-emerald-50/20 hover:border-emerald-400 transition-all">
            <span className="text-[11px] font-semibold text-emerald-800 uppercase tracking-wider block">Tiến độ CTĐT</span>
            <div className="text-2xl font-bold text-emerald-600 mt-1" style={{ fontFamily: "Be Vietnam Pro, sans-serif" }}>
              {metricPercent(completionMetric)}
            </div>
            <p className="text-[10px] text-emerald-700/80 mt-1">{metricRatio(completionMetric, "Chưa có lần tính tiến độ")}</p>
          </div>

          {/* Card 5: Cảnh báo học tập */}
          <div className="bg-white border border-amber-200/80 rounded-2xl p-4 shadow-xs bg-amber-50/20 hover:border-amber-400 transition-all">
            <span className="text-[11px] font-semibold text-amber-800 uppercase tracking-wider block">Cảnh báo học tập</span>
            <div className="text-2xl font-bold text-amber-600 mt-1" style={{ fontFamily: "Be Vietnam Pro, sans-serif" }}>
              {warningTotal}
            </div>
            <p className="text-[10px] text-amber-700/80 mt-1">{redCount} Đỏ · {yellowCount} Vàng</p>
          </div>

          {/* Card 6: Graduation forecast */}
          <div className="bg-white border border-cyan-200/80 rounded-2xl p-4 shadow-xs bg-cyan-50/20 hover:border-cyan-400 transition-all">
            <span className="text-[11px] font-semibold text-cyan-800 uppercase tracking-wider block">Dự kiến tốt nghiệp đúng hạn</span>
            <div className="text-2xl font-bold text-cyan-700 mt-1" style={{ fontFamily: "Be Vietnam Pro, sans-serif" }}>
              {metricPercent(graduationForecastMetric)}
            </div>
            <p className="text-[10px] text-cyan-700/80 mt-1">
              {metricRatio(graduationForecastMetric, "Chưa có kết quả dự báo")}
            </p>
          </div>
        </div>
      </div>

      {/* 4. 6 Charts Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Chart 1: Phân bổ học lực (Pie Chart) - Col 5 */}
        <div className="lg:col-span-5 bg-white border border-slate-200/90 rounded-2xl p-5 shadow-xs">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h3 className="text-sm font-bold text-slate-900" style={{ fontFamily: "Be Vietnam Pro, sans-serif" }}>
                Phân bổ Học lực
              </h3>
              <p className="text-xs text-slate-500">Tỷ lệ xếp loại học lực toàn khoa</p>
            </div>
            <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-slate-100 text-slate-600">
              5 mức
            </span>
          </div>

          <div className="h-[260px] w-full">
            {!mounted ? (
              <div className="h-full w-full bg-slate-50/70 animate-pulse rounded-xl" />
            ) : gradeDistributionData.length === 0 ? (
              <div className="h-full flex items-center justify-center text-xs text-slate-400">Chưa có dữ liệu GPA cho phạm vi đã chọn</div>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={gradeDistributionData}
                    dataKey="count"
                    nameKey="name"
                    innerRadius={55}
                    outerRadius={90}
                    paddingAngle={3}
                  >
                    {gradeDistributionData.map((_: unknown, index: number) => (
                      <Cell key={`cell-${index}`} fill={CHART_PALETTE[index % CHART_PALETTE.length]} />
                    ))}
                  </Pie>
                  <Tooltip
                    formatter={(value: unknown, name: unknown) => {
                      const item = gradeDistributionData.find((group: { name: string }) => group.name === name);
                      return [`${value} SV (${Number(item?.rate || 0).toFixed(1)}%)`, String(name)];
                    }}
                    contentStyle={{ borderRadius: 12, border: "1px solid #E2E8F0", fontSize: 12 }}
                  />
                </PieChart>
              </ResponsiveContainer>
            )}
          </div>

          <div className="grid grid-cols-2 gap-2 mt-2 pt-3 border-t border-slate-100 text-[11px] text-slate-600">
            {gradeDistributionData.map((item: { name: string; rate: number }, idx: number) => (
              <div key={item.name} className="flex items-center gap-2">
                <span
                  className="w-2.5 h-2.5 rounded-full flex-shrink-0"
                  style={{ backgroundColor: CHART_PALETTE[idx % CHART_PALETTE.length] }}
                />
                <span className="truncate">{item.name.split("(")[0].trim()}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Chart 2: Xu hướng GPA tích lũy trung bình (Line Chart) - Col 7 */}
        <div className="lg:col-span-7 bg-white border border-slate-200/90 rounded-2xl p-5 shadow-xs">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h3 className="text-sm font-bold text-slate-900" style={{ fontFamily: "Be Vietnam Pro, sans-serif" }}>
                Xu hướng GPA nhiều học kỳ
              </h3>
              <p className="text-xs text-slate-500">GPA học kỳ trung bình, tối đa 8 kỳ gần nhất theo phạm vi</p>
            </div>
            <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-blue-50 text-blue-700 border border-blue-200">
              Thang 4.0
            </span>
          </div>

          <div className="h-[280px] w-full">
            {!mounted ? (
              <div className="h-full w-full bg-slate-50/70 animate-pulse rounded-xl" />
            ) : gpaTrendData.length === 0 ? (
              <div className="h-full flex items-center justify-center text-xs text-slate-400">Chọn một học kỳ có dữ liệu để xem GPA</div>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <ComposedChart data={gpaTrendData} margin={{ top: 10, right: 20, left: -20, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#F1F5F9" />
                  <XAxis dataKey="label" tick={{ fontSize: 11, fill: "#64748B" }} />
                  <YAxis domain={[0, 4]} tick={{ fontSize: 11, fill: "#64748B" }} />
                  <Tooltip
                    formatter={(val: ApiData, name: ApiData, item: ApiData) => {
                      const point = item?.payload;
                      const suffix = point?.isSummer
                        ? `Số liệu mô tả, ${point.studentCount} SV (${(Number(point.coverage || 0) * 100).toFixed(1)}%)`
                        : `${point?.studentCount || 0} SV`;
                      return [`${Number(val).toFixed(2)} · ${suffix}`, String(name)];
                    }}
                    contentStyle={{ borderRadius: 12, border: "1px solid #E2E8F0", fontSize: 12 }}
                  />
                  <Legend wrapperStyle={{ fontSize: 12, paddingTop: 8 }} />
                  <Line
                    type="monotone"
                    dataKey="officialAverage"
                    name="Kết quả kỳ chính"
                    stroke={THEME_COLORS.primary}
                    strokeWidth={3}
                    connectNulls
                    dot={{ r: 4, fill: THEME_COLORS.primary }}
                    activeDot={{ r: 6 }}
                  />
                  <Scatter
                    dataKey="descriptiveSummerAverage"
                    name="GPA hè mô tả"
                    fill="#F59E0B"
                    line={false}
                    shape="diamond"
                  />
                </ComposedChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>

        {/* Chart 3: Tiến độ CTĐT (Stacked Bar Chart) - Col 6 */}
        <div className="lg:col-span-6 bg-white border border-slate-200/90 rounded-2xl p-5 shadow-xs">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h3 className="text-sm font-bold text-slate-900" style={{ fontFamily: "Be Vietnam Pro, sans-serif" }}>
                Tiến độ Hoàn thành CTĐT
              </h3>
              <p className="text-xs text-slate-500">Tỷ lệ đúng tiến độ / chậm tiến độ (%)</p>
            </div>

            <div className="inline-flex rounded-xl bg-slate-100 p-1 text-xs">
              <button
                type="button"
                onClick={() => setCompletionBreakdown("program")}
                className={`px-2.5 py-1 rounded-lg font-semibold transition-all cursor-pointer ${completionBreakdown === "program"
                  ? "bg-white text-slate-900 shadow-xs"
                  : "text-slate-500 hover:text-slate-900"
                  }`}
              >
                CTĐT
              </button>
              <button
                type="button"
                onClick={() => setCompletionBreakdown("cohort")}
                className={`px-2.5 py-1 rounded-lg font-semibold transition-all cursor-pointer ${completionBreakdown === "cohort"
                  ? "bg-white text-slate-900 shadow-xs"
                  : "text-slate-500 hover:text-slate-900"
                  }`}
              >
                Khóa
              </button>
            </div>
          </div>

          <div className="h-[250px] w-full">
            {!mounted ? (
              <div className="h-full w-full bg-slate-50/70 animate-pulse rounded-xl" />
            ) : (completionBreakdown === "program" ? programProgressData : cohortProgressData).length === 0 ? (
              <div className="h-full flex items-center justify-center text-xs text-slate-400">Chưa có lần tính tiến độ phù hợp</div>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart
                  data={completionBreakdown === "program" ? programProgressData : cohortProgressData}
                  layout="vertical"
                  margin={{ top: 10, right: 10, left: 10, bottom: 0 }}
                >
                  <CartesianGrid strokeDasharray="3 3" stroke="#F1F5F9" />
                  <XAxis type="number" domain={[0, 100]} tickFormatter={(v) => `${v}%`} tick={{ fontSize: 11, fill: "#64748B" }} />
                  <YAxis type="category" dataKey="name" tick={{ fontSize: 11, fill: "#64748B" }} width={60} />
                  <Tooltip
                    formatter={(val: ApiData) => [`${val}%`, ""]}
                    contentStyle={{ borderRadius: 12, border: "1px solid #E2E8F0", fontSize: 12 }}
                  />
                  <Legend wrapperStyle={{ fontSize: 12, paddingTop: 4 }} />
                  <Bar dataKey="pass" name="Đúng tiến độ" stackId="a" fill={THEME_COLORS.green} />
                  <Bar dataKey="fail" name="Chậm tiến độ" stackId="a" fill={THEME_COLORS.red} />
                  <Bar dataKey="pending" name="Chờ kết quả" stackId="a" fill={THEME_COLORS.yellow} />
                  <Bar dataKey="error" name="Khác" stackId="a" fill={THEME_COLORS.slate} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>

        {/* Chart 4: Tiến độ đăng ký học phần (Stacked Bar Chart) - Col 6 */}
        <div className="lg:col-span-6 bg-white border border-slate-200/90 rounded-2xl p-5 shadow-xs">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h3 className="text-sm font-bold text-slate-900" style={{ fontFamily: "Be Vietnam Pro, sans-serif" }}>
                Tiến độ Đăng ký Học phần
              </h3>
              <p className="text-xs text-slate-500">Tỷ lệ đáp ứng học phần cần đăng ký trong kế hoạch tại thời điểm tính (%)</p>
            </div>

            <div className="inline-flex rounded-xl bg-slate-100 p-1 text-xs">
              <button
                type="button"
                onClick={() => setRegistrationBreakdown("program")}
                className={`px-2.5 py-1 rounded-lg font-semibold transition-all cursor-pointer ${registrationBreakdown === "program"
                  ? "bg-white text-slate-900 shadow-xs"
                  : "text-slate-500 hover:text-slate-900"
                  }`}
              >
                CTĐT
              </button>
              <button
                type="button"
                onClick={() => setRegistrationBreakdown("cohort")}
                className={`px-2.5 py-1 rounded-lg font-semibold transition-all cursor-pointer ${registrationBreakdown === "cohort"
                  ? "bg-white text-slate-900 shadow-xs"
                  : "text-slate-500 hover:text-slate-900"
                  }`}
              >
                Khóa
              </button>
            </div>
          </div>

          <div className="h-[250px] w-full">
            {!mounted ? (
              <div className="h-full w-full bg-slate-50/70 animate-pulse rounded-xl" />
            ) : (registrationBreakdown === "program" ? programRegistrationData : cohortRegistrationData).length === 0 ? (
              <div className="h-full flex items-center justify-center text-xs text-slate-400">Chưa có dữ liệu đối chiếu đăng ký</div>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart
                  data={registrationBreakdown === "program" ? programRegistrationData : cohortRegistrationData}
                  layout="vertical"
                  margin={{ top: 10, right: 10, left: 10, bottom: 0 }}
                >
                  <CartesianGrid strokeDasharray="3 3" stroke="#F1F5F9" />
                  <XAxis type="number" domain={[0, 100]} tickFormatter={(v) => `${v}%`} tick={{ fontSize: 11, fill: "#64748B" }} />
                  <YAxis type="category" dataKey="name" tick={{ fontSize: 11, fill: "#64748B" }} width={60} />
                  <Tooltip
                    formatter={(val: ApiData) => [`${val}%`, ""]}
                    contentStyle={{ borderRadius: 12, border: "1px solid #E2E8F0", fontSize: 12 }}
                  />
                  <Legend wrapperStyle={{ fontSize: 12, paddingTop: 4 }} />
                  <Bar dataKey="pass" name="Đủ kế hoạch" stackId="b" fill={THEME_COLORS.blue} />
                  <Bar dataKey="fail" name="Thiếu so với kế hoạch" stackId="b" fill={THEME_COLORS.active} />
                  <Bar dataKey="pending" name="Chờ kết quả" stackId="b" fill={THEME_COLORS.yellow} />
                  <Bar dataKey="error" name="Thiếu dữ liệu" stackId="b" fill={THEME_COLORS.slate} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>

        {/* Chart 5: Phân bố Cảnh báo theo Lớp - Col 6 */}
        <div className="lg:col-span-6 bg-white border border-slate-200/90 rounded-2xl p-5 shadow-xs">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h3 className="text-sm font-bold text-slate-900" style={{ fontFamily: "Be Vietnam Pro, sans-serif" }}>
                Phân bố Sinh viên Cảnh báo theo Lớp
              </h3>
              <p className="text-xs text-slate-500">Số lượng sinh viên diện Đỏ và Vàng cần theo dõi</p>
            </div>
          </div>

          <div className="h-[250px] w-full">
            {!mounted ? (
              <div className="h-full w-full bg-slate-50/70 animate-pulse rounded-xl" />
            ) : warningByClassData.length === 0 ? (
              <div className="h-full flex items-center justify-center text-xs text-slate-400">Chưa có cảnh báo theo lớp trong phạm vi đã chọn</div>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={warningByClassData} layout="vertical" margin={{ top: 10, right: 20, left: 20, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#F1F5F9" />
                  <XAxis type="number" tick={{ fontSize: 11, fill: "#64748B" }} />
                  <YAxis type="category" dataKey="classId" tick={{ fontSize: 11, fill: "#64748B" }} width={70} />
                  <Tooltip
                    contentStyle={{ borderRadius: 12, border: "1px solid #E2E8F0", fontSize: 12 }}
                  />
                  <Legend wrapperStyle={{ fontSize: 11 }} />
                  <Bar dataKey="red" name="Nguy cơ cao (Đỏ)" fill={THEME_COLORS.red} stackId="a" radius={[0, 0, 0, 0]} />
                  <Bar dataKey="yellow" name="Cần lưu ý (Vàng)" fill={THEME_COLORS.yellow} stackId="a" radius={[0, 4, 4, 0]} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>

        {/* Chart 6: Conduct distribution - Col 6 */}
        <div className="lg:col-span-6 bg-white border border-slate-200/90 rounded-2xl p-5 shadow-xs">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h3 className="text-sm font-bold text-slate-900" style={{ fontFamily: "Be Vietnam Pro, sans-serif" }}>
                Phân bố điểm rèn luyện
              </h3>
              <p className="text-xs text-slate-500">Chỉ tính điểm lastScore đã được công nhận trong học kỳ</p>
            </div>
            <span className="rounded-full border border-violet-200 bg-violet-50 px-2 py-0.5 text-xs font-semibold text-violet-700">Thang 100</span>
          </div>

          <div className="h-[250px] w-full">
            {!mounted ? (
              <div className="h-full w-full bg-slate-50/70 animate-pulse rounded-xl" />
            ) : conductDistributionData.length === 0 ? (
              <div className="h-full flex items-center justify-center text-xs text-slate-400">Chưa có điểm rèn luyện đã công nhận trong kỳ</div>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={conductDistributionData} margin={{ top: 10, right: 20, left: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#F1F5F9" />
                  <XAxis type="category" dataKey="name" tick={{ fontSize: 10, fill: "#64748B" }} />
                  <YAxis type="number" allowDecimals={false} tick={{ fontSize: 11, fill: "#64748B" }} />
                  <Tooltip
                    formatter={(val: ApiData) => [val, "Sinh viên"]}
                    contentStyle={{ borderRadius: 12, border: "1px solid #E2E8F0", fontSize: 12 }}
                  />
                  <Bar dataKey="count" name="Sinh viên" fill={THEME_COLORS.purple} radius={[6, 6, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>
      </div>

      {/* 5. Sinh viên Cảnh báo Học tập Gần nhất (SWE Table) */}
      <div className="bg-white border border-slate-200/90 rounded-2xl shadow-xs overflow-hidden">
        <div className="p-5 border-b border-slate-100 flex items-center justify-between">
          <div>
            <h3 className="text-sm font-bold text-slate-900" style={{ fontFamily: "Be Vietnam Pro, sans-serif" }}>
              Sinh viên Có Tín hiệu Cảnh báo Học tập
            </h3>
            <p className="text-xs text-slate-500">Danh sách các trường hợp nguy cơ cần ưu tiên đôn đốc hỗ trợ</p>
          </div>

          <button
            type="button"
            onClick={() => router.push("/reports")}
            className="text-xs font-semibold text-[var(--color-primary)] hover:underline flex items-center gap-1 cursor-pointer"
          >
            <span>Xem toàn bộ ({warningTotal})</span>
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <path d="M5 12h14M12 5l7 7-7 7" />
            </svg>
          </button>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead>
              <tr className="bg-slate-50/80 border-b border-slate-200 text-slate-500 font-semibold uppercase text-[11px]">
                <th className="py-3 px-4">Sinh viên</th>
                <th className="py-3 px-4">Lớp / CTĐT</th>
                <th className="py-3 px-4">GPA</th>
                <th className="py-3 px-4">Trạng thái</th>
                <th className="py-3 px-4">Mức độ</th>
                <th className="py-3 px-4 text-right">Thao tác</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {warningStudents.length > 0 ? (
                warningStudents.map((st) => (
                  <tr key={st.id || st.studentId} className="hover:bg-slate-50/70 transition-colors">
                    <td className="py-3 px-4">
                      <div className="font-semibold text-slate-800">{st.studentName}</div>
                      <div className="text-[11px] text-slate-400 font-mono">{st.studentCode}</div>
                    </td>
                    <td className="py-3 px-4 text-slate-600">
                      <div>{st.className || "Chưa xếp lớp"}</div>
                      <div className="text-[11px] text-slate-400">{st.programCode || "—"}</div>
                    </td>
                    <td className="py-3 px-4 font-mono">
                      <span className="font-semibold text-slate-900">
                        {st.termGpa4 != null || st.termGpa != null ? Number(st.termGpa4 ?? st.termGpa).toFixed(2) : "—"}
                      </span>
                      <span className="text-[11px] text-slate-400 ml-1.5">
                        TL: {st.cumulativeGpa4 != null || st.cumulativeGpa != null ? Number(st.cumulativeGpa4 ?? st.cumulativeGpa).toFixed(2) : "—"}
                      </span>
                    </td>
                    <td className="py-3 px-4">
                      <div className="flex flex-col gap-1">
                        <span
                          className={`inline-flex items-center w-max px-2 py-0.5 rounded-full text-[10px] font-semibold ${st.registrationStatus === "fail"
                            ? "bg-orange-100 text-orange-800"
                            : st.registrationStatus === "unassessed"
                              ? "bg-slate-100 text-slate-600"
                              : "bg-emerald-100 text-emerald-800"
                            }`}
                        >
                          {st.registrationStatus === "fail" ? "Chậm đăng ký" : st.registrationStatus === "unassessed" ? "Chưa đánh giá đăng ký" : "Đúng tiến độ"}
                        </span>
                        <span
                          className={`inline-flex items-center w-max px-2 py-0.5 rounded-full text-[10px] font-semibold ${st.scheduleStatus === "behind_schedule"
                            ? "bg-red-100 text-red-800"
                            : st.scheduleStatus === "unassessed"
                              ? "bg-slate-100 text-slate-600"
                              : "bg-emerald-100 text-emerald-800"
                            }`}
                        >
                          {st.scheduleStatus === "behind_schedule" ? "Chậm CTĐT" : st.scheduleStatus === "unassessed" ? "Chưa đánh giá CTĐT" : "Đúng CTĐT"}
                        </span>
                      </div>
                    </td>
                    <td className="py-3 px-4">
                      <span
                        className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-bold ${(st.maxSeverity || st.severity) === "high"
                          ? "bg-red-100 text-red-700 border border-red-200"
                          : (st.maxSeverity || st.severity) === "medium"
                            ? "bg-amber-100 text-amber-800 border border-amber-200"
                            : "bg-emerald-100 text-emerald-800"
                          }`}
                      >
                        {(st.maxSeverity || st.severity) === "high" ? "Nguy cơ cao" : "Cần lưu ý"}
                      </span>
                    </td>
                    <td className="py-3 px-4 text-right">
                      <button
                        type="button"
                        onClick={() => router.push(`/students/${st.studentId}`)}
                        className="px-2.5 py-1 rounded-lg text-xs font-semibold text-slate-600 hover:text-slate-900 hover:bg-slate-100 border border-slate-200 transition-colors cursor-pointer"
                      >
                        Xem hồ sơ
                      </button>
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={6} className="py-8 text-center text-slate-400 text-xs">
                    Không có sinh viên cảnh báo trong phạm vi dữ liệu hiện có
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Footer Meta */}
      <div className="text-center text-[11px] text-slate-400 pt-2" suppressHydrationWarning>
        {summaryData?.updatedAt ? `Dữ liệu tạo lúc ${new Date(summaryData.updatedAt).toLocaleString("vi-VN")} · ` : ""}
        Tổng hợp từ hồ sơ học vụ trong phạm vi được cấp
      </div>
    </div>
  );
}
