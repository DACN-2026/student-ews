import assert from "node:assert/strict";
import test from "node:test";
import { displayedCourseOutcome, latestTermWithGpa, courseFailureLabel, completionCoursePresentation } from "../lib/student-academic-display";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import StudentTranscript from "../components/students/StudentTranscript";
import PendingRegistrations from "../components/students/PendingRegistrations";
import TranscriptContext from "../components/students/TranscriptContext";

test("transcript context keeps cross-cohort registrations separate from recognized credits and historical cutoffs", () => {
  const props = {
    context: { academicYear: "2026-2027", termCode: "HK01", termOrder: 1, boundary: "BEFORE_TERM" as const, programCode: "CQ23CT-PM" },
    pendingRegistrations: [{ courseCode: "TN1001D", courseName: "Toán cao cấp B1", credits: 3, academicYear: "2026-2027", termCode: "HK01" }],
    recognizedCourses: [{ courseCode: "QP2101D", credits: 0, academicYear: "", termCode: "", kind: "UNDATED_CERTIFICATE" as const }],
    historicalWarning: true,
  };
  const before = JSON.stringify(props);
  const html = renderToStaticMarkup(createElement(TranscriptContext, props));
  assert.match(html, /Mốc tính tiến độ/);
  assert.match(html, /Trước HK01 \(2026-2027\)/);
  assert.match(html, /CQ23CT-PM/);
  assert.match(html, /TN1001D/);
  assert.match(html, /Toán cao cấp B1/);
  assert.match(html, /Chưa cộng tín chỉ đã đạt hoặc quy đổi/);
  assert.match(html, /QP2101D/);
  assert.match(html, /0 TC/);
  assert.match(html, /Được miễn học \(M\); không ghi học kỳ gốc/);
  assert.match(html, /Kết quả học lại hoặc bù môn ở kỳ sau không được tính/);
  assert.equal((html.match(/<details\b/g) || []).length, 1);
  assert.doesNotMatch(html, /<details[^>]*\bopen\b/);
  assert.equal(JSON.stringify(props), before);
  assert.equal(renderToStaticMarkup(createElement(TranscriptContext, {})), "");
  const current = renderToStaticMarkup(createElement(TranscriptContext, { context: { ...props.context, boundary: "END_OF_TERM" } }));
  assert.match(current, /Hết HK01 \(2026-2027\)/);
  assert.doesNotMatch(current, /Kết quả học lại hoặc bù môn|Xem chi tiết|đang chờ kết quả/);
});

test("transcript never invents F for VT or a pass for an unknown result", () => {
  assert.equal(displayedCourseOutcome({ specialCode: "VT", isPassed: true, notScore: true }), "passed");
  assert.equal(displayedCourseOutcome({ specialCode: "VT", isPassed: false, scoreStatus: "special" }), "failed");
  assert.equal(displayedCourseOutcome({ specialCode: "VT" }), "unknown");
  assert.equal(displayedCourseOutcome({ scoreStatus: "unknown", isPassed: false }), "unknown");
  assert.equal(displayedCourseOutcome({ scoreStatus: "graded", isPass: true }), "passed");
  assert.equal(displayedCourseOutcome({ isPassed: false, scoreStatus: "pending", notScore: true }), "pending");
  assert.equal(displayedCourseOutcome({ isPassed: true, isRecognized: true, scoreStatus: "unknown" }), "passed");
  assert.equal(displayedCourseOutcome({ isPassed: false, notScore: false, scoreStatus: "unknown" }), "failed");
  assert.equal(displayedCourseOutcome({ isPassed: null, notScore: false, scoreStatus: "unknown" }), "unknown");
});

