"use client";

import Link from "next/link";
import { useAuthStore } from "@/stores/authStore";

interface ForbiddenStateProps {
  title?: string;
  description?: string;
  requiredPermission?: string | string[];
}

export default function ForbiddenState({
  title = "Không có quyền truy cập",
  description = "Tài khoản của bạn chưa được cấp quyền để truy cập trang này theo phân quyền dữ liệu (RBAC).",
  requiredPermission,
}: ForbiddenStateProps) {
  const { user } = useAuthStore();

  const roleLabels: Record<string, string> = {
    SYSTEM_ADMIN: "Quản trị hệ thống",
    FACULTY_BOARD: "Ban chủ nhiệm Khoa",
    CLASS_ADVISOR: "GVCN / CVHT",
    FACULTY_STAFF: "Giáo vụ Khoa",
    STUDENT_AFFAIRS_ASSISTANT: "Trợ lý CTSV",
    COMMS_ASSISTANT: "Tổ Truyền thông",
  };

  const currentRoleName = user?.role ? roleLabels[user.role] || user.role : "Chưa xác thực";

  return (
    <div className="min-h-[70vh] flex items-center justify-center p-6">
      <div className="max-w-md w-full bg-white border border-slate-200/90 rounded-2xl p-6 sm:p-8 shadow-xs text-center space-y-4">
        {/* Shield Warning Icon */}
        <div className="w-14 h-14 rounded-2xl bg-amber-50 border border-amber-200 flex items-center justify-center mx-auto text-amber-600 shadow-xs">
          <svg
            width="28"
            height="28"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
            <line x1="12" y1="8" x2="12" y2="12" />
            <line x1="12" y1="16" x2="12.01" y2="16" />
          </svg>
        </div>

        {/* 403 Badge */}
        <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold bg-slate-100 text-slate-700 border border-slate-200">
          <span>Mã lỗi: 403 Forbidden</span>
        </div>

        {/* Title & Description */}
        <div className="space-y-1.5">
          <h2
            className="text-lg sm:text-xl font-bold text-slate-900 tracking-tight"
            style={{ fontFamily: "Be Vietnam Pro, sans-serif" }}
          >
            {title}
          </h2>
          <p className="text-xs sm:text-sm text-slate-500 leading-relaxed">
            {description}
          </p>
        </div>

        {/* Role & Scope context */}
        <div className="p-3 bg-slate-50 rounded-xl border border-slate-200/80 text-xs text-left space-y-1">
          <div className="flex justify-between">
            <span className="text-slate-500">Vai trò hiện tại:</span>
            <span className="font-semibold text-slate-800">{currentRoleName}</span>
          </div>
          {user?.facultyCode && (
            <div className="flex justify-between">
              <span className="text-slate-500">Khoa trực thuộc:</span>
              <span className="font-medium text-slate-700">Khoa {user.facultyCode}</span>
            </div>
          )}
          {user?.className && (
            <div className="flex justify-between">
              <span className="text-slate-500">Lớp phân công:</span>
              <span className="font-medium text-slate-700">{user.className}</span>
            </div>
          )}
          {requiredPermission && (
            <div className="flex justify-between pt-1 border-t border-slate-200/60 text-[11px]">
              <span className="text-slate-500">Yêu cầu quyền:</span>
              <span className="font-mono text-slate-600">
                {Array.isArray(requiredPermission) ? requiredPermission.join(" | ") : requiredPermission}
              </span>
            </div>
          )}
        </div>

        {/* Action button */}
        <div className="pt-2">
          <Link
            href="/dashboard"
            className="w-full inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-[var(--color-primary)] hover:opacity-90 text-white text-xs font-bold shadow-xs transition-opacity cursor-pointer"
          >
            <svg
              width="14"
              height="14"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <polyline points="15 18 9 12 15 6" />
            </svg>
            <span>Quay lại Trang Tổng quan</span>
          </Link>
        </div>
      </div>
    </div>
  );
}
