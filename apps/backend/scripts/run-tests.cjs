const path = require("node:path");
const { spawnSync } = require("node:child_process");

const shim = path.join(__dirname, "node-test-shim.cjs");
const existingOptions = process.env.NODE_OPTIONS || "";
const env = {
  ...process.env,
  NODE_OPTIONS: `${existingOptions} --require=${JSON.stringify(shim)}`.trim(),
};
const cli = require.resolve("tsx/cli");
const requestedTests = process.argv.slice(2);
const testFiles = requestedTests.length ? requestedTests : [
  "tests/backend.test.ts",
  "tests/lazy-loading.test.ts",
  "tests/student-monitoring-scope.test.ts",
  "tests/credit-milestone.test.ts",
  "tests/academic-course-rules.test.ts",
  "tests/academic-debt-blocks.test.ts",
  "tests/academic-debt-warning-levels.test.ts",
  "tests/academic-warning-automation.test.ts",
  "tests/academic-warning-qd600-run-contract.test.ts",
  "tests/academic-warning-term-selection.test.ts",
  "tests/graduation-spec.test.ts",
  "tests/intervention-api.test.ts",
  "tests/intervention-cases.test.ts",
  "tests/warning-history-display.test.ts",
  "tests/actual-study-semester.test.ts",
  "tests/student-progress-cohort.test.ts",
  "tests/semester-grade-summary.test.ts",
];
const result = spawnSync(process.execPath, [
  cli,
  "--test",
  ...testFiles,
], {
  cwd: path.join(__dirname, ".."),
  env,
  stdio: "inherit",
});

process.exit(result.status ?? 1);
