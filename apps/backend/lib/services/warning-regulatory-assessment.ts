/** A business risk level is independent from matching a regulatory threshold. */
export function regulatoryAssessment(value: unknown): "BREACHED" | "NOT_BREACHED" | "UNRESOLVED" {
  const rules = Array.isArray(value) ? value : value && typeof value === "object" && "rules" in value ? value.rules : [];
  if (!Array.isArray(rules)) return "UNRESOLVED";
  const regulatory = rules.filter(rule => rule && typeof rule === "object" && rule.sourceType === "REGULATORY");
  if (regulatory.some(rule => rule.evaluationStatus === "EVALUATED" && rule.isThresholdBreached === true)) return "BREACHED";
  return regulatory.length === 4 && regulatory.every(rule => rule.evaluationStatus === "EVALUATED") ? "NOT_BREACHED" : "UNRESOLVED";
}
