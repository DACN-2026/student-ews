"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useAuthStore, ROLE_USER_PRESETS } from "@/stores/authStore";

interface HeaderProps {
  title?: string;
  onMenuToggle?: () => void;
}

export default function Header({ title = "Cổng quản trị CNTT", onMenuToggle }: HeaderProps) {
  const router = useRouter();
  const { user, logout } = useAuthStore();
  const userInfo = user
    ? {
        name: user.fullName,
        unit: ROLE_USER_PRESETS[user.role]?.unit || "Khoa CNTT",
      }
    : ROLE_USER_PRESETS.SYSTEM_ADMIN;

  const [showNotifications, setShowNotifications] = useState(false);

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
        {/* Notifications Bell */}
        <div className="relative">
          <button
            type="button"
            onClick={() => setShowNotifications((v) => !v)}
            className="relative p-2 rounded-xl text-slate-500 hover:text-slate-800 hover:bg-slate-100 transition-colors cursor-pointer"
            title="Thông báo cảnh báo sớm"
            aria-label="Thông báo cảnh báo sớm"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
              <path d="M13.73 21a2 2 0 0 1-3.46 0" />
            </svg>
            <span className="absolute top-1.5 right-1.5 w-2 h-2 bg-red-600 rounded-full animate-ping" />
            <span className="absolute top-1.5 right-1.5 w-2 h-2 bg-red-600 rounded-full" />
          </button>

          {/* Notifications Dropdown */}
          {showNotifications && (
            <div
              className="absolute right-0 mt-2 w-80 bg-white border border-slate-200 rounded-2xl shadow-xl p-4 z-50 text-xs space-y-3"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-center justify-between pb-2 border-b border-slate-100">
                <span className="font-bold text-slate-900" style={{ fontFamily: "Be Vietnam Pro, sans-serif" }}>
                  Thông báo Cảnh báo Sớm (SEWS)
                </span>
                <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-red-100 text-red-700">
                  Mới
                </span>
              </div>

              <div className="space-y-2">
                <Link
                  href="/academic-warnings"
                  onClick={() => setShowNotifications(false)}
                  className="block p-2.5 rounded-xl bg-red-50 hover:bg-red-100/70 border border-red-200 transition-colors"
                >
                  <div className="flex items-center gap-1.5 font-bold text-red-800">
                    <span className="w-1.5 h-1.5 rounded-full bg-red-600" />
                    <span>Cảnh báo nguy cơ cao (Mức Đỏ)</span>
                  </div>
                  <p className="text-[11px] text-red-700 mt-1">
                    Có sinh viên vi phạm ngưỡng GPA học kỳ &lt; 2.0 cần xếp lịch hẹn can thiệp gấp.
                  </p>
                </Link>

                <Link
                  href="/academic-warnings"
                  onClick={() => setShowNotifications(false)}
                  className="block p-2.5 rounded-xl bg-amber-50 hover:bg-amber-100/70 border border-amber-200 transition-colors"
                >
                  <div className="flex items-center gap-1.5 font-bold text-amber-800">
                    <span className="w-1.5 h-1.5 rounded-full bg-amber-600" />
                    <span>Đôn đốc đăng ký học phần</span>
                  </div>
                  <p className="text-[11px] text-amber-700 mt-1">
                    Một số sinh viên chưa tích lũy đủ tín chỉ tối thiểu theo kế hoạch học kỳ.
                  </p>
                </Link>
              </div>

              <div className="pt-2 border-t border-slate-100 text-center">
                <Link
                  href="/academic-warnings"
                  onClick={() => setShowNotifications(false)}
                  className="text-[11px] font-bold text-[var(--color-primary)] hover:underline"
                >
                  Xem toàn bộ cảnh báo →
                </Link>
              </div>
            </div>
          )}
        </div>

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
