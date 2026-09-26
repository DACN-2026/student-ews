"use client";

import { useState, useEffect, useMemo } from "react";
import { apiFetch } from "@/lib/api-client";
import Tabs from "@/components/ui/Tabs";
import FilterBar from "@/components/ui/FilterBar";
import Modal from "@/components/ui/Modal";
import ConfirmDialog from "@/components/ui/ConfirmDialog";
import ForbiddenState from "@/components/ui/ForbiddenState";
import { useAuthStore } from "@/stores/authStore";

type RbacTab = "users" | "roles" | "advisors";

interface RoleMetadata {
  label: string;
  defaultScope: string;
  description: string;
  colorClass: string;
  badgeBg: string;
}

const ROLE_METADATA_MAP: Record<string, RoleMetadata> = {
  admin: {
    label: "Quản trị hệ thống",
    defaultScope: "Toàn hệ thống",
    description: "Quản lý tài khoản, quyền và cấu hình hệ thống",
    colorClass: "text-purple-700 bg-purple-50 border-purple-200/80",
    badgeBg: "bg-purple-100 text-purple-800",
  },
  faculty_manager: {
    label: "Ban chủ nhiệm Khoa",
    defaultScope: "Phạm vi Khoa",
    description: "Xem và vận hành dữ liệu toàn Khoa",
    colorClass: "text-blue-700 bg-blue-50 border-blue-200/80",
    badgeBg: "bg-blue-100 text-blue-800",
  },
  class_advisor: {
    label: "GVCN / CVHT",
    defaultScope: "Lớp được phân công",
    description: "Quản lý và theo dõi lớp được phân công",
    colorClass: "text-emerald-700 bg-emerald-50 border-emerald-200/80",
    badgeBg: "bg-emerald-100 text-emerald-800",
  },
  faculty_staff: {
    label: "Giáo vụ Khoa",
    defaultScope: "Phạm vi Khoa",
    description: "Quản lý chương trình đào tạo và dữ liệu học vụ",
    colorClass: "text-teal-700 bg-teal-50 border-teal-200/80",
    badgeBg: "bg-teal-100 text-teal-800",
  },
  student_affairs: {
    label: "Công tác sinh viên",
    defaultScope: "Phòng CTSV",
    description: "Quản lý hồ sơ, quyết định, chế độ chính sách",
    colorClass: "text-amber-700 bg-amber-50 border-amber-200/80",
    badgeBg: "bg-amber-100 text-amber-800",
  },
  ctsv_staff: {
    label: "Công tác sinh viên",
    defaultScope: "Phòng CTSV",
    description: "Quản lý hồ sơ, quyết định, chế độ chính sách",
    colorClass: "text-amber-700 bg-amber-50 border-amber-200/80",
    badgeBg: "bg-amber-100 text-amber-800",
  },
  communications: {
    label: "Tổ Truyền thông",
    defaultScope: "Toàn hệ thống",
    description: "Xem dữ liệu thống kê và báo cáo",
    colorClass: "text-indigo-700 bg-indigo-50 border-indigo-200/80",
    badgeBg: "bg-indigo-100 text-indigo-800",
  },
};

function getRoleMetadata(code: string): RoleMetadata {
  return (
    ROLE_METADATA_MAP[code] || {
      label: code,
      defaultScope: "Theo phân quyền",
      description: "Vai trò tùy chỉnh trong hệ thống",
      colorClass: "text-slate-700 bg-slate-100 border-slate-200",
      badgeBg: "bg-slate-200 text-slate-800",
    }
  );
}

function getUserDataScope(user: ApiData, advisors: ApiData[]) {
  const roleCodes: string[] = user.roleCodes || (user.roles ? user.roles.map((r: ApiData) => r.code) : []);

  if (roleCodes.includes("admin")) {
    return {
      label: "Toàn hệ thống",
      subLabel: "Tất cả Khoa & Lớp",
      badgeStyle: "bg-slate-100 text-slate-700 border-slate-200",
    };
  }

  if (roleCodes.includes("faculty_manager") || roleCodes.includes("faculty_staff")) {
    return {
      label: "Phạm vi Khoa",
      subLabel: "Dữ liệu toàn Khoa",
      badgeStyle: "bg-blue-50 text-blue-700 border-blue-200/80",
    };
  }

  if (roleCodes.includes("class_advisor")) {
    const userAssignments = advisors.filter(
      (a) => (a.userId === user.id || a.advisorUserId === user.id) && a.status === "active"
    );
    if (userAssignments.length > 0) {
      const classCodes = [...new Set(userAssignments.map((a) => a.classCode || a.classId).filter(Boolean))];
      return {
        label: `Lớp ${classCodes.join(", ")}`,
        subLabel: `${userAssignments.length} phân công`,
        badgeStyle: "bg-emerald-50 text-emerald-800 border-emerald-200/80",
      };
    }
    return {
      label: "Lớp được phân công",
      subLabel: "Chưa gán lớp cụ thể",
      badgeStyle: "bg-amber-50 text-amber-800 border-amber-200/80",
    };
  }

  return {
    label: "Theo phân quyền",
    subLabel: "Chức năng được gán",
    badgeStyle: "bg-slate-50 text-slate-600 border-slate-200",
  };
}

function formatDataScopeLabel(scope: string | undefined): { label: string; subLabel: string; badgeStyle: string } {
  if (scope === "all" || scope === "system") {
    return {
      label: "Toàn hệ thống",
      subLabel: "Toàn quyền quản trị",
      badgeStyle: "bg-purple-50 text-purple-700 border-purple-200",
    };
  }
  if (scope === "faculty") {
    return {
      label: "Theo Khoa",
      subLabel: "Dữ liệu sinh viên toàn Khoa",
      badgeStyle: "bg-blue-50 text-blue-700 border-blue-200",
    };
  }
  if (scope === "assigned_classes" || scope === "advisor") {
    return {
      label: "Lớp được phân công",
      subLabel: "Giới hạn theo lớp phụ trách",
      badgeStyle: "bg-emerald-50 text-emerald-700 border-emerald-200",
    };
  }
  return {
    label: "Phạm vi mặc định",
    subLabel: scope || "faculty",
    badgeStyle: "bg-slate-100 text-slate-700 border-slate-200",
  };
}

function formatDateVN(dateStr?: string | Date | null) {
  if (!dateStr) return "—";
  try {
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return "—";
    return d.toLocaleDateString("vi-VN", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
    });
  } catch {
    return "—";
  }
}

interface PermissionDisplayInfo {
  code: string;
  name: string;
  moduleId: "student" | "academic" | "progress" | "graduation" | "warning" | "system";
  action: string;
  actionLabel: string;
  badgeStyle: string;
}

interface BusinessModuleConfig {
  id: string;
  name: string;
  hintCode: string;
  description: string;
  icon: string;
  permissionCodes: string[];
}

const BUSINESS_MODULES: BusinessModuleConfig[] = [
  {
    id: "student",
    name: "Sinh viên",
    hintCode: "student",
    description: "Hồ sơ, danh sách sinh viên, xuất nhập dữ liệu sinh viên toàn hệ thống",
    icon: "M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z",
    permissionCodes: [
      "student.read",
      "student.create",
      "student.update",
      "student.delete",
      "student.import",
      "student.export",
    ],
  },
  {
    id: "academic",
    name: "Đào tạo",
    hintCode: "class, academic_term, grade, decision, fee_policy",
    description: "Danh mục lớp học, năm học, bảng điểm học phần, quyết định học vụ & chính sách học phí",
    icon: "M12 14l9-5-9-5-9 5 9 5zm0 0l6.16-3.422a12.083 12.083 0 01.665 6.479A11.952 11.952 0 0012 20.055a11.952 11.952 0 00-6.824-2.998 12.078 12.078 0 01.665-6.479L12 14zm-4 6v-7.5l4-2.222",
    permissionCodes: [
      "class.manage",
      "academic_term.manage",
      "grade.read",
      "grade.import",
      "grade.export",
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
    ],
  },
  {
    id: "progress",
    name: "Tiến độ đào tạo",
    hintCode: "progress",
    description: "Theo dõi tiến độ học tập sinh viên, kế hoạch mở môn và chạy tính toán tiến độ",
    icon: "M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4",
    permissionCodes: [
      "progress.read",
      "progress.plan.manage",
      "progress.calculate",
    ],
  },
  {
    id: "graduation",
    name: "Dự kiến tốt nghiệp",
    hintCode: "graduation",
    description: "Tra cứu kết quả dự kiến tốt nghiệp, chạy đánh giá điều kiện tốt nghiệp & xuất danh sách",
    icon: "M5 3v4M3 5h4M6 17v4m-2-2h4m5-16l2.286 6.857L21 12l-5.714 2.143L13 21l-2.286-6.857L5 12l5.714-2.143L13 3z",
    permissionCodes: [
      "graduation.read",
      "graduation.evaluate",
      "graduation.export",
    ],
  },
  {
    id: "warning",
    name: "Cảnh báo học tập",
    hintCode: "academic_warning, report",
    description: "Sàng lọc cảnh báo, lập kế hoạch can thiệp hỗ trợ sinh viên và xuất báo cáo học vụ",
    icon: "M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z",
    permissionCodes: [
      "academic_warning.read",
      "academic_warning.calculate",
      "academic_warning.policy.manage",
      "academic_warning.action.create",
      "academic_warning.action.update",
      "report.export",
    ],
  },
  {
    id: "system",
    name: "Quản trị hệ thống",
    hintCode: "user, role, advisor_assignment",
    description: "Quản trị tài khoản người dùng, vai trò phân quyền và phân công Cố vấn học tập",
    icon: "M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z M15 12a3 3 0 11-6 0 3 3 0 016 0z",
    permissionCodes: [
      "user.manage",
      "role.manage",
      "advisor_assignment.manage",
    ],
  },
];

