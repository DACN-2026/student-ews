"use client";

import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  Check,
  ChevronRight,
  CircleHelp,
  Download,
  FileCheck2,
  FileText,
  GraduationCap,
  Info,
  LoaderCircle,
  Play,
  RefreshCw,
  Search,
  ShieldAlert,
  X,
} from "lucide-react";
import { apiFetch } from "@/lib/api-client";
import Modal from "@/components/ui/Modal";
import ForecastDetail from "@/components/graduation/ForecastDetail";
import { toast } from "@/components/ui/Toast";
import { useAuthStore } from "@/stores/authStore";

const STATUS_META: Record<string, { label: string; short: string; tone: string; pillBg: string; textColor: string; icon: typeof Check }> = {
  EXPECTED_ELIGIBLE: {
    label: "Dự kiến đủ điều kiện",
    short: "Đủ điều kiện",
    tone: "bg-emerald-50 text-emerald-800 border-emerald-200",
    pillBg: "bg-emerald-100 text-emerald-800 border-emerald-300",
    textColor: "text-emerald-700",
    icon: Check,
  },
  PENDING_GRADE: {
    label: "Chưa xác nhận đạt",
    short: "Chưa xác nhận",
    tone: "bg-amber-50 text-amber-800 border-amber-200",
    pillBg: "bg-amber-100 text-amber-800 border-amber-300",
    textColor: "text-amber-700",
    icon: CircleHelp,
  },
  PENDING_REQUIREMENT: {
    label: "Chờ bổ sung điều kiện",
    short: "Chờ bổ sung",
    tone: "bg-sky-50 text-sky-800 border-sky-200",
    pillBg: "bg-sky-100 text-sky-800 border-sky-300",
    textColor: "text-sky-700",
    icon: CircleHelp,
  },
  NOT_ELIGIBLE: {
    label: "Chưa đủ điều kiện",
    short: "Chưa đủ",
    tone: "bg-rose-50 text-rose-800 border-rose-200",
    pillBg: "bg-rose-100 text-rose-800 border-rose-300",
    textColor: "text-rose-700",
    icon: X,
  },
  MANUAL_REVIEW: {
    label: "Cần đối soát chuyên môn",
    short: "Đối soát",
    tone: "bg-slate-100 text-slate-700 border-slate-200",
    pillBg: "bg-slate-200 text-slate-700 border-slate-300",
    textColor: "text-slate-600",
    icon: ShieldAlert,
  },
};

function statusMeta(status: string) {
  return STATUS_META[status] || STATUS_META.MANUAL_REVIEW;
}

function formatNumber(value: unknown, digits = 0) {
  if (value === null || value === undefined || value === "") return "—";
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed.toLocaleString("vi-VN", { maximumFractionDigits: digits, minimumFractionDigits: digits }) : "—";
}

function configuredThreshold(sourceSnapshot: ApiData, ruleCode: string, fallback: number | null) {
  const rules = Array.isArray(sourceSnapshot?.rules) ? sourceSnapshot.rules : [];
  const raw = rules.find((rule: ApiData) => rule.code === ruleCode)?.requiredValue;
  const value = raw == null ? NaN : Number(raw);
  return Number.isFinite(value) ? value : fallback;
}

function getStudentReasonSummary(student: ApiData): { text: string; tone: string; isOk: boolean } {
  if (student.finalStatus === "EXPECTED_ELIGIBLE") {
    return { text: "Đủ toàn bộ điều kiện tốt nghiệp", tone: "text-emerald-700 font-medium", isOk: true };
  }
  if (student.finalStatus === "PENDING_GRADE") {
    return { text: "Có điều kiện học phần chưa được xác nhận đạt", tone: "text-amber-700 font-medium", isOk: false };
  }
  if (student.finalStatus === "PENDING_REQUIREMENT") {
    return { text: "Chờ nộp / bổ sung chứng chỉ tốt nghiệp", tone: "text-sky-700 font-medium", isOk: false };
  }
  if (student.finalStatus === "MANUAL_REVIEW") {
    const missing = Array.isArray(student.reasons) ? student.reasons.find((item: ApiData) => item.result === "NOT_AVAILABLE") : null;
    return { text: missing?.message || "Chưa đủ dữ liệu để xác định", tone: "text-slate-600 font-medium", isOk: false };
  }

  const reasons = Array.isArray(student.reasons) ? student.reasons : [];
  const knownFailure = reasons.find((item: ApiData) => item.result === "FAIL" && item.code !== "PROGRAM_COMPLETION");
  if (knownFailure?.message) return { text: knownFailure.message, tone: "text-rose-700 font-medium", isOk: false };
  if (student.curriculumStatus === "NOT_PASSED") {
    return { text: "Thiếu học phần bắt buộc hoặc tín chỉ CTĐT", tone: "text-rose-700 font-medium", isOk: false };
  }
  if (student.foreignLanguageStatus === "NOT_PASSED") {
    return { text: "Chưa hoàn thành chuẩn Ngoại ngữ", tone: "text-rose-700 font-medium", isOk: false };
  }
  if (student.physicalEducationStatus === "NOT_PASSED") {
    return { text: "Chưa có chứng chỉ Giáo dục thể chất", tone: "text-rose-700 font-medium", isOk: false };
  }
  if (student.nationalDefenseStatus === "NOT_PASSED") {
    return { text: "Chưa có chứng chỉ GDQP & AN", tone: "text-rose-700 font-medium", isOk: false };
  }
  if (reasons.length > 0) {
    const firstReason = reasons[0];
    const text = typeof firstReason === "string" ? firstReason : String((firstReason as ApiData)?.message || (firstReason as ApiData)?.code || "Chưa đủ điều kiện");
    return { text, tone: "text-rose-700 font-medium", isOk: false };
  }
  return { text: "Chưa đủ điều kiện xét tốt nghiệp", tone: "text-rose-700 font-medium", isOk: false };
}

