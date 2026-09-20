"use client";

import { useState, useEffect } from "react";
import { apiFetch } from "@/lib/api-client";
import Tabs from "@/components/ui/Tabs";
import SlideOverDrawer from "@/components/ui/SlideOverDrawer";
import Modal from "@/components/ui/Modal";
import { useAuthStore } from "@/stores/authStore";

export default function AcademicWarningsPage() {
  const { can } = useAuthStore();
  const [activeTab, setActiveTab] = useState<"runs" | "policies">("runs");
  const [loading, setLoading] = useState(true);
  const [policies, setPolicies] = useState<ApiData[]>([]);
  const [runs, setRuns] = useState<ApiData[]>([]);

  // Selected run & Drawer state
  const [selectedRun, setSelectedRun] = useState<ApiData | null>(null);
  const [students, setStudents] = useState<ApiData[]>([]);
  const [severityFilter, setSeverityFilter] = useState<string>("all");

  // Selected student for explainable detail
  const [selectedStudentDetail, setSelectedStudentDetail] = useState<ApiData | null>(null);

  // Intervention Quick Action state
  const [interventionNote, setInterventionNote] = useState("");
  const [interventionSaved, setInterventionSaved] = useState(false);
  const [existingActions, setExistingActions] = useState<ApiData[]>([]);
  const [actionSaving, setActionSaving] = useState(false);
  const [interventionStatus, setInterventionStatus] = useState("IN_PROGRESS");

  // Trigger run modal state
  const [showRunModal, setShowRunModal] = useState(false);
  const [cohorts, setCohorts] = useState<ApiData[]>([]);
  const [programs, setPrograms] = useState<ApiData[]>([]);
  const [years, setYears] = useState<ApiData[]>([]);
  const [selCohort, setSelCohort] = useState("");
  const [selProgram, setSelProgram] = useState("");
  const [selYear, setSelYear] = useState("");
  const [selTerm, setSelTerm] = useState("");
  const [runLoading, setRunLoading] = useState(false);

  // Policy modal state
  const [showPolicyModal, setShowPolicyModal] = useState(false);
  const [policyName, setPolicyName] = useState("Chính sách theo dõi học vụ Khoa CNTT");
  const [termGpa, setTermGpa] = useState(2.0);
  const [cumGpa, setCumGpa] = useState(2.0);
  const [policyLoading, setPolicyLoading] = useState(false);

  useEffect(() => {
    async function loadData() {
      try {
        setLoading(true);
        const [pRes, rRes, cRes, prRes, yRes] = await Promise.all([
          apiFetch("/api/v1/academic-warnings/policies"),
          apiFetch("/api/v1/academic-warnings/runs"),
          apiFetch("/api/v1/cohorts"),
          apiFetch("/api/v1/training-programs"),
          apiFetch("/api/v1/academic-years"),
        ]);

        if (pRes.ok) {
          const pJson = await pRes.json();
          setPolicies(Array.isArray(pJson.items) ? pJson.items : Array.isArray(pJson) ? pJson : []);
        }
        if (rRes.ok) {
          const rJson = await rRes.json();
          setRuns(Array.isArray(rJson.items) ? rJson.items : Array.isArray(rJson) ? rJson : []);
        }
        if (cRes.ok) {
          const cJson = await cRes.json();
          setCohorts(Array.isArray(cJson.items) ? cJson.items : Array.isArray(cJson) ? cJson : []);
        }
        if (prRes.ok) {
          const prJson = await prRes.json();
          setPrograms(Array.isArray(prJson.items) ? prJson.items : Array.isArray(prJson) ? prJson : []);
        }
        if (yRes.ok) {
          const yJson = await yRes.json();
          setYears(Array.isArray(yJson.items) ? yJson.items : Array.isArray(yJson) ? yJson : []);
        }
      } catch (err) {
        console.error("Error loading warning data:", err);
      } finally {
        setLoading(false);
      }
    }
    loadData();
  }, []);

  const handleOpenRunReport = async (run: ApiData) => {
    setSelectedRun(run);
    try {
      const sRes = await apiFetch(`/api/v1/academic-warnings/runs/${run.id}/students`);
      if (sRes.ok) {
        const sJson = await sRes.json();
        setStudents(sJson.items || sJson || []);
      }
    } catch (e) {
      console.error(e);
    }
  };

  const handleViewStudentReason = async (runId: string, studentId: string) => {
    try {
      setInterventionSaved(false);
      setInterventionNote("");
      setExistingActions([]);
      const [res, actRes] = await Promise.all([
        apiFetch(`/api/v1/academic-warnings/runs/${runId}/students/${studentId}`),
        apiFetch(`/api/v1/academic-warnings/actions?studentId=${studentId}`),
      ]);
      if (res.ok) {
        setSelectedStudentDetail(await res.json());
      }
      if (actRes.ok) {
        const actJson = await actRes.json();
        setExistingActions(actJson.items || actJson || []);
      }
    } catch (e) {
      console.error(e);
    }
  };

  const handleSaveAction = async (actionType: string, customNote?: string) => {
    if (!selectedStudentDetail) return;
    if (!can("academic_warning.action.create")) {
      alert("Bạn không có quyền tạo hồ sơ hỗ trợ");
      return;
    }
    const noteToSave = customNote || interventionNote.trim();
    if (!noteToSave) {
      alert("Vui lòng nhập nội dung ghi chú can thiệp!");
      return;
    }
    try {
      setActionSaving(true);
      const res = await apiFetch("/api/v1/academic-warnings/actions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          studentId: selectedStudentDetail.studentId,
          runId: selectedRun?.id,
          actionType,
          note: noteToSave,
          status: interventionStatus,
        }),
      });

      if (res.ok) {
        setInterventionSaved(true);
        setInterventionNote("");
        const actRes = await apiFetch(`/api/v1/academic-warnings/actions?studentId=${selectedStudentDetail.studentId}`);
        if (actRes.ok) {
          const actJson = await actRes.json();
          setExistingActions(actJson.items || actJson || []);
        }
      } else {
        alert("Lỗi khi lưu can thiệp");
      }
    } catch (e) {
      console.error(e);
      alert("Lỗi kết nối");
    } finally {
      setActionSaving(false);
    }
  };

  const handleUpdateActionStatus = async (actionId: string, status: string) => {
    if (!selectedStudentDetail) return;
    try {
      setActionSaving(true);
      const res = await apiFetch(`/api/v1/academic-warnings/actions/${actionId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      });
      if (!res.ok) {
        const payload = await res.json().catch(() => null);
        alert(payload?.error?.message || "Không thể cập nhật trạng thái hỗ trợ");
        return;
      }
      const actRes = await apiFetch(`/api/v1/academic-warnings/actions?studentId=${selectedStudentDetail.studentId}`);
      if (actRes.ok) {
        const actJson = await actRes.json();
        setExistingActions(actJson.items || actJson || []);
      }
    } catch (error) {
      console.error(error);
      alert("Lỗi kết nối");
    } finally {
      setActionSaving(false);
    }
  };

  const nextActionStatuses = (status: string) => ({
    OPEN: ["IN_PROGRESS", "ESCALATED"],
    IN_PROGRESS: ["RESOLVED", "ESCALATED"],
    ESCALATED: ["IN_PROGRESS", "RESOLVED"],
    RESOLVED: ["REOPENED"],
    REOPENED: ["IN_PROGRESS", "ESCALATED"],
  }[status] || []);

  const actionStatusLabel = (status: string) => ({
    OPEN: "Mở hồ sơ",
    IN_PROGRESS: "Đang xử lý",
    RESOLVED: "Đã giải quyết",
    ESCALATED: "Đã chuyển cấp",
    REOPENED: "Đã mở lại",
  }[status] || status);

  const handleCreatePolicy = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!policyName.trim()) return;

    try {
      setPolicyLoading(true);
      const res = await apiFetch("/api/v1/academic-warnings/policies", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: policyName,
          termGpaThreshold: Number(termGpa),
          cumulativeGpaThreshold: Number(cumGpa),
          status: "active",
        }),
      });

      if (res.ok) {
        alert("Đã thiết lập chính sách cảnh báo học vụ mới!");
        setShowPolicyModal(false);
        const pRes = await apiFetch("/api/v1/academic-warnings/policies");
        if (pRes.ok) {
          const payload = await pRes.json();
          setPolicies(Array.isArray(payload.items) ? payload.items : Array.isArray(payload) ? payload : []);
        }
      } else {
        const err = await res.json();
        alert(err.error?.message || "Lỗi khi tạo chính sách");
      }
    } catch (e: ApiData) {
      alert(e.message || "Lỗi kết nối");
    } finally {
      setPolicyLoading(false);
    }
  };

  const handleTriggerRun = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selCohort || !selProgram || !selTerm) {
      alert("Vui lòng chọn đầy đủ Khóa, CTĐT và Học kỳ đánh giá!");
      return;
    }

    try {
      setRunLoading(true);
      const res = await apiFetch("/api/v1/academic-warnings/runs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          cohortId: selCohort,
          trainingProgramId: selProgram,
          assessmentAcademicTermId: selTerm,
          runMode: selectedAssessmentTerm?.isSummer ? "SUMMER_MONITORING" : "OFFICIAL",
        }),
      });

      if (res.ok) {
        alert("Đã hoàn tất quét cảnh báo học vụ!");
        setShowRunModal(false);
        window.location.reload();
      } else {
        const err = await res.json();
        alert(err.error?.message || "Lỗi khi quét cảnh báo");
      }
    } catch (e: ApiData) {
      alert(e.message || "Lỗi xử lý");
    } finally {
      setRunLoading(false);
    }
  };

  const termsForSelectedYear = years.find((y) => y.id === selYear)?.terms || [];
  const selectedAssessmentTerm = termsForSelectedYear.find((term: ApiData) => term.id === selTerm);
  const mainAssessmentTerms = termsForSelectedYear.filter((term: ApiData) => !term.isSummer);
  const summerAssessmentTerms = termsForSelectedYear.filter((term: ApiData) => term.isSummer);

  const filteredStudents = students.filter((st) => {
    if (severityFilter === "all") return true;
    return st.maxSeverity === severityFilter;
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
            Hệ thống Cảnh báo Sớm Học vụ (SEWS)
          </h1>
          <p className="text-xs sm:text-sm text-slate-500 mt-0.5">
            Quét và phát hiện sinh viên nguy cơ cao dựa trên ngưỡng GPA, tiến độ tín chỉ và quyết định học vụ
          </p>
        </div>

        <div className="flex items-center gap-2">
          {activeTab === "policies" && can("academic_warning.policy.manage") ? (
            <button
              type="button"
              onClick={() => setShowPolicyModal(true)}
              className="px-4 py-2 rounded-xl bg-[var(--color-primary)] hover:opacity-90 text-white text-xs font-semibold shadow-xs flex items-center gap-1.5 cursor-pointer"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                <line x1="12" y1="5" x2="12" y2="19" />
                <line x1="5" y1="12" x2="19" y2="12" />
              </svg>
              <span>Thiết lập Chính sách Ngưỡng</span>
            </button>
          ) : activeTab === "runs" && can("academic_warning.calculate") ? (
            <button
              type="button"
              onClick={() => {
                setSelCohort(cohorts[0]?.id || "");
                setSelProgram(programs[0]?.id || "");
                setSelYear(years[0]?.id || "");
                setShowRunModal(true);
              }}
              className="px-4 py-2 rounded-xl bg-red-600 hover:bg-red-700 text-white text-xs font-semibold shadow-xs flex items-center gap-1.5 cursor-pointer"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                <polygon points="5 3 19 12 5 21 5 3" />
              </svg>
              <span>Quét Cảnh báo Mới</span>
            </button>
          ) : null}
        </div>
      </div>

      {/* Tabs */}
      <Tabs
        tabs={[
          { id: "runs", label: "Lịch sử Phiên quét Cảnh báo", badge: runs.length },
          { id: "policies", label: "Chính sách Ngưỡng Cảnh báo", badge: policies.length },
        ]}
        activeTab={activeTab}
        onChange={(id) => setActiveTab(id as ApiData)}
      />

      {loading ? (
        <div className="py-16 text-center text-slate-400 text-xs">Đang tải dữ liệu cảnh báo...</div>
      ) : (
        <>
          {/* TAB 1: RUNS TABLE */}
          {activeTab === "runs" && (
            <div className="bg-white border border-slate-200/90 rounded-2xl shadow-xs overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead>
                    <tr className="bg-slate-50/80 border-b border-slate-200 text-slate-500 font-semibold uppercase text-[11px]">
                      <th className="py-3.5 px-4">Thời điểm quét</th>
                      <th className="py-3.5 px-4">Học kỳ / Năm học</th>
                      <th className="py-3.5 px-4">Khóa / CTĐT</th>
                      <th className="py-3.5 px-4">Tổng SV</th>
                      <th className="py-3.5 px-4">Phân bố Mức độ Rủi ro</th>
                      <th className="py-3.5 px-4">Chính sách áp dụng</th>
                      <th className="py-3.5 px-4 text-right">Báo cáo</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {runs.length === 0 ? (
                      <tr>
                        <td colSpan={7} className="py-8 text-center text-slate-400">
                          Chưa có lượt quét cảnh báo nào.
                        </td>
                      </tr>
                    ) : (
                      runs.map((r) => (
                        <tr key={r.id} className="hover:bg-slate-50/70 transition-colors">
                          <td className="py-3.5 px-4 font-mono font-medium text-slate-700">
                            {r.startedAt ? new Date(r.startedAt).toLocaleString("vi-VN") : "—"}
                          </td>
                          <td className="py-3.5 px-4 font-bold text-slate-900">
                            <div className="flex flex-wrap items-center gap-2">
                              <span>{r.assessmentTermCode || r.termCode || "—"} ({r.assessmentAcademicYear || "Chưa xác định"})</span>
                              {(r.runMode === "SUMMER_MONITORING" || r.isSummer) && (
                                <span className="rounded-md border border-amber-200 bg-amber-50 px-1.5 py-0.5 text-[10px] font-bold text-amber-800">
                                  {r.runMode === "SUMMER_MONITORING" ? "Giám sát hè" : "Kỳ phụ, tham khảo"}
                                </span>
                              )}
                            </div>
                          </td>
                          <td className="py-3.5 px-4 text-slate-600">
                            {r.cohortCode || "—"} • {r.programCode || "—"}
                          </td>
                          <td className="py-3.5 px-4 font-mono font-bold text-slate-900">{r.totalStudents || 0}</td>
                          <td className="py-3.5 px-4">
                            <div className="flex items-center gap-1.5 flex-wrap">
                              <span className="px-2 py-0.5 rounded-full text-[11px] font-bold bg-red-100 text-red-700 border border-red-200">
                                {r.highStudents || 0} Nguy cơ cao
                              </span>
                              <span className="px-2 py-0.5 rounded-full text-[11px] font-bold bg-amber-100 text-amber-800 border border-amber-200">
                                {r.mediumStudents || 0} Cần lưu ý
                              </span>
                            </div>
                          </td>
                          <td className="py-3.5 px-4 text-slate-600 font-mono">v{r.policyVersion || 1}</td>
                          <td className="py-3.5 px-4 text-right">
                            <button
                              type="button"
                              onClick={() => handleOpenRunReport(r)}
                              className="px-3 py-1 text-xs font-semibold text-red-600 hover:bg-red-50 border border-red-200 rounded-lg transition-colors cursor-pointer"
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

          {/* TAB 2: POLICIES TABLE */}
          {activeTab === "policies" && (
            <div className="bg-white border border-slate-200/90 rounded-2xl shadow-xs overflow-hidden">
              <div className="p-4 border-b border-slate-100 flex items-center justify-between">
                <div>
                  <h3 className="text-sm font-bold text-slate-900" style={{ fontFamily: "Outfit, sans-serif" }}>
                    Chính sách & Ngưỡng Theo dõi Học vụ ({policies.length})
                  </h3>
                  <p className="text-xs text-slate-500">Các tham số điểm sàn được áp dụng khi chạy động cơ cảnh báo</p>
                </div>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead>
                    <tr className="bg-slate-50/80 border-b border-slate-200 text-slate-500 font-semibold uppercase text-[11px]">
                      <th className="py-3.5 px-4">Tên chính sách quy định</th>
                      <th className="py-3.5 px-4">Ngưỡng GPA Học kỳ</th>
                      <th className="py-3.5 px-4">Ngưỡng GPA Tích lũy</th>
                      <th className="py-3.5 px-4">Phiên bản</th>
                      <th className="py-3.5 px-4">Trạng thái</th>
                      <th className="py-3.5 px-4">Cập nhật lúc</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {policies.map((p) => (
                      <tr key={p.id} className="hover:bg-slate-50/70 transition-colors">
                        <td className="py-3.5 px-4 font-bold text-slate-900">{p.name}</td>
                        <td className="py-3.5 px-4 font-mono font-bold text-red-600">
                          &lt; {Number(p.termGpaThreshold || 2.0).toFixed(2)}
                        </td>
                        <td className="py-3.5 px-4 font-mono font-bold text-red-600">
                          &lt; {Number(p.cumulativeGpaThreshold || 2.0).toFixed(2)}
                        </td>
                        <td className="py-3.5 px-4 font-mono">v{p.version || 1}</td>
                        <td className="py-3.5 px-4">
                          <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-semibold bg-emerald-100 text-emerald-800">
                            {p.status === "active" ? "Đang áp dụng" : "Lưu trữ"}
                          </span>
                        </td>
                        <td className="py-3.5 px-4 text-slate-400">
                          {p.updatedAt ? new Date(p.updatedAt).toLocaleDateString("vi-VN") : "—"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </>
      )}

      {/* Slide-Over Drawer: Báo cáo Cảnh báo Sinh viên (Chuẩn SWE) */}
      <SlideOverDrawer
        isOpen={Boolean(selectedRun)}
        onClose={() => setSelectedRun(null)}
        title={selectedRun?.runMode === "SUMMER_MONITORING" ? "Báo cáo Giám sát Học kỳ hè" : "Báo cáo Chi tiết Sinh viên Cần Cảnh báo Học vụ"}
        subtitle={`Học kỳ: ${selectedRun?.assessmentTermCode || "—"} • ${selectedRun?.assessmentAcademicYear || "Chưa xác định"}`}
        width="4xl"
      >
        {selectedRun && (
          <div className="space-y-6">
            {(selectedRun.runMode === "SUMMER_MONITORING" || selectedRun.isSummer) && (
              <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-xs leading-5 text-amber-900">
                Đây là đánh giá kỳ phụ để tham khảo và hỗ trợ sinh viên. Kết quả không phải kết luận cảnh báo học lực chính thức.
              </div>
            )}
            {/* Summary Metrics */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <div className="p-3.5 bg-slate-50 border border-slate-200 rounded-xl">
                <span className="text-[11px] font-semibold text-slate-500 uppercase block">Tổng SV quét</span>
                <span className="text-xl font-bold text-slate-900 font-mono mt-0.5 block">{selectedRun.totalStudents}</span>
              </div>
              <div className="p-3.5 bg-red-50 border border-red-200 rounded-xl">
                <span className="text-[11px] font-semibold text-red-700 uppercase block">Nguy cơ cao (Đỏ)</span>
                <span className="text-xl font-bold text-red-700 font-mono mt-0.5 block">{selectedRun.highStudents}</span>
              </div>
              <div className="p-3.5 bg-amber-50 border border-amber-200 rounded-xl">
                <span className="text-[11px] font-semibold text-amber-700 uppercase block">Cần lưu ý (Vàng)</span>
                <span className="text-xl font-bold text-amber-700 font-mono mt-0.5 block">{selectedRun.mediumStudents}</span>
              </div>
              <div className="p-3.5 bg-emerald-50 border border-emerald-200 rounded-xl">
                <span className="text-[11px] font-semibold text-emerald-700 uppercase block">Bình thường</span>
                <span className="text-xl font-bold text-emerald-700 font-mono mt-0.5 block">
                  {Math.max(0, selectedRun.totalStudents - selectedRun.highStudents - selectedRun.mediumStudents)}
                </span>
              </div>
            </div>

            {/* Severity Filter */}
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-slate-700">Lọc theo mức độ cảnh báo:</span>
              <select
                value={severityFilter}
                onChange={(e) => setSeverityFilter(e.target.value)}
                className="bg-white border border-slate-200 rounded-xl px-3 py-1 text-xs font-semibold text-slate-700"
              >
                <option value="all">Tất cả mức độ ({students.length})</option>
                <option value="high">Nguy cơ cao (Đỏ)</option>
                <option value="medium">Cần lưu ý (Vàng)</option>
              </select>
            </div>

            {/* Students Table with Signals & Details */}
            <div className="border border-slate-200 rounded-xl overflow-hidden">
              <div className="overflow-x-auto max-h-[460px] scrollbar-thin">
                <table className="w-full text-left text-xs">
                  <thead className="sticky top-0 bg-slate-100 text-slate-600 font-semibold border-b border-slate-200">
                    <tr>
                      <th className="py-2.5 px-3">Sinh viên</th>
                      <th className="py-2.5 px-3">Mức độ</th>
                      <th className="py-2.5 px-3">Tín hiệu vi phạm</th>
                      <th className="py-2.5 px-3">GPA Hệ 4</th>
                      <th className="py-2.5 px-3 text-right">Giải trình</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {filteredStudents.length === 0 ? (
                      <tr>
                        <td colSpan={5} className="py-6 text-center text-slate-400">
                          Không có sinh viên cảnh báo trong nhóm này
                        </td>
                      </tr>
                    ) : (
                      filteredStudents.map((st) => (
                        <tr key={st.id || st.studentId} className="hover:bg-slate-50">
                          <td className="py-2.5 px-3 font-semibold text-slate-800">
                            <div>{st.studentName}</div>
                            <div className="text-[10px] text-slate-400 font-mono">{st.studentCode} • {st.className}</div>
                          </td>
                          <td className="py-2.5 px-3">
                            <span
                              className={`px-2.5 py-1 rounded-full text-xs font-bold ${
                                st.maxSeverity === "high"
                                  ? "bg-red-100 text-red-700 border border-red-200 animate-pulse"
                                  : "bg-amber-100 text-amber-800 border border-amber-200"
                              }`}
                            >
                              {st.maxSeverity === "high" ? "Nguy cơ cao" : "Cần lưu ý"}
                            </span>
                          </td>
                          <td className="py-2.5 px-3">
                            <div className="flex items-center gap-1 flex-wrap">
                              {st.registrationStatus === "fail" && (
                                <span className="px-1.5 py-0.5 rounded text-[10px] font-semibold bg-orange-100 text-orange-800">
                                  Chậm đăng ký
                                </span>
                              )}
                              {st.scheduleStatus === "behind_schedule" && (
                                <span className="px-1.5 py-0.5 rounded text-[10px] font-semibold bg-red-100 text-red-800">
                                  Chậm CTĐT
                                </span>
                              )}
                              {st.academicWarningDecisions > 0 && (
                                <span className="px-1.5 py-0.5 rounded text-[10px] font-semibold bg-purple-100 text-purple-800">
                                  {st.academicWarningDecisions} quyết định
                                </span>
                              )}
                            </div>
                          </td>
                          <td className="py-2.5 px-3 font-mono">
                            <div>Kỳ: <strong className="text-slate-900">{st.termGpa4 ? Number(st.termGpa4).toFixed(2) : "—"}</strong></div>
                            <div className="text-[10px] text-slate-400">TL: {st.cumulativeGpa4 ? Number(st.cumulativeGpa4).toFixed(2) : "—"}</div>
                          </td>
                          <td className="py-2.5 px-3 text-right">
                            <button
                              type="button"
                              onClick={() => handleViewStudentReason(selectedRun.id, st.studentId)}
                              className="px-2.5 py-1 text-xs font-semibold text-red-600 hover:bg-red-50 border border-red-200 rounded-lg transition-colors cursor-pointer"
                            >
                              Xem lý do →
                            </button>
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
      </SlideOverDrawer>

      {/* Modal: Giải trình Lý do Cảnh báo Chi tiết (Explainable Alert Details) */}
      {selectedStudentDetail && (
        <Modal
          isOpen={Boolean(selectedStudentDetail)}
          onClose={() => setSelectedStudentDetail(null)}
          title={`Giải trình Cảnh báo: ${selectedStudentDetail.studentName} (${selectedStudentDetail.studentCode})`}
          description="Bằng chứng và các tín hiệu khiến sinh viên được đưa vào danh sách cần theo dõi"
          maxWidth="2xl"
        >
          <div className="space-y-5">
            {/* Student metrics card */}
            <div className="p-3.5 bg-slate-50 border border-slate-200 rounded-xl grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
              <div>
                <span className="text-slate-400 block text-[10px] uppercase">Lớp</span>
                <span className="font-bold text-slate-800">{selectedStudentDetail.className || "Chưa xếp lớp"}</span>
              </div>
              <div>
                <span className="text-slate-400 block text-[10px] uppercase">GPA Học kỳ</span>
                <span className="font-bold font-mono text-red-600">
                  {selectedStudentDetail.termGpa4 ? Number(selectedStudentDetail.termGpa4).toFixed(2) : "—"}
                </span>
              </div>
              <div>
                <span className="text-slate-400 block text-[10px] uppercase">GPA Tích lũy</span>
                <span className="font-bold font-mono text-red-600">
                  {selectedStudentDetail.cumulativeGpa4 ? Number(selectedStudentDetail.cumulativeGpa4).toFixed(2) : "—"}
                </span>
              </div>
              <div>
                <span className="text-slate-400 block text-[10px] uppercase">Tín chỉ đăng ký</span>
                <span className="font-bold text-slate-800">{selectedStudentDetail.termRegisteredCredits || 0} TC</span>
              </div>
            </div>

            {/* List of Detailed Reasons */}
            <div className="space-y-3">
              <h4 className="text-xs font-bold text-slate-800 uppercase tracking-wider">
                Các nguyên nhân kích hoạt cảnh báo:
              </h4>

              {(selectedStudentDetail.reasons || []).length === 0 ? (
                <div className="p-4 text-center text-slate-400 text-xs">
                  Không có lý do vi phạm chi tiết
                </div>
              ) : (
                selectedStudentDetail.reasons.map((r: ApiData, idx: number) => (
                  <div key={idx} className="p-3.5 rounded-xl border border-red-200 bg-red-50/50 space-y-1.5">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-bold text-red-900 flex items-center gap-1.5">
                        <span className="w-2 h-2 rounded-full bg-red-600" />
                        {r.title || r.reasonCode}
                      </span>
                      <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-red-100 text-red-800">
                        {r.severity === "high" ? "Mức cao" : "Mức TB"}
                      </span>
                    </div>

                    <div className="text-xs text-slate-600 leading-relaxed">
                      {r.reasonCode === "LOW_TERM_GPA" && (
                        <span>
                          Điểm GPA học kỳ của sinh viên đạt <strong>{r.details?.gpa4 ?? selectedStudentDetail.termGpa4}</strong>,
                          dưới ngưỡng quy định tối thiểu của khoa là <strong>{r.details?.threshold ?? 2.0}</strong>.
                        </span>
                      )}
                      {r.reasonCode === "LOW_CUMULATIVE_GPA" && (
                        <span>
                          Điểm GPA tích lũy toàn khóa của sinh viên là <strong>{r.details?.gpa4 ?? selectedStudentDetail.cumulativeGpa4}</strong>,
                          chưa đạt chuẩn tối thiểu duy trì học vụ là <strong>{r.details?.threshold ?? 2.0}</strong>.
                        </span>
                      )}
                      {r.reasonCode === "REGISTRATION_BEHIND" && (
                        <span>
                          Đăng ký học phần tại thời điểm tính chưa đáp ứng các học phần được đánh dấu bắt buộc đăng ký trong kế hoạch.
                        </span>
                      )}
                      {r.reasonCode === "PROGRAM_PROGRESS_BEHIND" && (
                        <span>
                          Sinh viên chưa đáp ứng ít nhất một yêu cầu CTĐT đã đến hạn: học phần bắt buộc, nhóm tự chọn, số tín chỉ hoặc dữ liệu kết quả.
                        </span>
                      )}
                      {r.reasonCode === "ACADEMIC_WARNING_DECISION" && (
                        <span>
                          Đã có quyết định cảnh báo học vụ chính thức ban hành đối với sinh viên này.
                        </span>
                      )}
                    </div>
                  </div>
                ))
              )}
            </div>

            {/* Closed-loop Quick Actions & Existing Log */}
            <div className="pt-3 border-t border-slate-100 space-y-3">
              <div className="flex items-center justify-between">
                <h4 className="text-xs font-bold text-slate-800 uppercase tracking-wider">
                  Ghi nhận Hành động Can thiệp (Intervention Log):
                </h4>
                <div className="flex items-center gap-1.5">
                  <span className="text-[11px] text-slate-500 font-medium">Trạng thái:</span>
                  <select
                    value={interventionStatus}
                    onChange={(e) => setInterventionStatus(e.target.value)}
                    className="text-xs font-semibold bg-white border border-slate-200 rounded-lg px-2 py-1"
                  >
                    <option value="IN_PROGRESS">Đang theo dõi</option>
                    <option value="RESOLVED">Đã giải quyết</option>
                    <option value="ESCALATED">Báo cấp trên (Escalated)</option>
                  </select>
                </div>
              </div>

              <textarea
                rows={3}
                placeholder="Ghi chú nội dung đã tư vấn, đôn đốc sinh viên hoặc gửi thông báo..."
                value={interventionNote}
                onChange={(e) => setInterventionNote(e.target.value)}
                className="w-full bg-white border border-slate-200 rounded-xl p-3 text-xs text-slate-800 focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)]"
              />

              {interventionSaved && (
                <div className="text-xs font-semibold text-emerald-700 bg-emerald-50 px-3 py-1.5 rounded-lg">
                  ✓ Đã lưu nhật ký can thiệp học vụ vào CSDL thành công!
                </div>
              )}

              <div className="flex items-center justify-between pt-1">
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    disabled={actionSaving || !can("academic_warning.action.create")}
                    onClick={() => handleSaveAction("NOTIFY_EMAIL", `Ghi nhận cán bộ đã gửi email nhắc nhở học vụ đến sinh viên ${selectedStudentDetail.studentCode} ngoài hệ thống`)}
                    className="px-3 py-1.5 rounded-xl border border-slate-200 text-xs font-semibold text-slate-700 hover:bg-slate-50 flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
                  >
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z" />
                      <polyline points="22,6 12,13 2,6" />
                    </svg>
                    <span>Ghi nhận đã gửi email</span>
                  </button>

                  <button
                    type="button"
                    disabled={actionSaving || !can("academic_warning.action.create")}
                    onClick={() => handleSaveAction("SCHEDULE_MEETING", `Ghi nhận cán bộ đã thống nhất lịch tư vấn với sinh viên ${selectedStudentDetail.studentCode} ngoài hệ thống`)}
                    className="px-3 py-1.5 rounded-xl border border-slate-200 text-xs font-semibold text-slate-700 hover:bg-slate-50 flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
                  >
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
                      <line x1="16" y1="2" x2="16" y2="6" />
                      <line x1="8" y1="2" x2="8" y2="6" />
                      <line x1="3" y1="10" x2="21" y2="10" />
                    </svg>
                    <span>Ghi nhận lịch tư vấn</span>
                  </button>
                </div>

                <button
                  type="button"
                  disabled={!interventionNote.trim() || actionSaving || !can("academic_warning.action.create")}
                  onClick={() => handleSaveAction("COUNSELING")}
                  className="px-4 py-1.5 rounded-xl bg-[var(--color-primary)] hover:opacity-90 disabled:opacity-40 text-white text-xs font-semibold shadow-xs cursor-pointer"
                >
                  {actionSaving ? "Đang lưu..." : "Lưu nhật ký"}
                </button>
              </div>

              {/* Existing Actions List */}
              {existingActions.length > 0 && (
                <div className="pt-3 border-t border-slate-100 space-y-2">
                  <h5 className="text-[11px] font-bold text-slate-700 uppercase">
                    Lịch sử can thiệp đã ghi nhận ({existingActions.length}):
                  </h5>
                  <div className="max-h-40 overflow-y-auto space-y-2 scrollbar-thin">
                    {existingActions.map((act) => (
                      <div key={act.id} className="p-2.5 bg-slate-50 rounded-lg border border-slate-200 text-xs space-y-1">
                        <div className="flex items-center justify-between">
                          <span className="font-bold text-slate-800">
                            {act.actionType === "MEETING" ? "Gặp trực tiếp" : act.actionType === "NOTIFY_EMAIL" ? "Đã gửi email (ghi nhận)" : act.actionType === "SCHEDULE_MEETING" ? "Lịch tư vấn (ghi nhận)" : "Tư vấn"}
                          </span>
                          <span className={`px-2 py-0.2 rounded text-[10px] font-bold ${
                            act.status === "RESOLVED" ? "bg-emerald-100 text-emerald-800" : act.status === "ESCALATED" ? "bg-red-100 text-red-800" : "bg-amber-100 text-amber-800"
                          }`}>
                            {actionStatusLabel(act.status)}
                          </span>
                        </div>
                        <p className="text-slate-600 text-[11px]">{act.note}</p>
                        <div className="text-[10px] text-slate-400">
                          {act.actorName} • {new Date(act.createdAt).toLocaleString("vi-VN")}
                        </div>
                        {can("academic_warning.action.update") && nextActionStatuses(act.status).length > 0 && (
                          <div className="flex flex-wrap gap-1.5 pt-1.5" aria-label={`Chuyển trạng thái từ ${actionStatusLabel(act.status)}`}>
                            {nextActionStatuses(act.status).map((status) => (
                              <button
                                key={status}
                                type="button"
                                disabled={actionSaving}
                                onClick={() => handleUpdateActionStatus(act.id, status)}
                                className="rounded-md border border-slate-200 bg-white px-2 py-1 text-[10px] font-semibold text-slate-600 hover:border-slate-300 hover:text-slate-900 disabled:opacity-50"
                              >
                                → {actionStatusLabel(status)}
                              </button>
                            ))}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        </Modal>
      )}

      {/* Modal: Tạo chính sách cảnh báo mới */}
      <Modal
        isOpen={showPolicyModal}
        onClose={() => setShowPolicyModal(false)}
        title="Thiết lập Chính sách Ngưỡng Cảnh báo Học vụ"
        description="Định nghĩa ngưỡng GPA nội bộ để ưu tiên sinh viên cần theo dõi"
        maxWidth="md"
      >
        <form onSubmit={handleCreatePolicy} className="space-y-4">
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">Tên chính sách quy định</label>
            <input
              type="text"
              required
              value={policyName}
              onChange={(e) => setPolicyName(e.target.value)}
              className="w-full bg-white border border-slate-200 rounded-xl px-3 py-2 text-xs font-medium text-slate-800"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Ngưỡng GPA Học kỳ</label>
              <input
                type="number"
                step="0.05"
                min="0"
                max="4"
                required
                value={termGpa}
                onChange={(e) => setTermGpa(Number(e.target.value))}
                className="w-full bg-white border border-slate-200 rounded-xl px-3 py-2 text-xs font-mono font-bold text-slate-800"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Ngưỡng GPA Tích lũy</label>
              <input
                type="number"
                step="0.05"
                min="0"
                max="4"
                required
                value={cumGpa}
                onChange={(e) => setCumGpa(Number(e.target.value))}
                className="w-full bg-white border border-slate-200 rounded-xl px-3 py-2 text-xs font-mono font-bold text-slate-800"
              />
            </div>
          </div>

          <div className="flex items-center justify-end gap-2 pt-4 border-t border-slate-100">
            <button
              type="button"
              onClick={() => setShowPolicyModal(false)}
              className="px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100 rounded-xl cursor-pointer"
            >
              Hủy
            </button>
            <button
              type="submit"
              disabled={policyLoading}
              className="px-4 py-2 text-xs font-semibold text-white bg-[var(--color-primary)] hover:opacity-90 rounded-xl"
            >
              {policyLoading ? "Đang lưu..." : "Lưu chính sách"}
            </button>
          </div>
        </form>
      </Modal>

      {/* Modal: Quét Cảnh báo Mới */}
      <Modal
        isOpen={showRunModal}
        onClose={() => setShowRunModal(false)}
        title="Kích hoạt Quét Cảnh báo Sớm Học vụ"
        description="Chọn phạm vi Khóa sinh viên, Chương trình đào tạo và Học kỳ cần đánh giá rủi ro"
        maxWidth="lg"
      >
        <form onSubmit={handleTriggerRun} className="space-y-4">
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">Khóa sinh viên</label>
            <select
              value={selCohort}
              onChange={(e) => setSelCohort(e.target.value)}
              className="w-full bg-white border border-slate-200 rounded-xl px-3 py-2 text-xs font-medium text-slate-800"
            >
              {cohorts.map((co) => (
                <option key={co.id} value={co.id}>
                  {co.cohortCode} - {co.cohortName}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">Chương trình đào tạo</label>
            <select
              value={selProgram}
              onChange={(e) => setSelProgram(e.target.value)}
              className="w-full bg-white border border-slate-200 rounded-xl px-3 py-2 text-xs font-medium text-slate-800"
            >
              {programs.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.programCode} - {p.programName}
                </option>
              ))}
            </select>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Năm học</label>
              <select
                value={selYear}
                onChange={(e) => {
                  setSelYear(e.target.value);
                  setSelTerm("");
                }}
                className="w-full bg-white border border-slate-200 rounded-xl px-3 py-2 text-xs font-medium text-slate-800"
              >
                {years.map((y) => (
                  <option key={y.id} value={y.id}>
                    {y.sYearCode || y.yearCode}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Học kỳ đánh giá</label>
              <select
                value={selTerm}
                onChange={(e) => setSelTerm(e.target.value)}
                className="w-full bg-white border border-slate-200 rounded-xl px-3 py-2 text-xs font-medium text-slate-800"
              >
                <option value="">Chọn học kỳ</option>
                {mainAssessmentTerms.length > 0 && (
                  <optgroup label="Học kỳ chính">
                    {mainAssessmentTerms.map((t: ApiData) => (
                      <option key={t.id} value={t.id}>{t.sTermCode || t.termCode}</option>
                    ))}
                  </optgroup>
                )}
                {summerAssessmentTerms.length > 0 && (
                  <optgroup label="Kỳ phụ">
                    {summerAssessmentTerms.map((t: ApiData) => (
                      <option key={t.id} value={t.id}>{t.sTermCode || t.termCode} (Giám sát hè)</option>
                    ))}
                  </optgroup>
                )}
              </select>
            </div>
          </div>

          {selectedAssessmentTerm?.isSummer && (
            <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-xs leading-5 text-amber-900">
              Kỳ hè chỉ chạy chế độ giám sát: theo dõi đăng ký, kết quả chờ và học phần chưa đạt. Hệ thống không áp dụng yêu cầu tín chỉ tối thiểu và không ban hành kết luận cảnh báo chính thức.
            </div>
          )}

          <div className="flex items-center justify-end gap-2 pt-4 border-t border-slate-100">
            <button
              type="button"
              onClick={() => setShowRunModal(false)}
              className="px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100 rounded-xl cursor-pointer"
            >
              Hủy
            </button>
            <button
              type="submit"
              disabled={runLoading}
              className="px-4 py-2 text-xs font-semibold text-white bg-red-600 hover:bg-red-700 rounded-xl transition-colors flex items-center gap-1.5 cursor-pointer"
            >
              {runLoading ? "Đang quét..." : "Bắt đầu quét"}
            </button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