const PERMISSION_LABEL_MAP: Record<string, {
  name: string;
  moduleId: "student" | "academic" | "progress" | "graduation" | "warning" | "system";
  action: string;
  actionLabel: string;
  badgeStyle: string;
}> = {
  // 1. Sinh viên (6)
  "student.read": {
    name: "Xem danh sách & hồ sơ sinh viên",
    moduleId: "student",
    action: "READ",
    actionLabel: "Xem",
    badgeStyle: "bg-slate-100 text-slate-700 border-slate-200",
  },
  "student.create": {
    name: "Thêm mới sinh viên",
    moduleId: "student",
    action: "CREATE",
    actionLabel: "Tạo mới",
    badgeStyle: "bg-emerald-50 text-emerald-700 border-emerald-200",
  },
  "student.update": {
    name: "Cập nhật hồ sơ sinh viên",
    moduleId: "student",
    action: "UPDATE",
    actionLabel: "Cập nhật",
    badgeStyle: "bg-amber-50 text-amber-700 border-amber-200",
  },
  "student.delete": {
    name: "Xóa sinh viên khỏi hệ thống",
    moduleId: "student",
    action: "DELETE",
    actionLabel: "Xóa",
    badgeStyle: "bg-rose-50 text-rose-700 border-rose-200",
  },
  "student.import": {
    name: "Nhập dữ liệu sinh viên từ Excel",
    moduleId: "student",
    action: "IMPORT",
    actionLabel: "Nhập file",
    badgeStyle: "bg-cyan-50 text-cyan-700 border-cyan-200",
  },
  "student.export": {
    name: "Xuất danh sách sinh viên ra Excel",
    moduleId: "student",
    action: "EXPORT",
    actionLabel: "Xuất file",
    badgeStyle: "bg-indigo-50 text-indigo-700 border-indigo-200",
  },

  // 2. Đào tạo (17)
  "class.manage": {
    name: "Quản lý danh mục lớp học & khóa",
    moduleId: "academic",
    action: "MANAGE",
    actionLabel: "Quản lý",
    badgeStyle: "bg-purple-50 text-purple-700 border-purple-200",
  },
  "academic_term.manage": {
    name: "Quản lý năm học, học kỳ & CTĐT",
    moduleId: "academic",
    action: "MANAGE",
    actionLabel: "Quản lý",
    badgeStyle: "bg-purple-50 text-purple-700 border-purple-200",
  },
  "grade.read": {
    name: "Xem bảng điểm học phần & GPA",
    moduleId: "academic",
    action: "READ",
    actionLabel: "Xem",
    badgeStyle: "bg-slate-100 text-slate-700 border-slate-200",
  },
  "grade.import": {
    name: "Nhập điểm học phần từ file",
    moduleId: "academic",
    action: "IMPORT",
    actionLabel: "Nhập file",
    badgeStyle: "bg-cyan-50 text-cyan-700 border-cyan-200",
  },
  "grade.export": {
    name: "Xuất bảng điểm học phần ra file",
    moduleId: "academic",
    action: "EXPORT",
    actionLabel: "Xuất file",
    badgeStyle: "bg-indigo-50 text-indigo-700 border-indigo-200",
  },
  "decision.read": {
    name: "Xem quyết định khen thưởng / kỷ luật",
    moduleId: "academic",
    action: "READ",
    actionLabel: "Xem",
    badgeStyle: "bg-slate-100 text-slate-700 border-slate-200",
  },
  "decision.create": {
    name: "Tạo mới quyết định học vụ",
    moduleId: "academic",
    action: "CREATE",
    actionLabel: "Tạo mới",
    badgeStyle: "bg-emerald-50 text-emerald-700 border-emerald-200",
  },
  "decision.update": {
    name: "Cập nhật quyết định học vụ",
    moduleId: "academic",
    action: "UPDATE",
    actionLabel: "Cập nhật",
    badgeStyle: "bg-amber-50 text-amber-700 border-amber-200",
  },
  "decision.delete": {
    name: "Xóa quyết định học vụ",
    moduleId: "academic",
    action: "DELETE",
    actionLabel: "Xóa",
    badgeStyle: "bg-rose-50 text-rose-700 border-rose-200",
  },
  "decision.import": {
    name: "Nhập quyết định học vụ từ file",
    moduleId: "academic",
    action: "IMPORT",
    actionLabel: "Nhập file",
    badgeStyle: "bg-cyan-50 text-cyan-700 border-cyan-200",
  },
  "decision.export": {
    name: "Xuất danh sách quyết định học vụ",
    moduleId: "academic",
    action: "EXPORT",
    actionLabel: "Xuất file",
    badgeStyle: "bg-indigo-50 text-indigo-700 border-indigo-200",
  },
  "fee_policy.read": {
    name: "Xem chính sách & diện miễn giảm học phí",
    moduleId: "academic",
    action: "READ",
    actionLabel: "Xem",
    badgeStyle: "bg-slate-100 text-slate-700 border-slate-200",
  },
  "fee_policy.create": {
    name: "Tạo mới chính sách miễn giảm học phí",
    moduleId: "academic",
    action: "CREATE",
    actionLabel: "Tạo mới",
    badgeStyle: "bg-emerald-50 text-emerald-700 border-emerald-200",
  },
  "fee_policy.update": {
    name: "Cập nhật chính sách học phí",
    moduleId: "academic",
    action: "UPDATE",
    actionLabel: "Cập nhật",
    badgeStyle: "bg-amber-50 text-amber-700 border-amber-200",
  },
  "fee_policy.delete": {
    name: "Xóa chính sách học phí",
    moduleId: "academic",
    action: "DELETE",
    actionLabel: "Xóa",
    badgeStyle: "bg-rose-50 text-rose-700 border-rose-200",
  },
  "fee_policy.import": {
    name: "Nhập danh mục chính sách học phí",
    moduleId: "academic",
    action: "IMPORT",
    actionLabel: "Nhập file",
    badgeStyle: "bg-cyan-50 text-cyan-700 border-cyan-200",
  },
  "fee_policy.export": {
    name: "Xuất danh mục chính sách học phí",
    moduleId: "academic",
    action: "EXPORT",
    actionLabel: "Xuất file",
    badgeStyle: "bg-indigo-50 text-indigo-700 border-indigo-200",
  },

  // 3. Tiến độ đào tạo (3)
  "progress.read": {
    name: "Xem tiến độ học tập sinh viên",
    moduleId: "progress",
    action: "READ",
    actionLabel: "Xem",
    badgeStyle: "bg-slate-100 text-slate-700 border-slate-200",
  },
  "progress.plan.manage": {
    name: "Quản lý kế hoạch tiến độ & mở môn",
    moduleId: "progress",
    action: "MANAGE",
    actionLabel: "Quản lý",
    badgeStyle: "bg-purple-50 text-purple-700 border-purple-200",
  },
  "progress.calculate": {
    name: "Chạy tính toán tiến độ đào tạo",
    moduleId: "progress",
    action: "CALCULATE",
    actionLabel: "Tính toán",
    badgeStyle: "bg-blue-50 text-blue-700 border-blue-200",
  },

  // 4. Dự kiến tốt nghiệp (3)
  "graduation.read": {
    name: "Xem danh sách dự kiến tốt nghiệp",
    moduleId: "graduation",
    action: "READ",
    actionLabel: "Xem",
    badgeStyle: "bg-slate-100 text-slate-700 border-slate-200",
  },
  "graduation.evaluate": {
    name: "Chạy đánh giá điều kiện tốt nghiệp",
    moduleId: "graduation",
    action: "EVALUATE",
    actionLabel: "Đánh giá",
    badgeStyle: "bg-blue-50 text-blue-700 border-blue-200",
  },
  "graduation.export": {
    name: "Xuất danh sách dự kiến tốt nghiệp",
    moduleId: "graduation",
    action: "EXPORT",
    actionLabel: "Xuất file",
    badgeStyle: "bg-indigo-50 text-indigo-700 border-indigo-200",
  },

  // 5. Cảnh báo học tập (6)
  "academic_warning.read": {
    name: "Xem danh sách cảnh báo học vụ",
    moduleId: "warning",
    action: "READ",
    actionLabel: "Xem",
    badgeStyle: "bg-slate-100 text-slate-700 border-slate-200",
  },
  "academic_warning.calculate": {
    name: "Chạy đợt sàng lọc cảnh báo học vụ",
    moduleId: "warning",
    action: "CALCULATE",
    actionLabel: "Sàng lọc",
    badgeStyle: "bg-blue-50 text-blue-700 border-blue-200",
  },
  "academic_warning.policy.manage": {
    name: "Quản lý chính sách cảnh báo học vụ",
    moduleId: "warning",
    action: "MANAGE",
    actionLabel: "Quản lý",
    badgeStyle: "bg-purple-50 text-purple-700 border-purple-200",
  },
  "academic_warning.action.create": {
    name: "Tạo hồ sơ hỗ trợ sinh viên",
    moduleId: "warning",
    action: "CREATE",
    actionLabel: "Tạo mới",
    badgeStyle: "bg-emerald-50 text-emerald-700 border-emerald-200",
  },
  "academic_warning.action.update": {
    name: "Cập nhật hồ sơ hỗ trợ sinh viên",
    moduleId: "warning",
    action: "UPDATE",
    actionLabel: "Cập nhật",
    badgeStyle: "bg-amber-50 text-amber-700 border-amber-200",
  },
  "report.export": {
    name: "Xuất báo cáo thống kê học vụ",
    moduleId: "warning",
    action: "EXPORT",
    actionLabel: "Xuất báo cáo",
    badgeStyle: "bg-indigo-50 text-indigo-700 border-indigo-200",
  },

  // 6. Quản trị hệ thống (3)
  "user.manage": {
    name: "Quản trị tài khoản người dùng",
    moduleId: "system",
    action: "MANAGE",
    actionLabel: "Quản trị",
    badgeStyle: "bg-purple-50 text-purple-700 border-purple-200",
  },
  "role.manage": {
    name: "Quản trị vai trò & phân quyền",
    moduleId: "system",
    action: "MANAGE",
    actionLabel: "Quản trị",
    badgeStyle: "bg-purple-50 text-purple-700 border-purple-200",
  },
  "advisor_assignment.manage": {
    name: "Quản lý phân công Cố vấn học tập",
    moduleId: "system",
    action: "MANAGE",
    actionLabel: "Quản lý",
    badgeStyle: "bg-purple-50 text-purple-700 border-purple-200",
  },
};

function getPermissionDisplayInfo(p: ApiData): PermissionDisplayInfo {
  const code = (p.code || p.sPermissionCode || "") as string;
  if (PERMISSION_LABEL_MAP[code]) {
    return {
      code,
      ...PERMISSION_LABEL_MAP[code],
    };
  }

  // Fallback for custom or newly added permissions
  const resource = ((p.resource || p.sResource || code.split(".")[0] || "other") as string).toLowerCase();
  const rawAction = ((p.action || p.sAction || code.split(".").pop() || "manage") as string).toUpperCase();

  let targetModule: "student" | "academic" | "progress" | "graduation" | "warning" | "system" = "academic";
  if (resource.includes("student")) targetModule = "student";
  else if (resource.includes("progress")) targetModule = "progress";
  else if (resource.includes("graduation")) targetModule = "graduation";
  else if (resource.includes("warning") || resource.includes("report")) targetModule = "warning";
  else if (resource.includes("user") || resource.includes("role") || resource.includes("advisor")) targetModule = "system";

  return {
    code,
    name: p.name || p.sPermissionName || code,
    moduleId: targetModule,
    action: rawAction,
    actionLabel: rawAction,
    badgeStyle: "bg-slate-100 text-slate-700 border-slate-200",
  };
}

