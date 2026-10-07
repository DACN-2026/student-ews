"use client";

import TableAction from "@/components/ui/TableAction";
import { ClipboardPen, Eye, History, Play, type LucideIcon } from "lucide-react";
import TextLabel from "@/components/ui/TextLabel";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { apiFetch } from "@/lib/api-client";
import { useRouter } from "next/navigation";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, Legend,
} from "recharts";
import Tabs, { TabItem } from "@/components/ui/Tabs";
import FilterBar from "@/components/ui/FilterBar";
import DataTable, { Column } from "@/components/ui/DataTable";
import SlideOverDrawer from "@/components/ui/SlideOverDrawer";
import Modal from "@/components/ui/Modal";
import ConfirmDialog from "@/components/ui/ConfirmDialog";
import ForbiddenState from "@/components/ui/ForbiddenState";
import { useAuthStore } from "@/stores/authStore";
import { toast } from "@/components/ui/Toast";
import { formatHistoryDate, formatWarningHistoryEvent, type WarningHistoryEvent } from "@/lib/warning-history";

// ────────────────────────────────────────────────────────────────────────────
// TYPES
// ────────────────────────────────────────────────────────────────────────────

type ReportTab = "overview" | "queue" | "history";

type WarningBusinessStatus = "NORMAL" | "PARTIAL_NO_RISK" | "MONITORING" | "HIGH_RISK" | "VERIFY_REQUIRED" | "INSUFFICIENT_DATA";
type InterventionStatus = "OPEN" | "IN_PROGRESS" | "RESOLVED" | "ESCALATED" | "REOPENED";

interface InterventionCaseItem {
  caseId: string;
  episodeKey: string;
  student: {
    id: string;
    studentCode: string | null;
    fullName: string | null;
    classId: string | null;
    classCode: string | null;
    className: string | null;
    programCode: string | null;
  };
  latestBusinessStatus: WarningBusinessStatus | null;
  interventionStatus: InterventionStatus;
  latestWarningRunId: string | null;
  latestWarningResultId: string | null;
  assessmentAcademicTermId: string | null;
  lastDetectedAt: string | null;
  nextFollowUpAt: string | null;
  overdue: boolean;
  resolvedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

interface InterventionListResponse {
  items: InterventionCaseItem[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

interface InterventionSummary {
  total: number;
  open: number;
  inProgress: number;
  resolved: number;
  escalated: number;
  reopened: number;
  overdue: number;
  highRisk: number;
  verifyRequired: number;
  byClass?: Array<{
    classId: string;
    classCode: string | null;
    open: number;
    inProgress: number;
    overdue: number;
    highRisk: number;
    verifyRequired: number;
  }>;
}

interface WarningReason {
  reasonCode: string;
  severity: string;
  title: string | null;
  observedValue: string | number | null;
  thresholdValue: string | number | null;
  nearThreshold: boolean;
  thresholdBreached: boolean;
  sourceType: string | null;
  articleReference: string | null;
  notEvaluatedReason: string | null;
  details: Record<string, ApiData>;
}

interface InterventionCaseDetail {
  case: InterventionCaseItem;
  currentWarning: {
    resultId: string;
    businessStatus: string;
    regulatoryCoverage: string | null;
    ruleResults: ApiData;
    reasons: WarningReason[];
  } | null;
  history: WarningHistoryEvent[];
  activities: Array<{
    eventId: string;
    interventionType: string | null;
    occurredAt: string | null;
    content: string | null;
    result: string | null;
    note: string | null;
    nextFollowUpAt: string | null;
    actor: { userId: string; displayName: string | null } | null;
    createdAt: string;
  }>;
}

type WarningReport = {
  hasCompletedOfficialRun: boolean;
  evaluationState: { hasCompletedOfficialRun: boolean; persistedResultCount: number; persistedInsufficientDataCount: number; noPersistedResultCount: number };
  items: Array<Record<string, ApiData>>;
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
  counts: {
    students: number;
    evaluated: number;
    available: number;
    termGpaAvailable: number;
    cumulativeGpaAvailable: number;
    unassessed: number;
    high: number;
    medium: number;
    safe: number;
    businessStatus: Record<WarningBusinessStatus, number>;
  };
  policy: { name: string; displayName: string; evaluationScope: string; configured: boolean };
  latestPeriod: { academicTermId: string; label: string; academicYear: string; termCode: string; termGpaAvailable: number } | null;
  trend: Array<{ label: string; high: number; medium: number; evaluated: number; available: number; termGpaAvailable: number }>;
  classBreakdown: Array<{ classCode: string; className: string; totalStudents: number; evaluated: number; normal: number; partialNoRisk: number; monitoring: number; highRisk: number; verifyRequired: number; insufficientData: number; high: number; medium: number; warningStudents: number; warningRate: number }>;
  reportContext?: { hasCompletedOfficialRun: boolean; persistedResultCount: number; persistedInsufficientDataCount: number; noPersistedResultCount: number; isSummer: boolean; classification: string; participantStudents: number; scopedStudents: number; coverage: number; note: string | null };
  filterOptions?: { terms: Array<{ value: string; label: string; isSummer: boolean; gradesFinalizedAt: string | null }> };
};

// ────────────────────────────────────────────────────────────────────────────
// QD600 CONSTANTS
// ────────────────────────────────────────────────────────────────────────────

const QD600_ERROR_MESSAGES: Record<string, string> = {
  GRADES_NOT_FINALIZED: "Học kỳ chưa được xác nhận chốt điểm.",
  SUMMER_OFFICIAL_WARNING_NOT_ALLOWED: "Không thể chạy đợt cảnh báo chính thức cho kỳ hè.",
  QD600_POLICY_NOT_FOUND: "Không thể khởi tạo đợt đánh giá QĐ600 với cấu hình hiện tại.",
  FACULTY_SCOPE_UNAVAILABLE: "Tài khoản chưa được cấu hình phạm vi khoa.",
};

// ────────────────────────────────────────────────────────────────────────────
// BUSINESS LABEL MAPS
// ────────────────────────────────────────────────────────────────────────────

const BUSINESS_STATUS_LABELS: Record<string, string> = {
  NORMAL: "Bình thường",
  PARTIAL_NO_RISK: "Bình thường",
  MONITORING: "Cần chú ý",
  HIGH_RISK: "Nguy cơ cao",
  VERIFY_REQUIRED: "Nguy cơ cao",
  INSUFFICIENT_DATA: "Chưa đủ dữ liệu",
};

const BUSINESS_STATUS_STYLE: Record<string, { bg: string; text: string; border: string; dot: string }> = {
  NORMAL: { bg: "bg-emerald-50/60", text: "text-emerald-700", border: "border-emerald-200", dot: "bg-emerald-500" },
  PARTIAL_NO_RISK: { bg: "bg-emerald-50/60", text: "text-emerald-700", border: "border-emerald-200", dot: "bg-emerald-500" },
  MONITORING: { bg: "bg-amber-50/60", text: "text-amber-700", border: "border-amber-200", dot: "bg-amber-500" },
  HIGH_RISK: { bg: "bg-red-50/60", text: "text-red-700", border: "border-red-200", dot: "bg-red-500" },
  VERIFY_REQUIRED: { bg: "bg-red-50/60", text: "text-red-700", border: "border-red-200", dot: "bg-red-500" },
  INSUFFICIENT_DATA: { bg: "bg-slate-50", text: "text-slate-600", border: "border-slate-200", dot: "bg-slate-400" },
};

const INTERVENTION_STATUS_LABELS: Record<string, string> = {
  OPEN: "Chưa xử lý",
  IN_PROGRESS: "Đang xử lý",
  RESOLVED: "Hoàn tất",
  ESCALATED: "Đang xử lý",
  REOPENED: "Đang xử lý",
};

const INTERVENTION_STATUS_STYLE: Record<string, { bg: string; text: string; border: string }> = {
  OPEN: { bg: "bg-blue-50", text: "text-blue-700", border: "border-blue-200" },
  IN_PROGRESS: { bg: "bg-amber-50", text: "text-amber-700", border: "border-amber-200" },
  RESOLVED: { bg: "bg-emerald-50", text: "text-emerald-700", border: "border-emerald-200" },
  ESCALATED: { bg: "bg-amber-50", text: "text-amber-700", border: "border-amber-200" },
  REOPENED: { bg: "bg-amber-50", text: "text-amber-700", border: "border-amber-200" },
};

const INTERVENTION_TYPE_LABELS: Record<string, string> = {
  REMINDER: "Nhắc nhở",
  DIRECT_COUNSELING: "Tư vấn trực tiếp",
  CONTACT: "Liên hệ sinh viên",
  STUDY_PLAN_GUIDANCE: "Hướng dẫn kế hoạch học tập",
  OTHER: "Khác",
};

const ALLOWED_TRANSITIONS: Record<string, string[]> = {
  OPEN: ["IN_PROGRESS"],
  IN_PROGRESS: ["RESOLVED"],
  ESCALATED: ["RESOLVED"],
  RESOLVED: ["REOPENED"],
  REOPENED: ["RESOLVED"],
};

const TRANSITION_ACTION_LABELS: Record<string, string> = {
  IN_PROGRESS: "Bắt đầu xử lý",
  RESOLVED: "Đánh dấu hoàn tất",
  ESCALATED: "Chuyển cấp trên",
  REOPENED: "Mở lại can thiệp",
};

// ────────────────────────────────────────────────────────────────────────────
// UTILITY COMPONENTS
// ────────────────────────────────────────────────────────────────────────────

function BusinessStatusBadge({ status }: { status: string | null }) {
  const isVerify = status === "VERIFY_REQUIRED";
  const s = BUSINESS_STATUS_STYLE[status || ""] || BUSINESS_STATUS_STYLE.INSUFFICIENT_DATA;
  const label = BUSINESS_STATUS_LABELS[status || ""] || "Chưa xác định";
  const description = isVerify
    ? "Dữ liệu SEWS cho thấy sinh viên đã chạm một tiêu chí định lượng trong chính sách đang đánh giá; cần cán bộ kiểm tra trước khi có kết luận học vụ."
    : undefined;
  return (
    <TextLabel title={description} className={`inline-flex items-center gap-1.5    text-xs font-medium  ${s.bg} ${s.text} ${s.border}`}>

      <span>{label}</span>
      {isVerify && (
        <span className="text-[10px] opacity-75 font-normal ml-0.5" title="Cần xác minh">
          (Cần xác minh)
        </span>
      )}
    </TextLabel>
  );
}

function InterventionStatusBadge({ status }: { status: string }) {
  const s = INTERVENTION_STATUS_STYLE[status] || INTERVENTION_STATUS_STYLE.OPEN;
  const label = INTERVENTION_STATUS_LABELS[status] || status;
  return (
    <TextLabel className={`inline-flex items-center gap-1    text-[11px] font-semibold  ${s.bg} ${s.text} ${s.border}`}>
      {label}
    </TextLabel>
  );
}

function OverdueBadge() {
  return (
    <TextLabel className="inline-flex items-center gap-1 text-[11px] font-semibold text-red-700">

      Quá hạn theo dõi
    </TextLabel>
  );
}

function SummaryCard({ label, value, color = "slate", onClick }: { label: string; value: number; color?: string; onClick?: () => void }) {
  const colorMap: Record<string, string> = {
    blue: "border-blue-200 bg-blue-50/40 text-blue-700",
    amber: "border-amber-200 bg-amber-50/40 text-amber-700",
    red: "border-red-200 bg-red-50/40 text-red-700",
    green: "border-green-200 bg-green-50/40 text-green-700",
    slate: "border-slate-200 bg-slate-50/40 text-slate-700",
  };
  const cls = colorMap[color] || colorMap.slate;
  const Tag = onClick ? "button" : "div";
  return (
    <Tag
      type={onClick ? "button" : undefined}
      onClick={onClick}
      className={`text-left p-4 border rounded-2xl shadow-xs transition ${cls} ${onClick ? "hover:shadow-sm hover:-translate-y-0.5 active:translate-y-0 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-primary)]" : ""}`}
    >
      <span className="text-[10px] uppercase font-bold block tracking-wider">{label}</span>
      <span className="text-2xl font-bold font-mono mt-1 block">{value}</span>
    </Tag>
  );
}

function EmptyState({ message }: { message: string }) {
  return (
    <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50 py-14 text-center text-sm text-slate-500 flex flex-col items-center gap-2">
      <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="text-slate-300">
        <circle cx="12" cy="12" r="10" /><line x1="12" y1="8" x2="12" y2="12" /><line x1="12" y1="16" x2="12.01" y2="16" />
      </svg>
      <span>{message}</span>
    </div>
  );
}

function LoadingSkeleton({ rows = 4 }: { rows?: number }) {
  return (
    <div className="space-y-3">
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="h-16 rounded-xl bg-slate-100 animate-pulse" />
      ))}
    </div>
  );
}

const formatDateTime = (v?: string | null) => {
  if (!v) return "—";
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? String(v) : d.toLocaleString("vi-VN", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });
};

const formatDate = (v?: string | null) => {
  if (!v) return "—";
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? String(v) : d.toLocaleDateString("vi-VN");
};

function warningRuleRows(value: ApiData): Array<Record<string, ApiData>> {
  if (Array.isArray(value)) return value.filter((item) => item && typeof item === "object") as Array<Record<string, ApiData>>;
  if (value && typeof value === "object" && Array.isArray(value.rules)) {
    return value.rules.filter((item: ApiData) => item && typeof item === "object") as Array<Record<string, ApiData>>;
  }
  return [];
}

