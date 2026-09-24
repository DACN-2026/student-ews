"use client";

import { useMemo, useState } from "react";
import {
  AlertTriangle,
  Award,
  BookOpen,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Clock,
  GraduationCap,
  Info,
  Search,
  Shield,
  Sparkles,
  TrendingUp,
  XCircle,
} from "lucide-react";

export type Course = {
  courseId: string;
  courseCode: string;
  courseName: string;
  credits: number;
  requirementType: string;
  state: "passed" | "failed" | "no_score" | "not_completed";
  semesterNo: number | null;
  schedule: { academicYear: string; termCode: string } | null;
};

export type StudentGrade = {
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

export type Forecast = {
  curriculumComplete?: boolean | null;
  summary: {
    requiredCredits: number | null;
    completedCredits: number | null;
    remainingCredits: number | null;
    pendingCredits: number | null;
    completionPercent: number | null;
  };
  requirements: {
    requiredCourses: {
      total: number;
      completed: number;
      remaining: number;
      pending?: number;
      requiredCredits: number;
      completedCredits: number;
      pendingCredits?: number;
    };
    electives: {
      requiredCredits: number | null;
      passedCredits: number;
      completedCredits: number | null;
      remainingCredits: number | null;
      pendingCredits?: number;
      excessCredits: number | null;
    };
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

export type AdditionalRequirement = {
  ruleCode: string;
  ruleName: string;
  category: string;
  result: string;
  requiredValue?: string | null;
  actualValue?: string | null;
  reason?: string | null;
};

export type StudentInfo = {
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
    desc: "Hoàn thành các học phần giáo dục thể chất theo CTĐT",
    advice: "Cần tích lũy đủ các học phần thể chất theo chương trình đào tạo.",
  },
  NATIONAL_DEFENSE: {
    name: "Chứng chỉ GDQP & An ninh",
    icon: Shield,
    desc: "Có chứng chỉ Giáo dục quốc phòng và an ninh",
    advice: "Nộp bản sao chứng chỉ GDQP cho Phòng Đào tạo khi hoàn thành khóa huấn luyện.",
  },
  WHOLE_COURSE_TRAINING: {
    name: "Điểm rèn luyện toàn khóa",
    icon: Sparkles,
    desc: "Kết quả rèn luyện từng kỳ (yêu cầu từ 50 điểm trở lên)",
    advice: "Điểm rèn luyện được cập nhật định kỳ sau mỗi học kỳ chính.",
  },
  CUMULATIVE_GPA: {
    name: "Điểm trung bình tích lũy (GPA)",
    icon: TrendingUp,
    desc: "Điểm trung bình tích lũy toàn khóa đạt tối thiểu từ 2.00 / 4.00",
    advice: "Cần duy trì điểm trung bình tích lũy để đủ điều kiện xếp loại tốt nghiệp.",
  },
};

type ActionItem = {
  id: string;
  courseCode: string;
  courseName: string;
  credits: number;
  requirementType: "Bắt buộc" | "Tự chọn" | "Quy chế";
  letterGrade?: string | null;
  score10?: number | string | null;
  statusLabel: string;
  statusType: "fail" | "overdue" | "cert";
  termInfo?: string;
  advice: string;
};

export default function ForecastDetail({
  forecast,
  programCode,
  finalStatus,
  reasons = [],
  additionalRequirements = [],
  student,
  grades = [],
  initialTab,
  onClose,
}: {
  forecast: Forecast;
  programCode?: string | null;
  finalStatus?: string;
  reasons?: { code: string; result: string; message: string }[];
  additionalRequirements?: AdditionalRequirement[];
  student?: StudentInfo | null;
  grades?: StudentGrade[];
  initialTab?: "action" | "enrolled" | "plan" | "curriculum" | "transcript" | "summary";
  onClose?: () => void;
}) {
  const { summary, requirements } = forecast;

  // Cohort & study year calculation
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

  // Grade mapping
  const gradeByCourseCode = useMemo(() => {
    const map = new Map<string, StudentGrade>();
    for (const g of grades || []) {
      const code = String(g.courseCode || g.sCurriculumId || "").toUpperCase();
      if (code) map.set(code, g);
    }
    return map;
  }, [grades]);

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

  const gpa = student?.cumulativeGpa4;
  const conduct = student?.wholeCourseTrainingScore;

  // Elective courses processing
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

  // Aggregate Action Items for "Cần xử lý"
  const actionItems = useMemo<ActionItem[]>(() => {
    const items: ActionItem[] = [];

    // 1. Failed mandatory courses
    for (const c of failedMandatoryCourses) {
      const g = gradeByCourseCode.get(c.courseCode.toUpperCase());
      items.push({
        id: `fail-mand-${c.courseCode}`,
        courseCode: c.courseCode,
        courseName: c.courseName,
        credits: c.credits,
        requirementType: "Bắt buộc",
        letterGrade: g?.letterGrade || "F",
        score10: g?.score10,
        statusLabel: "Chưa đạt (Điểm F)",
        statusType: "fail",
        termInfo: g?.academicYear && g?.termCode ? `${g.academicYear} • ${g.termCode}` : undefined,
        advice: "Học phần bắt buộc chưa đạt, cần sớm đăng ký học lại để trả nợ môn.",
      });
    }

    // 2. Failed elective courses
    for (const c of failedElectiveCourses) {
      const g = gradeByCourseCode.get(c.courseCode.toUpperCase());
      items.push({
        id: `fail-elec-${c.courseCode}`,
        courseCode: c.courseCode,
        courseName: c.courseName,
        credits: c.credits,
        requirementType: "Tự chọn",
        letterGrade: g?.letterGrade || "F",
        score10: g?.score10,
        statusLabel: "Chưa đạt (Điểm F)",
        statusType: "fail",
        termInfo: g?.academicYear && g?.termCode ? `${g.academicYear} • ${g.termCode}` : undefined,
        advice: "Cần học lại hoặc lựa chọn học phần tự chọn phù hợp khác trong khung CTĐT.",
      });
    }

    // 3. Overdue mandatory courses from past semesters (Year 2-4)
    if (isOngoingStudent) {
      for (const c of overdueMandatoryCourses) {
        items.push({
          id: `overdue-${c.courseCode}`,
          courseCode: c.courseCode,
          courseName: c.courseName,
          credits: c.credits,
          requirementType: "Bắt buộc",
          statusLabel: c.semesterNo ? `Chưa học (Kỳ ${c.semesterNo})` : "Kỳ trước chưa học",
          statusType: "overdue",
          termInfo: c.semesterNo ? `Kế hoạch Kỳ ${c.semesterNo}` : "Học kỳ trước",
          advice: "Học phần bắt buộc kỳ trước chưa hoàn thành, cần ưu tiên đăng ký học bù sớm.",
        });
      }
    } else {
      // Final year missing mandatory courses (excluding those already failed)
      const missingNotFailed = (forecast.missingRequiredCourses || []).filter(
        (c) => c.state !== "failed" && c.state !== "no_score"
      );
      for (const c of missingNotFailed) {
        items.push({
          id: `missing-final-${c.courseCode}`,
          courseCode: c.courseCode,
          courseName: c.courseName,
          credits: c.credits,
          requirementType: "Bắt buộc",
          statusLabel: "Chưa hoàn thành",
          statusType: "overdue",
          advice: "Cần hoàn thành học phần bắt buộc này để đủ điều kiện xét tốt nghiệp.",
        });
      }
    }

    // 4. Failed rule certifications
    for (const r of layer2Rules) {
      if (r.result === "FAIL") {
        const meta = STANDARD_CERTS[r.ruleCode];
        items.push({
          id: `cert-fail-${r.ruleCode}`,
          courseCode: r.ruleCode,
          courseName: meta?.name || r.ruleName,
          credits: 0,
          requirementType: "Quy chế",
          statusLabel: "Chưa đạt tiêu chuẩn",
          statusType: "cert",
          advice: meta?.advice || r.reason || "Cần hoàn thiện điều kiện theo quy chế đào tạo.",
        });
      }
    }

    return items;
  }, [
    failedMandatoryCourses,
    failedElectiveCourses,
    overdueMandatoryCourses,
    isOngoingStudent,
    forecast.missingRequiredCourses,
    layer2Rules,
    gradeByCourseCode,
  ]);

  const actionCount = actionItems.length;

  // Short recommendations (Section 6)
  const shortRecommendations = useMemo(() => {
    const recs: string[] = [];

    if (failedElectiveCount > 0) {
      recs.push(
        `Có ${failedElectiveCount} HP tự chọn chưa đạt (điểm F), cần học lại hoặc chọn môn phù hợp khác.`
      );
    }

    if (failedMandatoryCount > 0) {
      recs.push(
        `Có ${failedMandatoryCount} HP bắt buộc bị điểm F, cần đăng ký học lại sớm: ${failedMandatoryCourses.map((c) => c.courseName).join(", ")}.`
      );
    }

    if (isOngoingStudent) {
      if (overdueMandatoryCourses.length > 0) {
        recs.push(
          `Còn ${overdueMandatoryCourses.length} HP bắt buộc thuộc các học kỳ trước chưa hoàn thành, cần ưu tiên học bù.`
        );
      }
      if (futureMandatoryCourses.length > 0) {
        recs.push(
          `Có ${futureMandatoryCourses.length} HP bắt buộc thuộc kế hoạch học kỳ tương lai theo đúng tiến độ CTĐT.`
        );
      }
    } else {
      if (missingMandatoryCount > 0) {
        recs.push(
          `Còn ${missingMandatoryCount} học phần bắt buộc chưa hoàn thành để đủ điều kiện tốt nghiệp.`
        );
      }
    }

    if (requirements.electives.remainingCredits && requirements.electives.remainingCredits > 0) {
      recs.push(
        `Còn ${requirements.electives.remainingCredits} TC tự chọn cần tích lũy theo khung CTĐT.`
      );
    }

    if (finalStatus === "PENDING_REQUIREMENT") {
      recs.push("Cần bổ sung hồ sơ chứng chỉ tốt nghiệp theo quy định.");
    }

    return recs;
  }, [
    failedElectiveCount,
    failedMandatoryCount,
    failedMandatoryCourses,
    isOngoingStudent,
    overdueMandatoryCourses,
    futureMandatoryCourses,
    missingMandatoryCount,
    requirements.electives.remainingCredits,
    finalStatus,
  ]);

  // Tab State
  type MainTab = "action" | "enrolled" | "plan" | "curriculum";
  const [activeMainTab, setActiveMainTab] = useState<MainTab>(() => {
    if (initialTab === "transcript") return "curriculum";
    if (initialTab === "enrolled") return "enrolled";
    if (initialTab === "plan") return "plan";
    if (initialTab === "curriculum") return "curriculum";
    // Default to "action" if student has issues, otherwise "enrolled" if enrolled courses exist
    return actionCount > 0 ? "action" : "enrolled";
  });

  // Sub-tabs in "Chi tiết CTĐT"
  type CurriculumSubTab = "mandatory" | "electives" | "outcomes" | "transcript";
  const [curriculumSubTab, setCurriculumSubTab] = useState<CurriculumSubTab>(() => {
    if (initialTab === "transcript") return "transcript";
    return "mandatory";
  });

  // State for sub-views
  const [showTechnicalAudit, setShowTechnicalAudit] = useState(false);

  // Filters inside "HP bắt buộc" sub-tab
  const [mandatoryFilter, setMandatoryFilter] = useState<"all" | "missing" | "completed">("all");
  const [mandatorySearch, setMandatorySearch] = useState("");

  // All mandatory courses in curriculum (completed + missing)
  const allMandatoryCourses = useMemo(() => {
    const list: (Course & { isCompleted: boolean })[] = [];
    const completedList = forecast.requiredCoursesBreakdown?.completed || [];
    for (const c of completedList) {
      list.push({ ...c, isCompleted: true });
    }
    for (const c of forecast.missingRequiredCourses || []) {
      list.push({ ...c, isCompleted: false });
    }
    return list;
  }, [forecast.requiredCoursesBreakdown?.completed, forecast.missingRequiredCourses]);

  const displayedMandatoryCourses = useMemo(() => {
    let list = allMandatoryCourses;
    if (mandatoryFilter === "completed") {
      list = list.filter((c) => c.isCompleted);
    } else if (mandatoryFilter === "missing") {
      list = list.filter((c) => !c.isCompleted);
    }
    if (mandatorySearch.trim()) {
      const q = mandatorySearch.toLowerCase();
      list = list.filter(
        (c) =>
          c.courseCode.toLowerCase().includes(q) ||
          c.courseName.toLowerCase().includes(q)
      );
    }
    return list;
  }, [allMandatoryCourses, mandatoryFilter, mandatorySearch]);

  // Filters inside "HP tự chọn" sub-tab
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
          c.courseName.toLowerCase().includes(q)
      );
    }
    return list;
  }, [electiveFilter, takenElectives, pendingElectives, failedElectives, effectiveElectiveCourses, electiveSearch]);

  // Filters inside "Bảng điểm" sub-tab
  const [transcriptSearch, setTranscriptSearch] = useState("");
  const [transcriptTermFilter, setTranscriptTermFilter] = useState("all");
  const [transcriptStatusFilter, setTranscriptStatusFilter] = useState<"all" | "passed" | "failed" | "pending">("all");

  const passedGrades = useMemo(() => (grades || []).filter((g) => g.isPassed), [grades]);
  const failedGrades = useMemo(
    () =>
      (grades || []).filter(
        (g) => !g.isPassed && g.scoreStatus === "graded" && !g.notScore && (g.score10 != null || g.score4 != null || g.letterGrade)
      ),
    [grades]
  );
  const pendingGrades = useMemo(
    () => (grades || []).filter((g) => !g.isPassed && !failedGrades.includes(g)),
    [grades, failedGrades]
  );

  const uniqueTerms = useMemo(() => {
    return Array.from(
      new Set((grades || []).map((g) => `${g.academicYear} • ${g.termCode}`))
    ).filter(Boolean) as string[];
  }, [grades]);

  const filteredGrades = useMemo(() => {
    return (grades || []).filter((g) => {
      if (transcriptTermFilter !== "all") {
        const termKey = `${g.academicYear} • ${g.termCode}`;
        if (termKey !== transcriptTermFilter) return false;
      }
      if (transcriptStatusFilter === "passed" && !g.isPassed) return false;
      if (transcriptStatusFilter === "failed" && !failedGrades.includes(g)) return false;
      if (transcriptStatusFilter === "pending" && !pendingGrades.includes(g)) return false;
      if (transcriptSearch.trim()) {
        const q = transcriptSearch.toLowerCase();
        const matchCode = String(g.courseCode || "").toLowerCase().includes(q);
        const matchName = String(g.courseName || "").toLowerCase().includes(q);
        if (!matchCode && !matchName) return false;
      }
      return true;
    });
  }, [grades, transcriptTermFilter, transcriptStatusFilter, failedGrades, pendingGrades, transcriptSearch]);

  return (
    <div className="space-y-4 text-xs sm:text-sm text-slate-800">
      {/* ============================================================ */}
      {/* 1. SUMMARY ĐẦU MODAL — GỌN GÀNG, KHÔNG CARD MÀU NỔI, KHÔNG GRADIENT */}
      {/* ============================================================ */}
      <div className="rounded-xl border border-slate-200 bg-white p-3 sm:p-3.5">
        <div className="flex flex-col gap-2.5 sm:flex-row sm:items-center sm:justify-between border-b border-slate-100 pb-2.5">
          <div className="flex items-center gap-2">
            <span className="font-semibold text-slate-900 text-xs">
              {isOngoingStudent ? "Rà soát yêu cầu CTĐT" : "Dự kiến kết quả xét tốt nghiệp"}
            </span>
            <span className="text-slate-300">•</span>
            {actionCount > 0 ? (
              <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 px-2 py-0.5 text-[11px] font-semibold text-amber-800 border border-amber-200">
                <AlertTriangle size={12} className="text-amber-600" />
                Có {actionCount} yêu cầu cần xử lý
              </span>
            ) : (
              <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 text-[11px] font-semibold text-emerald-800 border border-emerald-200">
                <CheckCircle2 size={12} className="text-emerald-600" />
                {isOngoingStudent ? "Không có yêu cầu tồn đọng từ kỳ trước" : "Đạt yêu cầu chương trình"}
              </span>
            )}
          </div>

          <div className="text-[11px] text-slate-500 font-mono">
            CTĐT: <span className="font-semibold text-slate-700">{programCode || "Chính quy"}</span>
            {cohortNumber && (
              <span> • K{cohortNumber} {isOngoingStudent ? `(Năm ${studyYear})` : "(Năm cuối)"}</span>
            )}
          </div>
        </div>

        {/* Hàng summary đơn giản với dividers */}
        <div className="mt-2.5 flex flex-wrap items-center gap-2 text-xs">
          {/* Cần xử lý */}
          <div
            onClick={() => setActiveMainTab("action")}
            className={`flex items-center gap-1.5 rounded-lg px-2.5 py-1 transition cursor-pointer ${
              actionCount > 0
                ? "bg-amber-50 text-amber-900 border border-amber-200 hover:bg-amber-100/70"
                : "bg-slate-50 text-slate-700 border border-slate-200 hover:bg-slate-100"
            }`}
          >
            <span className="text-slate-500">Cần xử lý:</span>
            <strong className={`font-mono font-bold ${actionCount > 0 ? "text-amber-800" : "text-slate-800"}`}>
              {actionCount}
            </strong>
          </div>

          <div className="h-4 w-px bg-slate-200 hidden sm:block" />

          {/* Đang học */}
          <div
            onClick={() => setActiveMainTab("enrolled")}
            className="flex items-center gap-1.5 rounded-lg bg-sky-50 px-2.5 py-1 text-sky-900 border border-sky-200 hover:bg-sky-100/70 transition cursor-pointer"
          >
            <span className="text-sky-700">Đang học:</span>
            <strong className="font-mono font-bold text-sky-900">{forecast.noScoreCourses.length} môn</strong>
          </div>

          <div className="h-4 w-px bg-slate-200 hidden sm:block" />

          {/* Kế hoạch tiếp theo */}
          <div
            onClick={() => setActiveMainTab("plan")}
            className="flex items-center gap-1.5 rounded-lg bg-slate-50 px-2.5 py-1 text-slate-700 border border-slate-200 hover:bg-slate-100 transition cursor-pointer"
          >
            <span className="text-slate-500">Kế hoạch:</span>
            <strong className="font-mono font-bold text-slate-800">
              {futureMandatoryCourses.length > 0 ? `${futureMandatoryCourses.length} môn` : "Theo lộ trình"}
            </strong>
          </div>

          <div className="h-4 w-px bg-slate-200 hidden sm:block" />

          {/* Tự chọn */}
          <div
            onClick={() => {
              setActiveMainTab("curriculum");
              setCurriculumSubTab("electives");
            }}
            className="flex items-center gap-1.5 rounded-lg bg-slate-50 px-2.5 py-1 text-slate-700 border border-slate-200 hover:bg-slate-100 transition cursor-pointer"
          >
            <span className="text-slate-500">Tự chọn:</span>
            <strong className="font-mono font-bold text-slate-800">
              {requirements.electives.passedCredits || 0}
              {requirements.electives.requiredCredits ? ` / ${requirements.electives.requiredCredits} TC` : " TC"}
            </strong>
          </div>

          {/* Nếu là sinh viên năm cuối: hiển thị thêm Tín chỉ tích lũy */}
          {!isOngoingStudent && (
            <>
              <div className="h-4 w-px bg-slate-200 hidden sm:block" />
              <div className="flex items-center gap-1.5 rounded-lg bg-slate-50 px-2.5 py-1 text-slate-700 border border-slate-200">
                <span className="text-slate-500">Tích lũy:</span>
                <strong className="font-mono font-bold text-slate-800">
                  {earnedCredits}{totalLimit ? ` / ${totalLimit} TC` : " TC"}
                </strong>
              </div>
            </>
          )}

          {gpa != null && (
            <>
              <div className="h-4 w-px bg-slate-200 hidden sm:block" />
              <div className="flex items-center gap-1.5 rounded-lg bg-slate-50 px-2.5 py-1 text-slate-700 border border-slate-200">
                <span className="text-slate-500">GPA:</span>
                <strong className="font-mono font-bold text-slate-800">{gpa.toFixed(2)}</strong>
              </div>
            </>
          )}

          {conduct != null && (
            <>
              <div className="h-4 w-px bg-slate-200 hidden sm:block" />
              <div className="flex items-center gap-1.5 rounded-lg bg-slate-50 px-2.5 py-1 text-slate-700 border border-slate-200">
                <span className="text-slate-500">Rèn luyện:</span>
                <strong className="font-mono font-bold text-slate-800">{conduct.toFixed(0)} đ</strong>
              </div>
            </>
          )}
        </div>
      </div>

      {/* ============================================================ */}
      {/* 2. KHUYẾN NGHỊ — RÚT GỌN THÀNH DANH SÁCH NGẮN, KHÔNG CARD TO */}
      {/* ============================================================ */}
      {shortRecommendations.length > 0 && (
        <div className="rounded-xl border border-slate-200 bg-white p-3 sm:px-4 sm:py-3">
          <div className="flex items-center gap-1.5 text-xs font-bold text-slate-900">
            <Sparkles size={14} className="text-lime-600" />
            <span>Khuyến nghị</span>
          </div>
          <ul className="mt-1.5 space-y-1 text-xs text-slate-600 pl-1">
            {shortRecommendations.map((rec, idx) => (
              <li key={idx} className="flex items-start gap-2">
                <span className="text-slate-400 select-none">•</span>
                <span className="leading-relaxed">{rec}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* ============================================================ */}
      {/* 3. TABS NAVIGATION — STICKY BÊN DƯỚI HEADER */}
      {/* ============================================================ */}
      <div className="sticky top-0 z-20 bg-white/95 backdrop-blur-xs border-b border-slate-200 pt-1 pb-2 flex items-center gap-1.5 overflow-x-auto">
        {/* Tab Cần xử lý */}
        <button
          type="button"
          onClick={() => setActiveMainTab("action")}
          className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-bold transition cursor-pointer whitespace-nowrap ${
            activeMainTab === "action"
              ? "bg-slate-900 text-white shadow-2xs"
              : "bg-slate-100 text-slate-600 hover:bg-slate-200/80 hover:text-slate-900"
          }`}
        >
          <AlertTriangle size={13} className={actionCount > 0 ? "text-amber-400" : "text-slate-400"} />
          <span>Cần xử lý</span>
          {actionCount > 0 && (
            <span
              className={`ml-0.5 rounded-full px-1.5 py-0.2 text-[10px] font-extrabold ${
                activeMainTab === "action" ? "bg-amber-400 text-slate-900" : "bg-amber-100 text-amber-800"
              }`}
            >
              {actionCount}
            </span>
          )}
        </button>

        {/* Tab Đang học */}
        <button
          type="button"
          onClick={() => setActiveMainTab("enrolled")}
          className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-bold transition cursor-pointer whitespace-nowrap ${
            activeMainTab === "enrolled"
              ? "bg-slate-900 text-white shadow-2xs"
              : "bg-slate-100 text-slate-600 hover:bg-slate-200/80 hover:text-slate-900"
          }`}
        >
          <Clock size={13} />
          <span>Đang học</span>
          {forecast.noScoreCourses.length > 0 && (
            <span
              className={`ml-0.5 rounded-full px-1.5 py-0.2 text-[10px] font-bold ${
                activeMainTab === "enrolled" ? "bg-sky-400 text-slate-900" : "bg-sky-100 text-sky-800"
              }`}
            >
              {forecast.noScoreCourses.length}
            </span>
          )}
        </button>

        {/* Tab Kế hoạch */}
        <button
          type="button"
          onClick={() => setActiveMainTab("plan")}
          className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-bold transition cursor-pointer whitespace-nowrap ${
            activeMainTab === "plan"
              ? "bg-slate-900 text-white shadow-2xs"
              : "bg-slate-100 text-slate-600 hover:bg-slate-200/80 hover:text-slate-900"
          }`}
        >
          <BookOpen size={13} />
          <span>Kế hoạch</span>
          {futureMandatoryCourses.length > 0 && (
            <span
              className={`ml-0.5 rounded-full px-1.5 py-0.2 text-[10px] font-semibold ${
                activeMainTab === "plan" ? "bg-white/20 text-white" : "bg-slate-200 text-slate-700"
              }`}
            >
              {futureMandatoryCourses.length}
            </span>
          )}
        </button>

        {/* Tab Chi tiết CTĐT */}
        <button
          type="button"
          onClick={() => setActiveMainTab("curriculum")}
          className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-bold transition cursor-pointer whitespace-nowrap ${
            activeMainTab === "curriculum"
              ? "bg-slate-900 text-white shadow-2xs"
              : "bg-slate-100 text-slate-600 hover:bg-slate-200/80 hover:text-slate-900"
          }`}
        >
          <GraduationCap size={13} />
          <span>Chi tiết CTĐT</span>
        </button>
      </div>

      {/* ============================================================ */}
      {/* TAB 1: CẦN XỬ LÝ (QUAN TRỌNG NHẤT) */}
      {/* ============================================================ */}
      {activeMainTab === "action" && (
        <div className="space-y-3">
          {actionCount === 0 ? (
            <div className="rounded-xl border border-slate-200 bg-white p-6 text-center text-slate-600">
              <CheckCircle2 size={28} className="mx-auto text-emerald-600 mb-2" />
              <p className="font-bold text-slate-900 text-sm">
                Không có yêu cầu cần xử lý từ các học kỳ trước
              </p>
              <p className="text-xs text-slate-500 mt-1 max-w-md mx-auto">
                Sinh viên không nợ học phần bắt buộc nào từ các kỳ đã qua và không có môn học nào bị điểm F chưa trả nợ.
              </p>
            </div>
          ) : actionCount === 1 ? (
            // Nếu chỉ có 1 vấn đề: hiển thị block đơn giản
            <div className="rounded-xl border border-slate-200 bg-white p-4">
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 border-b border-slate-100 pb-3">
                <div>
                  <div className="flex items-center gap-2">
                    <h4 className="font-bold text-slate-900 text-sm">{actionItems[0].courseName}</h4>
                    <span className="font-mono text-xs font-semibold px-2 py-0.5 rounded bg-slate-100 text-slate-700 border border-slate-200">
                      {actionItems[0].courseCode}
                    </span>
                  </div>
                  <div className="flex items-center gap-2 mt-1.5 text-xs text-slate-500">
                    {actionItems[0].credits > 0 && <span>{actionItems[0].credits} TC</span>}
                    {actionItems[0].credits > 0 && <span>•</span>}
                    <span className="font-medium text-slate-700">{actionItems[0].requirementType}</span>
                    {actionItems[0].letterGrade && (
                      <>
                        <span>•</span>
                        <span className="font-bold text-rose-700">Điểm {actionItems[0].letterGrade}</span>
                      </>
                    )}
                    {actionItems[0].termInfo && (
                      <>
                        <span>•</span>
                        <span>{actionItems[0].termInfo}</span>
                      </>
                    )}
                  </div>
                </div>

                <span
                  className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-bold self-start sm:self-center ${
                    actionItems[0].statusType === "fail"
                      ? "bg-rose-50 text-rose-800 border border-rose-200"
                      : "bg-amber-50 text-amber-800 border border-amber-200"
                  }`}
                >
                  {actionItems[0].statusType === "fail" ? <XCircle size={12} /> : <AlertTriangle size={12} />}
                  {actionItems[0].statusLabel}
                </span>
              </div>

              <div className="mt-3 text-xs text-slate-700 flex items-start gap-1.5">
                <span className="font-semibold text-slate-900 shrink-0">Khuyến nghị:</span>
                <span className="leading-relaxed">{actionItems[0].advice}</span>
              </div>
            </div>
          ) : (
            // Nếu có nhiều vấn đề: hiển thị bảng / danh sách gọn
            <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
              <div className="overflow-x-auto">
                <table className="w-full min-w-[600px] text-left text-xs">
                  <thead className="border-b border-slate-200 bg-slate-50 text-slate-600 font-semibold">
                    <tr>
                      <th className="px-3.5 py-2.5">Mã HP</th>
                      <th className="px-3.5 py-2.5">Tên học phần / Yêu cầu</th>
                      <th className="px-2 py-2.5 text-center">Số TC</th>
                      <th className="px-3 py-2.5">Loại</th>
                      <th className="px-3 py-2.5">Tình trạng</th>
                      <th className="px-3.5 py-2.5 text-right">Khuyến nghị xử lý</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {actionItems.map((item) => (
                      <tr key={item.id} className="hover:bg-slate-50/70 transition">
                        <td className="px-3.5 py-2.5 font-mono font-bold text-slate-900 whitespace-nowrap">
                          {item.courseCode}
                        </td>
                        <td className="px-3.5 py-2.5 font-medium text-slate-800">
                          {item.courseName}
                        </td>
                        <td className="px-2 py-2.5 text-center font-mono text-slate-700">
                          {item.credits > 0 ? item.credits : "—"}
                        </td>
                        <td className="px-3 py-2.5">
                          <span
                            className={`rounded px-1.5 py-0.5 text-[10px] font-semibold ${
                              item.requirementType === "Tự chọn"
                                ? "bg-indigo-50 text-indigo-700"
                                : item.requirementType === "Bắt buộc"
                                  ? "bg-slate-100 text-slate-700"
                                  : "bg-amber-50 text-amber-800"
                            }`}
                          >
                            {item.requirementType}
                          </span>
                        </td>
                        <td className="px-3 py-2.5 whitespace-nowrap">
                          <span
                            className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-bold ${
                              item.statusType === "fail"
                                ? "bg-rose-50 text-rose-800 border border-rose-200"
                                : "bg-amber-50 text-amber-800 border border-amber-200"
                            }`}
                          >
                            {item.statusType === "fail" ? <XCircle size={11} /> : <AlertTriangle size={11} />}
                            {item.statusLabel}
                          </span>
                        </td>
                        <td className="px-3.5 py-2.5 text-right text-slate-600 max-w-xs truncate">
                          {item.advice}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ============================================================ */}
      {/* TAB 2: ĐANG HỌC (HỌC PHẦN KỲ HIỆN TẠI) */}
      {/* ============================================================ */}
      {activeMainTab === "enrolled" && (
        <div className="space-y-3">
          <div className="flex items-center justify-between text-xs text-slate-500">
            <span>
              Các học phần sinh viên đang theo học trong học kỳ hiện tại, chưa có điểm tổng kết cuối kỳ.
            </span>
            <span className="font-semibold text-sky-800 bg-sky-50 border border-sky-200 px-2 py-0.5 rounded-md">
              {forecast.noScoreCourses.length} học phần
            </span>
          </div>

          {forecast.noScoreCourses.length === 0 ? (
            <div className="rounded-xl border border-slate-200 bg-white p-6 text-center text-slate-500">
              <p className="font-medium text-slate-700">Sinh viên hiện không có môn học nào đang chờ điểm.</p>
              <p className="mt-1 text-xs text-slate-400">Không có dữ liệu học phần đang học trong đợt này.</p>
            </div>
          ) : (
            <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
              <div className="overflow-x-auto">
                <table className="w-full min-w-[550px] text-left text-xs">
                  <thead className="border-b border-slate-200 bg-slate-50 text-slate-600 font-semibold">
                    <tr>
                      <th className="px-3.5 py-2.5">Mã HP</th>
                      <th className="px-3.5 py-2.5">Tên học phần</th>
                      <th className="px-2 py-2.5 text-center">Số TC</th>
                      <th className="px-3 py-2.5">Loại yêu cầu</th>
                      <th className="px-3.5 py-2.5 text-right">Trạng thái</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {forecast.noScoreCourses.map((c) => (
                      <tr key={c.courseId} className="hover:bg-slate-50/70 transition">
                        <td className="px-3.5 py-2.5 font-mono font-bold text-slate-900 whitespace-nowrap">
                          {c.courseCode}
                        </td>
                        <td className="px-3.5 py-2.5 font-medium text-slate-800">{c.courseName}</td>
                        <td className="px-2 py-2.5 text-center font-mono text-slate-700">{c.credits}</td>
                        <td className="px-3 py-2.5 text-slate-600">{c.requirementType || "Bắt buộc"}</td>
                        <td className="px-3.5 py-2.5 text-right whitespace-nowrap">
                          <span className="inline-flex items-center gap-1 rounded-md bg-sky-50 border border-sky-200 px-2 py-0.5 text-[11px] font-semibold text-sky-800">
                            <Clock size={11} /> Đang học
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ============================================================ */}
      {/* TAB 3: KẾ HOẠCH (HỌC PHẦN KỲ TƯƠNG LAI) */}
      {/* ============================================================ */}
      {activeMainTab === "plan" && (
        <div className="space-y-3">
          <div className="flex items-center justify-between text-xs text-slate-500">
            <span>
              Các học phần bắt buộc thuộc các học kỳ tương lai theo khung chương trình đào tạo.
            </span>
            <span className="rounded-md bg-slate-100 border border-slate-200 px-2 py-0.5 text-slate-600 font-semibold">
              Kế hoạch tương lai ({futureMandatoryCourses.length} môn)
            </span>
          </div>

          {futureMandatoryCourses.length === 0 ? (
            <div className="rounded-xl border border-slate-200 bg-white p-6 text-center text-slate-500">
              <CheckCircle2 size={24} className="mx-auto text-emerald-600 mb-1.5" />
              <p className="font-medium text-slate-700">Không có học phần kế hoạch tương lai còn lại.</p>
              <p className="mt-1 text-xs text-slate-400">Sinh viên đã hoàn thành hoặc đang ở giai đoạn hoàn tất CTĐT.</p>
            </div>
          ) : (
            <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
              <div className="overflow-x-auto">
                <table className="w-full min-w-[550px] text-left text-xs">
                  <thead className="border-b border-slate-200 bg-slate-50 text-slate-600 font-semibold">
                    <tr>
                      <th className="px-3.5 py-2.5">Mã HP</th>
                      <th className="px-3.5 py-2.5">Tên học phần</th>
                      <th className="px-2 py-2.5 text-center">Số TC</th>
                      <th className="px-3 py-2.5">Lộ trình học kỳ</th>
                      <th className="px-3.5 py-2.5 text-right">Trạng thái</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {futureMandatoryCourses.map((c) => (
                      <tr key={c.courseId} className="hover:bg-slate-50/70 transition">
                        <td className="px-3.5 py-2.5 font-mono font-bold text-slate-900 whitespace-nowrap">
                          {c.courseCode}
                        </td>
                        <td className="px-3.5 py-2.5 font-medium text-slate-800">{c.courseName}</td>
                        <td className="px-2 py-2.5 text-center font-mono text-slate-700">{c.credits}</td>
                        <td className="px-3 py-2.5 text-slate-600 whitespace-nowrap">
                          {c.semesterNo ? `Học kỳ ${c.semesterNo} (Năm ${Math.ceil(c.semesterNo / 2)})` : "Kỳ sau"}
                        </td>
                        <td className="px-3.5 py-2.5 text-right whitespace-nowrap">
                          <span className="rounded-md bg-slate-100 border border-slate-200 px-2 py-0.5 text-[11px] font-medium text-slate-600">
                            Kế hoạch tương lai
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ============================================================ */}
      {/* TAB 4: CHI TIẾT CTĐT (SUB-TABS: BẮT BUỘC, TỰ CHỌN, CĐR, BẢNG ĐIỂM) */}
      {/* ============================================================ */}
      {activeMainTab === "curriculum" && (
        <div className="space-y-3.5">
          {/* Sub-tabs header */}
          <div className="flex flex-wrap items-center gap-1.5 border-b border-slate-200 pb-2">
            <button
              type="button"
              onClick={() => setCurriculumSubTab("mandatory")}
              className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition cursor-pointer ${
                curriculumSubTab === "mandatory"
                  ? "bg-slate-800 text-white"
                  : "text-slate-600 hover:bg-slate-100 hover:text-slate-900"
              }`}
            >
              HP bắt buộc ({requirements.requiredCourses.total} môn)
            </button>
            <button
              type="button"
              onClick={() => setCurriculumSubTab("electives")}
              className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition cursor-pointer ${
                curriculumSubTab === "electives"
                  ? "bg-slate-800 text-white"
                  : "text-slate-600 hover:bg-slate-100 hover:text-slate-900"
              }`}
            >
              HP tự chọn ({requirements.electives.passedCredits || 0}/{requirements.electives.requiredCredits || "—"} TC)
            </button>
            <button
              type="button"
              onClick={() => setCurriculumSubTab("outcomes")}
              className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition cursor-pointer ${
                curriculumSubTab === "outcomes"
                  ? "bg-slate-800 text-white"
                  : "text-slate-600 hover:bg-slate-100 hover:text-slate-900"
              }`}
            >
              Chuẩn đầu ra & Chứng chỉ ({layer2Rules.length})
            </button>
            <button
              type="button"
              onClick={() => setCurriculumSubTab("transcript")}
              className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition cursor-pointer ${
                curriculumSubTab === "transcript"
                  ? "bg-slate-800 text-white"
                  : "text-slate-600 hover:bg-slate-100 hover:text-slate-900"
              }`}
            >
              Bảng điểm ({grades.length} môn)
            </button>
          </div>

          {/* ------------------------------------------------------------ */}
          {/* SUB-TAB 1: HỌC PHẦN BẮT BUỘC */}
          {/* ------------------------------------------------------------ */}
          {curriculumSubTab === "mandatory" && (
            <div className="space-y-3">
              <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex items-center gap-1.5 text-xs">
                  <button
                    type="button"
                    onClick={() => setMandatoryFilter("all")}
                    className={`rounded-lg px-2.5 py-1 font-semibold transition cursor-pointer ${
                      mandatoryFilter === "all"
                        ? "bg-slate-200 text-slate-900"
                        : "text-slate-500 hover:text-slate-900"
                    }`}
                  >
                    Tất cả ({allMandatoryCourses.length})
                  </button>
                  <button
                    type="button"
                    onClick={() => setMandatoryFilter("completed")}
                    className={`rounded-lg px-2.5 py-1 font-semibold transition cursor-pointer ${
                      mandatoryFilter === "completed"
                        ? "bg-emerald-100 text-emerald-900 font-bold"
                        : "text-slate-500 hover:text-slate-900"
                    }`}
                  >
                    Đã đạt ({requirements.requiredCourses.completed})
                  </button>
                  <button
                    type="button"
                    onClick={() => setMandatoryFilter("missing")}
                    className={`rounded-lg px-2.5 py-1 font-semibold transition cursor-pointer ${
                      mandatoryFilter === "missing"
                        ? "bg-amber-100 text-amber-900 font-bold"
                        : "text-slate-500 hover:text-slate-900"
                    }`}
                  >
                    Chưa hoàn thành ({requirements.requiredCourses.remaining})
                  </button>
                </div>

                <div className="relative w-full sm:w-56">
                  <Search size={13} className="pointer-events-none absolute left-2.5 top-2.5 text-slate-400" />
                  <input
                    value={mandatorySearch}
                    onChange={(e) => setMandatorySearch(e.target.value)}
                    placeholder="Tìm môn bắt buộc..."
                    className="h-8 w-full rounded-lg border border-slate-200 bg-white pl-8 pr-2.5 text-xs outline-none focus:border-lime-500 focus:ring-1 focus:ring-lime-100"
                  />
                </div>
              </div>

              <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
                <div className="max-h-[45vh] overflow-y-auto overflow-x-auto">
                  <table className="w-full min-w-[550px] text-left text-xs">
                    <thead className="sticky top-0 z-10 border-b border-slate-200 bg-slate-50 text-slate-600 font-semibold">
                      <tr>
                        <th className="px-3.5 py-2.5">Mã HP</th>
                        <th className="px-3.5 py-2.5">Tên học phần</th>
                        <th className="px-2 py-2.5 text-center">Số TC</th>
                        <th className="px-3 py-2.5">Lộ trình CTĐT</th>
                        <th className="px-3.5 py-2.5 text-right">Trạng thái</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {displayedMandatoryCourses.length === 0 ? (
                        <tr>
                          <td colSpan={5} className="py-8 text-center text-slate-400">
                            Không tìm thấy học phần bắt buộc nào phù hợp.
                          </td>
                        </tr>
                      ) : (
                        displayedMandatoryCourses.map((c) => {
                          const isPass = c.isCompleted || c.state === "passed";
                          const isFail = c.state === "failed";
                          const isNoScore = c.state === "no_score";
                          const isOverdue =
                            isOngoingStudent &&
                            !isPass &&
                            !isFail &&
                            !isNoScore &&
                            c.semesterNo != null &&
                            expectedSemesterNo &&
                            c.semesterNo < expectedSemesterNo;

                          return (
                            <tr key={c.courseId} className="hover:bg-slate-50/70 transition">
                              <td className="px-3.5 py-2 font-mono font-bold text-slate-900 whitespace-nowrap">
                                {c.courseCode}
                              </td>
                              <td className="px-3.5 py-2 font-medium text-slate-800">{c.courseName}</td>
                              <td className="px-2 py-2 text-center font-mono text-slate-700">{c.credits}</td>
                              <td className="px-3 py-2 text-slate-500 whitespace-nowrap">
                                {c.semesterNo ? `Học kỳ ${c.semesterNo}` : "Chưa phân kỳ"}
                              </td>
                              <td className="px-3.5 py-2 text-right whitespace-nowrap">
                                {isPass ? (
                                  <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 text-[11px] font-semibold text-emerald-800 border border-emerald-200">
                                    <CheckCircle2 size={11} className="text-emerald-600" /> Đã đạt
                                  </span>
                                ) : isFail ? (
                                  <span className="inline-flex items-center gap-1 rounded-full bg-rose-50 px-2 py-0.5 text-[11px] font-semibold text-rose-800 border border-rose-200">
                                    <XCircle size={11} className="text-rose-600" /> Chưa đạt (F)
                                  </span>
                                ) : isNoScore ? (
                                  <span className="inline-flex items-center gap-1 rounded-full bg-sky-50 px-2 py-0.5 text-[11px] font-semibold text-sky-800 border border-sky-200">
                                    <Clock size={11} className="text-sky-600" /> Đang học
                                  </span>
                                ) : isOverdue ? (
                                  <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 px-2 py-0.5 text-[11px] font-semibold text-amber-800 border border-amber-200">
                                    <AlertTriangle size={11} className="text-amber-600" /> Còn thiếu
                                  </span>
                                ) : (
                                  <span className="rounded-md bg-slate-100 px-2 py-0.5 text-[11px] font-medium text-slate-600 border border-slate-200">
                                    Kế hoạch
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

          {/* ------------------------------------------------------------ */}
          {/* SUB-TAB 2: HỌC PHẦN TỰ CHỌN (RÚT GỌN THEO YÊU CẦU MỤC 8) */}
          {/* ------------------------------------------------------------ */}
          {curriculumSubTab === "electives" && (
            <div className="space-y-3">
              {/* Rút gọn phần overview thành 1 hàng đơn giản (Mục 8) */}
              <div className="flex flex-wrap items-center gap-2 rounded-xl border border-slate-200 bg-slate-50/70 p-2.5 text-xs text-slate-700">
                <div className="flex items-center gap-1">
                  <span className="text-slate-500">Đã đạt:</span>
                  <strong className="font-mono font-bold text-emerald-800">
                    {requirements.electives.passedCredits || 0} TC
                  </strong>
                </div>
                <span className="text-slate-300">•</span>
                <div className="flex items-center gap-1">
                  <span className="text-slate-500">Đang học:</span>
                  <strong className="font-mono font-bold text-sky-800">
                    {pendingElectives.reduce((sum, c) => sum + c.credits, 0)} TC
                  </strong>
                </div>
                <span className="text-slate-300">•</span>
                <div className="flex items-center gap-1">
                  <span className="text-slate-500">Chưa đạt:</span>
                  <strong className={`font-mono font-bold ${failedElectives.length > 0 ? "text-rose-700" : "text-slate-700"}`}>
                    {failedElectives.reduce((sum, c) => sum + c.credits, 0)} TC
                  </strong>
                </div>
                <span className="text-slate-300">•</span>
                <div className="flex items-center gap-1">
                  <span className="text-slate-500">Còn thiếu:</span>
                  <strong className="font-mono font-bold text-slate-900">
                    {requirements.electives.remainingCredits != null ? `${requirements.electives.remainingCredits} TC` : "0 TC"}
                  </strong>
                </div>
              </div>

              {/* Nhóm định mức chuyên ngành nếu có */}
              {forecast.electiveGroups && forecast.electiveGroups.length > 0 && (
                <div className="grid gap-2 sm:grid-cols-2">
                  {forecast.electiveGroups.map((group) => {
                    const isPass = group.status === "PASS";
                    return (
                      <div
                        key={group.code}
                        className={`rounded-lg border p-2.5 text-xs ${
                          isPass ? "border-emerald-200 bg-emerald-50/30" : "border-slate-200 bg-white"
                        }`}
                      >
                        <div className="flex items-center justify-between">
                          <span className="font-bold text-slate-900">{group.code}</span>
                          <span
                            className={`rounded px-1.5 py-0.2 text-[10px] font-bold ${
                              isPass ? "bg-emerald-100 text-emerald-800" : "bg-slate-100 text-slate-700"
                            }`}
                          >
                            {isPass ? "Đạt định mức" : "Đang tích lũy"}
                          </span>
                        </div>
                        <div className="mt-1 text-slate-600">
                          Đã tích lũy: <strong className="font-mono text-slate-900">{group.passedCredits} TC</strong>
                          {group.requiredCredits && (
                            <span> / {group.requiredCredits} TC</span>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}

              {/* Bộ lọc & Tìm kiếm môn tự chọn */}
              <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex items-center gap-1.5 text-xs">
                  <button
                    type="button"
                    onClick={() => setElectiveFilter("taken")}
                    className={`rounded-lg px-2.5 py-1 font-semibold transition cursor-pointer ${
                      electiveFilter === "taken"
                        ? "bg-slate-200 text-slate-900"
                        : "text-slate-500 hover:text-slate-900"
                    }`}
                  >
                    Đã & Đang học ({takenElectives.length})
                  </button>
                  {failedElectives.length > 0 && (
                    <button
                      type="button"
                      onClick={() => setElectiveFilter("failed")}
                      className={`rounded-lg px-2.5 py-1 font-semibold transition cursor-pointer ${
                        electiveFilter === "failed"
                          ? "bg-rose-100 text-rose-900 font-bold"
                          : "text-rose-600 hover:text-rose-900"
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
                        ? "bg-slate-200 text-slate-900"
                        : "text-slate-500 hover:text-slate-900"
                    }`}
                  >
                    Tất cả trong CTĐT ({effectiveElectiveCourses.length})
                  </button>
                </div>

                <div className="relative w-full sm:w-56">
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
              <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
                <div className="max-h-[45vh] overflow-y-auto overflow-x-auto">
                  <table className="w-full min-w-[550px] text-left text-xs">
                    <thead className="sticky top-0 z-10 border-b border-slate-200 bg-slate-50 text-slate-600 font-semibold">
                      <tr>
                        <th className="px-3.5 py-2.5">Mã HP</th>
                        <th className="px-3.5 py-2.5">Tên môn học</th>
                        <th className="px-2 py-2.5 text-center">Số TC</th>
                        <th className="px-3 py-2.5">Kỳ học / Đợt</th>
                        <th className="px-2 py-2.5 text-center">Điểm chữ</th>
                        <th className="px-3.5 py-2.5 text-right">Trạng thái</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {displayedElectives.length === 0 ? (
                        <tr>
                          <td colSpan={6} className="py-8 text-center text-slate-400">
                            Không tìm thấy học phần tự chọn nào phù hợp.
                          </td>
                        </tr>
                      ) : (
                        displayedElectives.map((course) => {
                          const isPassed = course.state === "passed";
                          const isFail = course.state === "failed";
                          const isNoScore = course.state === "no_score";
                          const grade = gradeByCourseCode.get(course.courseCode.toUpperCase());

                          return (
                            <tr key={course.courseId} className="hover:bg-slate-50/70 transition">
                              <td className="px-3.5 py-2 font-mono font-bold text-slate-900 whitespace-nowrap">
                                {course.courseCode}
                              </td>
                              <td className="px-3.5 py-2 font-medium text-slate-800">{course.courseName}</td>
                              <td className="px-2 py-2 text-center font-mono text-slate-700">{course.credits}</td>
                              <td className="px-3 py-2 text-slate-500 whitespace-nowrap">
                                {grade?.academicYear && grade?.termCode ? (
                                  <span className="font-mono text-slate-700">{grade.academicYear} • {grade.termCode}</span>
                                ) : (
                                  "Theo CTĐT"
                                )}
                              </td>
                              <td className="px-2 py-2 text-center font-mono font-extrabold">
                                {grade?.letterGrade ? (
                                  <span className={grade.letterGrade === "F" ? "text-rose-700" : "text-slate-800"}>
                                    {grade.letterGrade}
                                  </span>
                                ) : (
                                  "—"
                                )}
                              </td>
                              <td className="px-3.5 py-2 text-right whitespace-nowrap">
                                {isPassed ? (
                                  <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 text-[11px] font-semibold text-emerald-800 border border-emerald-200">
                                    <CheckCircle2 size={11} className="text-emerald-600" /> Đã đạt
                                  </span>
                                ) : isNoScore ? (
                                  <span className="inline-flex items-center gap-1 rounded-full bg-sky-50 px-2 py-0.5 text-[11px] font-semibold text-sky-800 border border-sky-200">
                                    <Clock size={11} className="text-sky-600" /> Đang học
                                  </span>
                                ) : isFail ? (
                                  <span className="inline-flex items-center gap-1 rounded-full bg-rose-50 px-2 py-0.5 text-[11px] font-semibold text-rose-800 border border-rose-200">
                                    <XCircle size={11} className="text-rose-600" /> Chưa đạt (F)
                                  </span>
                                ) : (
                                  <span className="rounded-md bg-slate-100 px-2 py-0.5 text-[11px] font-medium text-slate-600 border border-slate-200">
                                    Chưa học
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

          {/* ------------------------------------------------------------ */}
          {/* SUB-TAB 3: CHỨNG CHỈ & CHUẨN ĐẦU RA (MỤC 9) */}
          {/* ------------------------------------------------------------ */}
          {curriculumSubTab === "outcomes" && (
            <div className="space-y-3">
              <p className="text-xs text-slate-500">
                Các điều kiện chuẩn đầu ra và chứng chỉ bắt buộc theo Quy chế Đào tạo đại học.
              </p>

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
                      className={`rounded-xl border p-3.5 text-xs transition ${
                        isPass
                          ? "border-emerald-200 bg-emerald-50/20"
                          : isFail
                            ? "border-rose-200 bg-rose-50/20"
                            : "border-slate-200 bg-white"
                      }`}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex items-center gap-2.5">
                          <div
                            className={`rounded-lg p-2 ${
                              isPass
                                ? "bg-emerald-100 text-emerald-800"
                                : isFail
                                  ? "bg-rose-100 text-rose-800"
                                  : "bg-slate-100 text-slate-700"
                            }`}
                          >
                            <IconComp size={15} />
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

                      <div className="mt-2.5 pt-2 border-t border-slate-100 text-slate-600 text-[11px]">
                        {isPass ? "Đã xác minh đầy đủ trên hồ sơ sinh viên." : meta.advice}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* ------------------------------------------------------------ */}
          {/* SUB-TAB 4: BẢNG ĐIỂM (TÍCH HỢP TRỌN VẸN) */}
          {/* ------------------------------------------------------------ */}
          {curriculumSubTab === "transcript" && (
            <div className="space-y-3">
              {/* Thống kê nhanh bảng điểm */}
              <div className="flex flex-wrap items-center gap-2 rounded-xl border border-slate-200 bg-slate-50/70 p-2.5 text-xs text-slate-700">
                <div className="flex items-center gap-1">
                  <span className="text-slate-500">Tổng môn:</span>
                  <strong className="font-mono font-bold text-slate-900">{grades.length}</strong>
                </div>
                <span className="text-slate-300">•</span>
                <div className="flex items-center gap-1">
                  <span className="text-slate-500">Đã đạt:</span>
                  <strong className="font-mono font-bold text-emerald-800">{passedGrades.length}</strong>
                </div>
                <span className="text-slate-300">•</span>
                <div className="flex items-center gap-1">
                  <span className="text-slate-500">Môn rớt (F):</span>
                  <strong className={`font-mono font-bold ${failedGrades.length > 0 ? "text-rose-700" : "text-slate-700"}`}>
                    {failedGrades.length}
                  </strong>
                </div>
                <span className="text-slate-300">•</span>
                <div className="flex items-center gap-1">
                  <span className="text-slate-500">Chưa có điểm:</span>
                  <strong className="font-mono font-bold text-amber-800">{pendingGrades.length}</strong>
                </div>
              </div>

              {/* Bộ lọc bảng điểm */}
              <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                <div className="relative flex-1">
                  <Search size={13} className="pointer-events-none absolute left-2.5 top-2.5 text-slate-400" />
                  <input
                    value={transcriptSearch}
                    onChange={(e) => setTranscriptSearch(e.target.value)}
                    placeholder="Tìm tên môn học hoặc mã môn..."
                    className="h-8 w-full rounded-lg border border-slate-200 bg-white pl-8 pr-2.5 text-xs outline-none focus:border-lime-500 focus:ring-1 focus:ring-lime-100"
                  />
                </div>
                <select
                  value={transcriptTermFilter}
                  onChange={(e) => setTranscriptTermFilter(e.target.value)}
                  className="h-8 rounded-lg border border-slate-200 bg-white px-2.5 text-xs font-semibold text-slate-700 outline-none focus:border-lime-500"
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
                  onChange={(e) => setTranscriptStatusFilter(e.target.value as "all" | "passed" | "failed" | "pending")}
                  className="h-8 rounded-lg border border-slate-200 bg-white px-2.5 text-xs font-semibold text-slate-700 outline-none focus:border-lime-500"
                >
                  <option value="all">Tất cả kết quả</option>
                  <option value="failed">Chỉ xem môn rớt (F)</option>
                  <option value="pending">Chỉ xem môn chưa có điểm</option>
                  <option value="passed">Chỉ xem môn đã đạt</option>
                </select>
              </div>

              {/* Bảng điểm chi tiết */}
              <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
                <div className="max-h-[45vh] overflow-y-auto overflow-x-auto">
                  <table className="w-full min-w-[650px] text-left text-xs">
                    <thead className="sticky top-0 z-10 border-b border-slate-200 bg-slate-50 text-slate-600 font-semibold">
                      <tr>
                        <th className="px-3.5 py-2.5">Học kỳ</th>
                        <th className="px-3 py-2.5">Mã HP</th>
                        <th className="px-3.5 py-2.5">Tên môn học</th>
                        <th className="px-2 py-2.5 text-center">Số TC</th>
                        <th className="px-2 py-2.5 text-center">Điểm 10</th>
                        <th className="px-2 py-2.5 text-center">Điểm 4</th>
                        <th className="px-2 py-2.5 text-center">Điểm chữ</th>
                        <th className="px-3.5 py-2.5 text-right">Trạng thái</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {filteredGrades.length === 0 ? (
                        <tr>
                          <td colSpan={8} className="py-8 text-center text-slate-400">
                            Không tìm thấy môn học nào phù hợp bộ lọc.
                          </td>
                        </tr>
                      ) : (
                        filteredGrades.map((g) => {
                          const isFail = failedGrades.includes(g);
                          const isPendingGrade = pendingGrades.includes(g);

                          return (
                            <tr
                              key={g.id || `${g.courseCode}-${g.academicYear}-${g.termCode}`}
                              className={
                                isFail
                                  ? "bg-rose-50/30 hover:bg-rose-50/50"
                                  : isPendingGrade
                                    ? "bg-amber-50/20 hover:bg-amber-50/40"
                                    : "hover:bg-slate-50/70"
                              }
                            >
                              <td className="px-3.5 py-2 text-slate-500 font-mono text-[11px] whitespace-nowrap">
                                {g.academicYear} • {g.termCode}
                              </td>
                              <td className="px-3 py-2 font-mono font-bold text-slate-900 whitespace-nowrap">
                                {g.courseCode}
                              </td>
                              <td className="px-3.5 py-2 font-medium text-slate-800">
                                {g.courseName}
                              </td>
                              <td className="px-2 py-2 text-center font-mono text-slate-700">
                                {g.credits}
                              </td>
                              <td className="px-2 py-2 text-center font-mono font-bold">
                                {g.score10 != null ? Number(g.score10).toFixed(1) : "—"}
                              </td>
                              <td className="px-2 py-2 text-center font-mono font-bold">
                                {g.score4 != null ? Number(g.score4).toFixed(1) : "—"}
                              </td>
                              <td className="px-2 py-2 text-center font-mono font-extrabold">
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
                              <td className="px-3.5 py-2 text-right whitespace-nowrap">
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
        </div>
      )}

      {/* ============================================================ */}
      {/* 4. LOG KỸ THUẬT DÀNH CHO CÁN BỘ QUẢN TRỊ (COLLAPSIBLE) */}
      {/* ============================================================ */}
      <div className="pt-2 border-t border-slate-100">
        <button
          type="button"
          onClick={() => setShowTechnicalAudit(!showTechnicalAudit)}
          className="flex items-center justify-between w-full rounded-lg bg-slate-50 hover:bg-slate-100 px-3 py-1.5 text-xs font-medium text-slate-500 transition cursor-pointer"
        >
          <span className="flex items-center gap-1.5">
            <Info size={13} className="text-slate-400" />
            <span>Đối soát quy tắc CTĐT & log kỹ thuật</span>
          </span>
          {showTechnicalAudit ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
        </button>

        {showTechnicalAudit && (
          <div className="mt-2 rounded-lg border border-slate-200 bg-slate-50/70 p-3 text-xs text-slate-600 space-y-2">
            <p className="font-semibold text-slate-800">Các quy tắc hệ thống đã đối chiếu:</p>
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
                <p className="font-semibold text-amber-900">Cảnh báo dữ liệu CTĐT:</p>
                <ul className="list-disc pl-5 space-y-1 text-amber-900 text-[11px]">
                  {forecast.warnings.map((w, i) => (
                    <li key={i}>{w}</li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        )}
      </div>

      {/* ============================================================ */}
      {/* FOOTER: NÚT ĐÓNG MODAL */}
      {/* ============================================================ */}
      {onClose && (
        <div className="pt-3 border-t border-slate-100 flex justify-end">
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-slate-300 bg-white px-4 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 transition cursor-pointer"
          >
            Đóng cửa sổ
          </button>
        </div>
      )}
    </div>
  );
}
