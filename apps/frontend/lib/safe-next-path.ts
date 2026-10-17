export function safeNextPath(candidate: string | null | undefined): string {
  if (!candidate || !candidate.startsWith("/") || candidate.startsWith("//") || /[\\\u0000-\u0020]/.test(candidate)) return "/dashboard";
  const pathname = candidate.split(/[?#]/, 1)[0];
  if (["/login", "/renew"].includes(pathname)) return "/dashboard";
  return candidate;
}