const LEGAL_BASIS_INFO: Record<string, { title: string; summary: string }> = {
  QD600_FAILED_CREDIT_RATIO: {
    title: "Điều 18 – Quyết định 600/QĐ-ĐHĐL (Cảnh báo học tập)",
    summary:
      "Điều 18 quy định cảnh báo vào cuối học kỳ chính nếu tín chỉ không đạt vượt quá 50% tín chỉ đã đăng ký trong kỳ. Hệ thống loại SHCD và học phần điều kiện khỏi tỷ lệ học thuật; VT được tính là chưa đạt.",
  },
  QD600_TERM_GPA: {
    title: "Điều 18 – Quyết định 600/QĐ-ĐHĐL (Điểm trung bình học kỳ)",
    summary:
      "Quy chế quy định sinh viên bị cảnh báo học tập nếu điểm trung bình học kỳ đạt dưới 0.80 đối với học kỳ đầu tiên, dưới 1.00 đối với các học kỳ tiếp theo; hoặc đạt dưới 1.10 trong hai học kỳ liên tiếp.",
  },
  QD600_TERM_GPA_FIRST_TERM: {
    title: "Điều 18 – Quyết định 600/QĐ-ĐHĐL (Điểm GPA học kỳ đầu)",
    summary:
      "Quy chế quy định sinh viên bị cảnh báo học tập nếu điểm trung bình học kỳ đạt dưới 0.80 đối với học kỳ đầu tiên của khóa học.",
  },
  QD600_CONSECUTIVE_TERM_GPA: {
    title: "Điều 18 – Quyết định 600/QĐ-ĐHĐL (GPA 2 học kỳ liên tiếp)",
    summary:
      "Quy chế quy định sinh viên bị cảnh báo học tập nếu điểm trung bình học kỳ đạt dưới 1.10 trong hai học kỳ liên tiếp.",
  },
  QD600_CUMULATIVE_GPA_BY_YEAR: {
    title: "Điều 18 – Quyết định 600/QĐ-ĐHĐL (Điểm trung bình tích lũy)",
    summary:
      "Quy chế quy định điểm trung bình tích lũy tối thiểu cần đạt theo từng năm đào tạo: Năm thứ nhất ≥ 1.20; Năm thứ hai ≥ 1.40; Năm thứ ba ≥ 1.60; Từ năm thứ tư trở đi ≥ 1.80.",
  },
  QD600_CUMULATIVE_GPA_NEAR_THRESHOLD: {
    title: "Điều 18 – Quyết định 600/QĐ-ĐHĐL (Tiệm cận ngưỡng tích lũy)",
    summary:
      "Hệ thống theo dõi các trường hợp có điểm GPA tích lũy gần sát ngưỡng cảnh báo theo năm học để sớm tư vấn và hỗ trợ sinh viên cải thiện kết quả.",
  },
  QD600_ACCUMULATED_DEBT_CREDITS: {
    title: "Điều 18 – Quyết định 600/QĐ-ĐHĐL (Tín chỉ nợ đọng)",
    summary:
      "Quy chế quy định sinh viên bị cảnh báo học tập nếu tổng số tín chỉ nợ đọng (các học phần bị điểm F chưa được học lại cải thiện hoặc học môn thay thế hợp lệ) vượt quá 24 tín chỉ.",
  },
  ACCUMULATED_DEBT_CREDIT_RISK: {
    title: "Ngưỡng theo dõi nợ tín chỉ của hệ thống",
    summary: "Nợ tích lũy 13–18 tín chỉ: Cần chú ý; từ 19 tín chỉ: Nguy cơ cao. Đạt đủ nhóm lựa chọn của chính học kỳ thì không còn nợ các môn tự chọn trong nhóm đó. Bù nợ của học kỳ khác cần môn thuộc danh sách tự chọn trong cùng khối CTĐT K44 và có tín chỉ đạt dư so với kế hoạch học kỳ. Học hè đạt lại môn tương ứng cũng giải quyết nợ; lịch sử F/VT được giữ nguyên. Ngưỡng cảnh báo theo Điều 18 QĐ600 vẫn là trên 24 tín chỉ.",
  },
  TRAINING_PROGRESS_CREDIT_DEFICIT: {
    title: "Quy định tiến độ đào tạo theo Khung CTĐT",
    summary:
      "Đánh giá mức độ tích lũy tín chỉ thực tế so với kế hoạch học tập chuẩn theo từng học kỳ. Chậm từ 4–11 tín chỉ thuộc mức 'Cần chú ý'; chậm từ 12 tín chỉ trở lên thuộc mức 'Nguy cơ cao' có nguy cơ kéo dài thời gian đào tạo hoặc quá hạn đào tạo tối đa.",
  },
};

function humanRuleName(code?: ApiData) {
  if (code === "QD600_TERM_GPA_FIRST_TERM") return "Điểm trung bình học kỳ đầu tiên";
  if (code === "QD600_CONSECUTIVE_TERM_GPA") return "Điểm trung bình 2 học kỳ liên tiếp";
  if (code === "QD600_FAILED_CREDIT_RATIO") return "Tỷ lệ tín chỉ không đạt trong học kỳ";
  if (code === "QD600_TERM_GPA") return "Điểm trung bình học kỳ (GPA)";
  if (code === "QD600_CUMULATIVE_GPA_BY_YEAR") return "Điểm trung bình tích lũy theo năm học";
  if (code === "QD600_CUMULATIVE_GPA_NEAR_THRESHOLD") return "GPA tích lũy tiệm cận ngưỡng cảnh báo";
  if (code === "QD600_ACCUMULATED_DEBT_CREDITS") return "Tín chỉ nợ tích lũy";
  if (code === "ACCUMULATED_DEBT_CREDIT_RISK") return "Mức theo dõi nợ tín chỉ tích lũy";
  if (code === "TRAINING_PROGRESS_CREDIT_DEFICIT") return "Tiến độ tín chỉ theo CTĐT";
  return "Tiêu chí quy chế";
}

function getLegalInfo(reason: WarningReason | { ruleCode?: string; details?: Record<string, ApiData> }) {
  const code = String(
    ("details" in reason && reason.details?.ruleCode) ||
    ("reasonCode" in reason && reason.reasonCode) ||
    ("ruleCode" in reason && reason.ruleCode) ||
    ""
  );
  if (code.includes("FAILED_CREDIT_RATIO")) return LEGAL_BASIS_INFO.QD600_FAILED_CREDIT_RATIO;
  if (code.includes("FIRST_TERM")) return LEGAL_BASIS_INFO.QD600_TERM_GPA_FIRST_TERM;
  if (code.includes("CONSECUTIVE")) return LEGAL_BASIS_INFO.QD600_CONSECUTIVE_TERM_GPA;
  if (code.includes("TERM_GPA")) return LEGAL_BASIS_INFO.QD600_TERM_GPA;
  if (code.includes("NEAR_THRESHOLD")) return LEGAL_BASIS_INFO.QD600_CUMULATIVE_GPA_NEAR_THRESHOLD;
  if (code.includes("CUMULATIVE_GPA")) return LEGAL_BASIS_INFO.QD600_CUMULATIVE_GPA_BY_YEAR;
  if (code.includes("ACCUMULATED_DEBT_RISK") || code === "ACCUMULATED_DEBT_CREDIT_RISK") return LEGAL_BASIS_INFO.ACCUMULATED_DEBT_CREDIT_RISK;
  if (code.includes("ACCUMULATED_DEBT")) return LEGAL_BASIS_INFO.QD600_ACCUMULATED_DEBT_CREDITS;
  if (code.includes("PROGRESS")) return LEGAL_BASIS_INFO.TRAINING_PROGRESS_CREDIT_DEFICIT;
  return {
    title: "Quy chế đào tạo hiện hành",
    summary: "Quy định chuẩn học vụ và tiến độ học tập áp dụng cho chương trình đào tạo đại học chính quy.",
  };
}

function getLegalBasisLabel(reason: WarningReason): string {
  const code = String(reason.details?.ruleCode || reason.reasonCode || "");
  if (code.includes("ACCUMULATED_DEBT_RISK") || code === "ACCUMULATED_DEBT_CREDIT_RISK") return "Ngưỡng theo dõi nợ tín chỉ của hệ thống";
  if (code.includes("PROGRESS")) return "Chuẩn tiến độ đào tạo của Trường";
  return "Điều 18 – Quyết định 600/QĐ-ĐHĐL";
}

function isRatioRule(reason: WarningReason): boolean {
  const code = String(reason.details?.ruleCode || reason.reasonCode || "");
  return code.includes("RATIO");
}

function formatThresholdDisplay(reason: WarningReason): string {
  const code = String(reason.details?.ruleCode || reason.reasonCode || "");
  const threshold = reason.thresholdValue;
  if (threshold === null || threshold === "") return "—";
  if (code.includes("CREDIT_RATIO")) return "> 50%";
  if (code.includes("PROGRESS") || code.includes("ACCUMULATED_DEBT_RISK") || code === "ACCUMULATED_DEBT_CREDIT_RISK") {
    const num = Number(threshold);
    return `từ ${num} tín chỉ`;
  }
  if (code.includes("GPA")) {
    return `< ${Number(threshold).toFixed(2)}`;
  }
  if (code.includes("ACCUMULATED_DEBT")) return `> ${Number(threshold)} tín chỉ`;
  return formatReasonValue(reason, threshold);
}

function getHumanReasonTitle(reason: WarningReason): string {
  const code = String(reason.details?.ruleCode || reason.reasonCode || "");
  if (code.includes("FAILED_CREDIT_RATIO")) return "Không đạt quá nhiều tín chỉ trong học kỳ";
  if (code.includes("FIRST_TERM") || code.includes("TERM_GPA")) return "Điểm trung bình học kỳ (GPA) thấp";
  if (code.includes("CONSECUTIVE")) return "Điểm trung bình học kỳ (GPA) thấp 2 kỳ liên tiếp";
  if (code.includes("CUMULATIVE_GPA")) return "Điểm trung bình tích lũy (GPA) dưới chuẩn năm học";
  if (code.includes("ACCUMULATED_DEBT")) return `Nợ tín chỉ tích lũy ${reason.observedValue ?? "—"} tín chỉ`;
  if (code.includes("PROGRESS")) {
    const observed = reason.observedValue;
    return observed !== null && observed !== undefined && observed !== ""
      ? `Chậm tiến độ học tập ${Number(observed)} tín chỉ`
      : "Chậm tiến độ học tập so với CTĐT";
  }
  if (reason.title && !reason.title.includes("Điều 18") && !reason.title.includes("TRAINING_")) {
    return reason.title;
  }
  return "Cảnh báo học tập";
}

function getHumanReasonExplanation(reason: WarningReason): string {
  if (reason.details?.explanation && typeof reason.details.explanation === "string" && !reason.details.explanation.includes("undefined")) {
    return reason.details.explanation;
  }
  const code = String(reason.details?.ruleCode || reason.reasonCode || "");
  if (code.includes("FAILED_CREDIT_RATIO")) {
    const val = Number(reason.observedValue);
    const pct = Number.isFinite(val) ? Math.round(val <= 1 ? val * 100 : val) : 100;
    return `${pct}% số tín chỉ đã đăng ký trong học kỳ chưa đạt. Mức cảnh báo theo quy định là trên 50%.`;
  }
  if (code.includes("PROGRESS")) {
    const deficit = Number(reason.observedValue || 0);
    const isRed = deficit >= 12;
    return `Chậm ${deficit} tín chỉ so với tiến độ chuẩn CTĐT đến kỳ hiện tại (mức ${isRed ? "nguy cơ cao: từ 12 TC" : "cần chú ý: từ 4 TC"}).`;
  }
  if (code.includes("TERM_GPA")) {
    return `Điểm trung bình học kỳ (${reason.observedValue ?? "—"}) chưa đạt mức chuẩn tối thiểu theo quy chế đào tạo.`;
  }
  if (code.includes("CUMULATIVE_GPA")) {
    return `Điểm trung bình tích lũy (${reason.observedValue ?? "—"}) chưa đạt mức chuẩn tối thiểu theo năm học.`;
  }
  return "Sinh viên có kết quả học vụ chạm hoặc vượt ngưỡng cảnh báo theo quy định.";
}

function getHumanUnEvaluatedExplanation(rule: Record<string, ApiData>): string {
  const explanation = String(rule.explanation || "");
  const code = String(rule.ruleCode || "");
  if (code.includes("ACCUMULATED_DEBT") || explanation.includes("semantics") || explanation.includes("Không cộng lịch sử")) {
    return "Cần đối chiếu lịch sử học lại môn rớt và môn tự chọn thay thế để xác định chính xác số tín chỉ F còn nợ đọng theo Điều 18.";
  }
  if (code.includes("TERM_GPA") && (explanation.includes("hệ 4") || explanation.includes("không có GPA") || explanation.includes("vắng thi"))) {
    return "Học kỳ đánh giá chỉ có học phần ghi nhận vắng thi (VT) hoặc chưa có điểm số hợp lệ để tính GPA học kỳ chính thức.";
  }
  return explanation || "Chưa đủ dữ liệu nguồn để đối chiếu tự động tiêu chí này.";
}

function formatReasonValue(reason: WarningReason, value: string | number | null) {
  if (value === null || value === "") return "—";
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return String(value);
  const code = String(reason.details?.ruleCode || reason.reasonCode || "");
  if (code.includes("CREDIT_RATIO")) return `${(numeric <= 1 ? numeric * 100 : numeric).toLocaleString("vi-VN", { maximumFractionDigits: 1 })}%`;
  if (code.includes("CREDIT")) return `${numeric.toLocaleString("vi-VN", { maximumFractionDigits: 1 })} tín chỉ`;
  return numeric.toLocaleString("vi-VN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function getActionCTA(status: string): { label: string; icon: LucideIcon; tone: "emerald" | "slate" } {
  switch (status) {
    case "OPEN": return { label: "Xử lý", icon: ClipboardPen, tone: "emerald" };
    case "IN_PROGRESS":
    case "REOPENED": return { label: "Tiếp tục", icon: Play, tone: "emerald" };
    case "ESCALATED": return { label: "Xem", icon: Eye, tone: "slate" };
    case "RESOLVED": return { label: "Xem lịch sử", icon: History, tone: "slate" };
    default: return { label: "Xem", icon: Eye, tone: "slate" };
  }
}

// ────────────────────────────────────────────────────────────────────────────
// PIE & BAR CHART TOOLTIP (kept from original)
// ────────────────────────────────────────────────────────────────────────────

type PieTooltipProps = {
  active?: boolean;
  payload?: Array<{ name?: string; value?: number; payload?: { name?: string; value?: number; color?: string } }>;
  totalStudents: number;
};

function WarningPieTooltip({ active, payload, totalStudents }: PieTooltipProps) {
  if (!active || !payload || !payload.length) return null;
  const entry = payload[0];
  const item = entry.payload;
  const name = item?.name || entry.name || "";
  const value = Number(item?.value ?? entry.value ?? 0);
  const color = item?.color || "#64748B";
  const total = totalStudents > 0 ? totalStudents : 1;
  const percent = ((value / total) * 100).toFixed(1);
  return (
    <div className="bg-white px-3.5 py-2.5 rounded-xl border border-slate-200 shadow-xl text-xs space-y-1.5 min-w-[180px] pointer-events-none">
      <div className="flex items-center gap-2">
        <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: color }} />
        <span className="font-semibold text-slate-800 leading-tight">{name}</span>
      </div>
      <div className="flex items-baseline justify-between gap-3 pt-1 border-t border-slate-100">
        <span className="text-slate-500 text-[11px]">Số sinh viên:</span>
        <span className="font-mono text-sm font-bold text-slate-900">{value} SV</span>
      </div>
      <div className="flex items-baseline justify-between gap-3 text-[11px] text-slate-500">
        <span>Tỷ lệ:</span>
        <span className="font-mono font-semibold text-slate-700">{percent}%</span>
      </div>
    </div>
  );
}

