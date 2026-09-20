"use client";

import { useState, useEffect } from "react";
import { useParams, useRouter } from "next/navigation";
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ComposedChart, Scatter,
} from "recharts";
import WarningBadge from "@/components/WarningBadge";
import SlideOverDrawer from "@/components/ui/SlideOverDrawer";
import Modal from "@/components/ui/Modal";
import { useAuthStore } from "@/stores/authStore";
import { apiFetch } from "@/lib/api-client";

type ActiveTab = "overview" | "conduct" | "grades" | "decisions" | "fee_policies" | "registrations" | "training_plan" | "warnings";

type ConductClassification = "Xuất sắc" | "Tốt" | "Khá" | "Trung bình" | "Yếu" | "Kém";

type ConductRecord = {
  id: string;
  academicYear: string | null;
  termCode: string | null;
  termName: string | null;
  isSummer: boolean;
  scores: {
    self: number | null;
    class: number | null;
    department: number | null;
    recognized: number | null;
    sourceTemporary?: number | null;
  };
  approval: {
    code: "approved" | "pending" | "unknown" | "pending_evaluation";
    label: string;
  };
  classification: ConductClassification | null;
  evaluationTerm?: { id: string; yearCode: string; termCode: string; termName: string } | null;
  note?: string | null;
  sourceUpdatedAt: string | null;
  sourceUpdatedBy: string | null;
};

type ConductResponse = {
  items: ConductRecord[];
  total: number;
  approved: number;
  pending: number;
};

const formatDate = (value?: string | Date | null) => {
  if (!value) return "Chưa cập nhật";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? String(value) : date.toLocaleDateString("vi-VN");
};

const scheduleLabel = (status?: string | null) => {
  if (status === "on_track") return "Đúng tiến độ";
  if (status === "behind_schedule") return "Chậm tiến độ";
  if (status === "pending_result") return "Chờ kết quả";
  if (status === "no_due_plan") return "Chưa đến hạn đánh giá";
  return "Chưa có kỳ đánh giá";
};

const formatScore = (value?: number | null) => {
  if (value == null) return "Chưa có";
  return Number(value).toLocaleString("vi-VN", { maximumFractionDigits: 1 });
};

const conductPeriodLabel = (record?: ConductRecord | null) => {
  if (!record) return "Chưa có học kỳ được công nhận";
  return [record.termCode, record.academicYear].filter(Boolean).join(" ") || "Chưa xác định học kỳ";
};

const conductClassificationStyle = (classification?: ConductClassification | null) => {
  if (classification === "Xuất sắc" || classification === "Tốt") return "bg-emerald-100 text-emerald-700";
  if (classification === "Khá") return "bg-lime-100 text-lime-800";
  if (classification === "Trung bình") return "bg-amber-100 text-amber-800";
  return "bg-red-100 text-red-700";
};

const conductApprovalStyle = (code: ConductRecord["approval"]["code"]) => {
  if (code === "approved") return "bg-emerald-100 text-emerald-700";
  if (code === "pending" || code === "pending_evaluation") return "bg-amber-100 text-amber-800";
  return "bg-slate-100 text-slate-600";
};

