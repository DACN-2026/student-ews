"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  Archive,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  CircleAlert,
  CopyPlus,
  Database,
  Eye,
  History,
  Inbox,
  LoaderCircle,
  LockKeyhole,
  MoreHorizontal,
  Play,
  RefreshCw,
  ShieldCheck,
  XCircle,
} from "lucide-react";
import { apiFetch } from "@/lib/api-client";
import { useAuthStore } from "@/stores/authStore";
import ConfirmDialog from "@/components/ui/ConfirmDialog";
import SlideOverDrawer from "@/components/ui/SlideOverDrawer";
import { toast } from "@/components/ui/Toast";
import type {
  AcademicContext,
  CohortOption,
  ListResponse,
  ProgramOption,
  ProgressPlan,
  RegistrationRun,
  RegistrationStudentResult,
} from "./types";
import { formatDateTime, responseError, shortRunId } from "./types";

const PAGE_SIZE = 10;

type PlanDetail = ProgressPlan & {
  courses: Array<{
    id: string;
    courseId: string;
    courseCode: string;
    courseName: string;
    credits: number;
    requirementType: string;
    choiceGroupCode?: string | null;
    isRegistrationRequired: boolean;
  }>;
  recentRuns: Array<RegistrationRun>;
};

type PlanAction = "lock" | "activate" | "archive" | "version" | "calculate";

interface ActionTarget {
  action: PlanAction;
  plan: ProgressPlan;
}

const statusMeta: Record<string, { label: string; className: string }> = {
  draft: { label: "Bản nháp", className: "border-slate-200 bg-slate-100 text-slate-700" },
  ready: { label: "Sẵn sàng", className: "border-blue-200 bg-blue-50 text-blue-700" },
  locked: { label: "Đã khóa", className: "border-emerald-200 bg-emerald-50 text-emerald-700" },
  archived: { label: "Lưu trữ", className: "border-slate-200 bg-white text-slate-500" },
  invalid: { label: "Không hợp lệ", className: "border-red-200 bg-red-50 text-red-700" },
};

function StatusBadge({ status }: { status: string }) {
  const meta = statusMeta[status] || { label: status, className: "border-slate-200 bg-slate-50 text-slate-600" };
  return (
    <span className={`inline-flex rounded-md border px-2 py-1 text-[11px] font-semibold ${meta.className}`}>
      {meta.label}
    </span>
  );
}

