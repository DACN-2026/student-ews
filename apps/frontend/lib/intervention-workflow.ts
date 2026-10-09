// Shared with the warning queue and the student profile. The API enforces transitions and class scope.
export type InterventionStatus = "OPEN" | "IN_PROGRESS" | "RESOLVED" | "ESCALATED" | "REOPENED";
export const INTERVENTION_STATUS_LABELS: Record<string, string> = {
  OPEN: "Chưa xử lý", IN_PROGRESS: "Đang xử lý", RESOLVED: "Hoàn tất",
  ESCALATED: "Đang xử lý", REOPENED: "Đang xử lý",
};
export const INTERVENTION_TYPE_LABELS: Record<string, string> = {
  REMINDER: "Nhắc nhở", DIRECT_COUNSELING: "Tư vấn trực tiếp", CONTACT: "Liên hệ sinh viên",
  STUDY_PLAN_GUIDANCE: "Hướng dẫn kế hoạch học tập", OTHER: "Khác",
};
export const ALLOWED_TRANSITIONS: Record<string, string[]> = {
  OPEN: ["IN_PROGRESS"], IN_PROGRESS: ["RESOLVED"], ESCALATED: ["RESOLVED"],
  RESOLVED: ["REOPENED"], REOPENED: ["RESOLVED"],
};
export const TRANSITION_ACTION_LABELS: Record<string, string> = {
  IN_PROGRESS: "Bắt đầu xử lý", RESOLVED: "Đánh dấu hoàn tất",
  ESCALATED: "Chuyển cấp trên", REOPENED: "Mở lại can thiệp",
};
