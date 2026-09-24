"use client";

import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import {
  AlertCircle,
  AlertTriangle,
  Award,
  BookOpen,
  Check,
  CheckCircle2,
  ChevronRight,
  CircleHelp,
  Clock,
  Download,
  FileCheck2,
  FileText,
  Filter,
  GraduationCap,
  Info,
  LoaderCircle,
  Play,
  RefreshCw,
  Search,
  ShieldAlert,
  Users,
  X,
  XCircle,
} from "lucide-react";
import { apiFetch } from "@/lib/api-client";
import Modal from "@/components/ui/Modal";
import ForecastDetail from "@/components/graduation/ForecastDetail";
import { toast } from "@/components/ui/Toast";
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

const REASON_LABELS: Record<string, string> = {
  thieuTinChi: "Thiếu tín chỉ CTĐT",
  thieuBatBuoc: "Thiếu học phần bắt buộc",
  thieuTuChon: "Thiếu tín chỉ tự chọn",
  chuaDat: "Có học phần chưa đạt",
};

const YEAR23_LABELS: Record<string, string> = {
  all: "Tất cả",
  clean: "Không thiếu",
  overdueMandatory: "Thiếu HP bắt buộc",
  failed: "Có HP chưa đạt",
  elective: "Thiếu tự chọn",
  pending: "Đang học kỳ này",
};

export type StudentBacklogCourse = {
  courseCode: string;
  courseName: string;
  credits: number;
  semesterNo?: number | null;
  letterGrade?: string;
  score10?: number;
  isMandatory?: boolean;
};

export type StudentBacklogInfo = {
  status: "NO_BACKLOG" | "HAS_OVERDUE" | "HAS_FAILED" | "HAS_ELECTIVE_OVERDUE";
  hasNoBacklog: boolean;
  hasOverdueMandatory: boolean;
  hasFailed: boolean;
  hasElectiveBacklog: boolean;
  overdueMandatoryCount: number;
  failedCount: number;
  failedMandatoryCount: number;
  failedElectiveCount: number;
  electiveBacklogCount: number;
  totalBacklogCount: number;
  overdueMandatoryCourses: StudentBacklogCourse[];
  failedCourses: StudentBacklogCourse[];
  failedElectiveCourses: StudentBacklogCourse[];
  electiveGroupBacklogs: Array<{ groupCode: string; message: string; remainingCredits: number }>;
  pendingCount: number;
};

export function getStudentBacklog(student: ApiData): StudentBacklogInfo {
  const b = student.backlog as Partial<StudentBacklogInfo> | undefined;
  if (b && typeof b.totalBacklogCount === "number") {
    return b as StudentBacklogInfo;
  }

  const reasons = Array.isArray(student.reasons) ? student.reasons : [];
  const overdueMandatoryCourses: StudentBacklogCourse[] = [];
  const failedCourses: StudentBacklogCourse[] = [];
  const failedElectiveCourses: StudentBacklogCourse[] = [];
  const electiveGroupBacklogs: Array<{ groupCode: string; message: string; remainingCredits: number }> = [];

  for (const r of reasons) {
    if (r.code === "OVERDUE_MANDATORY_COURSE") {
      overdueMandatoryCourses.push({
        courseCode: String(r.courseCode || ""),
        courseName: String(r.courseName || ""),
        credits: Number(r.credits || 0),
        semesterNo: r.semesterNo != null ? Number(r.semesterNo) : null,
        isMandatory: true,
      });
    } else if (r.code === "FAILED_COURSE") {
      const isMand = r.isMandatory !== undefined ? Boolean(r.isMandatory) : !/tự chọn|elective/i.test(String(r.courseName || "") + " " + String(r.requirementType || ""));
      const courseItem: StudentBacklogCourse = {
        courseCode: String(r.courseCode || ""),
        courseName: String(r.courseName || ""),
        credits: Number(r.credits || 0),
        letterGrade: r.letterGrade ? String(r.letterGrade) : undefined,
        score10: r.score10 != null ? Number(r.score10) : undefined,
        semesterNo: r.semesterNo != null ? Number(r.semesterNo) : null,
        isMandatory: isMand,
      };
      failedCourses.push(courseItem);
      if (!isMand) {
        failedElectiveCourses.push(courseItem);
      }
    } else if (r.code === "MISSING_ELECTIVE_CREDITS") {
      electiveGroupBacklogs.push({
        groupCode: String(r.groupCode || "TC"),
        message: String(r.message || ""),
        remainingCredits: Number(r.remainingCredits || 0),
      });
    }
  }

  const overdueMandatoryCount = overdueMandatoryCourses.length;
  const failedCount = failedCourses.length;
  const electiveBacklogCount = failedElectiveCourses.length + electiveGroupBacklogs.length;
  const totalBacklogCount = overdueMandatoryCount + failedCount + electiveGroupBacklogs.length;

  const hasOverdueMandatory = overdueMandatoryCount > 0;
  const hasFailed = failedCount > 0;
  const hasElectiveBacklog = electiveBacklogCount > 0;
  const hasNoBacklog = !hasOverdueMandatory && !hasFailed && !hasElectiveBacklog;

  const status = hasNoBacklog ? "NO_BACKLOG" : hasFailed ? "HAS_FAILED" : hasOverdueMandatory ? "HAS_OVERDUE" : "HAS_ELECTIVE_OVERDUE";

  return {
    status,
    hasNoBacklog,
    hasOverdueMandatory,
    hasFailed,
    hasElectiveBacklog,
    overdueMandatoryCount,
    failedCount,
    failedMandatoryCount: failedCourses.filter((c) => c.isMandatory).length,
    failedElectiveCount: failedElectiveCourses.length,
    electiveBacklogCount,
    totalBacklogCount,
    overdueMandatoryCourses,
    failedCourses,
    failedElectiveCourses,
    electiveGroupBacklogs,
    pendingCount: Number(student.pendingResultCourses || 0),
  };
}

