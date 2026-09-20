"use client";

import { useState, useEffect } from "react";
import Tabs from "@/components/ui/Tabs";
import SlideOverDrawer from "@/components/ui/SlideOverDrawer";
import { useAuthStore } from "@/stores/authStore";
import { apiFetch } from "@/lib/api-client";

export default function TrainingProgressPage() {
  const { can } = useAuthStore();
  const [activeTab, setActiveTab] = useState<"plans" | "runs">("plans");
  const [loading, setLoading] = useState(true);
  const [plans, setPlans] = useState<ApiData[]>([]);
  const [runs, setRuns] = useState<ApiData[]>([]);

  // Drawer state for run report
  const [selectedRun, setSelectedRun] = useState<ApiData | null>(null);
  const [drawerTab, setDrawerTab] = useState<"students" | "classes" | "cohort">("students");
  const [runStudents, setRunStudents] = useState<ApiData[]>([]);
  const [runClasses, setRunClasses] = useState<ApiData[]>([]);
  const [studentStatusFilter, setStudentStatusFilter] = useState<string>("all");
  const [actionLoading, setActionLoading] = useState(false);

  useEffect(() => {
    async function loadData() {
      try {
        setLoading(true);
        const [pRes, rRes] = await Promise.all([
          apiFetch("/api/v1/training-progress/plans"),
          apiFetch("/api/v1/training-progress/completion/runs"),
        ]);
        if (pRes.ok) {
          const pJson = await pRes.json();
          setPlans(pJson.items || pJson || []);
        }
        if (rRes.ok) {
          const rJson = await rRes.json();
          setRuns(rJson.items || rJson || []);
        }
      } catch (err) {
        console.error("Load training progress error:", err);
      } finally {
        setLoading(false);
      }
    }
    loadData();
  }, []);

  const handleLockPlan = async (planId: string) => {
    if (!can("progress.plan.manage")) return;
    try {
      setActionLoading(true);
      const res = await apiFetch(`/api/v1/training-progress/plans/${planId}/lock`, { method: "POST" });
      if (res.ok) {
        alert("Đã khóa kế hoạch đào tạo thành công!");
        window.location.reload();
      } else {
        const err = await res.json();
        alert(err.error?.message || "Lỗi khi khóa kế hoạch");
      }
    } finally {
      setActionLoading(false);
    }
  };

  const handleCalculatePlan = async (planId: string) => {
    if (!can("progress.calculate")) return;
    try {
      setActionLoading(true);
      const res = await apiFetch(`/api/v1/training-progress/plans/${planId}/calculate`, { method: "POST" });
      if (res.ok) {
        const json = await res.json();
        alert(`Tính toán thành công: ${json.passStudents || 0} Đạt / ${json.totalStudents || 0} Sinh viên!`);
        window.location.reload();
      } else {
        const err = await res.json();
        alert(err.error?.message || "Lỗi khi chạy tính toán");
      }
    } finally {
      setActionLoading(false);
    }
  };

  const handleOpenRunReport = async (run: ApiData) => {
    setSelectedRun(run);
    setDrawerTab("students");
    try {
      const [sRes, cRes] = await Promise.all([
        apiFetch(`/api/v1/training-progress/runs/${run.id}/students`),
        apiFetch(`/api/v1/training-progress/runs/${run.id}/classes`),
      ]);
      if (sRes.ok) {
        const sJson = await sRes.json();
        setRunStudents(sJson.items || sJson || []);
      }
      if (cRes.ok) {
        const cJson = await cRes.json();
        setRunClasses(cJson.items || cJson || []);
      }
    } catch (e) {
      console.error(e);
    }
  };

  const filteredStudents = runStudents.filter((st) => {
    if (studentStatusFilter === "all") return true;
    return st.status === studentStatusFilter;
  });

  return (
    <div className="p-6 space-y-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1
            className="text-2xl sm:text-3xl font-bold text-slate-900 tracking-tight"
            style={{ fontFamily: "Outfit, sans-serif" }}
          >
            Tiến độ Đào tạo (Calculation Engine)
          </h1>
          <p className="text-xs sm:text-sm text-slate-500 mt-0.5">
            Quản lý kế hoạch học tập theo học kỳ, chạy động cơ đối soát tiến độ tín chỉ sinh viên
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => window.location.reload()}
            className="px-3 py-2 text-xs font-semibold text-slate-700 bg-white hover:bg-slate-50 border border-slate-200 rounded-xl transition-colors shadow-xs flex items-center gap-1.5 cursor-pointer"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M21.5 2v6h-6M21.34 15.57a10 10 0 1 1-.57-8.38l5.67-5.67" />
            </svg>
            <span>Làm mới</span>
          </button>
        </div>
      </div>

      {/* Tabs */}
      <Tabs
        tabs={[
          { id: "plans", label: "Kế hoạch đào tạo", badge: plans.length },
          { id: "runs", label: "Lịch sử chạy tiến độ", badge: runs.length },
        ]}
        activeTab={activeTab}
        onChange={(id) => setActiveTab(id as ApiData)}
      />

      {loading ? (
        <div className="py-16 text-center text-slate-400 text-xs font-medium">
          Đang tải dữ liệu tiến độ đào tạo...
        </div>
      ) : (
        <>
          {/* TAB 1: KẾ HOẠCH ĐÀO TẠO */}
          {activeTab === "plans" && (
            <div className="bg-white border border-slate-200/90 rounded-2xl shadow-xs overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead>
                    <tr className="bg-slate-50/80 border-b border-slate-200 text-slate-500 font-semibold uppercase text-[11px]">
                      <th className="py-3.5 px-4">Tên kế hoạch</th>
                      <th className="py-3.5 px-4">Học kỳ / Năm học</th>
                      <th className="py-3.5 px-4">Khóa / CTĐT</th>
                      <th className="py-3.5 px-4">Học phần mở</th>
                      <th className="py-3.5 px-4">Phiên bản</th>
                      <th className="py-3.5 px-4">Trạng thái</th>
                      <th className="py-3.5 px-4 text-right">Thao tác động cơ</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {plans.length === 0 ? (
                      <tr>
                        <td colSpan={7} className="py-8 text-center text-slate-400">
                          Chưa có kế hoạch đào tạo nào được thiết lập.
                        </td>
                      </tr>
                    ) : (
                      plans.map((p) => (
                        <tr key={p.id} className="hover:bg-slate-50/70 transition-colors">
                          <td className="py-3.5 px-4 font-bold text-slate-900">{p.name || `Kế hoạch ${p.termCode}`}</td>
                          <td className="py-3.5 px-4 text-slate-700">
                            {p.termCode || "—"} ({p.academicYear || "Chưa xác định"})
                          </td>
                          <td className="py-3.5 px-4 text-slate-600">
                            {p.cohortCode || "—"} • {p.programCode || "—"}
                          </td>
                          <td className="py-3.5 px-4 font-mono font-semibold text-blue-600">
                            {p.offeringCount ?? 0} môn học
                          </td>
                          <td className="py-3.5 px-4 font-mono">v{p.version ?? 1}</td>
                          <td className="py-3.5 px-4">
                            <span
                              className={`inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-semibold ${
                                p.status === "locked"
                                  ? "bg-slate-100 text-slate-700 border border-slate-200"
                                  : "bg-emerald-100 text-emerald-800 border border-emerald-200"
                              }`}
                            >
                              {p.status === "locked" ? "Đã khóa" : "Đang mở"}
                            </span>
                          </td>
                          <td className="py-3.5 px-4 text-right">
                            <div className="flex items-center justify-end gap-2">
                              {p.status !== "locked" && can("progress.plan.manage") && (
                                <button
                                  type="button"
                                  disabled={actionLoading}
                                  onClick={() => handleLockPlan(p.id)}
                                  className="px-2.5 py-1 text-[11px] font-semibold text-slate-600 hover:text-slate-900 bg-slate-100 hover:bg-slate-200 rounded-lg transition-colors cursor-pointer"
                                >
                                  Khóa KH
                                </button>
                              )}
                              {can("progress.calculate") && (
                                <button
                                  type="button"
                                  disabled={actionLoading}
                                  onClick={() => handleCalculatePlan(p.id)}
                                  className="px-3 py-1 text-[11px] font-semibold text-white bg-[var(--color-primary)] hover:opacity-90 rounded-lg transition-opacity flex items-center gap-1 cursor-pointer"
                                >
                                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                                    <polygon points="5 3 19 12 5 21 5 3" />
                                  </svg>
                                  <span>Tính tiến độ</span>
                                </button>
                              )}
                            </div>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* TAB 2: LỊCH SỬ CHẠY (Runs) */}
          {activeTab === "runs" && (
            <div className="bg-white border border-slate-200/90 rounded-2xl shadow-xs overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead>
                    <tr className="bg-slate-50/80 border-b border-slate-200 text-slate-500 font-semibold uppercase text-[11px]">
                      <th className="py-3.5 px-4">Thời điểm chạy</th>
                      <th className="py-3.5 px-4">Học kỳ / Năm học</th>
                      <th className="py-3.5 px-4">Khóa / CTĐT</th>
                      <th className="py-3.5 px-4">Tổng SV</th>
                      <th className="py-3.5 px-4">Kết quả (Đạt / Chưa đạt)</th>
                      <th className="py-3.5 px-4">Trạng thái</th>
                      <th className="py-3.5 px-4 text-right">Báo cáo</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {runs.length === 0 ? (
                      <tr>
                        <td colSpan={7} className="py-8 text-center text-slate-400">
                          Chưa có lượt chạy tính toán tiến độ nào.
                        </td>
                      </tr>
                    ) : (
                      runs.map((r) => (
                        <tr key={r.id} className="hover:bg-slate-50/70 transition-colors">
                          <td className="py-3.5 px-4 font-mono font-medium text-slate-700">
                            {r.startedAt ? new Date(r.startedAt).toLocaleString("vi-VN") : "—"}
                          </td>
                          <td className="py-3.5 px-4 font-semibold text-slate-800">
                            {r.assessmentTermCode || "—"} ({r.assessmentAcademicYear || "Chưa xác định"})
                          </td>
                          <td className="py-3.5 px-4 text-slate-600">
                            {r.cohortCode || "—"} • {r.programCode || "—"}
                          </td>
                          <td className="py-3.5 px-4 font-mono font-bold text-slate-900">{r.totalStudents || 0}</td>
                          <td className="py-3.5 px-4">
                            <div className="flex items-center gap-1.5">
                              <span className="px-2 py-0.5 rounded text-[11px] font-bold bg-emerald-100 text-emerald-800">
                                {r.passStudents || r.completedStudents || 0} Đạt
                              </span>
                              <span className="px-2 py-0.5 rounded text-[11px] font-bold bg-red-100 text-red-800">
                                {r.failStudents || r.incompleteStudents || 0} Chưa đạt
                              </span>
                            </div>
                          </td>
                          <td className="py-3.5 px-4">
                            <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-semibold bg-emerald-100 text-emerald-800">
                              {r.status || "Hoàn thành"}
                            </span>
                          </td>
                          <td className="py-3.5 px-4 text-right">
                            <button
                              type="button"
                              onClick={() => handleOpenRunReport(r)}
                              className="px-3 py-1 text-xs font-semibold text-[var(--color-primary)] hover:bg-[var(--color-primary-light)] border border-[var(--color-primary)]/40 rounded-lg transition-colors cursor-pointer"
                            >
                              Xem báo cáo →
                            </button>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </>
      )}

      {/* Slide-over Drawer: Báo cáo Chi tiết Lần chạy (Chuẩn SWE) */}
      <SlideOverDrawer
        isOpen={Boolean(selectedRun)}
        onClose={() => setSelectedRun(null)}
        title="Báo cáo Chi tiết Kết quả Tiến độ Đào tạo"
        subtitle={`Lần chạy lúc: ${selectedRun?.startedAt ? new Date(selectedRun.startedAt).toLocaleString("vi-VN") : "—"}`}
        width="4xl"
      >
        {selectedRun && (
          <div className="space-y-6">
            {/* 4 KPI Summary Cards */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <div className="p-3.5 bg-slate-50 border border-slate-200 rounded-xl">
                <span className="text-[11px] font-semibold text-slate-500 uppercase block">Tổng sinh viên</span>
                <span className="text-xl font-bold text-slate-900 font-mono mt-0.5 block">
                  {selectedRun.totalStudents || 0}
                </span>
              </div>
              <div className="p-3.5 bg-emerald-50 border border-emerald-200 rounded-xl">
                <span className="text-[11px] font-semibold text-emerald-700 uppercase block">Đạt tiến độ</span>
                <span className="text-xl font-bold text-emerald-700 font-mono mt-0.5 block">
                  {selectedRun.passStudents || selectedRun.completedStudents || 0}
                </span>
              </div>
              <div className="p-3.5 bg-red-50 border border-red-200 rounded-xl">
                <span className="text-[11px] font-semibold text-red-700 uppercase block">Chưa đạt</span>
                <span className="text-xl font-bold text-red-700 font-mono mt-0.5 block">
                  {selectedRun.failStudents || selectedRun.incompleteStudents || 0}
                </span>
              </div>
              <div className="p-3.5 bg-amber-50 border border-amber-200 rounded-xl">
                <span className="text-[11px] font-semibold text-amber-700 uppercase block">Thiếu dữ liệu</span>
                <span className="text-xl font-bold text-amber-700 font-mono mt-0.5 block">
                  {selectedRun.dataErrorStudents || 0}
                </span>
              </div>
            </div>

            {/* Sub-tabs inside Drawer */}
            <div className="flex items-center gap-2 border-b border-slate-200 pb-2">
              <button
                type="button"
                onClick={() => setDrawerTab("students")}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors cursor-pointer ${
                  drawerTab === "students"
                    ? "bg-[var(--color-primary)] text-white"
                    : "text-slate-600 hover:bg-slate-100"
                }`}
              >
                Theo từng sinh viên ({runStudents.length})
              </button>
              <button
                type="button"
                onClick={() => setDrawerTab("classes")}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors cursor-pointer ${
                  drawerTab === "classes"
                    ? "bg-[var(--color-primary)] text-white"
                    : "text-slate-600 hover:bg-slate-100"
                }`}
              >
                Tổng hợp theo lớp ({runClasses.length})
              </button>
            </div>

            {/* Content: Theo sinh viên */}
            {drawerTab === "students" && (
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-slate-700">Lọc theo trạng thái kết luận:</span>
                  <select
                    value={studentStatusFilter}
                    onChange={(e) => setStudentStatusFilter(e.target.value)}
                    className="bg-white border border-slate-200 rounded-xl px-2.5 py-1 text-xs text-slate-700 font-semibold"
                  >
                    <option value="all">Tất cả trạng thái</option>
                    <option value="pass">Đạt (Pass)</option>
                    <option value="fail">Chưa đạt (Fail)</option>
                    <option value="data_error">Thiếu dữ liệu</option>
                  </select>
                </div>

                <div className="border border-slate-200 rounded-xl overflow-hidden">
                  <div className="overflow-x-auto max-h-[420px] scrollbar-thin">
                    <table className="w-full text-left text-xs">
                      <thead className="sticky top-0 bg-slate-100 text-slate-600 font-semibold border-b border-slate-200">
                        <tr>
                          <th className="py-2.5 px-3">Sinh viên</th>
                          <th className="py-2.5 px-3">Lớp</th>
                          <th className="py-2.5 px-3">Học phần Bắt buộc</th>
                          <th className="py-2.5 px-3">Tín chỉ Tự chọn</th>
                          <th className="py-2.5 px-3">Học phần còn thiếu</th>
                          <th className="py-2.5 px-3">Trạng thái</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {filteredStudents.length === 0 ? (
                          <tr>
                            <td colSpan={6} className="py-6 text-center text-slate-400">
                              Không tìm thấy bản ghi phù hợp
                            </td>
                          </tr>
                        ) : (
                          filteredStudents.map((st) => (
                            <tr key={st.studentId} className="hover:bg-slate-50/80">
                              <td className="py-2.5 px-3 font-semibold text-slate-800">
                                <div>{st.studentName}</div>
                                <div className="text-[10px] text-slate-400 font-mono">{st.studentId}</div>
                              </td>
                              <td className="py-2.5 px-3 text-slate-600">{st.classId || "—"}</td>
                              <td className="py-2.5 px-3">
                                {st.mandatory ? (
                                  <span>{st.mandatory.registeredCourses ?? 0}/{st.mandatory.requiredCourses ?? 0} HP ({st.mandatory.registeredCredits ?? 0} TC)</span>
                                ) : (
                                  <span>Đủ môn</span>
                                )}
                              </td>
                              <td className="py-2.5 px-3">
                                {st.elective ? (
                                  <span>{st.elective.registeredCredits ?? 0}/{st.elective.requiredCredits ?? 0} TC</span>
                                ) : (
                                  <span>Đủ TC</span>
                                )}
                              </td>
                              <td className="py-2.5 px-3 text-red-600 font-mono font-semibold">
                                {st.mandatory?.missingCourseIds?.length
                                  ? st.mandatory.missingCourseIds.join(", ")
                                  : "Không nợ môn"}
                              </td>
                              <td className="py-2.5 px-3">
                                <span
                                  className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                                    st.status === "pass"
                                      ? "bg-emerald-100 text-emerald-800"
                                      : "bg-red-100 text-red-800"
                                  }`}
                                >
                                  {st.status === "pass" ? "Đạt" : "Chưa đạt"}
                                </span>
                              </td>
                            </tr>
                          ))
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
            )}

            {/* Content: Theo lớp */}
            {drawerTab === "classes" && (
              <div className="border border-slate-200 rounded-xl overflow-hidden">
                <table className="w-full text-left text-xs">
                  <thead className="bg-slate-100 text-slate-600 font-semibold border-b border-slate-200">
                    <tr>
                      <th className="py-2.5 px-3">Mã lớp</th>
                      <th className="py-2.5 px-3">Tổng sinh viên</th>
                      <th className="py-2.5 px-3">Số SV Đạt</th>
                      <th className="py-2.5 px-3">Số SV Chưa đạt</th>
                      <th className="py-2.5 px-3">Tổng TC còn thiếu</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {runClasses.map((cl) => (
                      <tr key={cl.groupId} className="hover:bg-slate-50">
                        <td className="py-2.5 px-3 font-bold font-mono text-slate-900">{cl.groupCode}</td>
                        <td className="py-2.5 px-3 font-semibold">{cl.totalStudents}</td>
                        <td className="py-2.5 px-3 text-emerald-600 font-semibold">{cl.passStudents}</td>
                        <td className="py-2.5 px-3 text-red-600 font-semibold">{cl.failStudents}</td>
                        <td className="py-2.5 px-3 font-mono font-bold text-slate-700">{cl.totalMissingCredits || 0} TC</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}
      </SlideOverDrawer>
    </div>
  );
}
