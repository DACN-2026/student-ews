export type WarningHistoryEvent = {
  id: string;
  caseId?: string;
  eventType: string;
  actor: { userId: string; displayName: string | null } | null;
  systemGenerated: boolean;
  sourceRunId: string | null;
  createdAt: string;
  details: Record<string, unknown>;
  warningContext?: {
    termCode: string; academicYear: string | null;
    result: { termGpa4: number | null; cumulativeGpa4: number | null; reasonCount: number } | null;
  } | null;
};

const EVENT_LABELS: Record<string, string> = {
  CASE_CREATED: "Tạo hồ sơ can thiệp", WARNING_DETECTED: "Phát hiện cảnh báo mới",
  RISK_STATUS_CHANGED: "Thay đổi mức nguy cơ", ASSIGNED: "Phân công người phụ trách",
  REASSIGNED: "Đổi người phụ trách", STATUS_CHANGED: "Thay đổi trạng thái",
  NOTE_ADDED: "Thêm ghi chú", INTERVENTION_RECORDED: "Ghi nhận can thiệp",
  FOLLOW_UP_SCHEDULED: "Đặt lịch theo dõi", CASE_RESOLVED: "Hoàn tất can thiệp",
  CASE_REOPENED: "Mở lại can thiệp",
};
const RISK_LABELS: Record<string, string> = {
  NORMAL: "Bình thường", PARTIAL_NO_RISK: "Bình thường", MONITORING: "Cần chú ý",
  HIGH_RISK: "Nguy cơ cao", VERIFY_REQUIRED: "Chạm ngưỡng cần xác minh", INSUFFICIENT_DATA: "Chưa đủ dữ liệu",
};
const STATUS_LABELS: Record<string, string> = {
  OPEN: "Chưa xử lý", IN_PROGRESS: "Đang xử lý", RESOLVED: "Hoàn tất",
  ESCALATED: "Đang xử lý", REOPENED: "Đang xử lý",
};
const TYPE_LABELS: Record<string, string> = {
  REMINDER: "Nhắc nhở", DIRECT_COUNSELING: "Tư vấn trực tiếp", CONTACT: "Liên hệ sinh viên",
  STUDY_PLAN_GUIDANCE: "Hướng dẫn kế hoạch học tập", OTHER: "Khác",
};
const label = (labels: Record<string, string>, value: unknown) => labels[String(value ?? "")] || String(value ?? "Chưa xác định");
const riskColor = (status: unknown) => status === "HIGH_RISK" || status === "VERIFY_REQUIRED" ? "bg-red-500"
  : status === "MONITORING" ? "bg-amber-500"
    : status === "NORMAL" || status === "PARTIAL_NO_RISK" ? "bg-emerald-500" : "bg-slate-400";

export function formatHistoryDate(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString("vi-VN", {
    day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit",
  });
}

/** Keep older activity fields readable while new activities use one optional note. */
export function interventionHistoryDetails(event: WarningHistoryEvent) {
  const text = (value: unknown) => typeof value === "string" ? value.trim() : "";
  const details = event.details || {};
  const occurredAt = text(details.occurredAt);
  return {
    typeLabel: label(TYPE_LABELS, details.interventionType),
    occurredAt: occurredAt && !Number.isNaN(Date.parse(occurredAt)) ? occurredAt : event.createdAt,
    note: [...new Set([text(details.content), text(details.note)].filter(Boolean))].join("\n"),
    legacyResult: text(details.result),
    legacyFollowUpAt: text(details.nextFollowUpAt),
  };
}

/** Both timelines use the same event ID, recorded timestamp, actor and text. */
export function formatWarningHistoryEvent(event: WarningHistoryEvent) {
  const details = event.details || {};
  let detail = "";
  if (event.eventType === "WARNING_DETECTED") detail = label(RISK_LABELS, details.businessStatus);
  else if (event.eventType === "RISK_STATUS_CHANGED") detail = `${label(RISK_LABELS, details.from)} → ${label(RISK_LABELS, details.to)}`;
  else if (event.eventType === "STATUS_CHANGED") detail = `${label(STATUS_LABELS, details.from)} → ${label(STATUS_LABELS, details.to)}`;
  else if (event.eventType === "INTERVENTION_RECORDED") {
    detail = [label(TYPE_LABELS, details.interventionType), details.content, details.result, details.note].filter(Boolean).join(" · ");
  } else if (event.eventType === "FOLLOW_UP_SCHEDULED") {
    detail = details.nextFollowUpAt ? `Đặt lịch ${formatHistoryDate(String(details.nextFollowUpAt))}` : "Đã xóa lịch theo dõi";
  } else if (event.eventType === "NOTE_ADDED") detail = String(details.note || details.content || "");
  const warningEvent = ["WARNING_DETECTED", "RISK_STATUS_CHANGED"].includes(event.eventType);
  if (event.warningContext) {
    const context = event.warningContext;
    const score = warningEvent && context.result
      ? `${context.result.reasonCount} nguyên nhân · GPA kỳ ${context.result.termGpa4 ?? "—"} · GPA tích lũy ${context.result.cumulativeGpa4 ?? "—"}` : "";
    detail = [detail, [context.termCode, context.academicYear].filter(Boolean).join(" "), score].filter(Boolean).join(" · ");
  }
  return {
    id: `event-${event.id}`,
    date: event.createdAt,
    kind: warningEvent ? "Cảnh báo" : "Can thiệp",
    title: EVENT_LABELS[event.eventType] || event.eventType,
    actorName: event.systemGenerated ? "Hệ thống" : (event.actor?.displayName || "Người dùng"),
    detail,
    color: warningEvent ? riskColor(details.to || details.businessStatus)
      : event.eventType === "CASE_RESOLVED" ? "bg-emerald-500" : event.systemGenerated ? "bg-slate-300" : "bg-sky-500",
  };
}

type WarningScan = {
  id: string; runId: string; createdAt: string; businessStatus?: string; presentationState?: string;
  maxSeverity?: string; termCode?: string | null; academicYear?: string | null;
  reasonCount?: number; termGpa4?: number | null; cumulativeGpa4?: number | null;
};

export function buildStudentWarningTimeline(events: WarningHistoryEvent[], scans: WarningScan[]) {
  const coveredRuns = new Set(events.filter(event => ["WARNING_DETECTED", "RISK_STATUS_CHANGED"].includes(event.eventType)).map(event => event.sourceRunId));
  return [
    ...events.map(formatWarningHistoryEvent),
    ...scans.filter(scan => !coveredRuns.has(scan.runId)).map(scan => {
      const status = scan.presentationState || scan.businessStatus || (scan.maxSeverity === "high" ? "HIGH_RISK" : scan.maxSeverity === "medium" ? "MONITORING" : "NORMAL");
      return {
        id: `warning-${scan.id}`, date: scan.createdAt, kind: "Đánh giá học vụ",
        title: `Kết quả đánh giá: ${label(RISK_LABELS, status)}`, actorName: "Hệ thống",
        detail: `${scan.termCode || "Học kỳ"}${scan.academicYear ? ` ${scan.academicYear}` : ""} · ${scan.reasonCount || 0} nguyên nhân · GPA kỳ ${scan.termGpa4 ?? "—"} · GPA tích lũy ${scan.cumulativeGpa4 ?? "—"}`,
        color: riskColor(status),
      };
    }),
  ];
}
