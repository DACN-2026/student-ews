"use client";

import { useState } from "react";
import { useAuthStore } from "@/stores/authStore";
import Tabs from "@/components/ui/Tabs";

type ActiveTab = "kiem_tra" | "hoan_thanh";

const tabs = [
  { id: "kiem_tra", label: "Kiểm tra đăng ký" },
  { id: "hoan_thanh", label: "Hoàn thành CTĐT" },
];

export default function TrainingProgressPage() {
  const { can } = useAuthStore();
  const [activeTab, setActiveTab] = useState<ActiveTab>("kiem_tra");

  return (
    <div className="p-6 space-y-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1
            className="text-2xl sm:text-3xl font-bold text-slate-900 tracking-tight"
            style={{ fontFamily: "Be Vietnam Pro, sans-serif" }}
          >
            Tiến độ đào tạo
          </h1>
          <p className="text-xs sm:text-sm text-slate-500 mt-0.5">
            Kiểm tra đăng ký theo kỳ và hoàn thành yêu cầu học phần CTĐT bằng snapshot.
          </p>
        </div>
      </div>

      {/* Tabs Bar */}
      <Tabs tabs={tabs} activeTab={activeTab} onChange={(id) => setActiveTab(id as ActiveTab)} />

      {activeTab === "kiem_tra" && (
        <div className="bg-white border border-slate-200/90 rounded-2xl shadow-xs overflow-hidden">
          {/* Section Header */}
          <div className="p-5 border-b border-slate-100 flex flex-col lg:flex-row lg:items-start justify-between gap-4">
            <div>
              <h3 className="text-sm font-bold text-slate-900" style={{ fontFamily: "Be Vietnam Pro, sans-serif" }}>
                Kiểm tra đăng ký theo kỳ
              </h3>
              <p className="text-xs text-slate-500 mt-1">
                Đối chiếu học phần đã đăng ký với kế hoạch đã khóa theo kỳ vận hành.
              </p>
            </div>
            
            <div className="flex flex-col sm:flex-row sm:items-center gap-3">
              <div className="relative">
                <select disabled className="appearance-none bg-slate-50 border border-slate-200/80 text-slate-400 text-xs py-2 pl-3 pr-8 rounded-xl focus:outline-none opacity-80 cursor-not-allowed w-full sm:w-44 font-medium shadow-sm">
                  <option>Mở run gần đây</option>
                </select>
                <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center px-2 text-slate-400">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="m6 9 6 6 6-6"/></svg>
                </div>
              </div>
              <button className="flex justify-center items-center gap-1.5 border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 text-xs px-4 py-2 rounded-xl transition-all cursor-pointer font-semibold shadow-xs">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M21.5 2v6h-6M21.34 15.57a10 10 0 1 1-.57-8.38l5.67-5.67"/></svg>
                <span>Làm mới</span>
              </button>
            </div>
          </div>

          <div className="p-5 space-y-5">
            {/* Warning Alert */}
            <div className="flex items-start gap-3 bg-amber-50/70 border border-amber-200/80 p-4 rounded-xl shadow-xs">
              <div className="text-amber-500 mt-0.5">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="12" cy="12" r="10"></circle>
                  <line x1="12" y1="8" x2="12" y2="12"></line>
                  <line x1="12" y1="16" x2="12.01" y2="16"></line>
                </svg>
              </div>
              <div>
                <h3 className="text-xs font-bold text-amber-900">Chưa xác định kỳ học hiện tại</h3>
                <p className="text-xs text-amber-800/80 mt-1">
                  Cần đánh dấu năm học và học kỳ hiện tại trong danh mục đào tạo để highlight đúng phạm vi kiểm tra.
                </p>
              </div>
            </div>

            {/* Filters */}
            <div className="flex flex-wrap items-center gap-3">
              <button className="flex items-center justify-between gap-2 border border-slate-200 bg-slate-50/80 text-slate-400 text-xs px-3 py-1.5 rounded-lg w-24 cursor-not-allowed font-medium shadow-xs">
                <span>Khóa</span>
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="m6 9 6 6 6-6"/></svg>
              </button>
              <button className="flex items-center justify-between gap-2 border border-slate-200 bg-white hover:bg-slate-50 text-slate-600 text-xs px-3 py-1.5 rounded-lg w-48 transition-colors cursor-pointer font-medium shadow-xs">
                <span>Chương trình đào tạo</span>
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="m6 9 6 6 6-6"/></svg>
              </button>
              <button className="border border-slate-200 bg-white hover:bg-slate-50 text-slate-600 text-xs px-4 py-1.5 rounded-lg font-semibold transition-colors cursor-pointer shadow-xs">
                Đặt lại
              </button>
            </div>

            {/* Badges */}
            <div className="flex flex-wrap items-center gap-2 text-[11px] font-semibold">
              <span className="px-2 py-1 border border-slate-200 bg-slate-100 text-slate-600 rounded">Tổng 0 Kế hoạch</span>
              <span className="px-2 py-1 border border-blue-200 bg-blue-50 text-blue-700 rounded">0 hiện hành trong trang</span>
              <span className="px-2 py-1 border border-blue-200 bg-blue-50 text-blue-700 rounded">0 thuộc kỳ hiện tại trong trang</span>
              <span className="px-2 py-1 border border-green-200 bg-green-50 text-green-700 rounded">0 đã khóa trong trang</span>
            </div>
          </div>

          {/* Table */}
          <div className="overflow-x-auto border-t border-slate-100">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="bg-slate-50/80 border-b border-slate-200 text-slate-500 font-semibold uppercase text-[11px]">
                  <th className="py-3 px-4 w-1/5">Khóa / CTĐT</th>
                  <th className="py-3 px-4">Kỳ vận hành</th>
                  <th className="py-3 px-4">HK lộ trình</th>
                  <th className="py-3 px-4">Version</th>
                  <th className="py-3 px-4">Trạng thái</th>
                  <th className="py-3 px-4">Lượt chạy</th>
                  <th className="py-3 px-4 text-center">Hiện hành</th>
                  <th className="py-3 px-4 text-center">Vận hành</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td colSpan={8} className="py-20 text-center">
                    <div className="flex flex-col items-center justify-center text-slate-300">
                      <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="mb-3">
                        <path d="M22 12h-6l-2 3h-4l-2-3H2" />
                        <path d="M5.45 5.11L2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11z" />
                      </svg>
                      <span className="text-xs font-semibold text-slate-400">Trống</span>
                    </div>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      )}

      {activeTab === "hoan_thanh" && (
        <div className="bg-white border border-slate-200/90 rounded-2xl shadow-xs overflow-hidden py-32 text-center flex flex-col items-center justify-center">
          <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="text-slate-300 mb-3">
            <path d="M12 2v20M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/>
          </svg>
          <p className="text-sm font-semibold text-slate-400">Tính năng đang được phát triển</p>
        </div>
      )}
    </div>
  );
}