type TrendTooltipProps = {
  active?: boolean;
  payload?: Array<{ name?: string; value?: number; color?: string; payload?: { evaluated?: number; available?: number } }>;
  label?: string;
};

function WarningTrendTooltip({ active, payload, label }: TrendTooltipProps) {
  if (!active || !payload || !payload.length) return null;
  const evaluated = Number(payload[0]?.payload?.evaluated ?? 0);
  const available = Number(payload[0]?.payload?.available ?? 0);
  return (
    <div className="bg-white px-3.5 py-2.5 rounded-xl border border-slate-200 shadow-xl text-xs space-y-2 min-w-[180px] pointer-events-none">
      <div className="font-bold text-slate-900 pb-1 border-b border-slate-100 flex items-center justify-between">
        <span>{label}</span>
        <span className="text-[10px] text-slate-400 font-normal">Học kỳ</span>
      </div>
      <div className="space-y-1">
        {payload.map((entry) => (
          <div key={entry.name} className="flex items-center justify-between gap-3 text-[11px] text-slate-600">
            <div className="flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: entry.color }} />
              <span>{entry.name}</span>
            </div>
            <span className="font-mono font-bold text-slate-900">{entry.value} SV</span>
          </div>
        ))}
      </div>
      <div className="flex items-center justify-between gap-3 pt-1 border-t border-slate-100 text-[11px] text-slate-500">
        <span>Đủ dữ liệu phân loại</span>
        <span className="font-mono font-semibold text-slate-700">{evaluated} SV</span>
      </div>
      <div className="flex items-center justify-between gap-3 text-[11px] text-slate-500">
        <span>Có dữ liệu trong kỳ</span>
        <span className="font-mono font-semibold text-slate-700">{available} SV</span>
      </div>
    </div>
  );
}

// ────────────────────────────────────────────────────────────────────────────
// MAIN PAGE
// ────────────────────────────────────────────────────────────────────────────

