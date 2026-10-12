import assert from "node:assert/strict";
import test from "node:test";
import { latestOfficialWarningResult } from "../lib/services/academic-warnings";

test("rerunning an older term never replaces the latest semester in a student profile", () => {
  const years = [{ id: "new", sYearCode: "2025-2026" }, { id: "old", sYearCode: "2024-2025" }];
  const terms = [{ id: "hk2", academicYearId: "new", sTermOrder: 2 }, { id: "hk1", academicYearId: "new", sTermOrder: 1 }, { id: "old-hk2", academicYearId: "old", sTermOrder: 2 }];
  const candidates = [{ id: "old", runId: "old-run", createdAt: new Date("2026-10-12T03:00:00Z") }, { id: "hk1", runId: "hk1-run", createdAt: new Date("2026-10-12T02:00:00Z") }, { id: "current", runId: "current-run", createdAt: new Date("2026-10-12T01:00:00Z") }];
  const before = JSON.stringify(candidates);
  assert.equal(latestOfficialWarningResult(candidates, [{ id: "old-run", assessmentAcademicTermId: "old-hk2" }, { id: "hk1-run", assessmentAcademicTermId: "hk1" }, { id: "current-run", assessmentAcademicTermId: "hk2" }], terms, years)?.id, "current");
  assert.equal(JSON.stringify(candidates), before);
});

test("the latest completed run within a semester wins and unofficial runs are excluded", () => {
  const terms = [{ id: "hk2", academicYearId: "y", sTermOrder: 2 }];
  const years = [{ id: "y", sYearCode: "2025-2026" }];
  const candidates = [{ id: "unofficial", runId: "draft", createdAt: new Date("2026-10-12T03:00:00Z") }, { id: "earlier", runId: "old", createdAt: new Date("2026-10-12T02:00:00Z") }, { id: "selected", runId: "latest", createdAt: new Date("2026-10-12T01:00:00Z") }];
  assert.equal(latestOfficialWarningResult(candidates, [{ id: "latest", assessmentAcademicTermId: "hk2" }, { id: "old", assessmentAcademicTermId: "hk2" }], terms, years)?.id, "selected");
  assert.equal(latestOfficialWarningResult(candidates, [], terms, years), null);
});
