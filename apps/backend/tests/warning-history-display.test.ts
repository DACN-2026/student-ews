import assert from "node:assert/strict";
import test from "node:test";
import { buildStudentWarningTimeline, formatWarningHistoryEvent, interventionHistoryDetails, type WarningHistoryEvent } from "../../frontend/lib/warning-history";

const event = (id: string, eventType: string, details: Record<string, unknown>, sourceRunId: string | null = "old-run"): WarningHistoryEvent => ({
  id, caseId: "case", eventType, details, sourceRunId, actor: null, systemGenerated: true, createdAt: "2026-10-07T05:11:03Z",
});
const scan = (id: string, runId: string, businessStatus: string) => ({ id, runId, businessStatus, createdAt: "2026-10-07T05:11:03Z", maxSeverity: "none", termCode: "HK02", academicYear: "2025-2026" });

test("student timeline includes the exact case events without duplicating their scan", () => {
  const events = [event("created", "CASE_CREATED", {}), event("detected", "WARNING_DETECTED", { businessStatus: "HIGH_RISK" }),
    event("changed", "RISK_STATUS_CHANGED", { from: "HIGH_RISK", to: "NORMAL" }, "new-run")];
  const before = JSON.stringify(events);
  const timeline = buildStudentWarningTimeline(events, [scan("old", "old-run", "HIGH_RISK"), scan("new", "new-run", "NORMAL")]);
  assert.deepEqual(timeline, events.map(formatWarningHistoryEvent));
  assert.equal(timeline.length, 3);
  assert.equal(timeline[2].detail, "Nguy cơ cao → Bình thường");
  assert.equal(timeline[2].color, "bg-emerald-500");
  assert.equal(JSON.stringify(events), before);
});

test("normal and insufficient scans are never mislabeled as yellow warnings", () => {
  const timeline = buildStudentWarningTimeline([], [scan("normal", "r1", "NORMAL"), scan("partial", "r2", "PARTIAL_NO_RISK"),
    scan("unknown", "r3", "INSUFFICIENT_DATA"), scan("monitor", "r4", "MONITORING")]);
  assert.equal(timeline[0].title, "Kết quả đánh giá: Bình thường");
  assert.equal(timeline[1].color, "bg-emerald-500");
  assert.equal(timeline[2].title, "Kết quả đánh giá: Chưa đủ dữ liệu");
  assert.equal(timeline[3].title, "Kết quả đánh giá: Cần chú ý");
});

test("intervention and warning events retain the same actor, full content, time and source metrics", () => {
  const recorded = { ...event("help", "INTERVENTION_RECORDED", { interventionType: "DIRECT_COUNSELING", content: "Đã gặp sinh viên", result: "Thống nhất kế hoạch", note: "Theo dõi tuần sau" }, null),
    systemGenerated: false, actor: { userId: "teacher", displayName: "Cố vấn" } };
  const detected = { ...event("warn", "WARNING_DETECTED", { businessStatus: "HIGH_RISK" }),
    warningContext: { termCode: "HK02", academicYear: "2025-2026", result: { termGpa4: 0, cumulativeGpa4: 2, reasonCount: 1 } } };
  const timeline = buildStudentWarningTimeline([recorded, detected], []);
  assert.equal(timeline[0].actorName, "Cố vấn");
  assert.equal(timeline[0].date, recorded.createdAt);
  assert.ok(timeline[0].detail.includes("Thống nhất kế hoạch · Theo dõi tuần sau"));
  assert.ok(timeline[1].detail.includes("HK02 2025-2026 · 1 nguyên nhân · GPA kỳ 0 · GPA tích lũy 2"));
});

test("support journal distinguishes actual occurrence from recording time and preserves old and optional notes", () => {
  const recorded = event("help", "INTERVENTION_RECORDED", {
    interventionType: "CONTACT", occurredAt: "2026-10-06T02:30:00Z", note: "Ghi chú\nDòng thứ hai",
  }, null);
  assert.deepEqual(interventionHistoryDetails(recorded), {
    typeLabel: "Liên hệ sinh viên", occurredAt: "2026-10-06T02:30:00Z", note: "Ghi chú\nDòng thứ hai", legacyResult: "", legacyFollowUpAt: "",
  });
  assert.equal(interventionHistoryDetails(event("blank", "INTERVENTION_RECORDED", { interventionType: "REMINDER", note: null })).note, "");
  const legacy = interventionHistoryDetails(event("old", "INTERVENTION_RECORDED", { interventionType: "DIRECT_COUNSELING", content: "Nội dung trước đây", note: "Ghi chú cũ", result: "Kết quả cũ", occurredAt: "invalid" }));
  assert.equal(legacy.note, "Nội dung trước đây\nGhi chú cũ");
  assert.equal(legacy.legacyResult, "Kết quả cũ");
  assert.equal(legacy.occurredAt, "2026-10-07T05:11:03Z");
});
