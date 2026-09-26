"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useAuthStore, type Role } from "@/stores/authStore";

export type NavItem = {
  id: string;
  href: string;
  label: string;
  icon: React.ReactNode;
  permission?: string;
  permissions?: string[];
};

interface SidebarProps {
  collapsed: boolean;
  onToggle: () => void;
  onCloseMobile?: () => void;
}

const Icons = {
  dashboard: (
    <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="3" width="7" height="7" rx="1.5" />
      <rect x="14" y="3" width="7" height="7" rx="1.5" />
      <rect x="3" y="14" width="7" height="7" rx="1.5" />
      <rect x="14" y="14" width="7" height="7" rx="1.5" />
    </svg>
  ),
  students: (
    <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
      <circle cx="9" cy="7" r="4" />
      <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
      <path d="M16 3.13a4 4 0 0 1 0 7.75" />
    </svg>
  ),
  academics: (
    <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" />
      <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z" />
    </svg>
  ),
  progress: (
    <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <line x1="18" y1="20" x2="18" y2="10" />
      <line x1="12" y1="20" x2="12" y2="4" />
      <line x1="6" y1="20" x2="6" y2="14" />
    </svg>
  ),
  graduation: (
    <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M22 10v6M2 10l10-5 10 5-10 5z" />
      <path d="M6 12v5c3 3 9 3 12 0v-5" />
    </svg>
  ),
  rbac: (
    <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
      <path d="M7 11V7a5 5 0 0 1 10 0v4" />
    </svg>
  ),
  menu: (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <line x1="3" y1="6" x2="21" y2="6" />
      <line x1="3" y1="12" x2="21" y2="12" />
      <line x1="3" y1="18" x2="21" y2="18" />
    </svg>
  ),
  chevronLeft: (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="15 18 9 12 15 6" />
    </svg>
  ),
  reports: (
    <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
      <polyline points="14 2 14 8 20 8" />
      <line x1="16" y1="13" x2="8" y2="13" />
      <line x1="16" y1="17" x2="8" y2="17" />
    </svg>
  ),
  settings: (
    <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z" />
    </svg>
  ),
};

// Core navigation items with RBAC
const coreNavItems: NavItem[] = [
  {
    id: "dashboard",
    href: "/dashboard",
    label: "Tổng quan",
    icon: Icons.dashboard,
  },
  {
    id: "students",
    href: "/students",
    label: "Sinh viên",
    icon: Icons.students,
    permission: "student.read",
  },
  {
    id: "academics",
    href: "/academics",
    label: "Đào tạo",
    icon: Icons.academics,
    permissions: [
      "academic_term.manage",
      "class.manage",
      "progress.read",
      "progress.plan.manage",
    ],
  },
  {
    id: "training-progress",
    href: "/training-progress",
    label: "Tiến độ đào tạo",
    icon: Icons.progress,
    permission: "progress.read",
  },
  {
    id: "graduation-forecast",
    href: "/graduation-forecast",
    label: "Dự kiến tốt nghiệp",
    icon: Icons.graduation,
    permission: "graduation.read",
  },
  {
    id: "reports",
    href: "/reports",
    label: "Cảnh báo học tập",
    icon: Icons.reports,
    permission: "academic_warning.read",
  },
  {
    id: "rbac",
    href: "/rbac",
    label: "Phân quyền",
    icon: Icons.rbac,
    permissions: [
      "user.manage",
      "role.manage",
      "advisor_assignment.manage",
    ],
  },
  {
    id: "settings",
    href: "/settings",
    label: "Cấu hình",
    icon: Icons.settings,
    permission: "academic_warning.policy.manage",
  },
];

const roleLabels: Record<Role, { label: string; badgeClass: string; avatar: string }> = {
  SYSTEM_ADMIN: {
    label: "Quản trị hệ thống",
    badgeClass: "bg-purple-100 text-purple-700 border-purple-200",
    avatar: "AD",
  },
  FACULTY_BOARD: {
    label: "Ban chủ nhiệm Khoa",
    badgeClass: "bg-amber-100 text-amber-700 border-amber-200",
    avatar: "KN",
  },
  CLASS_ADVISOR: {
    label: "GVCN / CVHT",
    badgeClass: "bg-emerald-100 text-emerald-700 border-emerald-200",
    avatar: "CV",
  },
  FACULTY_STAFF: {
    label: "Giáo vụ Khoa",
    badgeClass: "bg-blue-100 text-blue-700 border-blue-200",
    avatar: "GV",
  },
  STUDENT_AFFAIRS_ASSISTANT: {
    label: "Trợ lý CTSV",
    badgeClass: "bg-indigo-100 text-indigo-700 border-indigo-200",
    avatar: "CT",
  },
  COMMS_ASSISTANT: {
    label: "Truyền thông",
    badgeClass: "bg-teal-100 text-teal-700 border-teal-200",
    avatar: "TT",
  },
};

