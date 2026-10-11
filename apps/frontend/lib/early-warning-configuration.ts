export type OptionalField = "termGpaBelow" | "cumulativeGpaBelow" | "termGpaDrop" | "cumulativeGpaDrop" | "failedCreditRatioFrom" | "repeatedFailuresFrom" | "conductScoreBelow" | "conductScoreDrop";
export type CreditField = "debtMonitoringFrom" | "debtHighRiskFrom" | "progressMonitoringFrom" | "progressHighRiskFrom";
export type WarningSettings = Record<OptionalField, number | null> & Record<CreditField, number> & { recognizedConductStatusIds: string[] };
export type WarningConfiguration = {
  id: string; name: string; version: number; marginGpa4: number; settings: WarningSettings;
  regulatory: {
    failedCreditRatio: { value: number }; accumulatedDebtCredits: { value: number };
    termGpa: { firstSemesterBelow: number; subsequentSemesterBelow: number };
    cumulativeGpaByYear: { yearLevel: number; gpa4Below: number }[];
  };
};
export type ConfigurationErrors = Partial<Record<OptionalField | CreditField | "name" | "marginGpa4" | "recognizedConductStatusIds", string>>;
export const REGULATION_DOCUMENT = {
  href: "/documents/quy-che-dao-tao-qd600.pdf",
  articleHref: "/documents/quy-che-dao-tao-qd600.pdf#page=25",
  downloadName: "Quy-che-dao-tao-dai-hoc-Da-Lat-QD600.pdf",
  pages: 32,
  bytes: 14_399_078,
};
export const warningNumber = (value: number) => Number.isFinite(value)
  ? new Intl.NumberFormat("vi-VN", { maximumFractionDigits: 2 }).format(value) : "—";

export const signalGroups = [
  { title: "Điểm học tập", fields: ["termGpaBelow", "cumulativeGpaBelow", "termGpaDrop", "cumulativeGpaDrop"] },
  { title: "Kết quả học phần", fields: ["failedCreditRatioFrom", "repeatedFailuresFrom"] },
  { title: "Rèn luyện", fields: ["conductScoreBelow", "conductScoreDrop"] },
] as const;
export const signalFields: Record<OptionalField, {
  label: string; description: string; inputLabel: string; unit: string;
  suggested: number; min: number; max: number; step: number; scale?: number;
}> = {
  termGpaBelow: { label: "GPA học kỳ thấp", description: "Theo dõi điểm trung bình của học kỳ được xét.", inputLabel: "GPA dưới", unit: "điểm / 4", suggested: 2, min: 0, max: 4, step: 0.01 },
  cumulativeGpaBelow: { label: "GPA tích lũy thấp", description: "Theo dõi điểm trung bình tích lũy đến hết kỳ xét.", inputLabel: "GPA dưới", unit: "điểm / 4", suggested: 2, min: 0, max: 4, step: 0.01 },
  termGpaDrop: { label: "GPA học kỳ giảm", description: "So sánh với học kỳ chính liền trước kỳ xét.", inputLabel: "Giảm từ", unit: "điểm", suggested: 0.5, min: 0.01, max: 4, step: 0.01 },
  cumulativeGpaDrop: { label: "GPA tích lũy giảm", description: "So sánh GPA tích lũy giữa hai kỳ chính liền nhau.", inputLabel: "Giảm từ", unit: "điểm", suggested: 0.2, min: 0.01, max: 4, step: 0.01 },
  failedCreditRatioFrom: { label: "Tỷ lệ tín chỉ không đạt", description: "Chỉ tính khi kết quả học phần đủ rõ để xác định tỷ lệ.", inputLabel: "Tỷ lệ từ", unit: "%", suggested: 0.3, min: 0.01, max: 0.5, step: 0.01, scale: 100 },
  repeatedFailuresFrom: { label: "Học phần không đạt nhiều lần", description: "Xét số lần không đạt của học phần vẫn còn nợ.", inputLabel: "Không đạt từ", unit: "lần", suggested: 2, min: 2, max: 100, step: 1 },
  conductScoreBelow: { label: "Điểm rèn luyện thấp", description: "Chỉ sử dụng điểm đã được công nhận của kỳ xét.", inputLabel: "Điểm dưới", unit: "điểm / 100", suggested: 50, min: 0, max: 100, step: 1 },
  conductScoreDrop: { label: "Điểm rèn luyện giảm", description: "So sánh điểm đã công nhận giữa hai kỳ chính liền nhau.", inputLabel: "Giảm từ", unit: "điểm", suggested: 10, min: 1, max: 100, step: 1 },
};