export default function GraduationForecastPage() {
  const { can } = useAuthStore();
  const [runs, setRuns] = useState<ApiData[]>([]);
  const [cohorts, setCohorts] = useState<ApiData[]>([]);
  const [programs, setPrograms] = useState<ApiData[]>([]);
  const [years, setYears] = useState<ApiData[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");

  // Selected batch
  const [selectedRun, setSelectedRun] = useState<ApiData | null>(null);

  // Student list in selected batch
  const [allStudents, setAllStudents] = useState<ApiData[]>([]);
  const [studentsLoading, setStudentsLoading] = useState(false);
  const [statusFilter, setStatusFilter] = useState("all");
  const [keyword, setKeyword] = useState("");

  // Filter batches by cohort
  const [cohortFilter, setCohortFilter] = useState<string>("all");

  // Student Detail Modal
  const [selectedStudent, setSelectedStudent] = useState<ApiData | null>(null);
  const [studentLoading, setStudentLoading] = useState(false);
  const [studentModalTab, setStudentModalTab] = useState<"summary" | "transcript">("summary");

  // Transcript filters
  const [transcriptSearch, setTranscriptSearch] = useState("");
  const [transcriptTermFilter, setTranscriptTermFilter] = useState("all");
  const [transcriptStatusFilter, setTranscriptStatusFilter] = useState("all");

  // New evaluation run modal
  const [showRunModal, setShowRunModal] = useState(false);
  const [selectedCohort, setSelectedCohort] = useState("");
  const [selectedProgram, setSelectedProgram] = useState("");
  const [selectedYear, setSelectedYear] = useState("");
  const [selectedTerm, setSelectedTerm] = useState("");
  const [targetType, setTargetType] = useState("all_students");
  const [preview, setPreview] = useState<ApiData | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [runLoading, setRunLoading] = useState(false);

  const loadRunStudents = useCallback(async (run: ApiData) => {
    setStudentsLoading(true);
    try {
      const params = new URLSearchParams({ pageSize: "100" });
      const response = await apiFetch(`/api/v1/graduation-evaluations/${run.id}/students?${params}`);
      const data = await response.json();
      if (!response.ok) throw new Error(data.error?.message || "Không thể tải danh sách sinh viên.");
      const items = Array.isArray(data.items) ? [...data.items] : [];
      const total = Number(data.total || items.length);
      const totalPages = Math.ceil(total / 100);
      if (totalPages > 1) {
        const pagePromises = [];
        for (let page = 2; page <= totalPages; page += 1) {
          const pageParams = new URLSearchParams({ pageSize: "100", page: String(page) });
          pagePromises.push(
            apiFetch(`/api/v1/graduation-evaluations/${run.id}/students?${pageParams}`).then(async (res) => {
              if (!res.ok) return [];
              const json = await res.json();
              return Array.isArray(json.items) ? json.items : [];
            })
          );
        }
        const extraPages = await Promise.all(pagePromises);
        for (const pageItems of extraPages) {
          items.push(...pageItems);
        }
      }
      setAllStudents(items);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Không thể tải danh sách sinh viên.");
    } finally {
      setStudentsLoading(false);
    }
  }, []);

  const loadInitial = useCallback(async () => {
    setLoading(true);
    setLoadError("");
    try {
      const [runResponse, cohortResponse, programResponse, yearResponse] = await Promise.all([
        apiFetch("/api/v1/graduation-evaluations?pageSize=100&status=completed"),
        apiFetch("/api/v1/cohorts?pageSize=100"),
        apiFetch("/api/v1/training-programs?pageSize=100"),
        apiFetch("/api/v1/academic-years?pageSize=100"),
      ]);
      if (!runResponse.ok) throw new Error("Không thể tải danh sách đợt xét tốt nghiệp.");
      const [runData, cohortData, programData, yearData] = await Promise.all([
        runResponse.json(),
        cohortResponse.ok ? cohortResponse.json() : { items: [] },
        programResponse.ok ? programResponse.json() : { items: [] },
        yearResponse.ok ? yearResponse.json() : { items: [] },
      ]);
      const fetchedRuns: ApiData[] = Array.isArray(runData.items) ? runData.items : [];
      setRuns(fetchedRuns);
      setCohorts(Array.isArray(cohortData.items) ? cohortData.items : Array.isArray(cohortData) ? cohortData : []);
      setPrograms(Array.isArray(programData.items) ? programData.items : Array.isArray(programData) ? programData : []);
      setYears(Array.isArray(yearData.items) ? yearData.items : Array.isArray(yearData) ? yearData : []);

      // Auto-select the first batch if none is selected
      if (fetchedRuns.length > 0) {
        setSelectedRun((prev: ApiData | null) => {
          const current = prev ? fetchedRuns.find((r) => r.id === prev.id) || fetchedRuns[0] : fetchedRuns[0];
          void loadRunStudents(current);
          return current;
        });
      }
    } catch (error) {
      setLoadError(error instanceof Error ? error.message : "Không thể tải dữ liệu.");
    } finally {
      setLoading(false);
    }
  }, [loadRunStudents]);

  useEffect(() => {
    const timer = window.setTimeout(() => void loadInitial(), 0);
    return () => window.clearTimeout(timer);
  }, [loadInitial]);

  const selectRun = async (run: ApiData) => {
    setSelectedRun(run);
    setStatusFilter("all");
    setKeyword("");
    await loadRunStudents(run);
  };

  const openStudent = async (student: ApiData, defaultTab: "summary" | "transcript" = "summary") => {
    if (!selectedRun) return;
    setStudentLoading(true);
    setStudentModalTab(defaultTab);
    setTranscriptSearch("");
    setTranscriptTermFilter("all");
    setTranscriptStatusFilter("all");
    try {
      const response = await apiFetch(`/api/v1/graduation-evaluations/${selectedRun.id}/students/${student.studentId}`);
      const data = await response.json();
      if (!response.ok) throw new Error(data.error?.message || "Không thể tải chi tiết sinh viên.");
      setSelectedStudent(data);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Không thể tải chi tiết sinh viên.");
    } finally {
      setStudentLoading(false);
    }
  };

  const termsForSelectedYear = useMemo(
    () => years.find((year) => year.id === selectedYear)?.terms || [],
    [years, selectedYear],
  );

  const openRunModal = () => {
    const firstYear = years[0];
    setSelectedCohort(cohorts[0]?.id || "");
    setSelectedProgram(programs[0]?.id || "");
    setSelectedYear(firstYear?.id || "");
    setSelectedTerm(firstYear?.terms?.[0]?.id || "");
    setTargetType("all_students");
    setPreview(null);
    setShowRunModal(true);
  };

  const runPreview = async () => {
    if (!selectedCohort || !selectedProgram || !selectedTerm) return;
    setPreview(null);
    setPreviewLoading(true);
    try {
      const response = await apiFetch("/api/v1/graduation-evaluations/preview", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          cohortId: selectedCohort,
          trainingProgramId: selectedProgram,
          assessmentAcademicTermId: selectedTerm,
          targetType,
        }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error?.message || "Không thể kiểm tra dữ liệu.");
      setPreview(data);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Không thể kiểm tra dữ liệu.");
    } finally {
      setPreviewLoading(false);
    }
  };

  const submitEvaluation = async (event: FormEvent) => {
    event.preventDefault();
    if (!can("graduation.evaluate") || !selectedCohort || !selectedProgram || !selectedTerm) return;
    if (!preview) {
      await runPreview();
      toast.info("Đã kiểm tra dữ liệu. Hãy xem kết quả dự kiến trước khi bấm xác nhận chạy.");
      return;
    }
    if (!preview.canRun) {
      toast.error("Dữ liệu hoặc bộ quy tắc chưa đủ để chạy đánh giá.");
      return;
    }
    setRunLoading(true);
    try {
      const response = await apiFetch("/api/v1/graduation-evaluations", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          cohortId: selectedCohort,
          trainingProgramId: selectedProgram,
          assessmentAcademicTermId: selectedTerm,
          targetType,
        }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error?.message || "Không thể chạy đánh giá.");
      toast.success("Đã chạy xong đợt đánh giá mới thành công!");
      setShowRunModal(false);
      await loadInitial();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Không thể chạy đánh giá.");
    } finally {
      setRunLoading(false);
    }
  };

  // Filter runs list by cohort if user selects
  const filteredRuns = useMemo(() => {
    if (cohortFilter === "all") return runs;
    return runs.filter((r) => r.cohortCode === cohortFilter);
  }, [runs, cohortFilter]);

  const uniqueCohortCodes = useMemo(() => {
    const set = new Set<string>();
    runs.forEach((r) => {
      if (r.cohortCode) set.add(r.cohortCode);
    });
    return Array.from(set);
  }, [runs]);

  const statusCounts = useMemo(() => {
    const counts = {
      all: selectedRun ? Number(selectedRun.totalStudents || 0) : allStudents.length,
      EXPECTED_ELIGIBLE: selectedRun ? Number(selectedRun.expectedEligibleStudents || 0) : 0,
      NOT_ELIGIBLE: selectedRun ? Number(selectedRun.notEligibleStudents || 0) : 0,
      PENDING_GRADE: selectedRun ? Number(selectedRun.pendingGradeStudents || 0) : 0,
      PENDING_REQUIREMENT: selectedRun ? Number(selectedRun.pendingRequirementStudents || 0) : 0,
      MANUAL_REVIEW: selectedRun ? Number(selectedRun.manualReviewStudents || 0) : 0,
    };
    if (allStudents.length > 0) {
      counts.all = allStudents.length;
      counts.EXPECTED_ELIGIBLE = allStudents.filter((s) => s.finalStatus === "EXPECTED_ELIGIBLE").length;
      counts.NOT_ELIGIBLE = allStudents.filter((s) => s.finalStatus === "NOT_ELIGIBLE").length;
      counts.PENDING_GRADE = allStudents.filter((s) => s.finalStatus === "PENDING_GRADE").length;
      counts.PENDING_REQUIREMENT = allStudents.filter((s) => s.finalStatus === "PENDING_REQUIREMENT").length;
      counts.MANUAL_REVIEW = allStudents.filter((s) => s.finalStatus === "MANUAL_REVIEW").length;
    }
    return counts;
  }, [selectedRun, allStudents]);

  const statusTabs = useMemo(() => [
    {
      key: "all",
      label: "Tất cả",
      count: statusCounts.all,
      icon: null,
      activeCls: "bg-slate-900 border-slate-900 text-white shadow-xs",
      inactiveCls: "bg-slate-100/80 border-slate-200/90 text-slate-700 hover:bg-slate-200/80 hover:text-slate-900 hover:border-slate-300",
      badgeActiveCls: "bg-white/20 text-white",
      badgeInactiveCls: "bg-slate-200/80 text-slate-700",
    },
    {
      key: "EXPECTED_ELIGIBLE",
      label: "Đủ điều kiện",
      count: statusCounts.EXPECTED_ELIGIBLE,
      icon: Check,
      activeCls: "bg-emerald-600 border-emerald-600 text-white shadow-xs",
      inactiveCls: "bg-emerald-50/60 border-emerald-200 text-emerald-800 hover:bg-emerald-100/80 hover:border-emerald-300",
      badgeActiveCls: "bg-white/20 text-white",
      badgeInactiveCls: "bg-emerald-100 text-emerald-800",
    },
    {
      key: "NOT_ELIGIBLE",
      label: "Chưa đủ điều kiện",
      count: statusCounts.NOT_ELIGIBLE,
      icon: X,
      activeCls: "bg-rose-600 border-rose-600 text-white shadow-xs",
      inactiveCls: "bg-rose-50/60 border-rose-200 text-rose-800 hover:bg-rose-100/80 hover:border-rose-300",
      badgeActiveCls: "bg-white/20 text-white",
      badgeInactiveCls: "bg-rose-100 text-rose-800",
    },
    ...(statusCounts.PENDING_GRADE > 0 ? [{
      key: "PENDING_GRADE",
      label: "Chưa xác nhận",
      count: statusCounts.PENDING_GRADE,
      icon: CircleHelp,
      activeCls: "bg-amber-600 border-amber-600 text-white shadow-xs",
      inactiveCls: "bg-amber-50/60 border-amber-200 text-amber-800 hover:bg-amber-100/80 hover:border-amber-300",
      badgeActiveCls: "bg-white/20 text-white",
      badgeInactiveCls: "bg-amber-100 text-amber-800",
    }] : []),
    ...(statusCounts.PENDING_REQUIREMENT > 0 ? [{
      key: "PENDING_REQUIREMENT",
      label: "Chờ điều kiện",
      count: statusCounts.PENDING_REQUIREMENT,
      icon: CircleHelp,
      activeCls: "bg-sky-600 border-sky-600 text-white shadow-xs",
      inactiveCls: "bg-sky-50/60 border-sky-200 text-sky-800 hover:bg-sky-100/80 hover:border-sky-300",
      badgeActiveCls: "bg-white/20 text-white",
      badgeInactiveCls: "bg-sky-100 text-sky-800",
    }] : []),
    ...(statusCounts.MANUAL_REVIEW > 0 ? [{
      key: "MANUAL_REVIEW",
      label: "Đối soát",
      count: statusCounts.MANUAL_REVIEW,
      icon: ShieldAlert,
      activeCls: "bg-slate-700 border-slate-700 text-white shadow-xs",
      inactiveCls: "bg-slate-100 border-slate-300 text-slate-800 hover:bg-slate-200/80 hover:border-slate-400",
      badgeActiveCls: "bg-white/20 text-white",
      badgeInactiveCls: "bg-slate-200 text-slate-800",
    }] : []),
  ], [statusCounts]);

  const filteredStudents = useMemo(() => {
    let list = allStudents;
    if (statusFilter !== "all") {
      list = list.filter((s) => s.finalStatus === statusFilter);
    }
    const q = keyword.trim().toLowerCase();
    if (q) {
      list = list.filter((s) => {
        const name = String(s.sStudentName || "").toLowerCase();
        const id = String(s.sStudentId || "").toLowerCase();
        const cls = String(s.sClassName || "").toLowerCase();
        return name.includes(q) || id.includes(q) || cls.includes(q);
      });
    }
    return list;
  }, [allStudents, statusFilter, keyword]);

  const selectedTotalCreditsThreshold = configuredThreshold(selectedRun?.sourceSnapshot, "TOTAL_CREDITS", null);
  const selectedGpaThreshold = configuredThreshold(selectedRun?.sourceSnapshot, "CUMULATIVE_GPA", null);

  return (
    <div className="p-6 space-y-6 max-w-7xl mx-auto text-slate-800">
      {/* 1. Trang tiêu đề & Nút thao tác chính */}
      <header className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between border-b border-slate-200/80 pb-5">
        <div>
          <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-lime-700">
            <GraduationCap size={18} className="text-lime-600" />
            <span>Đại học Đà Lạt • Quản lý Đào tạo</span>
          </div>
          <h1 className="mt-1 text-2xl font-extrabold tracking-tight text-slate-900 sm:text-3xl">
            Dự kiến sinh viên tốt nghiệp
          </h1>
          <p className="mt-1 text-sm text-slate-500">
            Xem danh sách sinh viên đủ hoặc chưa đủ điều kiện tốt nghiệp, tra cứu chi tiết môn nợ và bảng điểm học tập.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          <button
            type="button"
            onClick={() => void loadInitial()}
            className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-xs font-semibold text-slate-700 shadow-xs transition hover:bg-slate-50 hover:text-slate-900 focus:outline-none focus:ring-2 focus:ring-lime-500 cursor-pointer"
          >
            <RefreshCw size={14} className={loading ? "animate-spin" : ""} />
            <span>Làm mới dữ liệu</span>
          </button>

          {can("graduation.evaluate") && (
            <button
              type="button"
              onClick={openRunModal}
              className="inline-flex items-center gap-2 rounded-xl bg-lime-600 px-4 py-2.5 text-xs font-bold text-white shadow-sm transition hover:bg-lime-700 focus:outline-none focus:ring-2 focus:ring-lime-500 focus:ring-offset-2 cursor-pointer"
            >
              <Play size={14} fill="currentColor" />
              <span>Chạy đánh giá đợt mới</span>
            </button>
          )}
        </div>
      </header>

      {/* 2. KHU VỰC CHỌN ĐỢT ĐÁNH GIÁ (BATCH SELECTOR) */}
      <section aria-labelledby="batch-selector-heading" className="space-y-3">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 id="batch-selector-heading" className="text-base font-bold text-slate-900 flex items-center gap-2">
              <span>1. Chọn đợt xét tốt nghiệp</span>
            </h2>
          </div>

          {uniqueCohortCodes.length > 1 && (
            <div className="flex items-center gap-2">
              <span className="text-xs font-medium text-slate-500">Lọc theo khóa:</span>
              <div className="flex rounded-lg bg-slate-100 p-0.5 text-xs">
                <button
                  type="button"
                  onClick={() => setCohortFilter("all")}
                  className={`rounded-md px-2.5 py-1 font-semibold transition cursor-pointer ${cohortFilter === "all" ? "bg-white text-slate-900 shadow-xs" : "text-slate-600 hover:text-slate-900"
                    }`}
                >
                  Tất cả ({runs.length})
                </button>
                {uniqueCohortCodes.map((code) => (
                  <button
                    key={code}
                    type="button"
                    onClick={() => setCohortFilter(code)}
                    className={`rounded-md px-2.5 py-1 font-semibold transition cursor-pointer ${cohortFilter === code ? "bg-white text-slate-900 shadow-xs" : "text-slate-600 hover:text-slate-900"
                      }`}
                  >
                    Khóa {code}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>

        {loading ? (
          <div className="flex h-32 items-center justify-center rounded-2xl border border-slate-200 bg-white text-sm text-slate-500">
            <LoaderCircle size={20} className="mr-2 animate-spin text-lime-600" />
            Đang tải các đợt xét tốt nghiệp...
          </div>
        ) : loadError ? (
          <div className="rounded-2xl border border-rose-200 bg-rose-50 p-6 text-center text-sm text-rose-800">
            <AlertTriangle className="mx-auto mb-2 text-rose-600" size={24} />
            <p className="font-semibold">{loadError}</p>
            <button
              type="button"
              onClick={() => void loadInitial()}
              className="mt-3 rounded-lg border border-rose-300 bg-white px-3 py-1.5 text-xs font-semibold text-rose-700 hover:bg-rose-50 cursor-pointer"
            >
              Thử lại
            </button>
          </div>
        ) : runs.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50/50 p-8 text-center">
            <FileCheck2 size={36} className="mx-auto text-slate-400 mb-2" />
            <p className="font-bold text-slate-800">Chưa có đợt xét tốt nghiệp nào</p>
            <p className="text-xs text-slate-500 mt-1">Bấm nút &quot;Chạy đánh giá đợt mới&quot; ở trên để tạo dữ liệu xét tốt nghiệp.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {filteredRuns.map((run) => {
              const isSelected = selectedRun?.id === run.id;
              const eligibleCount = Number(run.expectedEligibleStudents || 0);
              const pendingGradeCount = Number(run.pendingGradeStudents || 0);
              const pendingRequirementCount = Number(run.pendingRequirementStudents || 0);
              const notEligibleCount = Number(run.notEligibleStudents || 0);
              const manualReviewCount = Number(run.manualReviewStudents || 0);
              const total = Number(run.totalStudents || 0);

              return (
                <div
                  key={run.id}
                  onClick={() => void selectRun(run)}
                  className={`group relative rounded-2xl border p-4.5 text-left transition-all cursor-pointer ${isSelected
                    ? "border-lime-500 bg-lime-50/30 shadow-md ring-2 ring-lime-500/20"
                    : "border-slate-200 bg-white hover:border-slate-300 hover:shadow-xs"
                    }`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <div className="flex items-center gap-1.5">
                        <span className="inline-flex rounded-md bg-slate-100 px-2 py-0.5 font-mono text-[11px] font-bold text-slate-700">
                          {run.cohortCode || "Chưa rõ khóa"}
                        </span>
                        <span className="text-xs font-bold text-slate-900">
                          {run.programName || run.programCode}
                        </span>
                      </div>
                      <p className="mt-1 text-xs text-slate-500">
                        {run.assessmentTermCode || "HK"} ({run.assessmentAcademicYear || "Năm học"})
                      </p>
                    </div>

                    {isSelected ? (
                      <span className="inline-flex items-center gap-1 rounded-full bg-lime-600 px-2.5 py-0.5 text-[11px] font-bold text-white shadow-xs">
                        <Check size={12} strokeWidth={3} />
                        Đang xem
                      </span>
                    ) : (
                      <span className="text-[11px] font-medium text-slate-400 group-hover:text-lime-600 transition">
                        Bấm để xem
                      </span>
                    )}
                  </div>

                  {/* Thống kê trực quan của đợt */}
                  <div className="mt-3.5 pt-3 border-t border-slate-100 grid grid-cols-3 gap-1 text-center sm:grid-cols-6">
                    <div className="rounded-lg bg-slate-50 py-1.5 px-1">
                      <p className="text-[10px] text-slate-400 font-medium">Tổng số</p>
                      <p className="font-mono text-sm font-bold text-slate-800">{total}</p>
                    </div>
                    <div className="rounded-lg bg-emerald-50 py-1.5 px-1">
                      <p className="text-[10px] text-emerald-600 font-medium">Đủ ĐK</p>
                      <p className="font-mono text-sm font-bold text-emerald-700">{eligibleCount}</p>
                    </div>
                    <div className="rounded-lg bg-rose-50 py-1.5 px-1">
                      <p className="text-[10px] text-rose-600 font-medium">Chưa đủ</p>
                      <p className="font-mono text-sm font-bold text-rose-700">{notEligibleCount}</p>
                    </div>
                    <div className="rounded-lg bg-amber-50 py-1.5 px-1">
                      <p className="text-[10px] text-amber-600 font-medium">Chưa xác nhận</p>
                      <p className="font-mono text-sm font-bold text-amber-700">{pendingGradeCount}</p>
                    </div>
                    <div className="rounded-lg bg-sky-50 py-1.5 px-1">
                      <p className="text-[10px] text-sky-600 font-medium">Chờ ĐK</p>
                      <p className="font-mono text-sm font-bold text-sky-700">{pendingRequirementCount}</p>
                    </div>
                    <div className="rounded-lg bg-slate-100 py-1.5 px-1">
                      <p className="text-[10px] text-slate-500 font-medium">Đối soát</p>
                      <p className="font-mono text-sm font-bold text-slate-700">{manualReviewCount}</p>
                    </div>
                  </div>
                  {run.sourceSnapshot?.calculationVersion !== "curriculum-gap-v2" && <p className="mt-3 rounded-lg bg-amber-50 px-2.5 py-2 text-[11px] text-amber-800">Đợt cũ: kết luận và tín chỉ đã lưu có thể khác cách đối chiếu CTĐT hiện tại. Mở chi tiết để xem yêu cầu còn thiếu.</p>}
                </div>
              );
            })}
          </div>
        )}
      </section>

      {/* 3. KHU VỰC DANH SÁCH SINH VIÊN (HIỂN THỊ TRỰC TIẾP TRÊN TRANG, KHÔNG DÙNG DRAWER RỐI MẮT) */}
      {selectedRun && (
        <section
          aria-labelledby="student-list-heading"
          className="rounded-2xl border border-slate-200 bg-white shadow-xs overflow-hidden"
        >
          {/* Header danh sách & Nút xuất file */}
          <div className="border-b border-slate-200 bg-slate-50/70 p-4 sm:p-5 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <div className="flex items-center gap-2">
                <span className="flex h-6 w-6 items-center justify-center rounded-full bg-lime-100 text-lime-800 text-xs font-bold">
                  2
                </span>
                <h2 id="student-list-heading" className="text-base font-bold text-slate-900">
                  Danh sách sinh viên: {selectedRun.cohortCode} • {selectedRun.programName || selectedRun.programCode}
                </h2>
              </div>
              <p className="mt-0.5 text-xs text-slate-500 pl-8">
                Đợt xét: {selectedRun.assessmentTermCode} ({selectedRun.assessmentAcademicYear}) • Tổng số:{" "}
                <strong className="text-slate-800">{selectedRun.totalStudents} sinh viên</strong>
              </p>
            </div>

            {can("graduation.export") && (
              <div className="flex items-center gap-2 pl-8 lg:pl-0">
                <span className="text-xs text-slate-500 font-medium">Tải danh sách:</span>
                <a
                  href={`/api/v1/graduation-evaluations/${selectedRun.id}/export?format=xlsx`}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 shadow-xs transition hover:bg-slate-50 hover:text-emerald-700 cursor-pointer"
                >
                  <Download size={13} />
                  Xuất file Excel
                </a>
                <a
                  href={`/api/v1/graduation-evaluations/${selectedRun.id}/export?format=pdf`}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 shadow-xs transition hover:bg-slate-50 hover:text-rose-700 cursor-pointer"
                >
                  <Download size={13} />
                  Xuất file PDF
                </a>
              </div>
            )}
          </div>

          {/* Bộ lọc nhanh theo trạng thái & Ô tìm kiếm */}
          <div className="p-4 sm:p-5 border-b border-slate-100 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between bg-white">
            {/* Filter Tabs mượt mà, cố định kích thước, không giật giật layout */}
            <div className="flex flex-wrap items-center gap-2">
              {statusTabs.map((tab) => {
                const isActive = statusFilter === tab.key;
                const Icon = tab.icon;
                return (
                  <button
                    key={tab.key}
                    type="button"
                    onClick={() => setStatusFilter(tab.key)}
                    className={`inline-flex items-center gap-1.5 rounded-xl border px-3 py-1.5 text-xs font-bold transition-all duration-200 ease-out cursor-pointer select-none active:scale-[0.97] ${
                      isActive ? tab.activeCls : tab.inactiveCls
                    }`}
                  >
                    {Icon && <Icon size={13} strokeWidth={2.5} className="shrink-0" />}
                    <span>{tab.label}</span>
                    <span
                      className={`ml-1 rounded-md px-1.5 py-0.5 font-mono text-[11px] font-bold transition-colors duration-200 ${
                        isActive ? tab.badgeActiveCls : tab.badgeInactiveCls
                      }`}
                    >
                      {tab.count}
                    </span>
                  </button>
                );
              })}
            </div>

            {/* Search Box tìm kiếm tức thì */}
            <div className="relative w-full sm:w-80">
              <Search size={15} className="pointer-events-none absolute left-3.5 top-3 text-slate-400" />
              <input
                value={keyword}
                onChange={(e) => setKeyword(e.target.value)}
                placeholder="Tìm họ tên, MSSV hoặc lớp..."
                className="h-10 w-full rounded-xl border border-slate-200 bg-slate-50/50 pl-10 pr-8 text-xs outline-none transition focus:border-lime-500 focus:bg-white focus:ring-2 focus:ring-lime-100"
              />
              {keyword && (
                <button
                  type="button"
                  onClick={() => setKeyword("")}
                  className="absolute right-3 top-3 text-slate-400 hover:text-slate-600 cursor-pointer"
                  title="Xóa tìm kiếm"
                >
                  <X size={14} />
                </button>
              )}
            </div>
          </div>

          {/* Bảng sinh viên dễ đọc, có cột tóm tắt nguyên nhân ngay tại chỗ */}
          <div className="overflow-x-auto">
            <table className="w-full min-w-[950px] text-left text-xs">
              <thead className="border-b border-slate-200 bg-slate-50 text-[11px] font-bold uppercase tracking-wider text-slate-500">
                <tr>
                  <th className="px-4 py-3.5">Họ và tên & MSSV</th>
                  <th className="px-3 py-3.5 text-center">Lớp</th>
                  <th className="px-3 py-3.5 text-center">Tín chỉ tích lũy</th>
                  <th className="px-3 py-3.5 text-center">Điểm GPA</th>
                  <th className="px-3 py-3.5 text-center">Kết luận</th>
                  <th className="px-4 py-3.5">Nguyên nhân chính / Tình trạng</th>
                  <th className="px-4 py-3.5 text-right">Thao tác</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 transition-opacity duration-200">
                {studentsLoading ? (
                  <tr>
                    <td colSpan={7} className="py-16 text-center text-slate-500">
                      <LoaderCircle size={22} className="mx-auto mb-2 animate-spin text-lime-600" />
                      Đang tải danh sách sinh viên...
                    </td>
                  </tr>
                ) : filteredStudents.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="py-16 text-center text-slate-500">
                      <p className="font-semibold text-slate-700">Không có sinh viên nào phù hợp với bộ lọc</p>
                      <p className="text-xs text-slate-400 mt-1">Hãy thử xóa từ khóa tìm kiếm hoặc chọn bộ lọc trạng thái khác.</p>
                      {(statusFilter !== "all" || keyword) && (
                        <button
                          type="button"
                          onClick={() => {
                            setStatusFilter("all");
                            setKeyword("");
                          }}
                          className="mt-3 inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 cursor-pointer transition shadow-2xs"
                        >
                          Xóa bộ lọc (Xem tất cả {statusCounts.all} sinh viên)
                        </button>
                      )}
                    </td>
                  </tr>
                ) : (
                  filteredStudents.map((student) => {
                    const meta = statusMeta(student.finalStatus);
                    const reason = getStudentReasonSummary(student);
                    const credits = student.totalCredits == null ? null : Number(student.totalCredits);
                    const gpa = student.cumulativeGpa4 != null ? Number(student.cumulativeGpa4) : null;

                    return (
                      <tr
                        key={student.id}
                        className="transition hover:bg-lime-50/20 cursor-pointer"
                        onClick={() => void openStudent(student, "summary")}
                      >
                        {/* Họ tên & MSSV */}
                        <td className="px-4 py-3.5">
                          <p className="font-bold text-slate-900 text-sm hover:text-lime-700 transition">
                            {student.sStudentName}
                          </p>
                          <p className="font-mono text-xs text-slate-500 mt-0.5">MSSV: {student.sStudentId}</p>
                        </td>

                        {/* Lớp */}
                        <td className="px-3 py-3.5 text-center font-medium text-slate-700">
                          {student.sClassName || "—"}
                        </td>

                        {/* Tín chỉ */}
                        <td className="px-3 py-3.5 text-center">
                          <span className="font-mono text-sm font-bold text-slate-800">
                            {formatNumber(credits)}
                          </span>
                          <span className="text-slate-400 text-xs"> / {formatNumber(selectedTotalCreditsThreshold)}</span>
                        </td>

                        {/* GPA */}
                        <td className="px-3 py-3.5 text-center">
                          {gpa != null ? (
                            <span
                              className={`font-mono text-sm font-bold ${selectedGpaThreshold != null && gpa < selectedGpaThreshold ? "text-rose-600" : "text-slate-800"
                                }`}
                            >
                              {gpa.toFixed(2)}
                            </span>
                          ) : (
                            <span className="text-slate-400">—</span>
                          )}
                        </td>

                        {/* Kết luận */}
                        <td className="px-3 py-3.5 text-center">
                          <span
                            className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-xs font-bold ${meta.pillBg}`}
                          >
                            <meta.icon size={12} strokeWidth={2.5} />
                            {meta.short}
                          </span>
                          {student.needsManualReview && student.finalStatus !== "MANUAL_REVIEW" && (
                            <div className="mt-1">
                              <span className="inline-flex items-center gap-1 rounded-full border border-slate-200 bg-slate-50 px-2 py-0.5 text-[10px] font-semibold text-slate-600">
                                <ShieldAlert size={10} /> Có mục cần đối soát
                              </span>
                            </div>
                          )}
                        </td>

                        {/* Nguyên nhân tóm tắt */}
                        <td className="px-4 py-3.5">
                          <p className={`text-xs ${reason.tone}`}>
                            {reason.isOk && <Check size={13} className="inline mr-1 text-emerald-600" />}
                            {reason.text}
                          </p>
                        </td>

                        {/* Nút bấm mở bảng điểm & chi tiết */}
                        <td className="px-4 py-3.5 text-right" onClick={(e) => e.stopPropagation()}>
                          <div className="flex items-center justify-end gap-1.5">
                            <button
                              type="button"
                              disabled={studentLoading}
                              onClick={() => void openStudent(student, "transcript")}
                              className="inline-flex items-center gap-1.5 rounded-xl border border-lime-300 bg-lime-50/60 px-3 py-1.5 text-xs font-bold text-lime-800 shadow-xs transition hover:bg-lime-100 hover:text-lime-900 focus:outline-none focus:ring-2 focus:ring-lime-500 cursor-pointer disabled:opacity-50"
                              title="Mở bảng điểm chi tiết các môn học của sinh viên"
                            >
                              <FileText size={13} />
                              Bảng điểm
                            </button>
                            <button
                              type="button"
                              disabled={studentLoading}
                              onClick={() => void openStudent(student, "summary")}
                              className="inline-flex items-center rounded-xl p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700 transition cursor-pointer"
                              title="Xem chi tiết hồ sơ tốt nghiệp"
                            >
                              <ChevronRight size={16} />
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {/* 4. CỬA SỔ POPUP CHI TIẾT SINH VIÊN & BẢNG ĐIỂM (ĐƠN GIẢN, TRỰC QUAN, DỄ DÙNG) */}
      <Modal
        isOpen={Boolean(selectedStudent)}
        onClose={() => setSelectedStudent(null)}
        title={selectedStudent ? selectedStudent.student?.sStudentName || selectedStudent.student?.studentName || "Hồ sơ sinh viên" : "Hồ sơ sinh viên"}
        description={
          selectedStudent
            ? `MSSV: ${selectedStudent.student?.sStudentId || selectedStudent.student?.studentId} • Lớp: ${selectedStudent.student?.sClassName || selectedStudent.student?.className || "Chưa có"} • Ngành: ${selectedStudent.student?.sProgramCode || selectedStudent.student?.programName || ""}`
            : undefined
        }
        maxWidth="5xl"
      >
        {(() => {
          if (!selectedStudent) return null;
          const { grades = [], gradeDataSource, forecast } = selectedStudent;

          // Calculate grade statistics
          const passedGrades = grades.filter((g: ApiData) => g.isPassed);
          const failedGrades = grades.filter((g: ApiData) => !g.isPassed && g.scoreStatus === "graded" && !g.notScore && (g.score10 != null || g.score4 != null || g.letterGrade));
          const pendingGrades = grades.filter((g: ApiData) => !g.isPassed && !failedGrades.includes(g));

          const uniqueTerms: string[] = Array.from(
            new Set(grades.map((g: ApiData) => `${g.academicYear} • ${g.termCode}`)),
          ).filter(Boolean) as string[];

          const filteredGrades = grades.filter((g: ApiData) => {
            if (transcriptTermFilter !== "all") {
              const termKey = `${g.academicYear} • ${g.termCode}`;
              if (termKey !== transcriptTermFilter) return false;
            }
            if (transcriptStatusFilter === "passed" && !g.isPassed) return false;
            if (transcriptStatusFilter === "failed") {
              if (!failedGrades.includes(g)) return false;
            }
            if (transcriptStatusFilter === "pending") {
              if (!pendingGrades.includes(g)) return false;
            }
            if (transcriptSearch.trim()) {
              const q = transcriptSearch.toLowerCase();
              const matchCode = String(g.courseCode || "").toLowerCase().includes(q);
              const matchName = String(g.courseName || "").toLowerCase().includes(q);
              if (!matchCode && !matchName) return false;
            }
            return true;
          });

          return (
            <div className="space-y-5 text-slate-800">
              <div className="flex flex-wrap items-center gap-2 border-b border-slate-200 pb-2">
                <button
                  type="button"
                  onClick={() => setStudentModalTab("summary")}
                  className={`flex items-center gap-1.5 rounded-xl px-4 py-2 text-xs font-bold transition cursor-pointer ${
                    studentModalTab === "summary"
                      ? "bg-slate-900 text-white shadow-xs"
                      : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                  }`}
                >
                  <GraduationCap size={14} />
                  <span>Tổng quan & Điều kiện tốt nghiệp</span>
                </button>
                <button
                  type="button"
                  onClick={() => setStudentModalTab("transcript")}
                  className={`flex items-center gap-1.5 rounded-xl px-4 py-2 text-xs font-bold transition cursor-pointer ${
                    studentModalTab === "transcript"
                      ? "bg-slate-900 text-white shadow-xs"
                      : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                  }`}
                >
                  <FileText size={14} />
                  <span>Bảng điểm học phần ({grades.length} môn)</span>
                </button>
              </div>

              {studentModalTab === "summary" && (forecast ? (
                <ForecastDetail
                  forecast={forecast}
                  programCode={selectedStudent.student?.sProgramCode}
                  finalStatus={selectedStudent.student?.finalStatus}
                  reasons={Array.isArray(selectedStudent.student?.reasons) ? selectedStudent.student.reasons : []}
                  additionalRequirements={Array.isArray(selectedStudent.requirements) ? selectedStudent.requirements : []}
                  student={selectedStudent.student}
                />
              ) : (
                <div className="rounded-2xl border border-slate-200 bg-slate-50 p-6 text-center text-slate-600">
                  <Info size={24} className="mx-auto text-slate-400 mb-2" />
                  <p className="font-bold text-slate-800">Chưa có danh mục chương trình đào tạo để đối chiếu</p>
                  <p className="mt-1 text-xs text-slate-500">
                    Vui lòng cấu hình danh mục môn học của CTĐT hoặc liên hệ quản trị viên để cập nhật dữ liệu.
                  </p>
                </div>
              ))}

              {/* NỘI DUNG TAB 2: TOÀN BỘ BẢNG ĐIỂM HỌC PHẦN */}
              {studentModalTab === "transcript" && (
                <div className="space-y-4">
                  {/* 4 Thẻ số liệu tổng quan bảng điểm */}
                  <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                    <div className="rounded-xl border border-slate-200 bg-slate-50 p-3 text-center">
                      <p className="text-[10px] font-bold uppercase text-slate-500">Tổng môn học</p>
                      <p className="font-mono text-xl font-extrabold text-slate-900">{grades.length}</p>
                    </div>
                    <div className="rounded-xl border border-emerald-200 bg-emerald-50/50 p-3 text-center">
                      <p className="text-[10px] font-bold uppercase text-emerald-700">Học phần đạt (Qua môn)</p>
                      <p className="font-mono text-xl font-extrabold text-emerald-800">{passedGrades.length}</p>
                    </div>
                    <div className="rounded-xl border border-rose-200 bg-rose-50/50 p-3 text-center">
                      <p className="text-[10px] font-bold uppercase text-rose-700">Môn rớt (Điểm F)</p>
                      <p className="font-mono text-xl font-extrabold text-rose-800">{failedGrades.length}</p>
                    </div>
                    <div className="rounded-xl border border-amber-200 bg-amber-50/50 p-3 text-center">
                      <p className="text-[10px] font-bold uppercase text-amber-700">Chưa có điểm</p>
                      <p className="font-mono text-xl font-extrabold text-amber-800">{pendingGrades.length}</p>
                    </div>
                  </div>

                  {/* Thanh tìm kiếm môn học & Lọc học kỳ, kết quả */}
                  <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                    <div className="relative flex-1">
                      <Search size={14} className="pointer-events-none absolute left-3 top-2.5 text-slate-400" />
                      <input
                        value={transcriptSearch}
                        onChange={(e) => setTranscriptSearch(e.target.value)}
                        placeholder="Tìm tên môn học hoặc mã môn..."
                        className="h-9 w-full rounded-xl border border-slate-200 bg-white pl-9 pr-3 text-xs outline-none focus:border-lime-500 focus:ring-2 focus:ring-lime-100"
                      />
                    </div>
                    <select
                      value={transcriptTermFilter}
                      onChange={(e) => setTranscriptTermFilter(e.target.value)}
                      className="h-9 rounded-xl border border-slate-200 bg-white px-3 text-xs font-semibold text-slate-700 outline-none focus:border-lime-500"
                    >
                      <option value="all">Tất cả học kỳ</option>
                      {uniqueTerms.map((term: string) => (
                        <option key={term} value={term}>
                          {term}
                        </option>
                      ))}
                    </select>
                    <select
                      value={transcriptStatusFilter}
                      onChange={(e) => setTranscriptStatusFilter(e.target.value)}
                      className="h-9 rounded-xl border border-slate-200 bg-white px-3 text-xs font-semibold text-slate-700 outline-none focus:border-lime-500"
                    >
                      <option value="all">Tất cả kết quả</option>
                      <option value="failed">Chỉ xem môn rớt (F)</option>
                      <option value="pending">Chỉ xem môn chưa có điểm</option>
                      <option value="passed">Chỉ xem môn đã đạt</option>
                    </select>
                  </div>

                  {/* Bảng điểm chi tiết */}
                  <div className="overflow-hidden rounded-xl border border-slate-200">
                    <div className="max-h-[50vh] overflow-auto">
                      <table className="w-full text-left text-xs">
                        <thead className="sticky top-0 z-10 border-b border-slate-200 bg-slate-50 text-[10px] font-bold uppercase tracking-wider text-slate-500">
                          <tr>
                            <th className="px-3.5 py-3">Học kỳ</th>
                            <th className="px-3 py-3">Mã HP</th>
                            <th className="px-3.5 py-3">Tên môn học</th>
                            <th className="px-2 py-3 text-center">Số TC</th>
                            <th className="px-2 py-3 text-center">Điểm 10</th>
                            <th className="px-2 py-3 text-center">Điểm 4</th>
                            <th className="px-2 py-3 text-center">Điểm chữ</th>
                            <th className="px-3.5 py-3 text-right">Trạng thái</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                          {filteredGrades.length === 0 ? (
                            <tr>
                              <td colSpan={8} className="py-12 text-center text-slate-400">
                                Không tìm thấy môn học nào phù hợp bộ lọc.
                              </td>
                            </tr>
                          ) : (
                            filteredGrades.map((g: ApiData) => {
                              const isFail = failedGrades.includes(g);
                              const isPendingGrade = pendingGrades.includes(g);

                              return (
                                <tr
                                  key={g.id}
                                  className={
                                    isFail
                                      ? "bg-rose-50/40 hover:bg-rose-50/60"
                                      : isPendingGrade
                                        ? "bg-amber-50/30 hover:bg-amber-50/50"
                                        : "hover:bg-slate-50"
                                  }
                                >
                                  <td className="px-3.5 py-2.5 text-slate-500 font-mono text-[11px] whitespace-nowrap">
                                    {g.academicYear} • {g.termCode}
                                  </td>
                                  <td className="px-3 py-2.5 font-mono font-bold text-slate-900 whitespace-nowrap">
                                    {g.courseCode}
                                  </td>
                                  <td className="px-3.5 py-2.5 font-medium text-slate-800">
                                    {g.courseName}
                                  </td>
                                  <td className="px-2 py-2.5 text-center font-mono text-slate-700">
                                    {g.credits}
                                  </td>
                                  <td className="px-2 py-2.5 text-center font-mono font-bold">
                                    {g.score10 != null ? Number(g.score10).toFixed(1) : "—"}
                                  </td>
                                  <td className="px-2 py-2.5 text-center font-mono font-bold">
                                    {g.score4 != null ? Number(g.score4).toFixed(1) : "—"}
                                  </td>
                                  <td className="px-2 py-2.5 text-center font-mono font-extrabold">
                                    {g.letterGrade ? (
                                      <span
                                        className={
                                          g.letterGrade === "F"
                                            ? "text-rose-700"
                                            : g.letterGrade.startsWith("A")
                                              ? "text-emerald-700"
                                              : "text-slate-800"
                                        }
                                      >
                                        {g.letterGrade}
                                      </span>
                                    ) : (
                                      "—"
                                    )}
                                  </td>
                                  <td className="px-3.5 py-2.5 text-right">
                                    {isFail ? (
                                      <span className="inline-flex rounded-md bg-rose-100 px-2 py-0.5 text-[10px] font-bold text-rose-700">
                                        Không đạt (F)
                                      </span>
                                    ) : isPendingGrade ? (
                                      <span className="inline-flex rounded-md bg-amber-100 px-2 py-0.5 text-[10px] font-bold text-amber-800">
                                        Chưa có điểm
                                      </span>
                                    ) : (
                                      <span className="inline-flex rounded-md bg-emerald-100 px-2 py-0.5 text-[10px] font-bold text-emerald-800">
                                        Đạt
                                      </span>
                                    )}
                                  </td>
                                </tr>
                              );
                            })
                          )}
                        </tbody>
                      </table>
                    </div>
                  </div>
                </div>
              )}

              {/* Nút đóng ở dưới cùng để người dùng tiện thao tác */}
              <div className="pt-3 border-t border-slate-200 flex justify-end">
                <button
                  type="button"
                  onClick={() => setSelectedStudent(null)}
                  className="rounded-xl border border-slate-300 bg-white px-5 py-2 text-xs font-bold text-slate-700 hover:bg-slate-50 transition cursor-pointer"
                >
                  Đóng cửa sổ
                </button>
              </div>
            </div>
          );
        })()}
      </Modal>

      {/* 5. MODAL CHẠY ĐỢT ĐÁNH GIÁ MỚI */}
      <Modal
        isOpen={showRunModal}
        onClose={() => setShowRunModal(false)}
        title="Chạy đợt dự kiến tốt nghiệp mới"
        description="Chọn khóa, chương trình đào tạo và học kỳ đánh giá."
        maxWidth="lg"
      >
        <form onSubmit={submitEvaluation} className="space-y-4 text-xs">
          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1">Khóa sinh viên</label>
            <select
              value={selectedCohort}
              onChange={(e) => {
                setSelectedCohort(e.target.value);
                setPreview(null);
              }}
              className="h-9 w-full rounded-xl border border-slate-300 bg-white px-3 font-medium outline-none focus:border-lime-500"
            >
              {cohorts.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.sCohortCode} - {c.sCohortName}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1">Chương trình đào tạo</label>
            <select
              value={selectedProgram}
              onChange={(e) => {
                setSelectedProgram(e.target.value);
                setPreview(null);
              }}
              className="h-9 w-full rounded-xl border border-slate-300 bg-white px-3 font-medium outline-none focus:border-lime-500"
            >
              {programs.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.sProgramCode} - {p.sProgramName}
                </option>
              ))}
            </select>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">Năm học đánh giá</label>
              <select
                value={selectedYear}
                onChange={(e) => {
                  const y = e.target.value;
                  setSelectedYear(y);
                  const matched = years.find((year) => year.id === y);
                  setSelectedTerm(matched?.terms?.[0]?.id || "");
                  setPreview(null);
                }}
                className="h-9 w-full rounded-xl border border-slate-300 bg-white px-3 font-medium outline-none focus:border-lime-500"
              >
                {years.map((y) => (
                  <option key={y.id} value={y.id}>
                    {y.sYearCode}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">Học kỳ đánh giá</label>
              <select
                value={selectedTerm}
                onChange={(e) => {
                  setSelectedTerm(e.target.value);
                  setPreview(null);
                }}
                className="h-9 w-full rounded-xl border border-slate-300 bg-white px-3 font-medium outline-none focus:border-lime-500"
              >
                {termsForSelectedYear.map((t: ApiData) => (
                  <option key={String(t.id)} value={String(t.id)}>
                    {String(t.sTermCode)} - {String(t.sTermName)}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1">Đối tượng sinh viên</label>
            <select
              value={targetType}
              onChange={(e) => {
                setTargetType(e.target.value);
                setPreview(null);
              }}
              className="h-9 w-full rounded-xl border border-slate-300 bg-white px-3 font-medium outline-none focus:border-lime-500"
            >
              <option value="all_students">Tất cả sinh viên trong khóa / ngành</option>
              <option value="active_students">Chỉ sinh viên đang còn học (bỏ nghỉ/thôi học)</option>
            </select>
          </div>

          {preview && (
            <div className={`rounded-xl border p-3 space-y-2 text-xs ${preview.canRun ? "border-emerald-200 bg-emerald-50/60" : "border-rose-200 bg-rose-50/70"}`}>
              <p className={`font-bold ${preview.canRun ? "text-emerald-800" : "text-rose-800"}`}>
                {preview.canRun ? "Dữ liệu hợp lệ, có thể chạy đánh giá" : "Chưa thể chạy đánh giá"}
              </p>
              <div className="grid grid-cols-2 gap-2 text-[11px]">
                <p>Tổng sinh viên xét: <strong>{preview.summary?.studentCount ?? preview.dataReadiness?.studentCount ?? "—"}</strong></p>
                <p>Số kế hoạch CTĐT: <strong>{preview.summary?.planCount ?? "—"}</strong></p>
                <p>Thiếu GPA: <strong>{preview.dataReadiness?.missingGpa ?? "—"}</strong></p>
                <p>Thiếu hồ sơ xác minh: <strong>{preview.dataReadiness?.missingVerifiedRequirements ?? "—"}</strong></p>
              </div>
              {Array.isArray(preview.blockers) && preview.blockers.length > 0 && (
                <ul className="space-y-1 text-[11px] text-rose-700">
                  {preview.blockers.map((item: ApiData, index: number) => (
                    <li key={`${String(item.code || "blocker")}-${index}`} className="flex gap-1.5">
                      <AlertTriangle size={13} className="mt-0.5 shrink-0" />
                      <span>{String(item.message || "Dữ liệu chưa hợp lệ.")}</span>
                    </li>
                  ))}
                </ul>
              )}
              {Array.isArray(preview.warnings) && preview.warnings.length > 0 && (
                <ul className="space-y-1 text-[11px] text-amber-700">
                  {preview.warnings.map((item: ApiData, index: number) => (
                    <li key={`${String(item.code || "warning")}-${index}`} className="flex gap-1.5">
                      <Info size={13} className="mt-0.5 shrink-0" />
                      <span>{String(item.message || "Cần lưu ý dữ liệu đầu vào.")}</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}

          <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-200">
            <button
              type="button"
              onClick={() => setShowRunModal(false)}
              className="rounded-xl border border-slate-300 px-4 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 cursor-pointer"
            >
              Hủy
            </button>
            <button
              type="button"
              disabled={previewLoading || runLoading}
              onClick={runPreview}
              className="rounded-xl border border-lime-500 px-4 py-2 text-xs font-bold text-lime-700 hover:bg-lime-50 cursor-pointer disabled:opacity-50"
            >
              {previewLoading ? "Đang kiểm tra..." : "Kiểm tra trước"}
            </button>
            <button
              type="submit"
              disabled={previewLoading || runLoading || Boolean(preview && !preview.canRun)}
              className="rounded-xl bg-lime-600 px-4 py-2 text-xs font-bold text-white shadow-xs hover:bg-lime-700 cursor-pointer disabled:opacity-50"
            >
              {runLoading ? "Đang xử lý..." : "Xác nhận chạy"}
            </button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
