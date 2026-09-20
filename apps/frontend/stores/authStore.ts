import { create } from "zustand";
import { apiFetch } from "@/lib/api-client";

export type Role =
  | "SYSTEM_ADMIN"
  | "FACULTY_BOARD"
  | "CLASS_ADVISOR"
  | "FACULTY_STAFF"
  | "STUDENT_AFFAIRS_ASSISTANT"
  | "COMMS_ASSISTANT";

export interface Grant {
  role: string;
  scope: string;
  permission: string;
}

export interface User {
  id: string;
  username: string;
  fullName: string;
  email?: string | null;
  role: Role;
  facultyId?: string;
  className?: string;
}

export const ROLE_PERMISSIONS: Record<Role, string[]> = {
  SYSTEM_ADMIN: [
    "student.read",
    "student.create",
    "student.update",
    "student.delete",
    "student.import",
    "student.export",
    "class.manage",
    "academic_term.manage",
    "progress.read",
    "progress.plan.manage",
    "progress.calculate",
    "academic_warning.read",
    "academic_warning.calculate",
    "academic_warning.policy.manage",
    "academic_warning.action.create",
    "academic_warning.action.update",
    "user.manage",
    "role.manage",
    "advisor_assignment.manage",
    "decision.read",
    "decision.create",
    "decision.update",
    "decision.delete",
    "decision.import",
    "decision.export",
    "fee_policy.read",
    "fee_policy.create",
    "fee_policy.update",
    "fee_policy.delete",
    "fee_policy.import",
    "fee_policy.export",
    "grade.read",
    "grade.import",
    "grade.export",
  ],
  FACULTY_BOARD: [
    "student.read",
    "student.export",
    "class.manage",
    "academic_term.manage",
    "progress.read",
    "progress.plan.manage",
    "progress.calculate",
    "academic_warning.read",
    "academic_warning.calculate",
    "academic_warning.action.create",
    "academic_warning.action.update",
    "decision.read",
    "fee_policy.read",
    "grade.read",
  ],
  CLASS_ADVISOR: [
    "student.read",
    "grade.read",
    "decision.read",
    "fee_policy.read",
    "progress.read",
    "academic_warning.read",
    "academic_warning.action.create",
    "academic_warning.action.update",
  ],
  FACULTY_STAFF: [
    "student.read",
    "class.manage",
    "academic_term.manage",
    "progress.read",
    "progress.plan.manage",
    "progress.calculate",
    "academic_warning.read",
    "academic_warning.action.create",
    "academic_warning.action.update",
    "decision.read",
    "grade.read",
  ],
  STUDENT_AFFAIRS_ASSISTANT: [
    "student.read",
    "student.import",
    "student.export",
    "grade.read",
    "decision.read",
    "decision.create",
    "decision.update",
    "decision.delete",
    "decision.import",
    "decision.export",
    "fee_policy.read",
    "fee_policy.create",
    "fee_policy.update",
    "fee_policy.delete",
    "fee_policy.import",
    "fee_policy.export",
    "academic_warning.read",
    "academic_warning.action.create",
    "academic_warning.action.update",
  ],
  COMMS_ASSISTANT: [
    "student.read",
    "grade.read",
  ],
};

export const ROLE_USER_PRESETS: Record<Role, { name: string; unit: string; username: string }> = {
  SYSTEM_ADMIN: { name: "Quản trị viên Hệ thống", unit: "Phòng Kỹ thuật", username: "admin" },
  FACULTY_BOARD: { name: "PGS.TS Lê Văn Hùng", unit: "Ban CN Khoa CNTT", username: "bcn_khoa" },
  CLASS_ADVISOR: { name: "ThS. Nguyễn Thị Hoa", unit: "Cố vấn học tập K45", username: "cvht_hoa" },
  FACULTY_STAFF: { name: "Cô Nguyễn Bích Trâm", unit: "Giáo vụ Khoa CNTT", username: "giao_vu" },
  STUDENT_AFFAIRS_ASSISTANT: { name: "CN. Trần Minh Phúc", unit: "Phòng Công tác SV", username: "ctsv_phuc" },
  COMMS_ASSISTANT: { name: "Nguyễn Văn An", unit: "Tổ Truyền thông", username: "truyenthong" },
};