export default function StudentDetailPage() {
  const { can } = useAuthStore();
  const params = useParams();
  const studentId = params?.id as string;
  const router = useRouter();

  const [activeTab, setActiveTab] = useState<ActiveTab>("overview");
  const [loading, setLoading] = useState(true);
  const [student, setStudent] = useState<ApiData>(null);
  const [gradesData, setGradesData] = useState<ApiData[]>([]);
  const [summariesData, setSummariesData] = useState<ApiData>(null);
  const [decisionsData, setDecisionsData] = useState<ApiData[]>([]);
  const [feePoliciesData, setFeePoliciesData] = useState<ApiData[]>([]);
  const [registrationsData, setRegistrationsData] = useState<ApiData[]>([]);
  const [trainingPlanData, setTrainingPlanData] = useState<ApiData[]>([]);
  const [dashboardData, setDashboardData] = useState<ApiData>(null);
  const [conductData, setConductData] = useState<ConductResponse | null>(null);
  const [loadIssues, setLoadIssues] = useState<string[]>([]);
  const [profileExporting, setProfileExporting] = useState(false);
  const [profileExportError, setProfileExportError] = useState("");

  // Decision & Fee Policy interactive states
  const [selectedDecisionDetail, setSelectedDecisionDetail] = useState<ApiData | null>(null);
  const [showAddFeeModal, setShowAddFeeModal] = useState(false);
  const [feeForm, setFeeForm] = useState({
    feeObjectDicId: "MIEN_GIAM_50",
    feeObjectName: "Miễn giảm 50% học phí",
    coefficient: 0.5,
    decisionNumber: "",
  });
  const [feeSubmitting, setFeeSubmitting] = useState(false);

  // Warning Action interactive state
  const [showActionModal, setShowActionModal] = useState(false);
  const [actionForm, setActionForm] = useState({
    actionType: "COUNSELING",
    note: "",
    status: "IN_PROGRESS",
  });
  const [actionSubmitting, setActionSubmitting] = useState(false);

  const reloadStudent = async () => {
    const sRes = await apiFetch(`/api/v1/students/${studentId}`);
    if (sRes.ok) {
      setStudent(await sRes.json());
    }
  };

  const exportProfilePdf = async () => {
    try {
      setProfileExporting(true);
      setProfileExportError("");
      const response = await apiFetch(`/api/v1/reports/export?format=pdf&type=student-profile&studentId=${encodeURIComponent(studentId)}`);
      if (!response.ok) {
        const payload = await response.json().catch(() => null);
        throw new Error(payload?.error?.message || "Không thể tạo PDF hồ sơ");
      }
      const url = URL.createObjectURL(await response.blob());
      const link = document.createElement("a");
      link.href = url;
      const disposition = response.headers.get("content-disposition") || "";
      const encodedName = disposition.match(/filename\*=UTF-8''([^;]+)/i)?.[1];
      link.download = encodedName ? decodeURIComponent(encodedName) : `ho_so_${studentId}.pdf`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
    } catch (error) {
      setProfileExportError(error instanceof Error ? error.message : "Không thể tạo PDF hồ sơ");
    } finally {
      setProfileExporting(false);
    }
  };

  useEffect(() => {
    async function loadStudentInfo() {
      if (!studentId) return;
      try {
        setLoading(true);
        setLoadIssues([]);
        const [sRes, dRes, gRes, sumRes, decRes, feeRes, regRes, conductRes] = await Promise.all([
          apiFetch(`/api/v1/students/${studentId}`),
          apiFetch(`/api/v1/students/${studentId}/dashboard`),
          apiFetch(`/api/v1/students/${studentId}/grades`),
          apiFetch(`/api/v1/students/${studentId}/grades/summary`),
          apiFetch(`/api/v1/students/${studentId}/decisions`),
          apiFetch(`/api/v1/students/${studentId}/fee-policies`),
          apiFetch(`/api/v1/students/${studentId}/registrations?pageSize=100`),
          apiFetch(`/api/v1/students/${studentId}/conduct`),
        ]);

        if (!sRes.ok) throw new Error("Không thể tải hồ sơ sinh viên");
        const sJson = await sRes.json();
        setStudent(sJson);

        const issues: string[] = [];
        if (sJson.program?.id) {
          const planRes = await apiFetch(`/api/v1/training-programs/${sJson.program.id}/courses`);
          if (planRes.ok) {
            const planJson = await planRes.json();
            setTrainingPlanData(planJson.items || []);
          } else issues.push("khung chương trình đào tạo");
        }
        if (dRes.ok) {
          const dJson = await dRes.json();
          setDashboardData(dJson);
        } else issues.push("tổng quan học vụ");

        if (gRes.ok) {
          const gJson = await gRes.json();
          setGradesData(gJson.items || gJson || []);
        } else issues.push("bảng điểm");

        if (sumRes.ok) {
          const sumJson = await sumRes.json();
          setSummariesData(sumJson);
        } else issues.push("tổng kết điểm");

        if (decRes.ok) {
          const decJson = await decRes.json();
          setDecisionsData(decJson.items || decJson || []);
        } else issues.push("quyết định");

        if (feeRes.ok) {
          const feeJson = await feeRes.json();
          setFeePoliciesData(feeJson.items || feeJson || []);
        } else issues.push("chính sách học phí");

        if (regRes.ok) {
          const regJson = await regRes.json();
          setRegistrationsData(regJson.items || regJson || []);
        } else issues.push("đăng ký học phần");
        if (conductRes.ok) {
          setConductData(await conductRes.json());
        } else issues.push("điểm rèn luyện");
        setLoadIssues(issues);
      } catch (err) {
        console.error("Error loading student details:", err);
        setLoadIssues([err instanceof Error ? err.message : "Không thể tải hồ sơ sinh viên"]);
      } finally {
        setLoading(false);
      }
    }

    loadStudentInfo();
  }, [studentId]);

  if (loading) {
    return (
      <div className="p-12 text-center text-slate-400">
        <div className="inline-flex items-center gap-2 text-sm font-medium">
          <svg className="animate-spin h-5 w-5 text-[var(--color-primary)]" viewBox="0 0 24 24" fill="none">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
          </svg>
          <span>Đang tải hồ sơ sinh viên {studentId}...</span>
        </div>
      </div>
    );
  }

  const sCode = student?.studentCode || student?.studentId || dashboardData?.student?.studentId || studentId;
  const sName = student?.fullName || dashboardData?.student?.fullName || "Sinh viên";
  const sClass = student?.className || student?.classStudentId || dashboardData?.student?.className || "Chưa phân lớp";
  const sProgram = student?.program?.code || student?.studyProgramId || dashboardData?.student?.programCode || "Chưa xác định";
  const cumulative = summariesData?.cumulative || student?.cumulative || dashboardData?.cumulative;
  const latestTerm = (summariesData?.terms || []).at(-1);
  const conductItems = conductData?.items || [];
  const latestConduct = conductItems
    .filter((record) => record.scores.recognized != null)
    .at(-1);
  const conductTrend = conductItems
    .filter((record) => record.scores.recognized != null)
    .map((record) => ({
      semester: conductPeriodLabel(record),
      score: record.scores.recognized,
      classification: record.classification,
    }));
  const progressStatus = dashboardData?.completion?.available
    ? scheduleLabel(dashboardData.completion.scheduleStatus)
    : "Chưa có kỳ đánh giá";
  const passedCourseCodes = new Set(
    gradesData.filter((grade: ApiData) => grade.isPassed).map((grade: ApiData) => grade.courseCode),
  );
  const plannedCredits = trainingPlanData.reduce((total: number, course: ApiData) => total + Number(course.credits || 0), 0);
  const completedPlanCredits = trainingPlanData.reduce(
    (total: number, course: ApiData) => total + (passedCourseCodes.has(course.courseCode) ? Number(course.credits || 0) : 0),
    0,
  );

  // GPA Trend data from summaries
  const gpaTrend = (summariesData?.terms || [])
    .filter((t: ApiData) => t.gpa4 != null || t.cumulativeGpa4 != null)
    .map((t: ApiData) => ({
      semester: t.academicYear ? `${t.termCode} ${t.academicYear}` : t.termCode || "HK",
      isSummer: Boolean(t.isSummer),
      gpa4: t.isSummer ? null : t.gpa4,
      summerGpa4: t.isSummer ? t.gpa4 : null,
      cumGpa4: t.isSummer ? null : t.cumulativeGpa4,
    }));

  const unifiedTimeline = [
    ...(student?.warningHistory || []).map((item: ApiData) => ({
      id: `warning-${item.id}`,
      date: item.createdAt,
      kind: "Cảnh báo",
      title: item.maxSeverity === "high" ? "Ghi nhận cảnh báo mức Đỏ" : "Ghi nhận cảnh báo mức Vàng",
      detail: `${item.reasonCount || 0} nguyên nhân · GPA kỳ ${item.termGpa4 ?? "—"} · GPA tích lũy ${item.cumulativeGpa4 ?? "—"}`,
      color: item.maxSeverity === "high" ? "bg-red-500" : "bg-amber-500",
    })),
    ...decisionsData.map((item: ApiData) => ({
      id: `decision-${item.id}`,
      date: item.signDate || item.createdAt,
      kind: "Quyết định",
      title: item.decisionName || "Quyết định học vụ",
      detail: `Số ${item.decisionNumber || "chưa cập nhật"}${item.termId ? ` · ${item.termId} ${item.yearStudy || ""}` : ""}`,
      color: item.isAcademicWarning ? "bg-purple-500" : "bg-blue-500",
    })),
    ...(student?.warningActions || []).map((item: ApiData) => ({
      id: `action-${item.id}`,
      date: item.createdAt,
      kind: "Hỗ trợ",
      title: `${item.actionType} · ${item.status}`,
      detail: `${item.actorName || "Cán bộ phụ trách"}: ${item.note}`,
      color: item.status === "RESOLVED" ? "bg-emerald-500" : item.status === "ESCALATED" ? "bg-red-500" : "bg-sky-500",
    })),
  ].filter((item) => item.date).sort((left, right) => new Date(right.date).getTime() - new Date(left.date).getTime());

  return (
    <div className="p-6 space-y-6 max-w-7xl mx-auto">
      {/* Top Breadcrumb / Back Button */}
      <div className="flex items-center justify-between">
        <button
          onClick={() => router.push("/students")}
          className="inline-flex items-center gap-1.5 text-xs font-semibold text-[var(--color-text-secondary)] hover:text-[var(--color-primary)] transition-colors cursor-pointer"
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <polyline points="15 18 9 12 15 6" />
          </svg>
          <span>Quay lại Danh sách Sinh viên</span>
        </button>

        <div className="flex items-center gap-2">
          {can("report.export") && (
            <button type="button" disabled={profileExporting} onClick={() => void exportProfilePdf()} className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-1.5 text-xs font-semibold text-emerald-800 transition hover:bg-emerald-100 disabled:opacity-50">
              {profileExporting ? "Đang tạo PDF..." : "Xuất PDF hồ sơ"}
            </button>
          )}
          <span className="text-xs font-mono bg-slate-100 text-slate-700 px-2.5 py-1 rounded-lg border border-slate-200">
            MSSV: <strong>{sCode}</strong>
          </span>
        </div>
      </div>

      {/* Header Profile Card */}
      <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-2xl p-6 shadow-xs flex flex-col md:flex-row items-start md:items-center justify-between gap-5">
        <div className="flex items-center gap-4">
          <div
            className="w-16 h-16 rounded-2xl bg-gradient-to-tr from-[var(--color-primary)] to-lime-500 flex items-center justify-center text-white text-2xl font-black shadow-md flex-shrink-0"
            style={{ fontFamily: "Be Vietnam Pro, sans-serif" }}
          >
            {sName.split(" ").pop()?.charAt(0) || "S"}
          </div>
          <div>
            <div className="flex items-center gap-3">
              <h1 className="text-2xl font-bold text-slate-900" style={{ fontFamily: "Be Vietnam Pro, sans-serif" }}>
                {sName}
              </h1>
              <WarningBadge level={student?.warningLevel || dashboardData?.warningLevel || "green"} />
            </div>
            <div className="flex flex-wrap items-center gap-2 mt-1 text-xs text-slate-500 font-medium">
              <span>Lớp: <strong className="text-slate-800">{sClass}</strong></span>
              <span>•</span>
              <span>Chương trình: <strong className="text-slate-800">{student?.program?.name || sProgram}</strong></span>
              <span>•</span>
              <span>Khoa: <strong className="text-slate-800">{student?.program?.facultyCode || "Chưa cập nhật"}</strong></span>
            </div>
          </div>
        </div>

        {/* Mini stats */}
        <div className="grid w-full grid-cols-2 gap-3 sm:grid-cols-4 md:w-auto">
          <div className="bg-[var(--color-surface2)]/70 px-4 py-2.5 rounded-xl border border-[var(--color-border)] text-center min-w-[90px]">
            <div className="text-[10px] uppercase font-bold text-slate-400">GPA Tích lũy (4)</div>
            <div className="text-xl font-black text-slate-800 font-mono">
              {cumulative?.cumulativeGpa4 != null ? Number(cumulative.cumulativeGpa4).toFixed(2) : "—"}
            </div>
          </div>

          <div className="bg-[var(--color-surface2)]/70 px-4 py-2.5 rounded-xl border border-[var(--color-border)] text-center min-w-[90px]">
            <div className="text-[10px] uppercase font-bold text-slate-400">GPA Tích lũy (10)</div>
            <div className="text-xl font-black text-slate-800 font-mono">
              {cumulative?.cumulativeGpa10 != null ? Number(cumulative.cumulativeGpa10).toFixed(2) : "—"}
            </div>
          </div>

          <div className="bg-[var(--color-surface2)]/70 px-4 py-2.5 rounded-xl border border-[var(--color-border)] text-center min-w-[90px]">
            <div className="text-[10px] uppercase font-bold text-slate-400">TC Đạt</div>
            <div className="text-xl font-black text-emerald-600 font-mono">
              {cumulative?.cumulativeCredits ?? "—"}
            </div>
          </div>

          <button
            type="button"
            onClick={() => setActiveTab("conduct")}
            className="min-w-[90px] cursor-pointer rounded-xl border border-lime-200 bg-[var(--color-primary-light)] px-4 py-2.5 text-center transition-colors hover:border-[var(--color-primary)] hover:bg-lime-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-primary)]"
            aria-label={latestConduct
              ? `Xem điểm rèn luyện, ${formatScore(latestConduct.scores.recognized)} điểm`
              : "Xem thông tin điểm rèn luyện, chưa có điểm được công nhận"}
          >
            <div className="text-[10px] font-bold uppercase text-lime-700">ĐRL gần nhất</div>
            <div className="font-mono text-xl font-black text-lime-800">
              {latestConduct?.scores.recognized ?? "—"}
            </div>
            <div className="truncate text-[10px] font-semibold text-lime-700">
              {latestConduct?.classification || "Chưa công nhận"}
            </div>
          </button>
        </div>
      </div>

      {loadIssues.length > 0 && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-xs text-amber-900" role="status">
          <strong>Một số phần chưa tải được:</strong> {loadIssues.join(", ")}. Hãy kiểm tra quyền truy cập hoặc thử tải lại trang.
        </div>
      )}
      {profileExportError && <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-xs text-red-800" role="alert">{profileExportError}</div>}

      {/* 6 Nav Tabs */}
      <div className="flex items-center space-x-1 border-b border-[var(--color-border)] overflow-x-auto scrollbar-hide">
        {[
          { id: "overview", label: "1. Tổng quan", icon: "📊" },
          { id: "conduct", label: "2. Rèn luyện", icon: "🌱" },
          { id: "grades", label: "3. Điểm học phần", icon: "📝" },
          { id: "decisions", label: "4. Quyết định", icon: "📜" },
          { id: "fee_policies", label: "5. Chính sách học phí", icon: "💰" },
          { id: "registrations", label: "6. Đăng ký học phần", icon: "📚" },
          { id: "training_plan", label: "7. Kế hoạch đào tạo", icon: "🎯" },
          {
            id: "warnings",
            label: "8. Cảnh báo học vụ",
            icon: "⚠️",
            badge: (student?.warningHistory?.length || (student?.warningLevel && student.warningLevel !== "green")) ? "!" : undefined,
          },
        ].map((t) => (
          <button
            key={t.id}
            onClick={() => setActiveTab(t.id as ActiveTab)}
            className={`flex items-center gap-2 px-4 py-3 text-xs sm:text-sm font-semibold border-b-2 transition-all cursor-pointer whitespace-nowrap ${
              activeTab === t.id
                ? "border-[var(--color-primary)] text-[var(--color-primary)] bg-[var(--color-primary-light)]/40 rounded-t-xl"
                : "border-transparent text-slate-500 hover:text-slate-900 hover:border-slate-300"
            }`}
            style={{ fontFamily: "Be Vietnam Pro, sans-serif" }}
          >
            <span>{t.icon}</span>
            <span>{t.label}</span>
          </button>
        ))}
      </div>

      {/* Tab Content Areas */}

      {/* 1. Overview Tab */}
      {activeTab === "overview" && (
        <div className="space-y-6">
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* GPA Trend Chart (2 cols) */}
            <div className="lg:col-span-2 bg-[var(--color-surface)] border border-[var(--color-border)] rounded-2xl p-6 shadow-xs">
              <h3 className="text-base font-bold text-slate-900 mb-1" style={{ fontFamily: "Be Vietnam Pro, sans-serif" }}>
                Diễn biến Điểm trung bình (GPA) qua các Học kỳ
              </h3>
              <p className="text-xs text-slate-500 mb-4">Theo dõi GPA học kỳ và GPA tích lũy hệ 4</p>

              <div className="h-64 w-full">
                {gpaTrend.length === 0 ? (
                  <div className="h-full flex items-center justify-center text-slate-400 text-xs">
                    Chưa có đủ dữ liệu điểm học kỳ để vẽ biểu đồ
                  </div>
                ) : (
                  <ResponsiveContainer width="100%" height="100%">
                    <ComposedChart data={gpaTrend} margin={{ top: 10, right: 20, left: -20, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#F1F5F9" />
                      <XAxis dataKey="semester" tick={{ fontSize: 11, fill: "#64748B" }} tickLine={false} />
                      <YAxis domain={[0, 4]} tick={{ fontSize: 11, fill: "#64748B" }} tickLine={false} axisLine={false} />
                      <Tooltip
                        contentStyle={{
                          backgroundColor: "#FFFFFF",
                          borderRadius: "10px",
                          border: "1px solid #E2E8F0",
                          fontSize: "12px",
                        }}
                      />
                      <Line type="monotone" dataKey="gpa4" name="GPA kỳ chính" stroke="#90C63B" strokeWidth={2.5} dot={{ r: 4 }} connectNulls />
                      <Line type="monotone" dataKey="cumGpa4" name="GPA tích lũy kỳ chính" stroke="#2563EB" strokeWidth={2.5} dot={{ r: 4 }} connectNulls />
                      <Scatter dataKey="summerGpa4" name="GPA hè mô tả" fill="#F59E0B" shape="diamond" />
                    </ComposedChart>
                  </ResponsiveContainer>
                )}
              </div>
            </div>

            {/* Academic Info & Warning Status */}
            <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-2xl p-6 shadow-xs space-y-4">
              <h3 className="text-base font-bold text-slate-900" style={{ fontFamily: "Be Vietnam Pro, sans-serif" }}>
                Tình trạng Học vụ Hiện tại
              </h3>

              <div className="space-y-3 text-xs">
                <div className="flex justify-between py-2 border-b border-slate-100">
                  <span className="text-slate-500">Trạng thái sinh viên:</span>
                  <span className={`font-semibold ${student?.isInClass ? "text-emerald-600" : "text-slate-600"}`}>
                    {student?.isInClass ? "Đang trong lớp" : "Đã rời lớp"}
                  </span>
                </div>
                <div className="flex justify-between py-2 border-b border-slate-100">
                  <span className="text-slate-500">Cố vấn học tập (GVCN):</span>
                  <span className="font-semibold text-slate-800 text-right">{student?.advisor?.fullName || "Chưa phân công"}</span>
                </div>
                <div className="flex justify-between py-2 border-b border-slate-100">
                  <span className="text-slate-500">Mức độ cảnh báo:</span>
                  <WarningBadge level={dashboardData?.warningLevel || "green"} />
                </div>
                <div className="flex justify-between py-2 border-b border-slate-100">
                  <span className="text-slate-500">Tiến độ đào tạo:</span>
                  <span className="font-semibold text-slate-800 text-right">{progressStatus}</span>
                </div>
                <div className="flex justify-between gap-4 py-2 border-b border-slate-100">
                  <span className="text-slate-500">Rèn luyện gần nhất:</span>
                  <button
                    type="button"
                    onClick={() => setActiveTab("conduct")}
                    className="cursor-pointer text-right font-semibold text-slate-800 hover:text-[var(--color-primary)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-primary)]"
                  >
                    {latestConduct
                      ? `${formatScore(latestConduct.scores.recognized)}/100 - ${latestConduct.classification || "Chưa phân loại"}`
                      : "Chưa có điểm công nhận"}
                  </button>
                </div>
                <div className="flex justify-between py-2">
                  <span className="text-slate-500">Số quyết định xử lý:</span>
                  <span className="font-semibold text-slate-800">{decisionsData.length} quyết định</span>
                </div>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
            <section className="lg:col-span-2 bg-[var(--color-surface)] border border-[var(--color-border)] rounded-2xl p-6 shadow-xs">
              <div className="flex items-start justify-between gap-3 mb-5">
                <div>
                  <h3 className="text-base font-bold text-slate-900" style={{ fontFamily: "Be Vietnam Pro, sans-serif" }}>
                    Thông tin cá nhân
                  </h3>
                  <p className="text-xs text-slate-500 mt-1">Dữ liệu hồ sơ đang lưu trong hệ thống</p>
                </div>
                <span className="text-[10px] font-mono text-slate-400">{sCode}</span>
              </div>
              <dl className="grid grid-cols-[minmax(7rem,0.8fr)_minmax(0,1.2fr)] gap-x-4 text-xs">
                {[
                  ["Ngày sinh", formatDate(student?.birthDate)],
                  ["Giới tính", student?.gender || "Chưa cập nhật"],
                  ["Nơi sinh", student?.birthPlace || "Chưa cập nhật"],
                  ["Nơi thường trú", student?.permanentResidence || "Chưa cập nhật"],
                  ["Lớp sinh viên", sClass],
                  ["Khóa", student?.cohort?.name || student?.cohort?.code || "Chưa xác định"],
                  ["Vai trò trong lớp", student?.classRoleId === 1 ? "Lớp trưởng" : "Sinh viên"],
                ].map(([label, value]) => (
                  <div key={label} className="contents">
                    <dt className="py-2.5 border-b border-slate-100 text-slate-500">{label}</dt>
                    <dd className="py-2.5 border-b border-slate-100 font-semibold text-slate-800 text-right break-words">{value}</dd>
                  </div>
                ))}
              </dl>
            </section>

            <section className="lg:col-span-3 bg-[var(--color-surface)] border border-[var(--color-border)] rounded-2xl p-6 shadow-xs">
              <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3 mb-5">
                <div>
                  <h3 className="text-base font-bold text-slate-900" style={{ fontFamily: "Be Vietnam Pro, sans-serif" }}>
                    Chương trình và kết quả gần nhất
                  </h3>
                  <p className="text-xs text-slate-500 mt-1">Thông tin đào tạo đối chiếu từ CTĐT và bảng điểm</p>
                </div>
                <span className="self-start rounded-lg bg-slate-100 px-2.5 py-1 text-[11px] font-mono font-semibold text-slate-700">
                  {sProgram}
                </span>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-8">
                <dl className="text-xs">
                  {[
                    ["Tên chương trình", student?.program?.name || "Chưa cập nhật"],
                    ["Ngành/Chuyên ngành", student?.program?.major || "Chưa cập nhật"],
                    ["Trình độ đào tạo", student?.program?.degreeLevel || "Chưa cập nhật"],
                    ["Hình thức đào tạo", student?.program?.studyType || "Chưa cập nhật"],
                  ].map(([label, value]) => (
                    <div key={label} className="flex justify-between gap-4 py-2.5 border-b border-slate-100">
                      <dt className="text-slate-500">{label}</dt>
                      <dd className="font-semibold text-slate-800 text-right">{value}</dd>
                    </div>
                  ))}
                </dl>

                <dl className="text-xs">
                  <div className="flex justify-between gap-4 py-2.5 border-b border-slate-100">
                    <dt className="text-slate-500">Kỳ có kết quả gần nhất</dt>
                    <dd className="font-semibold text-slate-800 text-right">
                      {latestTerm ? `${latestTerm.termCode} · ${latestTerm.academicYear}` : "Chưa có"}
                    </dd>
                  </div>
                  <div className="flex justify-between gap-4 py-2.5 border-b border-slate-100">
                    <dt className="text-slate-500">GPA học kỳ (hệ 4)</dt>
                    <dd className="font-mono font-bold text-slate-900">{latestTerm?.gpa4 != null ? Number(latestTerm.gpa4).toFixed(2) : "—"}</dd>
                  </div>
                  <div className="flex justify-between gap-4 py-2.5 border-b border-slate-100">
                    <dt className="text-slate-500">Tín chỉ đăng ký / đạt</dt>
                    <dd className="font-mono font-bold text-slate-900">
                      {latestTerm ? `${latestTerm.registeredCredits ?? "—"} / ${latestTerm.creditsEarned ?? "—"}` : "—"}
                    </dd>
                  </div>
                  <div className="flex justify-between gap-4 py-2.5 border-b border-slate-100">
                    <dt className="text-slate-500">Điểm rèn luyện gần nhất</dt>
                    <dd className="font-mono font-bold text-slate-900">
                      {latestConduct?.scores.recognized ?? "—"}
                    </dd>
                  </div>
                  <div className="flex justify-between gap-4 py-2.5">
                    <dt className="text-slate-500">Số học phần có dữ liệu</dt>
                    <dd className="font-mono font-bold text-slate-900">{gradesData.length}</dd>
                  </div>
                </dl>
              </div>
            </section>
          </div>
        </div>
      )}

      {activeTab === "conduct" && (
        <section className="space-y-5">
          <div className="grid grid-cols-1 gap-5 lg:grid-cols-[minmax(0,2fr)_minmax(18rem,1fr)]">
            <div className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] p-5 shadow-xs sm:p-6">
              <div className="mb-4">
                <h3 className="font-bold text-slate-900">Diễn biến điểm rèn luyện</h3>
                <p className="mt-1 text-xs text-slate-500">Chỉ gồm điểm đã được công nhận theo từng học kỳ</p>
              </div>

              <div className="h-64 w-full">
                {conductTrend.length > 0 ? (
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={conductTrend} margin={{ top: 12, right: 18, left: -20, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#F1F5F9" />
                      <XAxis dataKey="semester" tick={{ fontSize: 11, fill: "#64748B" }} tickLine={false} axisLine={false} />
                      <YAxis domain={[0, 100]} ticks={[0, 25, 50, 75, 100]} tick={{ fontSize: 11, fill: "#64748B" }} tickLine={false} axisLine={false} />
                      <Tooltip
                        formatter={(value) => [`${value}/100`, "Điểm công nhận"]}
                        contentStyle={{
                          backgroundColor: "#FFFFFF",
                          borderRadius: "10px",
                          border: "1px solid #E2E8F0",
                          fontSize: "12px",
                        }}
                      />
                      <Line
                        type="monotone"
                        dataKey="score"
                        name="Điểm công nhận"
                        stroke="#65A30D"
                        strokeWidth={2.5}
                        dot={{ r: 4, fill: "#FFFFFF", strokeWidth: 2 }}
                        activeDot={{ r: 5 }}
                      />
                    </LineChart>
                  </ResponsiveContainer>
                ) : (
                  <div className="flex h-full items-center justify-center rounded-xl bg-slate-50 px-6 text-center text-xs text-slate-500">
                    Chưa có điểm rèn luyện được công nhận để hiển thị biểu đồ.
                  </div>
                )}
              </div>
            </div>

            <div className="rounded-2xl border border-lime-200 bg-[var(--color-primary-light)] p-5 sm:p-6">
              <p className="text-xs font-semibold text-lime-800">Kết quả được công nhận gần nhất</p>
              <div className="mt-3 flex items-end gap-2">
                <span className="font-mono text-4xl font-black leading-none text-lime-900">
                  {latestConduct?.scores.recognized ?? "—"}
                </span>
                {latestConduct && <span className="pb-0.5 text-sm font-semibold text-lime-700">/ 100</span>}
              </div>
              <p className="mt-2 text-xs font-medium text-lime-800">{conductPeriodLabel(latestConduct)}</p>

              <div className="mt-5 flex flex-wrap gap-2">
                {latestConduct?.classification && (
                  <span className={`rounded-full px-2.5 py-1 text-[11px] font-bold ${conductClassificationStyle(latestConduct.classification)}`}>
                    {latestConduct.classification}
                  </span>
                )}
                <span className={`rounded-full px-2.5 py-1 text-[11px] font-bold ${conductApprovalStyle(latestConduct?.approval.code || "unknown")}`}>
                  {latestConduct?.approval.label || "Chưa có dữ liệu"}
                </span>
              </div>

              <dl className="mt-5 grid grid-cols-2 gap-3 border-t border-lime-200 pt-4 text-xs">
                <div>
                  <dt className="text-lime-700">Đã công nhận</dt>
                  <dd className="mt-1 font-mono text-xl font-black text-lime-900">{conductData?.approved ?? 0}</dd>
                </div>
                <div>
                  <dt className="text-lime-700">Đang chờ</dt>
                  <dd className="mt-1 font-mono text-xl font-black text-lime-900">{conductData?.pending ?? 0}</dd>
                </div>
              </dl>
            </div>
          </div>

          <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-xs">
            <div className="border-b border-slate-200 px-5 py-4">
              <h3 className="font-bold text-slate-900">Lịch sử điểm rèn luyện</h3>
              <p className="mt-0.5 text-xs text-slate-500">Điểm chính thức chỉ hiển thị khi kết quả của học kỳ đã được công nhận.</p>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <caption className="sr-only">Điểm rèn luyện của sinh viên theo từng học kỳ</caption>
                <thead>
                  <tr className="bg-slate-50 text-[10px] font-semibold uppercase text-slate-500">
                    <th scope="col" className="px-4 py-3">Học kỳ</th>
                    <th scope="col" className="px-4 py-3">Tự đánh giá</th>
                    <th scope="col" className="px-4 py-3">Lớp</th>
                    <th scope="col" className="px-4 py-3">Khoa</th>
                    <th scope="col" className="px-4 py-3">Công nhận</th>
                    <th scope="col" className="px-4 py-3">Xếp loại</th>
                    <th scope="col" className="px-4 py-3">Trạng thái</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {conductItems.map((record) => (
                    <tr key={record.id} className="hover:bg-slate-50/70">
                      <td className="whitespace-nowrap px-4 py-3 font-semibold text-slate-800">
                        <div className="flex items-center gap-2">
                          <span>{conductPeriodLabel(record)}</span>
                          {record.isSummer && <span className="rounded-md border border-amber-200 bg-amber-50 px-1.5 py-0.5 text-[10px] font-bold text-amber-800">Hè</span>}
                        </div>
                        {record.isSummer && (
                          <p className="mt-1 max-w-sm whitespace-normal text-[10px] font-normal leading-4 text-amber-700">
                            {record.note}{record.evaluationTerm ? ` Đánh giá trong ${record.evaluationTerm.termCode} ${record.evaluationTerm.yearCode}.` : " Chưa xác định kỳ đánh giá tiếp theo."}
                          </p>
                        )}
                      </td>
                      <td className="px-4 py-3 font-mono">{record.scores.self ?? "—"}</td>
                      <td className="px-4 py-3 font-mono">{record.scores.class ?? "—"}</td>
                      <td className="px-4 py-3 font-mono">{record.scores.department ?? "—"}</td>
                      <td className="px-4 py-3 font-mono font-bold text-slate-900">{record.isSummer ? record.scores.sourceTemporary ?? "—" : record.scores.recognized ?? "—"}</td>
                      <td className="px-4 py-3">
                        {record.classification ? (
                          <span className={`whitespace-nowrap rounded-full px-2 py-1 text-[10px] font-bold ${conductClassificationStyle(record.classification)}`}>
                            {record.classification}
                          </span>
                        ) : "—"}
                      </td>
                      <td className="px-4 py-3">
                        <span className={`whitespace-nowrap rounded-full px-2 py-1 text-[10px] font-bold ${conductApprovalStyle(record.approval.code)}`}>
                          {record.approval.label}
                        </span>
                      </td>
                    </tr>
                  ))}
                  {!conductItems.length && (
                    <tr>
                      <td colSpan={7} className="px-4 py-10 text-center text-slate-500">
                        Chưa có dữ liệu điểm rèn luyện cho sinh viên này.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </section>
      )}

      {/* 2. Grades Tab */}
      {activeTab === "grades" && (
        <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-2xl p-6 shadow-xs space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-base font-bold text-slate-900" style={{ fontFamily: "Be Vietnam Pro, sans-serif" }}>
                Bảng điểm Chi tiết các Học phần
              </h3>
              <p className="text-xs text-slate-500">Tất cả các môn đã đăng ký, điểm thi hệ 10, hệ 4 và điểm chữ</p>
            </div>
            <a
              href={`/api/v1/students/${studentId}/grades/export`}
              download
              className="px-3.5 py-2 bg-[var(--color-primary)] hover:bg-[#81b234] text-white text-xs font-semibold rounded-xl transition-colors shadow-xs"
            >
              Xuất Bảng điểm →
            </a>
          </div>

          {(summariesData?.conductRecords || []).length > 0 && (
            <div className="rounded-xl border border-slate-200 overflow-hidden">
              <div className="px-4 py-3 bg-slate-50 border-b border-slate-200">
                <h4 className="text-sm font-bold text-slate-900">Điểm rèn luyện đã ghi nhận</h4>
                <p className="text-[11px] text-slate-500 mt-0.5">Dữ liệu nguồn theo lớp và học kỳ; xem trạng thái duyệt ở từng bản ghi</p>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead>
                    <tr className="text-slate-500 uppercase font-semibold text-[10px] border-b border-slate-100">
                      <th className="py-2.5 px-3">Năm học</th>
                      <th className="py-2.5 px-3">Học kỳ</th>
                      <th className="py-2.5 px-3">SV tự chấm</th>
                      <th className="py-2.5 px-3">Lớp duyệt</th>
                      <th className="py-2.5 px-3">Khoa duyệt</th>
                      <th className="py-2.5 px-3">Điểm cuối</th>
                      <th className="py-2.5 px-3">Trạng thái</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {summariesData.conductRecords.map((record: ApiData) => (
                      <tr key={record.id}>
                        <td className="py-2.5 px-3 font-medium text-slate-800">{record.academicYear || "—"}</td>
                        <td className="py-2.5 px-3">{record.termCode || "—"}</td>
                        <td className="py-2.5 px-3 font-mono">{record.studentScore ?? "—"}</td>
                        <td className="py-2.5 px-3 font-mono">{record.classScore ?? "—"}</td>
                        <td className="py-2.5 px-3 font-mono">{record.departmentScore ?? "—"}</td>
                        <td className="py-2.5 px-3 font-mono font-bold text-slate-900">{record.finalScore ?? "—"}</td>
                        <td className="py-2.5 px-3 text-slate-500">{record.statusId || "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {(summariesData?.unscopedGrades || []).length > 0 && (
            <div className="rounded-xl border border-amber-200 bg-amber-50/60 p-4">
              <h4 className="text-sm font-bold text-amber-900">
                Điểm chưa xác định học kỳ ({summariesData.unscopedGrades.length})
              </h4>
              <p className="text-[11px] text-amber-700 mt-1">
                Nguồn chưa cung cấp năm học hoặc học kỳ, nên các dòng này được bảo toàn nhưng không dùng để tính GPA.
              </p>
              <div className="mt-3 flex flex-wrap gap-2">
                {summariesData.unscopedGrades.map((grade: ApiData) => (
                  <span key={grade.id} className="rounded-lg bg-white border border-amber-200 px-2.5 py-1.5 text-xs text-amber-950">
                    <strong>{grade.courseCode || "Chưa có mã HP"}</strong>
                    {grade.courseName ? ` · ${grade.courseName}` : ""}
                    {grade.credits != null ? ` · ${grade.credits} TC` : ""}
                  </span>
                ))}
              </div>
            </div>
          )}

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="bg-[var(--color-surface2)]/50 border-b border-[var(--color-border)] text-slate-500 uppercase font-semibold text-[11px]">
                  <th className="py-3 px-3">Mã HP</th>
                  <th className="py-3 px-3">Tên học phần</th>
                  <th className="py-3 px-3">Số TC</th>
                  <th className="py-3 px-3">Học kỳ</th>
                  <th className="py-3 px-3">Điểm 10</th>
                  <th className="py-3 px-3">Điểm 4</th>
                  <th className="py-3 px-3">Điểm chữ</th>
                  <th className="py-3 px-3">Kết quả</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {gradesData.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="py-8 text-center text-slate-400">
                      Chưa có dữ liệu điểm học phần.
                    </td>
                  </tr>
                ) : (
                  gradesData.map((g: ApiData, i: number) => (
                    <tr key={g.id || i} className="hover:bg-slate-50">
                      <td className="py-3 px-3 font-mono font-bold text-slate-800">{g.courseCode}</td>
                      <td className="py-3 px-3 font-medium text-slate-900">{g.courseName}</td>
                      <td className="py-3 px-3 font-mono">{g.credits}</td>
                      <td className="py-3 px-3 text-slate-500">
                        <span>{g.termCode} ({g.academicYear})</span>
                        {g.isSummer && (
                          <span
                            className="ml-2 inline-flex rounded-md border border-amber-200 bg-amber-50 px-1.5 py-0.5 text-[10px] font-bold text-amber-800"
                            title={g.rankingMainTerm
                              ? `Kết quả dùng khi xếp hạng cùng ${g.rankingMainTerm.termCode} ${g.rankingMainTerm.academicYear}`
                              : "Kỳ phụ; chưa xác định kỳ chính ngay trước"}
                          >
                            Hè
                          </span>
                        )}
                      </td>
                      <td className="py-3 px-3 font-mono font-semibold">{g.score10 ?? "—"}</td>
                      <td className="py-3 px-3 font-mono font-semibold">{g.score4 ?? "—"}</td>
                      <td className="py-3 px-3 font-mono font-bold">{g.letterGrade || "—"}</td>
                      <td className="py-3 px-3">
                        <span className={`px-2 py-0.5 rounded text-[11px] font-semibold ${
                          g.isPassed ? "bg-emerald-100 text-emerald-700" : "bg-red-100 text-red-700"
                        }`}>
                          {g.isPassed ? "Đạt" : "Không đạt"}
                        </span>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* 3. Decisions Tab */}
      {activeTab === "decisions" && (
        <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-2xl p-6 shadow-xs space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-base font-bold text-slate-900" style={{ fontFamily: "Be Vietnam Pro, sans-serif" }}>
                Danh sách Quyết định Quản lý
              </h3>
              <p className="text-xs text-slate-500">Các quyết định học vụ, khen thưởng, kỷ luật, cảnh báo học tập</p>
            </div>
            <a
              href={`/api/v1/students/${studentId}/decisions/export`}
              download
              className="px-3.5 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold rounded-xl transition-colors"
            >
              Xuất danh sách →
            </a>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="bg-[var(--color-surface2)]/50 border-b border-[var(--color-border)] text-slate-500 uppercase font-semibold text-[11px]">
                  <th className="py-3 px-3">Số quyết định</th>
                  <th className="py-3 px-3">Tên quyết định</th>
                  <th className="py-3 px-3">Ngày ký</th>
                  <th className="py-3 px-3">Học kỳ áp dụng</th>
                  <th className="py-3 px-3">Cảnh báo học vụ</th>
                  <th className="py-3 px-3">Nội dung tóm tắt</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {decisionsData.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="py-8 text-center text-slate-400">
                      Sinh viên chưa có quyết định xử lý hoặc khen thưởng nào.
                    </td>
                  </tr>
                ) : (
                  decisionsData.map((d: ApiData) => (
                    <tr key={d.id} className="hover:bg-slate-50">
                      <td className="py-3 px-3 font-mono font-bold text-slate-800">{d.decisionNumber || d.sDecisionNumber}</td>
                      <td className="py-3 px-3 font-medium text-slate-900">{d.decisionName || d.sDecisionName}</td>
                      <td className="py-3 px-3 text-slate-500">{d.signDate ? new Date(d.signDate).toLocaleDateString("vi-VN") : "—"}</td>
                      <td className="py-3 px-3 text-slate-500">{d.termCode || d.sTermId}</td>
                      <td className="py-3 px-3">
                        {d.isAcademicWarning ? (
                          <span className="px-2 py-0.5 rounded text-[11px] font-semibold bg-red-100 text-red-700">
                            Cảnh báo học vụ
                          </span>
                        ) : (
                          <span className="px-2 py-0.5 rounded text-[11px] font-semibold bg-slate-100 text-slate-600">
                            Khác
                          </span>
                        )}
                      </td>
                      <td className="py-3 px-3 text-slate-600 max-w-xs truncate">{d.reason || d.fullText || d.sFullText || "—"}</td>
                      <td className="py-3 px-3 text-right">
                        <button
                          type="button"
                          onClick={() => setSelectedDecisionDetail(d)}
                          className="px-2.5 py-1 text-xs font-semibold text-[var(--color-primary)] hover:bg-emerald-50 rounded-lg transition-colors cursor-pointer"
                        >
                          Toàn văn →
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

      {/* 4. Fee Policies Tab */}
      {activeTab === "fee_policies" && (
        <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-2xl p-6 shadow-xs space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-base font-bold text-slate-900" style={{ fontFamily: "Be Vietnam Pro, sans-serif" }}>
                Chính sách Miễn giảm Học phí
              </h3>
              <p className="text-xs text-slate-500">Đối tượng chính sách, tỷ lệ miễn giảm và quyết định phê duyệt</p>
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setShowAddFeeModal(true)}
                className="px-3.5 py-2 bg-[var(--color-primary)] hover:bg-[var(--color-primary)]/90 text-white text-xs font-semibold rounded-xl transition-colors cursor-pointer shadow-xs"
              >
                + Gán chính sách mới
              </button>
              <a
                href={`/api/v1/students/${studentId}/fee-policies/export`}
                download
                className="px-3.5 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold rounded-xl transition-colors"
              >
                Xuất danh sách →
              </a>
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="bg-[var(--color-surface2)]/50 border-b border-[var(--color-border)] text-slate-500 uppercase font-semibold text-[11px]">
                  <th className="py-3 px-3">Tên chính sách / Đối tượng</th>
                  <th className="py-3 px-3">Tỷ lệ miễn giảm</th>
                  <th className="py-3 px-3">Năm học / Học kỳ</th>
                  <th className="py-3 px-3">Số quyết định</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {feePoliciesData.length === 0 ? (
                  <tr>
                    <td colSpan={4} className="py-8 text-center text-slate-400">
                      Sinh viên không thuộc diện miễn giảm học phí trong học kỳ này.
                    </td>
                  </tr>
                ) : (
                  feePoliciesData.map((f: ApiData) => (
                    <tr key={f.id} className="hover:bg-slate-50">
                      <td className="py-3 px-3 font-semibold text-slate-900">{f.feeObjectDicName || f.sFeeObjectDicName}</td>
                      <td className="py-3 px-3">
                        <span className="px-2.5 py-1 rounded-lg bg-emerald-100 text-emerald-800 font-bold font-mono">
                          {f.coefficientPercent || f.sCoefficient}%
                        </span>
                      </td>
                      <td className="py-3 px-3 text-slate-500">{f.termCode || f.sTermId} ({f.academicYear || f.sYearStudy})</td>
                      <td className="py-3 px-3 font-mono font-medium text-slate-800">{f.decisionNumber || f.sDecisionNumber || "—"}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* 5. Registrations Tab */}
      {activeTab === "registrations" && (
        <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-2xl p-6 shadow-xs space-y-4">
          <div>
            <h3 className="text-base font-bold text-slate-900" style={{ fontFamily: "Be Vietnam Pro, sans-serif" }}>
              Đăng ký Học phần trong Học kỳ
            </h3>
            <p className="text-xs text-slate-500">Danh sách các lớp học phần sinh viên đã đăng ký tham gia</p>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="bg-[var(--color-surface2)]/50 border-b border-[var(--color-border)] text-slate-500 uppercase font-semibold text-[11px]">
                  <th className="py-3 px-3">Mã học phần</th>
                  <th className="py-3 px-3">Tên môn học</th>
                  <th className="py-3 px-3">Số tín chỉ</th>
                  <th className="py-3 px-3">Năm học / Học kỳ</th>
                  <th className="py-3 px-3">Thời gian ghi nhận</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {registrationsData.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="py-8 text-center text-slate-400">
                      Chưa có dữ liệu đăng ký học phần cho sinh viên này.
                    </td>
                  </tr>
                ) : (
                  registrationsData.map((r: ApiData) => (
                    <tr key={r.id} className="hover:bg-slate-50">
                      <td className="py-3 px-3 font-mono font-bold text-slate-800">{r.courseCode}</td>
                      <td className="py-3 px-3 font-medium text-slate-900">{r.courseName}</td>
                      <td className="py-3 px-3 font-mono">{r.credits} TC</td>
                      <td className="py-3 px-3 text-slate-500">
                        {r.termCode && r.academicYear ? `${r.termCode} • ${r.academicYear}` : "—"}
                        {r.isSummer && <span className="ml-2 rounded-md border border-amber-200 bg-amber-50 px-1.5 py-0.5 text-[10px] font-bold text-amber-800">Kỳ phụ</span>}
                      </td>
                      <td className="py-3 px-3 text-slate-400">{r.createdAt ? new Date(r.createdAt).toLocaleDateString("vi-VN") : "—"}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* 6. Training plan tab */}
      {activeTab === "training_plan" && (
        <div className="space-y-5">
          <section className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-2xl p-6 shadow-xs">
            <div className="flex flex-col md:flex-row md:items-start justify-between gap-4">
              <div>
                <h3 className="text-base font-bold text-slate-900" style={{ fontFamily: "Be Vietnam Pro, sans-serif" }}>
                  Khung chương trình đào tạo
                </h3>
                <p className="text-xs text-slate-500 mt-1">
                  {student?.program?.name || sProgram} · đối chiếu với kết quả học phần hiện có
                </p>
              </div>
              <div className="flex gap-2 overflow-x-auto">
                <div className="min-w-28 rounded-xl bg-slate-50 border border-slate-200 px-3 py-2">
                  <span className="block text-[10px] text-slate-500">Học phần CTĐT</span>
                  <strong className="font-mono text-lg text-slate-900">{trainingPlanData.length}</strong>
                </div>
                <div className="min-w-28 rounded-xl bg-slate-50 border border-slate-200 px-3 py-2">
                  <span className="block text-[10px] text-slate-500">Tín chỉ kế hoạch</span>
                  <strong className="font-mono text-lg text-slate-900">{plannedCredits}</strong>
                </div>
                <div className="min-w-28 rounded-xl bg-emerald-50 border border-emerald-200 px-3 py-2">
                  <span className="block text-[10px] text-emerald-700">Đã đạt trong CTĐT</span>
                  <strong className="font-mono text-lg text-emerald-800">{completedPlanCredits}</strong>
                </div>
              </div>
            </div>

            <div className="mt-5 overflow-x-auto rounded-xl border border-slate-200">
              <table className="w-full text-left text-xs">
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-200 text-[10px] font-semibold text-slate-500 uppercase">
                    <th className="py-3 px-3">HK kế hoạch</th>
                    <th className="py-3 px-3">Mã HP</th>
                    <th className="py-3 px-3">Tên học phần</th>
                    <th className="py-3 px-3">TC</th>
                    <th className="py-3 px-3">Loại</th>
                    <th className="py-3 px-3">Kết quả</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {trainingPlanData.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="py-10 text-center text-slate-400">
                        Chưa có khung học phần cho chương trình này.
                      </td>
                    </tr>
                  ) : trainingPlanData.map((course: ApiData) => {
                    const passed = passedCourseCodes.has(course.courseCode);
                    return (
                      <tr key={course.id} className="hover:bg-slate-50/70 transition-colors">
                        <td className="py-3 px-3 text-slate-600">Học kỳ {course.semesterNo}</td>
                        <td className="py-3 px-3 font-mono font-bold text-slate-900">{course.courseCode}</td>
                        <td className="py-3 px-3 font-medium text-slate-800">{course.courseName}</td>
                        <td className="py-3 px-3 font-mono">{course.credits}</td>
                        <td className="py-3 px-3 text-slate-600">{course.requirementType || "—"}</td>
                        <td className="py-3 px-3">
                          <span className={`inline-flex rounded-md px-2 py-0.5 text-[11px] font-semibold ${
                            passed ? "bg-emerald-100 text-emerald-700" : "bg-slate-100 text-slate-600"
                          }`}>
                            {passed ? "Đã đạt" : "Chưa đạt"}
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </section>
        </div>
      )}

      {/* 7. TAB CẢNH BÁO HỌC VỤ & CAN THIỆP */}
      {activeTab === "warnings" && (
        <div className="space-y-6">
          {/* Top Banner & Quick Status */}
          <div className={`p-5 rounded-2xl border flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 ${
            student?.warningLevel === "red"
              ? "bg-red-50/80 border-red-200"
              : student?.warningLevel === "yellow"
              ? "bg-amber-50/80 border-amber-200"
              : "bg-emerald-50/80 border-emerald-200"
          }`}>
            <div className="flex items-start gap-3.5">
              <div className="mt-0.5">
                <WarningBadge level={student?.warningLevel || "green"} />
              </div>
              <div>
                <h3 className="text-sm font-bold text-slate-900" style={{ fontFamily: "Be Vietnam Pro, sans-serif" }}>
                  {student?.warningLevel === "red"
                    ? "Sinh viên thuộc diện Nguy cơ cao (Cảnh báo Đỏ)"
                    : student?.warningLevel === "yellow"
                    ? "Sinh viên thuộc diện Cần lưu ý theo dõi (Cảnh báo Vàng)"
                    : "Chưa ghi nhận tín hiệu cảnh báo theo tiêu chí hiện tại (Mức Xanh)"}
                </h3>
                <p className="text-xs text-slate-600 mt-0.5">
                  {student?.warningLevel === "red"
                    ? "Cần khẩn trương liên hệ, tư vấn lộ trình học tập và ghi nhận hành động hỗ trợ."
                    : student?.warningLevel === "yellow"
                    ? "Có dấu hiệu nợ học phần hoặc GPA giảm, cố vấn học tập cần theo dõi và đôn đốc sinh viên."
                    : "Tiến độ đào tạo và kết quả tích lũy đảm bảo theo khung chương trình đào tạo."}
                </p>
              </div>
            </div>

            <button
              type="button"
              onClick={() => setShowActionModal(true)}
              className="px-4 py-2 rounded-xl bg-[var(--color-primary)] hover:opacity-90 text-white text-xs font-semibold shadow-xs flex items-center gap-1.5 cursor-pointer whitespace-nowrap"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                <line x1="12" y1="5" x2="12" y2="19" />
                <line x1="5" y1="12" x2="19" y2="12" />
              </svg>
              <span>Ghi nhận can thiệp mới</span>
            </button>
          </div>

          <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-xs" aria-labelledby="student-unified-timeline">
            <div className="flex items-center justify-between gap-3">
              <div>
                <h3 id="student-unified-timeline" className="text-sm font-bold text-slate-900" style={{ fontFamily: "Be Vietnam Pro, sans-serif" }}>Dòng thời gian hồ sơ hợp nhất</h3>
                <p className="mt-0.5 text-xs text-slate-500">Cảnh báo, quyết định học vụ và hành động hỗ trợ theo cùng một trục thời gian.</p>
              </div>
              <span className="rounded-full bg-slate-100 px-2.5 py-1 text-[11px] font-semibold text-slate-600">{unifiedTimeline.length} sự kiện</span>
            </div>
            {!unifiedTimeline.length ? (
              <div className="mt-4 rounded-xl border border-dashed border-slate-200 bg-slate-50 py-8 text-center text-xs text-slate-500">Chưa có sự kiện để hiển thị.</div>
            ) : (
              <ol className="mt-5 space-y-0">
                {unifiedTimeline.map((item, index) => (
                  <li key={item.id} className="relative grid grid-cols-[18px_1fr] gap-3 pb-5 last:pb-0">
                    {index < unifiedTimeline.length - 1 && <span className="absolute left-[8px] top-4 h-full w-px bg-slate-200" aria-hidden="true" />}
                    <span className={`relative z-10 mt-1 h-[18px] w-[18px] rounded-full border-4 border-white shadow-sm ${item.color}`} aria-hidden="true" />
                    <div className="min-w-0 rounded-xl border border-slate-100 bg-slate-50/70 px-3.5 py-3">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div className="flex items-center gap-2">
                          <span className="rounded-md bg-white px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-slate-500 ring-1 ring-slate-200">{item.kind}</span>
                          <strong className="text-xs text-slate-900">{item.title}</strong>
                        </div>
                        <time className="font-mono text-[10px] text-slate-400">{new Date(item.date).toLocaleString("vi-VN")}</time>
                      </div>
                      <p className="mt-1.5 line-clamp-2 text-xs leading-relaxed text-slate-600">{item.detail}</p>
                    </div>
                  </li>
                ))}
              </ol>
            )}
          </section>

          {/* Metric Overview Grid */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div className="p-4 bg-white border border-slate-200 rounded-2xl shadow-xs">
              <span className="text-[10px] uppercase font-bold text-slate-400 block">Số lần bị cảnh báo</span>
              <span className="text-2xl font-bold font-mono text-slate-900 mt-1 block">
                {student?.warningHistory?.length || 0}
              </span>
              <span className="text-[11px] text-slate-500">Đợt quét hệ thống</span>
            </div>

            <div className="p-4 bg-white border border-slate-200 rounded-2xl shadow-xs">
              <span className="text-[10px] uppercase font-bold text-slate-400 block">Quyết định cảnh báo</span>
              <span className="text-2xl font-bold font-mono text-purple-700 mt-1 block">
                {student?.warningInfo?.academicWarningDecisions || 0}
              </span>
              <span className="text-[11px] text-slate-500">Văn bản ban hành</span>
            </div>

            <div className="p-4 bg-white border border-slate-200 rounded-2xl shadow-xs">
              <span className="text-[10px] uppercase font-bold text-slate-400 block">GPA kỳ gần nhất</span>
              <span className="text-2xl font-bold font-mono text-red-600 mt-1 block">
                {student?.warningInfo?.termGpa4 ? student.warningInfo.termGpa4.toFixed(2) : "—"}
              </span>
              <span className="text-[11px] text-slate-500">Thang điểm 4.0</span>
            </div>

            <div className="p-4 bg-white border border-slate-200 rounded-2xl shadow-xs">
              <span className="text-[10px] uppercase font-bold text-slate-400 block">Lượt đã can thiệp</span>
              <span className="text-2xl font-bold font-mono text-emerald-600 mt-1 block">
                {student?.warningActions?.length || 0}
              </span>
              <span className="text-[11px] text-slate-500">Buổi tư vấn / Gặp gỡ</span>
            </div>
          </div>

          {/* Detailed Reasons / Triggers */}
          <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-xs space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-bold text-slate-900" style={{ fontFamily: "Be Vietnam Pro, sans-serif" }}>
                Các nguyên nhân kích hoạt cảnh báo gần nhất
              </h3>
              <span className="text-xs text-slate-400">
                {student?.warningReasons?.length || 0} tiêu chí vi phạm
              </span>
            </div>

            {(!student?.warningReasons || student.warningReasons.length === 0) ? (
              <div className="py-8 text-center text-slate-400 text-xs bg-slate-50 rounded-xl border border-dashed border-slate-200">
                Sinh viên không có nguyên nhân cảnh báo vi phạm học vụ nào trong đợt quét gần nhất.
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {student.warningReasons.map((r: ApiData, idx: number) => (
                  <div key={idx} className="p-3.5 rounded-xl border border-red-200 bg-red-50/50 space-y-1">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-bold text-red-900 flex items-center gap-1.5">
                        <span className="w-2 h-2 rounded-full bg-red-600" />
                        {r.title || r.reasonCode}
                      </span>
                      <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-red-100 text-red-800">
                        {r.severity === "high" ? "Mức cao" : "Mức TB"}
                      </span>
                    </div>
                    <p className="text-xs text-slate-600 leading-relaxed">
                      {r.reasonCode === "LOW_TERM_GPA"
                        ? `Điểm GPA học kỳ của sinh viên chưa đạt chuẩn tối thiểu (đạt ${r.details?.gpa4 ?? student?.warningInfo?.termGpa4 ?? "—"}).`
                        : r.reasonCode === "LOW_CUMULATIVE_GPA"
                        ? `Điểm GPA tích lũy toàn khóa chưa đạt chuẩn (đạt ${r.details?.gpa4 ?? student?.warningInfo?.cumulativeGpa4 ?? "—"}).`
                        : r.reasonCode === "REGISTRATION_BEHIND"
                        ? "Sinh viên không đăng ký đủ số tín chỉ tối thiểu theo kế hoạch học kỳ."
                        : r.reasonCode === "PROGRAM_PROGRESS_BEHIND"
                        ? "Sinh viên bị chậm hoặc nợ các học phần tiên quyết theo tiến độ CTĐT."
                        : "Phát hiện tín hiệu bất thường trong hồ sơ học vụ."}
                    </p>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Warning Run History Table */}
          <div className="bg-white border border-slate-200 rounded-2xl shadow-xs overflow-hidden">
            <div className="p-4 border-b border-slate-100 bg-slate-50/60 flex items-center justify-between">
              <h3 className="text-sm font-bold text-slate-900" style={{ fontFamily: "Be Vietnam Pro, sans-serif" }}>
                Lịch sử các đợt quét cảnh báo của sinh viên
              </h3>
              <span className="text-xs text-slate-500 font-medium">
                {student?.warningHistory?.length || 0} đợt ghi nhận
              </span>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead>
                  <tr className="bg-slate-50 text-slate-500 font-semibold border-b border-slate-200 text-[11px] uppercase">
                    <th className="py-3 px-4">Thời điểm quét</th>
                    <th className="py-3 px-4">Mức độ rủi ro</th>
                    <th className="py-3 px-4">GPA Kỳ</th>
                    <th className="py-3 px-4">GPA Tích lũy</th>
                    <th className="py-3 px-4">Đăng ký HP</th>
                    <th className="py-3 px-4">Tiến độ CTĐT</th>
                    <th className="py-3 px-4 text-center">Quyết định VP</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {(!student?.warningHistory || student.warningHistory.length === 0) ? (
                    <tr>
                      <td colSpan={7} className="py-8 text-center text-slate-400">
                        Chưa có lịch sử cảnh báo học vụ cho sinh viên này.
                      </td>
                    </tr>
                  ) : (
                    student.warningHistory.map((w: ApiData) => (
                      <tr key={w.id} className="hover:bg-slate-50 transition-colors">
                        <td className="py-3 px-4 font-mono text-slate-600">
                          {w.createdAt ? new Date(w.createdAt).toLocaleString("vi-VN") : "—"}
                          <span className={`mt-1 block font-sans text-[10px] font-semibold ${w.isSummer ? "text-amber-700" : "text-slate-400"}`}>
                            {w.evaluationLabel || "Kết quả kỳ chính thức"}
                          </span>
                        </td>
                        <td className="py-3 px-4">
                          <span className={`px-2.5 py-0.5 rounded-full text-xs font-bold ${
                            w.maxSeverity === "high"
                              ? "bg-red-100 text-red-700 border border-red-200"
                              : w.maxSeverity === "medium"
                              ? "bg-amber-100 text-amber-800 border border-amber-200"
                              : "bg-emerald-100 text-emerald-800 border border-emerald-200"
                          }`}>
                            {w.runMode === "SUMMER_MONITORING"
                              ? (w.maxSeverity === "medium" ? "Tín hiệu cần hỗ trợ" : "Không có tín hiệu")
                              : w.maxSeverity === "high" ? "Nguy cơ cao (Đỏ)" : w.maxSeverity === "medium" ? "Cần lưu ý (Vàng)" : "Bình thường"}
                          </span>
                        </td>
                        <td className="py-3 px-4 font-mono font-bold text-red-600">
                          {w.termGpa4 ? w.termGpa4.toFixed(2) : "—"}
                        </td>
                        <td className="py-3 px-4 font-mono font-bold text-slate-800">
                          {w.cumulativeGpa4 ? w.cumulativeGpa4.toFixed(2) : "—"}
                        </td>
                        <td className="py-3 px-4 text-slate-600 capitalize">
                          {w.registrationStatus || "—"}
                        </td>
                        <td className="py-3 px-4 text-slate-600 capitalize">
                          {w.scheduleStatus || "—"}
                        </td>
                        <td className="py-3 px-4 text-center font-bold font-mono">
                          {w.academicWarningDecisions || 0}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>

          {/* Intervention Log & Timeline */}
          <div className="bg-white border border-slate-200 rounded-2xl shadow-xs overflow-hidden">
            <div className="p-4 border-b border-slate-100 bg-slate-50/60 flex items-center justify-between">
              <div>
                <h3 className="text-sm font-bold text-slate-900" style={{ fontFamily: "Be Vietnam Pro, sans-serif" }}>
                  Nhật ký Can thiệp & Hỗ trợ (Closed-loop Intervention Log)
                </h3>
                <p className="text-xs text-slate-500">Ghi nhận các buổi tư vấn, gặp gỡ sinh viên và phương án theo dõi</p>
              </div>
              {can("academic_warning.action.create") && (
                <button
                  type="button"
                  onClick={() => setShowActionModal(true)}
                  className="px-3.5 py-1.5 rounded-xl border border-slate-200 hover:bg-slate-100 text-slate-700 text-xs font-semibold shadow-xs flex items-center gap-1.5 cursor-pointer"
                >
                  <span>+ Thêm buổi tư vấn</span>
                </button>
              )}
            </div>

            <div className="p-5">
              {(!student?.warningActions || student.warningActions.length === 0) ? (
                <div className="py-8 text-center text-slate-400 text-xs bg-slate-50 rounded-xl border border-dashed border-slate-200">
                  Chưa có nhật ký can thiệp nào được ghi nhận cho sinh viên này.
                </div>
              ) : (
                <div className="space-y-4">
                  {student.warningActions.map((act: ApiData) => (
                    <div key={act.id} className="p-4 rounded-xl border border-slate-200 bg-slate-50/50 flex flex-col sm:flex-row items-start justify-between gap-3">
                      <div className="space-y-1 flex-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className={`px-2.5 py-0.5 rounded-md text-[11px] font-bold ${
                            act.actionType === "MEETING"
                              ? "bg-blue-100 text-blue-800"
                              : act.actionType === "NOTIFY_EMAIL"
                              ? "bg-orange-100 text-orange-800"
                              : act.actionType === "SCHEDULE_MEETING"
                              ? "bg-purple-100 text-purple-800"
                              : "bg-emerald-100 text-emerald-800"
                          }`}>
                            {act.actionType === "MEETING"
                              ? "Gặp trực tiếp"
                              : act.actionType === "NOTIFY_EMAIL"
                              ? "Đã gửi email (ghi nhận)"
                              : act.actionType === "SCHEDULE_MEETING"
                              ? "Lịch hẹn (ghi nhận)"
                              : "Tư vấn học vụ"}
                          </span>
                          <span className={`px-2 py-0.5 rounded-md text-[10px] font-bold border ${
                            act.status === "RESOLVED"
                              ? "bg-emerald-50 text-emerald-700 border-emerald-200"
                              : act.status === "ESCALATED"
                              ? "bg-red-50 text-red-700 border-red-200"
                              : "bg-amber-50 text-amber-700 border-amber-200"
                          }`}>
                            {act.status === "RESOLVED" ? "Đã giải quyết" : act.status === "ESCALATED" ? "Báo cấp trên (Escalated)" : "Đang theo dõi"}
                          </span>
                          <span className="text-[11px] text-slate-400">
                            • {act.actorName || "Cán bộ phụ trách"} • {act.createdAt ? new Date(act.createdAt).toLocaleString("vi-VN") : "—"}
                          </span>
                        </div>
                        <p className="text-xs text-slate-700 leading-relaxed pt-1 whitespace-pre-wrap">
                          {act.note}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* SlideOver Drawer: Toàn văn Quyết định */}
      <SlideOverDrawer
        isOpen={Boolean(selectedDecisionDetail)}
        onClose={() => setSelectedDecisionDetail(null)}
        title={selectedDecisionDetail?.decisionName || "Chi tiết Quyết định"}
        subtitle={`Số: ${selectedDecisionDetail?.decisionNumber || selectedDecisionDetail?.sDecisionNumber || "—"}`}
        width="xl"
      >
        {selectedDecisionDetail && (
          <div className="space-y-4 text-xs">
            <div className="p-3.5 bg-slate-50 rounded-xl border border-slate-200 grid grid-cols-2 gap-3">
              <div>
                <span className="text-slate-400 block text-[10px] uppercase font-bold">Ngày ban hành</span>
                <span className="font-bold text-slate-800">
                  {selectedDecisionDetail.signDate ? new Date(selectedDecisionDetail.signDate).toLocaleDateString("vi-VN") : "—"}
                </span>
              </div>
              <div>
                <span className="text-slate-400 block text-[10px] uppercase font-bold">Người ký</span>
                <span className="font-bold text-slate-800">{selectedDecisionDetail.signStaff || "Ban Giám hiệu"}</span>
              </div>
              <div>
                <span className="text-slate-400 block text-[10px] uppercase font-bold">Học kỳ áp dụng</span>
                <span className="font-bold text-slate-800">{selectedDecisionDetail.termCode || selectedDecisionDetail.sTermId || "—"}</span>
              </div>
              <div>
                <span className="text-slate-400 block text-[10px] uppercase font-bold">Phân loại</span>
                <span className={selectedDecisionDetail.isAcademicWarning ? "text-red-700 font-bold" : "text-slate-700 font-bold"}>
                  {selectedDecisionDetail.isAcademicWarning ? "⚠️ Cảnh báo học vụ" : "Khen thưởng / Khác"}
                </span>
              </div>
            </div>

            {selectedDecisionDetail.reason && (
              <div className="space-y-1">
                <span className="font-bold text-slate-800">Lý do ban hành / Căn cứ:</span>
                <p className="p-3 bg-amber-50/60 border border-amber-200/80 rounded-xl text-amber-900 leading-relaxed">
                  {selectedDecisionDetail.reason}
                </p>
              </div>
            )}

            <div className="space-y-1">
              <span className="font-bold text-slate-800">Toàn văn nội dung quyết định:</span>
              <div className="p-4 bg-white border border-slate-200 rounded-xl font-mono text-[11px] text-slate-700 leading-relaxed whitespace-pre-wrap max-h-80 overflow-y-auto">
                {selectedDecisionDetail.fullText || selectedDecisionDetail.sFullText || "Nội dung đang được cập nhật từ hệ thống hồ sơ đào tạo."}
              </div>
            </div>
          </div>
        )}
      </SlideOverDrawer>

      {/* Modal: Gán Chính sách Miễn giảm Học phí */}
      <Modal
        isOpen={showAddFeeModal}
        onClose={() => setShowAddFeeModal(false)}
        title="Gán Chính sách Miễn giảm Học phí"
        maxWidth="md"
      >
        <form
          onSubmit={async (e) => {
            e.preventDefault();
            try {
              setFeeSubmitting(true);
              const res = await apiFetch(`/api/v1/students/${studentId}/fee-policies`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(feeForm),
              });
              if (res.ok) {
                setShowAddFeeModal(false);
                alert("Đã gán chính sách thành công!");
                // Reload fee policies
                const fRes = await apiFetch(`/api/v1/students/${studentId}/fee-policies`);
                if (fRes.ok) {
                  const json = await fRes.json();
                  setFeePoliciesData(json.items || json || []);
                }
              } else {
                alert("Lỗi khi lưu chính sách học phí");
              }
            } catch (err) {
              console.error(err);
            } finally {
              setFeeSubmitting(false);
            }
          }}
          className="space-y-3"
        >
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">Đối tượng chính sách</label>
            <select
              value={feeForm.feeObjectDicId}
              onChange={(e) => {
                const val = e.target.value;
                const name = e.target.options[e.target.selectedIndex].text;
                const coef = val === "MIEN_100" ? 1.0 : val === "GIAM_70" ? 0.7 : 0.5;
                setFeeForm({ ...feeForm, feeObjectDicId: val, feeObjectName: name, coefficient: coef });
              }}
              className="w-full bg-white border border-slate-200 rounded-xl px-3 py-2 text-xs text-slate-800"
            >
              <option value="MIEN_100">Miễn 100% học phí (Đối tượng ưu tiên 1)</option>
              <option value="GIAM_70">Giảm 70% học phí (Con hộ nghèo, cận nghèo)</option>
              <option value="MIEN_GIAM_50">Giảm 50% học phí (Con cán bộ, diện khó khăn)</option>
            </select>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Hệ số miễn giảm</label>
              <input
                type="number"
                step="0.05"
                min="0"
                max="1"
                value={feeForm.coefficient}
                onChange={(e) => setFeeForm({ ...feeForm, coefficient: parseFloat(e.target.value) || 0 })}
                className="w-full bg-white border border-slate-200 rounded-xl px-3 py-2 text-xs font-mono font-bold text-slate-800"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Số quyết định</label>
              <input
                type="text"
                required
                value={feeForm.decisionNumber}
                onChange={(e) => setFeeForm({ ...feeForm, decisionNumber: e.target.value })}
                className="w-full bg-white border border-slate-200 rounded-xl px-3 py-2 text-xs font-mono text-slate-800"
                placeholder="VD: 104/QĐ-ĐHĐL"
              />
            </div>
          </div>

          <div className="rounded-xl border border-blue-200 bg-blue-50 p-3 text-xs text-blue-800">
            Chính sách sẽ được gắn với học kỳ hiện tại đã cấu hình trong hệ thống.
          </div>

          <div className="flex justify-end gap-2 pt-3 border-t border-slate-100">
            <button
              type="button"
              onClick={() => setShowAddFeeModal(false)}
              className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold rounded-xl"
            >
              Hủy
            </button>
            <button
              type="submit"
              disabled={feeSubmitting}
              className="px-5 py-2 bg-[var(--color-primary)] hover:opacity-90 text-white text-xs font-semibold rounded-xl disabled:opacity-50"
            >
              {feeSubmitting ? "Đang lưu..." : "Lưu chính sách"}
            </button>
          </div>
        </form>
      </Modal>

      {/* Modal: Ghi nhận Hành động Can thiệp Cảnh báo Sớm */}
      <Modal
        isOpen={showActionModal}
        onClose={() => setShowActionModal(false)}
        title="Ghi nhận Hành động Can thiệp & Hỗ trợ Sinh viên"
        description="Lưu vết trao đổi, tư vấn kế hoạch học tập hoặc chuyển cấp quản lý theo dõi"
        maxWidth="md"
      >
        <form
          onSubmit={async (e) => {
            e.preventDefault();
            if (!actionForm.note.trim()) {
              alert("Vui lòng nhập nội dung ghi chú can thiệp!");
              return;
            }
            try {
              setActionSubmitting(true);
              const res = await apiFetch("/api/v1/academic-warnings/actions", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                  studentId: student?.id || studentId,
                  actionType: actionForm.actionType,
                  note: actionForm.note.trim(),
                  status: actionForm.status,
                }),
              });

              if (res.ok) {
                setShowActionModal(false);
                setActionForm({
                  actionType: "COUNSELING",
                  note: "",
                  status: "IN_PROGRESS",
                });
                alert("Đã lưu nhật ký can thiệp học vụ thành công!");
                await reloadStudent();
              } else {
                alert("Lỗi khi lưu can thiệp");
              }
            } catch (err) {
              console.error(err);
              alert("Lỗi kết nối");
            } finally {
              setActionSubmitting(false);
            }
          }}
          className="space-y-4"
        >
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">Loại can thiệp</label>
            <select
              value={actionForm.actionType}
              onChange={(e) => setActionForm({ ...actionForm, actionType: e.target.value })}
              className="w-full bg-white border border-slate-200 rounded-xl px-3 py-2 text-xs text-slate-800"
            >
              <option value="COUNSELING">Tư vấn học vụ / Kế hoạch đăng ký</option>
              <option value="MEETING">Ghi nhận buổi gặp trực tiếp</option>
              <option value="NOTIFY_EMAIL">Ghi nhận email đã gửi</option>
              <option value="SCHEDULE_MEETING">Ghi nhận lịch hẹn đã thống nhất</option>
              <option value="OTHER">Hành động hỗ trợ khác</option>
            </select>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">Trạng thái theo dõi</label>
            <select
              value={actionForm.status}
              onChange={(e) => setActionForm({ ...actionForm, status: e.target.value })}
              className="w-full bg-white border border-slate-200 rounded-xl px-3 py-2 text-xs text-slate-800"
            >
              <option value="IN_PROGRESS">Đang theo dõi (Chưa cải thiện nhiều)</option>
              <option value="RESOLVED">Đã hoàn tất hành động hỗ trợ</option>
              <option value="ESCALATED">Đã chuyển cấp theo dõi</option>
            </select>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">Nội dung chi tiết buổi gặp / Phương án hỗ trợ</label>
            <textarea
              rows={4}
              required
              placeholder="VD: Đã trao đổi cùng sinh viên, hướng dẫn đăng ký trả nợ 2 môn Toán rời rạc và Lập trình nâng cao, giảm tải môn mới còn 14 tín chỉ..."
              value={actionForm.note}
              onChange={(e) => setActionForm({ ...actionForm, note: e.target.value })}
              className="w-full bg-white border border-slate-200 rounded-xl p-3 text-xs text-slate-800 focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)]"
            />
          </div>

          <div className="flex justify-end gap-2 pt-3 border-t border-slate-100">
            <button
              type="button"
              onClick={() => setShowActionModal(false)}
              className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold rounded-xl"
            >
              Hủy
            </button>
            <button
              type="submit"
              disabled={actionSubmitting}
              className="px-5 py-2 bg-[var(--color-primary)] hover:opacity-90 text-white text-xs font-semibold rounded-xl disabled:opacity-50"
            >
              {actionSubmitting ? "Đang lưu..." : "Lưu nhật ký can thiệp"}
            </button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
