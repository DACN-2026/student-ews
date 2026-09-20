"use client";

import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  BookOpen,
  Check,
  ChevronDown,
  ChevronRight,
  CircleHelp,
  Download,
  ExternalLink,
  FileCheck2,
  FileText,
  GraduationCap,
  Info,
  LoaderCircle,
  Play,
  RefreshCw,
  Search,
  ShieldAlert,
  Sparkles,
  Users,
  X,
} from "lucide-react";
import { apiFetch } from "@/lib/api-client";
import Modal from "@/components/ui/Modal";
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
    label: "Chờ kết quả điểm",
    short: "Chờ điểm",
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

const REQUIREMENT_LABELS: Record<string, string> = {
  PASSED: "Đạt",
  CLEAR: "Đã xác minh",
  AVAILABLE: "Có dữ liệu",
  NOT_PASSED: "Chưa đạt",
  SUSPENDED: "Đang đình chỉ",
  UNDER_CRIMINAL_PROCEEDING: "Đang bị truy cứu",
  PENDING: "Chờ xác nhận",
  NOT_AVAILABLE: "Chưa có dữ liệu",
};

function statusMeta(status: string) {
  return STATUS_META[status] || STATUS_META.MANUAL_REVIEW;
}

function formatNumber(value: unknown, digits = 0) {
  if (value === null || value === undefined || value === "") return "—";
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed.toLocaleString("vi-VN", { maximumFractionDigits: digits, minimumFractionDigits: digits }) : "—";
}

