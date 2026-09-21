const path = require("node:path");
const { spawnSync } = require("node:child_process");

const shim = path.join(__dirname, "node-test-shim.cjs");
const existingOptions = process.env.NODE_OPTIONS || "";
const env = {
  ...process.env,
  NODE_OPTIONS: `${existingOptions} --require=${JSON.stringify(shim)}`.trim(),
};
const cli = require.resolve("tsx/cli");
const result = spawnSync(process.execPath, [cli, "--test", "tests/backend.test.ts", "tests/graduation-spec.test.ts"], {
  cwd: path.join(__dirname, ".."),
  env,
  stdio: "inherit",
});

process.exit(result.status ?? 1);