interface AuthState {
  user: User | null;
  grants: Grant[];
  permissions: Set<string>;
  dataScopes: Set<string>;
  isAuthenticated: boolean;
  status: "idle" | "loading" | "authenticated" | "anonymous";

  // Actions
  login: (credentials: { username: string; password: string }) => Promise<void>;
  logout: () => Promise<void>;
  bootstrap: () => Promise<void>;
  can: (permission: string | string[]) => boolean;
  hasDataScope: (scope: string) => boolean;
  hasRole: (role: string) => boolean;
}

export const useAuthStore = create<AuthState>((set, get) => ({
  user: null,
  grants: [],
  permissions: new Set(),
  dataScopes: new Set(),
  isAuthenticated: false,
  status: "idle",

  async login(param) {
    set({ status: "loading" });
    const res = await fetch("/api/v1/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(param),
    });
    if (!res.ok) {
      set({ status: "anonymous", isAuthenticated: false });
      const payload = await res.json().catch(() => null);
      throw new Error(payload?.error?.message || "Tên đăng nhập hoặc mật khẩu không chính xác");
    }
    applySession(await res.json(), set);
  },

  async logout() {
    await fetch("/api/v1/auth/logout", { method: "POST", keepalive: true }).catch(() => undefined);
    set({
      user: null,
      grants: [],
      permissions: new Set(),
      dataScopes: new Set(),
      isAuthenticated: false,
      status: "anonymous",
    });
  },

  async bootstrap() {
    try {
      const res = await apiFetch("/api/v1/auth/me");

      if (res.ok) {
        applySession(await res.json(), set);
        return;
      }
    } catch {
      // Fallback
    }

    set({ status: "anonymous", isAuthenticated: false, user: null });
  },

  can(permission: string | string[]) {
    const state = get();
    // Admin always has all permissions
    if (state.user?.role === "SYSTEM_ADMIN" || state.grants.some((g) => g.role === "admin")) {
      return true;
    }

    if (Array.isArray(permission)) {
      return permission.some((p) => state.permissions.has(p));
    }
    return state.permissions.has(permission);
  },

  hasDataScope(scope: string) {
    const state = get();
    if (state.dataScopes.has("system")) return true;
    return state.dataScopes.has(scope);
  },

  hasRole(roleName: string) {
    const state = get();
    if (state.user?.role === roleName) return true;
    return state.grants.some((g) => g.role === roleName);
  },
}));

type StoreSetter = (partial: Partial<AuthState>) => void;

function applySession(data: { user: Omit<User, "role">; actor?: { grants?: Grant[] } }, set: StoreSetter) {
  const grants = data.actor?.grants || [];
  const permissions = new Set(grants.map((grant) => grant.permission).filter(Boolean));
  const dataScopes = new Set(grants.map((grant) => grant.scope).filter(Boolean));
  const isAdmin = grants.some((grant) => grant.role === "admin");
  if (isAdmin) {
    ROLE_PERMISSIONS.SYSTEM_ADMIN.forEach((permission) => permissions.add(permission));
    dataScopes.add("system");
  }
  const role = roleFromGrants(grants);
  set({
    user: { ...data.user, role },
    grants,
    permissions,
    dataScopes,
    isAuthenticated: true,
    status: "authenticated",
  });
}

function roleFromGrants(grants: Grant[]): Role {
  const code = grants[0]?.role?.toLowerCase();
  if (code === "admin") return "SYSTEM_ADMIN";
  if (code === "faculty_manager") return "FACULTY_BOARD";
  if (code === "class_advisor") return "CLASS_ADVISOR";
  if (code === "student_affairs") return "STUDENT_AFFAIRS_ASSISTANT";
  if (code === "communications") return "COMMS_ASSISTANT";
  return "FACULTY_STAFF";
}
