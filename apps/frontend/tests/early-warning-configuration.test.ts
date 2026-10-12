import assert from "node:assert/strict";
import test from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { conductSignalsAvailable, gpaAdvisoryExample, recognizedConductStatuses, signalDisplayValue, signalStoredValue, validateWarningConfiguration, warningConfigurationKey, REGULATION_DOCUMENT, type WarningConfiguration } from "../lib/early-warning-configuration";
import { WarningRegulationDocument } from "../components/settings/WarningPolicyReference";
import ConductSourceNotice from "../components/settings/ConductSourceNotice";

function configuration(): WarningConfiguration {
  return { id: "policy", name: "Chính sách hỗ trợ sớm", version: 3, marginGpa4: 0.2,
    settings: { termGpaBelow: null, cumulativeGpaBelow: null, termGpaDrop: null, cumulativeGpaDrop: null,
      failedCreditRatioFrom: null, repeatedFailuresFrom: null, conductScoreBelow: null, conductScoreDrop: null,
      debtMonitoringFrom: 13, debtHighRiskFrom: 19, progressMonitoringFrom: 4, progressHighRiskFrom: 12,
      recognizedConductStatusIds: [] },
    regulatory: { failedCreditRatio: { value: 0.5 }, accumulatedDebtCredits: { value: 24 }, termGpa: { firstSemesterBelow: 0.8, subsequentSemesterBelow: 1 }, cumulativeGpaByYear: [{ yearLevel: 1, gpa4Below: 1.2 }] },
  };
}

test("displayed percentage round-trips without changing the API ratio or leaking floating-point digits", () => {
  for (const [ratio, percentage] of [[0.01, 1], [0.29, 29], [0.3, 30], [0.5, 50]]) {
    assert.equal(signalDisplayValue("failedCreditRatioFrom", ratio), percentage);
    assert.equal(signalStoredValue("failedCreditRatioFrom", percentage), ratio);
    const c = configuration(); c.settings.failedCreditRatioFrom = signalStoredValue("failedCreditRatioFrom", percentage);
    assert.deepEqual(validateWarningConfiguration(c, ""), {});
    assert.equal(c.settings.failedCreditRatioFrom, ratio);
  }
  assert.equal(signalStoredValue("termGpaBelow", 2.05), 2.05);
});

test("invalid and empty thresholds cannot become valid zeroes or be submitted", () => {
  const c = configuration(); c.settings.debtMonitoringFrom = NaN; c.marginGpa4 = NaN;
  c.settings.failedCreditRatioFrom = signalStoredValue("failedCreditRatioFrom", 60);
  c.settings.repeatedFailuresFrom = 2.5; c.name = " ";
  const errors = validateWarningConfiguration(c, "");
  assert.ok(errors.debtMonitoringFrom); assert.ok(errors.marginGpa4); assert.ok(errors.repeatedFailuresFrom); assert.ok(errors.name);
  assert.match(errors.failedCreditRatioFrom!, /1 đến 50 %/);
  c.settings.failedCreditRatioFrom = null; assert.equal(validateWarningConfiguration(c, "").failedCreditRatioFrom, undefined);
});

test("an enabled criterion with its numeric input cleared remains an unsaved change that can be discarded", () => {
  const saved = configuration(); const changed = configuration(); changed.settings.termGpaBelow = NaN;
  assert.notEqual(warningConfigurationKey(saved), warningConfigurationKey(changed));
  assert.ok(validateWarningConfiguration(changed, "").termGpaBelow);
});

test("risk ranges stay ordered and backend credit limits are respected", () => {
  const c = configuration(); c.settings.debtHighRiskFrom = c.settings.debtMonitoringFrom;
  c.settings.progressHighRiskFrom = c.settings.progressMonitoringFrom - 1;
  assert.match(validateWarningConfiguration(c, "").debtHighRiskFrom!, /lớn hơn/);
  assert.match(validateWarningConfiguration(c, "").progressHighRiskFrom!, /lớn hơn/);
  c.settings.debtHighRiskFrom = 25; assert.match(validateWarningConfiguration(c, "").debtHighRiskFrom!, /1 đến 24/);
});

test("conduct criteria require verified approval statuses, with trimming and deduplication", () => {
  const c = configuration(); c.settings.conductScoreBelow = 50;
  assert.ok(validateWarningConfiguration(c, " , ").recognizedConductStatusIds);
  assert.deepEqual(validateWarningConfiguration(c, "approved, approved, confirmed "), {});
  assert.deepEqual(recognizedConductStatuses("approved, approved, confirmed "), ["approved", "confirmed"]);
  assert.ok(validateWarningConfiguration(c, "x".repeat(33)).recognizedConductStatusIds);
});

test("conduct controls depend on the saved approval mapping without asking users to enter source codes", () => {
  const c = configuration();
  assert.equal(conductSignalsAvailable(c.settings), false);
  c.settings.failedCreditRatioFrom = 0.3;
  assert.deepEqual(validateWarningConfiguration(c), {}, "unavailable conduct must not block saving academic thresholds");
  c.settings.conductScoreBelow = 50;
  assert.ok(validateWarningConfiguration(c).recognizedConductStatusIds);
  c.settings.recognizedConductStatusIds = ["confirmed"];
  const before = JSON.stringify(c.settings);
  assert.equal(conductSignalsAvailable(c.settings), true);
  assert.deepEqual(validateWarningConfiguration(c), {});
  assert.equal(JSON.stringify(c.settings), before, "availability and validation preserve the source mapping");
  c.settings.recognizedConductStatusIds = [" "];
  assert.equal(conductSignalsAvailable(c.settings), false);
});

test("conduct source notice explains unavailable data and requests only thresholds when ready", () => {
  const pending = renderToStaticMarkup(createElement(ConductSourceNotice, { available: false }));
  assert.match(pending, /Chưa thể bật tiêu chí rèn luyện/);
  assert.match(pending, /vẫn có thể cấu hình và lưu các tiêu chí học tập/);
  const ready = renderToStaticMarkup(createElement(ConductSourceNotice, { available: true }));
  assert.match(ready, /chỉ cần chọn tiêu chí và đặt ngưỡng điểm/);
  assert.doesNotMatch(pending + ready, /<input|StatusID|Nhập.*mã/);
});

test("GPA preview preserves the inclusive lower and exclusive upper bounds, including disabled margin", () => {
  assert.match(gpaAdvisoryExample(1.2, 0.2), /từ 1,2 đến dưới 1,4/);
  assert.match(gpaAdvisoryExample(1.8, 0.2), /từ 1,8 đến dưới 2/);
  assert.match(gpaAdvisoryExample(1.2, 0), /tắt tín hiệu/);
  assert.doesNotMatch(gpaAdvisoryExample(1.2, NaN), /NaN|Cần chú ý/);
});

test("regulation controls expose an actual PDF download and the Article 18 deep link in a new tab", () => {
  const html = renderToStaticMarkup(createElement(WarningRegulationDocument));
  assert.ok(html.includes(`href="${REGULATION_DOCUMENT.articleHref}"`));
  assert.ok(html.includes(`href="${REGULATION_DOCUMENT.href}"`));
  assert.ok(html.includes(`download="${REGULATION_DOCUMENT.downloadName}"`));
  assert.match(html, /Quy chế đào tạo trình độ đại học/);
  assert.match(html, /target="_blank" rel="noopener noreferrer"/);
});
