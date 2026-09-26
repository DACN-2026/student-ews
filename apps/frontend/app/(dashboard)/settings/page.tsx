"use client";

import { useState, useEffect } from "react";
import { apiFetch } from "@/lib/api-client";
import { useAuthStore } from "@/stores/authStore";
import ForbiddenState from "@/components/ui/ForbiddenState";

export default function SettingsPage() {
  const { can, status } = useAuthStore();
  const canManagePolicy = can("academic_warning.policy.manage");
  const [policies, setPolicies] = useState<ApiData[]>([]);
  const [saving, setSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);

  // Active Policy Form
  const [activePolicyId, setActivePolicyId] = useState<string>("");
  const [termGpaThreshold, setTermGpaThreshold] = useState<number>(2.0);
  const [cumulativeGpaThreshold, setCumulativeGpaThreshold] = useState<number>(2.0);
  const [conductScoreThreshold, setConductScoreThreshold] = useState<number>(50);
  const [policyName, setPolicyName] = useState<string>("Chính sách Cảnh báo Học vụ");

  useEffect(() => {
    async function loadPolicies() {
      try {
        const res = await apiFetch("/api/v1/academic-warnings/policies");
        if (res.ok) {
          const json = await res.json();
          const items = Array.isArray(json.items) ? json.items : Array.isArray(json) ? json : [];
          setPolicies(items);
          if (items.length > 0) {
            const active = items.find((p: ApiData) => p.status === "active") || items[0];
            setActivePolicyId(active.id);
            setPolicyName(active.name || active.policyName || "Chính sách Cảnh báo Học vụ");
            setTermGpaThreshold(active.termGpaThreshold ?? 2.0);
            setCumulativeGpaThreshold(active.cumulativeGpaThreshold ?? 2.0);
            setConductScoreThreshold(active.conductScoreThreshold ?? 50);
          }
        }
      } catch (err) {
        console.error("Load policies error:", err);
      } finally {
        // The form remains usable with defaults if policy loading fails.
      }
    }
    loadPolicies();
  }, []);

  const handleSavePolicy = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canManagePolicy) return;
    try {
      setSaving(true);
      setSaveSuccess(false);

      const res = await apiFetch("/api/v1/academic-warnings/policies", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: policyName,
          policyName: policyName,
          policyCode: "POL_" + Date.now(),
          termGpaThreshold: Number(termGpaThreshold),
          cumulativeGpaThreshold: Number(cumulativeGpaThreshold),
          conductScoreThreshold: Number(conductScoreThreshold),
          status: "active",
        }),
      });

      if (res.ok) {
        setSaveSuccess(true);
        setTimeout(() => setSaveSuccess(false), 3000);
        // Reload policies
        const pRes = await apiFetch("/api/v1/academic-warnings/policies");
        if (pRes.ok) {
          const pJson = await pRes.json();
          setPolicies(Array.isArray(pJson.items) ? pJson.items : Array.isArray(pJson) ? pJson : []);
        }
      } else {
        const err = await res.json();
        alert(err.error?.message || "Lỗi khi cập nhật chính sách");
      }
    } catch (err: ApiData) {
      alert(err.message || "Lỗi kết nối máy chủ");
    } finally {
      setSaving(false);
    }
  };

  if (status !== "loading" && status !== "idle" && !canManagePolicy) {
    return (
      <ForbiddenState
        title="Không có quyền cấu hình chính sách"
        description="Mô-đun Cấu hình Chính sách Cảnh báo chỉ dành cho Quản trị viên hệ thống có thẩm quyền."
        requiredPermission="academic_warning.policy.manage"
      />
    );
  }

  return (
    <div className="p-6 space-y-6 max-w-7xl mx-auto">
      {/* Header */}
      <div>
        <div className="flex items-center gap-2 mb-1">
          <span className="w-2.5 h-2.5 rounded-full bg-[var(--color-primary)] animate-pulse" />
          <span className="text-xs font-semibold text-[var(--color-primary)] uppercase tracking-wider">
            Quản trị & Thiết lập Tham số
          </span>
        </div>
        <h1 className="text-2xl sm:text-3xl font-bold text-slate-900 tracking-tight" style={{ fontFamily: "Be Vietnam Pro, sans-serif" }}>
          Cấu hình Chính sách Cảnh báo Sớm
        </h1>
        <p className="text-xs sm:text-sm text-slate-500 mt-0.5">
          Thiết lập các ngưỡng GPA nội bộ dùng để ưu tiên sinh viên cần theo dõi
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left Column: GPA Threshold Settings */}
        <div className="lg:col-span-7 bg-white border border-slate-200 rounded-2xl p-6 shadow-xs space-y-5">
          <div>
            <h2 className="text-sm font-bold text-slate-900 uppercase tracking-wider" style={{ fontFamily: "Be Vietnam Pro, sans-serif" }}>
              Ngưỡng GPA Theo dõi Học vụ
            </h2>
            <p className="text-xs text-slate-400 mt-0.5">
              Sinh viên có điểm dưới ngưỡng sẽ được đưa vào danh sách cần xem xét khi chạy phiên quét
            </p>
          </div>

          <form onSubmit={handleSavePolicy} className="space-y-5">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1.5">Tên chính sách nội bộ</label>
              <input
                type="text"
                required
                value={policyName}
                onChange={(e) => setPolicyName(e.target.value)}
                className="w-full bg-white border border-slate-200 rounded-xl px-3 py-2 text-xs font-semibold text-slate-800 focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)]"
              />
            </div>

            {/* Term GPA Slider */}
            <div className="p-4 bg-red-50/40 border border-red-200 rounded-2xl space-y-3">
              <div className="flex items-center justify-between">
                <div>
                  <label className="text-xs font-bold text-red-900 block">Ngưỡng GPA Học kỳ Sàn (Thang 4.0)</label>
                  <span className="text-[11px] text-red-700">GPA học kỳ &lt; ngưỡng này → Tạo tín hiệu cần theo dõi</span>
                </div>
                <span className="font-mono font-black text-lg text-red-600 bg-white border border-red-200 px-3 py-1 rounded-xl shadow-xs">
                  {termGpaThreshold.toFixed(2)}
                </span>
              </div>
              <input
                type="range"
                min="1.0"
                max="3.0"
                step="0.05"
                value={termGpaThreshold}
                onChange={(e) => setTermGpaThreshold(parseFloat(e.target.value))}
                className="w-full accent-red-600 cursor-pointer"
              />
              <div className="flex justify-between text-[10px] text-slate-400 font-mono">
                <span>1.00 (Rất yếu)</span>
                <span>2.00</span>
                <span>3.00 (Khá)</span>
              </div>
            </div>

            {/* Cumulative GPA Slider */}
            <div className="p-4 bg-amber-50/40 border border-amber-200 rounded-2xl space-y-3">
              <div className="flex items-center justify-between">
                <div>
                  <label className="text-xs font-bold text-amber-900 block">Ngưỡng GPA Tích lũy Sàn (Thang 4.0)</label>
                  <span className="text-[11px] text-amber-700">GPA tích lũy &lt; ngưỡng này → Tạo tín hiệu cần theo dõi</span>
                </div>
                <span className="font-mono font-black text-lg text-amber-600 bg-white border border-amber-200 px-3 py-1 rounded-xl shadow-xs">
                  {cumulativeGpaThreshold.toFixed(2)}
                </span>
              </div>
              <input
                type="range"
                min="1.0"
                max="3.0"
                step="0.05"
                value={cumulativeGpaThreshold}
                onChange={(e) => setCumulativeGpaThreshold(parseFloat(e.target.value))}
                className="w-full accent-amber-500 cursor-pointer"
              />
              <div className="flex justify-between text-[10px] text-slate-400 font-mono">
                <span>1.00</span>
                <span>2.00</span>
                <span>3.00</span>
              </div>
            </div>

            {saveSuccess && (
              <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-xl text-xs font-semibold text-emerald-800 flex items-center gap-2">
                <span>✓ Đã tạo và áp dụng chính sách cảnh báo mới.</span>
              </div>
            )}

            <div className="flex justify-end pt-2">
              <button
                type="submit"
                disabled={saving || !canManagePolicy}
                className="px-5 py-2.5 rounded-xl bg-[var(--color-primary)] hover:opacity-90 disabled:opacity-50 text-white text-xs font-bold shadow-xs transition-opacity flex items-center gap-2 cursor-pointer"
              >
                {saving ? "Đang lưu cấu hình..." : canManagePolicy ? "Lưu & Áp dụng Chính sách" : "Không có quyền thay đổi"}
              </button>
            </div>
          </form>
        </div>

        {/* Right Column: Operational Rules & Policies History */}
        <div className="lg:col-span-5 space-y-6">
          {/* Operational workflow status */}
          <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-xs space-y-4">
            <div>
              <h2 className="text-sm font-bold text-slate-900 uppercase tracking-wider" style={{ fontFamily: "Be Vietnam Pro, sans-serif" }}>
                Phạm vi Can thiệp Hiện tại
              </h2>
              <p className="text-xs text-slate-400 mt-0.5">Các chức năng đang có trong phiên bản đồ án</p>
            </div>

            <div className="p-4 bg-emerald-50/50 border border-emerald-200 rounded-2xl space-y-3">
              <div className="flex items-center justify-between gap-4">
                <div>
                  <label className="text-xs font-bold text-emerald-900 block">Ngưỡng điểm rèn luyện (Thang 100)</label>
                  <span className="text-[11px] text-emerald-700">Điểm đã công nhận dưới ngưỡng → LOW_CONDUCT_SCORE</span>
                </div>
                <span className="font-mono font-black text-lg text-emerald-700 bg-white border border-emerald-200 px-3 py-1 rounded-xl shadow-xs">
                  {conductScoreThreshold}
                </span>
              </div>
              <input
                type="range"
                min="0"
                max="100"
                step="1"
                value={conductScoreThreshold}
                onChange={(e) => setConductScoreThreshold(Number(e.target.value))}
                className="w-full accent-emerald-600 cursor-pointer"
              />
              <div className="flex justify-between text-[10px] text-slate-400 font-mono">
                <span>0</span><span>35</span><span>50</span><span>80</span><span>100</span>
              </div>
            </div>

            <div className="space-y-2 text-xs text-slate-600">
              <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-3">
                <strong className="text-emerald-800">Đã hỗ trợ:</strong> ghi nhận nội dung tư vấn, người thực hiện, trạng thái và thời điểm.
              </div>
              <div className="rounded-xl border border-amber-200 bg-amber-50 p-3">
                Email, lịch hẹn, thời hạn và chuyển cấp tự động chưa được tích hợp. Người dùng chỉ ghi nhận các hành động đã thực hiện bên ngoài hệ thống.
              </div>
            </div>
          </div>

          {/* List of Registered Policies */}
          <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-xs space-y-3">
            <h2 className="text-sm font-bold text-slate-900 uppercase tracking-wider" style={{ fontFamily: "Be Vietnam Pro, sans-serif" }}>
              Lịch sử Chính sách Ngưỡng ({policies.length})
            </h2>

            <div className="space-y-2 max-h-48 overflow-y-auto scrollbar-thin">
              {policies.map((p) => (
                <div
                  key={p.id}
                  onClick={() => {
                    setActivePolicyId(p.id);
                    setPolicyName(p.name || p.policyName || "Chính sách Cảnh báo");
                    setTermGpaThreshold(p.termGpaThreshold ?? 2.0);
                    setCumulativeGpaThreshold(p.cumulativeGpaThreshold ?? 2.0);
                  }}
                  className={`p-3 rounded-xl border text-xs cursor-pointer transition-all ${
                    activePolicyId === p.id
                      ? "border-[var(--color-primary)] bg-[var(--color-primary-light)]/40 font-semibold"
                      : "border-slate-200 bg-slate-50/60 hover:bg-slate-100"
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span className="text-slate-800">{p.name || p.policyName}</span>
                    <span className={`px-2 py-0.2 rounded text-[10px] font-bold ${
                      p.status === "active" ? "bg-emerald-100 text-emerald-800" : "bg-slate-200 text-slate-600"
                    }`}>
                      {p.status === "active" ? "Đang áp dụng" : "Lưu trữ"}
                    </span>
                  </div>
                  <div className="text-[11px] text-slate-500 mt-1 font-mono">
                    GPA Kỳ: &lt;{Number(p.termGpaThreshold).toFixed(2)} • GPA Tích lũy: &lt;{Number(p.cumulativeGpaThreshold).toFixed(2)}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
