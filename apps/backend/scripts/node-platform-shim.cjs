// tsx asks os.userInfo() for a temp directory suffix on Windows. Some managed
// Windows accounts cannot resolve that call, while a numeric suffix is enough.
if (process.platform === "win32" && typeof process.geteuid !== "function") {
  process.geteuid = () => 0;
}
