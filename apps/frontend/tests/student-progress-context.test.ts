import assert from "node:assert/strict";
import test from "node:test";
import { studentProgressEndpoint } from "../lib/student-progress-context";

test("warning evidence and manual refresh use the same pinned result; current progress is a separate request", () => {
  assert.equal(studentProgressEndpoint("student", "result"), "/api/v1/students/student/training-progress?warningResultId=result");
  assert.equal(studentProgressEndpoint("student"), "/api/v1/students/student/training-progress");
  const url = new URL(studentProgressEndpoint("student/x", "result&next=other"), "http://localhost");
  assert.equal(url.pathname, "/api/v1/students/student%2Fx/training-progress");
  assert.equal(url.searchParams.get("warningResultId"), "result&next=other");
  assert.equal(url.searchParams.has("next"), false);
});