export default function Sidebar({ collapsed, onToggle, onCloseMobile }: SidebarProps) {
  const pathname = usePathname();
  const { user, can } = useAuthStore();
  const currentRole = user?.role || "SYSTEM_ADMIN";
  const roleMeta = roleLabels[currentRole] || roleLabels.SYSTEM_ADMIN;

  // Permission-based menu filtering matching SWE logic
  const filteredItems = coreNavItems.filter((item) => {
    if (item.permission) {
      return can(item.permission);
    }
    if (item.permissions) {
      return item.permissions.some((p) => can(p));
    }
    return true;
  });

  return (
    <aside
      className="flex flex-col h-full bg-[var(--color-surface)] border-r border-[var(--color-border)] transition-all duration-200 select-none z-20 shadow-sm"
      style={{ width: collapsed ? 68 : 252, minWidth: collapsed ? 68 : 252 }}
    >
      {/* Brand Header */}
      <div className="flex items-center gap-3 px-4 py-4 border-b border-[var(--color-border)] h-16">
        <Link href="/dashboard" className="flex items-center gap-3 min-w-0">
          <div
            className="w-9 h-9 rounded-xl bg-[var(--color-primary)] flex items-center justify-center text-white font-black text-xs flex-shrink-0 shadow-sm tracking-wider"
            style={{ fontFamily: "Be Vietnam Pro, sans-serif" }}
          >
            DLU
          </div>
          {!collapsed && (
            <div className="min-w-0 flex-1">
              <div
                className="font-bold text-sm leading-tight truncate text-[var(--color-text)] tracking-tight"
                style={{ fontFamily: "Be Vietnam Pro, sans-serif" }}
              >
                PORTAL CNTT
              </div>
              <div className="text-[11px] text-[var(--color-text-secondary)] truncate">
                Đại học Đà Lạt
              </div>
            </div>
          )}
        </Link>
        <button
          onClick={onToggle}
          className="ml-auto text-[var(--color-text-secondary)] hover:text-[var(--color-text)] hover:bg-[var(--color-surface2)] transition-colors flex-shrink-0 cursor-pointer p-1.5 rounded-lg"
          title={collapsed ? "Mở rộng menu" : "Thu gọn menu"}
          aria-label={collapsed ? "Mở rộng menu" : "Thu gọn menu"}
        >
          {collapsed ? Icons.menu : Icons.chevronLeft}
        </button>
      </div>

      {/* Role Badge Indicator */}
      {!collapsed && (
        <div className="px-3.5 py-3 border-b border-[var(--color-border)] bg-[var(--color-bg)]/40">
          <div className="flex items-center gap-2.5">
            <div className="w-7 h-7 rounded-lg bg-[var(--color-surface)] flex items-center justify-center text-[10px] font-bold text-[var(--color-primary)] border border-[var(--color-border)] shadow-xs">
              {roleMeta.avatar}
            </div>
            <div className="min-w-0 flex-1">
              <div className="text-[10px] text-[var(--color-text-secondary)] uppercase tracking-wider font-semibold">
                Vai trò truy cập
              </div>
              <div
                className={`text-[11px] font-semibold px-2 py-0.5 rounded-md border mt-0.5 truncate inline-block ${roleMeta.badgeClass}`}
              >
                {roleMeta.label}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Navigation (7 core items) */}
      <nav className="flex-1 px-2.5 py-3 space-y-1 overflow-y-auto scrollbar-hide">
        {filteredItems.map((item) => {
          const active =
            pathname === item.href ||
            (item.href !== "/dashboard" && pathname.startsWith(item.href));

          return (
            <Link
              key={item.id}
              href={item.href}
              onClick={onCloseMobile}
              title={collapsed ? item.label : undefined}
              className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all duration-150 cursor-pointer group ${
                active
                  ? "bg-[var(--color-primary-light)] text-[var(--color-primary)] font-semibold shadow-xs"
                  : "text-[var(--color-text-secondary)] hover:bg-[var(--color-surface2)] hover:text-[var(--color-text)]"
              }`}
              style={{ fontFamily: "Be Vietnam Pro, sans-serif" }}
            >
              <span
                className={`flex-shrink-0 transition-colors ${
                  active
                    ? "text-[var(--color-primary)]"
                    : "text-gray-400 group-hover:text-[var(--color-text)]"
                }`}
              >
                {item.icon}
              </span>
              {!collapsed && (
                <span className="truncate flex-1 tracking-tight">{item.label}</span>
              )}
              {active && !collapsed && (
                <span className="w-1.5 h-1.5 rounded-full bg-[var(--color-primary)] flex-shrink-0" />
              )}
            </Link>
          );
        })}
      </nav>

      {/* Access context footer */}
      <div className="p-3 border-t border-[var(--color-border)] bg-[var(--color-surface)]">
        {!collapsed ? (
          <div className="flex items-center justify-between text-xs text-[var(--color-text-secondary)] bg-[var(--color-surface2)]/60 px-3 py-2 rounded-xl">
            <div className="flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-[var(--color-green)] animate-pulse flex-shrink-0" />
              <span className="font-medium text-[11px]">Dữ liệu theo quyền được cấp</span>
            </div>
            <span className="text-[10px] bg-white border border-[var(--color-border)] px-1.5 py-0.5 rounded font-mono">
              RBAC
            </span>
          </div>
        ) : (
          <div className="flex justify-center" title="Dữ liệu theo quyền được cấp">
            <span className="w-2.5 h-2.5 rounded-full bg-[var(--color-green)]" />
          </div>
        )}
      </div>
    </aside>
  );
}
