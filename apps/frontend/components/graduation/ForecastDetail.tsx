"use client";

import { useMemo, useState } from "react";
import {
  AlertCircle,
  AlertTriangle,
  Award,
  BookOpen,
  Calendar,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Clock,
  FileCheck2,
  FileText,
  GraduationCap,
  HelpCircle,
  Info,
  Layers,
  Scale,
  Shield,
  ShieldAlert,
  ShieldCheck,
  Sparkles,
  Search,
  Check,
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

type Forecast = {
  curriculumComplete?: boolean | null;
  summary: {
    requiredCredits: number | null;
    completedCredits: number | null;
    remainingCredits: number | null;
    completionPercent: number | null;
  };
  requirements: {
    requiredCourses: { total: number; completed: number; remaining: number; requiredCredits: number; completedCredits: number };
    electives: { requiredCredits: number | null; passedCredits: number; completedCredits: number | null; remainingCredits: number | null; excessCredits: number | null };
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
  FOREIGN_LANGUAGE: {
    name: "Chuẩn đầu ra Ngoại ngữ",
    icon: Award,
    desc: "Yêu cầu đạt chứng chỉ ngoại ngữ theo quy định (B1 hoặc tương đương)",
    advice: "Sinh viên nộp chứng chỉ cho Văn phòng Khoa trước kỳ xét tốt nghiệp cuối khóa.",
  },
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
  DISCIPLINE: {
    name: "Tình trạng kỷ luật",
    icon: ShieldCheck,
    desc: "Không trong thời gian bị kỷ luật từ mức đình chỉ học tập trở lên",
    advice: "Hồ sơ kỷ luật bình thường trong suốt khóa học.",
  },
  LEGAL: {
    name: "Trách nhiệm pháp lý",
    icon: Scale,
    desc: "Không bị truy cứu trách nhiệm hình sự tại thời điểm xét tốt nghiệp",
    advice: "Hồ sơ pháp lý công dân đầy đủ, rõ ràng.",
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
  grades?: any[];
}) {
  const [activeTab, setActiveTab] = useState<"courses" | "certs">("courses");
  const [showTechnicalAudit, setShowTechnicalAudit] = useState(false);

  const { summary, requirements } = forecast;

  // Cohort & study year calculation
  const cohortMatch = student?.sClassName?.match(/K(\d{2})/i) || student?.cohortCode?.match(/K(\d{2})/i);
  const cohortNumber = cohortMatch ? Number(cohortMatch[1]) : null;
  // Year estimation: K48 = 2024 (Year 2 in 2026), K47 = 2023 (Year 3), K46 = 2022 (Year 4/Final)
  const isOngoingStudent = cohortNumber ? cohortNumber >= 47 : false;

  // Real earned credits calculation
  const earnedCredits =
    typeof summary.completedCredits === "number"
      ? summary.completedCredits
      : (requirements.requiredCourses.completedCredits || 0) + (requirements.electives.passedCredits || 0);

  const totalLimit = summary.requiredCredits;
  const missingMandatoryCount = requirements.requiredCourses.remaining;
  const failedCount = forecast.failedCourses.length;
  const gpa = student?.cumulativeGpa4;
  const conduct = student?.wholeCourseTrainingScore;

  const [courseFilter, setCourseFilter] = useState<"all" | "missing" | "failed">(() => {
    return missingMandatoryCount === 0 && failedCount > 0 ? "failed" : "all";
  });

  const gradeByCourseCode = useMemo(() => {
    const map = new Map<string, any>();
    for (const g of grades || []) {
      const code = String(g.courseCode || g.sCurriculumId || "").toUpperCase();
      if (code) map.set(code, g);
    }
    return map;
  }, [grades]);

  const displayedCourses = useMemo(() => {
    if (courseFilter === "failed") {
      return forecast.failedCourses;
    }
    return forecast.missingRequiredCourses;
  }, [courseFilter, forecast.failedCourses, forecast.missingRequiredCourses]);

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
  }, [electiveFilter, takenElectives, pendingElectives, passedElectives, failedElectives, effectiveElectiveCourses, electiveSearch]);

  // Layer 2 rules mapping
  const layer2Rules = useMemo(() => {
    return additionalRequirements.filter(
      (rule) =>
        !["CURRICULUM", "DATA", "CREDIT"].includes(rule.category) &&
        rule.ruleCode !== "PROGRAM_COMPLETION" &&
        rule.ruleCode !== "PROGRAM_MAPPING"
    );
  }, [additionalRequirements]);

  // Clean friendly reasons without [BRACKETED_CODES]
  const friendlyActionItems = useMemo(() => {
    const items: { text: string; type: "error" | "warning" | "info" }[] = [];

    if (failedCount > 0) {
      items.push({
        text: `Có ${failedCount} học phần bị điểm F cần đăng ký học lại sớm: ${forecast.failedCourses.map((c) => c.courseName).join(", ")}.`,
        type: "error",
      });
    }

    if (missingMandatoryCount > 0) {
      if (isOngoingStudent) {
        items.push({
          text: `Còn ${missingMandatoryCount} học phần bắt buộc thuộc các học kỳ tiếp theo cần hoàn thành theo đúng lộ trình CTĐT.`,
          type: "info",
        });
      } else {
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
  }, [failedCount, missingMandatoryCount, isOngoingStudent, requirements, forecast.failedCourses]);

  return (
    <div className="space-y-5 text-sm text-slate-800">
      {/* ============================================================ */}
      {/* 1. HERO BANNER TRẠNG THÁI TỔNG QUAN — THÂN THIỆN, DỄ HIỂU */}
      {/* ============================================================ */}
      <div
        className={`rounded-2xl border p-5 transition-all shadow-xs ${
          isOngoingStudent
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
                  • Khóa K{cohortNumber} {isOngoingStudent ? `(Năm ${Math.max(1, 2026 - (2000 + cohortNumber - 24))})` : "(Năm cuối)"}
                </span>
              )}
            </div>
            <h2 className="text-lg font-extrabold text-slate-900 tracking-tight">
              {isOngoingStudent
                ? "Tiến độ học tập theo chương trình đào tạo"
                : "Dự kiến kết quả xét tốt nghiệp"}
            </h2>
            <p className="text-xs text-slate-600">
              {isOngoingStudent
                ? "Sinh viên đang theo học theo tiến độ bình thường. Dưới đây là các môn đã đạt và lộ trình học tập tiếp theo."
                : "Kết quả đối chiếu dựa trên toàn bộ kết quả học phần và hồ sơ chứng chỉ đã nộp."}
            </p>
          </div>

          <div className="shrink-0">
            {isOngoingStudent ? (
              <div className="inline-flex items-center gap-2 rounded-full border border-sky-300 bg-sky-100/90 px-4 py-1.5 text-xs font-bold text-sky-900 shadow-2xs">
                <Clock size={15} className="text-sky-700" />
                <span>Đang trong tiến trình học tập</span>
              </div>
            ) : finalStatus === "EXPECTED_ELIGIBLE" ? (
              <div className="inline-flex items-center gap-2 rounded-full border border-emerald-300 bg-emerald-100 px-4 py-1.5 text-xs font-bold text-emerald-900 shadow-2xs">
                <CheckCircle2 size={15} className="text-emerald-700" />
                <span>Dự kiến đủ điều kiện tốt nghiệp</span>
              </div>
            ) : finalStatus === "PENDING_REQUIREMENT" ? (
              <div className="inline-flex items-center gap-2 rounded-full border border-sky-300 bg-sky-100 px-4 py-1.5 text-xs font-bold text-sky-900 shadow-2xs">
                <FileCheck2 size={15} className="text-sky-700" />
                <span>Chờ bổ sung chứng chỉ cuối khóa</span>
              </div>
            ) : finalStatus === "PENDING_GRADE" ? (
              <div className="inline-flex items-center gap-2 rounded-full border border-amber-300 bg-amber-100 px-4 py-1.5 text-xs font-bold text-amber-900 shadow-2xs">
                <Clock size={15} className="text-amber-700" />
                <span>Đang chờ điểm học phần</span>
              </div>
            ) : finalStatus === "MANUAL_REVIEW" ? (
              <div className="inline-flex items-center gap-2 rounded-full border border-slate-300 bg-slate-200 px-4 py-1.5 text-xs font-bold text-slate-800 shadow-2xs">
                <ShieldAlert size={15} className="text-slate-600" />
                <span>Cần đối soát chuyên môn</span>
              </div>
            ) : (
              <div className="inline-flex items-center gap-2 rounded-full border border-rose-300 bg-rose-100 px-4 py-1.5 text-xs font-bold text-rose-900 shadow-2xs">
                <XCircle size={15} className="text-rose-700" />
                <span>Chưa đủ điều kiện tốt nghiệp</span>
              </div>
            )}
          </div>
        </div>

        {/* ============================================================ */}
        {/* 4 THẺ SỐ LIỆU TỔNG QUAN — KHÔNG HIỂN THỊ "CHƯA XÁC ĐỊNH" RỐI MẮT */}
        {/* ============================================================ */}
        <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
          {/* 1. Tín chỉ tích lũy */}
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

          {/* 2. Môn bắt buộc */}
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

          {/* 3. Môn nợ (Điểm F) */}
          <div
            onClick={() => {
              if (failedCount > 0) {
                setActiveTab("courses");
                setCourseFilter("failed");
              }
            }}
            className={`rounded-xl border p-3 shadow-2xs transition ${
              failedCount === 0
                ? "border-emerald-200 bg-emerald-50/50"
                : "border-rose-200 bg-rose-50/60 cursor-pointer hover:border-rose-300 hover:shadow-xs"
            }`}
          >
            <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">
              Học phần chưa đạt (Nợ môn)
            </p>
            <p
              className={`mt-1 font-mono text-2xl font-black ${
                failedCount === 0 ? "text-emerald-700" : "text-rose-700"
              }`}
            >
              {failedCount === 0 ? "0 môn" : `${failedCount} môn`}
            </p>
            <p
              className={`mt-1 text-[11px] font-medium ${
                failedCount === 0 ? "text-emerald-700" : "text-rose-700"
              }`}
            >
              {failedCount === 0 ? "✓ Không nợ môn nào" : "Cần đăng ký học lại sớm"}
            </p>
          </div>

          {/* 4. Điểm trung bình & Rèn luyện */}
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
                className={`flex items-start gap-2.5 rounded-xl border p-3 text-xs ${
                  item.type === "error"
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
      {/* 3. TABS PHÂN TÁCH 2 TẦNG NGHIỆP VỤ */}
      {/* ============================================================ */}
      <div className="flex flex-wrap items-center gap-2 border-b border-slate-200 pb-2">
        <button
          type="button"
          onClick={() => setActiveTab("courses")}
          className={`flex items-center gap-1.5 rounded-xl px-4 py-2 text-xs font-bold transition cursor-pointer ${
            activeTab === "courses"
              ? "bg-slate-900 text-white shadow-xs"
              : "bg-slate-100 text-slate-600 hover:bg-slate-200"
          }`}
        >
          <BookOpen size={14} />
          <span>Tầng 1: Môn học & Tín chỉ ({missingMandatoryCount} môn cần học)</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab("certs")}
          className={`flex items-center gap-1.5 rounded-xl px-4 py-2 text-xs font-bold transition cursor-pointer ${
            activeTab === "certs"
              ? "bg-slate-900 text-white shadow-xs"
              : "bg-slate-100 text-slate-600 hover:bg-slate-200"
          }`}
        >
          <Award size={14} />
          <span>Tầng 2: Chứng chỉ & Chuẩn đầu ra tốt nghiệp ({layer2Rules.length} tiêu chí)</span>
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
                      ? "Danh sách học phần chưa đạt (Môn rớt - Cần học lại)"
                      : "Học phần bắt buộc theo khung đào tạo"}
                  </span>
                  {courseFilter === "failed" ? (
                    <span className="rounded-full bg-rose-100 px-2 py-0.5 text-xs font-bold text-rose-800">
                      {failedCount} môn chưa đạt
                    </span>
                  ) : (
                    <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-700">
                      {requirements.requiredCourses.completed} / {requirements.requiredCourses.total} môn đã đạt
                    </span>
                  )}
                </h4>
                <p className="mt-0.5 text-xs text-slate-500">
                  {courseFilter === "failed"
                    ? "Các học phần bị điểm F sinh viên cần sớm đăng ký học lại để cải thiện điểm và tích lũy tín chỉ."
                    : "Sinh viên cần tích lũy đủ các học phần này để đủ điều kiện xét tốt nghiệp."}
                </p>
              </div>

              {/* Bộ lọc xem */}
              {(missingMandatoryCount > 0 || failedCount > 0) && (
                <div className="flex items-center gap-1.5 text-xs">
                  <button
                    type="button"
                    onClick={() => setCourseFilter("all")}
                    className={`rounded-lg px-2.5 py-1 font-semibold transition cursor-pointer ${
                      courseFilter === "all"
                        ? "bg-slate-200 text-slate-900"
                        : "text-slate-500 hover:text-slate-900"
                    }`}
                  >
                    Tất cả ({missingMandatoryCount})
                  </button>
                  {failedCount > 0 && (
                    <button
                      type="button"
                      onClick={() => setCourseFilter("failed")}
                      className={`rounded-lg px-2.5 py-1 font-semibold transition cursor-pointer ${
                        courseFilter === "failed"
                          ? "bg-rose-100 text-rose-900 font-bold shadow-2xs"
                          : "text-rose-600 hover:text-rose-900"
                      }`}
                    >
                      Môn rớt ({failedCount})
                    </button>
                  )}
                </div>
              )}
            </div>

            {displayedCourses.length === 0 ? (
              courseFilter === "failed" ? (
                <div className="py-6 text-center">
                  <CheckCircle2 size={32} className="mx-auto text-emerald-600 mb-2" />
                  <p className="font-bold text-slate-900">Không có học phần nào bị điểm F!</p>
                  <p className="mt-1 text-xs text-slate-500">
                    Sinh viên không nợ môn học nào trong toàn khóa đào tạo.
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
                          className={`hover:bg-slate-50/60 transition ${
                            isFail ? "bg-rose-50/30" : ""
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
                              <span className="inline-flex rounded-full bg-amber-100 px-2.5 py-0.5 text-[11px] font-bold text-amber-800">
                                Chưa có điểm
                              </span>
                            ) : (
                              <span className="inline-flex rounded-full bg-slate-100 px-2.5 py-0.5 text-[11px] font-bold text-slate-700">
                                Chưa học (Kỳ sau)
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
                    <span className={`rounded-full px-2 py-0.5 text-xs font-bold ${
                      (requirements.electives.remainingCredits === 0 || (requirements.electives.passedCredits >= requirements.electives.requiredCredits))
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

              <div className={`rounded-xl border p-3 text-center ${
                failedElectives.length > 0 ? "border-rose-200 bg-rose-50/50" : "border-slate-200 bg-slate-50"
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
                        className={`rounded-xl border p-3 text-xs ${
                          isPass
                            ? "border-emerald-200 bg-emerald-50/50"
                            : "border-slate-200 bg-white"
                        }`}
                      >
                        <div className="flex items-center justify-between">
                          <span className="font-bold text-slate-900">{group.code}</span>
                          <span
                            className={`rounded-md px-2 py-0.5 text-[10px] font-bold ${
                              isPass
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
                  className={`rounded-lg px-2.5 py-1 font-semibold transition cursor-pointer ${
                    electiveFilter === "taken"
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
                    className={`rounded-lg px-2.5 py-1 font-semibold transition cursor-pointer ${
                      electiveFilter === "pending"
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
                    className={`rounded-lg px-2.5 py-1 font-semibold transition cursor-pointer ${
                      electiveFilter === "failed"
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
                  className={`rounded-lg px-2.5 py-1 font-semibold transition cursor-pointer ${
                    electiveFilter === "all"
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
                          className={`hover:bg-slate-50/60 transition ${
                            isFail
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
                  className={`rounded-2xl border p-4 text-xs transition shadow-2xs ${
                    isPass
                      ? "border-emerald-200 bg-emerald-50/25"
                      : isFail
                        ? "border-rose-200 bg-rose-50/30"
                        : "border-slate-200 bg-white"
                  }`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-center gap-2.5">
                      <div
                        className={`rounded-xl p-2 ${
                          isPass
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
                      className={`inline-flex shrink-0 rounded-full px-2.5 py-0.5 text-[11px] font-bold ${
                        isPass
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
              {reasons.map((r, i) => (
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