export default function RbacPage() {
  const { can, status } = useAuthStore();
  const canAccess = can(["user.manage", "role.manage", "advisor_assignment.manage"]);

  const [activeTab, setActiveTab] = useState<RbacTab>("users");
  const [loading, setLoading] = useState(true);

  // Data collections
  const [users, setUsers] = useState<ApiData[]>([]);
  const [roles, setRoles] = useState<ApiData[]>([]);
  const [permissions, setPermissions] = useState<ApiData[]>([]);
  const [advisors, setAdvisors] = useState<ApiData[]>([]);
  const [classes, setClasses] = useState<ApiData[]>([]);
  const [years, setYears] = useState<ApiData[]>([]);

  // Search in tabs
  const [userSearch, setUserSearch] = useState("");
  const [permissionSearch, setPermissionSearch] = useState("");
  const [permissionFilterStatus, setPermissionFilterStatus] = useState<"all" | "selected" | "unselected">("all");

  // Accordion state for Role Permissions
  const [expandedGroups, setExpandedGroups] = useState<Record<string, boolean>>({});

  // Modals state: Add User Wizard
  const [showAddUserModal, setShowAddUserModal] = useState(false);
  const [wizardStep, setWizardStep] = useState<1 | 2 | 3 | 4>(1);
  const [wizardError, setWizardError] = useState<string | null>(null);
  const [wizardForm, setWizardForm] = useState({
    username: "",
    fullName: "",
    email: "",
    password: "",
    roleCode: "class_advisor",
    assignNow: true,
    classId: "",
    academicYearId: "",
    academicTermId: "",
  });

  // Modals state: Edit User
  const [showEditUserModal, setShowEditUserModal] = useState(false);
  const [editingUser, setEditingUser] = useState<ApiData | null>(null);
  const [editUserForm, setEditUserForm] = useState({
    fullName: "",
    email: "",
    isActive: true,
    password: "",
    roleCodes: [] as string[],
  });

  // Modals state: Role Permissions Customization
  const [showRolePermissionsModal, setShowRolePermissionsModal] = useState(false);
  const [editingRole, setEditingRole] = useState<ApiData | null>(null);
  const [selectedPermissions, setSelectedPermissions] = useState<string[]>([]);
  const [initialPermissions, setInitialPermissions] = useState<string[]>([]);
  const [permissionViewMode, setPermissionViewMode] = useState<"basic" | "advanced">("basic");
  const [showDeselectAllConfirm, setShowDeselectAllConfirm] = useState(false);
  const [showUnsavedConfirm, setShowUnsavedConfirm] = useState(false);

  // Modals state: Advisor Assignment & Details
  const [showAssignModal, setShowAssignModal] = useState(false);
  const [assignModalMode, setAssignModalMode] = useState<"create" | "edit">("create");
  const [assignForm, setAssignForm] = useState({ userId: "", classId: "", academicYearId: "", academicTermId: "" });
  const [viewingAdvisor, setViewingAdvisor] = useState<ApiData | null>(null);
  const [revokeTarget, setRevokeTarget] = useState<ApiData | null>(null);
  const [actionLoading, setActionLoading] = useState(false);

  // Load all RBAC data
  const loadData = async () => {
    try {
      setLoading(true);
      const [uRes, rRes, pRes, aRes, clRes, yRes] = await Promise.all([
        apiFetch("/api/v1/rbac/users"),
        apiFetch("/api/v1/rbac/roles"),
        apiFetch("/api/v1/rbac/permissions"),
        apiFetch("/api/v1/rbac/advisors"),
        apiFetch("/api/v1/classes"),
        apiFetch("/api/v1/academic-years"),
      ]);

      if (uRes.ok) {
        const uJson = await uRes.json();
        setUsers(Array.isArray(uJson.items) ? uJson.items : Array.isArray(uJson) ? uJson : []);
      }
      if (rRes.ok) {
        const rJson = await rRes.json();
        setRoles(Array.isArray(rJson.items) ? rJson.items : Array.isArray(rJson) ? rJson : []);
      }
      if (pRes.ok) {
        const pJson = await pRes.json();
        setPermissions(Array.isArray(pJson.items) ? pJson.items : Array.isArray(pJson) ? pJson : []);
      }
      if (aRes.ok) {
        const aJson = await aRes.json();
        setAdvisors(Array.isArray(aJson.items) ? aJson.items : Array.isArray(aJson) ? aJson : []);
      }
      if (clRes.ok) {
        const clJson = await clRes.json();
        setClasses(Array.isArray(clJson.items) ? clJson.items : Array.isArray(clJson) ? clJson : []);
      }
      if (yRes.ok) {
        const yJson = await yRes.json();
        setYears(Array.isArray(yJson.items) ? yJson.items : Array.isArray(yJson) ? yJson : []);
      }
    } catch (err) {
      console.error("RBAC load error:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    const timeout = window.setTimeout(() => void loadData(), 0);
    return () => window.clearTimeout(timeout);
  }, []);

  // Filter only class_advisor users for Advisor Assignment Modal
  const eligibleAdvisors = useMemo(() => {
    return users.filter((u) => {
      const rCodes: string[] = u.roleCodes || (u.roles ? u.roles.map((r: ApiData) => r.code) : []);
      return rCodes.includes("class_advisor");
    });
  }, [users]);

  // Filtered users for Tab 1 search
  const filteredUsers = useMemo(() => {
    if (!userSearch.trim()) return users;
    const q = userSearch.trim().toLowerCase();
    return users.filter(
      (u) =>
        (u.username || "").toLowerCase().includes(q) ||
        (u.fullName || "").toLowerCase().includes(q) ||
        (u.email || "").toLowerCase().includes(q)
    );
  }, [users, userSearch]);

  // Terms helper for Assign Year
  const termsForAssignYear = useMemo(() => {
    return years.find((y) => y.id === assignForm.academicYearId)?.terms || [];
  }, [years, assignForm.academicYearId]);

  // Terms helper for Wizard Step 3
  const termsForWizardYear = useMemo(() => {
    return years.find((y) => y.id === wizardForm.academicYearId)?.terms || [];
  }, [years, wizardForm.academicYearId]);

  // Helper: Term and year name lookup
  const getAdvisorTermAndYear = (academicTermId: string) => {
    for (const year of years) {
      const term = (year.terms || []).find((t: ApiData) => t.id === academicTermId);
      if (term) {
        return {
          yearId: year.id,
          yearName: year.sYearCode || year.yearCode || "Năm học hiện tại",
          termName: term.sTermCode || term.termCode || "Học kỳ",
        };
      }
    }
    return { yearId: "", yearName: "—", termName: "—" };
  };

  // Open Add User Wizard
  const handleOpenAddUserModal = () => {
    const defaultYearId = years[0]?.id || "";
    const defaultTerms = years.find((y) => y.id === defaultYearId)?.terms || [];
    setWizardStep(1);
    setWizardError(null);
    setWizardForm({
      fullName: "",
      username: "",
      email: "",
      password: "",
      roleCode: "class_advisor",
      assignNow: true,
      classId: classes[0]?.id || "",
      academicYearId: defaultYearId,
      academicTermId: defaultTerms[0]?.id || "",
    });
    setShowAddUserModal(true);
  };

  // Wizard Step Navigation
  const handleNextStep1 = () => {
    if (!wizardForm.fullName.trim()) {
      setWizardError("Vui lòng nhập họ và tên người dùng.");
      return;
    }
    if (!wizardForm.username.trim()) {
      setWizardError("Vui lòng nhập tên đăng nhập.");
      return;
    }
    if (wizardForm.username.includes(" ")) {
      setWizardError("Tên đăng nhập không được chứa khoảng trắng.");
      return;
    }
    if (wizardForm.password.trim().length < 8) {
      setWizardError("Mật khẩu khởi tạo phải có tối thiểu 8 ký tự.");
      return;
    }
    setWizardError(null);
    setWizardStep(2);
  };

  const handleNextStep2 = () => {
    if (!wizardForm.roleCode) {
      setWizardError("Vui lòng chọn vai trò cho người dùng.");
      return;
    }
    setWizardError(null);
    setWizardStep(3);
  };

  const handleNextStep3 = () => {
    if (wizardForm.roleCode === "class_advisor" && wizardForm.assignNow) {
      if (!wizardForm.classId || !wizardForm.academicTermId) {
        setWizardError("Vui lòng chọn Lớp học và Học kỳ để phân công ngay.");
        return;
      }
    }
    setWizardError(null);
    setWizardStep(4);
  };

  // Handle Create User Wizard Submission
  const handleCreateUserWizard = async () => {
    try {
      setActionLoading(true);
      setWizardError(null);

      // 1. Create user
      const res = await apiFetch("/api/v1/rbac/users", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          username: wizardForm.username.trim(),
          fullName: wizardForm.fullName.trim(),
          email: wizardForm.email.trim() || undefined,
          password: wizardForm.password.trim(),
          roleCodes: [wizardForm.roleCode],
        }),
      });

      if (!res.ok) {
        const err = await res.json();
        setWizardError(err.error?.message || "Lỗi khi tạo người dùng");
        return;
      }

      const createdUser = await res.json();

      // 2. If class advisor and assignNow is true, assign class immediately
      if (
        wizardForm.roleCode === "class_advisor" &&
        wizardForm.assignNow &&
        wizardForm.classId &&
        wizardForm.academicTermId &&
        createdUser?.id
      ) {
        try {
          const assignRes = await apiFetch("/api/v1/rbac/advisors", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              userId: createdUser.id,
              classId: wizardForm.classId,
              academicTermId: wizardForm.academicTermId,
            }),
          });

          if (!assignRes.ok) {
            const assignErr = await assignRes.json();
            alert(`Tài khoản đã được tạo, nhưng phân công lớp chưa hoàn tất: ${assignErr.error?.message || "Lỗi phân công"}`);
          }
        } catch (assignError) {
          console.error("Assign error in wizard:", assignError);
        }
      }

      setShowAddUserModal(false);
      await loadData();
      alert("Đã tạo người dùng mới thành công!");
    } catch (err) {
      console.error(err);
      setWizardError("Lỗi kết nối máy chủ khi tạo người dùng");
    } finally {
      setActionLoading(false);
    }
  };

  // Handle Update User
  const handleUpdateUser = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingUser) return;
    if (!editUserForm.fullName.trim()) {
      alert("Họ và tên không được để trống!");
      return;
    }
    if (editUserForm.roleCodes.length === 0) {
      alert("Vui lòng chọn ít nhất một vai trò cho người dùng!");
      return;
    }

    try {
      setActionLoading(true);
      const payload: ApiData = {
        fullName: editUserForm.fullName.trim(),
        email: editUserForm.email.trim(),
        isActive: editUserForm.isActive,
        roleCodes: editUserForm.roleCodes,
      };
      if (editUserForm.password.trim()) {
        if (editUserForm.password.trim().length < 8) {
          alert("Mật khẩu mới phải có tối thiểu 8 ký tự!");
          return;
        }
        payload.password = editUserForm.password.trim();
      }

      const res = await apiFetch(`/api/v1/rbac/users/${editingUser.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (res.ok) {
        setShowEditUserModal(false);
        setEditingUser(null);
        await loadData();
        alert("Đã cập nhật thông tin người dùng thành công!");
      } else {
        const err = await res.json();
        alert(err.error?.message || "Lỗi khi cập nhật người dùng");
      }
    } catch (err) {
      console.error(err);
      alert("Lỗi kết nối máy chủ");
    } finally {
      setActionLoading(false);
    }
  };

  // Check if current role is system superuser admin
  const isEditingAdmin = editingRole?.code === "admin";

  // Check if role has unsaved changes compared to initial load
  const hasUnsavedChanges = useMemo(() => {
    if (isEditingAdmin) return false;
    if (initialPermissions.length !== selectedPermissions.length) return true;
    const initialSet = new Set(initialPermissions);
    return selectedPermissions.some((p) => !initialSet.has(p));
  }, [isEditingAdmin, initialPermissions, selectedPermissions]);

  // Open Edit Role Permissions Modal
  const handleOpenRolePermissions = async (role: ApiData) => {
    setEditingRole(role);
    setPermissionSearch("");
    setPermissionFilterStatus("all");
    setPermissionViewMode("basic");
    setShowDeselectAllConfirm(false);
    setShowUnsavedConfirm(false);

    let loadedCodes: string[] = [];
    if (role.code === "admin") {
      // Admin is superuser: always has all 38 permissions
      loadedCodes = permissions.map((p) => (p.code || p.sPermissionCode) as string);
      setSelectedPermissions(loadedCodes);
      setInitialPermissions(loadedCodes);
    } else {
      try {
        const res = await apiFetch(`/api/v1/rbac/roles/${role.id}/permissions`);
        if (res.ok) {
          const json = await res.json();
          loadedCodes = (json.items || []).map((p: ApiData) => (p.code || p.sPermissionCode) as string);
        }
      } catch {
        loadedCodes = [];
      }
      setSelectedPermissions(loadedCodes);
      setInitialPermissions(loadedCodes);
    }

    const initialExpanded: Record<string, boolean> = {};
    BUSINESS_MODULES.forEach((m) => {
      initialExpanded[m.id] = true;
    });
    setExpandedGroups(initialExpanded);

    setShowRolePermissionsModal(true);
  };

  // Close Role Permissions Modal with confirmation if dirty
  const handleRequestCloseRoleModal = () => {
    if (hasUnsavedChanges) {
      setShowUnsavedConfirm(true);
    } else {
      setShowRolePermissionsModal(false);
    }
  };

  // Toggle individual permission
  const handleTogglePermission = (code: string) => {
    if (isEditingAdmin) return;
    setSelectedPermissions((prev) =>
      prev.includes(code) ? prev.filter((c) => c !== code) : [...prev, code]
    );
  };

  // Toggle entire module
  const handleToggleGroup = (groupCodes: string[], isAllSelected: boolean) => {
    if (isEditingAdmin) return;
    if (isAllSelected) {
      setSelectedPermissions((prev) => prev.filter((c) => !groupCodes.includes(c)));
    } else {
      setSelectedPermissions((prev) => [...new Set([...prev, ...groupCodes])]);
    }
  };

  // Bulk: Select all
  const handleSelectAll = () => {
    if (isEditingAdmin) return;
    setSelectedPermissions(permissions.map((p) => (p.code || p.sPermissionCode) as string));
  };

  // Bulk: Request deselect all (with confirm)
  const handleRequestDeselectAll = () => {
    if (isEditingAdmin || selectedPermissions.length === 0) return;
    setShowDeselectAllConfirm(true);
  };

  // Bulk: Confirm deselect all
  const handleConfirmDeselectAll = () => {
    setSelectedPermissions([]);
    setShowDeselectAllConfirm(false);
  };

  // Save Role Permissions
  const handleSaveRolePermissions = async () => {
    if (!editingRole || isEditingAdmin) return;
    try {
      setActionLoading(true);
      const res = await apiFetch(`/api/v1/rbac/roles/${editingRole.id}/permissions`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ permissionCodes: selectedPermissions }),
      });

      if (res.ok) {
        setInitialPermissions(selectedPermissions);
        setShowRolePermissionsModal(false);
        await loadData();
        alert("Đã cập nhật danh sách quyền cho vai trò!");
      } else {
        const err = await res.json();
        alert(err.error?.message || "Lỗi khi lưu phân quyền");
      }
    } catch {
      alert("Lỗi kết nối máy chủ");
    } finally {
      setActionLoading(false);
    }
  };

  // Open Assign Advisor Modal (Create or Edit)
  const handleOpenAssignModal = (targetAdvisor?: ApiData) => {
    if (targetAdvisor) {
      const info = getAdvisorTermAndYear(targetAdvisor.academicTermId);
      setAssignForm({
        userId: targetAdvisor.userId || targetAdvisor.advisorUserId || "",
        classId: targetAdvisor.classId || "",
        academicYearId: info.yearId || years[0]?.id || "",
        academicTermId: targetAdvisor.academicTermId || "",
      });
      setAssignModalMode("edit");
    } else {
      const defaultUserId = eligibleAdvisors[0]?.id || "";
      const defaultYearId = years[0]?.id || "";
      const defaultTerms = years.find((y) => y.id === defaultYearId)?.terms || [];
      setAssignForm({
        userId: defaultUserId,
        classId: classes[0]?.id || "",
        academicYearId: defaultYearId,
        academicTermId: defaultTerms[0]?.id || "",
      });
      setAssignModalMode("create");
    }
    setShowAssignModal(true);
  };

  // Handle Save Advisor Assignment
  const handleSaveAssignment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!assignForm.userId || !assignForm.classId || !assignForm.academicTermId) {
      alert("Vui lòng chọn đầy đủ Cố vấn, Lớp và Học kỳ!");
      return;
    }

    try {
      setActionLoading(true);
      const res = await apiFetch("/api/v1/rbac/advisors", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(assignForm),
      });

      if (res.ok) {
        setShowAssignModal(false);
        await loadData();
        alert(assignModalMode === "edit" ? "Đã thay đổi phân công cố vấn thành công!" : "Đã phân công Cố vấn học tập thành công!");
      } else {
        const err = await res.json();
        alert(err.error?.message || "Lỗi khi phân công");
      }
    } finally {
      setActionLoading(false);
    }
  };

  // Handle Revoke Advisor Assignment
  const handleConfirmRevoke = async () => {
    if (!revokeTarget) return;
    try {
      setActionLoading(true);
      const res = await apiFetch(`/api/v1/rbac/advisors/${revokeTarget.id}`, {
        method: "DELETE",
      });
      if (res.ok) {
        setRevokeTarget(null);
        await loadData();
        alert("Đã thu hồi phân công cố vấn thành công!");
      }
    } finally {
      setActionLoading(false);
    }
  };

  // Group Permissions by Business Module
  const groupedBusinessModules = useMemo(() => {
    const map: Record<string, ApiData[]> = {};
    BUSINESS_MODULES.forEach((m) => {
      map[m.id] = [];
    });

    permissions.forEach((p) => {
      const info = getPermissionDisplayInfo(p);
      if (map[info.moduleId]) {
        map[info.moduleId].push(p);
      } else {
        if (!map["other"]) map["other"] = [];
        map["other"].push(p);
      }
    });

    const list = BUSINESS_MODULES.map((m) => ({
      ...m,
      permissions: map[m.id] || [],
    })).filter((m) => m.permissions.length > 0);

    if (map["other"] && map["other"].length > 0) {
      list.push({
        id: "other",
        name: "Chức năng khác",
        hintCode: "other",
        description: "Các quyền hạn bổ sung khác trong hệ thống",
        icon: "M4 6h16M4 10h16M4 14h16M4 18h16",
        permissionCodes: map["other"].map((p) => (p.code || p.sPermissionCode) as string),
        permissions: map["other"],
      });
    }

    return list;
  }, [permissions]);

  const toggleGroupExpand = (moduleId: string) => {
    setExpandedGroups((prev) => ({ ...prev, [moduleId]: !prev[moduleId] }));
  };

  const expandAllGroups = () => {
    const allExp: Record<string, boolean> = {};
    groupedBusinessModules.forEach((m) => (allExp[m.id] = true));
    setExpandedGroups(allExp);
  };

  const collapseAllGroups = () => {
    setExpandedGroups({});
  };

  if (status !== "loading" && status !== "idle" && !canAccess) {
    return (
      <ForbiddenState
        title="Không có quyền quản lý phân quyền"
        description="Mô-đun Phân quyền & Vai trò chỉ dành cho Quản trị viên hệ thống có thẩm quyền quản lý tài khoản và phân quyền."
        requiredPermission={["user.manage", "role.manage", "advisor_assignment.manage"]}
      />
    );
  }

  const inactiveUsersCount = users.filter((u) => u.isActive === false).length;

  return (
    <div className="p-6 space-y-6 max-w-7xl mx-auto">
      {/* 1. Header & Title */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2.5 flex-wrap mb-1">
            <h1
              className="text-2xl sm:text-3xl font-bold text-slate-900 tracking-tight"
              style={{ fontFamily: "Be Vietnam Pro, sans-serif" }}
            >
              Quản lý người dùng & phân quyền
            </h1>
          </div>
          <p className="text-xs sm:text-sm text-slate-500 max-w-3xl">
            Quản lý tài khoản, vai trò, quyền truy cập và phạm vi dữ liệu trong hệ thống.
          </p>
        </div>

        {/* Primary CTA */}
        <div className="flex items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={handleOpenAddUserModal}
            className="px-4 py-2.5 rounded-xl bg-[var(--color-primary)] hover:opacity-90 text-white text-xs font-semibold shadow-xs flex items-center gap-2 cursor-pointer transition-all hover:shadow-md"
          >
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <line x1="12" y1="5" x2="12" y2="19" />
              <line x1="5" y1="12" x2="19" y2="12" />
            </svg>
            <span>+ Thêm người dùng</span>
          </button>
        </div>
      </div>

      {/* 2. Top Statistic Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3.5">
        <div className="p-3.5 bg-white border border-slate-200/90 rounded-2xl shadow-xs">
          <div className="text-[11px] font-medium text-slate-500 uppercase tracking-wider">Tài khoản người dùng</div>
          <div className="text-2xl font-bold text-slate-900 mt-1" style={{ fontFamily: "Be Vietnam Pro, sans-serif" }}>
            {users.length}
          </div>
          <div className="text-[11px] text-emerald-600 mt-0.5 flex items-center gap-1 font-medium">
            <span>●</span> {users.filter((u) => u.isActive !== false).length} đang hoạt động
          </div>
        </div>

        <div className="p-3.5 bg-white border border-slate-200/90 rounded-2xl shadow-xs">
          <div className="text-[11px] font-medium text-slate-500 uppercase tracking-wider">Vai trò đang sử dụng</div>
          <div className="text-2xl font-bold text-slate-900 mt-1" style={{ fontFamily: "Be Vietnam Pro, sans-serif" }}>
            {roles.length}
          </div>
          <div className="text-[11px] text-slate-500 mt-0.5 truncate">Ban chủ nhiệm, GVCN, Quản trị...</div>
        </div>

        <div className="p-3.5 bg-white border border-slate-200/90 rounded-2xl shadow-xs">
          <div className="text-[11px] font-medium text-slate-500 uppercase tracking-wider">Cố vấn đang phân công</div>
          <div className="text-2xl font-bold text-slate-900 mt-1" style={{ fontFamily: "Be Vietnam Pro, sans-serif" }}>
            {advisors.length}
          </div>
          <div className="text-[11px] text-blue-600 mt-0.5 font-medium">Phân công theo lớp & học kỳ</div>
        </div>

        <div className="p-3.5 bg-white border border-slate-200/90 rounded-2xl shadow-xs">
          <div className="text-[11px] font-medium text-slate-500 uppercase tracking-wider">Tài khoản cần thiết lập</div>
          <div className="text-2xl font-bold text-slate-900 mt-1" style={{ fontFamily: "Be Vietnam Pro, sans-serif" }}>
            {inactiveUsersCount}
          </div>
          <div className={`text-[11px] mt-0.5 font-medium ${inactiveUsersCount > 0 ? "text-amber-600" : "text-slate-500"}`}>
            {inactiveUsersCount > 0 ? "Tài khoản tạm khóa cần kiểm tra" : "Tất cả tài khoản sẵn sàng"}
          </div>
        </div>
      </div>

      {/* 3. Navigation Tabs */}
      <Tabs
        tabs={[
          { id: "users", label: "Tài khoản người dùng", badge: users.length },
          { id: "roles", label: "Vai trò & Quyền hạn", badge: roles.length },
          { id: "advisors", label: "Phân công Cố vấn học tập", badge: advisors.length },
        ]}
        activeTab={activeTab}
        onChange={(id) => setActiveTab(id as RbacTab)}
      />

      {loading ? (
        <div className="py-20 text-center text-slate-400 text-xs flex flex-col items-center justify-center gap-3">
          <div className="w-8 h-8 border-2 border-[var(--color-primary)] border-t-transparent rounded-full animate-spin" />
          <span>Đang tải danh sách người dùng và cấu hình phân quyền...</span>
        </div>
      ) : (
        <>
          {/* TAB 1: USERS */}
          {activeTab === "users" && (
            <div className="space-y-4">
              <FilterBar
                onReset={() => setUserSearch("")}
                actions={
                  <span className="text-xs text-slate-500 font-medium">
                    Hiển thị: <strong className="font-semibold text-slate-900">{filteredUsers.length}</strong> / {users.length} tài khoản
                  </span>
                }
              >
                <div className="relative min-w-[280px]">
                  <input
                    type="text"
                    placeholder="Tìm kiếm tài khoản, họ tên hoặc email..."
                    value={userSearch}
                    onChange={(e) => setUserSearch(e.target.value)}
                    className="w-full bg-white border border-slate-200 rounded-xl pl-8 pr-3 py-2 text-xs font-medium text-slate-800 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)]"
                  />
                  <svg
                    className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                  </svg>
                </div>
              </FilterBar>

              <div className="bg-white border border-slate-200/90 rounded-2xl shadow-xs overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs">
                    <thead>
                      <tr className="bg-slate-50/80 border-b border-slate-200 text-slate-500 font-semibold uppercase text-[11px]">
                        <th className="py-3.5 px-4">Tên đăng nhập</th>
                        <th className="py-3.5 px-4">Họ và tên</th>
                        <th className="py-3.5 px-4">Vai trò</th>
                        <th className="py-3.5 px-4">Phạm vi dữ liệu</th>
                        <th className="py-3.5 px-4">Trạng thái</th>
                        <th className="py-3.5 px-4 text-right">Thao tác</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {filteredUsers.length === 0 ? (
                        <tr>
                          <td colSpan={6} className="py-12 text-center">
                            <div className="flex flex-col items-center justify-center gap-2">
                              <div className="w-10 h-10 rounded-full bg-slate-100 flex items-center justify-center text-slate-400">
                                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                                </svg>
                              </div>
                              <span className="text-xs font-semibold text-slate-700">
                                {userSearch ? "Không tìm thấy người dùng phù hợp với từ khóa" : "Chưa có tài khoản người dùng nào trong hệ thống"}
                              </span>
                              {userSearch && (
                                <button
                                  type="button"
                                  onClick={() => setUserSearch("")}
                                  className="text-xs text-[var(--color-primary)] hover:underline font-semibold cursor-pointer"
                                >
                                  Xóa bộ lọc tìm kiếm
                                </button>
                              )}
                            </div>
                          </td>
                        </tr>
                      ) : (
                        filteredUsers.map((u) => {
                          const assignedRoleCodes: string[] = (
                            u.roleCodes || (u.roles ? u.roles.map((r: ApiData) => r.code) : ["faculty_manager"])
                          );
                          const scope = getUserDataScope(u, advisors);

                          return (
                            <tr key={u.id} className="hover:bg-slate-50/70 transition-colors">
                              {/* Tên đăng nhập */}
                              <td className="py-3.5 px-4">
                                <div className="flex items-center gap-2.5">
                                  <div className="w-8 h-8 rounded-full bg-[var(--color-primary-light)] text-[var(--color-primary)] font-bold flex items-center justify-center text-xs shrink-0 border border-[var(--color-primary)]/20">
                                    {(u.fullName || u.username || "U")[0].toUpperCase()}
                                  </div>
                                  <div>
                                    <div className="font-mono font-bold text-slate-900">{u.username}</div>
                                    <div className="text-[11px] text-slate-400">{u.email || "Chưa có email"}</div>
                                  </div>
                                </div>
                              </td>

                              {/* Họ và tên */}
                              <td className="py-3.5 px-4 font-semibold text-slate-900">{u.fullName}</td>

                              {/* Vai trò */}
                              <td className="py-3.5 px-4">
                                <div className="flex flex-col gap-1.5">
                                  {assignedRoleCodes.map((code: string) => {
                                    const meta = getRoleMetadata(code);
                                    return (
                                      <div key={code}>
                                        <div className="font-semibold text-slate-800 text-xs">{meta.label}</div>
                                        <div className="text-[10px] text-slate-400 font-mono">{code}</div>
                                      </div>
                                    );
                                  })}
                                </div>
                              </td>

                              {/* Phạm vi dữ liệu */}
                              <td className="py-3.5 px-4">
                                <div className="flex flex-col gap-0.5">
                                  <span
                                    className={`inline-flex items-center w-fit px-2.5 py-0.5 rounded-lg text-xs font-semibold border ${scope.badgeStyle}`}
                                  >
                                    {scope.label}
                                  </span>
                                  {scope.subLabel && (
                                    <span className="text-[10px] text-slate-400 pl-0.5">{scope.subLabel}</span>
                                  )}
                                </div>
                              </td>

                              {/* Trạng thái */}
                              <td className="py-3.5 px-4">
                                <span
                                  className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-semibold ${
                                    u.isActive !== false
                                      ? "bg-emerald-50 text-emerald-700 border border-emerald-200"
                                      : "bg-slate-100 text-slate-500 border border-slate-200"
                                  }`}
                                >
                                  <span
                                    className={`w-1.5 h-1.5 rounded-full ${
                                      u.isActive !== false ? "bg-emerald-500" : "bg-slate-400"
                                    }`}
                                  />
                                  {u.isActive !== false ? "Đang hoạt động" : "Tạm khóa"}
                                </span>
                              </td>

                              {/* Thao tác */}
                              <td className="py-3.5 px-4 text-right">
                                <button
                                  type="button"
                                  onClick={() => {
                                    setEditingUser(u);
                                    setEditUserForm({
                                      fullName: u.fullName,
                                      email: u.email || "",
                                      isActive: u.isActive !== false,
                                      password: "",
                                      roleCodes: assignedRoleCodes,
                                    });
                                    setShowEditUserModal(true);
                                  }}
                                  className="px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-100 border border-slate-200 rounded-xl transition-colors cursor-pointer"
                                >
                                  Sửa tài khoản
                                </button>
                              </td>
                            </tr>
                          );
                        })
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}

          {/* TAB 2: ROLES & PERMISSIONS */}
          {activeTab === "roles" && (
            <div className="space-y-4">
              {/* Friendly Data Scope Guide Card */}
              <div className="bg-slate-50/80 border border-slate-200 rounded-2xl p-4 sm:p-5 shadow-xs">
                <div className="mb-3">
                  <h3 className="text-sm font-bold text-slate-900" style={{ fontFamily: "Be Vietnam Pro, sans-serif" }}>
                    Phạm vi dữ liệu theo vai trò
                  </h3>
                  <p className="text-xs text-slate-500 mt-0.5">
                    Mỗi vai trò trong hệ thống được xác định phạm vi xem và thao tác dữ liệu riêng biệt để đảm bảo tính an toàn và bảo mật.
                  </p>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                  <div className="p-3 bg-white border border-slate-200/80 rounded-xl">
                    <div className="flex items-center gap-1.5 mb-1">
                      <span className="w-2 h-2 rounded-full bg-purple-500" />
                      <span className="text-xs font-bold text-slate-900">Toàn hệ thống</span>
                    </div>
                    <div className="text-[11px] text-slate-500">Quản trị hệ thống (admin)</div>
                    <p className="text-[11px] text-slate-600 mt-1.5 leading-relaxed">
                      Toàn quyền quản trị tài khoản, phân quyền, cấu hình và xem toàn bộ dữ liệu tất cả các Khoa và Lớp.
                    </p>
                  </div>

                  <div className="p-3 bg-white border border-slate-200/80 rounded-xl">
                    <div className="flex items-center gap-1.5 mb-1">
                      <span className="w-2 h-2 rounded-full bg-blue-500" />
                      <span className="text-xs font-bold text-slate-900">Theo Khoa</span>
                    </div>
                    <div className="text-[11px] text-slate-500">Ban chủ nhiệm Khoa (faculty_manager)</div>
                    <p className="text-[11px] text-slate-600 mt-1.5 leading-relaxed">
                      Theo dõi tiến độ đào tạo, điểm số và hồ sơ sinh viên của tất cả các lớp học trực thuộc Khoa.
                    </p>
                  </div>

                  <div className="p-3 bg-white border border-slate-200/80 rounded-xl">
                    <div className="flex items-center gap-1.5 mb-1">
                      <span className="w-2 h-2 rounded-full bg-emerald-500" />
                      <span className="text-xs font-bold text-slate-900">Lớp được phân công</span>
                    </div>
                    <div className="text-[11px] text-slate-500">GVCN / Cố vấn học tập (class_advisor)</div>
                    <p className="text-[11px] text-slate-600 mt-1.5 leading-relaxed">
                      Chỉ được xem hồ sơ học vụ và điểm số của sinh viên thuộc các lớp sinh hoạt được phân công phụ trách.
                    </p>
                  </div>
                </div>
              </div>

              {/* Roles Table */}
              <div className="bg-white border border-slate-200/90 rounded-2xl shadow-xs overflow-hidden">
                <div className="p-4 border-b border-slate-100 flex items-center justify-between">
                  <div>
                    <h3 className="text-sm font-bold text-slate-900" style={{ fontFamily: "Be Vietnam Pro, sans-serif" }}>
                      Danh sách Vai trò Hệ thống ({roles.length})
                    </h3>
                    <p className="text-xs text-slate-500">
                      Tổng cộng {permissions.length} quyền truy cập hệ thống đã được nhóm theo từng chức năng nghiệp vụ
                    </p>
                  </div>
                </div>

                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs">
                    <thead>
                      <tr className="bg-slate-50/80 border-b border-slate-200 text-slate-500 font-semibold uppercase text-[11px]">
                        <th className="py-3.5 px-4">Tên vai trò</th>
                        <th className="py-3.5 px-4">Mã hệ thống</th>
                        <th className="py-3.5 px-4">Phạm vi dữ liệu</th>
                        <th className="py-3.5 px-4">Số quyền truy cập</th>
                        <th className="py-3.5 px-4">Trạng thái</th>
                        <th className="py-3.5 px-4 text-right">Thao tác</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {roles.map((r) => {
                        const isAdmin = r.code === "admin";
                        const displayPermCount = isAdmin ? permissions.length : (Array.isArray(r.permissions) ? r.permissions.length : 0);
                        const roleMeta = getRoleMetadata(r.code);
                        const scopeMeta = formatDataScopeLabel(r.dataScope);

                        return (
                          <tr key={r.id} className="hover:bg-slate-50/70 transition-colors">
                            <td className="py-3.5 px-4">
                              <div className="font-bold text-slate-900 text-xs">{roleMeta.label || r.name}</div>
                              <div className="text-[11px] text-slate-500">{roleMeta.description}</div>
                            </td>
                            <td className="py-3.5 px-4 font-mono font-bold text-slate-700">{r.code}</td>
                            <td className="py-3.5 px-4">
                              <span className={`px-2.5 py-1 rounded-lg font-semibold text-xs border ${scopeMeta.badgeStyle}`}>
                                {scopeMeta.label}
                              </span>
                            </td>
                            <td className="py-3.5 px-4">
                              <div className="flex items-center gap-1.5 flex-wrap">
                                <div>
                                  <span className="font-bold text-slate-900">{displayPermCount}</span>
                                  <span className="text-slate-400">/{permissions.length} quyền</span>
                                </div>
                                {isAdmin && (
                                  <span className="inline-flex items-center px-2 py-0.5 rounded-md text-[10px] font-semibold bg-purple-50 text-purple-700 border border-purple-200">
                                    Toàn quyền
                                  </span>
                                )}
                              </div>
                            </td>
                            <td className="py-3.5 px-4">
                              <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-emerald-50 text-emerald-800 border border-emerald-200">
                                Hoạt động
                              </span>
                            </td>
                            <td className="py-3.5 px-4 text-right">
                              <button
                                type="button"
                                onClick={() => handleOpenRolePermissions(r)}
                                className="px-3.5 py-1.5 text-xs font-semibold text-[var(--color-primary)] hover:bg-[var(--color-primary-light)] border border-[var(--color-primary)]/40 rounded-xl transition-all cursor-pointer shadow-2xs hover:shadow-xs"
                              >
                                {isAdmin ? "Xem chi tiết quyền →" : "Tùy chỉnh quyền →"}
                              </button>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}

          {/* TAB 3: ADVISORS ASSIGNMENT */}
          {activeTab === "advisors" && (
            <div className="space-y-4">
              <div className="bg-white border border-slate-200/90 rounded-2xl shadow-xs overflow-hidden">
                <div className="p-4 border-b border-slate-100 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div>
                    <h3 className="text-sm font-bold text-slate-900" style={{ fontFamily: "Be Vietnam Pro, sans-serif" }}>
                      Phân công Cố vấn học tập / GVCN ({advisors.length})
                    </h3>
                    <p className="text-xs text-slate-500">
                      Cố vấn học tập chỉ có quyền truy cập hồ sơ và điểm số của lớp học được phân công
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => handleOpenAssignModal()}
                    className="px-3.5 py-2 rounded-xl bg-[var(--color-primary)] hover:opacity-90 text-white text-xs font-semibold shadow-xs flex items-center gap-1.5 cursor-pointer self-start sm:self-auto"
                  >
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                      <line x1="12" y1="5" x2="12" y2="19" />
                      <line x1="5" y1="12" x2="19" y2="12" />
                    </svg>
                    <span>+ Phân công Cố vấn</span>
                  </button>
                </div>

                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs">
                    <thead>
                      <tr className="bg-slate-50/80 border-b border-slate-200 text-slate-500 font-semibold uppercase text-[11px]">
                        <th className="py-3.5 px-4">Cố vấn</th>
                        <th className="py-3.5 px-4">Lớp phụ trách</th>
                        <th className="py-3.5 px-4">Năm học</th>
                        <th className="py-3.5 px-4">Học kỳ</th>
                        <th className="py-3.5 px-4">Trạng thái</th>
                        <th className="py-3.5 px-4 text-right">Thao tác</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {advisors.length === 0 ? (
                        <tr>
                          <td colSpan={6} className="py-12 text-center text-slate-400">
                            Chưa có phân công Cố vấn học tập nào trong hệ thống.
                          </td>
                        </tr>
                      ) : (
                        advisors.map((adv) => {
                          const termInfo = getAdvisorTermAndYear(adv.academicTermId);
                          const matchedUser = users.find((u) => u.id === adv.userId || u.id === adv.advisorUserId);
                          const matchedClass = classes.find((c) => c.id === adv.classId);

                          const displayName = matchedUser?.fullName || adv.advisorName || adv.userFullName || "Cố vấn học tập";
                          const displayUsername = matchedUser?.username || adv.userName || "—";
                          const displayClassCode = adv.classCode || matchedClass?.classId || "—";
                          const displayClassName = adv.className || matchedClass?.className || "";

                          return (
                            <tr key={adv.id} className="hover:bg-slate-50/70 transition-colors">
                              {/* Cố vấn */}
                              <td className="py-3.5 px-4">
                                <div className="font-semibold text-slate-900 text-xs">
                                  {displayName}
                                </div>
                                <div className="text-[11px] text-slate-400 font-mono">
                                  {displayUsername}
                                </div>
                              </td>

                              {/* Lớp phụ trách */}
                              <td className="py-3.5 px-4">
                                <div className="font-bold text-slate-900 text-xs">
                                  {displayClassCode}
                                </div>
                                {displayClassName && (
                                  <div className="text-[11px] text-slate-500 truncate max-w-[180px]">{displayClassName}</div>
                                )}
                              </td>

                              {/* Năm học */}
                              <td className="py-3.5 px-4 text-slate-700 font-medium">
                                {adv.academicYear || termInfo.yearName}
                              </td>

                              {/* Học kỳ */}
                              <td className="py-3.5 px-4 text-slate-700 font-medium">
                                {adv.termCode || termInfo.termName}
                              </td>

                              {/* Trạng thái */}
                              <td className="py-3.5 px-4">
                                <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-emerald-50 text-emerald-800 border border-emerald-200">
                                  Đang hiệu lực
                                </span>
                              </td>

                              {/* Thao tác */}
                              <td className="py-3.5 px-4 text-right">
                                <div className="flex items-center justify-end gap-1.5">
                                  <button
                                    type="button"
                                    onClick={() => setViewingAdvisor({ ...adv, matchedUser, matchedClass })}
                                    className="px-2.5 py-1 text-xs font-semibold text-slate-700 hover:bg-slate-100 border border-slate-200 rounded-lg transition-colors cursor-pointer"
                                  >
                                    Xem chi tiết
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => handleOpenAssignModal(adv)}
                                    className="px-2.5 py-1 text-xs font-semibold text-blue-700 hover:bg-blue-50 border border-blue-200 rounded-lg transition-colors cursor-pointer"
                                  >
                                    Thay đổi
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => setRevokeTarget({ ...adv, matchedUser, displayName, displayClassCode })}
                                    className="px-2.5 py-1 text-xs font-semibold text-red-600 hover:bg-red-50 border border-red-200 rounded-lg transition-colors cursor-pointer"
                                  >
                                    Thu hồi phân công
                                  </button>
                                </div>
                              </td>
                            </tr>
                          );
                        })
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}
        </>
      )}

      {/* MODAL 1: ADD USER WIZARD (4 STEPS) */}
      <Modal
        isOpen={showAddUserModal}
        onClose={() => setShowAddUserModal(false)}
        title="Thêm người dùng mới"
        description="Quy trình 4 bước tạo tài khoản, chọn vai trò và thiết lập phạm vi dữ liệu"
        maxWidth="lg"
      >
        <div className="space-y-5">
          {/* Stepper Header */}
          <div className="grid grid-cols-4 gap-2 border-b border-slate-100 pb-3">
            {[
              { step: 1, label: "Tài khoản" },
              { step: 2, label: "Vai trò" },
              { step: 3, label: "Phạm vi" },
              { step: 4, label: "Xác nhận" },
            ].map((s) => {
              const isCurrent = wizardStep === s.step;
              const isPassed = wizardStep > s.step;
              return (
                <div key={s.step} className="flex flex-col items-center text-center">
                  <div
                    className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold transition-colors ${
                      isCurrent
                        ? "bg-[var(--color-primary)] text-white shadow-xs"
                        : isPassed
                        ? "bg-emerald-100 text-emerald-800"
                        : "bg-slate-100 text-slate-400"
                    }`}
                  >
                    {isPassed ? "✓" : s.step}
                  </div>
                  <span
                    className={`text-[11px] mt-1 font-medium ${
                      isCurrent ? "text-slate-900 font-bold" : isPassed ? "text-emerald-700" : "text-slate-400"
                    }`}
                  >
                    {s.label}
                  </span>
                </div>
              );
            })}
          </div>

          {/* Validation Alert */}
          {wizardError && (
            <div className="p-3 bg-red-50 border border-red-200 rounded-xl text-xs text-red-700 flex items-center gap-2">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <circle cx="12" cy="12" r="10" />
                <line x1="12" y1="8" x2="12" y2="12" />
                <line x1="12" y1="16" x2="12.01" y2="16" />
              </svg>
              <span>{wizardError}</span>
            </div>
          )}

          {/* BƯỚC 1: THÔNG TIN TÀI KHOẢN */}
          {wizardStep === 1 && (
            <div className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Họ và tên người dùng <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  required
                  placeholder="Ví dụ: ThS. Nguyễn Văn A"
                  value={wizardForm.fullName}
                  onChange={(e) => setWizardForm({ ...wizardForm, fullName: e.target.value })}
                  className="w-full bg-white border border-slate-200 rounded-xl px-3 py-2 text-xs font-medium text-slate-800 focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)]"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Tên đăng nhập <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  required
                  placeholder="Ví dụ: advisor_nguyen"
                  value={wizardForm.username}
                  onChange={(e) => setWizardForm({ ...wizardForm, username: e.target.value })}
                  className="w-full bg-white border border-slate-200 rounded-xl px-3 py-2 text-xs font-mono font-bold text-slate-800 focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)]"
                />
                <p className="text-[11px] text-slate-400 mt-1">Dùng để đăng nhập hệ thống, viết liền không dấu</p>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Email liên hệ (nếu có)</label>
                <input
                  type="email"
                  placeholder="Ví dụ: nguyen.va@dlu.edu.vn"
                  value={wizardForm.email}
                  onChange={(e) => setWizardForm({ ...wizardForm, email: e.target.value })}
                  className="w-full bg-white border border-slate-200 rounded-xl px-3 py-2 text-xs font-medium text-slate-800 focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)]"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Mật khẩu khởi tạo <span className="text-red-500">*</span>
                </label>
                <input
                  type="password"
                  required
                  minLength={8}
                  placeholder="Tối thiểu 8 ký tự..."
                  value={wizardForm.password}
                  onChange={(e) => setWizardForm({ ...wizardForm, password: e.target.value })}
                  className="w-full bg-white border border-slate-200 rounded-xl px-3 py-2 text-xs font-mono text-slate-800 focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)]"
                />
                <p className="text-[11px] text-slate-400 mt-1">Mật khẩu ban đầu để người dùng đăng nhập lần đầu</p>
              </div>

              <div className="flex items-center justify-end gap-2 pt-4 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setShowAddUserModal(false)}
                  className="px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100 rounded-xl cursor-pointer"
                >
                  Hủy
                </button>
                <button
                  type="button"
                  onClick={handleNextStep1}
                  className="px-4 py-2 text-xs font-semibold text-white bg-[var(--color-primary)] hover:opacity-90 rounded-xl cursor-pointer shadow-xs"
                >
                  Tiếp tục: Chọn vai trò →
                </button>
              </div>
            </div>
          )}

          {/* BƯỚC 2: CHỌN VAI TRÒ */}
          {wizardStep === 2 && (
            <div className="space-y-4">
              <p className="text-xs text-slate-600">
                Chọn vai trò phù hợp nhất với nhiệm vụ của người dùng này trong hệ thống:
              </p>

              <div className="space-y-2.5 max-h-[340px] overflow-y-auto pr-1">
                {(roles.length > 0 ? roles : [
                  { code: "class_advisor", name: "GVCN / CVHT" },
                  { code: "faculty_manager", name: "Ban chủ nhiệm Khoa" },
                  { code: "admin", name: "Quản trị hệ thống" }
                ]).map((r) => {
                  const meta = getRoleMetadata(r.code);
                  const isSelected = wizardForm.roleCode === r.code;
                  return (
                    <label
                      key={r.code}
                      className={`flex items-start gap-3 p-3 rounded-2xl border transition-all cursor-pointer ${
                        isSelected
                          ? "bg-emerald-50/60 border-emerald-300 ring-1 ring-emerald-300"
                          : "bg-white border-slate-200 hover:border-slate-300"
                      }`}
                    >
                      <input
                        type="radio"
                        name="wizardRole"
                        checked={isSelected}
                        onChange={() => setWizardForm({ ...wizardForm, roleCode: r.code })}
                        className="mt-1 text-[var(--color-primary)] focus:ring-[var(--color-primary)]"
                      />
                      <div className="flex-1">
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-bold text-slate-900">{meta.label || r.name}</span>
                          {r.code === "class_advisor" && (
                            <span className="text-[10px] px-2 py-0.2 rounded-full font-semibold bg-emerald-100 text-emerald-800">
                              Phổ biến
                            </span>
                          )}
                          {r.code === "admin" && (
                            <span className="text-[10px] px-2 py-0.2 rounded-full font-semibold bg-purple-100 text-purple-800">
                              Toàn quyền
                            </span>
                          )}
                        </div>
                        <p className="text-xs text-slate-600 mt-0.5">{meta.description || r.description}</p>
                        <div className="flex items-center gap-2 mt-1">
                          <span className="text-[10px] text-slate-400 font-mono">Mã: {r.code}</span>
                          <span className="text-[10px] text-slate-300">•</span>
                          <span className="text-[10px] text-slate-500 font-medium">Phạm vi: {meta.defaultScope}</span>
                        </div>
                      </div>
                    </label>
                  );
                })}
              </div>

              <div className="flex items-center justify-between pt-4 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => {
                    setWizardError(null);
                    setWizardStep(1);
                  }}
                  className="px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100 rounded-xl cursor-pointer"
                >
                  ← Quay lại
                </button>
                <button
                  type="button"
                  onClick={handleNextStep2}
                  className="px-4 py-2 text-xs font-semibold text-white bg-[var(--color-primary)] hover:opacity-90 rounded-xl cursor-pointer shadow-xs"
                >
                  Tiếp tục: Phạm vi dữ liệu →
                </button>
              </div>
            </div>
          )}

          {/* BƯỚC 3: PHẠM VI DỮ LIỆU */}
          {wizardStep === 3 && (
            <div className="space-y-4">
              {/* If not Class Advisor */}
              {wizardForm.roleCode !== "class_advisor" && (
                <div
                  className={`p-4 rounded-2xl border space-y-2 ${
                    wizardForm.roleCode === "admin"
                      ? "bg-purple-50/50 border-purple-200"
                      : wizardForm.roleCode === "faculty_manager" || wizardForm.roleCode === "faculty_staff"
                      ? "bg-blue-50/50 border-blue-200"
                      : "bg-slate-50 border-slate-200"
                  }`}
                >
                  <div className="flex items-center gap-2">
                    <span
                      className={`w-2.5 h-2.5 rounded-full ${
                        wizardForm.roleCode === "admin"
                          ? "bg-purple-500"
                          : wizardForm.roleCode === "faculty_manager" || wizardForm.roleCode === "faculty_staff"
                          ? "bg-blue-500"
                          : "bg-slate-400"
                      }`}
                    />
                    <span className="text-xs font-bold text-slate-900">
                      Phạm vi: {getRoleMetadata(wizardForm.roleCode).defaultScope}
                    </span>
                  </div>
                  <p className="text-xs text-slate-600 leading-relaxed">
                    {wizardForm.roleCode === "admin"
                      ? "Tài khoản Quản trị hệ thống có toàn quyền truy cập dữ liệu toàn trường. Không cần thiết lập thêm phạm vi dữ liệu."
                      : wizardForm.roleCode === "faculty_manager"
                      ? "Tài khoản Ban chủ nhiệm Khoa sẽ tự động có quyền theo dõi và vận hành dữ liệu sinh viên trong toàn Khoa."
                      : wizardForm.roleCode === "faculty_staff"
                      ? "Tài khoản Giáo vụ Khoa có quyền theo dõi và thao tác dữ liệu học vụ trong phạm vi Khoa được phân công."
                      : `Tài khoản mang vai trò này sẽ truy cập dữ liệu theo phạm vi "${getRoleMetadata(wizardForm.roleCode).defaultScope}". Không cần gán lớp cụ thể.`}
                  </p>
                </div>
              )}

              {/* If Class Advisor */}
              {wizardForm.roleCode === "class_advisor" && (
                <div className="space-y-4">
                  <div className="p-3 bg-slate-50 border border-slate-200 rounded-2xl">
                    <label className="flex items-center gap-2.5 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={wizardForm.assignNow}
                        onChange={(e) => setWizardForm({ ...wizardForm, assignNow: e.target.checked })}
                        className="rounded border-slate-300 text-[var(--color-primary)] focus:ring-[var(--color-primary)]"
                      />
                      <div>
                        <span className="text-xs font-bold text-slate-900">Phân công lớp phụ trách ngay</span>
                        <p className="text-[11px] text-slate-500">
                          Tự động gán lớp sinh hoạt cho Cố vấn học tập này trong cùng thao tác
                        </p>
                      </div>
                    </label>
                  </div>

                  {wizardForm.assignNow ? (
                    <div className="space-y-3 p-3.5 bg-white border border-slate-200 rounded-2xl">
                      <div>
                        <label className="block text-xs font-semibold text-slate-700 mb-1">
                          Lớp phụ trách <span className="text-red-500">*</span>
                        </label>
                        <select
                          value={wizardForm.classId}
                          onChange={(e) => setWizardForm({ ...wizardForm, classId: e.target.value })}
                          className="w-full bg-white border border-slate-200 rounded-xl px-3 py-2 text-xs font-medium text-slate-800 focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)]"
                        >
                          {classes.map((c) => (
                            <option key={c.id} value={c.id}>
                              {c.classId} - {c.className}
                            </option>
                          ))}
                        </select>
                      </div>

                      <div className="grid grid-cols-2 gap-3">
                        <div>
                          <label className="block text-xs font-semibold text-slate-700 mb-1">
                            Năm học <span className="text-red-500">*</span>
                          </label>
                          <select
                            value={wizardForm.academicYearId}
                            onChange={(e) => {
                              const yId = e.target.value;
                              const terms = years.find((y) => y.id === yId)?.terms || [];
                              setWizardForm({
                                ...wizardForm,
                                academicYearId: yId,
                                academicTermId: terms[0]?.id || "",
                              });
                            }}
                            className="w-full bg-white border border-slate-200 rounded-xl px-3 py-2 text-xs font-medium text-slate-800 focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)]"
                          >
                            {years.map((y) => (
                              <option key={y.id} value={y.id}>
                                {y.sYearCode || y.yearCode}
                              </option>
                            ))}
                          </select>
                        </div>

                        <div>
                          <label className="block text-xs font-semibold text-slate-700 mb-1">
                            Học kỳ <span className="text-red-500">*</span>
                          </label>
                          <select
                            value={wizardForm.academicTermId}
                            onChange={(e) => setWizardForm({ ...wizardForm, academicTermId: e.target.value })}
                            className="w-full bg-white border border-slate-200 rounded-xl px-3 py-2 text-xs font-medium text-slate-800 focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)]"
                          >
                            <option value="">Chọn học kỳ</option>
                            {termsForWizardYear.map((t: ApiData) => (
                              <option key={t.id} value={t.id}>
                                {t.sTermCode || t.termCode}
                              </option>
                            ))}
                          </select>
                        </div>
                      </div>
                    </div>
                  ) : (
                    <p className="text-xs text-slate-500 italic p-2">
                      Bạn có thể phân công lớp cho Cố vấn sau tại tab &ldquo;Phân công Cố vấn học tập&rdquo;.
                    </p>
                  )}
                </div>
              )}

              <div className="flex items-center justify-between pt-4 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => {
                    setWizardError(null);
                    setWizardStep(2);
                  }}
                  className="px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100 rounded-xl cursor-pointer"
                >
                  ← Quay lại
                </button>
                <button
                  type="button"
                  onClick={handleNextStep3}
                  className="px-4 py-2 text-xs font-semibold text-white bg-[var(--color-primary)] hover:opacity-90 rounded-xl cursor-pointer shadow-xs"
                >
                  Tiếp tục: Xác nhận →
                </button>
              </div>
            </div>
          )}

          {/* BƯỚC 4: XÁC NHẬN */}
          {wizardStep === 4 && (
            <div className="space-y-4">
              <p className="text-xs text-slate-600">
                Vui lòng kiểm tra lại thông tin trước khi hoàn tất tạo tài khoản:
              </p>

              <div className="p-4 bg-slate-50 border border-slate-200 rounded-2xl space-y-3">
                <div className="flex justify-between items-center text-xs pb-2 border-b border-slate-200/60">
                  <span className="text-slate-500">Họ và tên:</span>
                  <span className="font-bold text-slate-900">{wizardForm.fullName}</span>
                </div>

                <div className="flex justify-between items-center text-xs pb-2 border-b border-slate-200/60">
                  <span className="text-slate-500">Tên đăng nhập:</span>
                  <span className="font-mono font-bold text-slate-900">{wizardForm.username}</span>
                </div>

                <div className="flex justify-between items-center text-xs pb-2 border-b border-slate-200/60">
                  <span className="text-slate-500">Email:</span>
                  <span className="text-slate-700">{wizardForm.email || "Chưa cung cấp"}</span>
                </div>

                <div className="flex justify-between items-center text-xs pb-2 border-b border-slate-200/60">
                  <span className="text-slate-500">Vai trò:</span>
                  <span className="font-semibold text-slate-900">
                    {getRoleMetadata(wizardForm.roleCode).label}
                  </span>
                </div>

                <div className="flex justify-between items-start text-xs pb-2 border-b border-slate-200/60">
                  <span className="text-slate-500">Phạm vi dữ liệu:</span>
                  <div className="text-right">
                    {wizardForm.roleCode === "class_advisor" ? (
                      <div>
                        {wizardForm.assignNow ? (
                          <>
                            <div className="font-bold text-slate-900">
                              Lớp {classes.find((c) => c.id === wizardForm.classId)?.classId || "—"}
                            </div>
                            <div className="text-[11px] text-slate-500">
                              {termsForWizardYear.find((t: ApiData) => t.id === wizardForm.academicTermId)?.sTermCode || "Học kỳ"}
                              {" ("}
                              {years.find((y) => y.id === wizardForm.academicYearId)?.sYearCode || "Năm học"}
                              {")"}
                            </div>
                          </>
                        ) : (
                          <span className="text-slate-500">Chưa gán lớp (Thiết lập sau)</span>
                        )}
                      </div>
                    ) : (
                      <span className="font-semibold text-slate-900">
                        {getRoleMetadata(wizardForm.roleCode).defaultScope}
                      </span>
                    )}
                  </div>
                </div>

                <div className="flex justify-between items-center text-xs">
                  <span className="text-slate-500">Trạng thái ban đầu:</span>
                  <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-emerald-50 text-emerald-800 border border-emerald-200">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                    Đang hoạt động
                  </span>
                </div>
              </div>

              <div className="flex items-center justify-between pt-4 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => {
                    setWizardError(null);
                    setWizardStep(3);
                  }}
                  className="px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100 rounded-xl cursor-pointer"
                >
                  ← Quay lại
                </button>
                <button
                  type="button"
                  disabled={actionLoading}
                  onClick={handleCreateUserWizard}
                  className="px-5 py-2.5 text-xs font-semibold text-white bg-[var(--color-primary)] hover:opacity-90 rounded-xl cursor-pointer shadow-xs transition-all flex items-center gap-2"
                >
                  {actionLoading && (
                    <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  )}
                  <span>{actionLoading ? "Đang tạo tài khoản..." : "Xác nhận & Tạo tài khoản"}</span>
                </button>
              </div>
            </div>
          )}
        </div>
      </Modal>

      {/* MODAL 2: EDIT USER */}
      {editingUser && (
        <Modal
          isOpen={showEditUserModal}
          onClose={() => {
            setShowEditUserModal(false);
            setEditingUser(null);
          }}
          title={`Sửa Người dùng: ${editingUser.username}`}
          description="Cập nhật họ tên, email, đổi mật khẩu và phân bổ vai trò cho tài khoản"
          maxWidth="md"
        >
          <form onSubmit={handleUpdateUser} className="space-y-4">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Tên đăng nhập</label>
              <input
                type="text"
                disabled
                value={editingUser.username}
                className="w-full bg-slate-100 border border-slate-200 rounded-xl px-3 py-2 text-xs font-mono font-bold text-slate-500 cursor-not-allowed"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Họ và tên <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                required
                value={editUserForm.fullName}
                onChange={(e) => setEditUserForm({ ...editUserForm, fullName: e.target.value })}
                className="w-full bg-white border border-slate-200 rounded-xl px-3 py-2 text-xs font-medium text-slate-800 focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)]"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Email liên hệ</label>
              <input
                type="email"
                value={editUserForm.email}
                onChange={(e) => setEditUserForm({ ...editUserForm, email: e.target.value })}
                className="w-full bg-white border border-slate-200 rounded-xl px-3 py-2 text-xs font-medium text-slate-800 focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)]"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Đổi mật khẩu mới (tối thiểu 8 ký tự, để trống nếu không đổi)
              </label>
              <input
                type="password"
                minLength={8}
                placeholder="Nhập mật khẩu mới..."
                value={editUserForm.password}
                onChange={(e) => setEditUserForm({ ...editUserForm, password: e.target.value })}
                className="w-full bg-white border border-slate-200 rounded-xl px-3 py-2 text-xs font-mono text-slate-800 focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)]"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Trạng thái tài khoản</label>
              <label className="flex items-center gap-2.5 p-2.5 rounded-xl border border-slate-200 bg-slate-50 cursor-pointer">
                <input
                  type="checkbox"
                  checked={editUserForm.isActive}
                  onChange={(e) => setEditUserForm({ ...editUserForm, isActive: e.target.checked })}
                  className="rounded border-slate-300 text-[var(--color-primary)] focus:ring-[var(--color-primary)]"
                />
                <div>
                  <span className="text-xs font-bold text-slate-800">Đang hoạt động</span>
                  <p className="text-[10px] text-slate-500">Tài khoản bị khóa sẽ không thể đăng nhập vào hệ thống</p>
                </div>
              </label>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Vai trò trong hệ thống</label>
              <div className="space-y-2 mt-1">
                {roles.map((r) => {
                  const checked = editUserForm.roleCodes.includes(r.code);
                  const meta = getRoleMetadata(r.code);
                  return (
                    <label
                      key={r.code}
                      className={`flex items-start gap-2.5 p-2.5 rounded-xl border text-xs cursor-pointer transition-colors ${
                        checked
                          ? "bg-emerald-50/60 border-emerald-300 text-emerald-900 font-semibold"
                          : "bg-white border-slate-200 text-slate-700 hover:bg-slate-50"
                      }`}
                    >
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={(e) => {
                          if (e.target.checked) {
                            setEditUserForm({ ...editUserForm, roleCodes: [...editUserForm.roleCodes, r.code] });
                          } else {
                            setEditUserForm({
                              ...editUserForm,
                              roleCodes: editUserForm.roleCodes.filter((c) => c !== r.code),
                            });
                          }
                        }}
                        className="mt-0.5 rounded border-slate-300 text-[var(--color-primary)] focus:ring-[var(--color-primary)]"
                      />
                      <div className="flex-1">
                        <div className="font-bold text-slate-900">{meta.label}</div>
                        <div className="text-[10px] text-slate-500 font-normal">{meta.description}</div>
                      </div>
                    </label>
                  );
                })}
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 pt-4 border-t border-slate-100">
              <button
                type="button"
                onClick={() => {
                  setShowEditUserModal(false);
                  setEditingUser(null);
                }}
                className="px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100 rounded-xl cursor-pointer"
              >
                Hủy
              </button>
              <button
                type="submit"
                disabled={actionLoading}
                className="px-4 py-2 text-xs font-semibold text-white bg-[var(--color-primary)] hover:opacity-90 rounded-xl cursor-pointer shadow-xs"
              >
                {actionLoading ? "Đang lưu..." : "Lưu thay đổi"}
              </button>
            </div>
          </form>
        </Modal>
      )}

      {/* MODAL 3: CUSTOMIZE ROLE PERMISSIONS */}
      {editingRole && (
        <Modal
          isOpen={showRolePermissionsModal}
          onClose={handleRequestCloseRoleModal}
          title={`Tùy chỉnh quyền hạn: ${getRoleMetadata(editingRole.code).label || editingRole.name}`}
          description={`Phạm vi dữ liệu: ${formatDataScopeLabel(editingRole.dataScope).label}. Cấu hình các chức năng và quyền thao tác cho vai trò này.`}
          maxWidth="4xl"
        >
          <div className="space-y-4">
            {/* Superuser Notice Banner for Admin */}
            {isEditingAdmin && (
              <div className="p-3.5 bg-purple-50/70 border border-purple-200/80 rounded-2xl flex items-start gap-3">
                <div className="w-8 h-8 rounded-xl bg-purple-100 text-purple-700 flex items-center justify-center shrink-0 mt-0.5 border border-purple-200">
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
                  </svg>
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-xs font-bold text-purple-900">
                      Quản trị hệ thống luôn có toàn quyền
                    </span>
                    <span className="px-2 py-0.2 rounded-full text-[10px] font-semibold bg-purple-100 text-purple-800 border border-purple-200">
                      Toàn quyền hệ thống (Superuser)
                    </span>
                  </div>
                  <p className="text-xs text-purple-700 mt-1 leading-relaxed">
                    Hệ thống SEWS luôn mặc định cấp toàn bộ quyền truy cập và dữ liệu cho vai trò Quản trị viên để bảo đảm an toàn vận hành. Phân quyền chi tiết dạng danh sách được hiển thị ở chế độ chỉ đọc để tra cứu và không áp dụng chỉnh sửa cho vai trò này.
                  </p>
                </div>
              </div>
            )}

            {/* Toolbar: Primary & Secondary Actions */}
            <div className="bg-slate-50/80 p-3 rounded-2xl border border-slate-200/90 space-y-2.5">
              {/* Row 1: Primary Controls */}
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
                <div className="relative flex-1">
                  <input
                    type="text"
                    placeholder="Tìm tên quyền tiếng Việt, mã quyền hoặc loại thao tác (vd: hỗ trợ, create, điểm)..."
                    value={permissionSearch}
                    onChange={(e) => setPermissionSearch(e.target.value)}
                    className="w-full bg-white border border-slate-200 rounded-xl pl-8 pr-8 py-2 text-xs font-medium text-slate-800 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)]"
                  />
                  <svg
                    className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                  </svg>
                  {permissionSearch && (
                    <button
                      type="button"
                      onClick={() => setPermissionSearch("")}
                      className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 cursor-pointer p-0.5"
                    >
                      <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
                      </svg>
                    </button>
                  )}
                </div>

                <div className="flex items-center gap-2 shrink-0">
                  <select
                    value={permissionFilterStatus}
                    onChange={(e) => setPermissionFilterStatus(e.target.value as "all" | "selected" | "unselected")}
                    className="bg-white border border-slate-200 rounded-xl px-2.5 py-2 text-xs font-semibold text-slate-700 focus:outline-none cursor-pointer"
                  >
                    <option value="all">Tất cả quyền ({permissions.length})</option>
                    <option value="selected">Đã chọn ({selectedPermissions.length})</option>
                    <option value="unselected">Chưa chọn ({permissions.length - selectedPermissions.length})</option>
                  </select>

                  {/* Mode switch: Basic vs Advanced */}
                  <div className="flex items-center bg-slate-200/80 p-0.5 rounded-xl shrink-0">
                    <button
                      type="button"
                      onClick={() => setPermissionViewMode("basic")}
                      className={`px-2.5 py-1 text-xs font-semibold rounded-lg transition-all cursor-pointer ${
                        permissionViewMode === "basic"
                          ? "bg-white text-slate-900 shadow-2xs"
                          : "text-slate-600 hover:text-slate-900"
                      }`}
                      title="Hiển thị ngôn ngữ nghiệp vụ thân thiện"
                    >
                      Cơ bản
                    </button>
                    <button
                      type="button"
                      onClick={() => setPermissionViewMode("advanced")}
                      className={`px-2.5 py-1 text-xs font-semibold rounded-lg transition-all cursor-pointer ${
                        permissionViewMode === "advanced"
                          ? "bg-white text-slate-900 shadow-2xs"
                          : "text-slate-600 hover:text-slate-900"
                      }`}
                      title="Hiển thị chi tiết mã code kỹ thuật"
                    >
                      Nâng cao
                    </button>
                  </div>
                </div>
              </div>

              {/* Row 2: Secondary & Bulk Actions */}
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pt-1 border-t border-slate-200/60 text-xs">
                {/* Secondary: Accordion Controls */}
                <div className="flex items-center gap-1.5">
                  <span className="text-[11px] text-slate-500 font-medium mr-1">Hiển thị nhóm:</span>
                  <button
                    type="button"
                    onClick={expandAllGroups}
                    className="px-2.5 py-1 text-[11px] font-semibold text-slate-600 bg-white hover:bg-slate-100 border border-slate-200 rounded-lg cursor-pointer transition-colors"
                  >
                    Mở tất cả
                  </button>
                  <button
                    type="button"
                    onClick={collapseAllGroups}
                    className="px-2.5 py-1 text-[11px] font-semibold text-slate-600 bg-white hover:bg-slate-100 border border-slate-200 rounded-lg cursor-pointer transition-colors"
                  >
                    Thu gọn
                  </button>
                </div>

                {/* Bulk Actions */}
                <div className="flex items-center gap-2 justify-end">
                  <button
                    type="button"
                    disabled={isEditingAdmin}
                    onClick={handleSelectAll}
                    className={`px-3 py-1 text-[11px] font-semibold rounded-lg border transition-colors ${
                      isEditingAdmin
                        ? "bg-slate-100 text-slate-400 border-slate-200 cursor-not-allowed"
                        : "bg-white text-slate-700 hover:bg-slate-100 border-slate-200 cursor-pointer"
                    }`}
                  >
                    Chọn tất cả
                  </button>
                  <button
                    type="button"
                    disabled={isEditingAdmin || selectedPermissions.length === 0}
                    onClick={handleRequestDeselectAll}
                    className={`px-3 py-1 text-[11px] font-semibold rounded-lg border transition-colors ${
                      isEditingAdmin || selectedPermissions.length === 0
                        ? "bg-slate-100 text-slate-400 border-slate-200 cursor-not-allowed"
                        : "bg-white text-rose-600 hover:bg-rose-50 border-rose-200 cursor-pointer"
                    }`}
                  >
                    Bỏ chọn hết
                  </button>
                </div>
              </div>
            </div>

            {/* Business Modules Grouped Permissions List */}
            <div className="max-h-[480px] overflow-y-auto space-y-3 pr-1 scrollbar-thin">
              {groupedBusinessModules.map((module) => {
                const groupCodes = module.permissions.map((p: ApiData) => (p.code || p.sPermissionCode) as string);
                const selectedInGroup = groupCodes.filter((c: string) => selectedPermissions.includes(c));
                const isAllGroupSelected = groupCodes.length > 0 && selectedInGroup.length === groupCodes.length;
                const isExpanded = expandedGroups[module.id] ?? true;

                // Search & Filter
                const q = permissionSearch.trim().toLowerCase();
                const filtered = module.permissions.filter((p: ApiData) => {
                  const info = getPermissionDisplayInfo(p);
                  const code = info.code.toLowerCase();
                  const name = info.name.toLowerCase();
                  const action = info.action.toLowerCase();
                  const actionLabel = info.actionLabel.toLowerCase();
                  const moduleName = module.name.toLowerCase();

                  const matches =
                    !q ||
                    code.includes(q) ||
                    name.includes(q) ||
                    action.includes(q) ||
                    actionLabel.includes(q) ||
                    moduleName.includes(q);

                  if (!matches) return false;

                  const isChecked = selectedPermissions.includes(info.code);
                  if (permissionFilterStatus === "selected") return isChecked;
                  if (permissionFilterStatus === "unselected") return !isChecked;
                  return true;
                });

                if (filtered.length === 0 && q) return null;

                return (
                  <div
                    key={module.id}
                    className="border border-slate-200/90 rounded-2xl overflow-hidden bg-white transition-all shadow-2xs"
                  >
                    {/* Module Header */}
                    <div className="p-3 bg-slate-50/70 border-b border-slate-100 flex items-center justify-between gap-3">
                      <div
                        className="flex items-center gap-2.5 flex-1 cursor-pointer select-none"
                        onClick={() => toggleGroupExpand(module.id)}
                      >
                        <button
                          type="button"
                          className="w-6 h-6 rounded-lg bg-white border border-slate-200 flex items-center justify-center text-slate-500 hover:text-slate-800 transition-transform shrink-0"
                        >
                          <svg
                            className={`w-3.5 h-3.5 transition-transform duration-200 ${isExpanded ? "rotate-90" : ""}`}
                            fill="none"
                            stroke="currentColor"
                            viewBox="0 0 24 24"
                          >
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M9 5l7 7-7 7" />
                          </svg>
                        </button>

                        <div className="p-1.5 rounded-lg border bg-white border-slate-200 text-slate-700 shrink-0">
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d={module.icon} />
                          </svg>
                        </div>

                        <div className="min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="text-xs sm:text-sm font-bold text-slate-900">{module.name}</span>
                            <span className="text-[10px] font-mono text-slate-400">({module.hintCode})</span>
                          </div>
                          <p className="text-[11px] text-slate-500 truncate hidden sm:block">{module.description}</p>
                        </div>
                      </div>

                      {/* Module Actions & Count */}
                      <div className="flex items-center gap-2 shrink-0">
                        <span
                          className={`px-2.5 py-0.5 rounded-full text-[11px] font-semibold border ${
                            selectedInGroup.length === groupCodes.length
                              ? "bg-slate-100 text-slate-700 border-slate-200"
                              : selectedInGroup.length > 0
                              ? "bg-slate-100 text-slate-700 border-slate-200"
                              : "bg-slate-50 text-slate-400 border-slate-200/60"
                          }`}
                        >
                          {selectedInGroup.length}/{groupCodes.length} quyền
                        </span>

                        {!isEditingAdmin && (
                          <button
                            type="button"
                            onClick={() => handleToggleGroup(groupCodes, isAllGroupSelected)}
                            className={`px-2.5 py-1 text-[11px] font-semibold rounded-lg border transition-colors cursor-pointer ${
                              isAllGroupSelected
                                ? "bg-white text-slate-700 border-slate-200 hover:bg-slate-100"
                                : "bg-[var(--color-primary-light)] text-[var(--color-primary)] border-[var(--color-primary)]/30 hover:opacity-90"
                            }`}
                          >
                            {isAllGroupSelected ? "Bỏ chọn nhóm" : "Chọn cả nhóm"}
                          </button>
                        )}
                      </div>
                    </div>

                    {/* Module Body: Permission Cards Grid */}
                    {isExpanded && (
                      <div className="p-3">
                        {filtered.length === 0 ? (
                          <div className="py-4 text-center text-xs text-slate-400">
                            Không có quyền nào phù hợp với điều kiện tìm kiếm trong nhóm này.
                          </div>
                        ) : (
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                            {filtered.map((p: ApiData) => {
                              const info = getPermissionDisplayInfo(p);
                              const isChecked = selectedPermissions.includes(info.code);

                              return (
                                <div
                                  key={info.code}
                                  role="checkbox"
                                  aria-checked={isChecked}
                                  tabIndex={isEditingAdmin ? -1 : 0}
                                  onClick={() => handleTogglePermission(info.code)}
                                  onKeyDown={(e) => {
                                    if (e.key === " " || e.key === "Enter") {
                                      e.preventDefault();
                                      handleTogglePermission(info.code);
                                    }
                                  }}
                                  className={`p-3 rounded-xl border transition-all select-none flex items-start gap-2.5 outline-none ${
                                    isEditingAdmin
                                      ? "bg-slate-50/60 border-slate-200 cursor-not-allowed opacity-90"
                                      : isChecked
                                      ? "bg-slate-50/70 border-slate-300 hover:border-slate-400 cursor-pointer shadow-2xs focus-visible:ring-2 focus-visible:ring-[var(--color-primary)]"
                                      : "bg-white border-slate-200 hover:border-slate-300 hover:bg-slate-50/40 cursor-pointer focus-visible:ring-2 focus-visible:ring-[var(--color-primary)]"
                                  }`}
                                >
                                  <input
                                    type="checkbox"
                                    checked={isChecked}
                                    disabled={isEditingAdmin}
                                    readOnly
                                    tabIndex={-1}
                                    className="mt-0.5 rounded border-slate-300 text-[var(--color-primary)] focus:ring-[var(--color-primary)] cursor-pointer"
                                  />

                                  <div className="flex-1 min-w-0">
                                    <div className="flex items-start justify-between gap-2">
                                      <span className="text-xs font-bold text-slate-900 leading-snug">
                                        {info.name}
                                      </span>
                                      <span
                                        className={`px-1.5 py-0.5 rounded text-[9px] font-mono font-bold uppercase shrink-0 border ${info.badgeStyle}`}
                                      >
                                        {info.action}
                                      </span>
                                    </div>

                                    {/* Secondary Details: code & technical hints */}
                                    <div className="mt-1 flex items-center gap-1.5 flex-wrap">
                                      <span className="text-[11px] font-mono text-slate-400 truncate">
                                        {info.code}
                                      </span>
                                      {permissionViewMode === "advanced" && (
                                        <span className="text-[9px] text-slate-400 font-sans bg-slate-100 px-1 py-0.2 rounded">
                                          {info.actionLabel}
                                        </span>
                                      )}
                                    </div>
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>

            {/* Sticky Modal Footer */}
            <div className="sticky bottom-0 -mx-6 -mb-6 mt-4 p-4 bg-white/95 backdrop-blur-xs border-t border-slate-200 flex flex-col sm:flex-row sm:items-center justify-between gap-3 z-10">
              <div className="flex items-center gap-2.5 flex-wrap">
                <span className="text-xs text-slate-600 font-medium">
                  <strong className="text-slate-900 font-bold text-sm">
                    {selectedPermissions.length}
                  </strong>{" "}
                  / {permissions.length} quyền được chọn
                </span>

                {isEditingAdmin ? (
                  <span className="px-2 py-0.5 rounded-full text-[11px] font-semibold bg-purple-50 text-purple-700 border border-purple-200">
                    Mặc định toàn quyền
                  </span>
                ) : hasUnsavedChanges ? (
                  <span className="px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-amber-50 text-amber-700 border border-amber-200 flex items-center gap-1.5 animate-pulse">
                    <span className="w-1.5 h-1.5 rounded-full bg-amber-500" />
                    Có thay đổi chưa lưu
                  </span>
                ) : (
                  <span className="text-[11px] text-slate-400">
                    (Chưa có thay đổi)
                  </span>
                )}
              </div>

              <div className="flex items-center gap-2 justify-end">
                <button
                  type="button"
                  onClick={handleRequestCloseRoleModal}
                  className="px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100 rounded-xl cursor-pointer transition-colors"
                >
                  {isEditingAdmin || !hasUnsavedChanges ? "Đóng" : "Hủy"}
                </button>
                {!isEditingAdmin && (
                  <button
                    type="button"
                    disabled={!hasUnsavedChanges || actionLoading}
                    onClick={handleSaveRolePermissions}
                    className={`px-5 py-2 text-xs font-semibold rounded-xl transition-all flex items-center gap-2 ${
                      !hasUnsavedChanges || actionLoading
                        ? "bg-slate-100 text-slate-400 border border-slate-200 cursor-not-allowed"
                        : "bg-[var(--color-primary)] hover:opacity-90 text-white cursor-pointer shadow-xs hover:shadow-md"
                    }`}
                  >
                    {actionLoading ? (
                      <>
                        <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                        <span>Đang lưu cấu hình...</span>
                      </>
                    ) : (
                      <span>Lưu thay đổi</span>
                    )}
                  </button>
                )}
              </div>
            </div>
          </div>
        </Modal>
      )}

      {/* MODAL 4: CREATE / EDIT ADVISOR ASSIGNMENT */}
      <Modal
        isOpen={showAssignModal}
        onClose={() => setShowAssignModal(false)}
        title={assignModalMode === "edit" ? "Thay đổi phân công Cố vấn học tập" : "Phân công Cố vấn học tập"}
        description="Gán giảng viên cố vấn phụ trách lớp học sinh hoạt theo từng học kỳ"
        maxWidth="md"
      >
        <form onSubmit={handleSaveAssignment} className="space-y-4">
          {eligibleAdvisors.length === 0 && (
            <div className="p-3 bg-amber-50 border border-amber-200 rounded-xl text-xs text-amber-800 leading-relaxed">
              <strong>Lưu ý:</strong> Hiện tại chưa có tài khoản nào được cấp vai trò GVCN / CVHT (<code>class_advisor</code>).
              Vui lòng tạo tài khoản mới hoặc gán vai trò GVCN cho giảng viên trước khi phân công lớp.
            </div>
          )}

          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              Giảng viên cố vấn <span className="text-red-500">*</span>
            </label>
            <select
              value={assignForm.userId}
              onChange={(e) => setAssignForm({ ...assignForm, userId: e.target.value })}
              className="w-full bg-white border border-slate-200 rounded-xl px-3 py-2 text-xs font-medium text-slate-800 focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)]"
            >
              {eligibleAdvisors.length === 0 ? (
                <option value="" disabled>Chưa có giảng viên có vai trò GVCN / CVHT</option>
              ) : (
                eligibleAdvisors.map((u) => {
                  const label = u.fullName.toLowerCase().includes("cố vấn")
                    ? `${u.fullName} (${u.username})`
                    : `Cố vấn học tập - ${u.fullName} (${u.username})`;
                  return (
                    <option key={u.id} value={u.id}>
                      {label}
                    </option>
                  );
                })
              )}
            </select>
            <p className="text-[11px] text-slate-400 mt-1">Chỉ hiển thị các tài khoản đã được cấp vai trò GVCN / CVHT</p>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              Lớp phụ trách <span className="text-red-500">*</span>
            </label>
            <select
              value={assignForm.classId}
              onChange={(e) => setAssignForm({ ...assignForm, classId: e.target.value })}
              className="w-full bg-white border border-slate-200 rounded-xl px-3 py-2 text-xs font-medium text-slate-800 focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)]"
            >
              {classes.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.classId} - {c.className}
                </option>
              ))}
            </select>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Năm học <span className="text-red-500">*</span>
              </label>
              <select
                value={assignForm.academicYearId}
                onChange={(e) => {
                  const yId = e.target.value;
                  const terms = years.find((y) => y.id === yId)?.terms || [];
                  setAssignForm({
                    ...assignForm,
                    academicYearId: yId,
                    academicTermId: terms[0]?.id || "",
                  });
                }}
                className="w-full bg-white border border-slate-200 rounded-xl px-3 py-2 text-xs font-medium text-slate-800 focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)]"
              >
                {years.map((y) => (
                  <option key={y.id} value={y.id}>
                    {y.sYearCode || y.yearCode}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Học kỳ <span className="text-red-500">*</span>
              </label>
              <select
                value={assignForm.academicTermId}
                onChange={(e) => setAssignForm({ ...assignForm, academicTermId: e.target.value })}
                className="w-full bg-white border border-slate-200 rounded-xl px-3 py-2 text-xs font-medium text-slate-800 focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)]"
              >
                <option value="">Chọn học kỳ</option>
                {termsForAssignYear.map((t: ApiData) => (
                  <option key={t.id} value={t.id}>
                    {t.sTermCode || t.termCode}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="flex items-center justify-end gap-2 pt-4 border-t border-slate-100">
            <button
              type="button"
              onClick={() => setShowAssignModal(false)}
              className="px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100 rounded-xl cursor-pointer"
            >
              Hủy
            </button>
            <button
              type="submit"
              disabled={actionLoading || eligibleAdvisors.length === 0}
              className="px-4 py-2 text-xs font-semibold text-white bg-[var(--color-primary)] hover:opacity-90 rounded-xl cursor-pointer shadow-xs disabled:opacity-50"
            >
              {actionLoading ? "Đang lưu..." : assignModalMode === "edit" ? "Cập nhật phân công" : "Tạo phân công"}
            </button>
          </div>
        </form>
      </Modal>

      {/* MODAL 5: ADVISOR ASSIGNMENT DETAILS */}
      {viewingAdvisor && (
        <Modal
          isOpen={Boolean(viewingAdvisor)}
          onClose={() => setViewingAdvisor(null)}
          title="Chi tiết phân công Cố vấn học tập"
          maxWidth="md"
        >
          <div className="space-y-4">
            <div className="p-4 bg-slate-50 border border-slate-200 rounded-2xl space-y-3">
              <div className="flex justify-between items-center text-xs pb-2 border-b border-slate-200/60">
                <span className="text-slate-500">Giảng viên cố vấn:</span>
                <span className="font-bold text-slate-900">
                  {viewingAdvisor.matchedUser?.fullName || viewingAdvisor.advisorName || viewingAdvisor.userFullName || "Cố vấn học tập"}
                </span>
              </div>

              <div className="flex justify-between items-center text-xs pb-2 border-b border-slate-200/60">
                <span className="text-slate-500">Tên đăng nhập:</span>
                <span className="font-mono text-slate-700">
                  {viewingAdvisor.matchedUser?.username || viewingAdvisor.userName || viewingAdvisor.advisorUserId}
                </span>
              </div>

              {viewingAdvisor.matchedUser?.email && (
                <div className="flex justify-between items-center text-xs pb-2 border-b border-slate-200/60">
                  <span className="text-slate-500">Email liên hệ:</span>
                  <span className="text-slate-700">{viewingAdvisor.matchedUser.email}</span>
                </div>
              )}

              <div className="flex justify-between items-center text-xs pb-2 border-b border-slate-200/60">
                <span className="text-slate-500">Lớp phụ trách:</span>
                <div className="text-right">
                  <div className="font-bold text-slate-900">{viewingAdvisor.classCode || viewingAdvisor.classId}</div>
                  {viewingAdvisor.className && (
                    <div className="text-[11px] text-slate-500">{viewingAdvisor.className}</div>
                  )}
                </div>
              </div>

              <div className="flex justify-between items-center text-xs pb-2 border-b border-slate-200/60">
                <span className="text-slate-500">Năm học:</span>
                <span className="font-medium text-slate-800">
                  {viewingAdvisor.academicYear || getAdvisorTermAndYear(viewingAdvisor.academicTermId).yearName}
                </span>
              </div>

              <div className="flex justify-between items-center text-xs pb-2 border-b border-slate-200/60">
                <span className="text-slate-500">Học kỳ:</span>
                <span className="font-medium text-slate-800">
                  {viewingAdvisor.termCode || getAdvisorTermAndYear(viewingAdvisor.academicTermId).termName}
                </span>
              </div>

              <div className="flex justify-between items-center text-xs pb-2 border-b border-slate-200/60">
                <span className="text-slate-500">Ngày phân công:</span>
                <span className="text-slate-700">{formatDateVN(viewingAdvisor.assignedAt)}</span>
              </div>

              <div className="flex justify-between items-center text-xs">
                <span className="text-slate-500">Trạng thái:</span>
                <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-emerald-50 text-emerald-800 border border-emerald-200">
                  Đang hiệu lực
                </span>
              </div>
            </div>

            <div className="flex items-center justify-end pt-3 border-t border-slate-100">
              <button
                type="button"
                onClick={() => setViewingAdvisor(null)}
                className="px-4 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-100 border border-slate-200 rounded-xl cursor-pointer"
              >
                Đóng
              </button>
            </div>
          </div>
        </Modal>
      )}

      {/* CONFIRM DIALOG: THU HỒI PHÂN CÔNG */}
      <ConfirmDialog
        isOpen={Boolean(revokeTarget)}
        onClose={() => setRevokeTarget(null)}
        onConfirm={handleConfirmRevoke}
        loading={actionLoading}
        isDangerous
        title="Xác nhận thu hồi phân công"
        message={
          <span>
            Bạn có chắc chắn muốn thu hồi phân công lớp <strong>{revokeTarget?.classCode || revokeTarget?.classId}</strong> của cố vấn{" "}
            <strong>{revokeTarget?.advisorName || revokeTarget?.userFullName || revokeTarget?.userName}</strong> không? Giảng viên này sẽ không còn quyền xem dữ liệu của lớp sau khi thu hồi.
          </span>
        }
        confirmText="Thu hồi phân công"
        cancelText="Hủy bỏ"
      />

      {/* CONFIRM DIALOG: BỎ CHỌN TẤT CẢ QUYỀN */}
      <ConfirmDialog
        isOpen={showDeselectAllConfirm}
        onClose={() => setShowDeselectAllConfirm(false)}
        onConfirm={handleConfirmDeselectAll}
        isDangerous
        title="Bỏ toàn bộ quyền khỏi vai trò này?"
        message={
          <span>
            Bạn có chắc chắn muốn bỏ chọn toàn bộ <strong>{selectedPermissions.length}</strong> quyền khỏi vai trò{" "}
            <strong>{editingRole ? getRoleMetadata(editingRole.code).label || editingRole.name : ""}</strong> không?
            Người dùng mang vai trò này sẽ không còn quyền hạn nào sau khi lưu thay đổi.
          </span>
        }
        confirmText="Bỏ toàn bộ quyền"
        cancelText="Hủy bỏ"
      />

      {/* CONFIRM DIALOG: ĐÓNG KHI CÓ THAY ĐỔI CHƯA LƯU */}
      <ConfirmDialog
        isOpen={showUnsavedConfirm}
        onClose={() => setShowUnsavedConfirm(false)}
        onConfirm={() => {
          setShowUnsavedConfirm(false);
          setShowRolePermissionsModal(false);
        }}
        isDangerous
        title="Có thay đổi chưa được lưu"
        message="Bạn đã thay đổi phân quyền cho vai trò này nhưng chưa nhấn 'Lưu thay đổi'. Bạn có chắc chắn muốn đóng mà không lưu các thay đổi?"
        confirmText="Hủy thay đổi & Đóng"
        cancelText="Tiếp tục chỉnh sửa"
      />
    </div>
  );
}
