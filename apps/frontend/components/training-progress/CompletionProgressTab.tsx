"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  CheckCircle2,
  ChevronDown,
  CircleAlert,
  FileCheck2,
  Inbox,
  Info,
  LoaderCircle,
  Play,
  RefreshCw,
  Search,
  Sparkles,
  X,
  XCircle,
} from "lucide-react";
import { apiFetch } from "@/lib/api-client";
import { useAuthStore } from "@/stores/authStore";
import Modal from "@/components/ui/Modal";
import { toast } from "@/components/ui/Toast";
import StudentProgressDetail from "./StudentProgressDetail";
import type {
  AcademicYearOption,
  CohortOption,
  CompletionPreview,
  CompletionRun,
  CompletionStudentResult,
  ListResponse,
  ProgramOption,
} from "./types";
import { responseError } from "./types";

interface CompletionStudentDetail extends CompletionStudentResult {
  studentUuid: string;
  className?: string | null;
  plans: Array<{
    id: string;
    planId: string;
    planVersion: number;
    curriculumSemesterNo: number;
    isDue: boolean;
    isPass: boolean;
    requiredElectiveCredits: number;
    passedElectiveCredits: number;
    missingElectiveCredits: number;
    pendingResultCourses: number;
    courses: Array<{
      courseId: string;
      courseCode: string;
      courseName: string;
      credits: number;
      requirementType: string;
      isRegistrationRequired: boolean;
      passed: boolean;
      pendingResult: boolean;
      evidenceAcademicYear?: string | null;
      evidenceTermCode?: string | null;
    }>;
  }>;
}

const completionStatus = {
  completed: {
    label: "Đã hoàn thành yêu cầu học phần",
    badgeClass: "border-emerald-200 bg-emerald-50 text-emerald-800",
    dotClass: "bg-emerald-500",
  },
  incomplete: {
    label: "Chưa hoàn thành yêu cầu học phần",
    badgeClass: "border-red-200 bg-red-50 text-red-800",
    dotClass: "bg-red-500",
  },
  pending_result: {
    label: "Chờ điểm học phần",
    badgeClass: "border-amber-200 bg-amber-50 text-amber-800",
    dotClass: "bg-amber-500",
  },
  cannot_determine: {
    label: "Cần đối soát thêm",
    badgeClass: "border-slate-200 bg-slate-100 text-slate-700",
    dotClass: "bg-slate-400",
  },
} as const;

