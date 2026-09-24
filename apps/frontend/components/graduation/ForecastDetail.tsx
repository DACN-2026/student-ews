"use client";

import { useMemo, useState } from "react";
import {
  AlertCircle,
  AlertTriangle,
  Award,
  BookOpen,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Clock,
  FileCheck2,
  GraduationCap,
  Info,
  Shield,
  ShieldAlert,
  Sparkles,
  Search,
  TrendingUp,
  XCircle,
} from "lucide-react";

type Course = {
  courseId: string;
  courseCode: string;
  courseName: string;
  credits: number;
  requirementType: string;
  state: "passed" | "failed" | "no_score" | "not_completed";
  semesterNo: number | null;
  schedule: { academicYear: string; termCode: string } | null;
};

type StudentGrade = {
  id?: string;
  courseCode?: string;
  sCurriculumId?: string;
  courseName?: string;
  sCourseName?: string;
  credits?: number;
  score10?: number | string | null;
  score4?: number | string | null;
  letterGrade?: string | null;
  isPassed?: boolean;
  isPass?: boolean;
  scoreStatus?: string;
  notScore?: boolean;
  academicYear?: string | null;
  termCode?: string | null;
};

type Forecast = {
  curriculumComplete?: boolean | null;
  summary: {
    requiredCredits: number | null;
    completedCredits: number | null;
    remainingCredits: number | null;
    pendingCredits: number | null;
    completionPercent: number | null;
  };
  requirements: {
    requiredCourses: { total: number; completed: number; remaining: number; pending?: number; requiredCredits: number; completedCredits: number; pendingCredits?: number };
    electives: { requiredCredits: number | null; passedCredits: number; completedCredits: number | null; remainingCredits: number | null; pendingCredits?: number; excessCredits: number | null };
  };
  requiredCoursesBreakdown?: {
    completed: Course[];
    missing: Course[];
    failed: Course[];
    noScore: Course[];
  };
  missingRequiredCourses: Course[];
  failedCourses: Course[];
  noScoreCourses: Course[];
  graduationRequirements: Course[];
  electiveGroups: {
    code: string;
    groupCode?: string;
    requiredCredits: number | null;
    passedCredits: number;
    earnedCredits?: number;
    creditedCredits: number | null;
    remainingCredits: number | null;
    extraCredits: number | null;
    pendingCredits?: number;
    status: string;
  }[];
  electiveOptions: Course[];
  electiveCourses?: Course[];
  remainingBySemester: { academicYear: string; termCode: string; label: string; courses: Course[] }[];
  unmatchedGrades: { courseCode?: string | null; courseName?: string | null }[];
  warnings: string[];
};

type AdditionalRequirement = {
  ruleCode: string;
  ruleName: string;
  category: string;
  result: string;
  requiredValue?: string | null;
  actualValue?: string | null;
  reason?: string | null;
};

type StudentInfo = {
  sStudentId?: string | null;
  sStudentName?: string | null;
  sClassName?: string | null;
  sProgramCode?: string | null;
  cohortCode?: string | null;
  cumulativeGpa4?: number | null;
  totalCredits?: number | null;
  wholeCourseTrainingScore?: number | null;
  finalStatus?: string | null;
};

const STANDARD_CERTS: Record<
  string,
  { name: string; icon: typeof Award; desc: string; advice: string }
> = {
  PHYSICAL_EDUCATION: {
    name: "Chứng chỉ Giáo dục thể chất",
    icon: BookOpen,
    desc: "Yêu cầu hoàn thành các học phần giáo dục thể chất",
    advice: "Cần tích lũy đủ các học phần thể chất theo chương trình đào tạo.",
  },
  NATIONAL_DEFENSE: {
    name: "Chứng chỉ GDQP & An ninh",
    icon: Shield,
    desc: "Yêu cầu có chứng chỉ Giáo dục quốc phòng và an ninh",
    advice: "Nộp bản sao chứng chỉ GDQP cho Phòng Đào tạo khi hoàn thành khóa huấn luyện.",
  },
  WHOLE_COURSE_TRAINING: {
    name: "Điểm rèn luyện toàn khóa",
    icon: Sparkles,
    desc: "Tổng hợp kết quả rèn luyện từng kỳ (yêu cầu từ 50 điểm trở lên)",
    advice: "Điểm rèn luyện được cập nhật định kỳ sau mỗi học kỳ chính.",
  },
  CUMULATIVE_GPA: {
    name: "Điểm trung bình tích lũy (GPA)",
    icon: TrendingUp,
    desc: "Điểm trung bình tích lũy toàn khóa đạt tối thiểu từ 2.00 / 4.00",
    advice: "Cần duy trì điểm trung bình tích lũy để đủ điều kiện xếp loại tốt nghiệp.",
  },
};

