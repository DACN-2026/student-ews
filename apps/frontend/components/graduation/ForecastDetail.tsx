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
}: {
  forecast: Forecast;
  programCode?: string | null;
  finalStatus?: string;
  reasons?: { code: string; result: string; message: string }[];
  additionalRequirements?: AdditionalRequirement[];
  student?: StudentInfo | null;
}) {
  const [activeTab, setActiveTab] = useState<"courses" | "certs">("courses");
  const [showTechnicalAudit, setShowTechnicalAudit] = useState(false);
  const [courseFilter, setCourseFilter] = useState<"all" | "missing" | "failed">("all");

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

    const missingCerts: string[] = [];
    for (const rule of layer2Rules) {
      if (rule.result === "NOT_AVAILABLE" || rule.result === "FAIL") {
        if (rule.ruleCode === "FOREIGN_LANGUAGE") missingCerts.push("Chuẩn Ngoại ngữ B1");
        if (rule.ruleCode === "PHYSICAL_EDUCATION") missingCerts.push("Chứng chỉ GD Thể chất");
        if (rule.ruleCode === "NATIONAL_DEFENSE") missingCerts.push("Chứng chỉ GD Quốc phòng");
      }
    }
    if (missingCerts.length > 0) {
      items.push({
        text: isOngoingStudent
          ? `Hồ sơ chứng chỉ cuối khóa (${missingCerts.join(", ")}): Cần nộp cho Văn phòng Khoa trước khi bước vào đợt xét tốt nghiệp.`
          : `Chưa có dữ liệu xác nhận cho: ${missingCerts.join(", ")}. Vui lòng liên hệ Văn phòng Khoa để đối soát / nộp bổ sung.`,
        type: isOngoingStudent ? "info" : "warning",
      });
    }

    return items;
  }, [failedCount, missingMandatoryCount, isOngoingStudent, requirements, layer2Rules, forecast.failedCourses]);

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
          <div className="rounded-xl border border-white/80 bg-white/85 p-3 shadow-2xs">
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
            className={`rounded-xl border p-3 shadow-2xs ${
              failedCount === 0
                ? "border-emerald-200 bg-emerald-50/50"
                : "border-rose-200 bg-rose-50/60"
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
          {/* 1A. MÔN CHƯA HOÀN THÀNH */}
          <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-xs">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between border-b border-slate-100 pb-3">
              <div>
                <h4 className="font-bold text-slate-900 flex items-center gap-2">
                  <span>Học phần bắt buộc theo khung đào tạo</span>
                  <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-700">
                    {requirements.requiredCourses.completed} / {requirements.requiredCourses.total} môn đã đạt
                  </span>
                </h4>
                <p className="mt-0.5 text-xs text-slate-500">
                  Sinh viên cần tích lũy đủ các học phần này để đủ điều kiện xét tốt nghiệp.
                </p>
              </div>

              {/* Bộ lọc xem */}
              {missingMandatoryCount > 0 && (
                <div className="flex items-center gap-1.5 text-xs">
                  <button
                    type="button"
                    onClick={() => setCourseFilter("all")}
                    className={`rounded-lg px-2.5 py-1 font-semibold transition ${
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
                      className={`rounded-lg px-2.5 py-1 font-semibold transition ${
                        courseFilter === "failed"
                          ? "bg-rose-100 text-rose-900"
                          : "text-rose-600 hover:text-rose-900"
                      }`}
                    >
                      Môn rớt ({failedCount})
                    </button>
                  )}
                </div>
              )}
            </div>

            {missingMandatoryCount === 0 ? (
              <div className="py-6 text-center">
                <CheckCircle2 size={32} className="mx-auto text-emerald-600 mb-2" />
                <p className="font-bold text-slate-900">Hoàn thành xuất sắc 100% học phần bắt buộc!</p>
                <p className="mt-1 text-xs text-slate-500">
                  Sinh viên đã hoàn thành tất cả các môn học bắt buộc trong chương trình đào tạo.
                </p>
              </div>
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
                    {forecast.missingRequiredCourses
                      .filter((course) => {
                        if (courseFilter === "failed") return course.state === "failed";
                        return true;
                      })
                      .map((course) => {
                        const isFail = course.state === "failed";
                        const isNoScore = course.state === "no_score";

                        return (
                          <tr
                            key={course.courseId}
                            className={`hover:bg-slate-50/60 transition ${
                              isFail ? "bg-rose-50/30" : ""
                            }`}
                          >
                            <td className="p-2.5 font-mono font-bold text-slate-900">
                              {course.courseCode}
                            </td>
                            <td className="p-2.5 font-medium text-slate-800">
                              {course.courseName}
                            </td>
                            <td className="p-2.5 text-center font-mono font-bold text-slate-700">
                              {course.credits}
                            </td>
                            <td className="p-2.5 text-slate-500">
                              {course.schedule
                                ? `${course.schedule.academicYear} • ${course.schedule.termCode}`
                                : course.semesterNo
                                  ? `Học kỳ ${course.semesterNo}`
                                  : "Chưa phân kỳ"}
                            </td>
                            <td className="p-2.5 text-right">
                              {isFail ? (
                                <span className="inline-flex rounded-full bg-rose-100 px-2.5 py-0.5 text-[11px] font-bold text-rose-800">
                                  Chưa đạt (Cần học lại)
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

          {/* 1B. CÁC NHÓM TỰ CHỌN */}
          {forecast.electiveGroups.length > 0 && (
            <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-xs">
              <h4 className="font-bold text-slate-900">Tiến độ nhóm học phần tự chọn</h4>
              <p className="mt-0.5 text-xs text-slate-500">
                Sinh viên cần tích lũy đủ số tín chỉ tối thiểu của từng nhóm tự chọn chuyên ngành.
              </p>
              <div className="mt-3 grid gap-3 sm:grid-cols-2">
                {forecast.electiveGroups.map((group) => {
                  const isPass = group.status === "PASS";
                  return (
                    <div
                      key={group.code}
                      className={`rounded-xl border p-3.5 text-xs ${
                        isPass
                          ? "border-emerald-200 bg-emerald-50/20"
                          : "border-slate-200 bg-slate-50/50"
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
                      <div className="mt-2 text-slate-600">
                        Đã tích lũy:{" "}
                        <span className="font-bold text-slate-900">{group.passedCredits} TC</span>
                        {group.requiredCredits && (
                          <span> / {group.requiredCredits} TC yêu cầu</span>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </section>
          )}
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
