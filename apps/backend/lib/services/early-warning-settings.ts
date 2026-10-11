/** Internal monitoring settings. Null disables a new signal, preserving existing levels. */
export type EarlyWarningSettings = {
  termGpaBelow: number | null;
  cumulativeGpaBelow: number | null;
  termGpaDrop: number | null;
  cumulativeGpaDrop: number | null;
  failedCreditRatioFrom: number | null;
  repeatedFailuresFrom: number | null;
  conductScoreBelow: number | null;
  conductScoreDrop: number | null;
  recognizedConductStatusIds: string[];
  debtMonitoringFrom: number;
  debtHighRiskFrom: number;
  progressMonitoringFrom: number;
  progressHighRiskFrom: number;
};

export const DEFAULT_EARLY_WARNING_SETTINGS: EarlyWarningSettings = {
  termGpaBelow: null, cumulativeGpaBelow: null, termGpaDrop: null, cumulativeGpaDrop: null,
  failedCreditRatioFrom: null, repeatedFailuresFrom: null, conductScoreBelow: null, conductScoreDrop: null,
  recognizedConductStatusIds: [], debtMonitoringFrom: 13, debtHighRiskFrom: 19,
  progressMonitoringFrom: 4, progressHighRiskFrom: 12,
};

export function parseEarlyWarningSettings(value: unknown): EarlyWarningSettings {
  if (value === undefined) return { ...DEFAULT_EARLY_WARNING_SETTINGS, recognizedConductStatusIds: [] };
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Cấu hình theo dõi sớm không hợp lệ.");
  const input = value as Record<string, unknown>;
  const result: EarlyWarningSettings = { ...DEFAULT_EARLY_WARNING_SETTINGS, recognizedConductStatusIds: [] };
  const ranges: Record<Exclude<keyof EarlyWarningSettings, "recognizedConductStatusIds">, [number, number, boolean?]> = {
    termGpaBelow: [0, 4], cumulativeGpaBelow: [0, 4], termGpaDrop: [0.01, 4], cumulativeGpaDrop: [0.01, 4],
    failedCreditRatioFrom: [0.01, 0.5], repeatedFailuresFrom: [2, 100, true],
    conductScoreBelow: [0, 100], conductScoreDrop: [1, 100],
    debtMonitoringFrom: [1, 24, true], debtHighRiskFrom: [1, 24, true],
    progressMonitoringFrom: [1, 200, true], progressHighRiskFrom: [1, 200, true],
  };
  for (const [key, [min, max, integer]] of Object.entries(ranges)) {
    const field = key as keyof typeof ranges;
    const entry = input[field] === undefined ? result[field] : input[field];
    if (entry === null && DEFAULT_EARLY_WARNING_SETTINGS[field] === null) continue;
    if (typeof entry !== "number" || !Number.isFinite(entry) || entry < min || entry > max || integer && !Number.isInteger(entry)) {
      throw new Error(`Ngưỡng ${field} phải nằm trong khoảng ${min}–${max}${integer ? " và là số nguyên" : ""}.`);
    }
    (result as Record<string, unknown>)[field] = entry;
  }
  const statuses = input.recognizedConductStatusIds ?? [];
  if (!Array.isArray(statuses) || statuses.some(entry => typeof entry !== "string" || !entry.trim() || entry.length > 32)) {
    throw new Error("Mã trạng thái công nhận điểm rèn luyện không hợp lệ.");
  }
  result.recognizedConductStatusIds = [...new Set(statuses.map(entry => (entry as string).trim()))];
  if ((result.conductScoreBelow !== null || result.conductScoreDrop !== null) && !result.recognizedConductStatusIds.length) {
    throw new Error("Cần cấu hình mã trạng thái đã công nhận trước khi bật theo dõi rèn luyện.");
  }
  if (result.debtMonitoringFrom >= result.debtHighRiskFrom || result.progressMonitoringFrom >= result.progressHighRiskFrom) {
    throw new Error("Ngưỡng nguy cơ cao phải lớn hơn ngưỡng cần chú ý.");
  }
  return result;
}
