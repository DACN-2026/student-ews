"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  BookOpen,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  CircleAlert,
  Inbox,
  LoaderCircle,
  Play,
  RefreshCw,
  Search,
  X,
  XCircle,
} from "lucide-react";
import { apiFetch } from "@/lib/api-client";
import { useAuthStore } from "@/stores/authStore";
import ConfirmDialog from "@/components/ui/ConfirmDialog";
import { toast } from "@/components/ui/Toast";
import type {
  AcademicContext,
  AcademicYearOption,
  ListResponse,
  ProgramOption,
  ProgressPlan,
  RegistrationRun,
  RegistrationStudentResult,
  StudentCourseDetail,
} from "./types";
import { responseError } from "./types";

interface CohortSummaryCard {
  cohortId: string;
  cohortCode: string;
  cohortName?: string;
  plan: ProgressPlan;
  latestRun?: RegistrationRun;
}

export default function RegistrationProgressTab() {
  const { can } = useAuthStore();
  const [plans, setPlans] = useState<ProgressPlan[]>([]);
  const [runs, setRuns] = useState<RegistrationRun[]>([]);
  const [programs, setPrograms] = useState<ProgramOption[]>([]);
  const [years, setYears] = useState<AcademicYearOption[]>([]);

  // Filters
  const [selectedTermId, setSelectedTermId] = useState<string>("");
  const [selectedProgramId, setSelectedProgramId] = useState<string>("");

  // Loading & State
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");

  // Selected Cohort for Inline Drill-down
  const [selectedPlanId, setSelectedPlanId] = useState<string | null>(null);
  const [runStudents, setRunStudents] = useState<RegistrationStudentResult[]>([]);
  const [runStudentsLoading, setRunStudentsLoading] = useState(false);
  const [studentSearch, setStudentSearch] = useState("");
  const [studentStatusFilter, setStudentStatusFilter] = useState<string>("");

  // Action Dialog
  const [confirmCalculatePlan, setConfirmCalculatePlan] = useState<ProgressPlan | null>(null);
  const [calculating, setCalculating] = useState(false);

  // Student Course Detail Modal
  const [studentDetailOpen, setStudentDetailOpen] = useState(false);
  const [studentDetail, setStudentDetail] = useState<StudentCourseDetail | null>(null);
  const [studentDetailLoading, setStudentDetailLoading] = useState(false);

  // Load catalogs
  const loadCatalogs = useCallback(async () => {
    const [programResponse, yearResponse, contextResponse] = await Promise.all([
      apiFetch("/api/v1/training-programs?pageSize=100"),
      apiFetch("/api/v1/academic-years?pageSize=100"),
      apiFetch("/api/v1/academic-context"),
    ]);
    if (programResponse.ok) {
      const data = (await programResponse.json()) as ListResponse<ProgramOption>;
      setPrograms(data.items || []);
    }
    if (yearResponse.ok) {
      const data = (await yearResponse.json()) as ListResponse<AcademicYearOption>;
      setYears(data.items || []);
    }
    if (contextResponse.ok) {
      const ctx = (await contextResponse.json()) as AcademicContext | null;
      if (ctx?.academicTermId) setSelectedTermId((current) => current || ctx.academicTermId);
    }
  }, []);

  // Load plans & runs
  const loadData = useCallback(
    async (quiet = false) => {
      if (quiet) setRefreshing(true);
      else setLoading(true);
      setError("");
      try {
        const query = new URLSearchParams({ page: "1", pageSize: "100", activeOnly: "true" });
        const runQuery = new URLSearchParams({ page: "1", pageSize: "100" });
        if (selectedProgramId) query.set("trainingProgramId", selectedProgramId);
        if (selectedProgramId) runQuery.set("trainingProgramId", selectedProgramId);
        if (selectedTermId) {
          query.set("termId", selectedTermId);
          runQuery.set("termId", selectedTermId);
        }

        const [planResponse, runResponse] = await Promise.all([
          apiFetch(`/api/v1/training-progress/plans?${query.toString()}`),
          apiFetch(`/api/v1/training-progress/runs?${runQuery.toString()}`),
        ]);

        if (!planResponse.ok) throw new Error(await responseError(planResponse, "Không thể tải kế hoạch đào tạo."));
        if (!runResponse.ok) throw new Error(await responseError(runResponse, "Không thể tải kết quả kiểm tra."));

        const planData = (await planResponse.json()) as ListResponse<ProgressPlan>;
        const runData = (await runResponse.json()) as ListResponse<RegistrationRun>;

        const fetchedPlans = planData.items || [];
        setPlans(fetchedPlans);
        setRuns(runData.items || []);
      } catch (cause) {
        setError(cause instanceof Error ? cause.message : "Không thể tải dữ liệu tiến độ đào tạo.");
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [selectedProgramId, selectedTermId]
  );

  useEffect(() => {
    const timeout = window.setTimeout(() => {
      void loadCatalogs().catch(() => setError("Không thể tải danh mục đào tạo."));
    }, 0);
    return () => window.clearTimeout(timeout);
  }, [loadCatalogs]);

  useEffect(() => {
    const timeout = window.setTimeout(() => void loadData(), 0);
    return () => window.clearTimeout(timeout);
  }, [loadData]);

  // Available Terms flatten list
  const availableTerms = useMemo(() => {
    const list: Array<{ id: string; label: string; isCurrent: boolean }> = [];
    years.forEach((y) => {
      y.terms.forEach((t) => {
        list.push({
          id: t.id,
          label: `${y.yearCode} • ${t.termName || t.termCode}${t.isCurrent ? " (Kỳ hiện tại)" : ""}`,
          isCurrent: t.isCurrent,
        });
      });
    });
    return list;
  }, [years]);

  const effectiveTermId = selectedTermId || availableTerms.find((term) => term.isCurrent)?.id || availableTerms[0]?.id || "";

  // Group plans by Cohort for the selected term
  const cohortCards = useMemo(() => {
    if (!effectiveTermId) return [];

    // Filter plans for the selected term
    const termPlans = plans.filter(
      (plan) => plan.academicTermId === effectiveTermId && plan.status === "locked" && plan.isCurrent,
    );

    // Group by Cohort
    const cards: CohortSummaryCard[] = [];
    termPlans.forEach((plan) => {
      // Find latest run for this plan
      const latestRun = runs.find((r) => r.planId === plan.id);
      cards.push({
        cohortId: plan.cohortId,
        cohortCode: plan.cohortCode || "Khóa ?",
        cohortName: plan.cohortName || "",
        plan,
        latestRun,
      });
    });

    // Sort by Cohort Code descending (e.g. K49, K48, K47, K46...)
    cards.sort((a, b) => b.cohortCode.localeCompare(a.cohortCode, undefined, { numeric: true }));
    return cards;
  }, [effectiveTermId, plans, runs]);

  const effectiveSelectedPlanId = selectedPlanId && cohortCards.some((card) => card.plan.id === selectedPlanId)
    ? selectedPlanId
    : cohortCards[0]?.plan.id || null;

  // Currently selected card
  const activeCard = useMemo(() => {
    return cohortCards.find((card) => card.plan.id === effectiveSelectedPlanId) || null;
  }, [cohortCards, effectiveSelectedPlanId]);

  // Load students for active card's run
  const loadStudentsForRun = useCallback(async (runId: string) => {
    setRunStudentsLoading(true);
    setRunStudents([]);
    try {
      const response = await apiFetch(`/api/v1/training-progress/runs/${runId}/students?page=1&pageSize=500`);
      if (!response.ok) throw new Error(await responseError(response, "Không thể tải danh sách sinh viên."));
      const data = (await response.json()) as ListResponse<RegistrationStudentResult>;
      let allStudents = data.items || [];
      const total = data.total ?? allStudents.length;

      // If there are more students beyond the first page (or backend pageSize was capped)
      if (total > allStudents.length) {
        const pageSize = data.pageSize || allStudents.length || 100;
        const totalPages = Math.ceil(total / pageSize);
        const pagePromises = [];
        for (let p = 2; p <= totalPages; p++) {
          pagePromises.push(
            apiFetch(`/api/v1/training-progress/runs/${runId}/students?page=${p}&pageSize=${pageSize}`)
              .then(async (res) => {
                if (!res.ok) return [];
                const pageData = (await res.json()) as ListResponse<RegistrationStudentResult>;
                return pageData.items || [];
              })
              .catch(() => [])
          );
        }
        const remainingPages = await Promise.all(pagePromises);
        remainingPages.forEach((pageItems) => {
          allStudents = allStudents.concat(pageItems);
        });
      }
      setRunStudents(allStudents);
    } catch (cause) {
      toast.error(cause instanceof Error ? cause.message : "Không thể tải kết quả sinh viên.");
    } finally {
      setRunStudentsLoading(false);
    }
  }, []);

  useEffect(() => {
    const timeout = window.setTimeout(() => {
      if (activeCard?.latestRun?.id) void loadStudentsForRun(activeCard.latestRun.id);
      else {
        setRunStudents([]);
        setRunStudentsLoading(false);
      }
    }, 0);
    return () => window.clearTimeout(timeout);
  }, [activeCard, loadStudentsForRun]);

  // Run calculate action
  const handleCalculate = async (plan: ProgressPlan) => {
    setCalculating(true);
    try {
      const response = await apiFetch(`/api/v1/training-progress/plans/${plan.id}/calculate`, {
        method: "POST",
      });
      if (!response.ok) throw new Error(await responseError(response, "Không thể thực hiện kiểm tra."));
      const newRun = (await response.json()) as RegistrationRun;
      toast.success("Kiểm tra đăng ký hoàn tất.");
      setConfirmCalculatePlan(null);
      await loadData(true);
      setSelectedPlanId(plan.id);
      if (newRun?.id) {
        await loadStudentsForRun(newRun.id);
      }
    } catch (cause) {
      toast.error(cause instanceof Error ? cause.message : "Không thể thực hiện kiểm tra.");
    } finally {
      setCalculating(false);
    }
  };

  // Open student course detail modal
  const openStudentDetail = async (student: RegistrationStudentResult) => {
    if (!activeCard?.latestRun?.id) return;
    setStudentDetail(null);
    setStudentDetailOpen(true);
    setStudentDetailLoading(true);
    try {
      const response = await apiFetch(
        `/api/v1/training-progress/runs/${activeCard.latestRun.id}/students/${student.studentId}`
      );
      if (!response.ok) throw new Error(await responseError(response, "Không thể tải chi tiết môn học."));
      const data = (await response.json()) as StudentCourseDetail;
      setStudentDetail(data);
    } catch (cause) {
      toast.error(cause instanceof Error ? cause.message : "Không thể tải chi tiết môn học.");
      setStudentDetailOpen(false);
    } finally {
      setStudentDetailLoading(false);
    }
  };

  // Filtered students in drill-down
  const visibleStudents = useMemo(() => {
    return runStudents.filter((student) => {
      const matchStatus = !studentStatusFilter || student.status === studentStatusFilter;
      const searchNormalized = studentSearch.trim().toLowerCase();
      const matchSearch =
        !searchNormalized ||
        student.studentName.toLowerCase().includes(searchNormalized) ||
        student.studentId.toLowerCase().includes(searchNormalized) ||
        (student.className && student.className.toLowerCase().includes(searchNormalized));
      return matchStatus && matchSearch;
    });
  }, [runStudents, studentStatusFilter, studentSearch]);

  const studentCounts = useMemo(() => {
    if (activeCard?.latestRun) {
      return {
        total: activeCard.latestRun.totalStudents,
        pass: activeCard.latestRun.passStudents,
        fail: activeCard.latestRun.failStudents,
        error: activeCard.latestRun.dataErrorStudents || 0,
      };
    }
    return {
      total: runStudents.length,
      pass: runStudents.filter((s) => s.status === "pass").length,
      fail: runStudents.filter((s) => s.status === "fail").length,
      error: runStudents.filter((s) => s.status === "data_error").length,
    };
  }, [activeCard, runStudents]);

  return (
    <div className="space-y-6">
      {/* Top Filter Bar */}
      <div className="flex flex-col gap-3 rounded-2xl border border-slate-200/80 bg-white p-4 sm:flex-row sm:items-center sm:justify-between shadow-xs">
        <div className="flex flex-wrap items-center gap-3">
          {/* Term Dropdown */}
          <div className="flex items-center gap-2">
            <span className="text-xs font-bold text-slate-700 whitespace-nowrap">Học kỳ đánh giá:</span>
            <div className="relative">
              <select
                value={effectiveTermId}
                onChange={(e) => setSelectedTermId(e.target.value)}
                className="h-9.5 rounded-xl border border-slate-200 bg-slate-50/70 pr-8 pl-3 text-xs font-bold text-slate-900 outline-none focus:border-lime-600 focus:bg-white focus:ring-2 focus:ring-lime-100"
              >
                {availableTerms.map((term) => (
                  <option key={term.id} value={term.id}>
                    {term.label}
                  </option>
                ))}
              </select>
              <ChevronDown size={14} className="pointer-events-none absolute top-3 right-2.5 text-slate-400" />
            </div>
          </div>

          {/* Program Dropdown */}
          <div className="flex items-center gap-2">
            <span className="text-xs font-bold text-slate-700 whitespace-nowrap">Chương trình:</span>
            <div className="relative">
              <select
                value={selectedProgramId}
                onChange={(e) => setSelectedProgramId(e.target.value)}
                className="h-9.5 max-w-xs rounded-xl border border-slate-200 bg-slate-50/70 pr-8 pl-3 text-xs font-medium text-slate-800 outline-none focus:border-lime-600 focus:bg-white focus:ring-2 focus:ring-lime-100"
              >
                <option value="">Tất cả chương trình đào tạo</option>
                {programs.map((prog) => (
                  <option key={prog.id} value={prog.id}>
                    {prog.programCode} - {prog.programName}
                  </option>
                ))}
              </select>
              <ChevronDown size={14} className="pointer-events-none absolute top-3 right-2.5 text-slate-400" />
            </div>
          </div>
        </div>

        {/* Refresh & Actions */}
        <div className="flex items-center gap-2 self-end sm:self-auto">
          <button
            type="button"
            onClick={() => void loadData(true)}
            disabled={refreshing}
            className="inline-flex h-9 items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 text-xs font-semibold text-slate-700 transition hover:bg-slate-50 disabled:opacity-50 shadow-2xs"
          >
            <RefreshCw size={14} className={refreshing ? "animate-spin text-lime-600" : ""} />
            Làm mới
          </button>
        </div>
      </div>

      {/* Error state */}
      {error && (
        <div className="flex items-center justify-between gap-4 rounded-2xl border border-red-200 bg-red-50 p-4 text-xs text-red-800">
          <span className="flex items-center gap-2 font-medium">
            <CircleAlert size={16} />
            {error}
          </span>
          <button type="button" onClick={() => void loadData()} className="font-bold underline underline-offset-2">
            Thử lại
          </button>
        </div>
      )}

      {/* Horizontal Cohort Segmented Bar */}
      {loading ? (
        <div className="h-14 animate-pulse rounded-2xl border border-slate-200 bg-white p-3 shadow-xs" />
      ) : cohortCards.length === 0 ? (
        <div className="rounded-2xl border border-slate-200 bg-white p-12 text-center shadow-xs">
          <Inbox size={40} className="mx-auto text-slate-300" />
          <h3 className="mt-3 text-sm font-bold text-slate-700">Chưa có kế hoạch đang áp dụng cho học kỳ này</h3>
          <p className="mt-1 text-xs text-slate-400">
            Hãy chọn học kỳ khác hoặc khóa và đưa một phiên bản kế hoạch vào áp dụng tại phân hệ Đào tạo.
          </p>
        </div>
      ) : (
        <div className="rounded-2xl border border-slate-200/90 bg-white p-3.5 shadow-xs space-y-2">
          <div className="flex items-center justify-between px-1">
            <span className="text-xs font-bold uppercase tracking-wider text-slate-500">
              Chọn Khóa học để xem danh sách sinh viên:
            </span>
            <span className="text-[11px] font-medium text-slate-400">
              {cohortCards.length} khóa đào tạo
            </span>
          </div>

          {/* Horizontal scrollable rail */}
          <div className="flex items-center gap-2 overflow-x-auto pb-1 no-scrollbar">
            {cohortCards.map((card) => {
              const isSelected = effectiveSelectedPlanId === card.plan.id;
              const hasRun = Boolean(card.latestRun);
              const totalStud = card.latestRun?.totalStudents || 0;
              const passStud = card.latestRun?.passStudents || 0;
              const passRate = totalStud ? Math.round((passStud / totalStud) * 100) : 0;

              return (
                <button
                  key={card.plan.id}
                  type="button"
                  onClick={() => setSelectedPlanId(card.plan.id)}
                  className={`group flex shrink-0 items-center gap-2.5 rounded-xl border px-3 py-2 text-left transition-all ${
                    isSelected
                      ? "border-lime-500 bg-lime-50/50 shadow-xs ring-2 ring-lime-500/80"
                      : "border-slate-200/80 bg-slate-50/70 hover:border-slate-300 hover:bg-white text-slate-700"
                  }`}
                >
                  <span
                    className={`inline-flex rounded-lg px-2 py-0.5 font-mono text-xs font-bold shadow-2xs ${
                      isSelected ? "bg-slate-900 text-white" : "bg-slate-200 text-slate-800"
                    }`}
                  >
                    Khóa {card.cohortCode}
                  </span>

                  <span className="text-xs font-bold text-slate-900">
                    {card.plan.programCode || card.plan.programName}
                  </span>

                  <span className="text-slate-300">•</span>

                  {hasRun ? (
                    <div className="flex items-center gap-2 text-xs">
                      <span className="font-mono font-bold text-slate-800">{totalStud} SV</span>
                      <span
                        className={`inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[10px] font-semibold ${
                          passRate >= 80
                            ? "bg-emerald-100/70 text-emerald-800"
                            : "bg-amber-100/70 text-amber-800"
                        }`}
                      >
                        <span
                          className={`h-1.5 w-1.5 rounded-full ${
                            passRate >= 80 ? "bg-emerald-500" : "bg-amber-500"
                          }`}
                        />
                        {passRate}% đúng
                      </span>
                    </div>
                  ) : (
                    <span className="text-[11px] font-medium text-slate-400">Chưa kiểm tra</span>
                  )}
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* Main Content Area: Detailed Student List (Immediate, Full-Width) */}
      {activeCard && (
        <div className="rounded-2xl border border-slate-200/90 bg-white p-5 sm:p-6 shadow-sm space-y-5">
          {/* Header with integrated inline KPIs */}
          <div className="flex flex-col gap-3 border-b border-slate-100 pb-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <span className="inline-flex rounded-md bg-slate-900 px-2.5 py-0.5 font-mono text-xs font-bold text-white">
                  Khóa {activeCard.cohortCode}
                </span>
                <h3 className="text-base font-bold text-slate-900">
                  Danh sách sinh viên • {activeCard.plan.programName}
                </h3>
                <span className="rounded-md border border-slate-200 bg-slate-50 px-2 py-0.5 font-mono text-xs font-bold text-slate-700">
                  HK{activeCard.plan.curriculumSemesterNo} CTĐT
                </span>
              </div>
              <p className="mt-1 text-xs text-slate-500">
                Đối chiếu môn học theo khung kế hoạch chuẩn bản v{activeCard.plan.version}
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              {/* Compact KPI Pills right in header */}
              {activeCard.latestRun && (
                <div className="flex flex-wrap items-center gap-1.5">
                  <div className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-slate-50 px-3 py-1 text-xs font-medium text-slate-700">
                    <span className="text-slate-500 font-normal">Tổng:</span>
                    <strong className="font-mono font-bold text-slate-900">{studentCounts.total}</strong> SV
                  </div>
                  <div className="inline-flex items-center gap-1.5 rounded-xl border border-emerald-200 bg-emerald-50/70 px-3 py-1 text-xs font-medium text-emerald-800">
                    <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
                    <span>Đúng lộ trình:</span>
                    <strong className="font-mono font-bold text-emerald-900">{studentCounts.pass}</strong>
                    <span className="text-[11px] opacity-75">
                      ({studentCounts.total ? Math.round((studentCounts.pass / studentCounts.total) * 100) : 0}%)
                    </span>
                  </div>
                  <div className="inline-flex items-center gap-1.5 rounded-xl border border-amber-200 bg-amber-50/70 px-3 py-1 text-xs font-medium text-amber-800">
                    <span className="h-1.5 w-1.5 rounded-full bg-amber-500" />
                    <span>Cần tư vấn:</span>
                    <strong className="font-mono font-bold text-amber-900">{studentCounts.fail}</strong>
                  </div>
                </div>
              )}

              {can("progress.calculate") && activeCard.plan.status === "locked" && (
                <button
                  type="button"
                  onClick={() => setConfirmCalculatePlan(activeCard.plan)}
                  className="inline-flex h-8 items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 text-xs font-bold text-slate-700 transition hover:bg-slate-50 shadow-2xs"
                >
                  <Play size={12} className="text-lime-600" />
                  Kiểm tra lại
                </button>
              )}
            </div>
          </div>

          {/* If there is no run yet */}
          {!activeCard.latestRun ? (
            <div className="py-12 text-center">
              <Inbox size={36} className="mx-auto text-slate-300" />
              <h4 className="mt-2 text-sm font-bold text-slate-700">Khóa {activeCard.cohortCode} chưa được kiểm tra đăng ký</h4>
              <p className="mt-1 text-xs text-slate-400">
                Nhấn nút &ldquo;Bắt đầu kiểm tra&rdquo; để hệ thống tự động đối chiếu môn học sinh viên đã đăng ký.
              </p>
              {can("progress.calculate") && activeCard.plan.status === "locked" && (
                <button
                  type="button"
                  onClick={() => setConfirmCalculatePlan(activeCard.plan)}
                  className="mt-4 inline-flex items-center gap-1.5 rounded-xl bg-[var(--color-primary)] px-4 py-2 text-xs font-bold text-slate-950 transition hover:brightness-95 shadow-xs"
                >
                  <Play size={14} className="fill-slate-950" />
                  Bắt đầu kiểm tra Khóa này ngay
                </button>
              )}
            </div>
          ) : (
            <div className="space-y-4">

              {/* Search & Filter Controls */}
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                {/* Search input */}
                <div className="relative max-w-sm flex-1">
                  <Search size={15} className="pointer-events-none absolute top-3 left-3 text-slate-400" />
                  <input
                    type="text"
                    placeholder="Tìm theo MSSV, họ tên, lớp..."
                    value={studentSearch}
                    onChange={(e) => setStudentSearch(e.target.value)}
                    className="h-9.5 w-full rounded-xl border border-slate-200 bg-slate-50/60 pr-4 pl-9 text-xs outline-none focus:border-lime-600 focus:bg-white focus:ring-2 focus:ring-lime-100"
                  />
                  {studentSearch && (
                    <button
                      type="button"
                      onClick={() => setStudentSearch("")}
                      aria-label="Xóa từ khóa tìm kiếm"
                      className="absolute top-2.5 right-3 text-slate-400 hover:text-slate-600"
                    >
                      <X size={15} />
                    </button>
                  )}
                </div>

                {/* Filter tabs */}
                <div className="flex flex-wrap items-center gap-1.5">
                  <button
                    type="button"
                    onClick={() => setStudentStatusFilter("")}
                    className={`rounded-xl px-3 py-1.5 text-xs font-semibold transition ${
                      !studentStatusFilter
                        ? "bg-slate-900 text-white shadow-xs"
                        : "border border-slate-200 bg-white text-slate-600 hover:bg-slate-50"
                    }`}
                  >
                    Tất cả ({studentCounts.total})
                  </button>

                  <button
                    type="button"
                    onClick={() => setStudentStatusFilter("pass")}
                    className={`inline-flex items-center gap-1 rounded-xl px-3 py-1.5 text-xs font-semibold transition ${
                      studentStatusFilter === "pass"
                        ? "bg-emerald-600 text-white shadow-xs"
                        : "border border-emerald-200 bg-emerald-50/60 text-emerald-800 hover:bg-emerald-100"
                    }`}
                  >
                    <CheckCircle2 size={12} />
                    Đúng lộ trình ({studentCounts.pass})
                  </button>

                  <button
                    type="button"
                    onClick={() => setStudentStatusFilter("fail")}
                    className={`inline-flex items-center gap-1 rounded-xl px-3 py-1.5 text-xs font-semibold transition ${
                      studentStatusFilter === "fail"
                        ? "bg-amber-600 text-white shadow-xs"
                        : "border border-amber-200 bg-amber-50/60 text-amber-800 hover:bg-amber-100"
                    }`}
                  >
                    <AlertTriangle size={12} />
                    Cần tư vấn ({studentCounts.fail})
                  </button>
                </div>
              </div>

              {/* Display count indicator */}
              <div className="flex items-center justify-between px-1 text-xs text-slate-500">
                <span>
                  Đang hiển thị <strong className="font-semibold text-slate-800">{visibleStudents.length}</strong> sinh viên
                  {visibleStudents.length !== studentCounts.total && (
                    <span> (trên tổng số {studentCounts.total} sinh viên)</span>
                  )}
                </span>
                {studentSearch && (
                  <span className="italic text-slate-400">Khớp &ldquo;{studentSearch}&rdquo;</span>
                )}
              </div>

              {/* Student Table */}
              <div className="overflow-hidden rounded-2xl border border-slate-200">
                <div className="max-h-[520px] overflow-auto">
                  <table className="w-full min-w-[760px] text-left text-xs">
                    <thead className="sticky top-0 bg-slate-50 text-[11px] font-bold uppercase tracking-wider text-slate-500 shadow-2xs">
                      <tr>
                        <th className="px-4 py-3">Sinh viên</th>
                        <th className="px-4 py-3">Học phần bắt buộc</th>
                        <th className="px-4 py-3">Tín chỉ tự chọn</th>
                        <th className="px-4 py-3">Ngoài kế hoạch</th>
                        <th className="px-4 py-3 text-right">Tình trạng đối chiếu</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {runStudentsLoading ? (
                        <tr>
                          <td colSpan={5} className="px-4 py-16 text-center text-slate-500">
                            <LoaderCircle size={20} className="mr-2 inline animate-spin text-lime-600" />
                            Đang tải kết quả sinh viên Khóa {activeCard.cohortCode}...
                          </td>
                        </tr>
                      ) : visibleStudents.length ? (
                        visibleStudents.map((student) => {
                          const isMandatoryMissing =
                            student.mandatory.registeredCourses < student.mandatory.requiredCourses;
                          const isElectiveMissing = !student.elective.isEnough;

                          return (
                            <tr
                              key={student.id}
                              onClick={() => void openStudentDetail(student)}
                              className="cursor-pointer transition-colors hover:bg-lime-50/60 active:bg-lime-100/60"
                            >
                              {/* Student Identity */}
                              <td className="px-4 py-3.5">
                                <p className="font-bold text-slate-900">{student.studentName}</p>
                                <div className="mt-0.5 flex items-center gap-1.5 font-mono text-[11px] text-slate-500">
                                  <span>{student.studentId}</span>
                                  {student.className && (
                                    <>
                                      <span>•</span>
                                      <span>Lớp: {student.className}</span>
                                    </>
                                  )}
                                </div>
                              </td>

                              {/* Mandatory Courses */}
                              <td className="px-4 py-3.5">
                                <div className="flex items-center gap-1.5">
                                  <span className="font-mono font-bold text-slate-900">
                                    {student.mandatory.registeredCourses} / {student.mandatory.requiredCourses}
                                  </span>
                                  <span className="text-slate-500">môn</span>
                                </div>
                                {isMandatoryMissing ? (
                                  <span className="mt-0.5 inline-flex rounded-md bg-red-100 px-1.5 py-0.5 text-[10px] font-bold text-red-800">
                                    Thiếu {student.mandatory.requiredCourses - student.mandatory.registeredCourses} môn
                                  </span>
                                ) : (
                                  <span className="mt-0.5 inline-flex text-[10px] text-emerald-700">Đủ môn bắt buộc</span>
                                )}
                              </td>

                              {/* Electives */}
                              <td className="px-4 py-3.5">
                                <div className="flex items-center gap-1.5">
                                  <span className="font-mono font-bold text-slate-900">
                                    {student.elective.registeredCredits} / {student.elective.requiredCredits}
                                  </span>
                                  <span className="text-slate-500">TC</span>
                                </div>
                                {isElectiveMissing && student.elective.requiredCredits > 0 ? (
                                  <span className="mt-0.5 inline-flex rounded-md bg-amber-100 px-1.5 py-0.5 text-[10px] font-bold text-amber-800">
                                    Thiếu {student.elective.requiredCredits - student.elective.registeredCredits} TC
                                  </span>
                                ) : (
                                  <span className="mt-0.5 inline-flex text-[10px] text-emerald-700">Đủ tín chỉ</span>
                                )}
                              </td>

                              {/* Outside Plan */}
                              <td className="px-4 py-3.5">
                                {student.outsidePlanCredits > 0 ? (
                                  <span className="inline-flex rounded-full bg-blue-50 px-2 py-0.5 font-mono text-[11px] font-semibold text-blue-800">
                                    +{student.outsidePlanCredits} TC ngoài kế hoạch
                                  </span>
                                ) : (
                                  <span className="text-slate-400">0 TC</span>
                                )}
                              </td>

                              {/* Status Tag + Detail hint */}
                              <td className="px-4 py-3.5 text-right">
                                {student.status === "pass" ? (
                                  <span className="inline-flex items-center gap-1 rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-xs font-bold text-emerald-700">
                                    <CheckCircle2 size={13} /> Khớp lộ trình
                                  </span>
                                ) : student.status === "data_error" ? (
                                  <span className="inline-flex items-center gap-1 rounded-full border border-slate-200 bg-slate-100 px-2.5 py-1 text-xs font-bold text-slate-700">
                                    <CircleAlert size={13} /> Lỗi dữ liệu
                                  </span>
                                ) : (
                                  <span className="inline-flex items-center gap-1 rounded-full border border-amber-300 bg-amber-50 px-2.5 py-1 text-xs font-bold text-amber-800">
                                    <AlertTriangle size={13} /> Cần tư vấn
                                  </span>
                                )}
                                <div className="mt-1.5 flex items-center justify-end gap-1 text-[10px] font-medium text-lime-700 opacity-70 group-hover:opacity-100">
                                  <BookOpen size={10} />
                                  <span>Xem chi tiết môn học</span>
                                  <ChevronRight size={10} />
                                </div>
                              </td>
                            </tr>
                          );
                        })
                      ) : (
                        <tr>
                          <td colSpan={5} className="px-4 py-12 text-center text-slate-400">
                            {studentSearch
                              ? `Không tìm thấy sinh viên nào khớp "${studentSearch}".`
                              : "Không có sinh viên trong bộ lọc này."}
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Confirmation Modal for Check */}
      <ConfirmDialog
        isOpen={Boolean(confirmCalculatePlan)}
        onClose={() => !calculating && setConfirmCalculatePlan(null)}
        onConfirm={() => confirmCalculatePlan && void handleCalculate(confirmCalculatePlan)}
        title={confirmCalculatePlan ? `Kiểm tra đăng ký: Khóa ${confirmCalculatePlan.cohortCode}` : "Xác nhận"}
        message={
          confirmCalculatePlan
            ? `Hệ thống sẽ đối chiếu danh sách môn học sinh viên Khóa ${confirmCalculatePlan.cohortCode} đã đăng ký với kế hoạch chuẩn của kỳ này.`
            : ""
        }
        confirmText="Bắt đầu kiểm tra ngay"
        loading={calculating}
      />

      {/* Student Course Detail Modal */}
      {studentDetailOpen && (
        <div
          className="fixed inset-0 z-50 flex items-end justify-end sm:items-center sm:justify-center"
          onClick={(e) => { if (e.target === e.currentTarget) setStudentDetailOpen(false); }}
          role="dialog"
          aria-modal="true"
          aria-labelledby="registration-student-detail-title"
        >
          {/* Backdrop */}
          <div className="absolute inset-0 bg-slate-900/40 backdrop-blur-xs" onClick={() => setStudentDetailOpen(false)} />

          {/* Panel */}
          <div className="relative z-10 flex w-full max-h-[90vh] flex-col overflow-hidden rounded-t-3xl bg-white shadow-2xl sm:max-w-2xl sm:rounded-2xl">
            {/* Header */}
            <div className="flex items-start justify-between border-b border-slate-100 px-6 py-4">
              <div>
                {studentDetailLoading ? (
                  <div className="flex items-center gap-2 text-slate-600">
                    <LoaderCircle size={16} className="animate-spin text-lime-600" />
                    <span className="text-sm font-semibold">Đang tải chi tiết môn học...</span>
                  </div>
                ) : studentDetail ? (
                  <>
                    <h3 id="registration-student-detail-title" className="font-bold text-slate-900">{studentDetail.studentName}</h3>
                    <div className="mt-0.5 flex flex-wrap items-center gap-1.5 text-xs text-slate-500">
                      <span className="font-mono">{studentDetail.studentId}</span>
                      {studentDetail.className && (
                        <><span>•</span><span>Lớp: {studentDetail.className}</span></>
                      )}
                      {studentDetail.status === "pass" ? (
                        <span className="inline-flex items-center gap-1 rounded-full border border-emerald-200 bg-emerald-50 px-2 py-0.5 font-semibold text-emerald-700">
                          <CheckCircle2 size={11} /> Khớp lộ trình
                        </span>
                      ) : studentDetail.status === "data_error" ? (
                        <span className="inline-flex items-center gap-1 rounded-full border border-slate-200 bg-slate-100 px-2 py-0.5 font-semibold text-slate-600">
                          <CircleAlert size={11} /> Lỗi dữ liệu
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 rounded-full border border-amber-300 bg-amber-50 px-2 py-0.5 font-semibold text-amber-800">
                          <AlertTriangle size={11} /> Cần tư vấn
                        </span>
                      )}
                    </div>
                  </>
                ) : null}
              </div>
              <button
                type="button"
                onClick={() => setStudentDetailOpen(false)}
                aria-label="Đóng chi tiết môn học"
                className="rounded-full p-1.5 text-slate-400 transition hover:bg-slate-100 hover:text-slate-600"
              >
                <X size={18} />
              </button>
            </div>

            {/* Summary KPI row */}
            {studentDetail && !studentDetailLoading && (
              <div className="grid grid-cols-3 gap-px bg-slate-100">
                <div className="bg-white px-5 py-3 text-center">
                  <p className="text-[11px] font-semibold text-slate-500">Môn bắt buộc</p>
                  <p className="mt-0.5 font-mono text-lg font-bold text-slate-900">
                    {studentDetail.mandatory.registeredCourses}
                    <span className="text-sm text-slate-400">/{studentDetail.mandatory.requiredCourses}</span>
                  </p>
                </div>
                <div className="bg-white px-5 py-3 text-center">
                  <p className="text-[11px] font-semibold text-slate-500">TC tự chọn</p>
                  <p className="mt-0.5 font-mono text-lg font-bold text-slate-900">
                    {studentDetail.elective.registeredCredits}
                    <span className="text-sm text-slate-400">/{studentDetail.elective.requiredCredits} TC</span>
                  </p>
                </div>
                <div className="bg-white px-5 py-3 text-center">
                  <p className="text-[11px] font-semibold text-slate-500">Ngoài kế hoạch</p>
                  <p className="mt-0.5 font-mono text-lg font-bold text-blue-800">
                    +{studentDetail.outsidePlanCredits}
                    <span className="text-sm font-medium"> TC</span>
                  </p>
                </div>
              </div>
            )}

            {/* Course list */}
            <div className="flex-1 overflow-y-auto">
              {studentDetailLoading ? (
                <div className="flex items-center justify-center py-20 text-slate-400">
                  <LoaderCircle size={24} className="animate-spin text-lime-500" />
                </div>
              ) : studentDetail && studentDetail.courses.length > 0 ? (
                <div className="divide-y divide-slate-50">
                  {/* Group courses */}
                  {["mandatory", "elective", "outside_plan"].map((group) => {
                    const courses = studentDetail.courses.filter((c) => c.group === group);
                    if (!courses.length) return null;
                    const groupLabel = group === "mandatory" ? "Học phần bắt buộc theo kế hoạch"
                      : group === "elective" ? "Học phần tự chọn theo kế hoạch"
                      : "Học phần ngoài kế hoạch (sinh viên đăng ký thêm)";
                    const groupColor = group === "mandatory" ? "text-slate-700 bg-slate-50"
                      : group === "elective" ? "text-violet-800 bg-violet-50"
                      : "text-blue-800 bg-blue-50";
                    return (
                      <div key={group}>
                        <div className={`px-5 py-2.5 text-[11px] font-bold uppercase tracking-wider ${groupColor}`}>
                          {groupLabel} ({courses.length} môn)
                        </div>
                        <table className="w-full text-xs">
                          <thead className="border-b border-slate-100 text-[11px] font-semibold text-slate-500">
                            <tr>
                              <th className="px-5 py-2 text-left">Mã môn</th>
                              <th className="px-5 py-2 text-left">Tên môn học</th>
                              <th className="px-5 py-2 text-center">Tín chỉ</th>
                              <th className="px-5 py-2 text-center">Tình trạng</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-50">
                            {courses.map((course) => (
                              <tr key={`${course.courseCode}-${course.group}`} className="hover:bg-slate-50/60">
                                <td className="px-5 py-2.5 font-mono font-semibold text-slate-700">
                                  {course.courseCode}
                                </td>
                                <td className="px-5 py-2.5 text-slate-800">{course.courseName}</td>
                                <td className="px-5 py-2.5 text-center font-mono text-slate-600">{course.credits}</td>
                                <td className="px-5 py-2.5 text-center">
                                  {course.registrationStatus === "registered" ? (
                                    <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 text-[11px] font-bold text-emerald-700">
                                      <CheckCircle2 size={10} /> Đã đăng ký
                                    </span>
                                  ) : (
                                    <span className="inline-flex items-center gap-1 rounded-full bg-red-50 px-2 py-0.5 text-[11px] font-bold text-red-700">
                                      <XCircle size={10} /> Chưa đăng ký
                                    </span>
                                  )}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    );
                  })}
                </div>
              ) : !studentDetailLoading && (
                <div className="px-6 py-16 text-center text-sm text-slate-400">Không có dữ liệu môn học.</div>
              )}
            </div>

            {/* Footer */}
            <div className="flex items-center justify-between border-t border-slate-100 px-6 py-3">
              <p className="text-xs text-slate-400">
                {studentDetail ? `${studentDetail.courses.length} môn học trong kỳ này` : ""}
              </p>
              <button
                type="button"
                onClick={() => setStudentDetailOpen(false)}
                className="rounded-xl bg-slate-100 px-4 py-2 text-xs font-semibold text-slate-700 transition hover:bg-slate-200"
              >
                Đóng
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
