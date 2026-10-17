// tsx only needs a stable temp-directory suffix on restricted Windows accounts.
if (process.platform === "win32" && typeof process.geteuid !== "function") {
  process.geteuid = () => 0;
}
