"use client";

import StudentProgressLookupTab from "@/components/training-progress/StudentProgressLookupTab";

export default function TrainingProgressPage() {
  return (
    <main className="mx-auto max-w-7xl space-y-6 p-4 sm:p-6">
      {/* Clean page header without heavy boxing */}
      <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="flex items-center gap-2">
            <span className="inline-flex items-center rounded-md bg-lime-100 px-2 py-0.5 text-xs font-bold text-lime-800">
              Phân hệ Học vụ & Đào tạo
            </span>
            <span className="text-xs text-slate-400">•</span>
            <span className="text-xs text-slate-500">Đại học Đà Lạt</span>
          </div>
          <h1 className="mt-1.5 text-2xl font-bold tracking-tight text-slate-900 sm:text-3xl">
            Theo dõi Tiến độ Đào tạo
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


