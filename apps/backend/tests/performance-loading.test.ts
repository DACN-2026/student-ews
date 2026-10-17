import assert from "node:assert/strict";
import test from "node:test";
import { InFlightRequests } from "../lib/utils/in-flight";
import { loadSourceCreditRecognitions } from "../lib/services/source-credit-recognition";

test("concurrent configuration reads share work only within the same key and retry after failure", async () => {
  const requests = new InFlightRequests<string>();
  let calls = 0;
  let finish!: (value: string) => void;
  const load = () => { calls++; return new Promise<string>(resolve => { finish = resolve; }); };
  const a = requests.run("program-a:cohort-1", load);
  const b = requests.run("program-a:cohort-1", load);
  assert.equal(a, b);
  assert.equal(await requests.run("program-a:cohort-2", async () => "other cohort"), "other cohort");
  finish("same configuration");
  assert.deepEqual(await Promise.all([a, b]), ["same configuration", "same configuration"]);
  assert.equal(calls, 1);
  assert.equal(await requests.run("program-a:cohort-1", async () => "fresh read"), "fresh read");
  const failed = requests.run("retry", async () => { throw new Error("database unavailable"); });
  const sibling = requests.run("retry", async () => "must not replace ongoing failure");
  await assert.rejects(failed, /database unavailable/);
  await assert.rejects(sibling, /database unavailable/);
  assert.equal(await requests.run("retry", async () => "recovered"), "recovered");
});

test("preloaded recognition records preserve student isolation and historical waiver boundaries", async () => {
  const records = ["a", "b"].map(studentId => ({ id: `record-${studentId}`, studentId, sCourseCode: "QP2101D", sCourseName: "Giáo dục quốc phòng", sCredits: 3,
    sourcePayload: { DiemChuyenMien: "M", IsPass: true, StudyProgramID: "CQ23CT-PM" } }));
  const data = { records, decisions: [], terms: [], years: [] } as unknown as NonNullable<Parameters<typeof loadSourceCreditRecognitions>[4]>;
  const before = JSON.stringify(data);
  const cutoff = { academicYear: "2026-2027", termCode: "HK01", termOrder: 1 };
  const current = await loadSourceCreditRecognitions(["a"], "CQ23CT-PM", cutoff, { includeUndatedConditional: true }, data);
  assert.deepEqual([...current.keys()], ["a"]);
  assert.equal(current.get("a")?.attempts.length, 1);
  assert.equal(current.get("a")?.attempts[0].recognition.sourceRecordId, "record-a");
  const history = await loadSourceCreditRecognitions(["a"], "CQ23CT-PM", cutoff, {}, data);
  assert.equal(history.get("a")?.attempts.length, 0);
  assert.equal(JSON.stringify(data), before);
});