export default function ForecastDetail({
  forecast,
  programCode,
  finalStatus,
  reasons = [],
  additionalRequirements = [],
  student,
  grades = [],
}: {
  forecast: Forecast;
  programCode?: string | null;
  finalStatus?: string;
  reasons?: { code: string; result: string; message: string }[];
  additionalRequirements?: AdditionalRequirement[];
  student?: StudentInfo | null;
  grades?: StudentGrade[];
}) {
  const [activeTab, setActiveTab] = useState<"courses" | "certs">("courses");
  const [showTechnicalAudit, setShowTechnicalAudit] = useState(false);

  const { summary, requirements } = forecast;

  // Cohort & study year calculation theo Kế hoạch giảng dạy NH 2026-2027 (Mẫu 07/QLĐT):
  // K46 = Năm 5 (Năm cuối), K47 = Năm 4, K48 = Năm 3, K49 = Năm 2, K50 = Năm 1
  const cohortMatch =
    student?.sClassName?.match(/K(\d{2})/i) ||
    student?.cohortCode?.match(/K(\d{2})/i) ||
    student?.sStudentId?.match(/^\d{2}(\d{2})/i);
  const cohortNumber = cohortMatch ? Number(cohortMatch[1]) : null;
  const isOngoingStudent = cohortNumber ? cohortNumber >= 47 : false;
  const studyYear = cohortNumber ? Math.max(1, 51 - cohortNumber) : null;
  const expectedSemesterNo = cohortNumber ? Math.max(1, (50 - cohortNumber) * 2 + 1) : null;

  // Real earned credits calculation
  const earnedCredits =
    typeof summary.completedCredits === "number"
      ? summary.completedCredits
      : (requirements.requiredCourses.completedCredits || 0) + (requirements.electives.passedCredits || 0);

  const totalLimit = summary.requiredCredits;
  const missingMandatoryCount = requirements.requiredCourses.remaining;

  // Phân loại học phần còn thiếu từ các học kỳ đã qua (dành cho sinh viên năm 2-4)
  const overdueMandatoryCourses = useMemo(() => {
    if (!isOngoingStudent || !expectedSemesterNo) return [];
    return (forecast.missingRequiredCourses || []).filter(
      (c) => c.semesterNo != null && c.semesterNo < expectedSemesterNo && c.state !== "failed" && c.state !== "no_score"
    );
  }, [isOngoingStudent, expectedSemesterNo, forecast.missingRequiredCourses]);

  // Phân loại học phần thuộc các học kỳ tương lai (chưa tới kỳ học)
  const futureMandatoryCourses = useMemo(() => {
    if (!isOngoingStudent || !expectedSemesterNo) return [];
    return (forecast.missingRequiredCourses || []).filter(
      (c) => c.semesterNo != null && c.semesterNo >= expectedSemesterNo && c.state !== "failed" && c.state !== "no_score"
    );
  }, [isOngoingStudent, expectedSemesterNo, forecast.missingRequiredCourses]);

  // Phân loại học phần chưa đạt: Bắt buộc vs Tự chọn
  const failedMandatoryCourses = useMemo(() => {
    return (forecast.failedCourses || []).filter(
      (c) => !/tự chọn|elective/i.test(c.requirementType)
    );
  }, [forecast.failedCourses]);
  const failedMandatoryCount = failedMandatoryCourses.length;

  const failedElectiveCourses = useMemo(() => {
    return (forecast.failedCourses || []).filter(
      (c) => /tự chọn|elective/i.test(c.requirementType)
    );
  }, [forecast.failedCourses]);
  const failedElectiveCount = failedElectiveCourses.length;

  const failedCount = forecast.failedCourses.length;
  const gpa = student?.cumulativeGpa4;
  const conduct = student?.wholeCourseTrainingScore;

  const [courseFilter, setCourseFilter] = useState<"all" | "missing" | "failed">(() => {
    return missingMandatoryCount === 0 && failedMandatoryCount > 0 ? "failed" : "all";
  });

  const gradeByCourseCode = useMemo(() => {
    const map = new Map<string, StudentGrade>();
    for (const g of grades || []) {
      const code = String(g.courseCode || g.sCurriculumId || "").toUpperCase();
      if (code) map.set(code, g);
    }
    return map;
  }, [grades]);

  const displayedCourses = useMemo(() => {
    if (courseFilter === "failed") {
      return failedMandatoryCourses;
    }
    return forecast.missingRequiredCourses;
  }, [courseFilter, failedMandatoryCourses, forecast.missingRequiredCourses]);

  // Elective courses processing & fallback derivation from grades
  const allElectiveCourses = useMemo(() => {
    if (Array.isArray(forecast.electiveCourses) && forecast.electiveCourses.length > 0) {
      return forecast.electiveCourses;
    }
    return forecast.electiveOptions || [];
  }, [forecast.electiveCourses, forecast.electiveOptions]);

  const derivedElectivesFromGrades = useMemo(() => {
    if (allElectiveCourses.length > 0) return [];
    const mandatoryCodes = new Set(
      (forecast.missingRequiredCourses || [])
        .concat(forecast.requiredCoursesBreakdown?.completed || [])
        .map((c) => c.courseCode.toUpperCase()),
    );
    return (grades || [])
      .filter((g) => {
        const code = String(g.courseCode || g.sCurriculumId || "").toUpperCase();
        return code && !mandatoryCodes.has(code);
      })
      .map((g) => {
        const isPass = Boolean(g.isPassed || g.isPass);
        const isFail = !isPass && g.scoreStatus === "graded" && !g.notScore && (g.score10 != null || g.score4 != null || g.letterGrade);
        const state = isPass ? ("passed" as const) : isFail ? ("failed" as const) : ("no_score" as const);
        return {
          courseId: String(g.id || g.courseCode),
          courseCode: String(g.courseCode || g.sCurriculumId),
          courseName: String(g.courseName || g.sCourseName || "Học phần tự chọn"),
          credits: Number(g.credits || 3),
          requirementType: "Tự chọn",
          state,
          semesterNo: null,
          schedule: g.academicYear && g.termCode ? { academicYear: String(g.academicYear), termCode: String(g.termCode) } : null,
        };
      });
  }, [allElectiveCourses, forecast.missingRequiredCourses, forecast.requiredCoursesBreakdown, grades]);

  const effectiveElectiveCourses = useMemo(() => {
    return allElectiveCourses.length > 0 ? allElectiveCourses : derivedElectivesFromGrades;
  }, [allElectiveCourses, derivedElectivesFromGrades]);

  const passedElectives = useMemo(
    () => effectiveElectiveCourses.filter((c) => c.state === "passed"),
    [effectiveElectiveCourses],
  );
  const pendingElectives = useMemo(
    () => effectiveElectiveCourses.filter((c) => c.state === "no_score"),
    [effectiveElectiveCourses],
  );
  const failedElectives = useMemo(
    () => effectiveElectiveCourses.filter((c) => c.state === "failed"),
    [effectiveElectiveCourses],
  );
  const takenElectives = useMemo(
    () => effectiveElectiveCourses.filter((c) => c.state !== "not_completed"),
    [effectiveElectiveCourses],
  );

  const [electiveFilter, setElectiveFilter] = useState<"taken" | "pending" | "failed" | "all">("taken");
  const [electiveSearch, setElectiveSearch] = useState("");

  const displayedElectives = useMemo(() => {
    let list: Course[] = [];
    if (electiveFilter === "taken") list = takenElectives;
    else if (electiveFilter === "pending") list = pendingElectives;
    else if (electiveFilter === "failed") list = failedElectives;
    else list = effectiveElectiveCourses;

    if (electiveSearch.trim()) {
      const q = electiveSearch.toLowerCase();
      list = list.filter(
        (c) =>
          c.courseCode.toLowerCase().includes(q) ||
          c.courseName.toLowerCase().includes(q),
      );
    }
    return list;
  }, [electiveFilter, takenElectives, pendingElectives, failedElectives, effectiveElectiveCourses, electiveSearch]);

  // Layer 2 rules mapping
  const EXCLUDED_RULE_CODES = useMemo(
    () => new Set(["FOREIGN_LANGUAGE", "DISCIPLINE", "LEGAL"]),
    []
  );

  const layer2Rules = useMemo(() => {
    return additionalRequirements.filter(
      (rule) =>
        !["CURRICULUM", "DATA", "CREDIT"].includes(rule.category) &&
        rule.ruleCode !== "PROGRAM_COMPLETION" &&
        rule.ruleCode !== "PROGRAM_MAPPING" &&
        !EXCLUDED_RULE_CODES.has(rule.ruleCode)
    );
  }, [additionalRequirements, EXCLUDED_RULE_CODES]);

  // Clean friendly reasons without [BRACKETED_CODES]
  const friendlyActionItems = useMemo(() => {
    const items: { text: string; type: "error" | "warning" | "info" }[] = [];

    if (failedMandatoryCount > 0) {
      items.push({
        text: `Có ${failedMandatoryCount} học phần bắt buộc bị điểm F cần đăng ký học lại sớm: ${failedMandatoryCourses.map((c) => c.courseName).join(", ")}.`,
        type: "error",
      });
    }

    if (failedElectiveCount > 0) {
      items.push({
        text: `Có ${failedElectiveCount} học phần tự chọn chưa đạt (điểm F): ${failedElectiveCourses.map((c) => c.courseName).join(", ")}. Sinh viên có thể học lại hoặc chọn học phần tự chọn khác phù hợp để tích lũy đủ tín chỉ.`,
        type: "warning",
      });
    }

    if (isOngoingStudent) {
      if (overdueMandatoryCourses.length > 0) {
        items.push({
          text: `CÒN THIẾU: ${overdueMandatoryCourses.length} học phần bắt buộc thuộc các học kỳ trước chưa hoàn thành: ${overdueMandatoryCourses.map((c) => c.courseName).join(", ")}. Sinh viên cần ưu tiên đăng ký học bù sớm.`,
          type: "warning",
        });
      }
      const futureMissingCount = Math.max(0, missingMandatoryCount - overdueMandatoryCourses.length);
      if (futureMissingCount > 0) {
        items.push({
          text: `Lộ trình tới: Còn ${futureMissingCount} học phần bắt buộc thuộc các học kỳ tương lai theo đúng kế hoạch CTĐT.`,
          type: "info",
        });
      }
    } else {
      if (missingMandatoryCount > 0) {
        items.push({
          text: `Còn ${missingMandatoryCount} học phần bắt buộc chưa hoàn thành để đủ điều kiện tốt nghiệp.`,
          type: "error",
        });
      }
    }

    if (requirements.electives.remainingCredits && requirements.electives.remainingCredits > 0) {
      items.push({
        text: `Cần tích lũy thêm tối thiểu ${requirements.electives.remainingCredits} tín chỉ thuộc các nhóm môn tự chọn.`,
        type: "warning",
      });
    }

    return items;
  }, [failedMandatoryCount, failedMandatoryCourses, failedElectiveCount, failedElectiveCourses, missingMandatoryCount, overdueMandatoryCourses, isOngoingStudent, requirements]);

  return (
    <div className="space-y-5 text-sm text-slate-800">
      {/* ============================================================ */}
      {/* 1. HERO BANNER TRẠNG THÁI TỔNG QUAN — THÂN THIỆN, DỄ HIỂU */}
      {/* ============================================================ */}
      <div
        className={`rounded-2xl border p-5 transition-all shadow-xs ${isOngoingStudent
            ? "border-sky-200 bg-gradient-to-br from-sky-50/90 via-white to-indigo-50/50"
            : finalStatus === "EXPECTED_ELIGIBLE"
              ? "border-emerald-200 bg-gradient-to-br from-emerald-50/90 via-white to-teal-50/50"
              : finalStatus === "PENDING_REQUIREMENT"
                ? "border-amber-200 bg-gradient-to-br from-amber-50/90 via-white to-orange-50/50"
                : "border-slate-200 bg-gradient-to-br from-slate-50 via-white to-slate-100/50"
          }`}
      >
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <span className="inline-flex items-center gap-1 rounded-md bg-slate-900 px-2.5 py-0.5 text-[11px] font-bold text-white uppercase tracking-wider">
                <GraduationCap size={13} />
                CTĐT: {programCode || "Chính quy"}
              </span>
              {cohortNumber && (
                <span className="text-xs font-semibold text-slate-600">
                  • Khóa K{cohortNumber} {isOngoingStudent ? `(Năm ${studyYear})` : "(Năm cuối - Năm 5)"}
                </span>
              )}
            </div>
            <h2 className="text-lg font-extrabold text-slate-900 tracking-tight">
              {isOngoingStudent
                ? "Rà soát các yêu cầu CTĐT còn thiếu"
                : "Dự kiến kết quả xét tốt nghiệp"}
            </h2>
            <p className="text-xs text-slate-600">
              {isOngoingStudent
                ? "Phát hiện sớm các học phần bắt buộc và yêu cầu CTĐT còn thiếu từ các học kỳ trước để kịp thời tư vấn sinh viên."
                : "Kết quả đối chiếu dựa trên toàn bộ kết quả học phần và hồ sơ chứng chỉ đã nộp."}
            </p>
          </div>

          <div className="shrink-0">
            {isOngoingStudent ? (
              <div className={`inline-flex items-center gap-2 rounded-full border px-4 py-1.5 text-xs font-bold shadow-2xs ${
                overdueMandatoryCourses.length + failedCount === 0
                  ? "border-emerald-300 bg-emerald-100 text-emerald-900"
                  : "border-amber-300 bg-amber-100 text-amber-900"
              }`}>
                {overdueMandatoryCourses.length + failedCount === 0 ? (
                  <>
                    <CheckCircle2 size={15} className="text-emerald-700" />
                    <span>Không thiếu</span>
                  </>
                ) : (
                  <>
                    <AlertTriangle size={15} className="text-amber-700" />
                    <span>Có {overdueMandatoryCourses.length + failedCount} yêu cầu còn thiếu</span>
                  </>
                )}
              </div>
            ) : finalStatus === "EXPECTED_ELIGIBLE" ? (
              <div className="inline-flex items-center gap-2 rounded-full border border-emerald-300 bg-emerald-100 px-4 py-1.5 text-xs font-bold text-emerald-900 shadow-2xs">
                <CheckCircle2 size={15} className="text-emerald-700" />
                <span>Đủ yêu cầu tốt nghiệp</span>
              </div>
            ) : finalStatus === "PENDING_REQUIREMENT" ? (
              <div className="inline-flex items-center gap-2 rounded-full border border-sky-300 bg-sky-100 px-4 py-1.5 text-xs font-bold text-sky-900 shadow-2xs">
                <FileCheck2 size={15} className="text-sky-700" />
                <span>Chờ bổ sung chứng chỉ tốt nghiệp</span>
              </div>
            ) : finalStatus === "PENDING_GRADE" ? (
              <div className="inline-flex items-center gap-2 rounded-full border border-sky-300 bg-sky-100 px-4 py-1.5 text-xs font-bold text-sky-900 shadow-2xs">
                <Clock size={15} className="text-sky-700" />
                <span>Đang hoàn thiện (Chờ xác nhận đạt các môn đang học)</span>
              </div>
            ) : finalStatus === "MANUAL_REVIEW" ? (
              <div className="inline-flex items-center gap-2 rounded-full border border-slate-300 bg-slate-200 px-4 py-1.5 text-xs font-bold text-slate-800 shadow-2xs">
                <ShieldAlert size={15} className="text-slate-600" />
                <span>Cần đối soát chuyên môn</span>
              </div>
            ) : (
              <div className="inline-flex items-center gap-2 rounded-full border border-amber-300 bg-amber-100 px-4 py-1.5 text-xs font-bold text-amber-900 shadow-2xs">
                <XCircle size={15} className="text-amber-700" />
                <span>Còn thiếu yêu cầu tốt nghiệp</span>
              </div>
            )}
          </div>
        </div>

        {/* ============================================================ */}
        {/* 4 THẺ SỐ LIỆU TỔNG QUAN — PHÂN BIỆT RÕ NĂM 2-4 VS NĂM CUỐI */}
        {/* ============================================================ */}
        <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
          {isOngoingStudent ? (
            <>
              {/* 1. Tổng thiếu */}
              <div className="rounded-xl border border-white/80 bg-white/85 p-3 shadow-2xs">
                <p className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">
                  Tổng thiếu
                </p>
                <p className={`mt-1 font-mono text-2xl font-black ${
                  overdueMandatoryCourses.length + failedCount === 0 ? "text-emerald-700" : "text-amber-700"
                }`}>
                  {overdueMandatoryCourses.length + failedCount === 0 ? "0" : overdueMandatoryCourses.length + failedCount}
                  <span className="text-xs font-bold text-slate-400 font-sans ml-1">yêu cầu</span>
                </p>
                <p className="mt-1 text-[11px] text-slate-500 truncate">
                  {overdueMandatoryCourses.length + failedCount === 0 ? "✓ Không thiếu ở kỳ trước" : "Cần ưu tiên xử lý sớm"}
                </p>
              </div>

              {/* 2. Thiếu HP bắt buộc */}
              <div className="rounded-xl border border-white/80 bg-white/85 p-3 shadow-2xs">
                <p className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">
                  Thiếu HP bắt buộc
                </p>
                <p className={`mt-1 font-mono text-2xl font-black ${
                  overdueMandatoryCourses.length === 0 ? "text-emerald-700" : "text-amber-700"
                }`}>
                  {overdueMandatoryCourses.length}
                  <span className="text-xs font-bold text-slate-400 font-sans ml-1">môn</span>
                </p>
                <p className="mt-1 text-[11px] text-slate-500 truncate">
                  {overdueMandatoryCourses.length === 0 ? "✓ Đã xong các kỳ trước" : "Kỳ trước chưa hoàn thành"}
                </p>
              </div>

              {/* 3. Có HP chưa đạt */}
              <div className={`rounded-xl border p-3 shadow-2xs ${
                failedCount === 0 ? "border-emerald-200 bg-emerald-50/50" : "border-rose-200 bg-rose-50/60"
              }`}>
                <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">
                  Có HP chưa đạt
                </p>
                <p className={`mt-1 font-mono text-2xl font-black ${
                  failedCount === 0 ? "text-emerald-700" : "text-rose-700"
                }`}>
                  {failedCount}
                  <span className="text-xs font-bold text-slate-400 font-sans ml-1">môn</span>
                </p>
                <p className="mt-1 text-[11px] text-slate-500 truncate">
                  {failedCount === 0 ? "✓ Không nợ điểm F" : "Cần học lại trả nợ"}
                </p>
              </div>

              {/* 4. Đang học kỳ này */}
              <div className="rounded-xl border border-sky-200 bg-sky-50/50 p-3 shadow-2xs">
                <p className="text-[11px] font-semibold text-sky-800 uppercase tracking-wider">
                  Đang học kỳ này
                </p>
                <p className="mt-1 font-mono text-2xl font-black text-sky-700">
                  {forecast.noScoreCourses.length}
                  <span className="text-xs font-bold text-sky-600 font-sans ml-1">môn</span>
                </p>
                <p className="mt-1 text-[11px] text-sky-700 font-medium truncate">
                  Chờ điểm cuối kỳ
                </p>
              </div>
            </>
          ) : (
            <>
              {/* 1. Tín chỉ tích lũy (Năm cuối) */}
              <div className="rounded-xl border border-white/80 bg-white/85 p-3 shadow-2xs">
                <p className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">
                  Tín chỉ đã tích lũy
                </p>
                <p className="mt-1 font-mono text-2xl font-black text-slate-900">
                  {earnedCredits}{" "}
                  <span className="text-xs font-semibold text-slate-400">
                    {totalLimit ? `/ ${totalLimit} TC` : "tín chỉ"}
                  </span>
                </p>
                <p className="mt-1 text-[11px] text-slate-500">
                  {totalLimit
                    ? `Đạt ${Math.round((earnedCredits / totalLimit) * 100)}% kế hoạch đào tạo`
                    : "Từ các học phần đã đạt điểm"}
                </p>
              </div>

              {/* 2. Môn bắt buộc (Năm cuối) */}
              <div
                onClick={() => {
                  setActiveTab("courses");
                  setCourseFilter("all");
                }}
                className="rounded-xl border border-white/80 bg-white/85 p-3 shadow-2xs cursor-pointer transition hover:border-slate-300 hover:shadow-xs"
              >
                <p className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">
                  Học phần bắt buộc
                </p>
                <p className="mt-1 font-mono text-2xl font-black text-slate-900">
                  {requirements.requiredCourses.completed}{" "}
                  <span className="text-xs font-semibold text-slate-400">
                    / {requirements.requiredCourses.total} môn
                  </span>
                </p>
                <p className="mt-1 text-[11px] text-slate-500">
                  {missingMandatoryCount === 0 ? (
                    <span className="text-emerald-700 font-bold">✓ Đã xong 100% môn bắt buộc</span>
                  ) : (
                    <span>Còn {missingMandatoryCount} môn theo kế hoạch</span>
                  )}
                </p>
              </div>

              {/* 3. Môn nợ Điểm F (Năm cuối) */}
              <div
                onClick={() => {
                  if (failedCount > 0) {
                    setActiveTab("courses");
                    setCourseFilter("failed");
                  }
                }}
                className={`rounded-xl border p-3 shadow-2xs transition ${failedCount === 0
                    ? "border-emerald-200 bg-emerald-50/50"
                    : "border-rose-200 bg-rose-50/60 cursor-pointer hover:border-rose-300 hover:shadow-xs"
                  }`}
              >
                <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">
                  Học phần chưa đạt (Nợ môn)
                </p>
                <p
                  className={`mt-1 font-mono text-2xl font-black ${failedCount === 0 ? "text-emerald-700" : "text-rose-700"
                    }`}
                >
                  {failedCount === 0 ? "0 môn" : `${failedCount} môn`}
                </p>
                <p
                  className={`mt-1 text-[11px] font-medium ${failedCount === 0 ? "text-emerald-700" : "text-rose-700"
                    }`}
                >
                  {failedCount === 0 ? "✓ Không nợ môn nào" : "Cần đăng ký học lại sớm"}
                </p>
              </div>

              {/* 4. Điểm trung bình & Rèn luyện (Năm cuối) */}
              <div className="rounded-xl border border-white/80 bg-white/85 p-3 shadow-2xs">
                <p className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">
                  GPA & Điểm rèn luyện
                </p>
                <p className="mt-1 font-mono text-xl font-black text-slate-900">
                  {gpa != null ? gpa.toFixed(2) : "—"}
                  <span className="text-xs font-normal text-slate-500"> / 4.0</span>
                </p>
                <p className="mt-1 text-[11px] text-slate-600">
                  Rèn luyện:{" "}
                  <span className="font-bold text-slate-800">
                    {conduct != null ? `${conduct.toFixed(1)} đ` : "Chưa có"}
                  </span>
                </p>
              </div>
            </>
          )}
        </div>
      </div>

      {/* ============================================================ */}
      {/* 2. KHỐI LỜI KHUYÊN & VIỆC CẦN LÀM TIẾP THEO (ACTIONABLE ADVICE) */}
      {/* ============================================================ */}
      {friendlyActionItems.length > 0 && (
        <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-xs">
          <div className="flex items-center gap-2 text-slate-900 font-bold text-sm">
            <Sparkles size={16} className="text-amber-500" />
            <span>Kế hoạch & Lời khuyên cho Cố vấn học tập và Sinh viên:</span>
          </div>
          <div className="mt-3 space-y-2">
            {friendlyActionItems.map((item, idx) => (
              <div
                key={idx}
                className={`flex items-start gap-2.5 rounded-xl border p-3 text-xs ${item.type === "error"
                    ? "border-rose-200 bg-rose-50/60 text-rose-900 font-medium"
                    : item.type === "warning"
                      ? "border-amber-200 bg-amber-50/60 text-amber-900 font-medium"
                      : "border-sky-200 bg-sky-50/50 text-sky-950 font-normal"
                  }`}
              >
                {item.type === "error" ? (
                  <AlertCircle size={16} className="mt-0.5 shrink-0 text-rose-600" />
                ) : item.type === "warning" ? (
                  <AlertTriangle size={16} className="mt-0.5 shrink-0 text-amber-600" />
                ) : (
                  <Info size={16} className="mt-0.5 shrink-0 text-sky-600" />
                )}
                <div className="leading-relaxed">{item.text}</div>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* ============================================================ */}
      {/* DÀNH CHO SINH VIÊN NĂM 2-4: 3 KHỐI CÒN THIẾU, ĐANG HỌC, TƯƠNG LAI */}
      {/* ============================================================ */}
      {isOngoingStudent && (
        <div className="space-y-4">
          {/* KHỐI 1: CÁC YÊU CẦU CÒN THIẾU TỪ GIAI ĐOẠN TRƯỚC */}
          <section className="rounded-2xl border border-amber-200 bg-amber-50/20 p-4 shadow-xs space-y-3">
            <div className="flex items-center justify-between border-b border-amber-100 pb-2.5">
              <div className="flex items-center gap-2">
                <AlertTriangle size={18} className="text-amber-600 shrink-0" />
                <div>
                  <h4 className="font-bold text-slate-900 text-sm">
                    1. Các yêu cầu còn thiếu từ các giai đoạn/học kỳ trước
                  </h4>
                  <p className="text-xs text-slate-500 mt-0.5">
                    Chỉ tính các học phần thuộc học kỳ sinh viên đã đi qua theo kế hoạch nhưng chưa hoàn thành hoặc chưa đạt.
                  </p>
                </div>
              </div>
              <span className={`text-xs font-bold px-2.5 py-0.5 rounded-full ${
                overdueMandatoryCourses.length + failedCount === 0
                  ? "bg-emerald-100 text-emerald-800"
                  : "bg-amber-100 text-amber-800"
              }`}>
                {overdueMandatoryCourses.length + failedCount === 0 ? "✓ Không thiếu" : `${overdueMandatoryCourses.length + failedCount} yêu cầu còn thiếu`}
              </span>
            </div>

            {overdueMandatoryCourses.length === 0 && failedCount === 0 ? (
              <div className="py-6 text-center bg-white rounded-xl border border-emerald-200 p-4">
                <CheckCircle2 size={32} className="mx-auto text-emerald-600 mb-1.5" />
                <p className="font-bold text-emerald-800 text-sm">Sinh viên không thiếu yêu cầu nào!</p>
                <p className="text-xs text-slate-500 mt-1 max-w-md mx-auto">
                  Toàn bộ các học phần bắt buộc của các học kỳ trước đều đã hoàn thành và sinh viên không có học phần nào bị điểm F chưa trả nợ.
                </p>
              </div>
            ) : (
              <div className="space-y-3">
                {/* A. Thiếu HP bắt buộc */}
                {overdueMandatoryCourses.length > 0 && (
                  <div className="bg-white rounded-xl border border-amber-200 overflow-hidden shadow-2xs">
                    <div className="bg-amber-50 px-3 py-2 border-b border-amber-200 flex items-center justify-between">
                      <span className="font-bold text-amber-900 text-xs">
                        Học phần bắt buộc kỳ trước chưa hoàn thành ({overdueMandatoryCourses.length} môn)
                      </span>
                      <span className="text-[11px] text-amber-700 font-medium">Cần ưu tiên đăng ký học bù</span>
                    </div>
                    <div className="overflow-x-auto">
                      <table className="w-full text-left text-xs">
                        <thead className="bg-slate-50 text-slate-600 font-semibold border-b border-slate-100">
                          <tr>
                            <th className="p-2.5">Mã HP</th>
                            <th className="p-2.5">Tên học phần</th>
                            <th className="p-2.5 text-center">Số TC</th>
                            <th className="p-2.5">Kỳ học theo CTĐT</th>
                            <th className="p-2.5 text-right">Tình trạng</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                          {overdueMandatoryCourses.map((c) => (
                            <tr key={c.courseId} className="hover:bg-amber-50/30">
                              <td className="p-2.5 font-mono font-bold text-slate-900">{c.courseCode}</td>
                              <td className="p-2.5 font-medium text-slate-800">{c.courseName}</td>
                              <td className="p-2.5 text-center font-mono font-bold text-slate-700">{c.credits}</td>
                              <td className="p-2.5 text-slate-600">
                                {c.semesterNo ? `Học kỳ ${c.semesterNo} (Năm ${Math.ceil(c.semesterNo / 2)})` : "Kỳ trước"}
                              </td>
                              <td className="p-2.5 text-right">
                                <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2.5 py-0.5 text-[11px] font-bold text-amber-800">
                                  <AlertTriangle size={11} /> Chưa hoàn thành
                                </span>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}

                {/* B. HP Chưa đạt (F) */}
                {failedCount > 0 && (
                  <div className="bg-white rounded-xl border border-rose-200 overflow-hidden shadow-2xs">
                    <div className="bg-rose-50 px-3 py-2 border-b border-rose-200 flex items-center justify-between">
                      <span className="font-bold text-rose-900 text-xs">
                        Học phần đã học nhưng chưa đạt (Điểm F) ({failedCount} môn)
                      </span>
                      <span className="text-[11px] text-rose-700 font-medium">Cần đăng ký học lại trả nợ môn</span>
                    </div>
                    <div className="overflow-x-auto">
                      <table className="w-full text-left text-xs">
                        <thead className="bg-slate-50 text-slate-600 font-semibold border-b border-slate-100">
                          <tr>
                            <th className="p-2.5">Mã HP</th>
                            <th className="p-2.5">Tên học phần</th>
                            <th className="p-2.5 text-center">Số TC</th>
                            <th className="p-2.5">Loại yêu cầu</th>
                            <th className="p-2.5 text-center">Điểm chữ</th>
                            <th className="p-2.5 text-right">Tình trạng</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                          {forecast.failedCourses.map((c) => {
                            const grade = gradeByCourseCode.get(c.courseCode.toUpperCase());
                            const isElective = /tự chọn|elective/i.test(c.requirementType);
                            return (
                              <tr key={c.courseId} className="hover:bg-rose-50/20">
                                <td className="p-2.5 font-mono font-bold text-slate-900">{c.courseCode}</td>
                                <td className="p-2.5 font-medium text-slate-800">{c.courseName}</td>
                                <td className="p-2.5 text-center font-mono font-bold text-slate-700">{c.credits}</td>
                                <td className="p-2.5">
                                  <span className={`rounded px-1.5 py-0.5 text-[10px] font-bold ${
                                    isElective ? "bg-indigo-50 text-indigo-700" : "bg-slate-100 text-slate-700"
                                  }`}>
                                    {isElective ? "Tự chọn" : "Bắt buộc"}
                                  </span>
                                </td>
                                <td className="p-2.5 text-center font-mono font-bold text-rose-700">
                                  {grade?.letterGrade || "F"}
                                </td>
                                <td className="p-2.5 text-right">
                                  <span className="inline-flex items-center gap-1 rounded-full bg-rose-100 px-2.5 py-0.5 text-[11px] font-bold text-rose-800">
                                    <XCircle size={11} /> Chưa đạt (Cần học lại)
                                  </span>
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}
              </div>
            )}
          </section>

          {/* KHỐI 2: HỌC PHẦN ĐANG HỌC KỲ HIỆN TẠI (Chờ có điểm) */}
          <section className="rounded-2xl border border-sky-200 bg-sky-50/20 p-4 shadow-xs space-y-3">
            <div className="flex items-center justify-between border-b border-sky-100 pb-2.5">
              <div className="flex items-center gap-2">
                <Clock size={18} className="text-sky-600 shrink-0" />
                <div>
                  <h4 className="font-bold text-slate-900 text-sm">
                    2. Các học phần đang theo học kỳ hiện tại (Chờ có điểm)
                  </h4>
                  <p className="text-xs text-slate-500 mt-0.5">
                    Các học phần sinh viên đang học trong học kỳ hiện tại, chưa có điểm tổng kết — <strong>không coi là rớt hay thiếu</strong>.
                  </p>
                </div>
              </div>
              <span className="text-xs font-bold text-sky-800 bg-sky-100 px-2.5 py-0.5 rounded-full">
                {forecast.noScoreCourses.length} môn đang học
              </span>
            </div>

            {forecast.noScoreCourses.length === 0 ? (
              <p className="text-xs text-slate-500 italic py-2">Không có học phần nào đang chờ điểm trong học kỳ hiện tại.</p>
            ) : (
              <div className="bg-white rounded-xl border border-sky-200 overflow-hidden shadow-2xs">
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs">
                    <thead className="bg-slate-50 text-slate-600 font-semibold border-b border-slate-100">
                      <tr>
                        <th className="p-2.5">Mã HP</th>
                        <th className="p-2.5">Tên học phần</th>
                        <th className="p-2.5 text-center">Số TC</th>
                        <th className="p-2.5">Loại yêu cầu</th>
                        <th className="p-2.5 text-right">Tình trạng</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {forecast.noScoreCourses.map((c) => (
                        <tr key={c.courseId} className="hover:bg-slate-50">
                          <td className="p-2.5 font-mono font-bold text-slate-900">{c.courseCode}</td>
                          <td className="p-2.5 font-medium text-slate-800">{c.courseName}</td>
                          <td className="p-2.5 text-center font-mono font-bold text-slate-700">{c.credits}</td>
                          <td className="p-2.5 text-slate-600">{c.requirementType || "Bắt buộc"}</td>
                          <td className="p-2.5 text-right">
                            <span className="inline-flex items-center gap-1 rounded-full bg-sky-100 px-2.5 py-0.5 text-[11px] font-bold text-sky-800">
                              <Clock size={11} /> Đang học kỳ này
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </section>

          {/* KHỐI 3: LỘ TRÌNH CÁC KỲ TIẾP THEO (KẾ HOẠCH CTĐT) */}
          {futureMandatoryCourses.length > 0 && (
            <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-xs space-y-3">
              <div className="flex items-center justify-between border-b border-slate-100 pb-2">
                <div className="flex items-center gap-2">
                  <BookOpen size={18} className="text-slate-600 shrink-0" />
                  <div>
                    <h4 className="font-bold text-slate-900 text-sm">
                      3. Lộ trình học phần các kỳ tiếp theo theo kế hoạch CTĐT ({futureMandatoryCourses.length} môn)
                    </h4>
                    <p className="text-xs text-slate-500 mt-0.5">
                      Các học phần bắt buộc thuộc các học kỳ tương lai theo đúng tiến độ đào tạo, sinh viên sẽ học khi đến thời điểm.
                    </p>
                  </div>
                </div>
                <span className="text-xs text-slate-500 font-semibold bg-slate-100 px-2.5 py-0.5 rounded-full">
                  Kế hoạch tương lai
                </span>
              </div>
              <div className="flex flex-wrap gap-1.5 pt-1">
                {futureMandatoryCourses.map((c) => (
                  <span
                    key={c.courseId}
                    title={`${c.courseName} (${c.credits} TC) - Học kỳ ${c.semesterNo}`}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-1 text-xs text-slate-700"
                  >
                    <span className="font-mono font-bold text-slate-900">{c.courseCode}</span>
                    <span className="text-slate-400">•</span>
                    <span className="truncate max-w-[150px]">{c.courseName}</span>
                    <span className="text-[10px] text-slate-400 font-mono">({c.semesterNo ? `Kỳ ${c.semesterNo}` : "Kỳ sau"})</span>
                  </span>
                ))}
              </div>
            </section>
          )}
        </div>
      )}

      {/* ============================================================ */}
      {/* 3. TABS PHÂN TÁCH 2 TẦNG NGHIỆP VỤ */}
      {/* ============================================================ */}
      <div className="flex flex-wrap items-center gap-2 border-b border-slate-200 pb-2">
        <button
          type="button"
          onClick={() => setActiveTab("courses")}
          className={`flex items-center gap-1.5 rounded-xl px-4 py-2 text-xs font-bold transition cursor-pointer ${activeTab === "courses"
              ? "bg-slate-900 text-white shadow-xs"
              : "bg-slate-100 text-slate-600 hover:bg-slate-200"
            }`}
        >
          <BookOpen size={14} />
          <span>{isOngoingStudent ? `Toàn bộ khung CTĐT (${requirements.requiredCourses.total} môn bắt buộc)` : `Tầng 1: Môn học & Tín chỉ (${missingMandatoryCount} môn cần học)`}</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab("certs")}
          className={`flex items-center gap-1.5 rounded-xl px-4 py-2 text-xs font-bold transition cursor-pointer ${activeTab === "certs"
              ? "bg-slate-900 text-white shadow-xs"
              : "bg-slate-100 text-slate-600 hover:bg-slate-200"
            }`}
        >
          <Award size={14} />
          <span>{isOngoingStudent ? `Chứng chỉ & Chuẩn đầu ra (${layer2Rules.length} tiêu chí)` : `Tầng 2: Chứng chỉ & Chuẩn đầu ra tốt nghiệp (${layer2Rules.length} tiêu chí)`}</span>
        </button>
      </div>

      {/* ============================================================ */}
      {/* TAB 1: TIẾN ĐỘ HỌC PHẦN (TẦNG 1) */}
      {/* ============================================================ */}
      {activeTab === "courses" && (
        <div className="space-y-4">
          {/* 1A. MÔN CHƯA HOÀN THÀNH / MÔN RỚT */}
          <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-xs">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between border-b border-slate-100 pb-3">
              <div>
                <h4 className="font-bold text-slate-900 flex items-center gap-2">
                  <span>
                    {courseFilter === "failed"
                      ? "Danh sách học phần bắt buộc chưa đạt (Cần học lại)"
                      : "Học phần bắt buộc theo khung đào tạo"}
                  </span>
                  {courseFilter === "failed" ? (
                    <span className="rounded-full bg-rose-100 px-2 py-0.5 text-xs font-bold text-rose-800">
                      {failedMandatoryCount} môn chưa đạt
                    </span>
                  ) : (
                    <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-700">
                      {requirements.requiredCourses.completed} / {requirements.requiredCourses.total} môn đã đạt
                    </span>
                  )}
                </h4>
                <p className="mt-0.5 text-xs text-slate-500">
                  {courseFilter === "failed"
                    ? isOngoingStudent
                      ? "Các học phần bắt buộc bị điểm F sinh viên cần sớm đăng ký học lại trả nợ."
                      : "Các học phần bắt buộc bị điểm F sinh viên cần sớm đăng ký học lại để hoàn thành chuẩn tốt nghiệp."
                    : isOngoingStudent
                      ? "Khung các học phần bắt buộc trong chương trình đào tạo sinh viên cần hoàn thành theo tiến độ."
                      : "Sinh viên cần tích lũy đủ các học phần này để đủ điều kiện xét tốt nghiệp."}
                </p>
              </div>

              {/* Bộ lọc xem: chỉ hiện khi có học phần bắt buộc bị rớt */}
              {failedMandatoryCount > 0 && (
                <div className="flex items-center gap-1.5 text-xs">
                  <button
                    type="button"
                    onClick={() => setCourseFilter("all")}
                    className={`rounded-lg px-2.5 py-1 font-semibold transition cursor-pointer ${courseFilter === "all"
                        ? "bg-slate-200 text-slate-900"
                        : "text-slate-500 hover:text-slate-900"
                      }`}
                  >
                    Tất cả ({missingMandatoryCount})
                  </button>
                  <button
                    type="button"
                    onClick={() => setCourseFilter("failed")}
                    className={`rounded-lg px-2.5 py-1 font-semibold transition cursor-pointer ${courseFilter === "failed"
                        ? "bg-rose-100 text-rose-900 font-bold shadow-2xs"
                        : "text-rose-600 hover:text-rose-900"
                      }`}
                  >
                    Môn rớt ({failedMandatoryCount})
                  </button>
                </div>
              )}
            </div>

            {displayedCourses.length === 0 ? (
              courseFilter === "failed" ? (
                <div className="py-6 text-center">
                  <CheckCircle2 size={32} className="mx-auto text-emerald-600 mb-2" />
                  <p className="font-bold text-slate-900">Không có học phần bắt buộc nào bị điểm F!</p>
                  <p className="mt-1 text-xs text-slate-500">
                    Sinh viên không nợ học phần bắt buộc nào trong toàn khóa đào tạo.
                  </p>
                </div>
              ) : (
                <div className="py-6 text-center">
                  <CheckCircle2 size={32} className="mx-auto text-emerald-600 mb-2" />
                  <p className="font-bold text-slate-900">Hoàn thành xuất sắc 100% học phần bắt buộc!</p>
                  <p className="mt-1 text-xs text-slate-500">
                    Sinh viên đã hoàn thành tất cả các môn học bắt buộc trong chương trình đào tạo.
                  </p>
                </div>
              )
            ) : (
              <div className="mt-3 overflow-x-auto">
                <table className="w-full min-w-[600px] text-left text-xs">
                  <thead className="border-b border-slate-200 bg-slate-50/80 text-slate-600 font-semibold">
                    <tr>
                      <th className="p-2.5">Mã học phần</th>
                      <th className="p-2.5">Tên môn học</th>
                      <th className="p-2.5 text-center">Số TC</th>
                      <th className="p-2.5">Kỳ học theo lộ trình</th>
                      <th className="p-2.5 text-right">Tình trạng</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {displayedCourses.map((course) => {
                      const isFail = course.state === "failed";
                      const isNoScore = course.state === "no_score";
                      const grade = gradeByCourseCode.get(course.courseCode.toUpperCase());
                      const isElective = /tự chọn|elective/i.test(course.requirementType);

                      return (
                        <tr
                          key={course.courseId}
                          className={`hover:bg-slate-50/60 transition ${isFail ? "bg-rose-50/30" : ""
                            }`}
                        >
                          <td className="p-2.5 font-mono font-bold text-slate-900">
                            <div className="flex items-center gap-1.5">
                              <span>{course.courseCode}</span>
                              {isElective && (
                                <span className="rounded bg-indigo-50 px-1.5 py-0.5 text-[10px] font-semibold text-indigo-700">
                                  Tự chọn
                                </span>
                              )}
                            </div>
                          </td>
                          <td className="p-2.5 font-medium text-slate-800">
                            {course.courseName}
                          </td>
                          <td className="p-2.5 text-center font-mono font-bold text-slate-700">
                            {course.credits}
                          </td>
                          <td className="p-2.5 text-slate-500">
                            {isFail && grade?.academicYear && grade?.termCode ? (
                              <span className="text-slate-700 font-medium">
                                Đã học: {grade.academicYear} • {grade.termCode}
                              </span>
                            ) : course.schedule ? (
                              `${course.schedule.academicYear} • ${course.schedule.termCode}`
                            ) : course.semesterNo ? (
                              `Học kỳ ${course.semesterNo}`
                            ) : (
                              "Chưa phân kỳ"
                            )}
                          </td>
                          <td className="p-2.5 text-right">
                            {isFail ? (
                              <span className="inline-flex items-center gap-1 rounded-full bg-rose-100 px-2.5 py-0.5 text-[11px] font-bold text-rose-800">
                                <XCircle size={12} className="shrink-0 text-rose-700" />
                                <span>
                                  Chưa đạt{grade?.letterGrade ? ` (Điểm ${grade.letterGrade}${grade?.score10 != null ? `: ${grade.score10}` : ""})` : " (Cần học lại)"}
                                </span>
                              </span>
                            ) : isNoScore ? (
                              <span className="inline-flex items-center gap-1 rounded-full bg-sky-100 px-2.5 py-0.5 text-[11px] font-bold text-sky-800">
                                <Clock size={12} className="shrink-0 text-sky-700" />
                                <span>Đang học kỳ này</span>
                              </span>
                            ) : isOngoingStudent && course.semesterNo != null && expectedSemesterNo && course.semesterNo < expectedSemesterNo ? (
                              <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2.5 py-0.5 text-[11px] font-bold text-amber-800">
                                <AlertTriangle size={12} className="shrink-0 text-amber-700" />
                                <span>Còn thiếu (Kỳ {course.semesterNo})</span>
                              </span>
                            ) : (
                              <span className="inline-flex rounded-full bg-slate-100 px-2.5 py-0.5 text-[11px] font-medium text-slate-600">
                                {isOngoingStudent ? `Kế hoạch (Kỳ ${course.semesterNo || "sau"})` : "Chưa học"}
                              </span>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </section>

          {/* 1B. HỌC PHẦN TỰ CHỌN THEO CHƯƠNG TRÌNH ĐÀO TẠO */}
          <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-xs space-y-4">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between border-b border-slate-100 pb-3">
              <div>
                <h4 className="font-bold text-slate-900 flex items-center gap-2">
                  <span>Học phần tự chọn theo chương trình đào tạo</span>
                  {requirements.electives.requiredCredits ? (
                    <span className={`rounded-full px-2 py-0.5 text-xs font-bold ${(requirements.electives.remainingCredits === 0 || (requirements.electives.passedCredits >= requirements.electives.requiredCredits))
                        ? "bg-emerald-100 text-emerald-800"
                        : "bg-amber-100 text-amber-800"
                      }`}>
                      {requirements.electives.passedCredits} / {requirements.electives.requiredCredits} TC tích lũy
                    </span>
                  ) : (
                    <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-bold text-emerald-800">
                      Đã tích lũy: {requirements.electives.passedCredits || 0} TC
                    </span>
                  )}
                </h4>
                <p className="mt-0.5 text-xs text-slate-500">
                  {requirements.electives.requiredCredits
                    ? `Sinh viên cần tích lũy tối thiểu ${requirements.electives.requiredCredits} tín chỉ tự chọn để đủ điều kiện tốt nghiệp.`
                    : "Các học phần tự chọn sinh viên đã đăng ký, đã tích lũy và danh mục môn tự chọn theo khung chương trình đào tạo."}
                </p>
              </div>

              {/* Badges tình trạng hoàn thành */}
              <div className="flex items-center gap-1.5">
                {(requirements.electives.remainingCredits === 0 || (requirements.electives.requiredCredits && requirements.electives.passedCredits >= requirements.electives.requiredCredits)) ? (
                  <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-3 py-1 text-xs font-bold text-emerald-800">
                    <CheckCircle2 size={13} className="text-emerald-700" />
                    Đã tích lũy đủ tín chỉ tự chọn
                  </span>
                ) : requirements.electives.remainingCredits && requirements.electives.remainingCredits > 0 ? (
                  <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-3 py-1 text-xs font-bold text-amber-800">
                    <AlertTriangle size={13} className="text-amber-700" />
                    Còn thiếu {requirements.electives.remainingCredits} TC tự chọn
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-3 py-1 text-xs font-bold text-emerald-800">
                    <CheckCircle2 size={13} className="text-emerald-700" />
                    Đang tích lũy bình thường ({requirements.electives.passedCredits || 0} TC)
                  </span>
                )}
              </div>
            </div>

            {/* Thống kê nhanh tự chọn */}
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              <div className="rounded-xl border border-emerald-200 bg-emerald-50/40 p-3 text-center">
                <p className="text-[10px] font-bold uppercase text-emerald-700">Tín chỉ tự chọn đã đạt</p>
                <p className="font-mono text-xl font-extrabold text-emerald-800">
                  {requirements.electives.passedCredits || 0} <span className="text-xs font-normal">TC</span>
                </p>
                <p className="text-[11px] text-emerald-600 mt-0.5">
                  {passedElectives.length > 0 ? `${passedElectives.length} môn hoàn thành` : "Đã tích lũy theo bảng điểm"}
                </p>
              </div>

              <div className="rounded-xl border border-amber-200 bg-amber-50/40 p-3 text-center">
                <p className="text-[10px] font-bold uppercase text-amber-700">Môn tự chọn đang học / chờ điểm</p>
                <p className="font-mono text-xl font-extrabold text-amber-800">
                  {pendingElectives.length} <span className="text-xs font-normal">môn</span>
                </p>
                <p className="text-[11px] text-amber-600 mt-0.5">
                  {pendingElectives.reduce((sum, c) => sum + c.credits, 0)} TC đang chờ kết quả
                </p>
              </div>

              <div className={`rounded-xl border p-3 text-center ${failedElectives.length > 0 ? "border-rose-200 bg-rose-50/50" : "border-slate-200 bg-slate-50"
                }`}>
                <p className={`text-[10px] font-bold uppercase ${failedElectives.length > 0 ? "text-rose-700" : "text-slate-500"}`}>
                  Môn tự chọn chưa đạt (F)
                </p>
                <p className={`font-mono text-xl font-extrabold ${failedElectives.length > 0 ? "text-rose-800" : "text-slate-700"}`}>
                  {failedElectives.length} <span className="text-xs font-normal">môn</span>
                </p>
                <p className={`text-[11px] mt-0.5 ${failedElectives.length > 0 ? "text-rose-600" : "text-slate-500"}`}>
                  {failedElectives.length > 0 ? "Cần học lại hoặc đổi môn" : "Không có môn rớt"}
                </p>
              </div>

              <div className="rounded-xl border border-slate-200 bg-slate-50 p-3 text-center">
                <p className="text-[10px] font-bold uppercase text-slate-500">Tín chỉ tự chọn còn thiếu</p>
                <p className="font-mono text-xl font-extrabold text-slate-900">
                  {requirements.electives.remainingCredits != null ? requirements.electives.remainingCredits : 0}{" "}
                  <span className="text-xs font-normal">TC</span>
                </p>
                <p className="text-[11px] text-slate-500 mt-0.5">
                  {requirements.electives.remainingCredits === 0 || requirements.electives.remainingCredits === null
                    ? "✓ Đã đạt định mức"
                    : "Cần đăng ký thêm"}
                </p>
              </div>
            </div>

            {/* Nếu có nhóm tự chọn chuyên ngành cụ thể (choiceGroupCode) */}
            {forecast.electiveGroups && forecast.electiveGroups.length > 0 && (
              <div className="rounded-xl border border-slate-200 bg-slate-50/60 p-3.5">
                <h5 className="text-xs font-bold text-slate-800 uppercase tracking-wider mb-2">
                  Định mức theo nhóm chuyên ngành:
                </h5>
                <div className="grid gap-2.5 sm:grid-cols-2">
                  {forecast.electiveGroups.map((group) => {
                    const isPass = group.status === "PASS";
                    return (
                      <div
                        key={group.code}
                        className={`rounded-xl border p-3 text-xs ${isPass
                            ? "border-emerald-200 bg-emerald-50/50"
                            : "border-slate-200 bg-white"
                          }`}
                      >
                        <div className="flex items-center justify-between">
                          <span className="font-bold text-slate-900">{group.code}</span>
                          <span
                            className={`rounded-md px-2 py-0.5 text-[10px] font-bold ${isPass
                                ? "bg-emerald-100 text-emerald-800"
                                : "bg-slate-200 text-slate-700"
                              }`}
                          >
                            {isPass ? "✓ Đã đạt định mức" : "Đang tích lũy"}
                          </span>
                        </div>
                        <div className="mt-1.5 text-slate-600">
                          Đã tích lũy: <span className="font-bold text-slate-900">{group.passedCredits} TC</span>
                          {group.requiredCredits && (
                            <span> / {group.requiredCredits} TC yêu cầu</span>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Bộ lọc & Tìm kiếm môn tự chọn */}
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between pt-1">
              <div className="flex flex-wrap items-center gap-1.5 text-xs">
                <button
                  type="button"
                  onClick={() => setElectiveFilter("taken")}
                  className={`rounded-lg px-2.5 py-1 font-semibold transition cursor-pointer ${electiveFilter === "taken"
                      ? "bg-slate-900 text-white shadow-2xs"
                      : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                    }`}
                >
                  Đã & Đang học ({takenElectives.length})
                </button>
                {pendingElectives.length > 0 && (
                  <button
                    type="button"
                    onClick={() => setElectiveFilter("pending")}
                    className={`rounded-lg px-2.5 py-1 font-semibold transition cursor-pointer ${electiveFilter === "pending"
                        ? "bg-amber-500 text-white shadow-2xs"
                        : "bg-amber-100 text-amber-800 hover:bg-amber-200"
                      }`}
                  >
                    Đang học / Chờ điểm ({pendingElectives.length})
                  </button>
                )}
                {failedElectives.length > 0 && (
                  <button
                    type="button"
                    onClick={() => setElectiveFilter("failed")}
                    className={`rounded-lg px-2.5 py-1 font-semibold transition cursor-pointer ${electiveFilter === "failed"
                        ? "bg-rose-600 text-white shadow-2xs"
                        : "bg-rose-100 text-rose-800 hover:bg-rose-200"
                      }`}
                  >
                    Chưa đạt ({failedElectives.length})
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => setElectiveFilter("all")}
                  className={`rounded-lg px-2.5 py-1 font-semibold transition cursor-pointer ${electiveFilter === "all"
                      ? "bg-slate-900 text-white shadow-2xs"
                      : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                    }`}
                >
                  Tất cả trong CTĐT ({effectiveElectiveCourses.length})
                </button>
              </div>

              <div className="relative w-full sm:w-60">
                <Search size={13} className="pointer-events-none absolute left-2.5 top-2.5 text-slate-400" />
                <input
                  value={electiveSearch}
                  onChange={(e) => setElectiveSearch(e.target.value)}
                  placeholder="Tìm môn tự chọn..."
                  className="h-8 w-full rounded-lg border border-slate-200 bg-white pl-8 pr-2.5 text-xs outline-none focus:border-lime-500 focus:ring-1 focus:ring-lime-100"
                />
              </div>
            </div>

            {/* Bảng danh sách học phần tự chọn */}
            <div className="overflow-x-auto rounded-xl border border-slate-200">
              <table className="w-full min-w-[600px] text-left text-xs">
                <thead className="border-b border-slate-200 bg-slate-50 text-slate-600 font-semibold">
                  <tr>
                    <th className="p-2.5">Mã học phần</th>
                    <th className="p-2.5">Tên môn học</th>
                    <th className="p-2.5 text-center">Số TC</th>
                    <th className="p-2.5">Học kỳ / Đợt học</th>
                    <th className="p-2.5 text-center">Điểm chữ</th>
                    <th className="p-2.5 text-right">Tình trạng</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {displayedElectives.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="py-8 text-center text-slate-400">
                        Không tìm thấy học phần tự chọn nào phù hợp bộ lọc.
                      </td>
                    </tr>
                  ) : (
                    displayedElectives.map((course) => {
                      const isPassed = course.state === "passed";
                      const isFail = course.state === "failed";
                      const isNoScore = course.state === "no_score";
                      const grade = gradeByCourseCode.get(course.courseCode.toUpperCase());

                      return (
                        <tr
                          key={course.courseId}
                          className={`hover:bg-slate-50/60 transition ${isFail
                              ? "bg-rose-50/30"
                              : isNoScore
                                ? "bg-amber-50/30"
                                : ""
                            }`}
                        >
                          <td className="p-2.5 font-mono font-bold text-slate-900 whitespace-nowrap">
                            {course.courseCode}
                          </td>
                          <td className="p-2.5 font-medium text-slate-800">
                            {course.courseName}
                          </td>
                          <td className="p-2.5 text-center font-mono font-bold text-slate-700">
                            {course.credits}
                          </td>
                          <td className="p-2.5 text-slate-500 whitespace-nowrap">
                            {grade?.academicYear && grade?.termCode ? (
                              <span className="font-mono text-slate-700">
                                {grade.academicYear} • {grade.termCode}
                              </span>
                            ) : course.schedule ? (
                              <span className="font-mono text-slate-600">
                                {course.schedule.academicYear} • {course.schedule.termCode}
                              </span>
                            ) : course.semesterNo ? (
                              <span>Học kỳ {course.semesterNo}</span>
                            ) : (
                              <span className="text-slate-400">Tự chọn theo CTĐT</span>
                            )}
                          </td>
                          <td className="p-2.5 text-center font-mono font-extrabold">
                            {grade?.letterGrade ? (
                              <span
                                className={
                                  grade.letterGrade === "F"
                                    ? "text-rose-700"
                                    : grade.letterGrade.startsWith("A")
                                      ? "text-emerald-700"
                                      : "text-slate-800"
                                }
                              >
                                {grade.letterGrade}
                                {grade.score10 != null ? ` (${Number(grade.score10).toFixed(1)})` : ""}
                              </span>
                            ) : (
                              "—"
                            )}
                          </td>
                          <td className="p-2.5 text-right whitespace-nowrap">
                            {isPassed ? (
                              <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2.5 py-0.5 text-[11px] font-bold text-emerald-800">
                                <CheckCircle2 size={12} className="shrink-0 text-emerald-700" />
                                <span>Đã đạt</span>
                              </span>
                            ) : isNoScore ? (
                              <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2.5 py-0.5 text-[11px] font-bold text-amber-800">
                                <Clock size={12} className="shrink-0 text-amber-700" />
                                <span>Chưa có điểm</span>
                              </span>
                            ) : isFail ? (
                              <span className="inline-flex items-center gap-1 rounded-full bg-rose-100 px-2.5 py-0.5 text-[11px] font-bold text-rose-800">
                                <XCircle size={12} className="shrink-0 text-rose-700" />
                                <span>Chưa đạt (F)</span>
                              </span>
                            ) : (
                              <span className="inline-flex rounded-full bg-slate-100 px-2.5 py-0.5 text-[11px] font-bold text-slate-600">
                                Chưa học (CTĐT)
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
          </section>
        </div>
      )}

      {/* ============================================================ */}
      {/* TAB 2: CHỨNG CHỈ & CHUẨN ĐẦU RA (TẦNG 2 — QUY CHẾ TỐT NGHIỆP) */}
      {/* ============================================================ */}
      {activeTab === "certs" && (
        <section className="space-y-3">
          <div className="rounded-xl border border-indigo-100 bg-indigo-50/40 p-3 text-xs text-indigo-950 flex items-start gap-2">
            <Info size={15} className="mt-0.5 shrink-0 text-indigo-700" />
            <span>
              Đây là các tiêu chuẩn bắt buộc của Quy chế Đào tạo đại học. Sinh viên hoàn thành chương trình môn học nhưng thiếu các chứng chỉ này sẽ không được công nhận tốt nghiệp.
            </span>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            {layer2Rules.map((rule) => {
              const meta = STANDARD_CERTS[rule.ruleCode] || {
                name: rule.ruleName,
                icon: Award,
                desc: "Điều kiện xét tốt nghiệp theo quy chế",
                advice: "Thực hiện theo hướng dẫn của Văn phòng Khoa.",
              };
              const IconComp = meta.icon;
              const isPass = rule.result === "PASS";
              const isFail = rule.result === "FAIL";

              return (
                <div
                  key={rule.ruleCode}
                  className={`rounded-2xl border p-4 text-xs transition shadow-2xs ${isPass
                      ? "border-emerald-200 bg-emerald-50/25"
                      : isFail
                        ? "border-rose-200 bg-rose-50/30"
                        : "border-slate-200 bg-white"
                    }`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-center gap-2.5">
                      <div
                        className={`rounded-xl p-2 ${isPass
                            ? "bg-emerald-100 text-emerald-800"
                            : isFail
                              ? "bg-rose-100 text-rose-800"
                              : "bg-slate-100 text-slate-700"
                          }`}
                      >
                        <IconComp size={16} />
                      </div>
                      <div>
                        <h4 className="font-bold text-slate-900">{meta.name}</h4>
                        <p className="text-[11px] text-slate-500 mt-0.5">{meta.desc}</p>
                      </div>
                    </div>

                    <span
                      className={`inline-flex shrink-0 rounded-full px-2.5 py-0.5 text-[11px] font-bold ${isPass
                          ? "bg-emerald-100 text-emerald-800 border border-emerald-300"
                          : isFail
                            ? "bg-rose-100 text-rose-800 border border-rose-300"
                            : "bg-slate-100 text-slate-700 border border-slate-300"
                        }`}
                    >
                      {isPass ? "Đã đạt" : isFail ? "Chưa đạt" : "Chưa có dữ liệu"}
                    </span>
                  </div>

                  <div className="mt-3 pt-2.5 border-t border-slate-100 text-slate-600 flex items-start gap-1.5">
                    <span className="text-slate-400">↳</span>
                    <span className="leading-relaxed">
                      {isPass
                        ? "Đã xác minh đầy đủ trên hồ sơ sinh viên."
                        : meta.advice}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      )}

      {/* ============================================================ */}
      {/* KHU VỰC THU GỌN DÀNH CHO CÁN BỘ KỸ THUẬT / ĐỐI SOÁT (SPEC AUDIT) */}
      {/* ============================================================ */}
      <div className="pt-2 border-t border-slate-200">
        <button
          type="button"
          onClick={() => setShowTechnicalAudit(!showTechnicalAudit)}
          className="flex items-center justify-between w-full rounded-xl bg-slate-50 hover:bg-slate-100 px-3.5 py-2 text-xs font-semibold text-slate-600 transition cursor-pointer"
        >
          <span className="flex items-center gap-2">
            <Info size={14} className="text-slate-400" />
            <span>Thông tin kiểm tra quy chế & log kỹ thuật (Dành cho cán bộ quản trị)</span>
          </span>
          {showTechnicalAudit ? <ChevronUp size={15} /> : <ChevronDown size={15} />}
        </button>

        {showTechnicalAudit && (
          <div className="mt-3 rounded-xl border border-slate-200 bg-slate-50/80 p-4 text-xs text-slate-700 space-y-2">
            <p className="font-bold text-slate-800">Các mã quy tắc hệ thống đã đối chiếu:</p>
            <ul className="list-disc pl-5 space-y-1 font-mono text-[11px]">
              {reasons
                .filter((r) => !EXCLUDED_RULE_CODES.has(r.code))
                .map((r, i) => (
                  <li key={i}>
                    <span className="font-bold text-slate-900">[{r.code}]</span>: {r.message}
                  </li>
                ))}
            </ul>
            {forecast.warnings.length > 0 && (
              <div className="mt-2 pt-2 border-t border-slate-200">
                <p className="font-bold text-amber-900">Cảnh báo dữ liệu CTĐT:</p>
                <ul className="list-disc pl-5 space-y-1 text-amber-900">
                  {forecast.warnings.map((w, i) => (
                    <li key={i}>{w}</li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
