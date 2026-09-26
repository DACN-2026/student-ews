"use client";

import StudentProgressLookupTab from "@/components/training-progress/StudentProgressLookupTab";
import ForbiddenState from "@/components/ui/ForbiddenState";
import { useAuthStore } from "@/stores/authStore";

export default function TrainingProgressPage() {
  const { user, can, status } = useAuthStore();

  const isClassAdvisor = user?.role === "CLASS_ADVISOR";
  const isFacultyBoard = user?.role === "FACULTY_BOARD";

  const scopeBadgeText = isClassAdvisor
    ? null
    : isFacultyBoard
    ? `Phạm vi: ${user?.facultyCode ? `Khoa ${user.facultyCode}` : "Phạm vi Khoa"}`
    : null;

  const pageTitle = isClassAdvisor
    ? `Tiến độ Đào tạo • Lớp ${user?.className || ""}`
    : isFacultyBoard
    ? "Theo dõi Tiến độ Đào tạo Khoa"
    : "Theo dõi Tiến độ Đào tạo";

  if (status !== "loading" && status !== "idle" && !can("progress.read")) {
    return <ForbiddenState requiredPermission="progress.read" />;
  }

  return (
    <main className="mx-auto max-w-7xl space-y-6 p-4 sm:p-6">
      {/* Clean page header without heavy boxing */}
      <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="flex items-center gap-2 flex-wrap">
            <span className="inline-flex items-center rounded-md bg-lime-100 px-2 py-0.5 text-xs font-bold text-lime-800">
              Phân hệ Học vụ & Đào tạo
            </span>
            {scopeBadgeText && (
              <>
                <span className="text-xs text-slate-400">•</span>
                <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-emerald-50 text-emerald-700 border border-emerald-200">
                  {scopeBadgeText}
                </span>
              </>
            )}
          </div>
          <h1 className="mt-1.5 text-2xl font-bold tracking-tight text-slate-900 sm:text-3xl">
            {pageTitle}
          </h1>
          <p className="mt-1 text-sm text-slate-500">
            Theo dõi sinh viên đang đi tới đâu trong chương trình đào tạo, đánh giá học phần đạt, nợ, học trước và chỉ tiêu tự chọn.
          </p>
        </div>
      </div>

      {/* Active Main View */}
      <StudentProgressLookupTab />
    </main>
  );
}


