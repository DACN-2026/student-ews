export function requiredPermission(pathname: string, method: string): string | string[] | null {
  if (pathname.startsWith("/api/v1/rbac/users")) return "user.manage";
  if (pathname.startsWith("/api/v1/rbac/roles") || pathname.startsWith("/api/v1/rbac/permissions")) {
    return "role.manage";
  }
  if (
    pathname.startsWith("/api/v1/rbac/advisors") ||
    pathname.startsWith("/api/v1/rbac/advisor-assignments")
  ) return "advisor_assignment.manage";

  if (pathname.startsWith("/api/v1/students")) {
    if (pathname.includes("/grades")) {
      if (pathname.includes("/export")) return "grade.export";
      return "grade.read";
    }
    if (pathname.includes("/decisions")) {
      if (pathname.includes("/export")) return "decision.export";
      if (method === "POST") return "decision.create";
      if (method === "PATCH" || method === "PUT") return "decision.update";
      if (method === "DELETE") return "decision.delete";
      return "decision.read";
    }
    if (pathname.includes("/fee-policies")) {
      if (pathname.includes("/export")) return "fee_policy.export";
      if (method === "POST") return "fee_policy.create";
      if (method === "PATCH" || method === "PUT") return "fee_policy.update";
      if (method === "DELETE") return "fee_policy.delete";
      return "fee_policy.read";
    }
    if (pathname.includes("/import")) return "student.import";
    if (pathname.includes("/export")) return "student.export";
    if (method === "POST") return "student.create";
    if (method === "PATCH" || method === "PUT") return "student.update";
    if (method === "DELETE") return "student.delete";
    return "student.read";
  }

  if (pathname.startsWith("/api/v1/grades/import")) return "grade.import";
  if (pathname.startsWith("/api/v1/decisions/import")) return "decision.import";
  if (pathname.startsWith("/api/v1/decision-types")) {
    if (method === "POST") return "decision.create";
    if (method === "PATCH" || method === "PUT") return "decision.update";
    if (method === "DELETE") return "decision.delete";
    return "decision.read";
  }
  if (pathname.startsWith("/api/v1/fee-policies/import")) return "fee_policy.import";
  if (pathname.startsWith("/api/v1/fee-policy-types")) {
    if (method === "POST") return "fee_policy.create";
    if (method === "PATCH" || method === "PUT") return "fee_policy.update";
    if (method === "DELETE") return "fee_policy.delete";
    return "fee_policy.read";
  }
  if (pathname.startsWith("/api/v1/classes") || pathname.startsWith("/api/v1/cohorts")) {
    if (method === "GET") return ["class.manage", "student.read", "progress.read"];
    return "class.manage";
  }
  if (
    pathname.startsWith("/api/v1/academic-years") ||
    pathname.startsWith("/api/v1/courses") ||
    pathname.startsWith("/api/v1/training-programs")
  ) {
    if (method === "GET") return ["academic_term.manage", "progress.read", "student.read"];
    return "academic_term.manage";
  }
  if (pathname.startsWith("/api/v1/training-progress")) {
    if (
      pathname.includes("/calculate") ||
      ((pathname.includes("/completion/runs") || pathname.includes("/completion-runs")) && method === "POST")
    ) {
      return "progress.calculate";
    }
    if (method !== "GET") return "progress.plan.manage";
    return "progress.read";
  }
  if (pathname.startsWith("/api/v1/graduation-evaluations")) {
    if (pathname.includes("/export")) return "graduation.export";
    if (pathname.endsWith("/preview")) return "graduation.read";
    if (method === "POST") return "graduation.evaluate";
    return "graduation.read";
  }
  if (pathname.startsWith("/api/v1/academic-warnings")) {
    if (pathname.includes("/students/") && pathname.endsWith("/standing") && method === "POST") return "academic_warning.action.update";
    if (pathname === "/api/v1/academic-warnings/policies/early-warning") return "academic_warning.policy.manage";
    if (pathname.includes("/policies") && method !== "GET") return "academic_warning.policy.manage";
    if (pathname.endsWith("/reconcile") && method === "POST") return "academic_warning.calculate";
    if (pathname.includes("/terms/") && pathname.endsWith("/retry") && method === "POST") {
      return "academic_warning.calculate";
    }
    if (pathname.includes("/runs") && method === "POST") return "academic_warning.calculate";
    if (pathname.includes("/interventions/")) {
      if (pathname.includes("/assignment") && (method === "PATCH" || method === "PUT")) {
        return "academic_warning.case.assign";
      }
      if (pathname.includes("/activities") && method === "POST") return "academic_warning.action.create";
      if ((pathname.includes("/status") || pathname.includes("/follow-up")) && (method === "PATCH" || method === "PUT")) {
        return "academic_warning.action.update";
      }
    }
    if (pathname.includes("/actions") && method === "POST") return "academic_warning.action.create";
    if (pathname.includes("/actions") && (method === "PATCH" || method === "PUT")) {
      return "academic_warning.action.update";
    }
    return "academic_warning.read";
  }
  if (pathname.startsWith("/api/v1/academic-context")) return "progress.read";
  if (pathname.startsWith("/api/v1/reports/export")) return "report.export";
  if (pathname.startsWith("/api/v1/dashboard")) return null;
  return null;
}
