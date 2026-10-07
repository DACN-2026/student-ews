"use client";

import TableAction from "@/components/ui/TableAction";
import TextLabel, { plainTextClasses } from "@/components/ui/TextLabel";
import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import { AlertTriangle, Check, CircleHelp, Clock, Download, FileCheck2, Filter, GraduationCap, Info, LoaderCircle, Play, RefreshCw, Search, ShieldAlert, Users, X, FileSpreadsheet, Eye } from "lucide-react";
import { studyTimeline } from "@/lib/academic-timeline";
import { apiFetch } from "@/lib/api-client";
import Modal from "@/components/ui/Modal";
import dynamic from "next/dynamic";
const ForecastDetail = dynamic(() => import("@/components/graduation/ForecastDetail"), { loading: () => <p role="status" className="p-6 text-sm text-slate-500">Đang tải chi tiết tốt nghiệp...</p> });
import { toast } from "@/components/ui/Toast";
import ForbiddenState from "@/components/ui/ForbiddenState";
import { useAuthStore } from "@/stores/authStore";

const STATUS_META: Record<
  string,
  { label: string; short: string; tone: string; pillBg: string; textColor: string; dotColor: string; icon: typeof Check }
> = {
  EXPECTED_ELIGIBLE: {
    label: "Đủ yêu cầu",
    short: "Đủ yêu cầu",
    tone: "bg-emerald-50 text-emerald-800 border-emerald-200",
    pillBg: "bg-emerald-100 text-emerald-800 border-emerald-300",
    textColor: "text-emerald-700",
    dotColor: "bg-emerald-500",
    icon: Check,
  },
  PENDING_GRADE: {
    label: "Đang hoàn thiện",
    short: "Đang hoàn thiện",
    tone: "bg-sky-50 text-sky-800 border-sky-200",
    pillBg: "bg-sky-100 text-sky-800 border-sky-300",
    textColor: "text-sky-700",
    dotColor: "bg-sky-500",
    icon: Clock,
  },
  PENDING_REQUIREMENT: {
    label: "Chờ bổ sung điều kiện",
    short: "Chờ bổ sung",
    tone: "bg-sky-50 text-sky-800 border-sky-200",
    pillBg: "bg-sky-100 text-sky-800 border-sky-300",
    textColor: "text-sky-700",
    dotColor: "bg-sky-400",
    icon: CircleHelp,
  },
  NOT_ELIGIBLE: {
    label: "Còn thiếu",
    short: "Còn thiếu",
    tone: "bg-amber-50 text-amber-800 border-amber-200",
    pillBg: "bg-amber-100 text-amber-800 border-amber-300",
    textColor: "text-amber-700",
    dotColor: "bg-amber-500",
    icon: AlertTriangle,
  },
  MANUAL_REVIEW: {
    label: "Cần đối soát",
    short: "Đối soát",
    tone: "bg-slate-100 text-slate-700 border-slate-200",
    pillBg: "bg-slate-200 text-slate-700 border-slate-300",
    textColor: "text-slate-600",
    dotColor: "bg-slate-400",
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

/**
 * Determine study year and whether cohort is final year
 * Căn cứ Kế hoạch giảng dạy NH 2026-2027 (Mẫu 07/QLĐT - Đại học Đà Lạt):
 * - K46: Năm 5 (Năm cuối - Tốt nghiệp)
 * - K47: Năm 4
 * - K48: Năm 3
 * - K49: Năm 2
 * - K50: Năm 1
 */
function getCohortStudyYearInfo(run: ApiData | null): { yearNumber: number; isFinalYear: boolean; label: string } {
  if (!run) return { yearNumber: 5, isFinalYear: true, label: "Năm cuối (Năm 5)" };
  if (run.targetType === "final_year" || run.targetType === "overdue") {
    return { yearNumber: 5, isFinalYear: true, label: "Năm cuối (Năm 5)" };
  }

  const cohortCode = String(run.cohortCode || "").toUpperCase();
  const matchK = cohortCode.match(/^K(\d+)/);
  if (matchK) {
    const kNum = parseInt(matchK[1], 10);
    // K46 và các khóa trước đó là sinh viên năm cuối (Năm 5) / tốt nghiệp
    if (kNum <= 46) {
      return { yearNumber: 5, isFinalYear: true, label: "Năm cuối (Năm 5)" };
    }
    // K47 là sinh viên năm 4
    if (kNum === 47) {
      return { yearNumber: 4, isFinalYear: false, label: "Năm 4" };
    }
    // K48 là sinh viên năm 3
    if (kNum === 48) {
      return { yearNumber: 3, isFinalYear: false, label: "Năm 3" };
    }
    // K49 là sinh viên năm 2
    if (kNum === 49) {
      return { yearNumber: 2, isFinalYear: false, label: "Năm 2" };
    }
    return { yearNumber: 1, isFinalYear: false, label: "Năm 1" };
  }

  // Fallback check
  const isFinal = cohortCode.includes("K46") || cohortCode.includes("K45") || cohortCode.includes("K44");
  return {
    yearNumber: isFinal ? 5 : 3,
    isFinalYear: isFinal,
    label: isFinal ? "Năm cuối (Năm 5)" : "Năm 2 - Năm 4",
  };
}

export default function GraduationForecastPage() {
  const { user, can, status } = useAuthStore();
  const isClassAdvisor = user?.role === "CLASS_ADVISOR";
  const isFacultyBoard = user?.role === "FACULTY_BOARD";

  const scopeBadgeText = isClassAdvisor
    ? null
    : isFacultyBoard
    ? `Phạm vi: ${user?.facultyCode ? `Khoa ${user.facultyCode}` : "Phạm vi Khoa"}`
    : null;

  const pageTitle = isClassAdvisor
    ? `Dự kiến tốt nghiệp • Lớp ${user?.className || ""}`
    : isFacultyBoard
    ? "Dự kiến tốt nghiệp Khoa"
    : "Dự kiến tốt nghiệp";

  const [runs, setRuns] = useState<ApiData[]>([]);
  const [cohorts, setCohorts] = useState<ApiData[]>([]);
  const [programs, setPrograms] = useState<ApiData[]>([]);
  const [years, setYears] = useState<ApiData[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");

  // Category view mode: default is final_year as requested
  const [batchCategory, setBatchCategory] = useState<"final_year" | "ongoing" | "all">("final_year");

  // Selected batch
  const [selectedRun, setSelectedRun] = useState<ApiData | null>(null);

  // Student list in selected batch
  const [students, setStudents] = useState<ApiData[]>([]);
  const [studentPage, setStudentPage] = useState(1);
  const studentPageSize = 20;
  const [studentTotal, setStudentTotal] = useState(0);
  const [batchClasses, setBatchClasses] = useState<ApiData[]>([]);
  const [statusCounts, setStatusCounts] = useState({ all: 0, EXPECTED_ELIGIBLE: 0, PENDING_GRADE: 0, NOT_ELIGIBLE: 0, PENDING_REQUIREMENT: 0, MANUAL_REVIEW: 0 });
  const [studentsError, setStudentsError] = useState("");
  const [statisticsError, setStatisticsError] = useState("");
  const [statisticsScope, setStatisticsScope] = useState("");
  const [studentsRetry, setStudentsRetry] = useState(0);
  const [studentsLoading, setStudentsLoading] = useState(false);
  const [statusFilter, setStatusFilter] = useState("all");
  const [keyword, setKeyword] = useState("");

  // Class filter (Lớp)
  const [classFilter, setClassFilter] = useState("all");

  const statisticsReady = statisticsScope === `${selectedRun?.id}:${classFilter}`;

  // Filter batches by cohort
  const [cohortFilter, setCohortFilter] = useState<string>("all");

  // Student Detail Modal
  const [selectedStudent, setSelectedStudent] = useState<ApiData | null>(null);
  const [studentLoading, setStudentLoading] = useState(false);
  const [studentModalTab, setStudentModalTab] = useState<"summary" | "transcript">("summary");

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

  const changeStatusFilter = (value: string) => { setStatusFilter(value); setStudentPage(1); };
  const changeClassFilter = (value: string) => { setClassFilter(value); setStudentPage(1); };
  const changeKeyword = (value: string) => { setKeyword(value); setStudentPage(1); };

  useEffect(() => {
    if (!selectedRun) return;
    const controller = new AbortController();
    // This effect starts an API request for the selected page.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setStudentsLoading(true);
    setStudentsError("");
    setStatisticsError("");
    const timer = window.setTimeout(async () => {
      try {
        const params = new URLSearchParams({ page: String(studentPage), pageSize: String(studentPageSize) });
        if (statusFilter !== "all") params.set("status", statusFilter);
        if (classFilter !== "all") params.set("classId", classFilter);
        if (keyword.trim()) params.set("keyword", keyword.trim());
        const response = await apiFetch(`/api/v1/graduation-evaluations/${selectedRun.id}/students?${params}`, { signal: controller.signal });
        const data = await response.json();
        if (!response.ok) throw new Error(data.error?.message || "Không thể tải danh sách sinh viên.");
        if (controller.signal.aborted) return;
        setStudents(data.items || []);
        setStudentTotal(data.total ?? 0);
        if (typeof data.statusCounts?.all === "number") {
          setBatchClasses(data.classes || []);
          setStatusCounts({ all: 0, EXPECTED_ELIGIBLE: 0, PENDING_GRADE: 0, NOT_ELIGIBLE: 0, PENDING_REQUIREMENT: 0, MANUAL_REVIEW: 0, ...data.statusCounts });
          setStatisticsScope(`${selectedRun.id}:${classFilter}`);
        } else {
          setStatisticsScope("");
          setStatisticsError("Chưa nhận được thống kê từ máy chủ. Vui lòng tải lại dữ liệu.");
        }
      } catch (error) {
        if (!controller.signal.aborted) {
          setStudents([]);
          setStudentTotal(0);
          setStudentsError(error instanceof Error ? error.message : "Không thể tải danh sách sinh viên.");
        }
      } finally {
        if (!controller.signal.aborted) setStudentsLoading(false);
      }
    }, keyword.trim() ? 300 : 0);
    return () => { window.clearTimeout(timer); controller.abort(); };
  }, [selectedRun, studentPage, statusFilter, classFilter, keyword, studentsRetry]);

  const loadInitial = useCallback(async () => {
    setLoading(true);
    setLoadError("");
    try {
      const [runResponse, cohortResponse, programResponse, yearResponse] = await Promise.all([
        apiFetch("/api/v1/graduation-evaluations?pageSize=100&status=completed&latestPerScope=true"),
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

      // Mặc định ưu tiên sinh viên năm cuối / đợt tốt nghiệp (K46)
      if (fetchedRuns.length > 0) {
        const finalYearRun = fetchedRuns.find((r) => getCohortStudyYearInfo(r).isFinalYear) || fetchedRuns[0];
        setSelectedRun(finalYearRun);
        setStudentPage(1);
        setStatusFilter("all");
        setClassFilter("all");
        setKeyword("");
      }
    } catch (error) {
      setLoadError(error instanceof Error ? error.message : "Không thể tải dữ liệu.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => void loadInitial(), 0);
    return () => window.clearTimeout(timer);
  }, [loadInitial]);

  const selectRun = async (run: ApiData) => {
    setSelectedRun(run);
    setStatusFilter("all");

    setClassFilter("all");

    setKeyword("");
    setStudentPage(1);
  };

  const openStudent = async (student: ApiData, defaultTab: "summary" | "transcript" = "summary") => {
    if (!selectedRun) return;
    setStudentLoading(true);
    setStudentModalTab(defaultTab);
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

  // Split runs into categories
  const finalYearRuns = useMemo(() => runs.filter((r) => getCohortStudyYearInfo(r).isFinalYear), [runs]);
  const ongoingRuns = useMemo(() => runs.filter((r) => !getCohortStudyYearInfo(r).isFinalYear), [runs]);

  // Handle switching category tab
  const handleCategoryChange = (category: "final_year" | "ongoing" | "all") => {
    setBatchCategory(category);
    setCohortFilter("all");

    if (category === "final_year" && finalYearRuns.length > 0) {
      if (!selectedRun || !getCohortStudyYearInfo(selectedRun).isFinalYear) {
        void selectRun(finalYearRuns[0]);
      }
    } else if (category === "ongoing" && ongoingRuns.length > 0) {
      if (!selectedRun || getCohortStudyYearInfo(selectedRun).isFinalYear) {
        void selectRun(ongoingRuns[0]);
      }
    }
  };

  // Category pool runs before cohortFilter
  const categoryRuns = useMemo(() => {
    if (isClassAdvisor) return runs;
    if (batchCategory === "final_year") return finalYearRuns;
    if (batchCategory === "ongoing") return ongoingRuns;
    return runs;
  }, [isClassAdvisor, runs, batchCategory, finalYearRuns, ongoingRuns]);

  // Unique cohort codes in currently selected category (does not shrink when filtered)
  const uniqueCohortCodes = useMemo(() => {
    const set = new Set<string>();
    categoryRuns.forEach((r) => {
      if (r.cohortCode) set.add(r.cohortCode);
    });
    return Array.from(set).sort();
  }, [categoryRuns]);

  // Filter runs list by category and cohort
  const filteredRuns = useMemo(() => {
    if (cohortFilter === "all") return categoryRuns;
    return categoryRuns.filter((r) => r.cohortCode === cohortFilter);
  }, [categoryRuns, cohortFilter]);

  const selectedTotalCreditsThreshold = configuredThreshold(selectedRun?.sourceSnapshot, "TOTAL_CREDITS", 150) || 150;

  // Graduation status options, counted within the selected class scope.
  const finalYearStatusOptions = useMemo(() => [
    {
      key: "all",
      label: "Tất cả",
      count: statisticsReady ? statusCounts.all : "…",
    },
    {
      key: "EXPECTED_ELIGIBLE",
      label: "Đủ yêu cầu",
      count: statisticsReady ? statusCounts.EXPECTED_ELIGIBLE : "…",
    },
    {
      key: "PENDING_GRADE",
      label: "Đang hoàn thiện",
      count: statisticsReady ? statusCounts.PENDING_GRADE : "…",
    },
    {
      key: "NOT_ELIGIBLE",
      label: "Còn thiếu",
      count: statisticsReady ? statusCounts.NOT_ELIGIBLE : "…",
    },
  ], [statusCounts, statisticsReady]);

  // ==========================================
  // FILTERED STUDENTS LIST
  // ==========================================
  const filteredStudents = students;

  if (status !== "loading" && status !== "idle" && !can("graduation.read")) {
    return <ForbiddenState requiredPermission="graduation.read" />;
  }

  return (
    <div className="p-6 space-y-6 max-w-7xl mx-auto text-slate-800">
      {/* 1. Header & Actions */}
      <header className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between border-b border-slate-200/80 pb-5">
        <div>
          <div className="flex items-center gap-2 flex-wrap text-xs font-semibold uppercase tracking-wider text-lime-700">
            <GraduationCap size={18} className="text-lime-600" />
            <span>Đại học Đà Lạt • Quản lý Đào tạo</span>
            {scopeBadgeText && (
              <>
                <span className="text-slate-300">•</span>
                <TextLabel className="inline-flex items-center text-xs font-medium text-emerald-700 lowercase first-letter:uppercase">
                  {scopeBadgeText}
                </TextLabel>
              </>
            )}
          </div>
          <h1 className="mt-1 text-2xl font-extrabold tracking-tight text-slate-900 sm:text-3xl">
            {pageTitle}
          </h1>
          <p className="mt-1 text-sm text-slate-500">
            Đối chiếu điều kiện tốt nghiệp của sinh viên theo từng đợt đánh giá.
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

      {studentsError && <div role="alert" className="text-sm text-rose-700">{studentsError} <button type="button" onClick={() => setStudentsRetry((value) => value + 1)} className="font-semibold underline">Thử lại</button></div>}
      {/* 2. KHU VỰC CHỌN ĐỐI TƯỢNG VÀ ĐỢT ĐÁNH GIÁ */}
      <section aria-labelledby="batch-selector-heading" className="space-y-3.5">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-2">
            <h2 id="batch-selector-heading" className="text-base font-bold text-slate-900">
              1. Chọn đợt đánh giá
            </h2>
          </div>

          {/* CHỌN NHÓM ĐỐI TƯỢNG: MẶC ĐỊNH LÀ SINH VIÊN NĂM CUỐI */}
          {!isClassAdvisor && (
          <div className="flex flex-wrap items-center gap-1.5 p-1 bg-slate-100 rounded-xl text-xs font-bold">
            <button
              type="button"
              onClick={() => handleCategoryChange("final_year")}
              className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 transition cursor-pointer ${
                batchCategory === "final_year"
                  ? "bg-white text-slate-900 shadow-xs"
                  : "text-slate-600 hover:text-slate-900"
              }`}
            >
              <span>Sinh viên năm cuối (Năm 5)</span>
              <TextLabel className="text-lime-800 text-[10px] font-mono">
                {finalYearRuns.length}
              </TextLabel>
            </button>
            <button
              type="button"
              onClick={() => handleCategoryChange("ongoing")}
              className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 transition cursor-pointer ${
                batchCategory === "ongoing"
                  ? "bg-white text-slate-900 shadow-xs"
                  : "text-slate-600 hover:text-slate-900"
              }`}
            >
              <span>Sinh viên năm 2 - 4</span>
              <TextLabel className="text-blue-800 text-[10px] font-mono">
                {ongoingRuns.length}
              </TextLabel>
            </button>
            <button
              type="button"
              onClick={() => handleCategoryChange("all")}
              className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 transition cursor-pointer ${
                batchCategory === "all"
                  ? "bg-white text-slate-900 shadow-xs"
                  : "text-slate-600 hover:text-slate-900"
              }`}
            >
              <span>Tất cả ({runs.length})</span>
            </button>
          </div>
          )}
        </div>

        {/* Lọc nhanh theo khóa học nếu có nhiều khóa trong nhóm */}
        {uniqueCohortCodes.length > 1 && (
          <div className="flex items-center gap-2 pt-1">
            <span className="text-xs font-semibold text-slate-500">Khóa sinh viên:</span>
            <div className="flex rounded-lg bg-slate-100 p-0.5 text-xs">
              <button
                type="button"
                onClick={() => setCohortFilter("all")}
                className={`rounded-md px-2.5 py-1 font-semibold transition cursor-pointer ${
                  cohortFilter === "all" ? "bg-white text-slate-900 shadow-xs" : "text-slate-600 hover:text-slate-900"
                }`}
              >
                Tất cả ({categoryRuns.length})
              </button>
              {uniqueCohortCodes.map((code) => {
                const count = categoryRuns.filter((r) => r.cohortCode === code).length;
                return (
                  <button
                    key={code}
                    type="button"
                    onClick={() => {
                      setCohortFilter(code);
                      const matchingRun = categoryRuns.find((r) => r.cohortCode === code);
                      if (matchingRun && selectedRun?.cohortCode !== code) {
                        void selectRun(matchingRun);
                      }
                    }}
                    className={`rounded-md px-2.5 py-1 font-semibold transition cursor-pointer ${
                      cohortFilter === code ? "bg-white text-slate-900 shadow-xs font-bold" : "text-slate-600 hover:text-slate-900"
                    }`}
                  >
                    Khóa {code} {count > 1 ? `(${count})` : ""}
                  </button>
                );
              })}
            </div>
          </div>
        )}

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
        ) : filteredRuns.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50/50 p-8 text-center">
            <FileCheck2 size={36} className="mx-auto text-slate-400 mb-2" />
            <p className="font-bold text-slate-800">Chưa có đợt đánh giá nào trong nhóm này</p>
            <p className="text-xs text-slate-500 mt-1">Hãy chuyển sang nhóm khác hoặc bấm &quot;Chạy đánh giá đợt mới&quot; để tạo dữ liệu.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2 lg:grid-cols-3">
            {filteredRuns.map((run) => {
              const isSelected = selectedRun?.id === run.id;

              return (
                <button
                  key={run.id}
                  type="button"
                  onClick={() => void selectRun(run)}
                  className={`group relative flex items-center justify-between gap-3 rounded-xl border px-3.5 py-2.5 text-left transition-all cursor-pointer ${
                    isSelected
                      ? "border-lime-500 bg-lime-50/40 shadow-xs ring-2 ring-lime-500/20"
                      : "border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50/70"
                  }`}
                >
                  <div className="flex items-center gap-2 min-w-0">
                    <TextLabel className="inline-flex font-mono text-xs font-bold text-slate-700 shrink-0">
                      {run.cohortCode || "Khóa"}
                    </TextLabel>
                    <span className="text-sm font-bold text-slate-900 truncate">
                      {run.programName || run.programCode}
                    </span>
                  </div>

                  <div className="shrink-0">
                    {isSelected ? (
                      <TextLabel className="inline-flex items-center gap-1 text-xs font-bold text-lime-700">

                        Đang xem
                      </TextLabel>
                    ) : (
                      <TextLabel className="inline-flex items-center text-xs font-medium text-slate-400 group-hover:text-slate-700 group-hover:bg-slate-100 transition">
                        Bấm để xem
                      </TextLabel>
                    )}
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </section>

      {/* 3. KHU VỰC THỐNG KÊ TỔNG QUAN & DANH SÁCH SINH VIÊN */}
      {selectedRun && (
        <section
          aria-labelledby="student-list-heading"
          className="rounded-2xl border border-slate-200 bg-white shadow-xs overflow-hidden"
        >
          {/* Header đợt đang xem & Nút tải xuất file */}
          <div className="border-b border-slate-200 bg-slate-50/80 p-4 sm:p-5 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <span className="flex h-6 w-6 items-center justify-center rounded-full bg-lime-100 text-lime-800 text-xs font-bold">
                  2
                </span>
                <h2 id="student-list-heading" className="text-base font-bold text-slate-900">
                  Dự kiến tốt nghiệp sinh viên: {selectedRun.cohortCode} • {selectedRun.programName || selectedRun.programCode}
                </h2>
              </div>
              <p className="mt-0.5 text-xs text-slate-500 pl-8">
                Đợt xét: {selectedRun.assessmentTermCode} ({selectedRun.assessmentAcademicYear}) • Tổng số:{" "}
                <strong className="text-slate-800">{statisticsReady ? statusCounts.all : "…"} sinh viên {classFilter !== "all" && `(Lớp ${batchClasses.find((cls) => cls.classId === classFilter)?.className || classFilter})`}</strong>
                {" • "}Chuẩn CTĐT: <strong className="text-slate-800">{selectedTotalCreditsThreshold} tín chỉ</strong>
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-2 pl-8 lg:pl-0">

              {can("graduation.export") && (
                <div className="flex items-center gap-1.5 ml-2">
                  <a
                    href={`/api/v1/graduation-evaluations/${selectedRun.id}/export?format=xlsx`}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 shadow-xs transition hover:bg-slate-50 hover:text-emerald-700 cursor-pointer"
                  >
                    <Download size={13} />
                    Xuất Excel
                  </a>
                  <a
                    href={`/api/v1/graduation-evaluations/${selectedRun.id}/export?format=pdf`}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 shadow-xs transition hover:bg-slate-50 hover:text-rose-700 cursor-pointer"
                  >
                    <Download size={13} />
                    Xuất PDF
                  </a>
                </div>
              )}
            </div>
          </div>

          {/* ========================================================= */}
          {/* ĐÁNH GIÁ ĐIỀU KIỆN TỐT NGHIỆP                   */}
          {/* ========================================================= */}
            <div className="p-4 sm:p-5 space-y-5 bg-white">
              {statisticsError ? (
                <div role="alert" className="flex items-center justify-between gap-3 text-xs text-rose-700">
                  <span>{statisticsError}</span>
                  <button type="button" disabled={studentsLoading} onClick={() => setStudentsRetry((value) => value + 1)} className="rounded-lg border border-slate-200 px-3 py-2 font-semibold disabled:opacity-50">
                    Thử lại thống kê
                  </button>
                </div>
              ) : !statisticsReady && (
                <p role="status" className="text-xs text-slate-500">Đang tải thống kê đợt đánh giá...</p>
              )}
              {/* THẺ TỔNG QUAN 4 CHỈ SỐ: TỔNG SV, ĐỦ YÊU CẦU, ĐANG HOÀN THIỆN, CÒN THIẾU (INTERACTIVE: BẤM ĐỂ LỌC) */}
              <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
                {/* 1. Tổng sinh viên */}
                <div
                  onClick={() => {
                    changeStatusFilter("all");

                  }}
                  className={`rounded-xl border p-4 transition cursor-pointer ${
                    statusFilter === "all"
                      ? "border-slate-800 bg-slate-100 shadow-xs ring-2 ring-slate-400"
                      : "border-slate-200 bg-slate-50/70 hover:bg-slate-100 hover:border-slate-300"
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">Tổng sinh viên</span>
                    <Users size={18} className="text-slate-400" />
                  </div>
                  <p className="mt-2 font-mono text-3xl font-extrabold text-slate-900">{statisticsReady ? statusCounts.all : "…"}</p>
                  <p className="mt-1 text-[11px] text-slate-500">
                    {classFilter === "all" ? `Khóa ${selectedRun.cohortCode}` : `Lớp ${classFilter}`} • Bấm để xem tất cả
                  </p>
                </div>

                {/* 2. Đủ yêu cầu (🟢) */}
                <div
                  onClick={() => {
                    changeStatusFilter("EXPECTED_ELIGIBLE");

                  }}
                  className={`rounded-xl border p-4 transition cursor-pointer ${
                    statusFilter === "EXPECTED_ELIGIBLE"
                      ? "border-emerald-600 bg-emerald-100/60 shadow-xs ring-2 ring-emerald-500"
                      : "border-emerald-200 bg-emerald-50/50 hover:bg-emerald-100/50 hover:border-emerald-300"
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-emerald-800 uppercase tracking-wider flex items-center gap-1.5">
                      <span className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse"></span>
                      Đủ yêu cầu
                    </span>
                    <Check size={18} className="text-emerald-600" />
                  </div>
                  <p className="mt-2 font-mono text-3xl font-extrabold text-emerald-700">{statisticsReady ? statusCounts.EXPECTED_ELIGIBLE : "…"}</p>
                  <p className="mt-1 text-[11px] text-emerald-700">Đạt toàn bộ điều kiện • Bấm để lọc</p>
                </div>

                {/* 3. Đang hoàn thiện (🔵) */}
                <div
                  onClick={() => {
                    changeStatusFilter("PENDING_GRADE");

                  }}
                  className={`rounded-xl border p-4 transition cursor-pointer ${
                    statusFilter === "PENDING_GRADE"
                      ? "border-sky-600 bg-sky-100/60 shadow-xs ring-2 ring-sky-500"
                      : "border-sky-200 bg-sky-50/50 hover:bg-sky-100/50 hover:border-sky-300"
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-sky-800 uppercase tracking-wider flex items-center gap-1.5">
                      <span className="h-2 w-2 rounded-full bg-sky-500"></span>
                      Đang hoàn thiện
                    </span>
                    <Clock size={18} className="text-sky-600" />
                  </div>
                  <p className="mt-2 font-mono text-3xl font-extrabold text-sky-700">{statisticsReady ? statusCounts.PENDING_GRADE : "…"}</p>
                  <p className="mt-1 text-[11px] text-sky-700">Đang học / chờ điểm • Bấm để lọc</p>
                </div>

                {/* 4. Còn thiếu (🟠) */}
                <div
                  onClick={() => {
                    changeStatusFilter("NOT_ELIGIBLE");

                  }}
                  className={`rounded-xl border p-4 transition cursor-pointer ${
                    statusFilter === "NOT_ELIGIBLE"
                      ? "border-amber-600 bg-amber-100/60 shadow-xs ring-2 ring-amber-500"
                      : "border-amber-200 bg-amber-50/50 hover:bg-amber-100/50 hover:border-amber-300"
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-amber-800 uppercase tracking-wider flex items-center gap-1.5">
                      <span className="h-2 w-2 rounded-full bg-amber-500"></span>
                      Còn thiếu
                    </span>
                    <AlertTriangle size={18} className="text-amber-600" />
                  </div>
                  <p className="mt-2 font-mono text-3xl font-extrabold text-amber-700">{statisticsReady ? statusCounts.NOT_ELIGIBLE : "…"}</p>
                  <p className="mt-1 text-[11px] text-amber-700">Chưa đủ điều kiện • Bấm để lọc</p>
                </div>
              </div>

              {/* BỘ LỌC TRẠNG THÁI, CHỌN LỚP VÀ Ô TÌM KIẾM */}
              <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between pt-2">
                <div className="flex items-center gap-2">
                  <label htmlFor="graduation-status-filter" className="text-xs font-semibold text-slate-500 whitespace-nowrap">
                    Trạng thái:
                  </label>
                  <select
                    id="graduation-status-filter"
                    value={statusFilter}
                    onChange={(e) => changeStatusFilter(e.target.value)}
                    className="h-10 min-w-0 flex-1 sm:flex-none rounded-xl border border-slate-200 bg-white px-3 text-xs font-semibold text-slate-700 outline-none transition focus:border-lime-500 focus:ring-2 focus:ring-lime-100 cursor-pointer"
                  >
                    {finalYearStatusOptions.map((option) => (
                      <option key={option.key} value={option.key}>
                        {option.label} ({option.count})
                      </option>
                    ))}
                  </select>
                </div>

                <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 w-full lg:w-auto">
                  {batchClasses.length > 1 ? (
                    <div className="flex items-center gap-1.5">
                      <span className="text-xs text-slate-500 font-semibold whitespace-nowrap">Lớp:</span>
                      <select
                        value={classFilter}
                        onChange={(e) => changeClassFilter(e.target.value)}
                        className="h-10 rounded-xl border border-slate-200 bg-slate-50/50 px-3 text-xs font-semibold text-slate-700 outline-none transition focus:border-lime-500 focus:bg-white focus:ring-2 focus:ring-lime-100 cursor-pointer"
                      >
                        <option value="all">Tất cả lớp ({batchClasses.reduce((sum, cls) => sum + cls.count, 0)} SV)</option>
                        {batchClasses.map((cls) => {
                          const count = cls.count;
                          return (
                            <option key={cls.classId || cls.className} value={cls.classId || ""}>
                              {cls.className} ({count} SV)
                            </option>
                          );
                        })}
                      </select>
                    </div>
                  ) : (batchClasses[0]?.className || user?.className) && (
                    <div className="flex items-center gap-1.5">
                      <span className="text-xs text-slate-500 font-semibold whitespace-nowrap">Lớp:</span>
                      <TextLabel className="h-10 flex items-center text-xs font-bold text-slate-800">
                        {batchClasses[0]?.className || user?.className}
                      </TextLabel>
                    </div>
                  )}

                  <div className="relative w-full sm:w-72">
                    <Search size={15} className="pointer-events-none absolute left-3.5 top-3 text-slate-400" />
                    <input
                      value={keyword}
                      onChange={(e) => changeKeyword(e.target.value)}
                      placeholder="Tìm họ tên, MSSV..."
                      className="h-10 w-full rounded-xl border border-slate-200 bg-slate-50/50 pl-10 pr-8 text-xs outline-none transition focus:border-lime-500 focus:bg-white focus:ring-2 focus:ring-lime-100"
                    />
                    {keyword && (
                      <button
                        type="button"
                        onClick={() => changeKeyword("")}
                        className="absolute right-3 top-3 text-slate-400 hover:text-slate-600 cursor-pointer"
                      >
                        <X size={14} />
                      </button>
                    )}
                  </div>
                </div>
              </div>

              {/* THANH THÔNG TIN BỘ LỌC ĐANG ÁP DỤNG */}
              {(classFilter !== "all" || statusFilter !== "all" || keyword) && (
                <div className="flex flex-wrap items-center gap-2 p-2.5 bg-slate-50 rounded-xl border border-slate-200 text-xs">
                  <span className="font-semibold text-slate-500 flex items-center gap-1">
                    <Filter size={13} /> Đang lọc:
                  </span>
                  {classFilter !== "all" && (
                    <TextLabel className="inline-flex items-center gap-1 font-medium text-slate-700">
                      Lớp: {classFilter}

                    </TextLabel>
                  )}
                  {statusFilter !== "all" && (
                    <TextLabel className="inline-flex items-center gap-1 font-medium text-slate-700">
                      Trạng thái: {statusMeta(statusFilter).label}

                    </TextLabel>
                  )}

                  {keyword && (
                    <TextLabel className="inline-flex items-center gap-1 font-medium text-slate-700">
                      Từ khóa: &quot;{keyword}&quot;

                    </TextLabel>
                  )}
                  <span className="text-slate-400">({studentTotal} sinh viên)</span>
                  <div className="flex items-center gap-2 text-xs">
                    <button type="button" disabled={studentsLoading || studentPage <= 1} onClick={() => setStudentPage((value) => value - 1)} className="rounded-lg border px-2 py-1 disabled:opacity-40">Trang trước</button>
                    <span>{studentPage} / {Math.max(1, Math.ceil(studentTotal / studentPageSize))}</span>
                    <button type="button" disabled={studentsLoading || studentPage * studentPageSize >= studentTotal} onClick={() => setStudentPage((value) => value + 1)} className="rounded-lg border px-2 py-1 disabled:opacity-40">Trang sau</button>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      changeClassFilter("all");
                      changeStatusFilter("all");

                      changeKeyword("");
                    }}
                    className="ml-auto font-bold text-rose-600 hover:text-rose-800 cursor-pointer"
                  >
                    Xóa tất cả bộ lọc
                  </button>
                </div>
              )}

              {/* BẢNG DANH SÁCH SINH VIÊN */}
              <div className="overflow-x-auto rounded-xl border border-slate-200">
                <table className="w-full text-left text-xs">
                  <thead className="border-b border-slate-200 bg-slate-50 text-[11px] font-bold uppercase tracking-wider text-slate-500">
                    <tr>
                      <th className="px-4 py-3.5 text-left table-cell-left">Họ tên & MSSV</th>
                      <th className="px-3 py-3.5 text-center table-cell-center">Khóa / Lớp</th>
                      <th className="px-3 py-3.5 text-center table-cell-center">Tích lũy / Tổng CTĐT</th>
                      <th className="px-3 py-3.5 text-center table-cell-center">HP đang học</th>
                      <th className="px-3 py-3.5 text-center table-cell-center">Trạng thái</th>
                      <th className="px-4 py-3.5 text-center table-cell-center">Thao tác</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {studentsLoading ? (
                      <tr>
                        <td colSpan={6} className="py-16 text-center text-slate-500">
                          <LoaderCircle size={22} className="mx-auto mb-2 animate-spin text-lime-600" />
                          Đang tải danh sách sinh viên...
                        </td>
                      </tr>
                    ) : filteredStudents.length === 0 ? (
                      <tr>
                        <td colSpan={6} className="py-16 text-center text-slate-500">
                          <p className="font-semibold text-slate-700">Không có sinh viên nào phù hợp bộ lọc</p>
                          <p className="text-xs text-slate-400 mt-1">Hãy thử xóa từ khóa tìm kiếm hoặc bấm &quot;Xóa tất cả bộ lọc&quot;.</p>
                          <button
                            type="button"
                            onClick={() => {
                              changeClassFilter("all");
                              changeStatusFilter("all");

                              changeKeyword("");
                            }}
                            className={`table-text-action text-filter ${plainTextClasses(`table-text-action ${plainTextClasses("mt-3 inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 cursor-pointer shadow-2xs")}`)}`}
                          >
                            Xóa bộ lọc
                          </button>
                        </td>
                      </tr>
                    ) : (
                      filteredStudents.map((student) => {
                        const meta = statusMeta(student.finalStatus);
                        const credits = student.totalCredits == null ? 0 : Number(student.totalCredits);
                        const pendingCourses = Number(student.pendingResultCourses || 0);
                        const completionPercent = selectedTotalCreditsThreshold > 0 ? Math.min(100, Math.round((credits / selectedTotalCreditsThreshold) * 100)) : 0;

                        return (
                          <tr
                            key={student.id}
                            onClick={() => void openStudent(student, "summary")}
                            className="transition hover:bg-lime-50/20 cursor-pointer"
                          >
                            {/* Họ tên & MSSV */}
                            <td className="px-4 py-3.5 text-left table-cell-left">
                              <p className="font-bold text-slate-900 text-sm hover:text-lime-700 transition">
                                {student.sStudentName}
                              </p>
                              <p className="font-mono text-xs text-slate-500 mt-0.5">MSSV: {student.sStudentId}</p>
                            </td>

                            {/* Khóa / Lớp */}
                            <td className="px-3 py-3.5 text-center table-cell-center">
                              <TextLabel className="inline-block font-mono text-xs font-semibold text-slate-700">
                                {student.sClassName || selectedRun.cohortCode || "—"}
                              </TextLabel>
                            </td>

                            {/* Tín chỉ tích lũy / Tổng CTĐT */}
                            <td className="px-3 py-3.5 text-center table-cell-center">
                              <div className="inline-flex flex-col items-center">
                                <div>
                                  <span className="font-mono text-sm font-bold text-slate-900">{credits}</span>
                                  <span className="text-slate-400 text-xs"> / {selectedTotalCreditsThreshold}</span>
                                </div>
                                <div className="w-20 bg-slate-100 rounded-full h-1.5 mt-1 overflow-hidden">
                                  <div
                                    className={`h-full rounded-full ${
                                      completionPercent >= 100
                                        ? "bg-emerald-500"
                                        : completionPercent >= 80
                                          ? "bg-sky-500"
                                          : "bg-amber-500"
                                    }`}
                                    style={{ width: `${completionPercent}%` }}
                                  />
                                </div>
                              </div>
                            </td>

                            {/* Học phần đang học */}
                            <td className="px-3 py-3.5 text-center table-cell-center">
                              {pendingCourses > 0 ? (
                                <TextLabel className="inline-flex items-center gap-1 font-mono text-xs font-bold text-sky-700">
                                   {pendingCourses} môn
                                </TextLabel>
                              ) : (
                                <span className="text-slate-400 font-mono text-xs">—</span>
                              )}
                            </td>

                            {/* Trạng thái */}
                            <td className="px-3 py-3.5 text-center table-cell-center">
                              <TextLabel className={`inline-flex items-center gap-1.5     text-xs font-bold ${meta.pillBg}`}>

                                {meta.short}
                              </TextLabel>
                            </td>

                            {/* Thao tác */}
                            <td className="px-4 py-3.5 text-center table-cell-center" onClick={(e) => e.stopPropagation()}>
                              <div className="flex items-center justify-center gap-1.5">
                                <TableAction
                                  icon={FileSpreadsheet}
                                  label="Bảng điểm"
                                  tone="lime"
                                  disabled={studentLoading}
                                  onClick={() => void openStudent(student, "transcript")}
                                />
                                <TableAction
                                  icon={Eye}
                                  label="Xem chi tiết"
                                  disabled={studentLoading}
                                  onClick={() => void openStudent(student, "summary")}
                                />
                              </div>
                            </td>
                          </tr>
                        );
                      })
                    )}
                  </tbody>
                </table>
              </div>
            </div>
        </section>
      )}

      {/* 4. MODAL CHI TIẾT ĐIỀU KIỆN TỐT NGHIỆP */}
      <Modal
        isOpen={Boolean(selectedStudent)}
        onClose={() => setSelectedStudent(null)}
        title={
          selectedStudent ? (
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-base font-bold text-slate-900">
                {selectedStudent.student?.sStudentName || selectedStudent.student?.studentName || "Hồ sơ sinh viên"}
              </span>
              <TextLabel className="font-mono text-xs font-semibold text-slate-700">
                MSSV: {selectedStudent.student?.sStudentId || selectedStudent.student?.studentId}
              </TextLabel>
            </div>
          ) : (
            "Hồ sơ sinh viên"
          )
        }
        description={
          selectedStudent ? (() => {
            const s = selectedStudent.student;
            const cohortMatch =
              s?.sClassName?.match(/K(\d{2})/i) ||
              s?.cohortCode?.match(/K(\d{2})/i) ||
              s?.sStudentId?.match(/^\d{2}(\d{2})/i);
            const cohortNum = cohortMatch ? Number(cohortMatch[1]) : null;
            const timeline = studyTimeline(cohortNum, s?.assessmentAcademicYear, s?.assessmentTermCode);
            const isOngoing = timeline?.isOngoing ?? false;
            const sYear = timeline?.studyYear ?? null;

            return (
              <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-slate-500 mt-1">
                <span>Lớp: <strong className="font-medium text-slate-700">{s?.sClassName || s?.className || "Chưa có"}</strong></span>
                <span>•</span>
                <span>Ngành: <strong className="font-medium text-slate-700">{s?.sProgramCode || s?.programName || "Chính quy"}</strong></span>
                {cohortNum && (
                  <>
                    <span>•</span>
                    <span>Khóa: <strong className="font-medium text-slate-700">K{cohortNum} {isOngoing ? `(Năm ${sYear})` : "(Năm cuối)"}</strong></span>
                  </>
                )}
              </div>
            );
          })() : undefined
        }
        maxWidth="6xl"
      >
        {(() => {
          if (!selectedStudent) return null;
          const { grades: rawGrades = [], forecast } = selectedStudent;
          const cleanGrades = (rawGrades || []).filter((g: ApiData) => {
            const code = String(g.courseCode || g.sCurriculumId || "").toUpperCase();
            const name = String(g.courseName || g.sCourseName || "").toLowerCase();
            return !code.startsWith("SHCD") && !name.includes("sinh hoạt công dân");
          });

          const grades = cleanGrades;

          return forecast ? (
            <ForecastDetail
              forecast={forecast}
              programCode={selectedStudent.student?.sProgramCode}
              finalStatus={selectedStudent.student?.finalStatus}
              reasons={Array.isArray(selectedStudent.student?.reasons) ? selectedStudent.student.reasons : []}
              additionalRequirements={Array.isArray(selectedStudent.requirements) ? selectedStudent.requirements : []}
              student={selectedStudent.student}
              grades={grades}
              initialTab={studentModalTab}
              onClose={() => setSelectedStudent(null)}
            />
          ) : (
            <div className="rounded-2xl border border-slate-200 bg-slate-50 p-6 text-center text-slate-600">
              <Info size={24} className="mx-auto text-slate-400 mb-2" />
              <p className="font-bold text-slate-800">Chưa có danh mục chương trình đào tạo để đối chiếu</p>
              <p className="mt-1 text-xs text-slate-500">
                Vui lòng cấu hình danh mục môn học của CTĐT hoặc liên hệ quản trị viên để cập nhật dữ liệu.
              </p>
            </div>
          );
        })()}
      </Modal>

      {/* 5. MODAL CHẠY ĐỢT ĐÁNH GIÁ MỚI */}
      <Modal
        isOpen={showRunModal}
        onClose={() => setShowRunModal(false)}
        title="Chạy đợt dự kiến tốt nghiệp / tiến độ mới"
        description="Chọn khóa sinh viên, chương trình đào tạo và học kỳ đánh giá."
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
