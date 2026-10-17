import assert from "node:assert/strict";
import test from "node:test";
import { canonicalPlanCourseSnapshots, reconcilePlanCourseSnapshots } from "../lib/services/plan-course-snapshot";

const catalog = [{ id: "exact", sCourseCode: "20CT4201D", sCourseName: "Thực tập nghề nghiệp" },
  { id: "different", sCourseCode: "20CT4201", sCourseName: "Thực tập nghề nghiệp" }];
const row = { id: "row", courseId: "exact", sCourseCode: "20CT4201", sCourseName: "Thực tập nghề nghiệp", sCredits: 8, requirementType: "mandatory", choiceGroupCode: null, isRegistrationRequired: true };
const requirement = { courseId: "exact", courseCode: "20CT4201D", credits: 8, semesterNo: 9, requirementType: "Bắt Buộc" };

test("create/update snapshots use catalog ID even when a supplied code names a different same-name course", () => {
  const input = [{ courseId: "exact", courseCode: "20CT4201", courseName: "Client label", credits: 8, requirementType: "mandatory" }];
  const before = JSON.stringify(input);
  const [snapshot] = canonicalPlanCourseSnapshots(input,catalog);
  assert.equal(snapshot.courseCode,"20CT4201D"); assert.equal(snapshot.courseName,"Thực tập nghề nghiệp");
  assert.equal(snapshot.courseId,"exact"); assert.equal(snapshot.credits,8);
  assert.equal(JSON.stringify(input),before);
});

test("snapshot correction preserves the same course, credits and requirements and is idempotent", () => {
  const before = JSON.stringify(row);
  const correction = reconcilePlanCourseSnapshots([row],catalog,[requirement],9);
  assert.deepEqual(correction.issues,[]); assert.equal(correction.changes.length,1);
  assert.deepEqual(correction.courses[0],{ ...row,sCourseCode:"20CT4201D" });
  assert.equal(JSON.stringify(row),before);
  assert.equal(reconcilePlanCourseSnapshots(correction.courses,catalog,[requirement],9).changes.length,0);
});

test("same names, suffixes or credits cannot supply missing course-ID or curriculum evidence", () => {
  for (const requirements of [[], [{ ...requirement,courseId:"different" }], [{ ...requirement,credits:3 }],
    [{ ...requirement,semesterNo:8 }], [{ ...requirement,requirementType:"Tự Chọn" }]]) {
    const correction = reconcilePlanCourseSnapshots([row],catalog,requirements,9);
    assert.equal(correction.changes.length,0); assert.equal(correction.issues.length,1);
    assert.deepEqual(correction.courses[0],row);
  }
});

test("unknown and duplicate selected IDs fail before creating ambiguous plan rows", () => {
  assert.throws(() => canonicalPlanCourseSnapshots([{courseId:"missing"}],catalog),/Không tìm thấy/);
  assert.throws(() => canonicalPlanCourseSnapshots([{courseId:"exact"},{courseId:"exact"}],catalog),/bị lặp/);
});