test("cross-cohort pending registration shows the actual source code and period without inventing a result", () => {
  const items = [{ courseCode: "TN1001D", courseName: "Toán cao cấp B1", credits: 3, academicYear: "2026-2027", termCode: "HK01" }];
  const html = renderToStaticMarkup(createElement(PendingRegistrations, { items }));
  assert.match(html, /TN1001D/);
  assert.match(html, /Toán cao cấp B1/);
  assert.match(html, /HK01 \(2026-2027\)/);
  assert.match(html, /Chờ kết quả/);
  assert.doesNotMatch(html, /20TN1201|Cần đối soát|Không đạt/);
  assert.equal(renderToStaticMarkup(createElement(PendingRegistrations, { items: [] })), "");
});

test("latest GPA keeps zero and current-program context while excluding later ungraded periods", () => {
  const terms = [{ programCode: "CURRENT", gpa4: 0 }, { programCode: "OTHER", gpa4: 3 }, { programCode: "CURRENT", gpa4: null }];
  assert.equal(latestTermWithGpa(terms, "CURRENT"), terms[0]);
  assert.equal(latestTermWithGpa(terms, "MISSING"), undefined);
});

test("failure advice preserves VT and only names F when the source actually supplies F", () => {
  const grade = { specialCode: "VT", letterGrade: "VT", isPassed: false, scoreStatus: "special" };
  const before = JSON.stringify(grade);
  assert.match(courseFailureLabel(grade), /Vắng thi \(VT\)/);
  assert.doesNotMatch(courseFailureLabel(grade), /\(F\)/);
  assert.equal(courseFailureLabel({ letterGrade: "F" }), "Chưa đạt (F)");
  assert.equal(courseFailureLabel({ letterGrade: "D", isPassed: false }), "Chưa đạt");
  assert.equal(courseFailureLabel(), "Chưa đạt");
  assert.equal(JSON.stringify(grade), before);
});

test("completion distinguishes elective alternatives, pending outcomes, future requirements and review", () => {
  const course = { passed: false, pendingResult: false, requirementType: "elective", isRegistrationRequired: false };
  assert.equal(completionCoursePresentation(course, true).tone, "neutral");
  assert.match(completionCoursePresentation(course, true).label, /Môn lựa chọn/);
  assert.equal(completionCoursePresentation({ ...course, pendingResult: true }, true).label, "Chờ kết quả");
  assert.equal(completionCoursePresentation(course, false).label, "Chưa đến hạn");
  assert.equal(completionCoursePresentation(course, true, true).label, "Chưa kết luận");
  assert.equal(completionCoursePresentation({ ...course, passed: true }, true).label, "Đã tích lũy");
  assert.equal(completionCoursePresentation({ ...course, requirementType: "mandatory" }, true).label, "Chưa hoàn thành yêu cầu");
});

test("rendered transcript retains a failed attempt before a later pass and labels unknown and exempt source rows explicitly", () => {
  const grades = [
    { id: "old", courseCode: "A", courseName: "History", credits: 3, academicYear: "2023-2024", termCode: "HK01", isPassed: false, scoreStatus: "graded", letterGrade: "F" },
    { id: "retry", courseCode: "A", courseName: "History", credits: 3, academicYear: "2024-2025", termCode: "HK03", isPassed: true, scoreStatus: "graded" },
    { id: "unknown", courseCode: "B", courseName: "Unknown result", credits: 3, scoreStatus: "unknown" },
  ];
  const unscoped = [{ id: "m", courseCode: "QP2101D", courseName: "Miễn theo nguồn", credits: 3, isPassed: true, isRecognized: true, recognitionCode: "M" }];
  const before = JSON.stringify({ grades, unscoped });
  const html = renderToStaticMarkup(createElement(StudentTranscript, { grades, summaries: [], unscoped }));
  assert.equal((html.match(/>A<\/td>/g) ?? []).length, 2);
  assert.match(html, /Không đạt/);
  assert.match(html, /Unknown result[\s\S]*?Chưa xác định kết quả/);
  assert.match(html, /Miễn theo nguồn[\s\S]*?Đạt/);
  assert.match(html, /Không ghi học kỳ gốc/);
  assert.equal(JSON.stringify({ grades, unscoped }), before);
});