export default function ReportsPage() {
  const router = useRouter();
  const { user, can, status: authStatus } = useAuthStore();
  const isClassAdvisor = user?.role === "CLASS_ADVISOR";
  const isFacultyManager = user?.role === "FACULTY_BOARD";
  const isSystemAdmin = user?.role === "SYSTEM_ADMIN";
  const canCalculateWarning = can("academic_warning.calculate");

  // Tab state
  const [activeTab, setActiveTab] = useState<ReportTab>("overview");

  // ─── OVERVIEW STATE ──────────────────────────────────────────────────────
  const [overviewLoading, setOverviewLoading] = useState(true);
  const [report, setReport] = useState<WarningReport | null>(null);
  const [loadError, setLoadError] = useState("");
  const [selectedTermId, setSelectedTermId] = useState("");
  const [summary, setSummary] = useState<InterventionSummary | null>(null);
  const [summaryLoading, setSummaryLoading] = useState(true);
  const [summaryError, setSummaryError] = useState("");
  const [reconcilingHistory, setReconcilingHistory] = useState(false);
  const [reconciliationError, setReconciliationError] = useState("");
  const reconciliationStarted = useRef(false);

  // Export state
  const [exporting, setExporting] = useState<"xlsx" | "pdf" | null>(null);
  const [exportError, setExportError] = useState("");

  // Warning Run modal state
  const [showRunModal, setShowRunModal] = useState(false);
  const [runSubmitting, setRunSubmitting] = useState(false);
  const [runError, setRunError] = useState("");
  const [runSuccess, setRunSuccess] = useState("");
  const [runTermId, setRunTermId] = useState("");
  const [confirmGradesFinalized, setConfirmGradesFinalized] = useState(false);

  // ─── QUEUE STATE ─────────────────────────────────────────────────────────
  const [queueData, setQueueData] = useState<InterventionListResponse | null>(null);
  const [queueLoading, setQueueLoading] = useState(false);
  const [queueError, setQueueError] = useState("");
  const [queuePage, setQueuePage] = useState(1);
  const [queueFilters, setQueueFilters] = useState<{
    status: string;
    businessStatus: string;
    classId: string;
    academicTermId: string;
    overdue: string;
    search: string;
  }>({ status: "", businessStatus: "", classId: "", academicTermId: "", overdue: "", search: "" });
  const [queueSearch, setQueueSearch] = useState("");
  const queueSearchDebounce = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ─── HISTORY STATE ───────────────────────────────────────────────────────
  const [historyData, setHistoryData] = useState<InterventionListResponse | null>(null);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyError, setHistoryError] = useState("");
  const [historyPage, setHistoryPage] = useState(1);
  const [historyFilters, setHistoryFilters] = useState<{
    businessStatus: string;
    classId: string;
    academicTermId: string;
    search: string;
  }>({ businessStatus: "", classId: "", academicTermId: "", search: "" });
  const [historySearch, setHistorySearch] = useState("");
  const historySearchDebounce = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ─── DRAWER STATE ────────────────────────────────────────────────────────
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [drawerCaseId, setDrawerCaseId] = useState<string | null>(null);
  const [drawerDetail, setDrawerDetail] = useState<InterventionCaseDetail | null>(null);
  const [drawerLoading, setDrawerLoading] = useState(false);
  const [drawerError, setDrawerError] = useState("");
  const [drawerErrorKind, setDrawerErrorKind] = useState<"" | "forbidden" | "not-found" | "api">("");

  // Drawer form
  const [showInterventionForm, setShowInterventionForm] = useState(false);
  const [interventionForm, setInterventionForm] = useState({
    interventionType: "REMINDER" as string,
    occurredAt: "",
    content: "",
    result: "",
    nextFollowUpAt: "",
  });
  const [formSubmitting, setFormSubmitting] = useState(false);

  // Status transition
  const [statusChanging, setStatusChanging] = useState(false);

  // Resolve confirmation
  const [showResolveConfirm, setShowResolveConfirm] = useState(false);
  const [resolveLoading, setResolveLoading] = useState(false);
  const [expandedLegalRule, setExpandedLegalRule] = useState<string | null>(null);

  // ────────────────────────────────────────────────────────────────────────
  // DATA LOADING
  // ────────────────────────────────────────────────────────────────────────

  const loadOverview = useCallback(async (termIdOverride?: string) => {
    await Promise.resolve();
    try {
      setOverviewLoading(true);
      setLoadError("");
      const params = new URLSearchParams({ pageSize: "20" });
      const termId = termIdOverride ?? selectedTermId;
      if (termId) params.set("academicTermId", termId);
      const response = await apiFetch(`/api/v1/reports/academic-warnings?${params.toString()}`);
      if (response.status === 403) throw new Error("403: Forbidden");
      if (!response.ok) throw new Error("Không thể tải dữ liệu cảnh báo học vụ");
      setReport(await response.json());
    } catch (error) {
      setLoadError(error instanceof Error ? error.message : "Không thể tải báo cáo");
    } finally {
      setOverviewLoading(false);
    }
  }, [selectedTermId]);

  const loadSummary = useCallback(async () => {
    await Promise.resolve();
    try {
      setSummaryLoading(true);
      setSummaryError("");
      const res = await apiFetch("/api/v1/academic-warnings/interventions/summary");
      if (res.status === 403) throw new Error("Không có quyền xem tổng hợp công việc can thiệp.");
      if (!res.ok) throw new Error("Không thể tải tổng hợp công việc can thiệp.");
      setSummary(await res.json());
    } catch (error) {
      setSummaryError(error instanceof Error ? error.message : "Không thể tải tổng hợp công việc can thiệp.");
    } finally {
      setSummaryLoading(false);
    }
  }, []);

  const loadQueue = useCallback(async (page: number, filters: typeof queueFilters) => {
    await Promise.resolve();
    try {
      setQueueLoading(true);
      setQueueError("");
      const params = new URLSearchParams({ page: String(page), pageSize: "20" });
      if (filters.status) params.set("status", filters.status);
      if (filters.businessStatus) params.set("businessStatus", filters.businessStatus);
      if (filters.classId) params.set("classId", filters.classId);
      if (filters.academicTermId) params.set("academicTermId", filters.academicTermId);
      if (filters.overdue === "true") params.set("overdue", "true");
      if (filters.search.trim()) params.set("search", filters.search.trim());
      const res = await apiFetch(`/api/v1/academic-warnings/interventions?${params.toString()}`);
      if (res.status === 403) throw new Error("Không có quyền xem danh sách can thiệp này.");
      if (!res.ok) throw new Error("Không thể tải danh sách can thiệp");
      setQueueData(await res.json());
    } catch (error) {
      setQueueError(error instanceof Error ? error.message : "Lỗi tải dữ liệu");
    } finally {
      setQueueLoading(false);
    }
  }, []);

  const loadHistory = useCallback(async (page: number, filters: typeof historyFilters) => {
    await Promise.resolve();
    try {
      setHistoryLoading(true);
      setHistoryError("");
      const params = new URLSearchParams({ page: String(page), pageSize: "20", status: "RESOLVED" });
      if (filters.businessStatus) params.set("businessStatus", filters.businessStatus);
      if (filters.classId) params.set("classId", filters.classId);
      if (filters.academicTermId) params.set("academicTermId", filters.academicTermId);
      if (filters.search.trim()) params.set("search", filters.search.trim());
      const res = await apiFetch(`/api/v1/academic-warnings/interventions?${params.toString()}`);
      if (res.status === 403) throw new Error("Không có quyền xem lịch sử can thiệp này.");
      if (!res.ok) throw new Error("Không thể tải lịch sử can thiệp");
      setHistoryData(await res.json());
    } catch (error) {
      setHistoryError(error instanceof Error ? error.message : "Lỗi tải dữ liệu");
    } finally {
      setHistoryLoading(false);
    }
  }, []);

  const loadDrawerDetail = useCallback(async (caseId: string) => {
    await Promise.resolve();
    try {
      setDrawerLoading(true);
      setDrawerError("");
      setDrawerErrorKind("");
      const res = await apiFetch(`/api/v1/academic-warnings/interventions/${caseId}`);
      if (res.status === 403) {
        setDrawerErrorKind("forbidden");
        throw new Error("Bạn không có quyền xem hồ sơ can thiệp này.");
      }
      if (res.status === 404) {
        setDrawerErrorKind("not-found");
        throw new Error("Không tìm thấy hồ sơ can thiệp hoặc hồ sơ nằm ngoài phạm vi dữ liệu của bạn.");
      }
      if (!res.ok) throw new Error("Lỗi tải chi tiết can thiệp");
      setDrawerDetail(await res.json());
    } catch (error) {
      setDrawerErrorKind((current) => current || "api");
      setDrawerError(error instanceof Error ? error.message : "Lỗi tải dữ liệu");
    } finally {
      setDrawerLoading(false);
    }
  }, []);

  // ─── EFFECTS ─────────────────────────────────────────────────────────────
  useEffect(() => {
    if (authStatus === "idle" || authStatus === "loading" || reconciliationStarted.current) return;
    reconciliationStarted.current = true;
    queueMicrotask(() => void (async () => {
      if (canCalculateWarning) {
        try {
          setReconcilingHistory(true);
          setReconciliationError("");
          const response = await apiFetch("/api/v1/academic-warnings/reconcile", { method: "POST" });
          const payload = await response.json().catch(() => null);
          if (!response.ok) {
            throw new Error(payload?.error?.message || "Không thể tự động đồng bộ lịch sử cảnh báo.");
          }
        } catch (error) {
          setReconciliationError(error instanceof Error ? error.message : "Không thể tự động đồng bộ lịch sử cảnh báo.");
        } finally {
          setReconcilingHistory(false);
        }
      }
      await Promise.all([loadOverview(), loadSummary()]);
    })());
  }, [authStatus, canCalculateWarning, loadOverview, loadSummary]);

  useEffect(() => {
    if (activeTab === "queue") queueMicrotask(() => void loadQueue(queuePage, queueFilters));
  }, [activeTab, queuePage, queueFilters, loadQueue]);

  useEffect(() => {
    if (activeTab === "history") queueMicrotask(() => void loadHistory(historyPage, historyFilters));
  }, [activeTab, historyPage, historyFilters, loadHistory]);

  useEffect(() => {
    if (drawerCaseId) queueMicrotask(() => void loadDrawerDetail(drawerCaseId));
  }, [drawerCaseId, loadDrawerDetail]);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const requestedTab = params.get("tab");
    const requestedCaseId = params.get("caseId");
    queueMicrotask(() => {
      if (requestedTab === "overview" || requestedTab === "queue" || requestedTab === "history") {
        setActiveTab(requestedTab);
      }
      if (requestedCaseId && /^[0-9a-f-]{36}$/i.test(requestedCaseId)) {
        setDrawerCaseId(requestedCaseId);
        setDrawerOpen(true);
      }
    });
  }, []);

  useEffect(() => () => {
    if (queueSearchDebounce.current) clearTimeout(queueSearchDebounce.current);
    if (historySearchDebounce.current) clearTimeout(historySearchDebounce.current);
  }, []);

  // ─── HANDLERS ────────────────────────────────────────────────────────────

  const openDrawer = (caseId: string) => {
    setDrawerCaseId(caseId);
    setDrawerDetail(null);
    setDrawerError("");
    setDrawerErrorKind("");
    setShowInterventionForm(false);
    setDrawerOpen(true);
  };

  const closeDrawer = () => {
    setDrawerOpen(false);
    setDrawerCaseId(null);
    setDrawerDetail(null);
    setShowInterventionForm(false);
    setExpandedLegalRule(null);
    const params = new URLSearchParams(window.location.search);
    if (params.has("caseId")) {
      params.delete("caseId");
      window.history.replaceState(null, "", `${window.location.pathname}${params.size ? `?${params.toString()}` : ""}`);
    }
  };

  const refreshDrawerAndList = async () => {
    if (drawerCaseId) await loadDrawerDetail(drawerCaseId);
    void loadSummary();
    if (activeTab === "queue") void loadQueue(queuePage, queueFilters);
    if (activeTab === "history") void loadHistory(historyPage, historyFilters);
  };

  const handleStatusChange = async (newStatus: string) => {
    if (!drawerCaseId) return;
    if (newStatus === "RESOLVED") {
      setShowResolveConfirm(true);
      return;
    }
    try {
      setStatusChanging(true);
      const res = await apiFetch(`/api/v1/academic-warnings/interventions/${drawerCaseId}/status`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: newStatus }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => null);
        throw new Error(data?.error?.message || "Không thể cập nhật trạng thái");
      }
      toast.success(`Đã chuyển trạng thái sang ${INTERVENTION_STATUS_LABELS[newStatus] || newStatus}`);
      await refreshDrawerAndList();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Lỗi cập nhật trạng thái");
    } finally {
      setStatusChanging(false);
    }
  };

  const handleResolve = async () => {
    if (!drawerCaseId) return;
    try {
      setResolveLoading(true);
      const res = await apiFetch(`/api/v1/academic-warnings/interventions/${drawerCaseId}/status`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "RESOLVED" }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => null);
        throw new Error(data?.error?.message || "Không thể hoàn tất can thiệp");
      }
      toast.success("Đã hoàn tất hoạt động can thiệp");
      setShowResolveConfirm(false);
      await refreshDrawerAndList();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Lỗi hoàn tất can thiệp");
    } finally {
      setResolveLoading(false);
    }
  };

  const handleSubmitIntervention = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!drawerCaseId || !interventionForm.content.trim() || !interventionForm.occurredAt) return;
    try {
      setFormSubmitting(true);
      const body: Record<string, ApiData> = {
        interventionType: interventionForm.interventionType,
        occurredAt: new Date(interventionForm.occurredAt).toISOString(),
        content: interventionForm.content.trim(),
        result: interventionForm.result.trim() || null,
      };
      if (interventionForm.nextFollowUpAt) {
        body.nextFollowUpAt = new Date(interventionForm.nextFollowUpAt).toISOString();
      }
      const res = await apiFetch(`/api/v1/academic-warnings/interventions/${drawerCaseId}/activities`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => null);
        throw new Error(data?.error?.message || "Không thể lưu hoạt động can thiệp");
      }
      toast.success("Đã lưu hoạt động can thiệp");
      setShowInterventionForm(false);
      setInterventionForm({ interventionType: "REMINDER", occurredAt: "", content: "", result: "", nextFollowUpAt: "" });
      await refreshDrawerAndList();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Lỗi lưu can thiệp");
    } finally {
      setFormSubmitting(false);
    }
  };

  const runTerms = report?.filterOptions?.terms || [];
  const runTerm = runTerms.find((term) => term.value === runTermId) || null;

  const openRunModal = () => {
    const finalizedTerms = runTerms.filter((term) => term.gradesFinalizedAt);
    const initialTerm = runTerms.find((term) => term.value === selectedTermId)
      || finalizedTerms[0]
      || null;
    setRunTermId(initialTerm?.value || "");
    setConfirmGradesFinalized(false);
    setShowRunModal(true);
    setRunError("");
    setRunSuccess("");
  };

  const handleSubmitRun = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!runTerm) {
      setRunError("Vui lòng chọn học kỳ chính cần đánh giá.");
      return;
    }
    if (!runTerm.gradesFinalizedAt && !confirmGradesFinalized) {
      setRunError("Bạn phải xác nhận điểm của học kỳ đã được chốt chính thức trước khi đánh giá.");
      return;
    }
    try {
      setRunSubmitting(true);
      setRunError("");
      setRunSuccess("");
      const res = await apiFetch(`/api/v1/academic-warnings/terms/${runTerm.value}/retry`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ confirmGradesFinalized: !runTerm.gradesFinalizedAt }),
      });
      const data = await res.json();
      if (!res.ok) {
        const errorCode = data?.error?.code || "";
        const mapped = QD600_ERROR_MESSAGES[errorCode];
        throw new Error(mapped || data.error?.message || "Không thể khởi chạy đợt cảnh báo");
      }
      const evaluation = data.evaluation || data;
      setSelectedTermId(runTerm.value);
      setRunSuccess(
        evaluation.failed > 0
          ? `Đã xử lý ${evaluation.scopeCount} phạm vi; ${evaluation.failed} phạm vi chưa thành công.`
          : `Đã xử lý ${evaluation.scopeCount} phạm vi nội bộ; hoàn tất ${evaluation.completed}, bỏ qua an toàn ${evaluation.skipped}.`,
      );
      setTimeout(() => { setShowRunModal(false); setRunSuccess(""); void loadOverview(runTerm.value); void loadSummary(); }, 1200);
    } catch (err) {
      setRunError(err instanceof Error ? err.message : "Lỗi khi chạy đợt cảnh báo");
    } finally {
      setRunSubmitting(false);
    }
  };

  const handleExport = async (format: "xlsx" | "pdf") => {
    try {
      setExporting(format);
      setExportError("");
      const type = "warnings";
      const params = new URLSearchParams({ format, type });
      if (selectedTermId) params.set("academicTermId", selectedTermId);
      const response = await apiFetch(`/api/v1/reports/export?${params.toString()}`);
      if (!response.ok) { const p = await response.json().catch(() => null); throw new Error(p?.error?.message || "Không thể tạo file báo cáo"); }
      const url = URL.createObjectURL(await response.blob());
      const link = document.createElement("a");
      link.href = url;
      const disposition = response.headers.get("content-disposition") || "";
      const encodedName = disposition.match(/filename\*=UTF-8''([^;]+)/i)?.[1];
      link.download = encodedName ? decodeURIComponent(encodedName) : `bao_cao.${format}`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
    } catch (error) {
      setExportError(error instanceof Error ? error.message : "Không thể xuất báo cáo");
    } finally {
      setExporting(null);
    }
  };

  // ────────────────────────────────────────────────────────────────────────
  // QUEUE SEARCH with debounce
  // ────────────────────────────────────────────────────────────────────────
  const handleQueueSearch = (value: string) => {
    setQueueSearch(value);
    if (queueSearchDebounce.current) clearTimeout(queueSearchDebounce.current);
    queueSearchDebounce.current = setTimeout(() => {
      setQueueFilters(prev => ({ ...prev, search: value }));
      setQueuePage(1);
    }, 350);
  };

  // ────────────────────────────────────────────────────────────────────────
  // TABS CONFIG
  // ────────────────────────────────────────────────────────────────────────

  const tabItems: TabItem[] = useMemo(() => {
    const items: TabItem[] = [
      {
        id: "overview",
        label: "Tổng quan",
        icon: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="3" width="7" height="7" rx="1" /><rect x="14" y="3" width="7" height="7" rx="1" /><rect x="3" y="14" width="7" height="7" rx="1" /><rect x="14" y="14" width="7" height="7" rx="1" /></svg>,
      },
      {
        id: "queue",
        label: "Cần can thiệp",
        badge: summary ? (summary.open + summary.inProgress + summary.escalated + summary.reopened) || undefined : undefined,
        icon: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><polyline points="14 2 14 8 20 8" /><line x1="16" y1="13" x2="8" y2="13" /><line x1="16" y1="17" x2="8" y2="17" /></svg>,
      },
      {
        id: "history",
        label: "Lịch sử can thiệp",
        icon: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10" /><polyline points="12 6 12 12 16 14" /></svg>,
      },
    ];
    return items;
  }, [summary]);

  // ────────────────────────────────────────────────────────────────────────
  // AUTH CHECK
  // ────────────────────────────────────────────────────────────────────────

  if (authStatus !== "loading" && authStatus !== "idle" && !can("academic_warning.read")) {
    return <ForbiddenState requiredPermission="academic_warning.read" />;
  }
  if (loadError && loadError.includes("403")) {
    return <ForbiddenState requiredPermission="academic_warning.read" />;
  }

  // ────────────────────────────────────────────────────────────────────────
  // HELPERS
  // ────────────────────────────────────────────────────────────────────────

  const pageTitle = isClassAdvisor
    ? `Cảnh báo học tập • Lớp ${user?.className || ""}`
    : isFacultyManager
    ? "Cảnh báo học tập Khoa"
    : "Cảnh báo học tập";

  const scopeBadgeText = isClassAdvisor
    ? null
    : isFacultyManager
    ? `Phạm vi: ${user?.facultyCode ? `Khoa ${user.facultyCode}` : "Phạm vi Khoa"}`
    : null;

  const classOptions = (() => {
    const options = new Map<string, string>();
    summary?.byClass?.forEach((item) => {
      if (item.classId) options.set(item.classId, item.classCode || item.classId);
    });
    report?.classBreakdown?.forEach((item) => {
      if (item.classCode && ![...options.values()].includes(item.classCode)) {
        options.set(item.classCode, item.classCode);
      }
    });
    queueData?.items.forEach((item) => {
      const value = item.student.classId || item.student.classCode;
      if (value) options.set(value, item.student.classCode || item.student.className || value);
    });
    historyData?.items.forEach((item) => {
      const value = item.student.classId || item.student.classCode;
      if (value) options.set(value, item.student.classCode || item.student.className || value);
    });
    return [...options.entries()]
      .map(([value, label]) => ({ value, label }))
      .sort((left, right) => left.label.localeCompare(right.label, "vi"));
  })();

  const academicTermOptions = (report?.filterOptions?.terms || []).map((term) => ({
    value: term.value,
    label: term.label,
  }));

  const advisorClassCount = report?.classBreakdown?.length ?? (user?.className ? 1 : 0);
  const hideClassContext = isClassAdvisor && advisorClassCount <= 1;
  const activeQueueFilterCount = Object.entries(queueFilters)
    .filter(([key, value]) => key !== "search" && Boolean(value)).length + (queueFilters.search ? 1 : 0);
  const activeHistoryFilterCount = Object.entries(historyFilters)
    .filter(([key, value]) => key !== "search" && Boolean(value)).length + (historyFilters.search ? 1 : 0);

  const drawerCase = drawerDetail?.case;
  const drawerWarning = drawerDetail?.currentWarning;
  const canCreateDrawerActivity = Boolean(
    drawerCase &&
    drawerCase.interventionStatus !== "RESOLVED" &&
    can("academic_warning.action.create") &&
    (isSystemAdmin || isClassAdvisor),
  );
  const canUpdateDrawerStatus = Boolean(
    drawerCase &&
    drawerCase.interventionStatus !== "RESOLVED" &&
    can("academic_warning.action.update") &&
    (isSystemAdmin || isClassAdvisor),
  );

  const totalStudents = report?.counts.students ?? 0;
  const evaluatedStudents = report?.counts.evaluated ?? 0;
  const highRiskCount = report?.counts.high ?? 0;
  const monitoringCount = report?.counts.medium ?? 0;
  const normalCount = Math.max(0, evaluatedStudents - highRiskCount - monitoringCount);
  const insufficientCount = Math.max(0, totalStudents - evaluatedStudents);

  const distributionChartData = (() => {
    if (!report) return [];
    const data = [
      { name: "Bình thường", value: normalCount, color: "#16A34A" },
      { name: "Cần chú ý", value: monitoringCount, color: "#F59E0B" },
      { name: "Nguy cơ cao", value: highRiskCount, color: "#DC2626" },
    ];
    if (insufficientCount > 0) {
      data.push({ name: "Chưa đủ dữ liệu", value: insufficientCount, color: "#94A3B8" });
    }
    return data.filter((d) => d.value > 0);
  })();

  // ────────────────────────────────────────────────────────────────────────
  // RENDER
  // ────────────────────────────────────────────────────────────────────────

  return (
    <div className="p-6 space-y-5 max-w-7xl mx-auto">
      {/* Page Header */}
      <header className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 mb-1 flex-wrap">
            <span className="w-2.5 h-2.5 rounded-full bg-[var(--color-primary)]" />
            <span className="text-xs font-semibold text-[var(--color-primary)] uppercase tracking-wider">
              {report?.latestPeriod ? `Kỳ đánh giá: ${report.latestPeriod.label}` : "Hệ thống cảnh báo sớm"}
            </span>
            {scopeBadgeText && (
              <>
                <span className="text-slate-300">•</span>
                <TextLabel className="inline-flex items-center text-xs font-medium text-emerald-700 lowercase first-letter:uppercase">
                  {scopeBadgeText}
                </TextLabel>
              </>
            )}
          </div>
          <h1 className="text-2xl sm:text-3xl font-bold text-slate-900 tracking-tight" style={{ fontFamily: "Be Vietnam Pro, sans-serif" }}>{pageTitle}</h1>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {canCalculateWarning && (
            <button type="button" onClick={openRunModal} className="px-3.5 py-2 border border-slate-200 bg-white hover:bg-slate-50 active:scale-[0.98] text-slate-700 text-xs font-semibold rounded-xl shadow-xs transition flex items-center gap-1.5 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><polygon points="5 3 19 12 5 21 5 3" /></svg>
              <span>{report?.reportContext?.hasCompletedOfficialRun ? "Chạy lại đánh giá" : "Khởi tạo đánh giá"}</span>
            </button>
          )}
        </div>
      </header>

      {/* Tabs */}
      <Tabs tabs={tabItems} activeTab={activeTab} onChange={(id) => setActiveTab(id as ReportTab)} />

      {/* ═══════════════════════════════════════════════════════════════════
          TAB 1: TỔNG QUAN
      ═══════════════════════════════════════════════════════════════════ */}
      {activeTab === "overview" && (
        <div className="space-y-6">
          {reconcilingHistory && (
            <div role="status" className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-xs text-emerald-800">
              Đang tự động đối soát các học kỳ chính đã qua có dữ liệu điểm và cập nhật lịch sử cảnh báo…
            </div>
          )}
          {!reconcilingHistory && reconciliationError && (
            <div role="alert" className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-xs text-amber-900">
              Tự động đồng bộ chưa hoàn tất: {reconciliationError}
            </div>
          )}

          {overviewLoading ? (
            <div className="space-y-5" aria-label="Đang tải báo cáo">
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3.5">
                {[0, 1, 2].map((i) => (
                  <div key={i} className="h-28 rounded-2xl bg-slate-100 animate-pulse" />
                ))}
              </div>
              <div className="h-72 rounded-2xl bg-slate-100 animate-pulse" />
            </div>
          ) : !report ? (
            <div className="rounded-2xl border border-red-200 bg-red-50 p-6 text-sm text-red-800">
              {loadError || "Chưa có dữ liệu báo cáo."}
            </div>
          ) : (
            <>
              {/* Policy & Coverage Banner (Subtle administrative metadata) */}
              <div className="rounded-xl border border-slate-200 bg-white p-4 text-xs text-slate-600 shadow-xs flex flex-col md:flex-row md:items-center md:justify-between gap-3">
                <div className="space-y-1">
                  <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                    <span className="font-bold text-slate-800">Chính sách cảnh báo:</span>
                    <span className="font-medium text-slate-700">QĐ 600/QĐ-ĐHĐL — Điều 18 + Tiến độ CTĐT</span>
                    <span className="text-slate-300">•</span>
                    <span className="font-semibold text-slate-600">Phạm vi:</span>
                    <TextLabel className="inline-flex items-center text-[11px] font-medium text-slate-700">
                      {report.policy?.evaluationScope || "Đánh giá một phần"}
                    </TextLabel>
                  </div>
                  <p className="text-slate-500 text-[11px] leading-relaxed">
                    Mục tiêu: Phát hiện sớm sinh viên có nguy cơ học vụ hoặc chậm tiến độ tín chỉ để GVCN/CVHT can thiệp sớm.
                  </p>
                </div>
                {can("academic_warning.policy.manage") && (
                  <button
                    type="button"
                    onClick={() => router.push("/settings")}
                    className="shrink-0 inline-flex items-center gap-1.5 px-3 py-1.5 bg-white hover:bg-slate-50 text-slate-700 border border-slate-200 rounded-lg font-semibold text-xs transition cursor-pointer shadow-2xs self-start md:self-center"
                  >
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <circle cx="12" cy="12" r="3" />
                      <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z" />
                    </svg>
                    <span>Cấu hình chính sách</span>
                  </button>
                )}
              </div>

              {/* Term selection and Export controls */}
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex flex-wrap items-center gap-2">
                  <label className="sr-only" htmlFor="report-term">Kỳ thống kê</label>
                  <select
                    id="report-term"
                    value={selectedTermId}
                    onChange={(e) => setSelectedTermId(e.target.value)}
                    className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-primary)]"
                  >
                    <option value="">Kết quả gần nhất</option>
                    {(report.filterOptions?.terms || []).map((t) => (
                      <option key={t.value} value={t.value}>{t.label}</option>
                    ))}
                  </select>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    disabled={Boolean(exporting)}
                    onClick={() => void handleExport("xlsx")}
                    className="px-3.5 py-2 border border-slate-200 text-slate-700 text-xs font-semibold rounded-xl hover:bg-slate-50 active:scale-[0.98] transition bg-white disabled:opacity-50 cursor-pointer shadow-2xs"
                  >
                    {exporting === "xlsx" ? "Đang tạo..." : "Xuất Excel"}
                  </button>
                  <button
                    type="button"
                    disabled={Boolean(exporting)}
                    onClick={() => void handleExport("pdf")}
                    className="px-3.5 py-2 bg-[var(--color-primary)] text-white text-xs font-semibold rounded-xl hover:opacity-90 active:scale-[0.98] transition disabled:opacity-50 cursor-pointer shadow-2xs"
                  >
                    {exporting === "pdf" ? "Đang tạo..." : "Xuất PDF"}
                  </button>
                </div>
              </div>
              {exportError && (
                <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-xs text-red-800">
                  {exportError}
                </div>
              )}

              {!report.hasCompletedOfficialRun && (
                <div role="status" className="rounded-2xl border border-slate-200 bg-white px-5 py-6 shadow-xs">
                  <div className="flex items-start gap-3">
                    <span className="mt-0.5 grid h-9 w-9 shrink-0 place-items-center rounded-full bg-slate-100 text-slate-600" aria-hidden="true">
                      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="9" /><path d="M12 8v4" /><path d="M12 16h.01" /></svg>
                    </span>
                    <div>
                      <h2 className="text-sm font-bold text-slate-900">Chưa có đợt đánh giá cảnh báo học tập nào được hoàn tất.</h2>
                      <p className="mt-1 text-xs leading-5 text-slate-600">
                        Hệ thống đang tự đối soát các học kỳ chính đã qua có dữ liệu điểm. Kết quả sẽ được lưu theo học kỳ, năm học và xuất hiện trong lịch sử của từng sinh viên.
                      </p>
                    </div>
                  </div>
                </div>
              )}

              {/* B. EVALUATION SUMMARY */}
              {report.hasCompletedOfficialRun && (
                <section aria-label="Tổng hợp kết quả đánh giá" className="space-y-3">
                  <div className="flex items-baseline justify-between gap-3">
                    <div className="text-xs text-slate-500 font-medium">
                      <span className="font-bold text-slate-900 font-mono text-sm">{evaluatedStudents}</span> / <span className="font-mono">{totalStudents}</span> sinh viên đã được đánh giá
                      {totalStudents > 0 && (
                        <span className="text-slate-400 ml-1.5 font-mono">
                          ({Math.round((evaluatedStudents / totalStudents) * 100)}%)
                        </span>
                      )}
                    </div>
                  </div>

                  {/* ONLY 3 primary KPI cards */}
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3.5">
                    {/* 🟢 Bình thường */}
                    <div className="p-4 bg-emerald-50/40 border border-emerald-200/80 rounded-2xl shadow-xs transition">
                      <div className="flex items-center gap-2 mb-1.5">
                        <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 shrink-0" />
                        <span className="text-xs font-semibold text-emerald-800 tracking-wide">Bình thường</span>
                      </div>
                      <div className="text-2xl sm:text-3xl font-bold font-mono text-emerald-700 tracking-tight">
                        {normalCount}
                      </div>
                      <div className="mt-1 text-[11px] text-emerald-600/90 font-medium">
                        {evaluatedStudents > 0 ? `${Math.round((normalCount / evaluatedStudents) * 100)}% số SV đã đánh giá` : "—"}
                      </div>
                    </div>

                    {/* 🟡 Cần chú ý */}
                    <button
                      type="button"
                      onClick={() => {
                        setQueueFilters((prev) => ({ ...prev, businessStatus: "MONITORING" }));
                        setActiveTab("queue");
                      }}
                      className="text-left p-4 bg-amber-50/40 border border-amber-200/80 rounded-2xl shadow-xs transition hover:shadow-sm hover:-translate-y-0.5 active:translate-y-0 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-500 group"
                    >
                      <div className="flex items-center justify-between gap-2 mb-1.5">
                        <div className="flex items-center gap-2">
                          <span className="w-2.5 h-2.5 rounded-full bg-amber-500 shrink-0" />
                          <span className="text-xs font-semibold text-amber-800 tracking-wide">Cần chú ý</span>
                        </div>
                        <span className="text-[10px] text-amber-600 font-semibold group-hover:underline flex items-center gap-0.5">
                          Xem DS →
                        </span>
                      </div>
                      <div className="text-2xl sm:text-3xl font-bold font-mono text-amber-700 tracking-tight">
                        {monitoringCount}
                      </div>
                      <div className="mt-1 text-[11px] text-amber-600/90 font-medium">
                        {evaluatedStudents > 0 ? `${Math.round((monitoringCount / evaluatedStudents) * 100)}% số SV đã đánh giá` : "—"}
                      </div>
                    </button>

                    {/* 🔴 Nguy cơ cao */}
                    <button
                      type="button"
                      onClick={() => {
                        setQueueFilters((prev) => ({ ...prev, businessStatus: "HIGH_RISK" }));
                        setActiveTab("queue");
                      }}
                      className="text-left p-4 bg-red-50/40 border border-red-200/80 rounded-2xl shadow-xs transition hover:shadow-sm hover:-translate-y-0.5 active:translate-y-0 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-500 group"
                    >
                      <div className="flex items-center justify-between gap-2 mb-1.5">
                        <div className="flex items-center gap-2">
                          <span className="w-2.5 h-2.5 rounded-full bg-red-500 shrink-0" />
                          <span className="text-xs font-semibold text-red-800 tracking-wide">Nguy cơ cao</span>
                        </div>
                        <span className="text-[10px] text-red-600 font-semibold group-hover:underline flex items-center gap-0.5">
                          Xem DS →
                        </span>
                      </div>
                      <div className="text-2xl sm:text-3xl font-bold font-mono text-red-700 tracking-tight">
                        {highRiskCount}
                      </div>
                      <div className="mt-1 text-[11px] text-red-600/90 font-medium">
                        {evaluatedStudents > 0 ? `${Math.round((highRiskCount / evaluatedStudents) * 100)}% số SV đã đánh giá` : "—"}
                      </div>
                    </button>
                  </div>

                  {/* Small neutral notice for insufficient data */}
                  {insufficientCount > 0 && (
                    <TextLabel className="inline-flex items-center gap-2 text-xs text-slate-600 font-medium">

                      <span>
                        <strong className="font-mono font-semibold text-slate-800">{insufficientCount}</strong> sinh viên chưa đủ dữ liệu để đánh giá
                      </span>
                    </TextLabel>
                  )}
                </section>
              )}

              {/* C. CHARTS */}
              {report.hasCompletedOfficialRun && (
                <section className="grid grid-cols-1 lg:grid-cols-12 gap-5">
                  <div className="lg:col-span-5 bg-white rounded-2xl border border-slate-200 shadow-xs p-5">
                    <div className="flex items-center justify-between mb-4">
                      <div>
                        <h2 className="font-bold text-slate-900 text-sm" style={{ fontFamily: "Be Vietnam Pro, sans-serif" }}>
                          Phân bố mức cảnh báo
                        </h2>
                        <p className="text-xs text-slate-400">Theo {report.latestPeriod?.label || "kỳ gần nhất"}</p>
                      </div>
                    </div>
                    <div className="h-[230px] w-full">
                      <ResponsiveContainer width="100%" height="100%">
                        <PieChart>
                          <Pie
                            data={distributionChartData}
                            cx="50%"
                            cy="50%"
                            innerRadius={55}
                            outerRadius={85}
                            paddingAngle={3}
                            dataKey="value"
                          >
                            {distributionChartData.map((entry, i) => (
                              <Cell key={`cell-${i}`} fill={entry.color} />
                            ))}
                          </Pie>
                          <Tooltip content={<WarningPieTooltip totalStudents={report.counts.students} />} />
                          <Legend wrapperStyle={{ fontSize: 12 }} />
                        </PieChart>
                      </ResponsiveContainer>
                    </div>
                  </div>
                  <div className="lg:col-span-7 bg-white rounded-2xl border border-slate-200 shadow-xs p-5">
                    <div className="flex items-center justify-between mb-4">
                      <div>
                        <h2 className="font-bold text-slate-900 text-sm" style={{ fontFamily: "Be Vietnam Pro, sans-serif" }}>
                          Xu hướng cảnh báo theo học kỳ
                        </h2>
                        <p className="text-xs text-slate-400">Tập trung theo dõi các mức cần chú ý và nguy cơ cao</p>
                      </div>
                    </div>
                    <div className="h-[230px] w-full">
                      {report.trend.length ? (
                        <ResponsiveContainer width="100%" height="100%">
                          <BarChart data={report.trend} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                            <CartesianGrid strokeDasharray="3 3" stroke="#F1F5F9" />
                            <XAxis dataKey="label" tick={{ fontSize: 10, fill: "#64748B" }} tickLine={false} axisLine={false} />
                            <YAxis tick={{ fontSize: 11, fill: "#64748B" }} tickLine={false} axisLine={false} />
                            <Tooltip content={<WarningTrendTooltip />} />
                            <Legend wrapperStyle={{ fontSize: 11 }} />
                            <Bar dataKey="high" name="Nguy cơ cao" fill="#DC2626" radius={[3, 3, 0, 0]} />
                            <Bar dataKey="medium" name="Cần chú ý" fill="#F59E0B" radius={[3, 3, 0, 0]} />
                          </BarChart>
                        </ResponsiveContainer>
                      ) : (
                        <div className="h-full grid place-items-center text-xs text-slate-400">Chưa có dữ liệu GPA theo kỳ.</div>
                      )}
                    </div>
                  </div>
                </section>
              )}

              {/* E. INTERVENTION SUMMARY ("Tình hình can thiệp") */}
              {!summaryLoading && summary && (
                <section aria-label="Tình hình can thiệp" className="space-y-3 pt-2">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <h2 className="text-sm font-bold text-slate-900" style={{ fontFamily: "Be Vietnam Pro, sans-serif" }}>
                        Tình hình can thiệp
                      </h2>
                      <p className="text-[11px] text-slate-500">Tiến độ hỗ trợ sinh viên theo phạm vi lớp GVCN/CVHT đang quản lý</p>
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        setQueueFilters({ status: "", businessStatus: "", classId: "", academicTermId: "", overdue: "", search: "" });
                        setActiveTab("queue");
                      }}
                      className="text-xs font-semibold text-[var(--color-primary)] hover:underline flex items-center gap-1 cursor-pointer"
                    >
                      <span>Đến danh sách can thiệp</span>
                    </button>
                  </div>
                  <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
                    <SummaryCard
                      label="Tổng cần can thiệp"
                      value={summary.total}
                      color="slate"
                      onClick={() => {
                        setQueueFilters((prev) => ({ ...prev, status: "" }));
                        setActiveTab("queue");
                      }}
                    />
                    <SummaryCard
                      label="Chưa xử lý"
                      value={summary.open}
                      color="blue"
                      onClick={() => {
                        setQueueFilters((prev) => ({ ...prev, status: "OPEN" }));
                        setActiveTab("queue");
                      }}
                    />
                    <SummaryCard
                      label="Đang xử lý"
                      value={summary.inProgress + summary.reopened + summary.escalated}
                      color="amber"
                      onClick={() => {
                        setQueueFilters((prev) => ({ ...prev, status: "IN_PROGRESS" }));
                        setActiveTab("queue");
                      }}
                    />
                    <SummaryCard
                      label="Hoàn tất"
                      value={summary.resolved}
                      color="green"
                      onClick={() => setActiveTab("history")}
                    />
                    <SummaryCard
                      label="Quá hạn"
                      value={summary.overdue}
                      color="red"
                      onClick={() => {
                        setQueueFilters((prev) => ({ ...prev, overdue: "true" }));
                        setActiveTab("queue");
                      }}
                    />
                  </div>
                </section>
              )}
              {!summaryLoading && summaryError && (
                <div role="status" className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-xs text-amber-900">
                  {summaryError}
                </div>
              )}
              {summaryLoading && (
                <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
                  {[0, 1, 2, 3, 4].map((i) => (
                    <div key={i} className="h-20 rounded-2xl bg-slate-100 animate-pulse" />
                  ))}
                </div>
              )}

              {/* Faculty Manager: Can thiệp theo lớp */}
              {isFacultyManager && summary?.byClass && summary.byClass.length > 0 && (
                <section className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden">
                  <div className="p-4 border-b border-slate-100 bg-slate-50/60 flex items-center justify-between">
                    <div>
                      <h2 className="font-bold text-slate-900 text-sm" style={{ fontFamily: "Be Vietnam Pro, sans-serif" }}>
                        Can thiệp theo lớp
                      </h2>
                    </div>
                    <TextLabel className="text-xs font-semibold text-slate-600">
                      {summary.byClass.length} lớp
                    </TextLabel>
                  </div>
                  <div className="overflow-x-auto">
                    <table className="w-full text-left text-xs">
                      <thead>
                        <tr className="border-b border-slate-200 bg-slate-50/80 text-slate-500 font-semibold uppercase text-[11px]">
                          <th className="px-4 py-3 text-center table-cell-center">Lớp</th>
                          <th className="px-4 py-3 text-center table-cell-center">Chưa xử lý</th>
                          <th className="px-4 py-3 text-center table-cell-center">Đang xử lý</th>
                          <th className="px-4 py-3 text-center table-cell-center">Quá hạn</th>
                          <th className="px-4 py-3 text-center table-cell-center">Nguy cơ cao</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {summary.byClass.map((c) => (
                          <tr key={c.classId} className="hover:bg-slate-50/80 transition-colors">
                            <td className="px-4 py-3 font-semibold text-slate-800 text-center table-cell-center">{c.classCode || c.classId}</td>
                            <td className="px-4 py-3 text-center table-cell-center">
                              <TextLabel className={`inline-block min-w-6    font-mono font-bold ${c.open > 0 ? "bg-blue-50 text-blue-700  " : "text-slate-400"}`}>
                                {c.open}
                              </TextLabel>
                            </td>
                            <td className="px-4 py-3 text-center font-mono text-slate-700 table-cell-center">{c.inProgress}</td>
                            <td className="px-4 py-3 text-center table-cell-center">
                              <span className={`font-mono font-bold ${c.overdue > 0 ? "text-red-600" : "text-slate-400"}`}>
                                {c.overdue}
                              </span>
                            </td>
                            <td className="px-4 py-3 text-center table-cell-center">
                              <TextLabel className={`inline-block min-w-6    font-mono font-bold ${c.highRisk > 0 ? "bg-red-50 text-red-700  " : "text-slate-400"}`}>
                                {c.highRisk}
                              </TextLabel>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </section>
              )}
            </>
          )}
        </div>
      )}

      {/* ═══════════════════════════════════════════════════════════════════
          TAB 2: CẦN CAN THIỆP (WORK QUEUE)
      ═══════════════════════════════════════════════════════════════════ */}
      {activeTab === "queue" && (
        <div className="space-y-4">
          {/* Filter Bar */}
          <FilterBar
            onReset={() => {
              if (queueSearchDebounce.current) clearTimeout(queueSearchDebounce.current);
              setQueueSearch("");
              setQueueFilters({ status: "", businessStatus: "", classId: "", academicTermId: "", overdue: "", search: "" });
              setQueuePage(1);
            }}
            actions={activeQueueFilterCount > 0 ? (
              <TextLabel className="text-[11px] font-semibold text-emerald-700">
                {activeQueueFilterCount} bộ lọc đang dùng
              </TextLabel>
            ) : undefined}
          >
            <select
              value={queueFilters.status}
              onChange={(e) => { setQueueFilters(f => ({ ...f, status: e.target.value })); setQueuePage(1); }}
              className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-medium text-slate-700 min-w-[140px] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-primary)]"
              aria-label="Trạng thái xử lý"
            >
              <option value="">Tất cả trạng thái</option>
              <option value="OPEN">Chưa xử lý</option>
              <option value="IN_PROGRESS">Đang xử lý</option>
              <option value="RESOLVED">Hoàn tất</option>
            </select>
            <select
              value={queueFilters.businessStatus}
              onChange={(e) => { setQueueFilters(f => ({ ...f, businessStatus: e.target.value })); setQueuePage(1); }}
              className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-medium text-slate-700 min-w-[160px] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-primary)]"
              aria-label="Mức cảnh báo"
            >
              <option value="">Tất cả mức cảnh báo</option>
              <option value="HIGH_RISK">Nguy cơ cao</option>
              <option value="MONITORING">Cần chú ý</option>
              <option value="VERIFY_REQUIRED">Cần xác minh (Nguy cơ cao)</option>
              <option value="INSUFFICIENT_DATA">Chưa đủ dữ liệu</option>
            </select>
            <select
              value={queueFilters.academicTermId}
              onChange={(e) => { setQueueFilters(f => ({ ...f, academicTermId: e.target.value })); setQueuePage(1); }}
              className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-medium text-slate-700 min-w-[150px] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-primary)]"
              aria-label="Học kỳ đánh giá"
            >
              <option value="">Tất cả học kỳ</option>
              {academicTermOptions.map((term) => <option key={term.value} value={term.value}>{term.label}</option>)}
            </select>
            {!hideClassContext && classOptions.length > 0 && (
              <select
                value={queueFilters.classId}
                onChange={(e) => { setQueueFilters(f => ({ ...f, classId: e.target.value })); setQueuePage(1); }}
                className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-medium text-slate-700 min-w-[130px] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-primary)]"
                aria-label="Lớp sinh viên"
              >
                <option value="">Tất cả lớp</option>
                {classOptions.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
              </select>
            )}
            {queueFilters.overdue === "true" ? (
              <button type="button" onClick={() => { setQueueFilters(f => ({ ...f, overdue: "" })); setQueuePage(1); }} className="rounded-xl border border-red-300 bg-red-50 px-3 py-2 text-xs font-semibold text-red-700 flex items-center gap-1.5 cursor-pointer">
                <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><circle cx="12" cy="12" r="10" /><polyline points="12 6 12 12 16 14" /></svg>
                Quá hạn ✕
              </button>
            ) : (
              <button type="button" onClick={() => { setQueueFilters(f => ({ ...f, overdue: "true" })); setQueuePage(1); }} className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-medium text-slate-600 hover:bg-slate-50 cursor-pointer">
                Quá hạn
              </button>
            )}
            <div className="relative flex-1 min-w-[180px]">
              <input
                type="text"
                placeholder="Tìm MSSV hoặc tên..."
                value={queueSearch}
                onChange={(e) => handleQueueSearch(e.target.value)}
                className="w-full rounded-xl border border-slate-200 bg-white pl-8 pr-3 py-2 text-xs text-slate-700 focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)]"
                aria-label="Tìm kiếm sinh viên"
              />
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400"><circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" /></svg>
            </div>
          </FilterBar>

          {/* Queue Table */}
          {queueLoading ? (
            <LoadingSkeleton rows={5} />
          ) : queueError ? (
            <div role="alert" className="rounded-xl border border-red-200 bg-red-50 p-6 text-sm text-red-800">{queueError}</div>
          ) : !queueData?.items.length ? (
            <EmptyState message={queueFilters.overdue === "true" ? "Không có trường hợp quá hạn theo dõi." : "Hiện không có sinh viên nào cần can thiệp trong phạm vi của bạn."} />
          ) : (
            <DataTable<InterventionCaseItem & Record<string, ApiData>>
              columns={[
                {
                  key: "student",
                  title: "Sinh viên",
                  render: (_, record) => (
                    <div className="min-w-[160px]">
                      <div className="font-semibold text-slate-900">{record.student?.fullName || "—"}</div>
                      <div className="text-[11px] text-slate-500 font-mono">{record.student?.studentCode || ""}</div>
                    </div>
                  ),
                },
                ...(!hideClassContext ? [{
                  key: "classCode",
                  title: "Lớp" as React.ReactNode,
                  render: (_: ApiData, record: InterventionCaseItem) => (
                    <span className="text-slate-700">{record.student?.classCode || "—"}</span>
                  ),
                }] : []),
                {
                  key: "latestBusinessStatus",
                  title: "Mức cảnh báo",
                  render: (_, record) => <BusinessStatusBadge status={record.latestBusinessStatus} />,
                },
                {
                  key: "interventionStatus",
                  title: "Trạng thái xử lý",
                  render: (_, record) => (
                    <div className="flex flex-col gap-1">
                      <InterventionStatusBadge status={record.interventionStatus} />
                      {record.overdue && <OverdueBadge />}
                    </div>
                  ),
                },
                {
                  key: "classResponsibility",
                  title: "Phạm vi phụ trách",
                  render: (_, record) => (
                    <span className="text-slate-700">GVCN/CVHT lớp {record.student?.classCode || "—"}</span>
                  ),
                },
                {
                  key: "nextFollowUpAt",
                  title: "Theo dõi tiếp",
                  render: (_, record) => {
                    if (!record.nextFollowUpAt) return <span className="text-slate-400">—</span>;
                    const isOverdue = record.overdue;
                    return <span className={`font-mono text-xs ${isOverdue ? "text-red-600 font-bold" : "text-slate-600"}`}>{formatDate(record.nextFollowUpAt)}</span>;
                  },
                },
                {
                  key: "updatedAt",
                  title: "Cập nhật",
                  render: (_, record) => <span className="text-xs text-slate-500 font-mono">{formatDateTime(record.updatedAt)}</span>,
                },
                {
                  key: "actions",
                  title: "Thao tác",
                  align: "center",
                  render: (_, record) => {
                    const cta = getActionCTA(record.interventionStatus);
                    return (
                      <TableAction
                        icon={cta.icon}
                        label={cta.label}
                        tone={cta.tone}
                        onClick={(e) => { e.stopPropagation(); openDrawer(record.caseId); }}
                      />
                    );
                  },
                },
              ] as Column<InterventionCaseItem & Record<string, ApiData>>[]}
              data={queueData.items as (InterventionCaseItem & Record<string, ApiData>)[]}
              rowKey={(r) => r.caseId}
              pagination={{
                currentPage: queueData.page,
                pageSize: queueData.pageSize,
                total: queueData.total,
                onChange: (p) => setQueuePage(p),
              }}
              onRowClick={(r) => openDrawer(r.caseId)}
            />
          )}
        </div>
      )}

      {/* ═══════════════════════════════════════════════════════════════════
          TAB 3: LỊCH SỬ CAN THIỆP
      ═══════════════════════════════════════════════════════════════════ */}
      {activeTab === "history" && (
        <div className="space-y-4">
          <FilterBar
            onReset={() => {
              if (historySearchDebounce.current) clearTimeout(historySearchDebounce.current);
              setHistorySearch("");
              setHistoryFilters({ businessStatus: "", classId: "", academicTermId: "", search: "" });
              setHistoryPage(1);
            }}
            actions={activeHistoryFilterCount > 0 ? (
              <TextLabel className="text-[11px] font-semibold text-emerald-700">
                {activeHistoryFilterCount} bộ lọc đang dùng
              </TextLabel>
            ) : undefined}
          >
            <select
              value={historyFilters.academicTermId}
              onChange={(e) => { setHistoryFilters(f => ({ ...f, academicTermId: e.target.value })); setHistoryPage(1); }}
              className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-medium text-slate-700 min-w-[150px] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-primary)]"
              aria-label="Học kỳ hoàn tất"
            >
              <option value="">Tất cả học kỳ</option>
              {academicTermOptions.map((term) => <option key={term.value} value={term.value}>{term.label}</option>)}
            </select>
            <select
              value={historyFilters.businessStatus}
              onChange={(e) => { setHistoryFilters(f => ({ ...f, businessStatus: e.target.value })); setHistoryPage(1); }}
              className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-medium text-slate-700 min-w-[160px] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-primary)]"
              aria-label="Mức cảnh báo"
            >
              <option value="">Tất cả mức cảnh báo</option>
              <option value="HIGH_RISK">Nguy cơ cao</option>
              <option value="MONITORING">Cần chú ý</option>
              <option value="NORMAL">Bình thường</option>
              <option value="VERIFY_REQUIRED">Cần xác minh (Nguy cơ cao)</option>
            </select>
            {!hideClassContext && classOptions.length > 0 && (
              <select
                value={historyFilters.classId}
                onChange={(e) => { setHistoryFilters(f => ({ ...f, classId: e.target.value })); setHistoryPage(1); }}
                className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-medium text-slate-700 min-w-[130px] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-primary)]"
                aria-label="Lớp sinh viên"
              >
                <option value="">Tất cả lớp</option>
                {classOptions.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
              </select>
            )}
            <div className="relative flex-1 min-w-[180px]">
              <input
                type="text"
                placeholder="Tìm MSSV hoặc tên..."
                value={historySearch}
                onChange={(e) => {
                  const val = e.target.value;
                  setHistorySearch(val);
                  if (historySearchDebounce.current) clearTimeout(historySearchDebounce.current);
                  historySearchDebounce.current = setTimeout(() => { setHistoryFilters(f => ({ ...f, search: val })); setHistoryPage(1); }, 350);
                }}
                className="w-full rounded-xl border border-slate-200 bg-white pl-8 pr-3 py-2 text-xs text-slate-700 focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)]"
                aria-label="Tìm kiếm sinh viên"
              />
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400"><circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" /></svg>
            </div>
          </FilterBar>

          {historyLoading ? (
            <LoadingSkeleton rows={5} />
          ) : historyError ? (
            <div role="alert" className="rounded-xl border border-red-200 bg-red-50 p-6 text-sm text-red-800">{historyError}</div>
          ) : !historyData?.items.length ? (
            <EmptyState message="Chưa có hoạt động can thiệp nào được ghi nhận." />
          ) : (
            <DataTable<InterventionCaseItem & Record<string, ApiData>>
              columns={[
                {
                  key: "student",
                  title: "Sinh viên",
                  render: (_, record) => (
                    <div>
                      <div className="font-semibold text-slate-900">{record.student?.fullName || "—"}</div>
                      <div className="text-[11px] text-slate-500 font-mono">{record.student?.studentCode || ""}</div>
                    </div>
                  ),
                },
                ...(!hideClassContext ? [{
                  key: "classCode",
                  title: "Lớp" as React.ReactNode,
                  render: (_: ApiData, record: InterventionCaseItem) => <span className="text-slate-700">{record.student?.classCode || "—"}</span>,
                }] : []),
                {
                  key: "latestBusinessStatus",
                  title: "Mức cảnh báo",
                  render: (_, record) => <BusinessStatusBadge status={record.latestBusinessStatus} />,
                },
                {
                  key: "interventionStatus",
                  title: "Trạng thái",
                  render: (_, record) => <InterventionStatusBadge status={record.interventionStatus} />,
                },
                {
                  key: "resolvedAt",
                  title: "Hoàn tất lúc",
                  render: (_, record) => <span className="text-xs text-slate-500 font-mono">{formatDateTime(record.resolvedAt)}</span>,
                },
                {
                  key: "actions",
                  title: "Thao tác",
                  align: "center",
                  render: (_, record) => (
                    <TableAction
                      icon={History}
                      label="Xem lịch sử"
                      onClick={(e) => { e.stopPropagation(); openDrawer(record.caseId); }}
                    />
                  ),
                },
              ] as Column<InterventionCaseItem & Record<string, ApiData>>[]}
              data={historyData.items as (InterventionCaseItem & Record<string, ApiData>)[]}
              rowKey={(r) => r.caseId}
              pagination={{
                currentPage: historyData.page,
                pageSize: historyData.pageSize,
                total: historyData.total,
                onChange: (p) => setHistoryPage(p),
              }}
              onRowClick={(r) => openDrawer(r.caseId)}
            />
          )}
        </div>
      )}

      {/* ═══════════════════════════════════════════════════════════════════
          INTERVENTION DRAWER
      ═══════════════════════════════════════════════════════════════════ */}
      <SlideOverDrawer
        isOpen={drawerOpen}
        onClose={closeDrawer}
        title={drawerCase?.student?.fullName || "Chi tiết can thiệp"}
        subtitle={drawerCase ? `${drawerCase.student?.studentCode || ""} • ${drawerCase.student?.classCode || ""}` : undefined}
        width="xl"
        extra={drawerCase ? (
          <button
            type="button"
            onClick={() => router.push(`/students/${drawerCase.student.id}`)}
            className="text-xs font-medium text-[var(--color-primary)] hover:underline cursor-pointer"
          >
            Xem hồ sơ sinh viên →
          </button>
        ) : undefined}
      >
        {drawerLoading ? (
          <LoadingSkeleton rows={6} />
        ) : drawerError ? (
          <div
            role="alert"
            className={`rounded-xl border p-6 text-sm ${drawerErrorKind === "api" ? "border-red-200 bg-red-50 text-red-800" : "border-amber-200 bg-amber-50 text-amber-900"}`}
          >
            <div className="font-semibold">{drawerErrorKind === "not-found" ? "Không thể mở hồ sơ" : drawerErrorKind === "forbidden" ? "Không có quyền truy cập" : "Không thể tải dữ liệu"}</div>
            <p className="mt-1 text-xs leading-relaxed">{drawerError}</p>
          </div>
        ) : drawerDetail && drawerCase ? (
          <div className="space-y-5">
            {/* A. Header Badges */}
            <div className="flex flex-wrap items-center gap-2">
              <BusinessStatusBadge status={drawerCase.latestBusinessStatus} />
              <InterventionStatusBadge status={drawerCase.interventionStatus} />
              {drawerCase.overdue && <OverdueBadge />}
            </div>

            {/* Follow-up */}
            {drawerCase.nextFollowUpAt && (
              <div className={`flex items-center gap-2 p-3 rounded-xl border text-xs ${drawerCase.overdue ? "bg-red-50 border-red-200 text-red-800" : "bg-blue-50 border-blue-200 text-blue-800"}`}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10" /><polyline points="12 6 12 12 16 14" /></svg>
                <span>Theo dõi tiếp: <strong>{formatDateTime(drawerCase.nextFollowUpAt)}</strong></span>
                {drawerCase.overdue && <span className="font-bold"> — Quá hạn</span>}
              </div>
            )}

            {/* B. Warning Reasons */}
            {drawerWarning && (
              drawerWarning.reasons.length > 0 ||
              warningRuleRows(drawerWarning.ruleResults).some(rule => rule.evaluationStatus === "NOT_EVALUATED")
            ) && (() => {
              const isAcademicRule = (code: string) =>
                code.startsWith("QD600_") ||
                code.includes("CREDIT_RATIO") ||
                code.includes("TERM_GPA") ||
                code.includes("CUMULATIVE_GPA") ||
                code.includes("ACCUMULATED_DEBT");

              const academicReasons = drawerWarning.reasons.filter((r) => isAcademicRule(r.reasonCode));
              const progressReasons = drawerWarning.reasons.filter((r) => !isAcademicRule(r.reasonCode));
              const unEvaluatedRules = warningRuleRows(drawerWarning.ruleResults).filter(
                (rule) => rule.evaluationStatus === "NOT_EVALUATED"
              );

              return (
                <section className="space-y-4">
                  <h3 className="text-sm font-bold text-slate-900 tracking-tight" style={{ fontFamily: "Be Vietnam Pro, sans-serif" }}>
                    Vì sao sinh viên này được cảnh báo?
                  </h3>

                  {/* A. Nguy cơ học vụ */}
                  {academicReasons.length > 0 && (
                    <div className="space-y-2">
                      <div className="text-xs font-bold text-slate-800 flex items-center gap-1.5">
                        <span className="w-2 h-2 rounded-full bg-red-600" />
                        <span>A. Nguy cơ học vụ</span>
                      </div>
                      <div className="space-y-2.5">
                        {academicReasons.map((reason) => (
                          <div key={reason.reasonCode} className="p-3.5 rounded-xl border border-slate-200/90 bg-white shadow-2xs space-y-2.5">
                            <div className="flex items-start justify-between gap-3">
                              <div>
                                <div className="font-semibold text-slate-800 text-xs sm:text-[13px] leading-snug">
                                  {getHumanReasonTitle(reason)}
                                </div>
                                <p className="mt-1 text-xs text-slate-600 leading-relaxed">
                                  {getHumanReasonExplanation(reason)}
                                </p>
                              </div>
                              <TextLabel className={`shrink-0 text-[10px] font-bold    ${
                                reason.thresholdBreached ? "bg-red-50 text-red-600  " : reason.nearThreshold ? "bg-amber-50 text-amber-600  " : "bg-slate-50 text-slate-500  "
                              }`}>
                                {reason.details?.ruleCode === "ACCUMULATED_DEBT_CREDIT_RISK"
                                  ? reason.thresholdBreached ? "Nguy cơ cao" : "Cần chú ý"
                                  : reason.thresholdBreached ? "Vượt ngưỡng" : reason.nearThreshold ? "Gần ngưỡng" : "Tham khảo"}
                              </TextLabel>
                            </div>

                            {/* Metric boxes */}
                            {reason.observedValue !== null && (
                              <div className="grid grid-cols-2 gap-2 text-xs">
                                <div className="rounded-lg bg-red-50/60 border border-red-100 p-2">
                                  <span className="text-[11px] text-red-700 block font-medium">
                                    {isRatioRule(reason) ? "Không đạt" : String(reason.details?.ruleCode || reason.reasonCode).includes("ACCUMULATED_DEBT") ? "Tín chỉ còn nợ" : "Điểm đạt được"}
                                  </span>
                                  <strong className="text-red-900 font-mono font-bold text-sm">
                                    {formatReasonValue(reason, reason.observedValue)}
                                  </strong>
                                </div>
                                <div className="rounded-lg bg-slate-50 border border-slate-200/70 p-2">
                                  <span className="text-[11px] text-slate-500 block font-medium">Ngưỡng cảnh báo</span>
                                  <strong className="text-slate-800 font-mono font-semibold text-sm">
                                    {formatThresholdDisplay(reason)}
                                  </strong>
                                </div>
                              </div>
                            )}

                            {/* Legal basis footer with plain-language rule popover/toggle */}
                            <div className="pt-2 border-t border-slate-100 flex flex-wrap items-center justify-between gap-2 text-[11px]">
                              <span className="text-slate-500">
                                Căn cứ: <strong className="font-medium text-slate-700">{getLegalBasisLabel(reason)}</strong>
                              </span>
                              <button
                                type="button"
                                onClick={() => setExpandedLegalRule(expandedLegalRule === reason.reasonCode ? null : reason.reasonCode)}
                                className="text-[var(--color-primary)] hover:underline font-medium inline-flex items-center gap-1 cursor-pointer"
                              >
                                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10"/><path d="M12 16v-4"/><path d="M12 8h.01"/></svg>
                                <span>{expandedLegalRule === reason.reasonCode ? "Ẩn nội dung quy định" : "Xem nội dung quy định"}</span>
                              </button>
                            </div>

                            {expandedLegalRule === reason.reasonCode && (
                              <div className="p-2.5 rounded-lg bg-emerald-50/60 border border-emerald-200/80 text-xs text-emerald-950 space-y-1">
                                <div className="font-semibold text-emerald-900 flex items-center gap-1.5">
                                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-emerald-700 shrink-0"><path d="m3 21 18 0"/><path d="M5 21V7l8-4v18"/><path d="M19 21V11l-6-3"/></svg>
                                  <span>{getLegalInfo(reason).title}</span>
                                </div>
                                <p className="text-[11px] leading-relaxed text-emerald-900/90 font-normal">
                                  {getLegalInfo(reason).summary}
                                </p>
                              </div>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* B. Chậm tiến độ tốt nghiệp (Theo chuẩn CTĐT) */}
                  {progressReasons.length > 0 && (
                    <div className="space-y-2">
                      <div className="text-xs font-bold text-slate-800 flex items-center gap-1.5">
                        <span className="w-2 h-2 rounded-full bg-amber-500" />
                        <span>B. Chậm tiến độ tốt nghiệp (Theo chuẩn CTĐT)</span>
                      </div>
                      <div className="space-y-2.5">
                        {progressReasons.map((reason) => {
                          const deficit = Number(reason.observedValue || 0);
                          const isHighRisk = deficit >= 12;
                          const expectedCredits = reason.details?.expectedCredits;
                          const earnedCredits = reason.details?.earnedCredits;
                          const hasCreditBreakdown =
                            (expectedCredits !== null && expectedCredits !== undefined) ||
                            (earnedCredits !== null && earnedCredits !== undefined);

                          return (
                            <div key={reason.reasonCode} className="p-3.5 rounded-xl border border-slate-200/90 bg-white shadow-2xs space-y-2.5">
                              <div className="flex items-start justify-between gap-3">
                                <div>
                                  <div className="font-semibold text-slate-800 text-xs sm:text-[13px] leading-snug">
                                    {getHumanReasonTitle(reason)}
                                  </div>
                                  <p className="mt-1 text-xs text-slate-600 leading-relaxed">
                                    {getHumanReasonExplanation(reason)}
                                  </p>
                                </div>
                                <TextLabel className={`shrink-0 text-[10px] font-bold    ${
                                  isHighRisk
                                    ? "bg-red-50 text-red-600  "
                                    : "bg-amber-50 text-amber-600  "
                                }`}>
                                  {isHighRisk ? "Nguy cơ cao" : "Cần chú ý"}
                                </TextLabel>
                              </div>

                              {/* Metric boxes */}
                              <div className="grid grid-cols-2 gap-2 text-xs">
                                <div className="rounded-lg bg-red-50/60 border border-red-100 p-2">
                                  <span className="text-[11px] text-red-700 block font-medium">Thiếu hiện tại</span>
                                  <strong className="text-red-900 font-mono font-bold text-sm">
                                    {deficit} TC
                                  </strong>
                                </div>
                                <div className="rounded-lg bg-slate-50 border border-slate-200/70 p-2">
                                  <span className="text-[11px] text-slate-500 block font-medium">
                                    {isHighRisk ? "Mức nguy cơ cao" : "Mức cần chú ý"}
                                  </span>
                                  <strong className="text-slate-800 font-mono font-semibold text-sm">
                                    từ {Number(reason.thresholdValue || (isHighRisk ? 12 : 4))} TC
                                  </strong>
                                </div>
                              </div>

                              {/* CTĐT comparison breakdown if available */}
                              {hasCreditBreakdown && (
                                <div className="rounded-lg bg-slate-50/80 p-2.5 border border-slate-200/70 text-xs">
                                  <div className="font-semibold text-slate-700 mb-1.5 flex items-center gap-1.5 text-[11px]">
                                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-slate-500"><path d="M4 19.5v-15A2.5 2.5 0 0 1 6.5 2H20v20H6.5a2.5 2.5 0 0 1-2.5-2.5Z"/><path d="M6 6h10"/><path d="M6 10h10"/></svg>
                                    <span>Đối chiếu khung chương trình đào tạo (CTĐT):</span>
                                  </div>
                                  <div className="grid grid-cols-3 gap-2 text-center text-[11px]">
                                    <div className="rounded bg-white p-1.5 border border-slate-200/80">
                                      <span className="text-slate-500 block">Cần hoàn thành</span>
                                      <strong className="font-semibold text-slate-800 font-mono text-xs">
                                        {expectedCredits !== null && expectedCredits !== undefined ? `${expectedCredits} TC` : "—"}
                                      </strong>
                                    </div>
                                    <div className="rounded bg-white p-1.5 border border-slate-200/80">
                                      <span className="text-slate-500 block">Đã hoàn thành</span>
                                      <strong className="font-semibold text-emerald-700 font-mono text-xs">
                                        {earnedCredits !== null && earnedCredits !== undefined ? `${earnedCredits} TC` : "—"}
                                      </strong>
                                    </div>
                                    <div className="rounded bg-white p-1.5 border border-slate-200/80">
                                      <span className="text-slate-500 block">Còn thiếu</span>
                                      <strong className="font-semibold text-red-600 font-mono text-xs">
                                        {deficit} TC
                                      </strong>
                                    </div>
                                  </div>
                                </div>
                              )}

                              {/* Legal basis footer with plain-language rule popover/toggle */}
                              <div className="pt-2 border-t border-slate-100 flex flex-wrap items-center justify-between gap-2 text-[11px]">
                                <span className="text-slate-500">
                                  Căn cứ: <strong className="font-medium text-slate-700">Chuẩn tiến độ đào tạo của Trường</strong>
                                </span>
                                <button
                                  type="button"
                                  onClick={() => setExpandedLegalRule(expandedLegalRule === reason.reasonCode ? null : reason.reasonCode)}
                                  className="text-[var(--color-primary)] hover:underline font-medium inline-flex items-center gap-1 cursor-pointer"
                                >
                                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10"/><path d="M12 16v-4"/><path d="M12 8h.01"/></svg>
                                  <span>{expandedLegalRule === reason.reasonCode ? "Ẩn nội dung quy định" : "Xem nội dung quy định"}</span>
                                </button>
                              </div>

                              {expandedLegalRule === reason.reasonCode && (
                                <div className="p-2.5 rounded-lg bg-emerald-50/60 border border-emerald-200/80 text-xs text-emerald-950 space-y-1">
                                  <div className="font-semibold text-emerald-900 flex items-center gap-1.5">
                                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-emerald-700 shrink-0"><path d="m3 21 18 0"/><path d="M5 21V7l8-4v18"/><path d="M19 21V11l-6-3"/></svg>
                                    <span>{getLegalInfo(reason).title}</span>
                                  </div>
                                  <p className="text-[11px] leading-relaxed text-emerald-900/90 font-normal">
                                    {getLegalInfo(reason).summary}
                                  </p>
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}

                  {/* C. Tiêu chí chưa thể đối chiếu tự động */}
                  {unEvaluatedRules.length > 0 && (
                    <div className="space-y-1.5 pt-1">
                      <div className="text-xs font-bold text-slate-700">C. Tiêu chí chưa thể đối chiếu tự động</div>
                      <details className="group rounded-xl border border-slate-200/80 bg-slate-50/60 p-3 text-xs">
                        <summary className="font-medium text-slate-600 cursor-pointer list-none flex items-center justify-between hover:text-slate-800 select-none">
                          <span className="flex items-center gap-1.5">
                            <svg className="w-3.5 h-3.5 text-slate-400 transition-transform group-open:rotate-90" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="m9 18 6-6-6-6"/></svg>
                            <span>Danh sách tiêu chí chưa đủ dữ liệu ({unEvaluatedRules.length})</span>
                          </span>
                          <span className="text-[11px] text-slate-400 font-normal">Nhấn để xem chi tiết</span>
                        </summary>
                        <div className="mt-3 space-y-2 pt-2 border-t border-slate-200/60">
                          {unEvaluatedRules.map((rule, index) => (
                            <div key={`${String(rule.ruleCode || "rule")}-${index}`} className="rounded-lg bg-white p-2.5 border border-slate-200/60">
                              <span className="block font-semibold text-slate-800">{humanRuleName(rule.ruleCode)}</span>
                              <span className="mt-1 block text-slate-600 text-[11px] leading-relaxed">
                                {getHumanUnEvaluatedExplanation(rule)}
                              </span>
                            </div>
                          ))}
                        </div>
                      </details>
                    </div>
                  )}
                </section>
              );
            })()}

            {/* Regulatory coverage */}
            {drawerWarning?.regulatoryCoverage === "PARTIAL" && (
              <div className="p-3 rounded-xl border border-blue-100 bg-blue-50/50 text-xs text-blue-800 flex items-start gap-2">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="shrink-0 mt-0.5"><circle cx="12" cy="12" r="10" /><line x1="12" y1="16" x2="12" y2="12" /><line x1="12" y1="8" x2="12.01" y2="8" /></svg>
                <span>Đánh giá quy chế hiện chưa bao phủ đầy đủ tất cả tiêu chí do một số dữ liệu nguồn chưa đủ.</span>
              </div>
            )}

            {/* C. Status Control */}
            {canUpdateDrawerStatus && (
              <section className="space-y-3">
                <h3 className="text-sm font-bold text-slate-900" style={{ fontFamily: "Be Vietnam Pro, sans-serif" }}>Trạng thái xử lý</h3>
                <div className="flex flex-wrap items-center gap-2">
                  <InterventionStatusBadge status={drawerCase.interventionStatus} />
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-slate-400"><path d="M5 12h14" /><path d="m12 5 7 7-7 7" /></svg>
                  {(ALLOWED_TRANSITIONS[drawerCase.interventionStatus] || []).map((nextStatus) => (
                    <button
                      key={nextStatus}
                      type="button"
                      disabled={statusChanging}
                      onClick={() => void handleStatusChange(nextStatus)}
                      className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition cursor-pointer disabled:opacity-50 ${
                        nextStatus === "RESOLVED"
                          ? "bg-emerald-600 text-white hover:bg-emerald-700"
                          : nextStatus === "ESCALATED"
                          ? "bg-slate-700 text-white hover:bg-slate-800"
                          : "border border-slate-200 bg-white text-slate-700 hover:bg-slate-50"
                      }`}
                    >
                      {TRANSITION_ACTION_LABELS[nextStatus] || INTERVENTION_STATUS_LABELS[nextStatus] || nextStatus}
                    </button>
                  ))}
                </div>
              </section>
            )}

            {/* D. Intervention Form */}
            {canCreateDrawerActivity && (
              <section className="space-y-3">
                {!showInterventionForm ? (
                  <button
                    type="button"
                    onClick={() => { setShowInterventionForm(true); setInterventionForm({ interventionType: "REMINDER", occurredAt: new Date().toISOString().slice(0, 16), content: "", result: "", nextFollowUpAt: "" }); }}
                    className="w-full p-3 rounded-xl border border-dashed border-[var(--color-primary)]/50 bg-[var(--color-primary-light)]/30 text-[var(--color-primary)] text-xs font-semibold hover:bg-[var(--color-primary-light)]/60 cursor-pointer transition flex items-center justify-center gap-1.5"
                  >
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" /></svg>
                    Ghi nhận hoạt động can thiệp
                  </button>
                ) : (
                  <form onSubmit={handleSubmitIntervention} className="p-4 rounded-xl border border-slate-200 bg-white space-y-3">
                    <h4 className="text-xs font-bold text-slate-800" style={{ fontFamily: "Be Vietnam Pro, sans-serif" }}>Ghi nhận can thiệp</h4>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div>
                        <label htmlFor="iv-type" className="block text-[11px] font-semibold text-slate-600 mb-1">Hình thức can thiệp</label>
                        <select id="iv-type" value={interventionForm.interventionType} onChange={e => setInterventionForm(f => ({ ...f, interventionType: e.target.value }))} className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs text-slate-700">
                          {Object.entries(INTERVENTION_TYPE_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                        </select>
                      </div>
                      <div>
                        <label htmlFor="iv-date" className="block text-[11px] font-semibold text-slate-600 mb-1">Ngày thực hiện</label>
                        <input id="iv-date" type="datetime-local" required value={interventionForm.occurredAt} onChange={e => setInterventionForm(f => ({ ...f, occurredAt: e.target.value }))} className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs text-slate-700" />
                      </div>
                    </div>
                    <div>
                      <label htmlFor="iv-content" className="block text-[11px] font-semibold text-slate-600 mb-1">Nội dung can thiệp <span className="text-red-500">*</span></label>
                      <textarea id="iv-content" rows={3} required value={interventionForm.content} onChange={e => setInterventionForm(f => ({ ...f, content: e.target.value }))} placeholder="Mô tả nội dung hoạt động can thiệp..." className="w-full rounded-xl border border-slate-200 bg-white p-3 text-xs text-slate-700 focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)]" />
                    </div>
                    <div>
                      <label htmlFor="iv-result" className="block text-[11px] font-semibold text-slate-600 mb-1">Kết quả / ghi chú</label>
                      <textarea id="iv-result" rows={2} value={interventionForm.result} onChange={e => setInterventionForm(f => ({ ...f, result: e.target.value }))} placeholder="Kết quả hoặc ghi chú thêm..." className="w-full rounded-xl border border-slate-200 bg-white p-3 text-xs text-slate-700 focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)]" />
                    </div>
                    <div>
                      <label htmlFor="iv-followup" className="block text-[11px] font-semibold text-slate-600 mb-1">Ngày theo dõi tiếp theo <span className="text-slate-400">(tùy chọn)</span></label>
                      <input id="iv-followup" type="datetime-local" value={interventionForm.nextFollowUpAt} onChange={e => setInterventionForm(f => ({ ...f, nextFollowUpAt: e.target.value }))} className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs text-slate-700" />
                    </div>
                    <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100">
                      <button type="button" onClick={() => setShowInterventionForm(false)} className="px-3 py-1.5 text-xs font-semibold text-slate-600 hover:bg-slate-100 rounded-lg transition cursor-pointer">Hủy</button>
                      <button type="submit" disabled={formSubmitting} className="px-4 py-1.5 bg-[var(--color-primary)] text-white text-xs font-semibold rounded-lg hover:opacity-90 transition disabled:opacity-50 cursor-pointer flex items-center gap-1.5">
                        {formSubmitting && <svg className="animate-spin h-3.5 w-3.5 text-white" viewBox="0 0 24 24" fill="none"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" /><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" /></svg>}
                        <span>Lưu cập nhật</span>
                      </button>
                    </div>
                  </form>
                )}
              </section>
            )}

            {/* E. History Timeline */}
            <section className="space-y-3">
              <h3 className="text-sm font-bold text-slate-900" style={{ fontFamily: "Be Vietnam Pro, sans-serif" }}>Lịch sử xử lý</h3>
              {drawerDetail.history.length === 0 ? (
                <div className="text-xs text-slate-400 py-4 text-center">Chưa có sự kiện nào.</div>
              ) : (
                <ol className="space-y-0">
                  {[...drawerDetail.history].reverse().map((event, index) => {
                    const item = formatWarningHistoryEvent(event);

                    return (
                      <li key={event.id} className="relative grid grid-cols-[16px_1fr] gap-2.5 pb-4 last:pb-0">
                        {index < drawerDetail.history.length - 1 && <span className="absolute left-[7px] top-4 h-full w-px bg-slate-200" aria-hidden="true" />}
                        <span className={`relative z-10 mt-1 h-4 w-4 rounded-full border-2 border-white shadow-sm ${item.color}`} aria-hidden="true" />
                        <div className="min-w-0">
                          <div className="flex flex-wrap items-center justify-between gap-1">
                            <div className="flex items-center gap-1.5">
                              <span className="text-xs font-semibold text-slate-700">{item.actorName}</span>
                              <span className="text-[11px] text-slate-500">{item.title}</span>
                            </div>
                            <time className="text-[10px] text-slate-400 font-mono">{formatHistoryDate(item.date)}</time>
                          </div>
                          {item.detail && <p className="mt-0.5 text-[11px] text-slate-500 leading-relaxed">{item.detail}</p>}
                        </div>
                      </li>
                    );
                  })}
                </ol>
              )}
            </section>
          </div>
        ) : null}
      </SlideOverDrawer>

      {/* ═══════════════════════════════════════════════════════════════════
          RESOLVE CONFIRMATION DIALOG
      ═══════════════════════════════════════════════════════════════════ */}
      <ConfirmDialog
        isOpen={showResolveConfirm}
        onClose={() => setShowResolveConfirm(false)}
        onConfirm={() => void handleResolve()}
        title="Hoàn tất hoạt động can thiệp này?"
        message={
          <div className="space-y-2">
            <p>Trạng thái hồ sơ can thiệp sẽ được chuyển thành Hoàn tất.</p>
            <p className="text-slate-500 text-[11px]">Trạng thái nguy cơ học vụ của sinh viên vẫn được hệ thống đánh giá độc lập ở các đợt tiếp theo.</p>
          </div>
        }
        confirmText="Hoàn tất"
        cancelText="Hủy"
        loading={resolveLoading}
      />

      {/* ═══════════════════════════════════════════════════════════════════
          WARNING RUN MODAL — QD600 OFFICIAL WORKFLOW
      ═══════════════════════════════════════════════════════════════════ */}
      <Modal
        isOpen={showRunModal}
        onClose={() => { if (!runSubmitting) setShowRunModal(false); }}
        title={report?.reportContext?.hasCompletedOfficialRun ? "Chạy lại đánh giá cảnh báo" : "Khởi tạo đánh giá cảnh báo"}
        description="Chọn học kỳ chính. Nếu kỳ chưa có tín hiệu chốt điểm, cần xác nhận rõ trước khi hệ thống đánh giá."
        maxWidth="md"
      >
        <form onSubmit={handleSubmitRun} className="space-y-4">
            {runError && <div className="p-3 bg-red-50 border border-red-200 text-red-700 text-xs rounded-xl">{runError}</div>}
            {runSuccess && <div className="p-3 bg-emerald-50 border border-emerald-200 text-emerald-700 text-xs rounded-xl">{runSuccess}</div>}

            <div className="rounded-xl border border-slate-200 bg-slate-50/60 px-4 py-3 space-y-2.5">
              <div>
                <span className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-0.5">Quy chế đánh giá</span>
                <span className="text-sm font-semibold text-slate-900">QĐ 600/QĐ-ĐHĐL — Điều 18</span>
              </div>
              <div>
                <span className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-0.5">Kỳ đánh giá</span>
                <select
                  value={runTermId}
                  onChange={(event) => {
                    setRunTermId(event.target.value);
                    setConfirmGradesFinalized(false);
                    setRunError("");
                  }}
                  className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500"
                >
                  <option value="">Chọn học kỳ chính</option>
                  {runTerms.map((term) => (
                    <option key={term.value} value={term.value}>
                      {term.label}{term.gradesFinalizedAt ? " — Đã chốt điểm" : " — Chưa xác nhận chốt điểm"}
                    </option>
                  ))}
                </select>
                {runTerm?.gradesFinalizedAt && (
                  <span className="block text-[11px] text-emerald-700 mt-1">Đã chốt điểm lúc {new Date(runTerm.gradesFinalizedAt).toLocaleString("vi-VN")}.</span>
                )}
              </div>
              <div>
                <span className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-0.5">Phạm vi đánh giá</span>
                <span className="inline-flex items-center gap-1.5 text-sm font-semibold text-amber-700">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-amber-500"><circle cx="12" cy="12" r="10" /><line x1="12" y1="8" x2="12" y2="12" /><line x1="12" y1="16" x2="12.01" y2="16" /></svg>
                  Đánh giá một phần
                </span>
              </div>
            </div>

            {runTerm && !runTerm.gradesFinalizedAt && (
              <label className="flex items-start gap-2.5 rounded-xl border border-amber-200 bg-amber-50 px-3.5 py-3 text-xs text-amber-900 cursor-pointer">
                <input
                  type="checkbox"
                  checked={confirmGradesFinalized}
                  onChange={(event) => setConfirmGradesFinalized(event.target.checked)}
                  className="mt-0.5 h-4 w-4 rounded border-amber-300 text-emerald-600 focus:ring-emerald-500"
                />
                <span><strong>Tôi xác nhận điểm của {runTerm.label} đã được chốt chính thức.</strong> Thao tác này sẽ lưu thời điểm chốt điểm và tự động đánh giá toàn bộ sinh viên thuộc phạm vi Khoa.</span>
              </label>
            )}

            {/* Informational note about partial coverage */}
            <div className="rounded-xl border border-blue-100 bg-blue-50/50 px-3.5 py-2.5 text-[11px] text-blue-800 space-y-1">
              <p>Hệ thống chỉ ghép khóa với chương trình đào tạo đã được cấu hình cho chính khóa đó; bạn không cần chạy riêng từng nhóm.</p>
              <p>Mục tiêu là phát hiện sớm nguy cơ theo khoản 1 Điều 18 để Khoa và Cố vấn học tập can thiệp kịp thời.</p>
              <p className="text-blue-600">Đợt đã hoàn tất không bị ghi đè. Phạm vi từng thất bại có thể được thử lại.</p>
            </div>
            <div className="pt-2 flex items-center justify-end gap-2 border-t border-slate-100">
              <button type="button" disabled={runSubmitting} onClick={() => setShowRunModal(false)} className="px-4 py-2 border border-slate-200 text-slate-700 text-xs font-semibold rounded-xl hover:bg-slate-50 transition cursor-pointer disabled:opacity-50">Hủy bỏ</button>
              <button type="submit" disabled={runSubmitting || !runTerm || (!runTerm.gradesFinalizedAt && !confirmGradesFinalized)} className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 active:scale-[0.98] text-white text-xs font-semibold rounded-xl shadow-xs transition flex items-center gap-1.5 cursor-pointer disabled:opacity-50">
                {runSubmitting ? (
                  <><svg className="animate-spin h-3.5 w-3.5 text-white" viewBox="0 0 24 24" fill="none"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" /><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" /></svg><span>Đang đánh giá...</span></>
                ) : <span>{runTerm?.gradesFinalizedAt ? "Xác nhận chạy lại" : "Xác nhận chốt điểm và đánh giá"}</span>}
              </button>
            </div>
          </form>
      </Modal>
    </div>
  );
}