function getStudentReasonSummary(student: ApiData): { text: string; tone: string; isOk: boolean } {
  if (student.finalStatus === "EXPECTED_ELIGIBLE") {
    return { text: "Đủ toàn bộ điều kiện tốt nghiệp", tone: "text-emerald-700 font-medium", isOk: true };
  }
  if (student.finalStatus === "PENDING_GRADE") {
    return { text: "Đang chờ công bố điểm các môn học kỳ này", tone: "text-amber-700 font-medium", isOk: false };
  }
  if (student.finalStatus === "PENDING_REQUIREMENT") {
    return { text: "Chờ nộp / bổ sung chứng chỉ tốt nghiệp", tone: "text-sky-700 font-medium", isOk: false };
  }
  if (student.finalStatus === "MANUAL_REVIEW") {
    return { text: "Hồ sơ cần cán bộ đào tạo đối soát lại", tone: "text-slate-600 font-medium", isOk: false };
  }

  // NOT_ELIGIBLE: prioritize most helpful reason
  const reasons = Array.isArray(student.reasons) ? student.reasons : [];
  if (student.curriculumStatus === "NOT_PASSED") {
    return { text: "Nợ môn bắt buộc hoặc thiếu tín chỉ CTĐT", tone: "text-rose-700 font-medium", isOk: false };
  }
  if (student.cumulativeGpa4 != null && Number(student.cumulativeGpa4) < 2.0) {
    return { text: `Điểm GPA (${Number(student.cumulativeGpa4).toFixed(2)}) chưa đạt ngưỡng 2.00`, tone: "text-rose-700 font-medium", isOk: false };
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
  const [students, setStudents] = useState<ApiData[]>([]);
  const [studentsLoading, setStudentsLoading] = useState(false);
  const [statusFilter, setStatusFilter] = useState("all");
  const [keyword, setKeyword] = useState("");

  // Filter batches by cohort
  const [cohortFilter, setCohortFilter] = useState<string>("all");

  // Student Detail Modal
  const [selectedStudent, setSelectedStudent] = useState<ApiData | null>(null);
  const [studentLoading, setStudentLoading] = useState(false);
  const [studentModalTab, setStudentModalTab] = useState<"summary" | "transcript">("summary");
  const [showTechnicalChecklist, setShowTechnicalChecklist] = useState(false);

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

  const loadRunStudents = useCallback(async (run: ApiData, status = statusFilter, search = keyword) => {
    setStudentsLoading(true);
    try {
      const params = new URLSearchParams({ pageSize: "100" });
      if (status !== "all") params.set("status", status);
      if (search.trim()) params.set("keyword", search.trim());
      const response = await apiFetch(`/api/v1/graduation-evaluations/${run.id}/students?${params}`);
      const data = await response.json();
      if (!response.ok) throw new Error(data.error?.message || "Không thể tải danh sách sinh viên.");
      const items = Array.isArray(data.items) ? [...data.items] : [];
      const total = Number(data.total || items.length);
      for (let page = 2; items.length < total; page += 1) {
        params.set("page", String(page));
        const nextResponse = await apiFetch(`/api/v1/graduation-evaluations/${run.id}/students?${params}`);
        const nextData = await nextResponse.json();
        if (!nextResponse.ok) throw new Error(nextData.error?.message || "Không thể tải đầy đủ danh sách sinh viên.");
        const nextItems = Array.isArray(nextData.items) ? nextData.items : [];
        if (nextItems.length === 0) break;
        items.push(...nextItems);
      }
      setStudents(items);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Không thể tải danh sách sinh viên.");
    } finally {
      setStudentsLoading(false);
    }
  }, [keyword, statusFilter]);

  const loadInitial = useCallback(async () => {
    setLoading(true);
    setLoadError("");
    try {
      const [runResponse, cohortResponse, programResponse, yearResponse] = await Promise.all([
        apiFetch("/api/v1/graduation-evaluations?pageSize=100"),
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
          void loadRunStudents(current, "all", "");
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
    await loadRunStudents(run, "all", "");
  };

  const openStudent = async (student: ApiData, defaultTab: "summary" | "transcript" = "summary") => {
    if (!selectedRun) return;
    setStudentLoading(true);
    setStudentModalTab(defaultTab);
    setShowTechnicalChecklist(false);
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

  return (
    <main className="mx-auto max-w-[1550px] space-y-6 p-4 sm:p-6 text-slate-800">
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
              <span className="text-xs font-normal text-slate-500">
                (Bấm vào một đợt bên dưới để xem danh sách sinh viên)
              </span>
            </h2>
          </div>

          {uniqueCohortCodes.length > 1 && (
            <div className="flex items-center gap-2">
              <span className="text-xs font-medium text-slate-500">Lọc theo khóa:</span>
              <div className="flex rounded-lg bg-slate-100 p-0.5 text-xs">
                <button
                  type="button"
                  onClick={() => setCohortFilter("all")}
                  className={`rounded-md px-2.5 py-1 font-semibold transition cursor-pointer ${
                    cohortFilter === "all" ? "bg-white text-slate-900 shadow-xs" : "text-slate-600 hover:text-slate-900"
                  }`}
                >
                  Tất cả ({runs.length})
                </button>
                {uniqueCohortCodes.map((code) => (
                  <button
                    key={code}
                    type="button"
                    onClick={() => setCohortFilter(code)}
                    className={`rounded-md px-2.5 py-1 font-semibold transition cursor-pointer ${
                      cohortFilter === code ? "bg-white text-slate-900 shadow-xs" : "text-slate-600 hover:text-slate-900"
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
            <p className="text-xs text-slate-500 mt-1">Bấm nút "Chạy đánh giá đợt mới" ở trên để tạo dữ liệu xét tốt nghiệp.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {filteredRuns.map((run) => {
              const isSelected = selectedRun?.id === run.id;
              const eligibleCount = Number(run.expectedEligibleStudents || 0);
              const pendingGradeCount = Number(run.pendingGradeStudents || 0);
              const notEligibleCount = Number(run.notEligibleStudents || 0);
              const total = Number(run.totalStudents || 0);

              return (
                <div
                  key={run.id}
                  onClick={() => void selectRun(run)}
                  className={`group relative rounded-2xl border p-4.5 text-left transition-all cursor-pointer ${
                    isSelected
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
                  <div className="mt-3.5 pt-3 border-t border-slate-100 grid grid-cols-4 gap-1 text-center">
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
                      <p className="text-[10px] text-amber-600 font-medium">Chờ điểm</p>
                      <p className="font-mono text-sm font-bold text-amber-700">{pendingGradeCount}</p>
                    </div>
                  </div>
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
            {/* Filter Tabs to, rõ chữ */}
            <div className="flex flex-wrap items-center gap-1.5">
              <button
                type="button"
                onClick={() => {
                  setStatusFilter("all");
                  void loadRunStudents(selectedRun, "all", keyword);
                }}
                className={`rounded-xl px-3 py-2 text-xs font-bold transition cursor-pointer ${
                  statusFilter === "all"
                    ? "bg-slate-900 text-white shadow-xs"
                    : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                }`}
              >
                Tất cả ({selectedRun.totalStudents})
              </button>

              <button
                type="button"
                onClick={() => {
                  setStatusFilter("EXPECTED_ELIGIBLE");
                  void loadRunStudents(selectedRun, "EXPECTED_ELIGIBLE", keyword);
                }}
                className={`inline-flex items-center gap-1.5 rounded-xl px-3 py-2 text-xs font-bold transition cursor-pointer ${
                  statusFilter === "EXPECTED_ELIGIBLE"
                    ? "bg-emerald-600 text-white shadow-xs"
                    : "bg-emerald-50 text-emerald-700 border border-emerald-200 hover:bg-emerald-100"
                }`}
              >
                <Check size={13} strokeWidth={2.5} />
                Đủ điều kiện ({selectedRun.expectedEligibleStudents || 0})
              </button>

              <button
                type="button"
                onClick={() => {
                  setStatusFilter("NOT_ELIGIBLE");
                  void loadRunStudents(selectedRun, "NOT_ELIGIBLE", keyword);
                }}
                className={`inline-flex items-center gap-1.5 rounded-xl px-3 py-2 text-xs font-bold transition cursor-pointer ${
                  statusFilter === "NOT_ELIGIBLE"
                    ? "bg-rose-600 text-white shadow-xs"
                    : "bg-rose-50 text-rose-700 border border-rose-200 hover:bg-rose-100"
                }`}
              >
                <X size={13} strokeWidth={2.5} />
                Chưa đủ điều kiện ({selectedRun.notEligibleStudents || 0})
              </button>

              {Number(selectedRun.pendingGradeStudents || 0) > 0 && (
                <button
                  type="button"
                  onClick={() => {
                    setStatusFilter("PENDING_GRADE");
                    void loadRunStudents(selectedRun, "PENDING_GRADE", keyword);
                  }}
                  className={`inline-flex items-center gap-1.5 rounded-xl px-3 py-2 text-xs font-bold transition cursor-pointer ${
                    statusFilter === "PENDING_GRADE"
                      ? "bg-amber-600 text-white shadow-xs"
                      : "bg-amber-50 text-amber-700 border border-amber-200 hover:bg-amber-100"
                  }`}
                >
                  <CircleHelp size={13} />
                  Chờ điểm ({selectedRun.pendingGradeStudents})
                </button>
              )}

              {Number(selectedRun.manualReviewStudents || 0) > 0 && (
                <button
                  type="button"
                  onClick={() => {
                    setStatusFilter("MANUAL_REVIEW");
                    void loadRunStudents(selectedRun, "MANUAL_REVIEW", keyword);
                  }}
                  className={`inline-flex items-center gap-1.5 rounded-xl px-3 py-2 text-xs font-bold transition cursor-pointer ${
                    statusFilter === "MANUAL_REVIEW"
                      ? "bg-slate-600 text-white shadow-xs"
                      : "bg-slate-100 text-slate-700 border border-slate-300 hover:bg-slate-200"
                  }`}
                >
                  <ShieldAlert size={13} />
                  Đối soát ({selectedRun.manualReviewStudents})
                </button>
              )}
            </div>

            {/* Search Box to, rõ */}
            <form
              className="relative w-full sm:w-80"
              onSubmit={(e) => {
                e.preventDefault();
                void loadRunStudents(selectedRun, statusFilter, keyword);
              }}
            >
              <Search size={15} className="pointer-events-none absolute left-3.5 top-3 text-slate-400" />
              <input
                value={keyword}
                onChange={(e) => setKeyword(e.target.value)}
                placeholder="Tìm họ tên hoặc MSSV..."
                className="h-10 w-full rounded-xl border border-slate-200 bg-slate-50/50 pl-10 pr-3 text-xs outline-none transition focus:border-lime-500 focus:bg-white focus:ring-2 focus:ring-lime-100"
              />
              {keyword && (
                <button
                  type="button"
                  onClick={() => {
                    setKeyword("");
                    void loadRunStudents(selectedRun, statusFilter, "");
                  }}
                  className="absolute right-3 top-3 text-slate-400 hover:text-slate-600 cursor-pointer"
                >
                  <X size={14} />
                </button>
              )}
            </form>
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
              <tbody className="divide-y divide-slate-100">
                {studentsLoading ? (
                  <tr>
                    <td colSpan={7} className="py-16 text-center text-slate-500">
                      <LoaderCircle size={22} className="mx-auto mb-2 animate-spin text-lime-600" />
                      Đang tải danh sách sinh viên...
                    </td>
                  </tr>
                ) : students.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="py-16 text-center text-slate-500">
                      <p className="font-semibold text-slate-700">Không có sinh viên nào phù hợp với bộ lọc</p>
                      <p className="text-xs text-slate-400 mt-1">Hãy thử xóa từ khóa tìm kiếm hoặc chọn bộ lọc trạng thái khác.</p>
                    </td>
                  </tr>
                ) : (
                  students.map((student) => {
                    const meta = statusMeta(student.finalStatus);
                    const reason = getStudentReasonSummary(student);
                    const credits = Number(student.totalCredits || 0);
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
                          <span className="text-slate-400 text-xs"> / 150</span>
                        </td>

                        {/* GPA */}
                        <td className="px-3 py-3.5 text-center">
                          {gpa != null ? (
                            <span
                              className={`font-mono text-sm font-bold ${
                                gpa < 2.0 ? "text-rose-600" : gpa >= 3.2 ? "text-emerald-700" : "text-slate-800"
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
          const {
            student,
            evaluation,
            missingCourses = [],
            pendingCourses = [],
            missingMandatoryCourses = [],
            mandatoryAnalysis,
            electiveAnalysis,
            electiveGroups = [],
            grades = [],
          } = selectedStudent;
          const finalStatus = student?.finalStatus || evaluation?.finalStatus || "MANUAL_REVIEW";
          const meta = statusMeta(finalStatus);
          const isEligible = finalStatus === "EXPECTED_ELIGIBLE";
          const isPending = finalStatus === "PENDING_GRADE";
          const isNotEligible = finalStatus === "NOT_ELIGIBLE";

          // Mandatory courses breakdown:
          const failedMandatoryCourses: ApiData[] =
            mandatoryAnalysis?.failedCourses ||
            missingMandatoryCourses.filter(
              (c: ApiData) => Boolean(c.gradeInfo) && (c.gradeInfo.isPassed === false || c.gradeInfo.letterGrade === "F"),
            );
          const unregisteredMandatoryCourses: ApiData[] =
            mandatoryAnalysis?.unregisteredCourses ||
            missingMandatoryCourses.filter(
              (c: ApiData) => !c.gradeInfo || (c.gradeInfo.isPassed !== false && c.gradeInfo.letterGrade !== "F"),
            );

          // Elective courses breakdown:
          const studentElecCredits = Number(electiveAnalysis?.accumulatedCredits ?? student?.electiveCredits ?? 0);
          const requiredElecCredits = Number(electiveAnalysis?.requiredCredits ?? 46);
          const isElectiveSatisfied = electiveAnalysis
            ? Boolean(electiveAnalysis.isSatisfied)
            : studentElecCredits >= requiredElecCredits;
          const missingElecCredits = Number(
            electiveAnalysis?.missingCredits ?? Math.max(0, requiredElecCredits - studentElecCredits),
          );
          const excessElecCredits = Number(
            electiveAnalysis?.excessCredits ?? Math.max(0, studentElecCredits - requiredElecCredits),
          );
          const failedElectiveCourses: ApiData[] = electiveAnalysis?.failedCourses || [];
          const availableElectives: ApiData[] = electiveAnalysis?.availableOptions || [];

          // Calculate grade statistics
          const passedGrades = grades.filter((g: ApiData) => g.isPassed);
          const failedGrades = grades.filter((g: ApiData) => !g.isPassed && g.scoreStatus !== "pending" && !g.notScore);
          const pendingGrades = grades.filter((g: ApiData) => g.scoreStatus === "pending" || g.notScore);

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
              if (g.isPassed || g.scoreStatus === "pending" || g.notScore) return false;
            }
            if (transcriptStatusFilter === "pending") {
              if (g.scoreStatus !== "pending" && !g.notScore) return false;
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
              {/* KHUNG THÔNG BÁO KẾT LUẬN TO, RÕ DÀNG */}
              <div
                className={`rounded-2xl border p-4 sm:p-5 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 ${
                  isEligible
                    ? "border-emerald-300 bg-emerald-50/60 text-emerald-950"
                    : isPending
                    ? "border-amber-300 bg-amber-50/60 text-amber-950"
                    : "border-rose-300 bg-rose-50/60 text-rose-950"
                }`}
              >
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <span
                      className={`inline-flex items-center gap-1 rounded-full px-3 py-1 text-xs font-extrabold ${
                        isEligible
                          ? "bg-emerald-600 text-white"
                          : isPending
                          ? "bg-amber-600 text-white"
                          : "bg-rose-600 text-white"
                      }`}
                    >
                      <meta.icon size={14} strokeWidth={3} />
                      {meta.label.toUpperCase()}
                    </span>
                  </div>

                  <p className="text-sm font-bold mt-1">
                    {isEligible && "Sinh viên đã đạt đủ tất cả các yêu cầu về học phần, GPA và chứng chỉ để tốt nghiệp."}
                    {isPending && (
                      <span>
                        Sinh viên đã tích lũy đủ <strong>{studentElecCredits}/{requiredElecCredits} tín chỉ tự chọn</strong>
                        {excessElecCredits > 0 ? ` (đạt và vượt +${excessElecCredits} TC theo CTĐT K44)` : ""}, hiện đang chờ công bố điểm thi của{" "}
                        <strong>{pendingCourses.length} học phần</strong> ({pendingCourses.map((c: ApiData) => c.courseName || c.courseCode).join(", ")}) để hoàn tất điều kiện tốt nghiệp.
                      </span>
                    )}
                    {isNotEligible && "Sinh viên còn nợ học phần bắt buộc, thiếu tín chỉ tích lũy hoặc GPA chưa đạt 2.00."}
                    {finalStatus === "MANUAL_REVIEW" && "Hồ sơ của sinh viên cần đối soát thêm với chuyên viên đào tạo."}
                  </p>
                </div>

                {/* Thẻ 3 con số quan trọng: Tín chỉ, GPA, Rèn luyện */}
                <div className="flex items-center gap-3 shrink-0">
                  <div className="rounded-xl bg-white/80 border border-slate-200/80 px-3.5 py-2 text-center shadow-2xs">
                    <p className="text-[10px] uppercase font-bold text-slate-500">Tín chỉ tích lũy</p>
                    <p className="font-mono text-base font-extrabold text-slate-900">
                      {formatNumber(student?.totalCredits ?? evaluation?.totalCredits)} <span className="text-xs text-slate-400 font-normal">/ 150</span>
                    </p>
                  </div>
                  <div className="rounded-xl bg-white/80 border border-slate-200/80 px-3.5 py-2 text-center shadow-2xs">
                    <p className="text-[10px] uppercase font-bold text-slate-500">GPA Hệ 4</p>
                    <p
                      className={`font-mono text-base font-extrabold ${
                        Number(student?.cumulativeGpa4 ?? evaluation?.cumulativeGpa4 ?? 0) < 2.0 ? "text-rose-600" : "text-slate-900"
                      }`}
                    >
                      {formatNumber(student?.cumulativeGpa4 ?? evaluation?.cumulativeGpa4, 2)}{" "}
                      <span className="text-xs text-slate-400 font-normal">/ 2.0</span>
                    </p>
                  </div>
                  <div className="rounded-xl bg-white/80 border border-slate-200/80 px-3.5 py-2 text-center shadow-2xs">
                    <p className="text-[10px] uppercase font-bold text-slate-500">Rèn luyện</p>
                    <p className="font-mono text-base font-extrabold text-slate-900">
                      {formatNumber(student?.wholeCourseTrainingScore ?? evaluation?.wholeCourseTrainingScore, 1)}
                    </p>
                  </div>
                </div>
              </div>

              {/* 2 TAB ĐIỀU HƯỚNG CỰC KỲ RÕ RÀNG */}
              <div className="flex items-center justify-between border-b border-slate-200 pb-0">
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setStudentModalTab("summary")}
                    className={`inline-flex items-center gap-2 border-b-2 px-4 py-2.5 text-xs font-bold transition cursor-pointer ${
                      studentModalTab === "summary"
                        ? "border-lime-600 text-lime-800"
                        : "border-transparent text-slate-500 hover:text-slate-800"
                    }`}
                  >
                    <AlertTriangle size={14} />
                    <span>Lý do & Tình trạng học phần</span>
                    {failedMandatoryCourses.length > 0 && (
                      <span className="rounded-full bg-rose-100 px-2 py-0.5 text-[10px] font-extrabold text-rose-700">
                        {failedMandatoryCourses.length} môn bắt buộc nợ F
                      </span>
                    )}
                    {unregisteredMandatoryCourses.length > 0 && (
                      <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-extrabold text-amber-800">
                        {unregisteredMandatoryCourses.length} môn bắt buộc chưa học
                      </span>
                    )}
                    {pendingCourses.length > 0 && (
                      <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-extrabold text-amber-800">
                        {pendingCourses.length} môn chờ điểm
                      </span>
                    )}
                    {!isElectiveSatisfied && missingElecCredits > 0 && (
                      <span className="rounded-full bg-rose-100 px-2 py-0.5 text-[10px] font-extrabold text-rose-700">
                        Thiếu {missingElecCredits} TC tự chọn
                      </span>
                    )}
                    {failedMandatoryCourses.length === 0 &&
                      unregisteredMandatoryCourses.length === 0 &&
                      isElectiveSatisfied && (
                        <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-extrabold text-emerald-800">
                          Đã hoàn thành các môn học
                        </span>
                      )}
                  </button>

                  <button
                    type="button"
                    onClick={() => setStudentModalTab("transcript")}
                    className={`inline-flex items-center gap-2 border-b-2 px-4 py-2.5 text-xs font-bold transition cursor-pointer ${
                      studentModalTab === "transcript"
                        ? "border-lime-600 text-lime-800"
                        : "border-transparent text-slate-500 hover:text-slate-800"
                    }`}
                  >
                    <FileText size={14} />
                    <span>Toàn bộ bảng điểm học phần</span>
                    <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-bold text-slate-600">
                      {grades.length} môn
                    </span>
                  </button>
                </div>

                <a
                  href={`/students/${student?.sStudentId || student?.studentId}`}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-1 text-xs font-semibold text-lime-700 hover:text-lime-800 hover:underline cursor-pointer"
                >
                  <span>Mở hồ sơ sinh viên</span>
                  <ExternalLink size={12} />
                </a>
              </div>

              {/* NỘI DUNG TAB 1: LÝ DO CHƯA ĐẠT & TÌNH TRẠNG HỌC PHẦN */}
              {studentModalTab === "summary" && (
                <div className="space-y-5">
                  {/* 1. KHỐI MÔN BẮT BUỘC ĐÃ HỌC NHƯNG THI RỚT (ĐIỂM F) */}
                  {failedMandatoryCourses.length > 0 && (
                    <div className="rounded-2xl border border-rose-300 bg-rose-50/40 p-4.5 space-y-3">
                      <div className="flex items-center justify-between">
                        <h3 className="text-sm font-bold text-rose-950 flex items-center gap-2">
                          <span className="flex h-6 w-6 items-center justify-center rounded-full bg-rose-600 text-white text-xs font-extrabold">
                            ✕
                          </span>
                          <span>Học phần BẮT BUỘC đã học nhưng thi rớt ({failedMandatoryCourses.length} môn nợ F)</span>
                        </h3>
                        <span className="rounded-full bg-rose-200/80 px-2.5 py-1 text-[11px] font-extrabold text-rose-800">
                          Bắt buộc phải đăng ký học lại
                        </span>
                      </div>

                      <div className="grid gap-2.5 sm:grid-cols-2">
                        {failedMandatoryCourses.map((course: ApiData) => (
                          <div
                            key={`${course.courseId}-${course.curriculumSemesterNo}`}
                            className="rounded-xl border border-rose-300 bg-white p-3.5 flex flex-col justify-between shadow-2xs"
                          >
                            <div>
                              <div className="flex items-start justify-between gap-2">
                                <p className="font-bold text-slate-900 text-xs">
                                  {course.courseCode} • {course.courseName}
                                </p>
                                <span className="inline-flex shrink-0 rounded-md bg-rose-100 px-2 py-0.5 text-[10px] font-extrabold text-rose-700">
                                  Điểm F (Chưa đạt)
                                </span>
                              </div>
                              <p className="mt-1 text-xs text-slate-500">
                                {course.credits} tín chỉ bắt buộc • Lộ trình đề xuất: Học kỳ {course.curriculumSemesterNo}
                              </p>
                            </div>

                            <div className="mt-3 pt-2.5 border-t border-rose-100 text-xs text-rose-800">
                              <p className="font-semibold">
                                Đã học ở HK {course.gradeInfo?.termCode} ({course.gradeInfo?.academicYear}): Điểm{" "}
                                <span className="font-mono font-bold">
                                  {course.gradeInfo?.score10 != null ? Number(course.gradeInfo.score10).toFixed(1) : "—"}
                                </span>{" "}
                                (Điểm chữ {course.gradeInfo?.letterGrade || "F"})
                              </p>
                              <p className="text-[11px] text-rose-600 mt-1 font-medium">
                                👉 Đây là học phần BẮT BUỘC trong CTĐT (104 tín chỉ). Sinh viên bắt buộc phải đăng ký học lại để tích lũy tín chỉ tốt nghiệp.
                              </p>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* 2. KHỐI MÔN BẮT BUỘC CHƯA TỪNG ĐĂNG KÝ HỌC */}
                  {unregisteredMandatoryCourses.length > 0 && (
                    <div className="rounded-2xl border border-amber-300/80 bg-amber-50/30 p-4.5 space-y-3">
                      <div className="flex items-center justify-between">
                        <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                          <span className="flex h-6 w-6 items-center justify-center rounded-full bg-amber-500 text-white text-xs font-extrabold">
                            !
                          </span>
                          <span>Học phần BẮT BUỘC chưa từng đăng ký học ({unregisteredMandatoryCourses.length} môn)</span>
                        </h3>
                        <span className="rounded-full bg-amber-100 px-2.5 py-1 text-[11px] font-bold text-amber-800">
                          Bắt buộc đăng ký học mới
                        </span>
                      </div>

                      <div className="grid gap-2.5 sm:grid-cols-2">
                        {unregisteredMandatoryCourses.map((course: ApiData) => (
                          <div
                            key={`${course.courseId}-${course.curriculumSemesterNo}`}
                            className="rounded-xl border border-amber-200 bg-white p-3.5 flex flex-col justify-between shadow-2xs"
                          >
                            <div>
                              <div className="flex items-start justify-between gap-2">
                                <p className="font-bold text-slate-900 text-xs">
                                  {course.courseCode} • {course.courseName}
                                </p>
                                <span className="inline-flex shrink-0 rounded-md bg-amber-100 px-2 py-0.5 text-[10px] font-bold text-amber-800">
                                  Chưa học
                                </span>
                              </div>
                              <p className="mt-1 text-xs text-slate-500">
                                {course.credits} tín chỉ bắt buộc • Lộ trình đào tạo: Học kỳ {course.curriculumSemesterNo}
                              </p>
                            </div>

                            <div className="mt-3 pt-2.5 border-t border-amber-100 text-xs text-amber-800">
                              <p className="font-semibold">Chưa từng đăng ký học phần bắt buộc này</p>
                              <p className="text-[11px] text-amber-700 mt-1 font-medium">
                                👉 Bắt buộc phải đăng ký học mới để hoàn thành khung 104 tín chỉ bắt buộc của CTĐT.
                              </p>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* THÔNG BÁO HOÀN THÀNH MÔN BẮT BUỘC NẾU KHÔNG CÒN MÔN THIẾU */}
                  {failedMandatoryCourses.length === 0 && unregisteredMandatoryCourses.length === 0 && (
                    <div className="rounded-xl bg-emerald-50/60 p-4 border border-emerald-200 text-emerald-800 flex items-center gap-3">
                      <Check size={22} className="text-emerald-600 shrink-0" strokeWidth={2.5} />
                      <div>
                        <p className="font-bold text-sm">Đã hoàn thành toàn bộ học phần bắt buộc</p>
                        <p className="text-xs text-emerald-700 mt-0.5">
                          Sinh viên không nợ môn bắt buộc nào và đã đạt đầy đủ các học phần bắt buộc theo khung CTĐT (104 tín chỉ).
                        </p>
                      </div>
                    </div>
                  )}

                  {/* 3. KHỐI HỌC PHẦN ĐANG CHỜ CÔNG BỐ ĐIỂM THI */}
                  {pendingCourses.length > 0 && (
                    <div className="rounded-2xl border border-amber-300 bg-amber-50/40 p-4.5 space-y-3">
                      <div className="flex items-center justify-between">
                        <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                          <span className="flex h-5 w-5 items-center justify-center rounded-full bg-amber-200 text-amber-900 text-xs font-bold">
                            ⏳
                          </span>
                          <span>Học phần đang chờ công bố điểm thi ({pendingCourses.length} môn)</span>
                        </h3>
                        <span className="text-xs text-amber-800 bg-amber-100 px-2.5 py-1 rounded-full font-bold">
                          Đang chờ điểm thi / bảo vệ đồ án
                        </span>
                      </div>

                      <div className="grid gap-2.5 sm:grid-cols-2">
                        {pendingCourses.map((course: ApiData) => (
                          <div
                            key={`${course.courseId}-${course.curriculumSemesterNo}`}
                            className="rounded-xl border border-amber-200 bg-white p-3.5 flex flex-col justify-between shadow-2xs"
                          >
                            <div>
                              <div className="flex items-start justify-between gap-2">
                                <p className="font-bold text-slate-900 text-xs">
                                  {course.courseCode} • {course.courseName}
                                </p>
                                <span className="inline-flex shrink-0 rounded-md bg-amber-100 px-1.5 py-0.5 text-[10px] font-bold text-amber-800">
                                  Chờ điểm
                                </span>
                              </div>
                              <p className="mt-1 text-xs text-slate-500">
                                {course.credits} tín chỉ • Lộ trình: Học kỳ {course.curriculumSemesterNo}
                              </p>
                            </div>
                            <p className="mt-2.5 pt-2 border-t border-amber-100 text-[11px] text-amber-800 font-medium">
                              👉 Sinh viên đã đăng ký học phần này. Ngay sau khi có kết quả điểm thi chính thức, hệ thống sẽ tự động chuyển trạng thái đủ điều kiện tốt nghiệp.
                            </p>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* 4. KHỐI TÌNH TRẠNG HỌC PHẦN TỰ CHỌN (QUY CHẾ CTĐT K44: YÊU CẦU 46 TÍN CHỈ) */}
                  <div
                    className={`rounded-2xl border p-4.5 space-y-3.5 ${
                      isElectiveSatisfied ? "border-emerald-200 bg-emerald-50/20" : "border-amber-200 bg-amber-50/20"
                    }`}
                  >
                    <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
                      <div>
                        <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                          <BookOpen size={16} className={isElectiveSatisfied ? "text-emerald-600" : "text-amber-600"} />
                          <span>Tình trạng tín chỉ Tự chọn (Theo CTĐT K44: Yêu cầu tối thiểu {requiredElecCredits} tín chỉ)</span>
                        </h3>
                        <p className="text-xs text-slate-500 mt-0.5">
                          Đã tích lũy: <strong className="text-slate-800">{studentElecCredits} / {requiredElecCredits} tín chỉ</strong>
                          {isElectiveSatisfied ? " (Đã hoàn thành yêu cầu tự chọn)" : ` (Còn thiếu ${missingElecCredits} tín chỉ)`}
                        </p>
                      </div>

                      {isElectiveSatisfied ? (
                        <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-3 py-1 text-xs font-extrabold text-emerald-800">
                          <Check size={13} strokeWidth={3} />
                          Đã đạt chuẩn tự chọn {excessElecCredits > 0 && `(Đăng ký dư +${excessElecCredits} TC)`}
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-3 py-1 text-xs font-extrabold text-amber-800">
                          Cần tích lũy thêm {missingElecCredits} TC
                        </span>
                      )}
                    </div>

                    {/* Diễn giải quy chế tín chỉ tự chọn & đăng ký dư */}
                    {isElectiveSatisfied ? (
                      <div className="rounded-xl border border-emerald-200 bg-white p-3.5 text-xs text-emerald-900 space-y-1.5">
                        <p className="font-semibold text-emerald-950 flex items-center gap-1.5">
                          <span>✓</span>
                          <span>Sinh viên đã hoàn thành đủ số tín chỉ tự chọn theo khung CTĐT</span>
                        </p>
                        <p className="text-slate-600 leading-relaxed text-[11px]">
                          Theo quy chế đào tạo tín chỉ (CTĐT K44), sinh viên được quyền đăng ký học các môn tự chọn tùy theo định hướng và có thể đăng ký vượt số tín chỉ quy định (sinh viên đã tích lũy <strong>{studentElecCredits} tín chỉ</strong>, vượt {excessElecCredits} tín chỉ). Sinh viên <strong>không cần phải đăng ký thêm bất kỳ môn tự chọn nào khác</strong> trong danh mục CTĐT.
                        </p>
                      </div>
                    ) : (
                      <div className="rounded-xl border border-amber-200 bg-white p-3.5 text-xs text-amber-900 space-y-1.5">
                        <p className="font-semibold text-amber-950 flex items-center gap-1.5">
                          <span>⚠️</span>
                          <span>Sinh viên cần tích lũy thêm tối thiểu {missingElecCredits} tín chỉ tự chọn</span>
                        </p>
                        <p className="text-slate-600 leading-relaxed text-[11px]">
                          Sinh viên có thể tùy chọn đăng ký các học phần tự chọn phù hợp trong danh mục gợi ý bên dưới để hoàn thành đủ số tín chỉ thiếu.
                        </p>
                      </div>
                    )}

                    {/* Trường hợp có môn tự chọn từng học và bị điểm F (Ví dụ Kinh tế học đại cương) */}
                    {failedElectiveCourses.length > 0 && (
                      <div className="rounded-xl border border-slate-200 bg-white p-3.5 space-y-2.5">
                        <div className="flex items-center justify-between">
                          <p className="font-bold text-xs text-slate-800 flex items-center gap-1.5">
                            <span className="text-slate-400 font-mono">ℹ</span>
                            <span>Học phần tự chọn từng học nhưng chưa đạt ({failedElectiveCourses.length} môn)</span>
                          </p>
                          <span
                            className={`text-[10px] font-bold px-2 py-0.5 rounded-md ${
                              isElectiveSatisfied ? "bg-slate-100 text-slate-700" : "bg-amber-100 text-amber-800"
                            }`}
                          >
                            {isElectiveSatisfied ? "Không bắt buộc học lại" : "Có thể học lại hoặc chọn môn khác thay thế"}
                          </span>
                        </div>

                        <div className="space-y-2">
                          {failedElectiveCourses.map((c: ApiData) => (
                            <div key={c.courseCode} className="rounded-lg bg-slate-50 p-2.5 border border-slate-100 text-xs">
                              <div className="flex items-center justify-between">
                                <span className="font-semibold text-slate-900">
                                  {c.courseCode} • {c.courseName}
                                </span>
                                <span className="text-rose-600 font-mono font-bold">
                                  Điểm {c.gradeInfo?.score10 ?? "—"} ({c.gradeInfo?.letterGrade || "F"})
                                </span>
                              </div>
                              <p className="text-[11px] text-slate-500 mt-1">
                                {isElectiveSatisfied ? (
                                  <span>
                                    💡 <strong>Giải thích quy chế:</strong> Đây là học phần tự chọn ({c.credits} TC). Do sinh viên đã tích lũy đủ{" "}
                                    <strong>{studentElecCredits}/{requiredElecCredits} tín chỉ tự chọn</strong> từ các môn khác (vượt {excessElecCredits} TC theo CTĐT K44), học phần này không cản trở việc xét tốt nghiệp và{" "}
                                    <strong>sinh viên không bắt buộc phải học lại</strong>.
                                  </span>
                                ) : (
                                  <span>
                                    💡 <strong>Hướng dẫn:</strong> Đây là học phần tự chọn ({c.credits} TC). Sinh viên có thể chọn đăng ký học lại học phần này HOẶC chọn môn tự chọn khác thay thế để bù {missingElecCredits} tín chỉ tự chọn còn thiếu.
                                  </span>
                                )}
                              </p>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Danh mục môn tự chọn gợi ý (Chỉ hiển thị khi sinh viên THỰC SỰ THIẾU tín chỉ tự chọn) */}
                    {!isElectiveSatisfied && availableElectives.length > 0 && (
                      <div className="rounded-xl border border-amber-200 bg-amber-50/30 p-3.5 space-y-2.5">
                        <div className="flex items-center justify-between">
                          <p className="font-bold text-xs text-amber-950">
                            Gợi ý các học phần tự chọn trong CTĐT (Tùy chọn đăng ký)
                          </p>
                          <span className="text-[10px] text-amber-800 bg-amber-100 px-2 py-0.5 rounded-md font-semibold">
                            Chỉ cần tích lũy đủ {missingElecCredits} TC, không cần học toàn bộ
                          </span>
                        </div>
                        <div className="grid gap-2 sm:grid-cols-2">
                          {availableElectives.slice(0, 8).map((course: ApiData) => (
                            <div key={course.courseCode} className="rounded-lg border border-slate-200 bg-white p-2.5 text-xs">
                              <p className="font-bold text-slate-900">
                                {course.courseCode} • {course.courseName}
                              </p>
                              <p className="text-[11px] text-slate-500 mt-0.5">{course.credits} tín chỉ tự chọn</p>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Tiến độ tín chỉ tự chọn */}
                  {electiveGroups.length > 0 && (
                    <div className="rounded-2xl border border-slate-200 bg-white p-4.5 space-y-3">
                      <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                        <BookOpen size={16} className="text-lime-600" />
                        <span>Tiến độ các nhóm học phần tự chọn</span>
                      </h3>

                      <div className="grid gap-2.5 sm:grid-cols-2">
                        {electiveGroups.map((group: ApiData, index: number) => {
                          const passed = Number(group.passedCredits || 0);
                          const required = Number(group.requiredCredits || 0);
                          const isOk = passed >= required;
                          const percent = required > 0 ? Math.min(100, Math.round((passed / required) * 100)) : 100;

                          return (
                            <div
                              key={`${group.groupCode || "group"}-${index}`}
                              className={`rounded-xl border p-3.5 text-xs ${
                                isOk ? "border-slate-200 bg-white" : "border-amber-200 bg-amber-50/20"
                              }`}
                            >
                              <div className="flex items-center justify-between">
                                <p className="font-bold text-slate-900">{group.groupCode || "Nhóm tự chọn"}</p>
                                <span
                                  className={`font-mono text-xs font-bold ${
                                    isOk ? "text-emerald-700" : "text-amber-700"
                                  }`}
                                >
                                  {passed} / {required} tín chỉ ({percent}%)
                                </span>
                              </div>
                              <div className="mt-2 h-2 w-full rounded-full bg-slate-100 overflow-hidden">
                                <div
                                  className={`h-full rounded-full transition-all ${
                                    isOk ? "bg-emerald-500" : "bg-amber-500"
                                  }`}
                                  style={{ width: `${percent}%` }}
                                />
                              </div>
                              {!isOk ? (
                                <p className="mt-2 text-[11px] text-amber-700 font-medium">
                                  ⚠️ Cần tích lũy thêm <strong>{required - passed} tín chỉ</strong> trong nhóm này để đủ điều kiện tốt nghiệp.
                                </p>
                              ) : (
                                <p className="mt-2 text-[11px] text-emerald-700 font-medium">
                                  ✓ Đã hoàn thành đủ số tín chỉ yêu cầu.
                                </p>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}

                  {/* Mục thu gọn: Xem 11 tiêu chí kỹ thuật quy chế cho thanh tra / đối soát */}
                  <div className="rounded-xl border border-slate-200 bg-slate-50/60 p-3">
                    <button
                      type="button"
                      onClick={() => setShowTechnicalChecklist(!showTechnicalChecklist)}
                      className="w-full flex items-center justify-between text-xs font-bold text-slate-700 hover:text-slate-900 transition cursor-pointer"
                    >
                      <span className="flex items-center gap-1.5">
                        <Info size={14} className="text-slate-500" />
                        <span>Xem bảng đối soát 11 tiêu chuẩn quy chế đào tạo (Dành cho cán bộ thanh tra / đối soát)</span>
                      </span>
                      <ChevronDown
                        size={15}
                        className={`transition-transform duration-200 ${showTechnicalChecklist ? "rotate-180" : ""}`}
                      />
                    </button>

                    {showTechnicalChecklist && (
                      <div className="mt-3 pt-3 border-t border-slate-200 space-y-2">
                        <p className="text-[11px] text-slate-500 italic mb-2">
                          Đối chiếu theo Quy chế Đào tạo trình độ đại học hiện hành của Trường Đại học Đà Lạt.
                        </p>
                        <div className="grid gap-2 sm:grid-cols-2">
                          {(Array.isArray(selectedStudent.requirements) ? selectedStudent.requirements : Array.isArray(evaluation?.rulesChecklist) ? evaluation.rulesChecklist : []).map(
                            (rule: ApiData) => {
                              const isPass = rule.result === "PASS";
                              const isPend = rule.result === "PENDING";
                              const isFail = rule.result === "FAIL";

                              return (
                                <div
                                  key={rule.ruleCode}
                                  className={`rounded-lg border p-2.5 text-xs ${
                                    isPass
                                      ? "border-emerald-200 bg-emerald-50/30"
                                      : isPend
                                      ? "border-amber-200 bg-amber-50/30"
                                      : isFail
                                      ? "border-rose-200 bg-rose-50/30"
                                      : "border-slate-200 bg-white"
                                  }`}
                                >
                                  <div className="flex items-center justify-between gap-1">
                                    <p className="font-bold text-slate-800 text-[11px]">{rule.ruleName}</p>
                                    <span
                                      className={`inline-flex rounded px-1.5 py-0.5 text-[10px] font-bold ${
                                        isPass
                                          ? "bg-emerald-100 text-emerald-800"
                                          : isPend
                                          ? "bg-amber-100 text-amber-800"
                                          : isFail
                                          ? "bg-rose-100 text-rose-800"
                                          : "bg-slate-100 text-slate-700"
                                      }`}
                                    >
                                      {isPass ? "Đạt" : isPend ? "Chờ xác nhận" : isFail ? "Chưa đạt" : "Chưa có dữ liệu"}
                                    </span>
                                  </div>
                                  {rule.reason && (
                                    <p className="mt-1 text-[10.5px] text-slate-600">{rule.reason}</p>
                                  )}
                                </div>
                              );
                            }
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              )}

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
                      <p className="text-[10px] font-bold uppercase text-amber-700">Đang chờ điểm</p>
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
                      <option value="pending">Chỉ xem môn chờ điểm</option>
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
                              const isFail = !g.isPassed && g.scoreStatus !== "pending" && !g.notScore;
                              const isPendingGrade = g.scoreStatus === "pending" || g.notScore;

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
                                        Chờ điểm
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
              onChange={(e) => setSelectedCohort(e.target.value)}
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
              onChange={(e) => setSelectedProgram(e.target.value)}
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
                onChange={(e) => setSelectedTerm(e.target.value)}
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
              onChange={(e) => setTargetType(e.target.value)}
              className="h-9 w-full rounded-xl border border-slate-300 bg-white px-3 font-medium outline-none focus:border-lime-500"
            >
              <option value="all_students">Tất cả sinh viên trong khóa / ngành</option>
              <option value="active_students">Chỉ sinh viên đang còn học (bỏ nghỉ/thôi học)</option>
            </select>
          </div>

          {preview && (
            <div className="rounded-xl border border-slate-200 bg-slate-50 p-3 space-y-1.5 text-xs">
              <p className="font-bold text-slate-800">Kết quả kiểm tra dữ liệu sơ bộ:</p>
              <div className="grid grid-cols-2 gap-2 text-[11px]">
                <p>Tổng sinh viên xét: <strong>{preview.totalStudents}</strong></p>
                <p>Số môn đào tạo: <strong>{preview.scope?.courseCount || "—"}</strong></p>
              </div>
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
              disabled={previewLoading || runLoading}
              className="rounded-xl bg-lime-600 px-4 py-2 text-xs font-bold text-white shadow-xs hover:bg-lime-700 cursor-pointer disabled:opacity-50"
            >
              {runLoading ? "Đang xử lý..." : "Xác nhận chạy"}
            </button>
          </div>
        </form>
      </Modal>
    </main>
  );
}