export default function CompletionProgressTab() {
  const { can } = useAuthStore();
  const [runs, setRuns] = useState<CompletionRun[]>([]);
  const [cohorts, setCohorts] = useState<CohortOption[]>([]);
  const [programs, setPrograms] = useState<ProgramOption[]>([]);
  const [years, setYears] = useState<AcademicYearOption[]>([]);

  // Filters
  const [cohortId, setCohortId] = useState("");
  const [programId, setProgramId] = useState("");

  // Loading
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");

  // Selected Run for Inline Drill-down
  const [selectedRunId, setSelectedRunId] = useState<string | null>(null);
  const [students, setStudents] = useState<CompletionStudentResult[]>([]);
  const [studentsLoading, setStudentsLoading] = useState(false);
  const [studentStatus, setStudentStatus] = useState("");
  const [studentSearch, setStudentSearch] = useState("");

  // Student requirement tree modal
  const [selectedStudent, setSelectedStudent] = useState<CompletionStudentDetail | null>(null);
  const [studentLoading, setStudentLoading] = useState(false);

  // New assessment run modal
  const [showRunModal, setShowRunModal] = useState(false);
  const [runForm, setRunForm] = useState({ cohortId: "", programId: "", yearId: "", termId: "" });
  const [preview, setPreview] = useState<CompletionPreview | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [runLoading, setRunLoading] = useState(false);

  const loadCatalogs = useCallback(async () => {
    const [cohortResponse, programResponse, yearResponse] = await Promise.all([
      apiFetch("/api/v1/cohorts?pageSize=100"),
      apiFetch("/api/v1/training-programs?pageSize=100"),
      apiFetch("/api/v1/academic-years?pageSize=100"),
    ]);
    if (cohortResponse.ok) setCohorts(((await cohortResponse.json()) as ListResponse<CohortOption>).items || []);
    if (programResponse.ok) setPrograms(((await programResponse.json()) as ListResponse<ProgramOption>).items || []);
    if (yearResponse.ok) setYears(((await yearResponse.json()) as ListResponse<AcademicYearOption>).items || []);
  }, []);

  const loadRuns = useCallback(
    async (quiet = false) => {
      if (quiet) setRefreshing(true);
      else setLoading(true);
      setError("");
      try {
        const query = new URLSearchParams({ page: "1", pageSize: "100", evaluationMode: "standard" });
        if (cohortId) query.set("cohortId", cohortId);
        if (programId) query.set("trainingProgramId", programId);

        const response = await apiFetch(`/api/v1/training-progress/completion-runs?${query.toString()}`);
        if (!response.ok) throw new Error(await responseError(response, "Không thể tải các đợt đánh giá hoàn thành."));
        const data = (await response.json()) as ListResponse<CompletionRun>;
        const fetchedRuns = data.items || [];
        setRuns(fetchedRuns);
      } catch (cause) {
        setError(cause instanceof Error ? cause.message : "Không thể tải các đợt đánh giá hoàn thành.");
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [cohortId, programId]
  );

  useEffect(() => {
    const timeout = window.setTimeout(() => {
      void loadCatalogs().catch(() => setError("Không thể tải danh mục đào tạo."));
    }, 0);
    return () => window.clearTimeout(timeout);
  }, [loadCatalogs]);

  useEffect(() => {
    const timeout = window.setTimeout(() => void loadRuns(), 0);
    return () => window.clearTimeout(timeout);
  }, [loadRuns]);

  const effectiveSelectedRunId = selectedRunId && runs.some((run) => run.id === selectedRunId)
    ? selectedRunId
    : runs[0]?.id || null;

  const activeRun = useMemo(() => {
    return runs.find((run) => run.id === effectiveSelectedRunId) || null;
  }, [effectiveSelectedRunId, runs]);

  // Load students for active run
  const loadStudentsForRun = useCallback(async (runId: string) => {
    setStudentsLoading(true);
    setStudents([]);
    setStudentStatus("");
    setStudentSearch("");
    try {
      const response = await apiFetch(`/api/v1/training-progress/completion-runs/${runId}/students?page=1&pageSize=500`);
      if (!response.ok) throw new Error(await responseError(response, "Không thể tải danh sách sinh viên."));
      const data = (await response.json()) as ListResponse<CompletionStudentResult>;
      let allStudents = data.items || [];
      const total = data.total ?? allStudents.length;

      // If there are more students beyond the first page (or backend pageSize was capped)
      if (total > allStudents.length) {
        const pageSize = data.pageSize || allStudents.length || 100;
        const totalPages = Math.ceil(total / pageSize);
        const pagePromises = [];
        for (let p = 2; p <= totalPages; p++) {
          pagePromises.push(
            apiFetch(`/api/v1/training-progress/completion-runs/${runId}/students?page=${p}&pageSize=${pageSize}`)
              .then(async (res) => {
                if (!res.ok) return [];
                const pageData = (await res.json()) as ListResponse<CompletionStudentResult>;
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
      setStudents(allStudents);
    } catch (cause) {
      toast.error(cause instanceof Error ? cause.message : "Không thể tải danh sách sinh viên.");
    } finally {
      setStudentsLoading(false);
    }
  }, []);

  useEffect(() => {
    const timeout = window.setTimeout(() => {
      if (activeRun?.id) void loadStudentsForRun(activeRun.id);
      else {
        setStudents([]);
        setStudentsLoading(false);
      }
    }, 0);
    return () => window.clearTimeout(timeout);
  }, [activeRun, loadStudentsForRun]);

  // Student requirement tree modal
  const openStudent = async (studentId: string) => {
    if (!activeRun) return;
    setStudentLoading(true);
    try {
      const response = await apiFetch(
        `/api/v1/training-progress/completion-runs/${activeRun.id}/students/${studentId}`
      );
      if (!response.ok) throw new Error(await responseError(response, "Không thể tải cây yêu cầu của sinh viên."));
      setSelectedStudent((await response.json()) as CompletionStudentDetail);
    } catch (cause) {
      toast.error(cause instanceof Error ? cause.message : "Không thể tải cây yêu cầu của sinh viên.");
    } finally {
      setStudentLoading(false);
    }
  };

  // Create Modal helpers
  const openCreateModal = () => {
    const defaultYear = years.find((year) => year.isCurrent) || years[0];
    const defaultTerm = defaultYear?.terms.find((term) => term.isCurrent) || defaultYear?.terms[0];
    setRunForm({
      cohortId: cohorts[0]?.id || "",
      programId: programs[0]?.id || "",
      yearId: defaultYear?.id || "",
      termId: defaultTerm?.id || "",
    });
    setPreview(null);
    setShowRunModal(true);
  };

  const terms = years.find((year) => year.id === runForm.yearId)?.terms || [];

  const requestPreview = async () => {
    if (!runForm.cohortId || !runForm.programId || !runForm.termId) return;
    setPreviewLoading(true);
    setPreview(null);
    try {
      const response = await apiFetch("/api/v1/training-progress/completion-runs/preview", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          cohortId: runForm.cohortId,
          trainingProgramId: runForm.programId,
          assessmentAcademicTermId: runForm.termId,
          evaluationMode: "standard",
        }),
      });
      if (!response.ok) throw new Error(await responseError(response, "Không thể kiểm tra dữ liệu trước khi chạy."));
      setPreview((await response.json()) as CompletionPreview);
    } catch (cause) {
      toast.error(cause instanceof Error ? cause.message : "Không thể kiểm tra dữ liệu trước khi chạy.");
    } finally {
      setPreviewLoading(false);
    }
  };

  const createRun = async () => {
    if (!preview?.canRun) return;
    setRunLoading(true);
    try {
      const response = await apiFetch("/api/v1/training-progress/completion-runs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          cohortId: runForm.cohortId,
          trainingProgramId: runForm.programId,
          assessmentAcademicTermId: runForm.termId,
          evaluationMode: "standard",
        }),
      });
      if (!response.ok) throw new Error(await responseError(response, "Không thể chạy đánh giá hoàn thành."));
      const createdRun = (await response.json().catch(() => null)) as CompletionRun | null;
      toast.success("Đã hoàn tất đánh giá yêu cầu học phần CTĐT.");
      setShowRunModal(false);
      await loadRuns(true);
      if (createdRun?.id) {
        setSelectedRunId(createdRun.id);
      }
    } catch (cause) {
      toast.error(cause instanceof Error ? cause.message : "Không thể chạy đánh giá hoàn thành.");
    } finally {
      setRunLoading(false);
    }
  };

  // Filtered students for inline drill-down
  const visibleStudents = useMemo(() => {
    return students.filter((student) => {
      const matchStatus = !studentStatus ||
        (studentStatus === "pending_result"
          ? student.scheduleStatus === "pending_result"
          : student.programCompletionStatus === studentStatus);
      const searchNormalized = studentSearch.trim().toLowerCase();
      const matchSearch =
        !searchNormalized ||
        student.studentName.toLowerCase().includes(searchNormalized) ||
        student.studentId.toLowerCase().includes(searchNormalized) ||
        (student.classId && student.classId.toLowerCase().includes(searchNormalized));
      return matchStatus && matchSearch;
    });
  }, [students, studentStatus, studentSearch]);

  const studentCounts = useMemo(() => {
    if (activeRun) {
      return {
        total: activeRun.totalStudents,
        completed: activeRun.completedStudents,
        incomplete: activeRun.incompleteStudents,
        pending: activeRun.pendingResultStudents || 0,
        review: activeRun.cannotDetermineStudents || 0,
      };
    }
    return {
      total: students.length,
      completed: students.filter((s) => s.programCompletionStatus === "completed").length,
      incomplete: students.filter((s) => s.programCompletionStatus === "incomplete").length,
      pending: students.filter((s) => s.scheduleStatus === "pending_result").length,
      review: students.filter((s) => s.programCompletionStatus === "cannot_determine").length,
    };
  }, [activeRun, students]);

  return (
    <div className="space-y-6">
      {/* Top Filter Bar */}
      <div className="flex flex-col gap-3 rounded-2xl border border-slate-200/80 bg-white p-4 sm:flex-row sm:items-center sm:justify-between shadow-xs">
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-2">
            <span className="text-xs font-bold text-slate-700 whitespace-nowrap">Khóa tuyển sinh:</span>
            <div className="relative">
              <select
                value={cohortId}
                onChange={(e) => setCohortId(e.target.value)}
                className="h-9.5 rounded-xl border border-slate-200 bg-slate-50/70 pr-8 pl-3 text-xs font-bold text-slate-900 outline-none focus:border-lime-600 focus:bg-white focus:ring-2 focus:ring-lime-100"
              >
                <option value="">Tất cả các khóa</option>
                {cohorts.map((cohort) => (
                  <option key={cohort.id} value={cohort.id}>
                    Khóa {cohort.cohortCode} {cohort.cohortName ? `(${cohort.cohortName})` : ""}
                  </option>
                ))}
              </select>
              <ChevronDown size={14} className="pointer-events-none absolute top-3 right-2.5 text-slate-400" />
            </div>
          </div>

          <div className="flex items-center gap-2">
            <span className="text-xs font-bold text-slate-700 whitespace-nowrap">Chương trình:</span>
            <div className="relative">
              <select
                value={programId}
                onChange={(e) => setProgramId(e.target.value)}
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

        <div className="flex items-center gap-2 self-end sm:self-auto">
          <button
            type="button"
            onClick={() => void loadRuns(true)}
            disabled={refreshing}
            className="inline-flex h-9 items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 text-xs font-semibold text-slate-700 transition hover:bg-slate-50 disabled:opacity-50 shadow-2xs"
          >
            <RefreshCw size={14} className={refreshing ? "animate-spin text-lime-600" : ""} />
            Làm mới
          </button>

          {can("progress.calculate") && (
            <button
              type="button"
              onClick={openCreateModal}
              className="inline-flex h-9 items-center gap-1.5 rounded-xl bg-[var(--color-primary)] px-3.5 text-xs font-bold text-slate-950 transition hover:brightness-95 active:translate-y-px shadow-xs"
            >
              <Play size={13} className="fill-slate-950" />
              Tạo đợt đánh giá mới
            </button>
          )}
        </div>
      </div>

      {/* Error state */}
      {error && (
        <div className="flex items-center justify-between gap-4 rounded-2xl border border-red-200 bg-red-50 p-4 text-xs text-red-800">
          <span className="flex items-center gap-2 font-medium">
            <CircleAlert size={16} />
            {error}
          </span>
          <button type="button" onClick={() => void loadRuns()} className="font-bold underline underline-offset-2">
            Thử lại
          </button>
        </div>
      )}

      {/* Horizontal Run/Cohort Segmented Bar */}
      {loading ? (
        <div className="h-14 animate-pulse rounded-2xl border border-slate-200 bg-white p-3 shadow-xs" />
      ) : runs.length === 0 ? (
        <div className="rounded-2xl border border-slate-200 bg-white p-12 text-center shadow-xs">
          <Inbox size={40} className="mx-auto text-slate-300" />
          <h3 className="mt-3 text-sm font-bold text-slate-700">Chưa có đợt đánh giá nào phù hợp</h3>
          <p className="mt-1 text-xs text-slate-400">
            Nhấn nút &ldquo;Tạo đợt đánh giá mới&rdquo; ở góc trên bên phải để bắt đầu rà soát toàn khóa.
          </p>
        </div>
      ) : (
        <div className="rounded-2xl border border-slate-200/90 bg-white p-3.5 shadow-xs space-y-2">
          <div className="flex items-center justify-between px-1">
            <span className="text-xs font-bold uppercase tracking-wider text-slate-500">
              Chọn Đợt đánh giá / Khóa học:
            </span>
            <span className="text-[11px] font-medium text-slate-400">
              {runs.length} đợt rà soát
            </span>
          </div>

          {/* Horizontal scrollable rail */}
          <div className="flex items-center gap-2 overflow-x-auto pb-1 no-scrollbar">
            {runs.map((run) => {
              const isSelected = effectiveSelectedRunId === run.id;
              const totalStud = run.totalStudents;
              const completedStud = run.completedStudents;
              const completeRate = totalStud ? Math.round((completedStud / totalStud) * 100) : 0;

              return (
                <button
                  key={run.id}
                  type="button"
                  onClick={() => setSelectedRunId(run.id)}
                  className={`group flex shrink-0 items-center gap-2.5 rounded-xl border px-3 py-2 text-left transition-all ${
                    isSelected
                      ? "border-blue-500 bg-blue-50/50 shadow-xs ring-2 ring-blue-500/80"
                      : "border-slate-200/80 bg-slate-50/70 hover:border-slate-300 hover:bg-white text-slate-700"
                  }`}
                >
                  <span
                    className={`inline-flex rounded-lg px-2 py-0.5 font-mono text-xs font-bold shadow-2xs ${
                      isSelected ? "bg-slate-900 text-white" : "bg-slate-200 text-slate-800"
                    }`}
                  >
                    Khóa {run.cohortCode || "?"}
                  </span>

                  <span className="text-xs font-bold text-slate-900">
                    {run.programCode || run.programName || "CTĐT"}
                  </span>

                  <span className="text-slate-300">•</span>

                  <div className="flex items-center gap-2 text-xs">
                    <span className="font-mono font-bold text-slate-800">{totalStud} SV</span>
                    <span
                      className={`inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[10px] font-semibold ${
                        completeRate >= 70
                          ? "bg-emerald-100/70 text-emerald-800"
                          : "bg-amber-100/70 text-amber-800"
                      }`}
                    >
                      <span
                        className={`h-1.5 w-1.5 rounded-full ${
                          completeRate >= 70 ? "bg-emerald-500" : "bg-amber-500"
                        }`}
                      />
                      {completeRate}% hoàn thành
                    </span>
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* Inline Drill-down: Student List for Selected Run (Immediate, Full-Width) */}
      {activeRun && (
        <div className="rounded-2xl border border-slate-200/90 bg-white p-5 sm:p-6 shadow-sm space-y-5">
          {/* Header with integrated stats */}
          <div className="flex flex-col gap-3 border-b border-slate-100 pb-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <span className="inline-flex rounded-md bg-slate-900 px-2.5 py-0.5 font-mono text-xs font-bold text-white">
                  Khóa {activeRun.cohortCode}
                </span>
                <h3 className="text-base font-bold text-slate-900">
                  Tiến độ tích lũy CTĐT • {activeRun.programName}
                </h3>
                <span className="rounded-md border border-slate-200 bg-slate-50 px-2 py-0.5 font-mono text-xs font-bold text-slate-700">
                  {activeRun.assessmentAcademicYear} ({activeRun.assessmentTermCode})
                </span>
              </div>
              <p className="mt-1 text-xs text-slate-500">
                Đánh giá hoàn thành CTĐT tính đến mốc đánh giá hiện tại
              </p>
            </div>

            {/* Compact KPI Pills in header */}
            <div className="flex flex-wrap items-center gap-1.5">
              <div className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-slate-50 px-3 py-1 text-xs font-medium text-slate-700">
                <span className="text-slate-500 font-normal">Tổng:</span>
                <strong className="font-mono font-bold text-slate-900">{studentCounts.total}</strong> SV
              </div>
              <div className="inline-flex items-center gap-1.5 rounded-xl border border-emerald-200 bg-emerald-50/70 px-3 py-1 text-xs font-medium text-emerald-800">
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
                <span>Hoàn thành học phần:</span>
                <strong className="font-mono font-bold text-emerald-900">{studentCounts.completed}</strong>
                <span className="text-[11px] opacity-75">
                  ({studentCounts.total ? Math.round((studentCounts.completed / studentCounts.total) * 100) : 0}%)
                </span>
              </div>
              <div className="inline-flex items-center gap-1.5 rounded-xl border border-red-200 bg-red-50/70 px-3 py-1 text-xs font-medium text-red-800">
                <span className="h-1.5 w-1.5 rounded-full bg-red-500" />
                <span>Nợ môn:</span>
                <strong className="font-mono font-bold text-red-900">{studentCounts.incomplete}</strong>
              </div>
              {studentCounts.pending > 0 && (
                <div className="inline-flex items-center gap-1.5 rounded-xl border border-amber-200 bg-amber-50/70 px-3 py-1 text-xs font-medium text-amber-800">
                  <span className="h-1.5 w-1.5 rounded-full bg-amber-500" />
                  <span>Chờ điểm:</span>
                  <strong className="font-mono font-bold text-amber-900">{studentCounts.pending}</strong>
                </div>
              )}
              {studentCounts.review > 0 && (
                <div className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-slate-100 px-3 py-1 text-xs font-medium text-slate-700">
                  <span className="h-1.5 w-1.5 rounded-full bg-slate-400" />
                  <span>Cần đối soát:</span>
                  <strong className="font-mono font-bold text-slate-900">{studentCounts.review}</strong>
                </div>
              )}
            </div>
          </div>

          <div className="space-y-4">

            {/* Scope explanation */}
            <div className="flex items-start gap-2.5 rounded-xl border border-blue-200 bg-blue-50/80 p-3.5 text-xs text-blue-900">
              <Info size={16} className="mt-0.5 shrink-0 text-blue-600" />
              <span>
                <strong>Phạm vi:</strong> Trạng thái hoàn thành chỉ đối chiếu học phần và tín chỉ trong CTĐT đến mốc đánh giá. GPA được hiển thị để tham khảo, chưa tham gia kết luận ở màn hình này. Điều kiện tốt nghiệp đầy đủ nằm tại mục &ldquo;Dự kiến tốt nghiệp&rdquo;.
              </span>
            </div>

            {/* Search and Filters */}
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
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
                    className="absolute top-2.5 right-3 text-slate-400 hover:text-slate-600"
                  >
                    <X size={15} />
                  </button>
                )}
              </div>

              {/* Status tabs */}
              <div className="flex flex-wrap items-center gap-1.5">
                <button
                  type="button"
                  onClick={() => setStudentStatus("")}
                  className={`rounded-xl px-3 py-1.5 text-xs font-semibold transition ${
                    !studentStatus
                      ? "bg-slate-900 text-white shadow-xs"
                      : "border border-slate-200 bg-white text-slate-600 hover:bg-slate-50"
                  }`}
                >
                  Tất cả ({studentCounts.total})
                </button>

                <button
                  type="button"
                  onClick={() => setStudentStatus("completed")}
                  className={`inline-flex items-center gap-1 rounded-xl px-3 py-1.5 text-xs font-semibold transition ${
                    studentStatus === "completed"
                      ? "bg-emerald-600 text-white shadow-xs"
                      : "border border-emerald-200 bg-emerald-50/60 text-emerald-800 hover:bg-emerald-100"
                  }`}
                >
                  <CheckCircle2 size={12} />
                  Hoàn thành ({studentCounts.completed})
                </button>

                <button
                  type="button"
                  onClick={() => setStudentStatus("incomplete")}
                  className={`inline-flex items-center gap-1 rounded-xl px-3 py-1.5 text-xs font-semibold transition ${
                    studentStatus === "incomplete"
                      ? "bg-red-600 text-white shadow-xs"
                      : "border border-red-200 bg-red-50/60 text-red-800 hover:bg-red-100"
                  }`}
                >
                  <XCircle size={12} />
                  Chưa hoàn thành ({studentCounts.incomplete})
                </button>
                {studentCounts.pending > 0 && (
                  <button
                    type="button"
                    onClick={() => setStudentStatus("pending_result")}
                    className={`inline-flex items-center gap-1 rounded-xl px-3 py-1.5 text-xs font-semibold transition ${
                      studentStatus === "pending_result"
                        ? "bg-amber-600 text-white shadow-xs"
                        : "border border-amber-200 bg-amber-50/60 text-amber-800 hover:bg-amber-100"
                    }`}
                  >
                    <CircleAlert size={12} /> Chờ điểm ({studentCounts.pending})
                  </button>
                )}
                {studentCounts.review > 0 && (
                  <button
                    type="button"
                    onClick={() => setStudentStatus("cannot_determine")}
                    className={`inline-flex items-center gap-1 rounded-xl px-3 py-1.5 text-xs font-semibold transition ${
                      studentStatus === "cannot_determine"
                        ? "bg-slate-700 text-white shadow-xs"
                        : "border border-slate-200 bg-slate-100 text-slate-700 hover:bg-slate-200"
                    }`}
                  >
                    <AlertTriangle size={12} /> Đối soát ({studentCounts.review})
                  </button>
                )}
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
                <table className="w-full min-w-[820px] text-left text-xs">
                  <thead className="sticky top-0 bg-slate-50 text-[11px] font-bold uppercase tracking-wider text-slate-500 shadow-2xs">
                    <tr>
                      <th className="px-4 py-3">Sinh viên</th>
                      <th className="px-4 py-3">Hoàn thành CTĐT</th>
                      <th className="px-4 py-3">Điểm GPA tích lũy</th>
                      <th className="px-4 py-3">Tiến độ tích lũy học phần</th>
                      <th className="px-4 py-3 text-right">Chi tiết môn học</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {studentsLoading ? (
                      <tr>
                        <td colSpan={5} className="px-4 py-16 text-center text-slate-500">
                          <LoaderCircle size={20} className="mr-2 inline animate-spin text-lime-600" />
                          Đang tải danh sách sinh viên...
                        </td>
                      </tr>
                    ) : visibleStudents.length ? (
                      visibleStudents.map((student) => {
                        const meta =
                          completionStatus[student.programCompletionStatus as keyof typeof completionStatus] ||
                          completionStatus.cannot_determine;

                        const hasBlockers =
                          student.missingMandatoryCourses > 0 ||
                          student.missingRequiredElectiveCourses > 0 ||
                          student.missingElectiveCredits > 0;

                        return (
                          <tr key={student.studentId} className="transition-colors hover:bg-slate-50/70">
                            {/* Student Info */}
                            <td className="px-4 py-3.5">
                              <p className="font-bold text-slate-900">{student.studentName}</p>
                              <div className="mt-0.5 flex items-center gap-1.5 font-mono text-[11px] text-slate-500">
                                <span>{student.studentId}</span>
                                {student.classId && (
                                  <>
                                    <span>•</span>
                                    <span>Lớp: {student.classId}</span>
                                  </>
                                )}
                              </div>
                            </td>

                            {/* Conclusion */}
                            <td className="px-4 py-3.5">
                              <span
                                className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-[11px] font-bold ${meta.badgeClass}`}
                              >
                                <span className={`h-1.5 w-1.5 rounded-full ${meta.dotClass}`} />
                                {meta.label}
                              </span>
                              {student.pendingResultCourses > 0 && (
                                <p className="mt-1 text-[11px] font-semibold text-amber-700">
                                  ⏳ {student.pendingResultCourses} môn chờ điểm thi
                                </p>
                              )}
                            </td>

                            {/* GPA */}
                            <td className="px-4 py-3.5 font-mono text-slate-800">
                              <p className="font-bold">
                                Hệ 4:{" "}
                                <span
                                  className={
                                    student.cumulativeGpa4 == null
                                      ? "text-slate-400"
                                      : student.cumulativeGpa4 >= 2.0
                                        ? "text-emerald-700"
                                        : "text-amber-700"
                                  }
                                >
                                  {student.cumulativeGpa4 == null ? "Chưa có" : student.cumulativeGpa4.toFixed(2)}
                                </span>
                              </p>
                              <p className="text-[11px] text-slate-400">
                                Hệ 10: {student.cumulativeGpa10 == null ? "Chưa có" : student.cumulativeGpa10.toFixed(2)}
                              </p>
                            </td>

                            {/* Plans progress */}
                            <td className="px-4 py-3.5 text-slate-700">
                              <p className="font-semibold text-slate-900">
                                Đạt {student.allPlansPassed} / {student.allPlansTotal} học kỳ
                              </p>
                              {hasBlockers ? (
                                <p className="mt-0.5 text-[11px] font-medium text-red-700">
                                  Nợ {student.missingMandatoryCourses} môn bắt buộc, {student.missingRequiredElectiveCourses} môn tự chọn bắt buộc; thiếu{" "}
                                  {student.missingElectiveCredits} TC tự chọn
                                </p>
                              ) : (
                                <p className="mt-0.5 text-[11px] text-emerald-700">Đã tích lũy đủ các môn</p>
                              )}
                            </td>

                            {/* Action */}
                            <td className="px-4 py-3.5 text-right">
                              <button
                                type="button"
                                onClick={() => void openStudent(student.studentId)}
                                className="inline-flex h-8 items-center gap-1.5 rounded-xl border border-blue-200 bg-blue-50/60 px-3 text-xs font-bold text-blue-700 transition hover:bg-blue-100 shadow-2xs"
                              >
                                <FileCheck2 size={14} />
                                Cây yêu cầu
                              </button>
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
        </div>
      )}

      {/* Modal: Create Assessment Run */}
      <Modal
        isOpen={showRunModal}
        onClose={() => !runLoading && setShowRunModal(false)}
        title="Tạo Đợt Đánh giá Hoàn thành CTĐT Mới"
        description="Chọn Khóa và Mốc thời gian để hệ thống tổng hợp toàn bộ kết quả học tập của sinh viên."
        maxWidth="2xl"
      >
        <div className="space-y-5">
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label htmlFor="new-completion-cohort" className="mb-1.5 block text-xs font-semibold text-slate-700">
                1. Khóa tuyển sinh
              </label>
              <select
                id="new-completion-cohort"
                value={runForm.cohortId}
                onChange={(event) => {
                  setRunForm((value) => ({ ...value, cohortId: event.target.value }));
                  setPreview(null);
                }}
                className="h-10 w-full rounded-xl border border-slate-200 bg-white px-3 text-xs font-semibold text-slate-800 outline-none focus:border-lime-600 focus:ring-2 focus:ring-lime-100"
              >
                <option value="">Chọn khóa tuyển sinh</option>
                {cohorts.map((cohort) => (
                  <option key={cohort.id} value={cohort.id}>
                    Khóa {cohort.cohortCode} - {cohort.cohortName}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label htmlFor="new-completion-program" className="mb-1.5 block text-xs font-semibold text-slate-700">
                2. Chương trình đào tạo
              </label>
              <select
                id="new-completion-program"
                value={runForm.programId}
                onChange={(event) => {
                  setRunForm((value) => ({ ...value, programId: event.target.value }));
                  setPreview(null);
                }}
                className="h-10 w-full rounded-xl border border-slate-200 bg-white px-3 text-xs font-semibold text-slate-800 outline-none focus:border-lime-600 focus:ring-2 focus:ring-lime-100"
              >
                <option value="">Chọn chương trình đào tạo</option>
                {programs.map((program) => (
                  <option key={program.id} value={program.id}>
                    {program.programCode} - {program.programName}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label htmlFor="new-completion-year" className="mb-1.5 block text-xs font-semibold text-slate-700">
                3. Năm học đánh giá
              </label>
              <select
                id="new-completion-year"
                value={runForm.yearId}
                onChange={(event) => {
                  const year = years.find((item) => item.id === event.target.value);
                  setRunForm((value) => ({
                    ...value,
                    yearId: event.target.value,
                    termId: year?.terms[0]?.id || "",
                  }));
                  setPreview(null);
                }}
                className="h-10 w-full rounded-xl border border-slate-200 bg-white px-3 text-xs font-semibold text-slate-800 outline-none focus:border-lime-600 focus:ring-2 focus:ring-lime-100"
              >
                <option value="">Chọn năm học</option>
                {years.map((year) => (
                  <option key={year.id} value={year.id}>
                    Năm học {year.yearCode}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label htmlFor="new-completion-term" className="mb-1.5 block text-xs font-semibold text-slate-700">
                4. Học kỳ đánh giá
              </label>
              <select
                id="new-completion-term"
                value={runForm.termId}
                onChange={(event) => {
                  setRunForm((value) => ({ ...value, termId: event.target.value }));
                  setPreview(null);
                }}
                className="h-10 w-full rounded-xl border border-slate-200 bg-white px-3 text-xs font-semibold text-slate-800 outline-none focus:border-lime-600 focus:ring-2 focus:ring-lime-100"
              >
                <option value="">Chọn học kỳ</option>
                {terms.map((term) => (
                  <option key={term.id} value={term.id}>
                    {term.termName || term.termCode}
                    {term.isSummer ? " (kỳ hè phụ)" : ""}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Preview panel */}
          <div className="rounded-2xl border border-slate-200 bg-slate-50/70 p-4">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-xs font-bold text-slate-900">Kiểm tra tính sẵn sàng của dữ liệu</p>
                <p className="mt-0.5 text-[11px] text-slate-500">
                  Rà soát số lượng sinh viên và kế hoạch chuẩn trước khi tạo đợt đánh giá.
                </p>
              </div>
              <button
                type="button"
                onClick={() => void requestPreview()}
                disabled={previewLoading || !runForm.cohortId || !runForm.programId || !runForm.termId}
                className="inline-flex h-9 shrink-0 items-center gap-1.5 rounded-xl border border-slate-300 bg-white px-3.5 text-xs font-bold text-slate-700 transition hover:bg-slate-50 disabled:opacity-50 shadow-2xs"
              >
                {previewLoading ? <LoaderCircle size={14} className="animate-spin text-lime-600" /> : <Sparkles size={14} className="text-amber-500" />}
                Kiểm tra dữ liệu
              </button>
            </div>

            {preview && <PreviewPanel preview={preview} />}
          </div>

          <div className="flex justify-end gap-2.5 border-t border-slate-100 pt-4">
            <button
              type="button"
              onClick={() => setShowRunModal(false)}
              disabled={runLoading}
              className="rounded-xl px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100"
            >
              Hủy bỏ
            </button>
            <button
              type="button"
              onClick={() => void createRun()}
              disabled={runLoading || !preview?.canRun}
              className="inline-flex items-center gap-2 rounded-xl bg-[var(--color-primary)] px-5 py-2 text-xs font-bold text-slate-950 transition hover:brightness-95 disabled:cursor-not-allowed disabled:opacity-40 shadow-xs"
            >
              {runLoading ? <LoaderCircle size={15} className="animate-spin" /> : <Play size={15} className="fill-slate-950" />}
              Bắt đầu đánh giá
            </button>
          </div>
        </div>
      </Modal>

      {/* Modal: Student Training Progress Detail */}
      <Modal
        isOpen={Boolean(selectedStudent) || studentLoading}
        onClose={() => setSelectedStudent(null)}
        title={selectedStudent ? `Tiến độ đào tạo: ${selectedStudent.studentName}` : "Tiến độ đào tạo"}
        description={
          selectedStudent
            ? `MSSV: ${selectedStudent.studentId} • Lớp: ${selectedStudent.className || selectedStudent.classId || "Chưa có"} • CTĐT: ${selectedStudent.programCode || "CNTT"}`
            : "Đang tải dữ liệu..."
        }
        maxWidth="4xl"
      >
        {studentLoading && !selectedStudent ? (
          <div className="flex min-h-48 items-center justify-center gap-2 text-sm text-slate-500">
            <LoaderCircle size={20} className="animate-spin text-lime-600" />
            Đang tổng hợp tiến độ đào tạo sinh viên...
          </div>
        ) : (
          selectedStudent && (
            <div className="py-2">
              <StudentProgressDetail
                studentId={selectedStudent.studentUuid || selectedStudent.studentId}
                showStudentHeader={false}
              />
            </div>
          )
        )}
      </Modal>
    </div>
  );
}

function PreviewPanel({ preview }: { preview: CompletionPreview }) {
  return (
    <div className="mt-4 space-y-3 border-t border-slate-200 pt-4">
      {preview.summary && (
        <div className="grid grid-cols-3 gap-2">
          <div className="rounded-xl border border-slate-200 bg-white p-2.5 text-center">
            <div className="font-mono text-base font-bold text-slate-900">{preview.summary.studentCount}</div>
            <div className="text-[10px] text-slate-500">Sinh viên sẽ được đánh giá</div>
          </div>
          <div className="rounded-xl border border-slate-200 bg-white p-2.5 text-center">
            <div className="font-mono text-base font-bold text-slate-900">{preview.summary.duePlanCount}</div>
            <div className="text-[10px] text-slate-500">Kế hoạch kỳ đã đến hạn</div>
          </div>
          <div className="rounded-xl border border-slate-200 bg-white p-2.5 text-center">
            <div className="font-mono text-base font-bold text-slate-900">{preview.summary.planCount}</div>
            <div className="text-[10px] text-slate-500">Tổng số kế hoạch chuẩn</div>
          </div>
        </div>
      )}

      {preview.canRun ? (
        <p className="flex items-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 p-2.5 text-xs font-bold text-emerald-800">
          <CheckCircle2 size={16} /> Dữ liệu đã sẵn sàng. Bạn có thể bắt đầu đánh giá.
        </p>
      ) : (
        <p className="flex items-center gap-2 rounded-xl border border-red-200 bg-red-50 p-2.5 text-xs font-bold text-red-800">
          <XCircle size={16} /> Chưa thể bắt đầu. Vui lòng kiểm tra các cảnh báo bên dưới.
        </p>
      )}

      {preview.blockers.map((item) => (
        <div key={item.code} className="rounded-xl border border-red-200 bg-red-50 p-3 text-xs text-red-800">
          <strong>Lỗi {item.code}:</strong> {item.message}
        </div>
      ))}

      {preview.warnings.map((item) => (
        <div key={item.code} className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800">
          <strong>Cảnh báo {item.code}:</strong> {item.message}
          {item.details?.length ? (
            <ul className="mt-1 list-disc pl-4 text-[11px]">
              {item.details.map((detail) => (
                <li key={detail}>{detail}</li>
              ))}
            </ul>
          ) : null}
        </div>
      ))}
    </div>
  );
}

function RequirementTree({ student }: { student: CompletionStudentDetail }) {
  const isComplete = student.programCompletionStatus === "completed";
  const needsReview = student.programCompletionStatus === "cannot_determine";
  const hasPendingResults = student.pendingResultCourses > 0;

  return (
    <div className="space-y-5">
      {/* Top Banner Status */}
      <div
        className={`flex items-start gap-3 rounded-2xl border p-4 text-xs leading-5 ${
          isComplete
            ? "border-emerald-200 bg-emerald-50 text-emerald-900"
            : needsReview
              ? "border-slate-200 bg-slate-100 text-slate-800"
              : "border-amber-200 bg-amber-50 text-amber-900"
        }`}
      >
        {isComplete ? (
          <CheckCircle2 size={20} className="mt-0.5 shrink-0 text-emerald-600" />
        ) : (
          <AlertTriangle size={20} className={`mt-0.5 shrink-0 ${needsReview ? "text-slate-500" : "text-amber-600"}`} />
        )}
        <div>
          <strong className="text-sm font-bold">
            {isComplete
              ? "Sinh viên đã hoàn thành yêu cầu học phần đến mốc đánh giá"
              : needsReview
                ? "Chưa thể kết luận do dữ liệu hoặc cấu trúc CTĐT cần đối soát"
                : hasPendingResults
                  ? "Sinh viên còn học phần đang chờ kết quả"
                  : "Sinh viên chưa hoàn thành các học phần theo CTĐT"}
          </strong>
          <p className="mt-0.5">
            {isComplete
              ? "Kết luận này chỉ phản ánh học phần và tín chỉ, không thay thế kết quả xét tốt nghiệp."
              : needsReview
                ? student.dataErrorReason || "Vui lòng kiểm tra lại dữ liệu đầu vào của phiên đánh giá."
                : `Hiện tại còn thiếu ${student.missingMandatoryCourses} môn bắt buộc, ${student.missingRequiredElectiveCourses} môn tự chọn bắt buộc và ${student.missingElectiveCredits} tín chỉ tự chọn.`}
          </p>
        </div>
      </div>

      {/* Summary KPI */}
      <div className="grid gap-3 sm:grid-cols-4">
        <div className="rounded-2xl border border-slate-200 bg-white p-3.5 shadow-2xs">
          <span className="text-[11px] font-medium text-slate-500">Tiến độ theo học kỳ</span>
          <div className="mt-1 font-mono text-xl font-bold text-slate-900">
            {student.allPlansPassed} / {student.allPlansTotal} kỳ đạt
          </div>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-3.5 shadow-2xs">
          <span className="text-[11px] font-medium text-slate-500">Điểm GPA tích lũy</span>
          <div className="mt-1 font-mono text-xl font-bold text-slate-900">
            {student.cumulativeGpa4 != null ? student.cumulativeGpa4.toFixed(2) : "—"}{" "}
            <span className="text-xs font-normal text-slate-400">/ 4.0</span>
          </div>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-3.5 shadow-2xs">
          <span className="text-[11px] font-medium text-slate-500">Môn bắt buộc còn nợ</span>
          <div
            className={`mt-1 font-mono text-xl font-bold ${
              student.missingMandatoryCourses ? "text-red-700" : "text-emerald-700"
            }`}
          >
            {student.missingMandatoryCourses} môn
          </div>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-3.5 shadow-2xs">
          <span className="text-[11px] font-medium text-slate-500">TC tự chọn còn thiếu</span>
          <div
            className={`mt-1 font-mono text-xl font-bold ${
              student.missingElectiveCredits ? "text-amber-700" : "text-emerald-700"
            }`}
          >
            {student.missingElectiveCredits} TC
          </div>
        </div>
      </div>

      {/* Semesters list */}
      <div className="space-y-4">
        <h4 className="text-sm font-bold text-slate-900">Chi tiết theo từng Học kỳ lộ trình</h4>
        <div className="space-y-3">
          {student.plans.map((plan) => (
            <section key={plan.id} className="overflow-hidden rounded-2xl border border-slate-200">
              <header className="flex items-center justify-between bg-slate-50 px-4 py-3 border-b border-slate-100">
                <div className="flex items-center gap-2.5">
                  <span className="inline-flex rounded-lg bg-white border border-slate-200 px-2 py-0.5 font-mono text-xs font-bold text-slate-800">
                    Học kỳ {plan.curriculumSemesterNo}
                  </span>
                  <span className="text-xs text-slate-500">
                    Bản chuẩn v{plan.planVersion}
                    {plan.isDue ? " • Đã đến hạn" : " • Chưa đến hạn"}
                  </span>
                </div>
                <span
                  className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-[11px] font-bold ${
                    plan.isPass
                      ? "border-emerald-200 bg-emerald-50 text-emerald-800"
                      : "border-red-200 bg-red-50 text-red-800"
                  }`}
                >
                  {plan.isPass ? <CheckCircle2 size={13} /> : <XCircle size={13} />}
                  {plan.isPass ? "Đạt học kỳ này" : "Chưa hoàn thành"}
                </span>
              </header>

              <div className="divide-y divide-slate-100">
                {plan.courses.map((course) => (
                  <div
                    key={course.courseId}
                    className="grid items-center gap-2 px-4 py-3 text-xs sm:grid-cols-[minmax(0,1fr)_140px_140px] hover:bg-slate-50/60"
                  >
                    <div>
                      <p className="font-semibold text-slate-800">
                        {course.courseCode} - {course.courseName}
                      </p>
                      <p className="mt-0.5 text-[11px] text-slate-400">
                        {course.credits} tín chỉ •{" "}
                        <span className={course.requirementType === "mandatory" ? "text-blue-700 font-medium" : "text-purple-700 font-medium"}>
                          {course.requirementType === "mandatory" ? "Môn bắt buộc" : "Môn tự chọn"}
                        </span>
                      </p>
                    </div>

                    <div className="text-[11px] text-slate-500">
                      {course.evidenceAcademicYear ? (
                        <span>
                          Đạt ở {course.evidenceAcademicYear} ({course.evidenceTermCode})
                        </span>
                      ) : (
                        <span className="text-slate-400">Chưa có kết quả</span>
                      )}
                    </div>

                    <div className="text-right sm:text-left">
                      {course.pendingResult ? (
                        <span className="inline-flex items-center gap-1 text-amber-700 font-medium">
                          ⏳ Chờ điểm thi
                        </span>
                      ) : course.passed ? (
                        <span className="inline-flex items-center gap-1 text-emerald-700 font-bold">
                          <CheckCircle2 size={14} /> Đã tích lũy
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 text-red-700 font-bold">
                          <XCircle size={14} /> Chưa đạt / Nợ môn
                        </span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </section>
          ))}
        </div>
      </div>
    </div>
  );
}