export function recognizedConductStatuses(value: string) {
  return [...new Set(value.split(",").map(item => item.trim()).filter(Boolean))];
}

export function signalDisplayValue(key: OptionalField, value: number) {
  return Number((value * (signalFields[key].scale || 1)).toFixed(8));
}
export function signalStoredValue(key: OptionalField, value: number) {
  return value / (signalFields[key].scale || 1);
}
export function warningConfigurationKey(value: WarningConfiguration) {
  return JSON.stringify(value, (_key, item) => typeof item === "number" && !Number.isFinite(item) ? "INVALID_NUMBER" : item);
}

/** Match backend constraints, with field-specific messages and display units. */
export function validateWarningConfiguration(configuration: WarningConfiguration, statuses: string): ConfigurationErrors {
  const errors: ConfigurationErrors = {};
  if (!configuration.name.trim() || configuration.name.trim().length > 200) errors.name = "Nhập tên chính sách từ 1 đến 200 ký tự.";
  if (!Number.isFinite(configuration.marginGpa4) || configuration.marginGpa4 < 0 || configuration.marginGpa4 > 4) errors.marginGpa4 = "Nhập khoảng GPA từ 0 đến 4 điểm.";
  for (const [key, max] of [["debtMonitoringFrom", 24], ["debtHighRiskFrom", 24], ["progressMonitoringFrom", 200], ["progressHighRiskFrom", 200]] as const) {
    const value = configuration.settings[key];
    if (!Number.isInteger(value) || value < 1 || value > max) errors[key] = `Nhập số nguyên từ 1 đến ${max} tín chỉ.`;
  }
  for (const [monitoring, high] of [["debtMonitoringFrom", "debtHighRiskFrom"], ["progressMonitoringFrom", "progressHighRiskFrom"]] as const) {
    if (!errors[monitoring] && !errors[high] && configuration.settings[monitoring] >= configuration.settings[high]) errors[high] = "Ngưỡng nguy cơ cao phải lớn hơn ngưỡng cần chú ý.";
  }
  for (const key of Object.keys(signalFields) as OptionalField[]) {
    const value = configuration.settings[key];
    if (value === null) continue;
    const field = signalFields[key];
    if (!Number.isFinite(value) || value < field.min || value > field.max || key === "repeatedFailuresFrom" && !Number.isInteger(value)) {
      errors[key] = `Nhập ${key === "repeatedFailuresFrom" ? "số nguyên " : ""}từ ${warningNumber(field.min * (field.scale || 1))} đến ${warningNumber(field.max * (field.scale || 1))} ${field.unit}.`;
    }
  }
  const recognized = recognizedConductStatuses(statuses);
  if (recognized.some(value => value.length > 32)) errors.recognizedConductStatusIds = "Mỗi mã trạng thái có tối đa 32 ký tự.";
  if ((configuration.settings.conductScoreBelow !== null || configuration.settings.conductScoreDrop !== null) && !recognized.length) errors.recognizedConductStatusIds = "Bổ sung mã trạng thái đã xác minh là công nhận trước khi bật tiêu chí rèn luyện.";
  return errors;
}

export function gpaAdvisoryExample(threshold: number, margin: number) {
  if (!Number.isFinite(margin) || margin < 0 || margin > 4) return "Nhập khoảng GPA hợp lệ để xem ví dụ.";
  if (margin === 0) return "Khoảng bằng 0: tắt tín hiệu GPA tích lũy sát ngưỡng. Các tiêu chí GPA khác vẫn được xét.";
  return `GPA từ ${warningNumber(threshold)} đến dưới ${warningNumber(threshold + margin)}: Cần chú ý vì sát ngưỡng học vụ.`;
}