export default function GraduationForecastPage() {
  const { can } = useAuthStore();
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

  // Manual view mode toggle override ("auto" | "final_year" | "ongoing")
  const [manualViewMode, setManualViewMode] = useState<"auto" | "final_year" | "ongoing">("auto");

  // Student list in selected batch
  const [allStudents, setAllStudents] = useState<ApiData[]>([]);
  const [studentsLoading, setStudentsLoading] = useState(false);
  const [statusFilter, setStatusFilter] = useState("all");
  const [keyword, setKeyword] = useState("");

  // Class filter (Lớp)
  const [classFilter, setClassFilter] = useState("all");

  // Final year missing reasons filter: "all" | "thieuTinChi" | "thieuBatBuoc" | "thieuTuChon" | "chuaDat"
  const [activeReasonFilter, setActiveReasonFilter] = useState<string>("all");

  // Year 2-3 progress tier filter: "all" | "clean" | "overdueMandatory" | "failed" | "elective"
  const [year23Filter, setYear23Filter] = useState<string>("all");

  // Quick filter by specific common backlog course
  const [selectedCourseBacklogFilter, setSelectedCourseBacklogFilter] = useState<string | null>(null);

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
    setActiveReasonFilter("all");
    setYear23Filter("all");
    setClassFilter("all");
    setSelectedCourseBacklogFilter(null);
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
            }),
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

      // Mặc định ưu tiên sinh viên năm cuối / đợt tốt nghiệp (K46)
      if (fetchedRuns.length > 0) {
        const finalYearRun = fetchedRuns.find((r) => getCohortStudyYearInfo(r).isFinalYear) || fetchedRuns[0];
        setSelectedRun(finalYearRun);
        void loadRunStudents(finalYearRun);
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
    setActiveReasonFilter("all");
    setYear23Filter("all");
    setClassFilter("all");
    setSelectedCourseBacklogFilter(null);
    setManualViewMode("auto");
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

  // Identify whether selected batch is final year or ongoing (Year 2-3)
  const currentBatchInfo = useMemo(() => getCohortStudyYearInfo(selectedRun), [selectedRun]);
  const isFinalYear = useMemo(() => {
    if (manualViewMode === "final_year") return true;
    if (manualViewMode === "ongoing") return false;
    return currentBatchInfo.isFinalYear;
  }, [manualViewMode, currentBatchInfo.isFinalYear]);

  // Split runs into categories
  const finalYearRuns = useMemo(() => runs.filter((r) => getCohortStudyYearInfo(r).isFinalYear), [runs]);
  const ongoingRuns = useMemo(() => runs.filter((r) => !getCohortStudyYearInfo(r).isFinalYear), [runs]);

  // Handle switching category tab
  const handleCategoryChange = (category: "final_year" | "ongoing" | "all") => {
    setBatchCategory(category);
    setCohortFilter("all");
    setSelectedCourseBacklogFilter(null);
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
    if (batchCategory === "final_year") return finalYearRuns;
    if (batchCategory === "ongoing") return ongoingRuns;
    return runs;
  }, [runs, batchCategory, finalYearRuns, ongoingRuns]);

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

  const selectedTotalCreditsThreshold = configuredThreshold(selectedRun?.sourceSnapshot, "TOTAL_CREDITS", 145) || 145;

  // Unique classes in current batch
  const uniqueClasses = useMemo(() => {
    const set = new Set<string>();
    for (const s of allStudents) {
      if (s.sClassName) set.add(String(s.sClassName));
    }
    return Array.from(set).sort();
  }, [allStudents]);

  // Scoped students by class filter (KPIs and table dynamically update when class filter changes)
  const scopedStudents = useMemo(() => {
    if (classFilter === "all") return allStudents;
    return allStudents.filter((s) => s.sClassName === classFilter);
  }, [allStudents, classFilter]);

  // ==========================================
  // FINAL YEAR LOGIC & STATS (SCOPED BY CLASS FILTER)
  // ==========================================
  const statusCounts = useMemo(() => {
    const counts = {
      all: scopedStudents.length,
      EXPECTED_ELIGIBLE: 0,
      PENDING_GRADE: 0,
      NOT_ELIGIBLE: 0,
      PENDING_REQUIREMENT: 0,
      MANUAL_REVIEW: 0,
    };
    for (const s of scopedStudents) {
      if (s.finalStatus === "EXPECTED_ELIGIBLE") counts.EXPECTED_ELIGIBLE++;
      else if (s.finalStatus === "PENDING_GRADE") counts.PENDING_GRADE++;
      else if (s.finalStatus === "NOT_ELIGIBLE") counts.NOT_ELIGIBLE++;
      else if (s.finalStatus === "PENDING_REQUIREMENT") counts.PENDING_REQUIREMENT++;
      else if (s.finalStatus === "MANUAL_REVIEW") counts.MANUAL_REVIEW++;
    }
    return counts;
  }, [scopedStudents]);

  // Missing reasons breakdown (Thống kê nguyên nhân còn thiếu)
  const missingReasons = useMemo(() => {
    let thieuTinChi = 0;
    let thieuBatBuoc = 0;
    let thieuTuChon = 0;
    let chuaDat = 0;

    for (const s of scopedStudents) {
      if (s.finalStatus === "NOT_ELIGIBLE") {
        const reasons = Array.isArray(s.reasons) ? s.reasons : [];
        const isThieuTinChi = Number(s.totalCredits || 0) < selectedTotalCreditsThreshold || reasons.some((r: ApiData) => r.code === "TOTAL_CREDITS");
        const isThieuBatBuoc = Number(s.missingRequiredCourses || 0) > 0 || reasons.some((r: ApiData) => r.code === "MISSING_REQUIRED_COURSE");
        const isThieuTuChon =
          (s.missingElectiveCredits != null && Number(s.missingElectiveCredits) > 0) ||
          reasons.some((r: ApiData) => (r.code === "MISSING_ELECTIVE_CREDITS" || r.code === "ELECTIVE_CREDITS") && r.result === "FAIL");
        const isChuaDat = reasons.some((r: ApiData) => r.code === "FAILED_COURSE");

        if (isThieuTinChi) thieuTinChi++;
        if (isThieuBatBuoc) thieuBatBuoc++;
        if (isThieuTuChon) thieuTuChon++;
        if (isChuaDat) chuaDat++;
      }
    }
    return { thieuTinChi, thieuBatBuoc, thieuTuChon, chuaDat };
  }, [scopedStudents, selectedTotalCreditsThreshold]);

  // Final Year Status Filter Tabs
  const finalYearStatusTabs = useMemo(() => [
    {
      key: "all",
      label: "Tất cả",
      count: statusCounts.all,
      icon: null,
      activeCls: "bg-slate-900 border-slate-900 text-white shadow-xs",
      inactiveCls: "bg-slate-100/80 border-slate-200 text-slate-700 hover:bg-slate-200/80 hover:text-slate-900",
      badgeActiveCls: "bg-white/20 text-white",
      badgeInactiveCls: "bg-slate-200 text-slate-700",
    },
    {
      key: "EXPECTED_ELIGIBLE",
      label: "Đủ yêu cầu",
      count: statusCounts.EXPECTED_ELIGIBLE,
      icon: Check,
      activeCls: "bg-emerald-600 border-emerald-600 text-white shadow-xs",
      inactiveCls: "bg-emerald-50/70 border-emerald-200 text-emerald-800 hover:bg-emerald-100",
      badgeActiveCls: "bg-white/20 text-white",
      badgeInactiveCls: "bg-emerald-100 text-emerald-800",
    },
    {
      key: "PENDING_GRADE",
      label: "Đang hoàn thiện",
      count: statusCounts.PENDING_GRADE,
      icon: Clock,
      activeCls: "bg-sky-600 border-sky-600 text-white shadow-xs",
      inactiveCls: "bg-sky-50/70 border-sky-200 text-sky-800 hover:bg-sky-100",
      badgeActiveCls: "bg-white/20 text-white",
      badgeInactiveCls: "bg-sky-100 text-sky-800",
    },
    {
      key: "NOT_ELIGIBLE",
      label: "Còn thiếu",
      count: statusCounts.NOT_ELIGIBLE,
      icon: AlertTriangle,
      activeCls: "bg-amber-600 border-amber-600 text-white shadow-xs",
      inactiveCls: "bg-amber-50/70 border-amber-200 text-amber-800 hover:bg-amber-100",
      badgeActiveCls: "bg-white/20 text-white",
      badgeInactiveCls: "bg-amber-100 text-amber-800",
    },
  ], [statusCounts]);

  // ==========================================
  // YEAR 2-4 BACKLOG STATS, COMMON BACKLOG ITEMS & TABS (SCOPED BY CLASS FILTER)
  // ==========================================
  const currentStudyYearLabel = useMemo(() => {
    const codeMatch = (selectedRun?.cohortCode || "").match(/K(\d+)/i);
    if (!codeMatch) return "Năm 2";
    const cohortNum = Number(codeMatch[1]);
    const year = Math.max(1, 51 - cohortNum);
    return `Năm ${year}`;
  }, [selectedRun]);

  // Common backlog items across students in current scope (Yêu cầu còn thiếu phổ biến)
  const commonBacklogItems = useMemo(() => {
    const map = new Map<string, {
      key: string;
      code: string;
      name: string;
      type: "mandatory" | "failed" | "elective";
      studentIds: Set<string>;
    }>();

    for (const s of scopedStudents) {
      const b = getStudentBacklog(s);
      const sid = String(s.sStudentId || s.id);

      // 1. Overdue mandatory courses
      for (const c of b.overdueMandatoryCourses) {
        const key = `M_${c.courseCode}`;
        if (!map.has(key)) {
          map.set(key, {
            key,
            code: c.courseCode,
            name: c.courseName || c.courseCode,
            type: "mandatory",
            studentIds: new Set(),
          });
        }
        map.get(key)!.studentIds.add(sid);
      }

      // 2. Failed courses
      for (const c of b.failedCourses) {
        const key = `F_${c.courseCode}`;
        if (!map.has(key)) {
          map.set(key, {
            key,
            code: c.courseCode,
            name: c.courseName || c.courseCode,
            type: "failed",
            studentIds: new Set(),
          });
        }
        map.get(key)!.studentIds.add(sid);
      }

      // 3. Elective groups
      for (const g of b.electiveGroupBacklogs) {
        const key = `E_${g.groupCode}`;
        if (!map.has(key)) {
          map.set(key, {
            key,
            code: g.groupCode,
            name: `Nhóm tự chọn ${g.groupCode}`,
            type: "elective",
            studentIds: new Set(),
          });
        }
        map.get(key)!.studentIds.add(sid);
      }
    }

    return Array.from(map.values())
      .map((item) => ({
        ...item,
        count: item.studentIds.size,
      }))
      .filter((item) => item.count > 0)
      .sort((a, b) => b.count - a.count)
      .slice(0, 8);
  }, [scopedStudents]);

  const year23BacklogStats = useMemo(() => {
    let clean = 0;
    let overdueMandatory = 0;
    let failed = 0;
    let elective = 0;
    let pending = 0;

    for (const s of scopedStudents) {
      const b = getStudentBacklog(s);
      if (b.hasNoBacklog) clean++;
      if (b.hasOverdueMandatory) overdueMandatory++;
      if (b.hasFailed) failed++;
      if (b.hasElectiveBacklog) elective++;
      if (b.pendingCount > 0) pending++;
    }

    return {
      total: scopedStudents.length,
      clean,
      overdueMandatory,
      failed,
      elective,
      pending,
    };
  }, [scopedStudents]);

  const year23Tabs = useMemo(() => [
    {
      key: "all",
      label: "Tất cả",
      count: year23BacklogStats.total,
      activeCls: "bg-slate-900 border-slate-900 text-white shadow-xs",
      inactiveCls: "bg-slate-100/80 border-slate-200 text-slate-700 hover:bg-slate-200/80 hover:text-slate-900",
      badgeActiveCls: "bg-white/20 text-white",
      badgeInactiveCls: "bg-slate-200 text-slate-700",
    },
    {
      key: "clean",
      label: "Không thiếu",
      count: year23BacklogStats.clean,
      activeCls: "bg-emerald-600 border-emerald-600 text-white shadow-xs",
      inactiveCls: "bg-emerald-50/70 border-emerald-200 text-emerald-800 hover:bg-emerald-100",
      badgeActiveCls: "bg-white/20 text-white",
      badgeInactiveCls: "bg-emerald-100 text-emerald-800",
    },
    {
      key: "overdueMandatory",
      label: "Thiếu HP bắt buộc",
      count: year23BacklogStats.overdueMandatory,
      activeCls: "bg-amber-600 border-amber-600 text-white shadow-xs",
      inactiveCls: "bg-amber-50/70 border-amber-200 text-amber-800 hover:bg-amber-100",
      badgeActiveCls: "bg-white/20 text-white",
      badgeInactiveCls: "bg-amber-100 text-amber-800",
    },
    {
      key: "failed",
      label: "Có HP chưa đạt",
      count: year23BacklogStats.failed,
      activeCls: "bg-rose-600 border-rose-600 text-white shadow-xs",
      inactiveCls: "bg-rose-50/70 border-rose-200 text-rose-800 hover:bg-rose-100",
      badgeActiveCls: "bg-white/20 text-white",
      badgeInactiveCls: "bg-rose-100 text-rose-800",
    },
    {
      key: "elective",
      label: "Thiếu tự chọn",
      count: year23BacklogStats.elective,
      activeCls: "bg-indigo-600 border-indigo-600 text-white shadow-xs",
      inactiveCls: "bg-indigo-50/70 border-indigo-200 text-indigo-800 hover:bg-indigo-100",
      badgeActiveCls: "bg-white/20 text-white",
      badgeInactiveCls: "bg-indigo-100 text-indigo-800",
    },
  ], [year23BacklogStats]);

  // ==========================================
  // FILTERED STUDENTS LIST
  // ==========================================
  const filteredStudents = useMemo(() => {
    let list = scopedStudents;

    if (isFinalYear) {
      // Final year filter by status
      if (statusFilter !== "all") {
        list = list.filter((s) => s.finalStatus === statusFilter);
      }
      // Filter by missing reasons if user clicked a reason card
      if (activeReasonFilter !== "all") {
        list = list.filter((s) => {
          if (s.finalStatus !== "NOT_ELIGIBLE") return false;
          const reasons = Array.isArray(s.reasons) ? s.reasons : [];
          if (activeReasonFilter === "thieuTinChi") {
            return Number(s.totalCredits || 0) < selectedTotalCreditsThreshold || reasons.some((r: ApiData) => r.code === "TOTAL_CREDITS");
          }
          if (activeReasonFilter === "thieuBatBuoc") {
            return Number(s.missingRequiredCourses || 0) > 0 || reasons.some((r: ApiData) => r.code === "MISSING_REQUIRED_COURSE");
          }
          if (activeReasonFilter === "thieuTuChon") {
            return (
              (s.missingElectiveCredits != null && Number(s.missingElectiveCredits) > 0) ||
              reasons.some((r: ApiData) => (r.code === "MISSING_ELECTIVE_CREDITS" || r.code === "ELECTIVE_CREDITS") && r.result === "FAIL")
            );
          }
          if (activeReasonFilter === "chuaDat") {
            return reasons.some((r: ApiData) => r.code === "FAILED_COURSE");
          }
          return true;
        });
      }
    } else {
      // Year 2-4 backlog filter
      if (year23Filter === "clean") {
        list = list.filter((s) => getStudentBacklog(s).hasNoBacklog);
      } else if (year23Filter === "overdueMandatory") {
        list = list.filter((s) => getStudentBacklog(s).hasOverdueMandatory);
      } else if (year23Filter === "failed") {
        list = list.filter((s) => getStudentBacklog(s).hasFailed);
      } else if (year23Filter === "elective") {
        list = list.filter((s) => getStudentBacklog(s).hasElectiveBacklog);
      }

      // Quick filter by specific common backlog course
      if (selectedCourseBacklogFilter) {
        list = list.filter((s) => {
          const b = getStudentBacklog(s);
          return (
            b.overdueMandatoryCourses.some((c) => c.courseCode === selectedCourseBacklogFilter) ||
            b.failedCourses.some((c) => c.courseCode === selectedCourseBacklogFilter) ||
            b.electiveGroupBacklogs.some((g) => g.groupCode === selectedCourseBacklogFilter)
          );
        });
      }
    }

    // Search query
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
  }, [scopedStudents, isFinalYear, statusFilter, activeReasonFilter, year23Filter, selectedCourseBacklogFilter, selectedTotalCreditsThreshold, keyword]);

  return (
    <div className="p-6 space-y-6 max-w-7xl mx-auto text-slate-800">
      {/* 1. Header & Actions */}
      <header className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between border-b border-slate-200/80 pb-5">
        <div>
          <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-lime-700">
            <GraduationCap size={18} className="text-lime-600" />
            <span>Đại học Đà Lạt • Quản lý Đào tạo cấp Khoa</span>
          </div>
          <h1 className="mt-1 text-2xl font-extrabold tracking-tight text-slate-900 sm:text-3xl">
            Dự kiến tốt nghiệp & Tiến độ CTĐT
          </h1>
          <p className="mt-1 text-sm text-slate-500">
            Theo dõi điều kiện tốt nghiệp cho sinh viên năm cuối (Năm 5) và mức độ hoàn thành chương trình đào tạo cho sinh viên các năm 2, 3, 4.
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

      {/* 2. KHU VỰC CHỌN ĐỐI TƯỢNG VÀ ĐỢT ĐÁNH GIÁ */}
      <section aria-labelledby="batch-selector-heading" className="space-y-3.5">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-2">
            <h2 id="batch-selector-heading" className="text-base font-bold text-slate-900">
              1. Chọn đợt đánh giá
            </h2>
          </div>

          {/* CHỌN NHÓM ĐỐI TƯỢNG: MẶC ĐỊNH LÀ SINH VIÊN NĂM CUỐI */}
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
              <GraduationCap size={14} className={batchCategory === "final_year" ? "text-lime-600" : "text-slate-400"} />
              <span>Sinh viên năm cuối (Năm 5)</span>
              <span className="rounded-md bg-lime-100 text-lime-800 px-1.5 py-0.2 text-[10px] font-mono">
                {finalYearRuns.length}
              </span>
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
              <BookOpen size={14} className={batchCategory === "ongoing" ? "text-blue-600" : "text-slate-400"} />
              <span>Sinh viên năm 2 - 4</span>
              <span className="rounded-md bg-blue-100 text-blue-800 px-1.5 py-0.2 text-[10px] font-mono">
                {ongoingRuns.length}
              </span>
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
                    <span className="inline-flex rounded-md bg-slate-100 px-2 py-0.5 font-mono text-xs font-bold text-slate-700 shrink-0">
                      {run.cohortCode || "Khóa"}
                    </span>
                    <span className="text-sm font-bold text-slate-900 truncate">
                      {run.programName || run.programCode}
                    </span>
                  </div>

                  <div className="shrink-0">
                    {isSelected ? (
                      <span className="inline-flex items-center gap-1 rounded-full bg-lime-600 px-2.5 py-0.5 text-xs font-bold text-white shadow-xs">
                        <Check size={12} strokeWidth={3} />
                        Đang xem
                      </span>
                    ) : (
                      <span className="inline-flex items-center rounded-lg px-2 py-0.5 text-xs font-medium text-slate-400 group-hover:text-slate-700 group-hover:bg-slate-100 transition">
                        Bấm để xem
                      </span>
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
          {/* Header đợt đang xem & Chuyển góc nhìn & Nút tải xuất file */}
          <div className="border-b border-slate-200 bg-slate-50/80 p-4 sm:p-5 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <span className="flex h-6 w-6 items-center justify-center rounded-full bg-lime-100 text-lime-800 text-xs font-bold">
                  2
                </span>
                <h2 id="student-list-heading" className="text-base font-bold text-slate-900">
                  {isFinalYear ? "Dự kiến tốt nghiệp sinh viên năm cuối" : "Rà soát tiến độ CTĐT sinh viên"}: {selectedRun.cohortCode} • {selectedRun.programName || selectedRun.programCode}
                </h2>
              </div>
              <p className="mt-0.5 text-xs text-slate-500 pl-8">
                Đợt xét: {selectedRun.assessmentTermCode} ({selectedRun.assessmentAcademicYear}) • Tổng số:{" "}
                <strong className="text-slate-800">{scopedStudents.length} sinh viên {classFilter !== "all" && `(Lớp ${classFilter})`}</strong>
                {" • "}Chuẩn CTĐT: <strong className="text-slate-800">{selectedTotalCreditsThreshold} tín chỉ</strong>
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-2 pl-8 lg:pl-0">
              {/* Nút chuyển góc nhìn linh hoạt */}
              <div className="flex items-center gap-1 bg-slate-200/70 p-0.5 rounded-xl text-xs font-semibold">
                <button
                  type="button"
                  onClick={() => setManualViewMode("final_year")}
                  className={`rounded-lg px-2.5 py-1 transition cursor-pointer ${
                    isFinalYear ? "bg-white text-slate-900 shadow-xs font-bold" : "text-slate-600 hover:text-slate-900"
                  }`}
                >
                  🎓 Góc nhìn tốt nghiệp
                </button>
                <button
                  type="button"
                  onClick={() => setManualViewMode("ongoing")}
                  className={`rounded-lg px-2.5 py-1 transition cursor-pointer ${
                    !isFinalYear ? "bg-white text-slate-900 shadow-xs font-bold" : "text-slate-600 hover:text-slate-900"
                  }`}
                >
                  📋 Rà soát tiến độ CTĐT
                </button>
              </div>

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
          {/* GÓC NHÌN A: SINH VIÊN NĂM CUỐI (DEFAULT)                   */}
          {/* ========================================================= */}
          {isFinalYear ? (
            <div className="p-4 sm:p-5 space-y-5 bg-white">
              {/* THẺ TỔNG QUAN 4 CHỈ SỐ: TỔNG SV, ĐỦ YÊU CẦU, ĐANG HOÀN THIỆN, CÒN THIẾU (INTERACTIVE: BẤM ĐỂ LỌC) */}
              <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
                {/* 1. Tổng sinh viên năm cuối */}
                <div
                  onClick={() => {
                    setStatusFilter("all");
                    setActiveReasonFilter("all");
                  }}
                  className={`rounded-xl border p-4 transition cursor-pointer ${
                    statusFilter === "all" && activeReasonFilter === "all"
                      ? "border-slate-800 bg-slate-100 shadow-xs ring-2 ring-slate-400"
                      : "border-slate-200 bg-slate-50/70 hover:bg-slate-100 hover:border-slate-300"
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">Tổng SV năm cuối</span>
                    <Users size={18} className="text-slate-400" />
                  </div>
                  <p className="mt-2 font-mono text-3xl font-extrabold text-slate-900">{statusCounts.all}</p>
                  <p className="mt-1 text-[11px] text-slate-500">
                    {classFilter === "all" ? `Khóa ${selectedRun.cohortCode}` : `Lớp ${classFilter}`} • Bấm để xem tất cả
                  </p>
                </div>

                {/* 2. Đủ yêu cầu (🟢) */}
                <div
                  onClick={() => {
                    setStatusFilter("EXPECTED_ELIGIBLE");
                    setActiveReasonFilter("all");
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
                  <p className="mt-2 font-mono text-3xl font-extrabold text-emerald-700">{statusCounts.EXPECTED_ELIGIBLE}</p>
                  <p className="mt-1 text-[11px] text-emerald-700">Đạt toàn bộ điều kiện • Bấm để lọc</p>
                </div>

                {/* 3. Đang hoàn thiện (🔵) */}
                <div
                  onClick={() => {
                    setStatusFilter("PENDING_GRADE");
                    setActiveReasonFilter("all");
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
                  <p className="mt-2 font-mono text-3xl font-extrabold text-sky-700">{statusCounts.PENDING_GRADE}</p>
                  <p className="mt-1 text-[11px] text-sky-700">Đang học / chờ điểm • Bấm để lọc</p>
                </div>

                {/* 4. Còn thiếu (🟠) */}
                <div
                  onClick={() => {
                    setStatusFilter("NOT_ELIGIBLE");
                    setActiveReasonFilter("all");
                  }}
                  className={`rounded-xl border p-4 transition cursor-pointer ${
                    statusFilter === "NOT_ELIGIBLE" && activeReasonFilter === "all"
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
                  <p className="mt-2 font-mono text-3xl font-extrabold text-amber-700">{statusCounts.NOT_ELIGIBLE}</p>
                  <p className="mt-1 text-[11px] text-amber-700">Chưa đủ điều kiện • Bấm để lọc</p>
                </div>
              </div>

              {/* KHU VỰC THỐNG KÊ NGUYÊN NHÂN CÒN THIẾU (THIẾU TÍN CHỈ, THIẾU BẮT BUỘC, THIẾU TỰ CHỌN, CÓ MÔN CHƯA ĐẠT) */}
              <div className="rounded-xl border border-amber-200/90 bg-amber-50/30 p-4">
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 border-b border-amber-200/60 pb-3">
                  <div>
                    <h3 className="text-xs font-bold uppercase tracking-wider text-amber-900 flex items-center gap-2">
                      <AlertTriangle size={15} className="text-amber-600" />
                      <span>Thống kê nguyên nhân còn thiếu ({statusCounts.NOT_ELIGIBLE} sinh viên chưa đủ điều kiện)</span>
                    </h3>
                    <p className="text-[11px] text-amber-700 mt-0.5">
                      Một sinh viên có thể thiếu nhiều loại yêu cầu cùng lúc. Bấm vào từng mục để lọc nhanh danh sách sinh viên bên dưới.
                    </p>
                  </div>
                  {activeReasonFilter !== "all" && (
                    <button
                      type="button"
                      onClick={() => setActiveReasonFilter("all")}
                      className="inline-flex items-center gap-1 text-xs font-bold text-amber-800 hover:text-amber-950 underline cursor-pointer"
                    >
                      <X size={12} />
                      Bỏ lọc nguyên nhân ({REASON_LABELS[activeReasonFilter]})
                    </button>
                  )}
                </div>

                <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4 mt-3">
                  {/* Nguyên nhân 1: Thiếu tín chỉ */}
                  <div
                    onClick={() => setActiveReasonFilter(activeReasonFilter === "thieuTinChi" ? "all" : "thieuTinChi")}
                    className={`rounded-lg p-3 transition border cursor-pointer ${
                      activeReasonFilter === "thieuTinChi"
                        ? "bg-amber-100/90 border-amber-500 shadow-xs ring-2 ring-amber-400/40"
                        : "bg-white border-amber-200 hover:border-amber-300 hover:bg-amber-50/50"
                    }`}
                  >
                    <p className="text-[11px] font-bold text-slate-700">Thiếu tín chỉ</p>
                    <p className="font-mono text-xl font-extrabold text-amber-800 mt-1">{missingReasons.thieuTinChi}</p>
                    <p className="text-[10px] text-slate-500 mt-0.5">Chưa đủ {selectedTotalCreditsThreshold} tín chỉ CTĐT</p>
                  </div>

                  {/* Nguyên nhân 2: Thiếu học phần bắt buộc */}
                  <div
                    onClick={() => setActiveReasonFilter(activeReasonFilter === "thieuBatBuoc" ? "all" : "thieuBatBuoc")}
                    className={`rounded-lg p-3 transition border cursor-pointer ${
                      activeReasonFilter === "thieuBatBuoc"
                        ? "bg-amber-100/90 border-amber-500 shadow-xs ring-2 ring-amber-400/40"
                        : "bg-white border-amber-200 hover:border-amber-300 hover:bg-amber-50/50"
                    }`}
                  >
                    <p className="text-[11px] font-bold text-slate-700">Thiếu HP bắt buộc</p>
                    <p className="font-mono text-xl font-extrabold text-amber-800 mt-1">{missingReasons.thieuBatBuoc}</p>
                    <p className="text-[10px] text-slate-500 mt-0.5">Còn môn bắt buộc chưa đạt</p>
                  </div>

                  {/* Nguyên nhân 3: Thiếu yêu cầu tự chọn */}
                  <div
                    onClick={() => setActiveReasonFilter(activeReasonFilter === "thieuTuChon" ? "all" : "thieuTuChon")}
                    className={`rounded-lg p-3 transition border cursor-pointer ${
                      activeReasonFilter === "thieuTuChon"
                        ? "bg-amber-100/90 border-amber-500 shadow-xs ring-2 ring-amber-400/40"
                        : "bg-white border-amber-200 hover:border-amber-300 hover:bg-amber-50/50"
                    }`}
                  >
                    <p className="text-[11px] font-bold text-slate-700">Thiếu TC tự chọn</p>
                    <p className="font-mono text-xl font-extrabold text-amber-800 mt-1">{missingReasons.thieuTuChon}</p>
                    <p className="text-[10px] text-slate-500 mt-0.5">Chưa tích lũy đủ tự chọn theo nhóm</p>
                  </div>

                  {/* Nguyên nhân 4: Có học phần chưa đạt */}
                  <div
                    onClick={() => setActiveReasonFilter(activeReasonFilter === "chuaDat" ? "all" : "chuaDat")}
                    className={`rounded-lg p-3 transition border cursor-pointer ${
                      activeReasonFilter === "chuaDat"
                        ? "bg-amber-100/90 border-amber-500 shadow-xs ring-2 ring-amber-400/40"
                        : "bg-white border-amber-200 hover:border-amber-300 hover:bg-amber-50/50"
                    }`}
                  >
                    <p className="text-[11px] font-bold text-slate-700">Có HP chưa đạt</p>
                    <p className="font-mono text-xl font-extrabold text-amber-800 mt-1">{missingReasons.chuaDat}</p>
                    <p className="text-[10px] text-slate-500 mt-0.5">Từng rớt môn (điểm F) chưa trả nợ</p>
                  </div>
                </div>
              </div>

              {/* BỘ LỌC TRẠNG THÁI, CHỌN LỚP VÀ Ô TÌM KIẾM CHO NĂM CUỐI */}
              <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between pt-2">
                <div className="flex flex-wrap items-center gap-2">
                  {finalYearStatusTabs.map((tab) => {
                    const isActive = statusFilter === tab.key;
                    const Icon = tab.icon;
                    return (
                      <button
                        key={tab.key}
                        type="button"
                        onClick={() => {
                          setStatusFilter(tab.key);
                          if (tab.key !== "NOT_ELIGIBLE") setActiveReasonFilter("all");
                        }}
                        className={`inline-flex items-center gap-1.5 rounded-xl border px-3 py-1.5 text-xs font-bold transition-all duration-200 cursor-pointer ${
                          isActive ? tab.activeCls : tab.inactiveCls
                        }`}
                      >
                        {Icon && <Icon size={13} strokeWidth={2.5} className="shrink-0" />}
                        <span>{tab.label}</span>
                        <span
                          className={`ml-1 rounded-md px-1.5 py-0.5 font-mono text-[11px] font-bold ${
                            isActive ? tab.badgeActiveCls : tab.badgeInactiveCls
                          }`}
                        >
                          {tab.count}
                        </span>
                      </button>
                    );
                  })}
                </div>

                <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 w-full lg:w-auto">
                  {uniqueClasses.length > 1 && (
                    <div className="flex items-center gap-1.5">
                      <span className="text-xs text-slate-500 font-semibold whitespace-nowrap">Lớp:</span>
                      <select
                        value={classFilter}
                        onChange={(e) => setClassFilter(e.target.value)}
                        className="h-10 rounded-xl border border-slate-200 bg-slate-50/50 px-3 text-xs font-semibold text-slate-700 outline-none transition focus:border-lime-500 focus:bg-white focus:ring-2 focus:ring-lime-100 cursor-pointer"
                      >
                        <option value="all">Tất cả lớp ({allStudents.length} SV)</option>
                        {uniqueClasses.map((cls) => {
                          const count = allStudents.filter((s) => s.sClassName === cls).length;
                          return (
                            <option key={cls} value={cls}>
                              {cls} ({count} SV)
                            </option>
                          );
                        })}
                      </select>
                    </div>
                  )}

                  <div className="relative w-full sm:w-72">
                    <Search size={15} className="pointer-events-none absolute left-3.5 top-3 text-slate-400" />
                    <input
                      value={keyword}
                      onChange={(e) => setKeyword(e.target.value)}
                      placeholder="Tìm họ tên, MSSV..."
                      className="h-10 w-full rounded-xl border border-slate-200 bg-slate-50/50 pl-10 pr-8 text-xs outline-none transition focus:border-lime-500 focus:bg-white focus:ring-2 focus:ring-lime-100"
                    />
                    {keyword && (
                      <button
                        type="button"
                        onClick={() => setKeyword("")}
                        className="absolute right-3 top-3 text-slate-400 hover:text-slate-600 cursor-pointer"
                      >
                        <X size={14} />
                      </button>
                    )}
                  </div>
                </div>
              </div>

              {/* THANH THÔNG TIN BỘ LỌC ĐANG ÁP DỤNG */}
              {(classFilter !== "all" || statusFilter !== "all" || activeReasonFilter !== "all" || keyword) && (
                <div className="flex flex-wrap items-center gap-2 p-2.5 bg-slate-50 rounded-xl border border-slate-200 text-xs">
                  <span className="font-semibold text-slate-500 flex items-center gap-1">
                    <Filter size={13} /> Đang lọc:
                  </span>
                  {classFilter !== "all" && (
                    <span className="inline-flex items-center gap-1 rounded-md bg-white border border-slate-200 px-2 py-0.5 font-medium text-slate-700 shadow-2xs">
                      Lớp: {classFilter}
                      <X size={12} className="cursor-pointer hover:text-rose-600" onClick={() => setClassFilter("all")} />
                    </span>
                  )}
                  {statusFilter !== "all" && (
                    <span className="inline-flex items-center gap-1 rounded-md bg-white border border-slate-200 px-2 py-0.5 font-medium text-slate-700 shadow-2xs">
                      Trạng thái: {statusMeta(statusFilter).label}
                      <X size={12} className="cursor-pointer hover:text-rose-600" onClick={() => setStatusFilter("all")} />
                    </span>
                  )}
                  {activeReasonFilter !== "all" && (
                    <span className="inline-flex items-center gap-1 rounded-md bg-amber-100 border border-amber-300 px-2 py-0.5 font-medium text-amber-900 shadow-2xs">
                      Nguyên nhân: {REASON_LABELS[activeReasonFilter]}
                      <X size={12} className="cursor-pointer hover:text-rose-600" onClick={() => setActiveReasonFilter("all")} />
                    </span>
                  )}
                  {keyword && (
                    <span className="inline-flex items-center gap-1 rounded-md bg-white border border-slate-200 px-2 py-0.5 font-medium text-slate-700 shadow-2xs">
                      Từ khóa: &quot;{keyword}&quot;
                      <X size={12} className="cursor-pointer hover:text-rose-600" onClick={() => setKeyword("")} />
                    </span>
                  )}
                  <span className="text-slate-400">({filteredStudents.length} sinh viên)</span>
                  <button
                    type="button"
                    onClick={() => {
                      setClassFilter("all");
                      setStatusFilter("all");
                      setActiveReasonFilter("all");
                      setKeyword("");
                    }}
                    className="ml-auto font-bold text-rose-600 hover:text-rose-800 cursor-pointer"
                  >
                    Xóa tất cả bộ lọc
                  </button>
                </div>
              )}

              {/* BẢNG DANH SÁCH SINH VIÊN NĂM CUỐI */}
              <div className="overflow-x-auto rounded-xl border border-slate-200">
                <table className="w-full text-left text-xs">
                  <thead className="border-b border-slate-200 bg-slate-50 text-[11px] font-bold uppercase tracking-wider text-slate-500">
                    <tr>
                      <th className="px-4 py-3.5">Họ tên & MSSV</th>
                      <th className="px-3 py-3.5 text-center">Khóa / Lớp</th>
                      <th className="px-3 py-3.5 text-center">Tích lũy / Tổng CTĐT</th>
                      <th className="px-3 py-3.5 text-center">HP đang học</th>
                      <th className="px-3 py-3.5 text-center">Trạng thái</th>
                      <th className="px-4 py-3.5 text-right">Thao tác</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {studentsLoading ? (
                      <tr>
                        <td colSpan={6} className="py-16 text-center text-slate-500">
                          <LoaderCircle size={22} className="mx-auto mb-2 animate-spin text-lime-600" />
                          Đang tải danh sách sinh viên năm cuối...
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
                              setClassFilter("all");
                              setStatusFilter("all");
                              setActiveReasonFilter("all");
                              setKeyword("");
                            }}
                            className="mt-3 inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 cursor-pointer shadow-2xs"
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
                            <td className="px-4 py-3.5">
                              <p className="font-bold text-slate-900 text-sm hover:text-lime-700 transition">
                                {student.sStudentName}
                              </p>
                              <p className="font-mono text-xs text-slate-500 mt-0.5">MSSV: {student.sStudentId}</p>
                            </td>

                            {/* Khóa / Lớp */}
                            <td className="px-3 py-3.5 text-center">
                              <span className="inline-block rounded-md bg-slate-100 px-2 py-0.5 font-mono text-xs font-semibold text-slate-700">
                                {student.sClassName || selectedRun.cohortCode || "—"}
                              </span>
                            </td>

                            {/* Tín chỉ tích lũy / Tổng CTĐT */}
                            <td className="px-3 py-3.5 text-center">
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
                            <td className="px-3 py-3.5 text-center">
                              {pendingCourses > 0 ? (
                                <span className="inline-flex items-center gap-1 rounded-md bg-sky-50 border border-sky-200 px-2 py-0.5 font-mono text-xs font-bold text-sky-700">
                                  <Clock size={12} /> {pendingCourses} môn
                                </span>
                              ) : (
                                <span className="text-slate-400 font-mono text-xs">—</span>
                              )}
                            </td>

                            {/* Trạng thái */}
                            <td className="px-3 py-3.5 text-center">
                              <span className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-bold ${meta.pillBg}`}>
                                <span className={`h-1.5 w-1.5 rounded-full ${meta.dotColor}`} />
                                {meta.short}
                              </span>
                            </td>

                            {/* Thao tác */}
                            <td className="px-4 py-3.5 text-right" onClick={(e) => e.stopPropagation()}>
                              <div className="flex items-center justify-end gap-1.5">
                                <button
                                  type="button"
                                  disabled={studentLoading}
                                  onClick={() => void openStudent(student, "transcript")}
                                  className="inline-flex items-center gap-1.5 rounded-xl border border-lime-300 bg-lime-50/60 px-2.5 py-1 text-xs font-bold text-lime-800 shadow-2xs hover:bg-lime-100 cursor-pointer disabled:opacity-50"
                                >
                                  <FileText size={13} />
                                  Bảng điểm
                                </button>
                                <button
                                  type="button"
                                  disabled={studentLoading}
                                  onClick={() => void openStudent(student, "summary")}
                                  className="inline-flex items-center rounded-xl p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700 transition cursor-pointer"
                                  title="Xem chi tiết"
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
            </div>
          ) : (
            /* ========================================================= */
            /* GÓC NHÌN B: SINH VIÊN NĂM 2-4 (PHÁT HIỆN PHẦN CÒN THIẾU)  */
            /* ========================================================= */
            <div className="p-4 sm:p-5 space-y-5 bg-white">
              {/* THÔNG BÁO VỀ GÓC NHÌN PHÁT HIỆN PHẦN CÒN THIẾU NĂM 2-4 */}
              <div className="rounded-xl border border-amber-200 bg-amber-50/50 p-3.5 flex items-start gap-3">
                <AlertCircle size={20} className="text-amber-600 mt-0.5 shrink-0" />
                <div className="text-xs">
                  <p className="font-bold text-amber-900">
                    Phát hiện sớm các yêu cầu CTĐT còn thiếu ({currentBatchInfo.label})
                  </p>
                  <p className="text-amber-800 mt-0.5">
                    Hệ thống rà soát các học phần bắt buộc và yêu cầu từ các giai đoạn/học kỳ đã đi qua nhưng sinh viên chưa hoàn thành hoặc chưa đạt. Không tính các yêu cầu của học kỳ tương lai.
                  </p>
                </div>
              </div>

              {/* 5 THẺ TỔNG QUAN PHẦN CÒN THIẾU NĂM 2-4 */}
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
                {/* 1. Tổng sinh viên đang xem */}
                <div
                  onClick={() => setYear23Filter("all")}
                  className={`rounded-xl border p-3.5 transition cursor-pointer flex flex-col justify-between ${
                    year23Filter === "all"
                      ? "border-slate-800 bg-slate-100 shadow-xs ring-2 ring-slate-400"
                      : "border-slate-200 bg-slate-50/70 hover:bg-slate-100 hover:border-slate-300"
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">Tổng sinh viên</span>
                    <Users size={16} className="text-slate-400" />
                  </div>
                  <div className="my-1.5">
                    <p className="font-mono text-2xl font-black text-slate-900">{year23BacklogStats.total}</p>
                  </div>
                  <p className="text-[11px] text-slate-500 truncate">
                    {classFilter === "all" ? `Khóa ${selectedRun.cohortCode}` : `Lớp ${classFilter}`} • {currentStudyYearLabel}
                  </p>
                </div>

                {/* 2. Sinh viên không thiếu yêu cầu (🟢) */}
                <div
                  onClick={() => setYear23Filter(year23Filter === "clean" ? "all" : "clean")}
                  className={`rounded-xl border p-3.5 transition cursor-pointer flex flex-col justify-between ${
                    year23Filter === "clean"
                      ? "border-emerald-600 bg-emerald-100/60 shadow-xs ring-2 ring-emerald-500"
                      : "border-emerald-200 bg-emerald-50/50 hover:bg-emerald-100/50 hover:border-emerald-300"
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span className="text-[11px] font-bold text-emerald-800 uppercase tracking-wider">Không thiếu</span>
                    <CheckCircle2 size={16} className="text-emerald-600" />
                  </div>
                  <div className="my-1.5 flex items-baseline gap-2">
                    <p className="font-mono text-2xl font-black text-emerald-700">
                      {year23BacklogStats.clean}
                    </p>
                    <span className="text-[11px] font-bold text-emerald-600 font-mono">
                      ({Math.round((year23BacklogStats.clean / (year23BacklogStats.total || 1)) * 100)}%)
                    </span>
                  </div>
                  <p className="text-[11px] text-emerald-700 font-medium truncate">
                    Đạt tốt mọi kỳ đã qua
                  </p>
                </div>

                {/* 3. Sinh viên thiếu HP bắt buộc (🟠) */}
                <div
                  onClick={() => setYear23Filter(year23Filter === "overdueMandatory" ? "all" : "overdueMandatory")}
                  className={`rounded-xl border p-3.5 transition cursor-pointer flex flex-col justify-between ${
                    year23Filter === "overdueMandatory"
                      ? "border-amber-600 bg-amber-100/60 shadow-xs ring-2 ring-amber-500"
                      : "border-amber-200 bg-amber-50/50 hover:bg-amber-100/50 hover:border-amber-300"
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span className="text-[11px] font-bold text-amber-800 uppercase tracking-wider">Thiếu HP bắt buộc</span>
                    <AlertTriangle size={16} className="text-amber-600" />
                  </div>
                  <div className="my-1.5 flex items-baseline gap-2">
                    <p className="font-mono text-2xl font-black text-amber-700">
                      {year23BacklogStats.overdueMandatory}
                    </p>
                    <span className="text-[11px] font-bold text-amber-600 font-mono">
                      ({Math.round((year23BacklogStats.overdueMandatory / (year23BacklogStats.total || 1)) * 100)}%)
                    </span>
                  </div>
                  <p className="text-[11px] text-amber-700 font-medium truncate">
                    Chưa hoàn thành từ kỳ trước
                  </p>
                </div>

                {/* 4. Sinh viên có học phần chưa đạt (🔴) */}
                <div
                  onClick={() => setYear23Filter(year23Filter === "failed" ? "all" : "failed")}
                  className={`rounded-xl border p-3.5 transition cursor-pointer flex flex-col justify-between ${
                    year23Filter === "failed"
                      ? "border-rose-600 bg-rose-100/60 shadow-xs ring-2 ring-rose-500"
                      : "border-rose-200 bg-rose-50/50 hover:bg-rose-100/50 hover:border-rose-300"
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span className="text-[11px] font-bold text-rose-800 uppercase tracking-wider">Có HP chưa đạt</span>
                    <XCircle size={16} className="text-rose-600" />
                  </div>
                  <div className="my-1.5 flex items-baseline gap-2">
                    <p className="font-mono text-2xl font-black text-rose-700">
                      {year23BacklogStats.failed}
                    </p>
                    <span className="text-[11px] font-bold text-rose-600 font-mono">
                      ({Math.round((year23BacklogStats.failed / (year23BacklogStats.total || 1)) * 100)}%)
                    </span>
                  </div>
                  <p className="text-[11px] text-rose-700 font-medium truncate">
                    Từng rớt môn cần học lại trả nợ
                  </p>
                </div>

                {/* 5. Sinh viên thiếu yêu cầu tự chọn (🟣) */}
                <div
                  onClick={() => setYear23Filter(year23Filter === "elective" ? "all" : "elective")}
                  className={`rounded-xl border p-3.5 transition cursor-pointer flex flex-col justify-between col-span-2 sm:col-span-1 ${
                    year23Filter === "elective"
                      ? "border-indigo-600 bg-indigo-100/60 shadow-xs ring-2 ring-indigo-500"
                      : "border-indigo-200 bg-indigo-50/50 hover:bg-indigo-100/50 hover:border-indigo-300"
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span className="text-[11px] font-bold text-indigo-800 uppercase tracking-wider">Thiếu tự chọn</span>
                    <BookOpen size={16} className="text-indigo-600" />
                  </div>
                  <div className="my-1.5 flex items-baseline gap-2">
                    <p className="font-mono text-2xl font-black text-indigo-700">
                      {year23BacklogStats.elective}
                    </p>
                    <span className="text-[11px] font-bold text-indigo-600 font-mono">
                      ({Math.round((year23BacklogStats.elective / (year23BacklogStats.total || 1)) * 100)}%)
                    </span>
                  </div>
                  <p className="text-[11px] text-indigo-700 font-medium truncate">
                    Nợ môn/nhóm tự chọn kỳ trước
                  </p>
                </div>
              </div>

              {/* KHU VỰC: YÊU CẦU CÒN THIẾU PHỔ BIẾN */}
              {commonBacklogItems.length > 0 && (
                <div className="rounded-xl border border-slate-200 bg-slate-50/80 p-4 space-y-3">
                  <div className="flex items-center justify-between flex-wrap gap-2">
                    <div className="flex items-center gap-2">
                      <span className="flex h-5 w-5 items-center justify-center rounded-md bg-amber-100 text-amber-800 text-xs font-bold">
                        ⚡
                      </span>
                      <h3 className="text-xs font-bold uppercase tracking-wider text-slate-800">
                        Yêu cầu & học phần còn thiếu phổ biến nhất ({currentStudyYearLabel})
                      </h3>
                    </div>
                    <span className="text-[11px] text-slate-500 italic">
                      Bấm vào học phần để lọc nhanh danh sách sinh viên bị ảnh hưởng
                    </span>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-2.5">
                    {commonBacklogItems.map((item) => {
                      const isSelected = selectedCourseBacklogFilter === item.code;
                      const badgeCls =
                        item.type === "failed"
                          ? "border-rose-200 bg-white hover:bg-rose-50/60 text-rose-900"
                          : item.type === "elective"
                          ? "border-indigo-200 bg-white hover:bg-indigo-50/60 text-indigo-900"
                          : "border-amber-200 bg-white hover:bg-amber-50/60 text-amber-900";
                      const tagCls =
                        item.type === "failed"
                          ? "bg-rose-100 text-rose-800"
                          : item.type === "elective"
                          ? "bg-indigo-100 text-indigo-800"
                          : "bg-amber-100 text-amber-800";
                      const typeLabel =
                        item.type === "failed" ? "Môn F" : item.type === "elective" ? "Tự chọn" : "Bắt buộc";

                      return (
                        <div
                          key={item.key}
                          onClick={() => setSelectedCourseBacklogFilter(isSelected ? null : item.code)}
                          className={`rounded-xl border p-2.5 transition cursor-pointer flex flex-col justify-between gap-1.5 shadow-2xs ${
                            isSelected ? "ring-2 ring-slate-900 bg-amber-50/80 border-slate-900" : badgeCls
                          }`}
                        >
                          <div className="flex items-center justify-between gap-1">
                            <span className={`text-[10px] font-bold uppercase px-1.5 py-0.5 rounded ${tagCls}`}>
                              {typeLabel}
                            </span>
                            <span className="font-mono text-xs font-bold text-slate-900 bg-slate-100 px-1.5 py-0.5 rounded">
                              {item.count} SV
                            </span>
                          </div>
                          <div>
                            <p className="font-bold text-xs text-slate-900 line-clamp-1" title={item.name}>
                              {item.name}
                            </p>
                            <p className="font-mono text-[10px] text-slate-500 mt-0.5">{item.code}</p>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* BỘ LỌC PHẦN CÒN THIẾU, LỚP VÀ TÌM KIẾM CHO NĂM 2-4 */}
              <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between pt-1">
                <div className="flex flex-wrap items-center gap-2">
                  {year23Tabs.map((tab) => {
                    const isActive = year23Filter === tab.key;
                    return (
                      <button
                        key={tab.key}
                        type="button"
                        onClick={() => setYear23Filter(tab.key)}
                        className={`inline-flex items-center gap-1.5 rounded-xl border px-3 py-1.5 text-xs font-bold transition-all duration-200 cursor-pointer ${
                          isActive ? tab.activeCls : tab.inactiveCls
                        }`}
                      >
                        <span>{tab.label}</span>
                        <span
                          className={`ml-1 rounded-md px-1.5 py-0.5 font-mono text-[11px] font-bold ${
                            isActive ? tab.badgeActiveCls : tab.badgeInactiveCls
                          }`}
                        >
                          {tab.count}
                        </span>
                      </button>
                    );
                  })}
                </div>

                <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 w-full lg:w-auto">
                  {uniqueClasses.length > 1 && (
                    <div className="flex items-center gap-1.5">
                      <span className="text-xs text-slate-500 font-semibold whitespace-nowrap">Lớp:</span>
                      <select
                        value={classFilter}
                        onChange={(e) => setClassFilter(e.target.value)}
                        className="h-10 rounded-xl border border-slate-200 bg-slate-50/50 px-3 text-xs font-semibold text-slate-700 outline-none transition focus:border-lime-500 focus:bg-white focus:ring-2 focus:ring-lime-100 cursor-pointer"
                      >
                        <option value="all">Tất cả lớp ({allStudents.length} SV)</option>
                        {uniqueClasses.map((cls) => {
                          const count = allStudents.filter((s) => s.sClassName === cls).length;
                          return (
                            <option key={cls} value={cls}>
                              {cls} ({count} SV)
                            </option>
                          );
                        })}
                      </select>
                    </div>
                  )}

                  <div className="relative w-full sm:w-72">
                    <Search size={15} className="pointer-events-none absolute left-3.5 top-3 text-slate-400" />
                    <input
                      value={keyword}
                      onChange={(e) => setKeyword(e.target.value)}
                      placeholder="Tìm sinh viên, MSSV..."
                      className="h-10 w-full rounded-xl border border-slate-200 bg-slate-50/50 pl-10 pr-8 text-xs outline-none transition focus:border-lime-500 focus:bg-white focus:ring-2 focus:ring-lime-100"
                    />
                    {keyword && (
                      <button
                        type="button"
                        onClick={() => setKeyword("")}
                        className="absolute right-3 top-3 text-slate-400 hover:text-slate-600 cursor-pointer"
                      >
                        <X size={14} />
                      </button>
                    )}
                  </div>
                </div>
              </div>

              {/* THANH THÔNG TIN BỘ LỌC ĐANG ÁP DỤNG (NĂM 2-4) */}
              {(classFilter !== "all" || year23Filter !== "all" || selectedCourseBacklogFilter || keyword) && (
                <div className="flex flex-wrap items-center gap-2 p-2.5 bg-slate-50 rounded-xl border border-slate-200 text-xs">
                  <span className="font-semibold text-slate-500 flex items-center gap-1">
                    <Filter size={13} /> Đang lọc:
                  </span>
                  {classFilter !== "all" && (
                    <span className="inline-flex items-center gap-1 rounded-md bg-white border border-slate-200 px-2 py-0.5 font-medium text-slate-700 shadow-2xs">
                      Lớp: {classFilter}
                      <X size={12} className="cursor-pointer hover:text-rose-600" onClick={() => setClassFilter("all")} />
                    </span>
                  )}
                  {year23Filter !== "all" && (
                    <span className="inline-flex items-center gap-1 rounded-md bg-white border border-slate-200 px-2 py-0.5 font-medium text-slate-700 shadow-2xs">
                      Trạng thái: {YEAR23_LABELS[year23Filter] || year23Filter}
                      <X size={12} className="cursor-pointer hover:text-rose-600" onClick={() => setYear23Filter("all")} />
                    </span>
                  )}
                  {selectedCourseBacklogFilter && (
                    <span className="inline-flex items-center gap-1 rounded-md bg-amber-100 border border-amber-300 px-2 py-0.5 font-bold text-amber-800 shadow-2xs">
                      Học phần còn thiếu: {selectedCourseBacklogFilter}
                      <X size={12} className="cursor-pointer hover:text-rose-600" onClick={() => setSelectedCourseBacklogFilter(null)} />
                    </span>
                  )}
                  {keyword && (
                    <span className="inline-flex items-center gap-1 rounded-md bg-white border border-slate-200 px-2 py-0.5 font-medium text-slate-700 shadow-2xs">
                      Từ khóa: &quot;{keyword}&quot;
                      <X size={12} className="cursor-pointer hover:text-rose-600" onClick={() => setKeyword("")} />
                    </span>
                  )}
                  <span className="text-slate-400">({filteredStudents.length} sinh viên)</span>
                  <button
                    type="button"
                    onClick={() => {
                      setClassFilter("all");
                      setYear23Filter("all");
                      setSelectedCourseBacklogFilter(null);
                      setKeyword("");
                    }}
                    className="ml-auto font-bold text-rose-600 hover:text-rose-800 cursor-pointer"
                  >
                    Xóa tất cả bộ lọc
                  </button>
                </div>
              )}

              {/* BẢNG THEO DÕI NĂM 2-4: CÁC CỘT ƯU TIÊN THEO YÊU CẦU */}
              <div className="overflow-x-auto rounded-xl border border-slate-200">
                <table className="w-full min-w-[980px] text-left text-xs">
                  <thead className="border-b border-slate-200 bg-slate-50 text-[11px] font-bold uppercase tracking-wider text-slate-500">
                    <tr>
                      <th className="px-3.5 py-3.5">MSSV</th>
                      <th className="px-3.5 py-3.5">Họ tên</th>
                      <th className="px-3 py-3.5 text-center">Khóa / Lớp</th>
                      <th className="px-2.5 py-3.5 text-center">Năm học</th>
                      <th className="px-3.5 py-3.5 text-center">Thiếu HP bắt buộc</th>
                      <th className="px-3.5 py-3.5 text-center">Có HP chưa đạt</th>
                      <th className="px-3.5 py-3.5 text-center">Thiếu tự chọn</th>
                      <th className="px-3 py-3.5 text-center">Tổng thiếu</th>
                      <th className="px-3.5 py-3.5 text-right">Thao tác</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {studentsLoading ? (
                      <tr>
                        <td colSpan={9} className="py-16 text-center text-slate-500">
                          <LoaderCircle size={22} className="mx-auto mb-2 animate-spin text-lime-600" />
                          Đang tải danh sách sinh viên...
                        </td>
                      </tr>
                    ) : filteredStudents.length === 0 ? (
                      <tr>
                        <td colSpan={9} className="py-16 text-center text-slate-500">
                          <p className="font-semibold text-slate-700">Không có sinh viên nào phù hợp bộ lọc</p>
                          <p className="text-xs text-slate-400 mt-1">Hãy xóa từ khóa tìm kiếm hoặc bấm &quot;Xóa tất cả bộ lọc&quot;.</p>
                          <button
                            type="button"
                            onClick={() => {
                              setClassFilter("all");
                              setYear23Filter("all");
                              setSelectedCourseBacklogFilter(null);
                              setKeyword("");
                            }}
                            className="mt-3 inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 cursor-pointer shadow-2xs"
                          >
                            Xóa bộ lọc
                          </button>
                        </td>
                      </tr>
                    ) : (
                      filteredStudents.map((student) => {
                        const backlog = getStudentBacklog(student);
                        const pendingCourses = backlog.pendingCount;

                        return (
                          <tr
                            key={student.id}
                            onClick={() => void openStudent(student, "summary")}
                            className="transition hover:bg-blue-50/20 cursor-pointer"
                          >
                            {/* 1. MSSV */}
                            <td className="px-3.5 py-3 font-mono font-bold text-xs text-slate-800">
                              {student.sStudentId}
                            </td>

                            {/* 2. Họ tên */}
                            <td className="px-3.5 py-3">
                              <p className="font-bold text-slate-900 text-xs hover:text-blue-700 transition">
                                {student.sStudentName}
                              </p>
                              {pendingCourses > 0 && (
                                <p className="mt-0.5 text-[10px] text-sky-700 flex items-center gap-1">
                                  <Clock size={10} /> Đang học {pendingCourses} môn
                                </p>
                              )}
                            </td>

                            {/* 3. Khóa / Lớp */}
                            <td className="px-3 py-3 text-center">
                              <span className="inline-block rounded-md bg-slate-100 px-2 py-0.5 font-mono text-[11px] font-semibold text-slate-700">
                                {student.sClassName || selectedRun.cohortCode || "—"}
                              </span>
                            </td>

                            {/* 4. Năm học */}
                            <td className="px-2.5 py-3 text-center">
                              <span className="inline-block rounded-full bg-slate-100 border border-slate-200 px-2.5 py-0.5 text-[11px] font-bold text-slate-700">
                                {currentStudyYearLabel}
                              </span>
                            </td>

                            {/* 5. Thiếu HP bắt buộc */}
                            <td className="px-3.5 py-3 text-center">
                              {backlog.overdueMandatoryCourses.length > 0 ? (
                                <div className="flex flex-col items-center gap-1">
                                  <span className="font-mono text-xs font-bold text-amber-800">
                                    {backlog.overdueMandatoryCourses.length} HP
                                  </span>
                                  <div className="flex flex-wrap justify-center gap-1 max-w-[170px]">
                                    {backlog.overdueMandatoryCourses.slice(0, 2).map((c) => (
                                      <span
                                        key={c.courseCode}
                                        title={`${c.courseName}${c.semesterNo ? ` (HK${c.semesterNo})` : ""}`}
                                        className="inline-block rounded bg-amber-100/90 border border-amber-200 px-1.5 py-0.5 font-mono text-[10px] font-bold text-amber-800"
                                      >
                                        {c.courseCode}
                                      </span>
                                    ))}
                                    {backlog.overdueMandatoryCourses.length > 2 && (
                                      <span className="rounded bg-amber-100/90 px-1.5 py-0.5 font-mono text-[10px] font-bold text-amber-800">
                                        +{backlog.overdueMandatoryCourses.length - 2}
                                      </span>
                                    )}
                                  </div>
                                </div>
                              ) : (
                                <span className="text-slate-400 font-mono text-xs">—</span>
                              )}
                            </td>

                            {/* 6. HP chưa đạt (F) */}
                            <td className="px-3.5 py-3 text-center">
                              {backlog.failedCourses.length > 0 ? (
                                <div className="flex flex-col items-center gap-1">
                                  <span className="font-mono text-xs font-bold text-rose-800">
                                    {backlog.failedCourses.length} HP
                                  </span>
                                  <div className="flex flex-wrap justify-center gap-1 max-w-[170px]">
                                    {backlog.failedCourses.slice(0, 2).map((c) => (
                                      <span
                                        key={c.courseCode}
                                        title={`${c.courseName}${c.letterGrade ? ` (Điểm ${c.letterGrade})` : ""}`}
                                        className="inline-block rounded bg-rose-100/90 border border-rose-200 px-1.5 py-0.5 font-mono text-[10px] font-bold text-rose-800"
                                      >
                                        {c.courseCode} ({c.letterGrade || "F"})
                                      </span>
                                    ))}
                                    {backlog.failedCourses.length > 2 && (
                                      <span className="rounded bg-rose-100/90 px-1.5 py-0.5 font-mono text-[10px] font-bold text-rose-800">
                                        +{backlog.failedCourses.length - 2}
                                      </span>
                                    )}
                                  </div>
                                </div>
                              ) : (
                                <span className="text-slate-400 font-mono text-xs">—</span>
                              )}
                            </td>

                            {/* 7. Thiếu yêu cầu tự chọn */}
                            <td className="px-3.5 py-3 text-center">
                              {backlog.electiveBacklogCount > 0 ? (
                                <div className="flex flex-col items-center gap-1">
                                  <span className="font-mono text-xs font-bold text-indigo-800">
                                    {backlog.electiveBacklogCount} yêu cầu
                                  </span>
                                  <div className="flex flex-wrap justify-center gap-1 max-w-[170px]">
                                    {backlog.failedElectiveCourses.slice(0, 2).map((c) => (
                                      <span
                                        key={c.courseCode}
                                        title={`${c.courseName} (Môn tự chọn rớt điểm ${c.letterGrade || "F"})`}
                                        className="inline-block rounded bg-indigo-100/90 border border-indigo-200 px-1.5 py-0.5 font-mono text-[10px] font-bold text-indigo-800"
                                      >
                                        {c.courseCode} (F)
                                      </span>
                                    ))}
                                    {backlog.electiveGroupBacklogs.slice(0, 1).map((g) => (
                                      <span
                                        key={g.groupCode}
                                        title={g.message}
                                        className="inline-block rounded bg-indigo-100/90 border border-indigo-200 px-1.5 py-0.5 font-mono text-[10px] font-bold text-indigo-800"
                                      >
                                        {g.groupCode}
                                      </span>
                                    ))}
                                  </div>
                                </div>
                              ) : (
                                <span className="text-slate-400 font-mono text-xs">—</span>
                              )}
                            </td>

                            {/* 8. Tổng số yêu cầu còn thiếu */}
                            <td className="px-3 py-3 text-center">
                              {backlog.totalBacklogCount === 0 ? (
                                <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 border border-emerald-200 px-2.5 py-0.5 text-xs font-bold text-emerald-700">
                                  <CheckCircle2 size={13} className="text-emerald-600" />
                                  0 (Sạch)
                                </span>
                              ) : (
                                <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-bold ${
                                  backlog.totalBacklogCount >= 3
                                    ? "bg-rose-100 border border-rose-200 text-rose-800"
                                    : "bg-amber-100 border border-amber-200 text-amber-800"
                                }`}>
                                  <AlertTriangle size={12} />
                                  {backlog.totalBacklogCount} mục thiếu
                                </span>
                              )}
                            </td>

                            {/* 9. Thao tác */}
                            <td className="px-3.5 py-3 text-right" onClick={(e) => e.stopPropagation()}>
                              <div className="flex items-center justify-end gap-1.5">
                                <button
                                  type="button"
                                  disabled={studentLoading}
                                  onClick={() => void openStudent(student, "summary")}
                                  className="inline-flex items-center gap-1.5 rounded-xl border border-slate-300 bg-white px-2.5 py-1 text-xs font-bold text-slate-800 shadow-2xs hover:bg-slate-50 cursor-pointer disabled:opacity-50"
                                >
                                  <BookOpen size={13} />
                                  Chi tiết
                                </button>
                                <button
                                  type="button"
                                  disabled={studentLoading}
                                  onClick={() => void openStudent(student, "transcript")}
                                  className="inline-flex items-center gap-1.5 rounded-xl border border-blue-300 bg-blue-50/60 px-2.5 py-1 text-xs font-bold text-blue-800 shadow-2xs hover:bg-blue-100 cursor-pointer disabled:opacity-50"
                                >
                                  <FileText size={13} />
                                  Bảng điểm
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
            </div>
          )}
        </section>
      )}

      {/* 4. MODAL CHI TIẾT SINH VIÊN VÀ BẢNG ĐIỂM */}
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
          const { grades: rawGrades = [], forecast } = selectedStudent;
          const cleanGrades = (rawGrades || []).filter((g: ApiData) => {
            const code = String(g.courseCode || g.sCurriculumId || "").toUpperCase();
            const name = String(g.courseName || g.sCourseName || "").toLowerCase();
            return !code.startsWith("SHCD") && !name.includes("sinh hoạt công dân");
          });

          // Khử trùng lặp môn học
          const byCode = new Map<string, ApiData>();
          for (const g of cleanGrades) {
            const code = String(g.courseCode || g.sCurriculumId || "").toUpperCase();
            if (!code) continue;
            if (!byCode.has(code)) {
              byCode.set(code, g);
              continue;
            }
            const existing = byCode.get(code)!;
            const gPass = Boolean(g.isPass || g.isPassed);
            const exPass = Boolean(existing.isPass || existing.isPassed);
            if (gPass && !exPass) { byCode.set(code, g); continue; }
            if (!gPass && exPass) continue;
            if (gPass && exPass) {
              const scoreG = Number(g.score10 ?? g.score4 ?? 0);
              const scoreEx = Number(existing.score10 ?? existing.score4 ?? 0);
              if (scoreG > scoreEx) { byCode.set(code, g); continue; }
              if (scoreG === scoreEx && String(g.academicYear || "") > String(existing.academicYear || "")) {
                byCode.set(code, g); continue;
              }
              continue;
            }
            const hasScoreG = g.score10 != null || g.score4 != null || Boolean(g.letterGrade || g.letterCode);
            const hasScoreEx = existing.score10 != null || existing.score4 != null || Boolean(existing.letterGrade || existing.letterCode);
            if (hasScoreG && !hasScoreEx) { byCode.set(code, g); continue; }
            if (!hasScoreG && hasScoreEx) continue;
            if (String(g.academicYear || "") > String(existing.academicYear || "")) { byCode.set(code, g); }
          }
          const grades = Array.from(byCode.values());

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
                  <span>Tổng quan & Điều kiện CTĐT</span>
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
                  grades={grades}
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

              {studentModalTab === "transcript" && (
                <div className="space-y-4">
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
