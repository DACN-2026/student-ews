export const EARLY_WARNING_CASE_TYPE = "EARLY_WARNING_CASE" as const;
// Preserve erroneous system-only episodes for audit, outside work queues and
// legacy warning actions. Their events are never rewritten or deleted.
export const SUPERSEDED_EARLY_WARNING_CASE_TYPE = "SUPERSEDED_EARLY_WARNING_CASE" as const;