export default function RegistrationProgressTab() {
  const { can } = useAuthStore();
  const [plans, setPlans] = useState<ProgressPlan[]>([]);
  const [runs, setRuns] = useState<RegistrationRun[]>([]);
  const [cohorts, setCohorts] = useState<CohortOption[]>([]);
  const [programs, setPrograms] = useState<ProgramOption[]>([]);
  const [academicContext, setAcademicContext] = useState<AcademicContext | null>(null);
  const [cohortId, setCohortId] = useState("");
  const [programId, setProgramId] = useState("");
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");
  const [selectedPlan, setSelectedPlan] = useState<PlanDetail | null>(null);
  const [planLoading, setPlanLoading] = useState(false);
  const [selectedRun, setSelectedRun] = useState<RegistrationRun | null>(null);
  const [runStudents, setRunStudents] = useState<RegistrationStudentResult[]>([]);
  const [runStudentsLoading, setRunStudentsLoading] = useState(false);
  const [runStatusFilter, setRunStatusFilter] = useState("");
  const [actionTarget, setActionTarget] = useState<ActionTarget | null>(null);
  const [actionLoading, setActionLoading] = useState(false);

  const queryString = useMemo(() => {
    const query = new URLSearchParams({ page: String(page), pageSize: String(PAGE_SIZE) });
    if (cohortId) query.set("cohortId", cohortId);
    if (programId) query.set("trainingProgramId", programId);
    return query.toString();
  }, [cohortId, page, programId]);

  const loadCatalogs = useCallback(async () => {
    const [cohortResponse, programResponse, contextResponse] = await Promise.all([
      apiFetch("/api/v1/cohorts?pageSize=100"),
      apiFetch("/api/v1/training-programs?pageSize=100"),
      apiFetch("/api/v1/academic-context"),
    ]);
    if (cohortResponse.ok) {
      const data = await cohortResponse.json() as ListResponse<CohortOption>;
      setCohorts(data.items || []);
    }
    if (programResponse.ok) {
      const data = await programResponse.json() as ListResponse<ProgramOption>;
      setPrograms(data.items || []);
    }
    if (contextResponse.ok) setAcademicContext(await contextResponse.json() as AcademicContext | null);
  }, []);

  const loadData = useCallback(async (quiet = false) => {
    if (quiet) setRefreshing(true);
    else setLoading(true);
    setError("");
    try {
      const runQuery = new URLSearchParams(queryString);
      runQuery.set("page", "1");
      runQuery.set("pageSize", "20");
      const [planResponse, runResponse] = await Promise.all([
        apiFetch(`/api/v1/training-progress/plans?${queryString}`),
        apiFetch(`/api/v1/training-progress/runs?${runQuery.toString()}`),
      ]);
      if (!planResponse.ok) throw new Error(await responseError(planResponse, "Không thể tải kế hoạch đào tạo."));
      if (!runResponse.ok) throw new Error(await responseError(runResponse, "Không thể tải lịch sử đối chiếu."));
      const planData = await planResponse.json() as ListResponse<ProgressPlan>;
      const runData = await runResponse.json() as ListResponse<RegistrationRun>;
      setPlans(planData.items || []);
      setTotal(planData.total || 0);
      setRuns(runData.items || []);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Không thể tải dữ liệu tiến độ đào tạo.");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [queryString]);

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

  const openPlan = async (planId: string) => {
    setPlanLoading(true);
    try {
      const response = await apiFetch(`/api/v1/training-progress/plans/${planId}`);
      if (!response.ok) throw new Error(await responseError(response, "Không thể tải chi tiết kế hoạch."));
      setSelectedPlan(await response.json() as PlanDetail);
    } catch (cause) {
      toast.error(cause instanceof Error ? cause.message : "Không thể tải chi tiết kế hoạch.");
    } finally {
      setPlanLoading(false);
    }
  };

  const openRun = async (run: RegistrationRun) => {
    setSelectedRun(run);
    setRunStudents([]);
    setRunStatusFilter("");
    setRunStudentsLoading(true);
    try {
      const response = await apiFetch(`/api/v1/training-progress/runs/${run.id}/students?pageSize=100`);
      if (!response.ok) throw new Error(await responseError(response, "Không thể tải kết quả sinh viên."));
      const data = await response.json() as ListResponse<RegistrationStudentResult>;
      setRunStudents(data.items || []);
    } catch (cause) {
      toast.error(cause instanceof Error ? cause.message : "Không thể tải kết quả sinh viên.");
    } finally {
      setRunStudentsLoading(false);
    }
  };

  const openLatestRunForPlan = async (planId: string) => {
    const cached = runs.find((item) => item.planId === planId);
    if (cached) {
      await openRun(cached);
      return;
    }
    try {
      const response = await apiFetch(`/api/v1/training-progress/runs?planId=${encodeURIComponent(planId)}&pageSize=1`);
      if (!response.ok) throw new Error(await responseError(response, "Không thể tải lịch sử run."));
      const data = await response.json() as ListResponse<RegistrationRun>;
      if (!data.items?.[0]) throw new Error("Kế hoạch chưa có run trong phạm vi được phép xem.");
      await openRun(data.items[0]);
    } catch (cause) {
      toast.error(cause instanceof Error ? cause.message : "Không thể tải lịch sử run.");
    }
  };

  const confirmAction = async () => {
    if (!actionTarget) return;
    const { action, plan } = actionTarget;
    const endpoint = action === "version"
      ? `/api/v1/training-progress/plans/${plan.id}/versions`
      : `/api/v1/training-progress/plans/${plan.id}/${action}`;
    setActionLoading(true);
    try {
      const response = await apiFetch(endpoint, { method: "POST" });
      if (!response.ok) throw new Error(await responseError(response, "Không thể thực hiện thao tác."));
      const messages: Record<PlanAction, string> = {
        lock: "Đã khóa kế hoạch.",
        activate: "Đã đặt kế hoạch hiện hành.",
        archive: "Đã lưu trữ kế hoạch.",
        version: "Đã tạo phiên bản kế hoạch mới.",
        calculate: "Đã hoàn tất đối chiếu đăng ký.",
      };
      toast.success(messages[action]);
      setActionTarget(null);
      setSelectedPlan(null);
      await loadData(true);
    } catch (cause) {
      toast.error(cause instanceof Error ? cause.message : "Không thể thực hiện thao tác.");
    } finally {
      setActionLoading(false);
    }
  };

  const currentTermConfigured = Boolean(academicContext?.isActive);
  const pageCounters = {
    current: plans.filter((plan) => plan.isCurrent).length,
    currentTerm: plans.filter((plan) => currentTermConfigured && plan.academicTermId === academicContext?.academicTermId).length,
    locked: plans.filter((plan) => plan.status === "locked").length,
  };
  const pageCount = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const visibleRunStudents = runStudents.filter((student) => !runStatusFilter || student.status === runStatusFilter);

  const actionCopy: Record<PlanAction, { title: string; message: string; confirmText: string; dangerous?: boolean }> = {
    lock: {
      title: "Khóa kế hoạch",
      message: "Sau khi khóa, nội dung kế hoạch không thể sửa trực tiếp và sẽ được dùng làm căn cứ đối chiếu.",
      confirmText: "Khóa kế hoạch",
    },
    activate: {
      title: "Đặt kế hoạch hiện hành",
      message: "Kế hoạch đã khóa này sẽ trở thành phiên bản hiện hành trong cùng phạm vi khóa, CTĐT và kỳ vận hành.",
      confirmText: "Đặt hiện hành",
    },
    archive: {
      title: "Lưu trữ kế hoạch",
      message: "Kế hoạch sẽ không còn hiện hành. Các kết quả run cũ vẫn được giữ để truy vết.",
      confirmText: "Lưu trữ",
      dangerous: true,
    },
    version: {
      title: "Tạo phiên bản mới",
      message: "Hệ thống sẽ sao chép cấu hình hiện tại thành một bản nháp có số phiên bản mới.",
      confirmText: "Tạo phiên bản",
    },
    calculate: {
      title: "Chạy kiểm tra đăng ký",
      message: "Hệ thống sẽ chụp dữ liệu đăng ký hiện tại và tạo một run mới. Làm mới trang không tự tạo run.",
      confirmText: "Bắt đầu kiểm tra",
    },
  };

  return (
    <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm" aria-labelledby="registration-heading">
      <div className="flex flex-col gap-4 border-b border-slate-100 p-5 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <h2 id="registration-heading" className="text-base font-bold text-slate-950">Kiểm tra đăng ký theo kỳ</h2>
          <p className="mt-1 text-xs leading-5 text-slate-500">
            Đối chiếu học phần đã đăng ký với kế hoạch đã khóa. Kết quả phản ánh độ khớp kế hoạch, không mặc định là vi phạm quy chế.
          </p>
        </div>
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
          <label className="sr-only" htmlFor="recent-registration-run">Mở run gần đây</label>
          <select
            id="recent-registration-run"
            value=""
            onChange={(event) => {
              const run = runs.find((item) => item.id === event.target.value);
              if (run) void openRun(run);
            }}
            disabled={!runs.length}
            className="h-9 min-w-56 rounded-lg border border-slate-200 bg-white px-3 text-xs font-medium text-slate-700 outline-none focus:border-lime-600 focus:ring-2 focus:ring-lime-100 disabled:bg-slate-50 disabled:text-slate-400"
          >
            <option value="">{runs.length ? "Mở run gần đây" : "Chưa có run"}</option>
            {runs.map((run) => (
              <option key={run.id} value={run.id}>
                {shortRunId(run.id)} | {run.cohortCode || "Khóa"} | {run.termCode || "Kỳ"}
              </option>
            ))}
          </select>
          <button
            type="button"
            onClick={() => void loadData(true)}
            disabled={refreshing}
            className="inline-flex h-9 items-center justify-center gap-2 rounded-lg border border-slate-200 bg-white px-3 text-xs font-semibold text-slate-700 transition hover:bg-slate-50 active:translate-y-px disabled:cursor-wait disabled:opacity-60"
          >
            <RefreshCw aria-hidden="true" size={14} className={refreshing ? "animate-spin" : ""} />
            Làm mới
          </button>
        </div>
      </div>

      <div className="space-y-5 p-5">
        {!currentTermConfigured && (
          <div className="flex items-start gap-3 rounded-xl border border-amber-200 bg-amber-50 p-4 text-amber-950" role="status">
            <AlertTriangle aria-hidden="true" size={18} className="mt-0.5 shrink-0 text-amber-600" />
            <div>
              <p className="text-xs font-bold">Chưa xác định kỳ học hiện tại</p>
              <p className="mt-1 text-xs leading-5 text-amber-800">
                Có thể xem và chạy thủ công theo kỳ đã chọn. Hệ thống không tự gán kỳ hiện tại hoặc học kỳ lộ trình.
              </p>
            </div>
          </div>
        )}

        <div className="grid gap-3 md:grid-cols-[minmax(0,220px)_minmax(0,320px)_auto] md:items-end">
          <div>
            <label htmlFor="registration-cohort" className="mb-1.5 block text-xs font-semibold text-slate-700">Khóa</label>
            <select
              id="registration-cohort"
              value={cohortId}
              onChange={(event) => { setCohortId(event.target.value); setPage(1); }}
              className="h-10 w-full rounded-xl border border-slate-200 bg-white px-3 text-xs font-medium text-slate-800 outline-none focus:border-lime-600 focus:ring-2 focus:ring-lime-100"
            >
              <option value="">Tất cả khóa</option>
              {cohorts.map((cohort) => <option key={cohort.id} value={cohort.id}>{cohort.cohortCode}</option>)}
            </select>
          </div>
          <div>
            <label htmlFor="registration-program" className="mb-1.5 block text-xs font-semibold text-slate-700">Chương trình đào tạo</label>
            <select
              id="registration-program"
              value={programId}
              onChange={(event) => { setProgramId(event.target.value); setPage(1); }}
              className="h-10 w-full rounded-xl border border-slate-200 bg-white px-3 text-xs font-medium text-slate-800 outline-none focus:border-lime-600 focus:ring-2 focus:ring-lime-100"
            >
              <option value="">Tất cả chương trình</option>
              {programs.map((program) => (
                <option key={program.id} value={program.id}>{program.programCode} - {program.programName}</option>
              ))}
            </select>
          </div>
          <button
            type="button"
            onClick={() => { setCohortId(""); setProgramId(""); setPage(1); }}
            className="h-10 w-fit rounded-xl border border-slate-200 px-4 text-xs font-semibold text-slate-700 transition hover:bg-slate-50 active:translate-y-px"
          >
            Đặt lại
          </button>
        </div>

        <div className="flex flex-wrap gap-2" aria-label="Thống kê kế hoạch trên trang">
          <span className="rounded-md border border-slate-200 bg-slate-100 px-2.5 py-1 text-[11px] font-semibold text-slate-700">Tổng {total} kế hoạch</span>
          <span className="rounded-md border border-blue-200 bg-blue-50 px-2.5 py-1 text-[11px] font-semibold text-blue-700">{pageCounters.current} hiện hành trong trang</span>
          <span className="rounded-md border border-blue-200 bg-blue-50 px-2.5 py-1 text-[11px] font-semibold text-blue-700">{pageCounters.currentTerm} thuộc kỳ hiện tại trong trang</span>
          <span className="rounded-md border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-[11px] font-semibold text-emerald-700">{pageCounters.locked} đã khóa trong trang</span>
        </div>
      </div>

      {error ? (
        <div className="m-5 mt-0 flex items-center justify-between gap-4 rounded-xl border border-red-200 bg-red-50 p-4 text-xs text-red-800" role="alert">
          <span className="flex items-center gap-2"><CircleAlert aria-hidden="true" size={16} />{error}</span>
          <button type="button" onClick={() => void loadData()} className="font-bold underline underline-offset-2">Thử lại</button>
        </div>
      ) : (
        <div className="overflow-x-auto border-t border-slate-100">
          <table className="w-full min-w-[980px] text-left text-xs">
            <thead className="bg-slate-50 text-[11px] font-semibold uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-4 py-3">Khóa / CTĐT</th>
                <th className="px-4 py-3">Kỳ vận hành</th>
                <th className="px-4 py-3">HK lộ trình</th>
                <th className="px-4 py-3">Version</th>
                <th className="px-4 py-3">Trạng thái</th>
                <th className="px-4 py-3 text-center">Lượt chạy</th>
                <th className="px-4 py-3 text-center">Hiện hành</th>
                <th className="px-4 py-3 text-right">Vận hành</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {loading ? (
                Array.from({ length: 5 }).map((_, index) => (
                  <tr key={index} className="animate-pulse">
                    {Array.from({ length: 8 }).map((__, cell) => <td key={cell} className="px-4 py-4"><div className="h-4 rounded bg-slate-100" /></td>)}
                  </tr>
                ))
              ) : plans.length === 0 ? (
                <tr>
                  <td colSpan={8} className="px-4 py-16 text-center">
                    <Inbox aria-hidden="true" size={36} className="mx-auto text-slate-300" />
                    <p className="mt-3 font-semibold text-slate-600">Chưa có kế hoạch phù hợp</p>
                    <p className="mt-1 text-slate-400">Tạo kế hoạch tại mục Học vụ, sau đó khóa để chạy đối chiếu.</p>
                  </td>
                </tr>
              ) : plans.map((plan) => {
                const isCurrentTerm = currentTermConfigured && plan.academicTermId === academicContext?.academicTermId;
                return (
                  <tr key={plan.id} className={isCurrentTerm ? "bg-lime-50/40" : "hover:bg-slate-50/70"}>
                    <td className="px-4 py-3.5">
                      <p className="font-bold text-slate-900">{plan.cohortCode || "Chưa có mã khóa"}</p>
                      <p className="mt-0.5 max-w-60 truncate text-slate-600" title={plan.programName}>{plan.programName || plan.programCode || "Chưa có CTĐT"}</p>
                      {plan.programCode && <p className="mt-0.5 font-mono text-[10px] text-slate-400">{plan.programCode}</p>}
                    </td>
                    <td className="px-4 py-3.5 text-slate-700">
                      <p className="font-semibold">{plan.academicYearCode || "Chưa xác định"}</p>
                      <p className="mt-0.5 text-slate-500">{plan.termName || plan.termCode || "Chưa xác định"}</p>
                    </td>
                    <td className="px-4 py-3.5 font-mono font-semibold text-slate-700">HK{plan.curriculumSemesterNo}</td>
                    <td className="px-4 py-3.5">
                      <p className="font-mono font-bold text-slate-800">v{plan.version}</p>
                      <p className="mt-0.5 text-[10px] text-slate-400">Snapshot kế hoạch</p>
                    </td>
                    <td className="px-4 py-3.5"><StatusBadge status={plan.status} /></td>
                    <td className="px-4 py-3.5 text-center">
                      <button
                        type="button"
                        onClick={() => void openLatestRunForPlan(plan.id)}
                        disabled={!plan.runCount}
                        className="inline-flex items-center gap-1 rounded-md px-2 py-1 font-mono font-bold text-slate-700 hover:bg-slate-100 disabled:cursor-default disabled:text-slate-400"
                      >
                        <History aria-hidden="true" size={13} />{plan.runCount}
                      </button>
                    </td>
                    <td className="px-4 py-3.5 text-center">
                      {plan.isCurrent ? <CheckCircle2 aria-label="Hiện hành" size={18} className="mx-auto text-emerald-600" /> : <span className="text-slate-300">Không</span>}
                    </td>
                    <td className="px-4 py-3.5 text-right">
                      <details className="relative inline-block text-left">
                        <summary className="inline-flex h-8 w-8 cursor-pointer list-none items-center justify-center rounded-lg border border-slate-200 text-slate-600 transition hover:bg-slate-50" aria-label="Mở menu vận hành">
                          <MoreHorizontal aria-hidden="true" size={16} />
                        </summary>
                        <div className="absolute right-0 z-20 mt-1 w-52 rounded-xl border border-slate-200 bg-white p-1.5 text-left shadow-xl">
                          <button type="button" onClick={() => void openPlan(plan.id)} className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50"><Eye size={14} />Xem chi tiết</button>
                          {can("progress.plan.manage") && plan.status === "draft" && <button type="button" onClick={() => setActionTarget({ action: "lock", plan })} className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50"><LockKeyhole size={14} />Khóa kế hoạch</button>}
                          {can("progress.plan.manage") && plan.status === "locked" && !plan.isCurrent && <button type="button" onClick={() => setActionTarget({ action: "activate", plan })} className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50"><ShieldCheck size={14} />Đặt hiện hành</button>}
                          {can("progress.calculate") && plan.status === "locked" && <button type="button" onClick={() => setActionTarget({ action: "calculate", plan })} className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50"><Play size={14} />Chạy kiểm tra</button>}
                          {can("progress.plan.manage") && plan.status !== "archived" && <button type="button" onClick={() => setActionTarget({ action: "version", plan })} className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50"><CopyPlus size={14} />Tạo version mới</button>}
                          {can("progress.plan.manage") && plan.status === "locked" && <button type="button" onClick={() => setActionTarget({ action: "archive", plan })} className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-xs font-medium text-red-700 hover:bg-red-50"><Archive size={14} />Lưu trữ</button>}
                        </div>
                      </details>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {!loading && !error && total > 0 && (
        <div className="flex items-center justify-between border-t border-slate-100 px-5 py-3 text-xs text-slate-500">
          <span>Trang {page}/{pageCount}, tổng {total} kế hoạch</span>
          <div className="flex gap-1">
            <button type="button" aria-label="Trang trước" disabled={page <= 1} onClick={() => setPage((value) => value - 1)} className="rounded-lg border border-slate-200 p-2 hover:bg-slate-50 disabled:opacity-40"><ChevronLeft size={14} /></button>
            <button type="button" aria-label="Trang sau" disabled={page >= pageCount} onClick={() => setPage((value) => value + 1)} className="rounded-lg border border-slate-200 p-2 hover:bg-slate-50 disabled:opacity-40"><ChevronRight size={14} /></button>
          </div>
        </div>
      )}

      <SlideOverDrawer
        isOpen={Boolean(selectedPlan) || planLoading}
        onClose={() => setSelectedPlan(null)}
        title="Chi tiết snapshot kế hoạch"
        subtitle={selectedPlan ? `${selectedPlan.cohortCode || "Khóa"} | ${selectedPlan.programCode || "CTĐT"} | v${selectedPlan.version}` : "Đang tải dữ liệu"}
        width="3xl"
      >
        {planLoading && !selectedPlan ? (
          <div className="flex min-h-48 items-center justify-center gap-2 text-sm text-slate-500"><LoaderCircle className="animate-spin" size={18} />Đang tải snapshot...</div>
        ) : selectedPlan && (
          <div className="space-y-6">
            <div className="grid gap-3 sm:grid-cols-4">
              <Metric label="Học kỳ lộ trình" value={`HK${selectedPlan.curriculumSemesterNo}`} />
              <Metric label="Phiên bản" value={`v${selectedPlan.version}`} />
              <Metric label="Học phần" value={String(selectedPlan.courses.length)} />
              <Metric label="TC tự chọn tối thiểu" value={String(selectedPlan.requiredElectiveCredits)} />
            </div>
            <div>
              <div className="mb-3 flex items-center justify-between">
                <h3 className="text-sm font-bold text-slate-900">Học phần trong snapshot</h3>
                <StatusBadge status={selectedPlan.status} />
              </div>
              <div className="overflow-hidden rounded-xl border border-slate-200">
                <table className="w-full text-left text-xs">
                  <thead className="bg-slate-50 text-[11px] uppercase text-slate-500"><tr><th className="px-3 py-2.5">Mã HP</th><th className="px-3 py-2.5">Tên học phần</th><th className="px-3 py-2.5">Số TC</th><th className="px-3 py-2.5">Yêu cầu</th></tr></thead>
                  <tbody className="divide-y divide-slate-100">
                    {selectedPlan.courses.length ? selectedPlan.courses.map((course) => (
                      <tr key={course.id}><td className="px-3 py-2.5 font-mono font-semibold text-slate-700">{course.courseCode}</td><td className="px-3 py-2.5 text-slate-700">{course.courseName}</td><td className="px-3 py-2.5 font-mono">{course.credits}</td><td className="px-3 py-2.5 text-slate-600">{course.requirementType === "mandatory" ? "Bắt buộc" : "Tự chọn"}</td></tr>
                    )) : <tr><td colSpan={4} className="px-3 py-8 text-center text-slate-400">Snapshot chưa có học phần.</td></tr>}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}
      </SlideOverDrawer>

      <SlideOverDrawer
        isOpen={Boolean(selectedRun)}
        onClose={() => setSelectedRun(null)}
        title="Kết quả kiểm tra đăng ký"
        subtitle={selectedRun ? `${shortRunId(selectedRun.id)} | ${selectedRun.cohortCode || "Khóa"} | ${selectedRun.academicYearCode || "Năm học"} ${selectedRun.termCode || ""}` : undefined}
        width="5xl"
      >
        {selectedRun && (
          <div className="space-y-6">
            <div className="grid gap-3 sm:grid-cols-4">
              <Metric label="Tổng sinh viên" value={String(selectedRun.totalStudents)} icon={<Database size={15} />} />
              <Metric label="Đáp ứng kế hoạch" value={String(selectedRun.passStudents)} tone="success" icon={<CheckCircle2 size={15} />} />
              <Metric label="Cần rà soát" value={String(selectedRun.failStudents)} tone="danger" icon={<XCircle size={15} />} />
              <Metric label="Lỗi dữ liệu" value={String(selectedRun.dataErrorStudents)} tone="warning" icon={<AlertTriangle size={15} />} />
            </div>
            <div className="grid gap-3 rounded-xl border border-slate-200 bg-slate-50 p-4 text-xs text-slate-600 sm:grid-cols-3">
              <div><span className="block font-semibold text-slate-500">Thời điểm chạy</span><span className="mt-1 block text-slate-800">{formatDateTime(selectedRun.startedAt)}</span></div>
              <div><span className="block font-semibold text-slate-500">Dữ liệu đăng ký</span><span className="mt-1 block text-slate-800">{selectedRun.offeringCount} bản ghi</span></div>
              <div><span className="block font-semibold text-slate-500">Hash nguồn</span><span className="mt-1 block truncate font-mono text-slate-800" title={selectedRun.sourceSnapshotHash || ""}>{selectedRun.sourceSnapshotHash?.slice(0, 16) || "Chưa có"}</span></div>
            </div>
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <h3 className="text-sm font-bold text-slate-900">Kết quả theo sinh viên</h3>
                <p className="mt-0.5 text-xs text-slate-500">Tách riêng mức độ khớp kế hoạch, chưa kết luận vi phạm quy chế.</p>
              </div>
              <select value={runStatusFilter} onChange={(event) => setRunStatusFilter(event.target.value)} className="h-9 rounded-lg border border-slate-200 bg-white px-3 text-xs font-medium text-slate-700">
                <option value="">Tất cả trạng thái</option>
                <option value="pass">Đáp ứng kế hoạch</option>
                <option value="fail">Cần rà soát</option>
                <option value="data_error">Lỗi dữ liệu</option>
              </select>
            </div>
            <div className="overflow-hidden rounded-xl border border-slate-200">
              <div className="max-h-[480px] overflow-auto">
                <table className="w-full min-w-[760px] text-left text-xs">
                  <thead className="sticky top-0 bg-slate-50 text-[11px] uppercase text-slate-500"><tr><th className="px-3 py-2.5">Sinh viên</th><th className="px-3 py-2.5">Bắt buộc</th><th className="px-3 py-2.5">Tự chọn</th><th className="px-3 py-2.5">Ngoài kế hoạch</th><th className="px-3 py-2.5">Kết quả</th></tr></thead>
                  <tbody className="divide-y divide-slate-100">
                    {runStudentsLoading ? <tr><td colSpan={5} className="px-3 py-12 text-center text-slate-500"><LoaderCircle className="mr-2 inline animate-spin" size={16} />Đang tải kết quả...</td></tr> : visibleRunStudents.length ? visibleRunStudents.map((student) => (
                      <tr key={student.id} className="hover:bg-slate-50">
                        <td className="px-3 py-3"><p className="font-semibold text-slate-900">{student.studentName}</p><p className="mt-0.5 font-mono text-[10px] text-slate-400">{student.studentId}{student.className ? ` | ${student.className}` : ""}</p></td>
                        <td className="px-3 py-3 text-slate-700"><span className="font-mono font-bold">{student.mandatory.registeredCourses}/{student.mandatory.requiredCourses}</span> học phần<p className="mt-0.5 text-[10px] text-slate-400">{student.mandatory.registeredCredits}/{student.mandatory.requiredCredits} tín chỉ</p></td>
                        <td className="px-3 py-3 text-slate-700"><span className="font-mono font-bold">{student.elective.registeredCredits}/{student.elective.requiredCredits}</span> tín chỉ</td>
                        <td className="px-3 py-3 font-mono text-slate-700">{student.outsidePlanCredits} TC</td>
                        <td className="px-3 py-3">{student.status === "pass" ? <span className="inline-flex items-center gap-1 text-emerald-700"><CheckCircle2 size={14} />Đáp ứng</span> : student.status === "data_error" ? <span className="inline-flex items-center gap-1 text-amber-700"><AlertTriangle size={14} />Lỗi dữ liệu</span> : <span className="inline-flex items-center gap-1 text-red-700"><XCircle size={14} />Cần rà soát</span>}</td>
                      </tr>
                    )) : <tr><td colSpan={5} className="px-3 py-12 text-center text-slate-400">Không có sinh viên trong bộ lọc này.</td></tr>}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}
      </SlideOverDrawer>

      <ConfirmDialog
        isOpen={Boolean(actionTarget)}
        onClose={() => !actionLoading && setActionTarget(null)}
        onConfirm={() => void confirmAction()}
        title={actionTarget ? actionCopy[actionTarget.action].title : "Xác nhận"}
        message={actionTarget ? actionCopy[actionTarget.action].message : ""}
        confirmText={actionTarget ? actionCopy[actionTarget.action].confirmText : "Xác nhận"}
        isDangerous={Boolean(actionTarget && actionCopy[actionTarget.action].dangerous)}
        loading={actionLoading}
      />
    </section>
  );
}

function Metric({ label, value, tone = "neutral", icon }: { label: string; value: string; tone?: "neutral" | "success" | "danger" | "warning"; icon?: React.ReactNode }) {
  const tones = {
    neutral: "border-slate-200 bg-white text-slate-900",
    success: "border-emerald-200 bg-emerald-50 text-emerald-800",
    danger: "border-red-200 bg-red-50 text-red-800",
    warning: "border-amber-200 bg-amber-50 text-amber-800",
  };
  return (
    <div className={`rounded-xl border p-3 ${tones[tone]}`}>
      <div className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wide opacity-70">{icon}{label}</div>
      <div className="mt-1 font-mono text-xl font-bold">{value}</div>
    </div>
  );
}
