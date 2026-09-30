"use client";

import { useRouter } from "next/navigation";
import { useAuthStore, ROLE_USER_PRESETS } from "@/stores/authStore";

interface HeaderProps {
  title?: string;
  onMenuToggle?: () => void;
}

export default function Header({ title = "Cổng quản trị CNTT", onMenuToggle }: HeaderProps) {
  const router = useRouter();
  const { user, logout } = useAuthStore();

  const getRoleDisplayName = (role?: string) => {
    if (role === "SYSTEM_ADMIN") return "Quản trị hệ thống";
    if (role === "FACULTY_BOARD") return "Ban chủ nhiệm Khoa";
    if (role === "CLASS_ADVISOR") return "GVCN / CVHT";
    if (role === "FACULTY_STAFF") return "Giáo vụ Khoa";
    if (role === "STUDENT_AFFAIRS_ASSISTANT") return "Trợ lý CTSV";
    if (role === "COMMS_ASSISTANT") return "Tổ Truyền thông";
    return "Người dùng";
  };

  const getScopeDisplayName = () => {
    if (!user) return "";
    if (user.role === "SYSTEM_ADMIN") return "Toàn hệ thống";
    if (user.role === "FACULTY_BOARD") {
      return user.facultyCode ? `Khoa ${user.facultyCode}` : "Phạm vi Khoa";
    }
    if (user.role === "CLASS_ADVISOR") {
      return user.className ? `Lớp ${user.className}` : (user.classFullName || "Lớp phụ trách");
    }
    return user.facultyCode ? `Khoa ${user.facultyCode}` : "";
  };

  const roleName = getRoleDisplayName(user?.role);
  const scopeName = getScopeDisplayName();
  const unitText = scopeName ? `${roleName} • ${scopeName}` : roleName;

  const userInfo = {
    name: user?.fullName || (user ? ROLE_USER_PRESETS[user.role]?.name : "Quản trị viên"),
    unit: user ? unitText : "Quản trị hệ thống",
  };

  return (
    <header className="h-16 bg-[var(--color-surface)] border-b border-[var(--color-border)] flex items-center justify-between px-4 sm:px-6 gap-4 flex-shrink-0 z-20 shadow-xs relative">
      {/* Left: Mobile Toggle & Title */}
      <div className="flex items-center gap-3 min-w-0">
        {/* Mobile Hamburger Button */}
        <button
          type="button"
          onClick={onMenuToggle}
          className="md:hidden p-2 rounded-xl text-slate-500 hover:text-slate-800 hover:bg-slate-100 transition-colors cursor-pointer"
          title="Mở menu"
          aria-label="Mở menu"
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <line x1="3" y1="6" x2="21" y2="6" />
            <line x1="3" y1="12" x2="21" y2="12" />
            <line x1="3" y1="18" x2="21" y2="18" />
          </svg>
        </button>

        <h1
          className="text-sm sm:text-base font-bold text-[var(--color-text)] truncate tracking-tight"
          style={{ fontFamily: "Be Vietnam Pro, sans-serif" }}
        >
          {title}
        </h1>
      </div>

      {/* Right Controls */}
      <div className="flex items-center gap-2 sm:gap-3">
        {/* User profile */}
        <div className="flex items-center gap-2.5 pl-2 sm:pl-3 border-l border-[var(--color-border)]">
          <div className="text-right hidden sm:block">
            <div
              className="text-xs sm:text-sm font-semibold text-[var(--color-text)] leading-tight"
              style={{ fontFamily: "Be Vietnam Pro, sans-serif" }}
            >
              {userInfo.name}
            </div>
            <div className="text-[10px] sm:text-[11px] text-[var(--color-text-secondary)]">
              {userInfo.unit}
            </div>
          </div>

          <div
            className="w-8 h-8 sm:w-9 sm:h-9 rounded-xl bg-gradient-to-tr from-[var(--color-primary)] to-lime-400 flex items-center justify-center text-white text-xs font-bold shadow-xs flex-shrink-0"
            style={{ fontFamily: "Be Vietnam Pro, sans-serif" }}
          >
            {userInfo.name.split(" ").pop()?.charAt(0) || "U"}
          </div>

          {/* Logout button */}
          <button
            type="button"
            onClick={() => void logout().then(() => router.replace("/login"))}
            className="flex items-center gap-1.5 p-1.5 sm:px-2.5 sm:py-1.5 rounded-lg text-xs font-medium text-gray-500 hover:text-red-600 hover:bg-red-50 transition-colors cursor-pointer"
            title="Đăng xuất khỏi hệ thống"
          >
            <svg
              width="15"
              height="15"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
              <polyline points="16 17 21 12 16 7" />
              <line x1="21" y1="12" x2="9" y2="12" />
            </svg>
            <span className="hidden lg:inline">Đăng xuất</span>
          </button>
        </div>
      </div>
    </header>
  );
}
