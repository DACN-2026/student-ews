"use client";

import LoadingState from "@/components/ui/LoadingState";

import TableAction from "@/components/ui/TableAction";
import { FileText } from "lucide-react";
import TextLabel from "@/components/ui/TextLabel";
import { useState, useEffect, useRef } from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ComposedChart, Scatter,
} from "recharts";
import WarningBadge from "@/components/WarningBadge";
import SlideOverDrawer from "@/components/ui/SlideOverDrawer";
import Modal from "@/components/ui/Modal";
import ForbiddenState from "@/components/ui/ForbiddenState";
import { useAuthStore } from "@/stores/authStore";
import { apiFetch } from "@/lib/api-client";
import { fetchAllApiItems, readApiJson, type ListResponse } from "@/lib/api-data";
import type { FeePolicyItem, FeePolicyType } from "@/lib/fee-policy-types";
import dynamic from "next/dynamic";
const StudentProgressDetail = dynamic(() => import("@/components/training-progress/StudentProgressDetail"), { loading: () => <LoadingState variant="detail" label="Đang tải bảng điểm…" /> });
const StudentWarningWorkspace = dynamic(() => import("@/components/warnings/StudentWarningWorkspace"), { loading: () => <LoadingState variant="detail" label="Đang tải chi tiết cảnh báo…" /> });
import { isMainConductTerm, studentWarningEndpoint } from "@/lib/student-warning-view";
import { latestTermWithGpa } from "@/lib/student-academic-display";

type ActiveTab = "overview" | "conduct" | "grades" | "decisions" | "fee_policies" | "registrations" | "warnings";

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
  const { can, status } = useAuthStore();
  const params = useParams();
  const studentId = params?.id as string;
  const router = useRouter();
  const requestedWarnings = useSearchParams().get("tab") === "warnings";

  const [activeTab, setActiveTab] = useState<ActiveTab>(requestedWarnings ? "warnings" : "overview");
  const [warningWorkspaceOpened, setWarningWorkspaceOpened] = useState(requestedWarnings);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [student, setStudent] = useState<ApiData>(null);
  const [warningData, setWarningData] = useState<ApiData>(null);
  const [activeInterventionCase, setActiveInterventionCase] = useState<ApiData>(null);
  const [gradesData, setGradesData] = useState<ApiData[]>([]);
  const [summariesData, setSummariesData] = useState<ApiData>(null);
  const [decisionsData, setDecisionsData] = useState<ApiData[]>([]);
  const [feePoliciesData, setFeePoliciesData] = useState<FeePolicyItem[]>([]);
  const [registrationsData, setRegistrationsData] = useState<ApiData[]>([]);
  const [dashboardData, setDashboardData] = useState<ApiData>(null);
  const [conductData, setConductData] = useState<ConductResponse | null>(null);
  const [loadIssues, setLoadIssues] = useState<string[]>([]);
  const [profileExporting, setProfileExporting] = useState(false);
  const [profileExportError, setProfileExportError] = useState("");

  // Decision & Fee Policy interactive states
  const [selectedDecisionDetail, setSelectedDecisionDetail] = useState<ApiData | null>(null);
  const [showAddFeeModal, setShowAddFeeModal] = useState(false);
  const [feeForm, setFeeForm] = useState({
    feeObjectDicId: "",
    coefficient: 0.5,
    decisionNumber: "",
  });
  const [feeSubmitting, setFeeSubmitting] = useState(false);
  const [feeTypes, setFeeTypes] = useState<FeePolicyType[]>([]);
  const [feeError, setFeeError] = useState("");
  const [feeTypesLoading, setFeeTypesLoading] = useState(false);
  const [profileRetry, setProfileRetry] = useState(0);
  const canReadGrades = can("grade.read");
  const canReadDecisions = can("decision.read");
  const canReadFees = can("fee_policy.read");
  const canReadProgress = can("progress.read");
  const tabPermission: Record<ActiveTab, string> = { overview: "student.read", conduct: "student.read", grades: "grade.read", decisions: "decision.read", fee_policies: "fee_policy.read", registrations: "progress.read", warnings: "academic_warning.read" };

  useEffect(() => {
    if (!showAddFeeModal || !can("fee_policy.create")) return;
    const controller = new AbortController();
    setFeeTypesLoading(true); setFeeError("");
    void apiFetch("/api/v1/fee-policy-types", { signal: controller.signal }).then(readApiJson<ListResponse<{ feeObjectDicId: string; feeObjectDicName: string; isActive: boolean }>>).then(data => {
      if (!controller.signal.aborted) setFeeTypes(data.items.filter(type => type.isActive));
    }).catch(error => { if (!controller.signal.aborted) setFeeError(error instanceof Error ? error.message : "Không thể tải đối tượng chính sách."); }).finally(() => { if (!controller.signal.aborted) setFeeTypesLoading(false); });
    return () => controller.abort();
  }, [showAddFeeModal, can]);

  const canReadWarnings = can("academic_warning.read");

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

  const loadedResources = useRef(new Set<string>());
  const [gradesLoaded, setGradesLoaded] = useState(false);
  const [tabLoading, setTabLoading] = useState(false);
  const [tabRetry, setTabRetry] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    loadedResources.current.clear();
    setWarningWorkspaceOpened(requestedWarnings);
    setActiveTab(requestedWarnings ? "warnings" : "overview");
    setStudent(null);
    setDashboardData(null);
    setWarningData(null);
    setActiveInterventionCase(null);
    setGradesData([]);
    setGradesLoaded(false);
    setSummariesData(null);
    setDecisionsData([]);
    setFeePoliciesData([]);
    setRegistrationsData([]);
    setConductData(null);
    setLoadIssues([]);
    setLoadError("");
    setLoading(true);
    async function loadProfile() {
      try {
        const response = await apiFetch(`/api/v1/students/${studentId}`, { signal: controller.signal });
        if (response.status === 403 || response.status === 404) { setLoadError(String(response.status)); return; }
        const data = await readApiJson(response);
        if (!controller.signal.aborted) setStudent(data);
      } catch (error) {
        if (!controller.signal.aborted) setLoadError(error instanceof Error ? error.message : "Không thể tải hồ sơ sinh viên. Vui lòng thử lại.");
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    }
    if (studentId) void loadProfile();
    return () => controller.abort();
  }, [studentId, requestedWarnings, profileRetry]);

  useEffect(() => {
    if (!student || student.id !== studentId && student.studentId !== studentId && student.studentCode !== studentId) return;
    const controller = new AbortController();
    const needed = activeTab === "overview"
      ? ["dashboard", "grades/summary", "decisions", "conduct", ...(canReadWarnings ? ["warnings"] : [])]
      : activeTab === "grades" ? ["grades", "grades/summary", "training-progress"]
      : activeTab === "warnings" ? (canReadWarnings ? ["warnings", "decisions", "grades/summary", "conduct"] : [])
      : [activeTab === "fee_policies" ? "fee-policies" : activeTab];
    const resourcePermission: Record<string, boolean> = { "grades/summary": canReadGrades, grades: canReadGrades, "training-progress": canReadGrades || canReadProgress, decisions: canReadDecisions, "fee-policies": canReadFees, registrations: canReadProgress, warnings: canReadWarnings };
    const missing = needed.filter(resource => resourcePermission[resource] !== false && !loadedResources.current.has(resource));
    if (!missing.length) { setTabLoading(false); return; }
    setTabLoading(true);
    setLoadIssues([]);
    async function loadResource(resource: string) {
      try {
        const endpoint = resource === "warnings"
          ? studentWarningEndpoint(studentId)
          : `/api/v1/students/${studentId}/${resource}${resource === "grades" ? "?view=attempts" : resource === "registrations" ? "?pageSize=100" : ""}`;
        const data = ["decisions", "fee-policies", "registrations"].includes(resource)
          ? { items: await fetchAllApiItems<ApiData>(`/api/v1/students/${studentId}/${resource}`, { signal: controller.signal }) }
          : await readApiJson<ApiData>(await apiFetch(endpoint, { signal: controller.signal }));
        if (controller.signal.aborted) return;
        if (resource === "dashboard") setDashboardData(data);
        if (resource === "grades/summary") setSummariesData(data);
        if (resource === "decisions") setDecisionsData(data.items || data || []);
        if (resource === "fee-policies") setFeePoliciesData(data.items || data || []);
        if (resource === "registrations") setRegistrationsData(data.items || data || []);
        if (resource === "conduct") setConductData(data);
        if (resource === "grades") {
          const gJson = data;
          const rawGrades = gJson.items || gJson || [];
          const cleanGrades = (Array.isArray(rawGrades) ? rawGrades : []).filter((g: ApiData) => {
            const code = String(g.courseCode || g.sCurriculumId || "").toUpperCase();
            const name = String(g.courseName || g.sCourseName || "").toLowerCase();
            return !code.startsWith("SHCD") && !name.includes("sinh hoạt công dân");
          });
          setGradesData(cleanGrades);
          setGradesLoaded(true);

        }
        if (resource === "warnings") {
          setWarningData(data);
          const studentCode = String(student.studentCode || student.studentId || "").trim();
          if (studentCode) {
            const interventionResponse = await apiFetch(`/api/v1/academic-warnings/interventions?search=${encodeURIComponent(studentCode)}&pageSize=100`, { signal: controller.signal });
            if (!interventionResponse.ok) throw new Error("Không thể tải hồ sơ can thiệp hiện tại");
            const interventions = await interventionResponse.json();
            if (controller.signal.aborted) return;
            const studentCases = (interventions.items || []).filter((item: ApiData) => item.student?.id === student.id);
            setActiveInterventionCase(studentCases.find((item: ApiData) =>
              item.student?.id === student.id && ["OPEN", "IN_PROGRESS", "ESCALATED", "REOPENED"].includes(item.interventionStatus),
            ) || studentCases[0] || null);
          }
        }
        loadedResources.current.add(resource);
      } catch (error) {
        if (!controller.signal.aborted) setLoadIssues((issues) => [...issues, error instanceof Error ? error.message : `Không thể tải ${resource}`]);
      }
    }
    void Promise.all(missing.map(loadResource)).finally(() => {
      if (!controller.signal.aborted) setTabLoading(false);
    });
    return () => controller.abort();
  }, [student, studentId, activeTab, canReadWarnings, canReadGrades, canReadDecisions, canReadFees, canReadProgress, tabRetry]);

  if (status !== "loading" && status !== "idle" && !can("student.read")) {
    return <ForbiddenState requiredPermission="student.read" />;
  }

  if (loadError === "403") {
    return <ForbiddenState requiredPermission="student.read" />;
  }

  if (loading) {
    return <div className="mx-auto max-w-7xl p-4 sm:p-6"><LoadingState variant="page" label={`Đang tải hồ sơ sinh viên ${studentId}…`} /></div>;
  }

  if (loadError && !["403", "404"].includes(loadError)) return <div role="alert" className="mx-auto max-w-3xl space-y-4 p-6"><p className="text-sm text-red-700">{loadError}</p><button type="button" onClick={() => setProfileRetry(value => value + 1)} className="rounded-lg border px-4 py-2 text-sm hover:bg-slate-50">Thử lại</button></div>;
  if (student && !can(tabPermission[activeTab])) return <ForbiddenState requiredPermission={tabPermission[activeTab]} />;

  if (!student) {
    return (
      <div className="p-12 text-center text-slate-500">
        <div className="text-base font-semibold text-slate-800">Không tìm thấy hồ sơ sinh viên</div>
        <p className="text-xs text-slate-400 mt-1">Sinh viên không tồn tại hoặc không thuộc phạm vi quản lý của tài khoản hiện tại.</p>
        <button
          onClick={() => router.push("/students")}
          className="mt-4 px-4 py-2 text-xs font-semibold text-emerald-700 bg-emerald-50 hover:bg-emerald-100 rounded-xl transition cursor-pointer"
        >
          Quay lại danh sách
        </button>
      </div>
    );
  }

  const sCode = student?.studentCode || student?.studentId || dashboardData?.student?.studentId || studentId;
  const sName = student?.fullName || dashboardData?.student?.fullName || "Sinh viên";
  const sClass = student?.className || student?.classStudentId || dashboardData?.student?.className || "Chưa phân lớp";
  const sProgram = student?.program?.code || student?.studyProgramId || dashboardData?.student?.programCode || "Chưa xác định";
  const cumulative = summariesData?.cumulative || student?.cumulative || dashboardData?.cumulative;
  const latestTerm = latestTermWithGpa<ApiData>(summariesData?.terms || [], student?.studyProgramId);
  const conductItems = (conductData?.items || []).filter(isMainConductTerm);
  const approvedConductCount = conductItems.filter(record => record.approval.code === "approved").length;
  const pendingConductCount = conductItems.filter(record => ["pending", "pending_evaluation"].includes(record.approval.code)).length;
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

  const warningPresentationLabel = warningData?.presentationState === "VERIFY_REQUIRED"
    ? "Chạm ngưỡng cần xác minh"
    : warningData?.presentationState === "HIGH_RISK"
      ? "Nguy cơ cao"
      : warningData?.presentationState === "MONITORING"
        ? "Cần theo dõi"
        : warningData?.presentationState === "INSUFFICIENT_DATA"
          ? "Chưa đủ dữ liệu"
          : warningData?.presentationState === "NORMAL" ? "Bình thường" : "Chưa tải được kết quả";

  return (
    <div className="p-4 sm:p-6 space-y-6 max-w-7xl mx-auto">
      {/* Top Breadcrumb / Back Button */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <button
          onClick={() => router.push("/students")}
          className="inline-flex items-center gap-1.5 text-xs font-semibold text-[var(--color-text-secondary)] hover:text-[var(--color-primary)] transition-colors cursor-pointer"
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <polyline points="15 18 9 12 15 6" />
          </svg>
          <span>Quay lại Danh sách Sinh viên</span>
        </button>

        {["report.export", "academic_warning.read", "grade.read", "decision.read", "progress.read"].every(permission => can(permission)) && (
          <button type="button" disabled={profileExporting} onClick={() => void exportProfilePdf()} className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-1.5 text-xs font-semibold text-emerald-800 transition hover:bg-emerald-100 disabled:opacity-50">
            {profileExporting ? "Đang tạo PDF..." : "Xuất PDF hồ sơ"}
          </button>
        )}
      </div>

      {/* Header Profile Card */}
      <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-2xl p-6 shadow-xs flex flex-col md:flex-row items-start md:items-center justify-between gap-5">
        <div className="flex min-w-0 items-center gap-4">
          <div
            className="w-16 h-16 rounded-2xl bg-gradient-to-tr from-[var(--color-primary)] to-lime-500 flex items-center justify-center text-white text-2xl font-black shadow-md flex-shrink-0"
            style={{ fontFamily: "Be Vietnam Pro, sans-serif" }}
          >
            {sName.split(" ").pop()?.charAt(0) || "S"}
          </div>
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-x-6 gap-y-2">
              <h1 className="text-2xl font-bold text-slate-900" style={{ fontFamily: "Be Vietnam Pro, sans-serif" }}>
                {sName}
              </h1>
              <span className="shrink-0 whitespace-nowrap text-xs font-medium text-slate-500">
                MSSV: <strong className="font-mono font-semibold text-slate-800">{sCode}</strong>
              </span>
              {student?.isInClass === false && <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-semibold text-slate-700">Đã rời lớp</span>}
              {student?.isSuspended && <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-semibold text-slate-700">Đang nghỉ học tạm thời</span>}
            </div>
            <div className="flex flex-wrap items-center gap-2 mt-1 text-xs text-slate-500 font-medium">
              <span>Lớp: <strong className="text-slate-800">{sClass}</strong></span>
              <span>•</span>
              <span>Chương trình: <strong className="text-slate-800">{student?.program?.name || sProgram}</strong></span>
              <span>•</span>
              <span>Khoa: <strong className="text-slate-800">{student?.program?.facultyCode || "Chưa cập nhật"}</strong></span>
            </div>
            {student?.isSuspended && <p className="mt-2 text-xs leading-5 text-slate-600">Hồ sơ được đóng băng từ HK{student.suspension?.fromTerm} ({student.suspension?.fromYear}), theo quyết định {student.suspension?.decisionNumber}. Kết quả học tập, rèn luyện và cảnh báo trước kỳ nghỉ được giữ để tra cứu. Chờ quyết định tiếp nhận học lại có hiệu lực.</p>}
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

      {/* Profile tabs */}
      <div className="flex items-center space-x-1 border-b border-[var(--color-border)] overflow-x-auto scrollbar-hide">
        {[
          { id: "overview", label: "1. Tổng quan" },
          { id: "conduct", label: "2. Rèn luyện" },
          { id: "grades", label: "3. Bảng điểm" },
          { id: "decisions", label: "4. Quyết định" },
          { id: "fee_policies", label: "5. Chính sách học phí" },
          { id: "registrations", label: "6. Đăng ký học phần" },
          ...(canReadWarnings ? [{
            id: "warnings",
            label: "7. Cảnh báo học vụ",
            badge: ["HIGH_RISK", "VERIFY_REQUIRED", "MONITORING"].includes(warningData?.presentationState) ? "!" : undefined,
          }] : []),
        ].filter(t => can(tabPermission[t.id as ActiveTab])).map((t) => (
          <button
            key={t.id}
            onClick={() => { setActiveTab(t.id as ActiveTab); if (t.id === "warnings") setWarningWorkspaceOpened(true); }}
            className={`flex items-center gap-2 px-4 py-3 text-xs sm:text-sm font-semibold border-b-2 transition-all cursor-pointer whitespace-nowrap ${
              activeTab === t.id
                ? "border-[var(--color-primary)] text-[var(--color-primary)] bg-[var(--color-primary-light)]/40 rounded-t-xl"
                : "border-transparent text-slate-500 hover:text-slate-900 hover:border-slate-300"
            }`}
            style={{ fontFamily: "Be Vietnam Pro, sans-serif" }}
          >
            <span>{t.label}</span>
            {t.badge && (
              <TextLabel className="text-red-700 text-[10px] font-bold leading-none">
                {t.badge}
              </TextLabel>
            )}
          </button>
        ))}
      </div>

      {tabLoading && <LoadingState variant="detail" label="Đang tải dữ liệu tab…" />}
      {loadIssues.length > 0 && !tabLoading && <button type="button" onClick={() => setTabRetry((value) => value + 1)} className="text-sm font-semibold text-emerald-700">Thử tải lại dữ liệu</button>}
      {/* Tab Content Areas */}

      {/* 1. Overview Tab */}
      {activeTab === "overview" && !tabLoading && (
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
                {student?.departure && <p className="text-xs leading-5 text-slate-500">{student.isInClass ? "Dự kiến rời lớp" : "Ngừng theo dõi"} từ HK{student.departure.fromTerm} {student.departure.fromYear}, theo quyết định trong hồ sơ. Dữ liệu lịch sử được giữ nguyên.</p>}
                <div className="flex justify-between py-2 border-b border-slate-100">
                  <span className="text-slate-500">Cố vấn học tập (GVCN):</span>
                  <span className="font-semibold text-slate-800 text-right">{student?.advisor?.fullName || "Chưa phân công"}</span>
                </div>
                {canReadWarnings && <div className="flex justify-between py-2 border-b border-slate-100">
                  <span className="text-slate-500">Mức độ cảnh báo:</span>
                  <WarningBadge level={warningData?.warningLevel || "insufficient"} label={warningPresentationLabel} />
                </div>}
                <div className="flex justify-between py-2 border-b border-slate-100">
                  <span className="text-slate-500">Tiến độ đào tạo:</span>
                  <span className="text-right"><span className="block font-semibold text-slate-800">{progressStatus}</span>{dashboardData?.completion?.assessmentTermCode && <span className="block text-[11px] text-slate-500">Đợt tiến độ chuẩn · {dashboardData.completion.assessmentTermCode} {dashboardData.completion.assessmentAcademicYear}</span>}</span>
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
                <TextLabel className="self-start text-[11px] font-mono font-semibold text-slate-700">
                  {sProgram}
                </TextLabel>
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
                    <dt className="text-slate-500">Kỳ gần nhất có GPA</dt>
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
                    <dt className="text-slate-500">Số lượt học phần đã tải</dt>
                    <dd className="font-mono font-bold text-slate-900">{gradesLoaded ? gradesData.length : "Chưa tải"}</dd>
                  </div>
                </dl>
              </div>
            </section>
          </div>
        </div>
      )}

      {activeTab === "conduct" && !tabLoading && (
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
                  <TextLabel className={`rounded-full   text-[11px] font-bold ${conductClassificationStyle(latestConduct.classification)}`}>
                    {latestConduct.classification}
                  </TextLabel>
                )}
                <TextLabel className={`rounded-full   text-[11px] font-bold ${conductApprovalStyle(latestConduct?.approval.code || "unknown")}`}>
                  {latestConduct?.approval.label || "Chưa có dữ liệu"}
                </TextLabel>
              </div>

              <dl className="mt-5 grid grid-cols-2 gap-3 border-t border-lime-200 pt-4 text-xs">
                <div>
                  <dt className="text-lime-700">Đã công nhận</dt>
                  <dd className="mt-1 font-mono text-xl font-black text-lime-900">{approvedConductCount}</dd>
                </div>
                <div>
                  <dt className="text-lime-700">Đang chờ</dt>
                  <dd className="mt-1 font-mono text-xl font-black text-lime-900">{pendingConductCount}</dd>
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
                    <th scope="col" className="px-4 py-3 text-center table-cell-center">Học kỳ</th>
                    <th scope="col" className="px-4 py-3 text-center table-cell-center">Tự đánh giá</th>
                    <th scope="col" className="px-4 py-3 text-center table-cell-center">Lớp</th>
                    <th scope="col" className="px-4 py-3 text-center table-cell-center">Khoa</th>
                    <th scope="col" className="px-4 py-3 text-center table-cell-center">Công nhận</th>
                    <th scope="col" className="px-4 py-3 text-center table-cell-center">Xếp loại</th>
                    <th scope="col" className="px-4 py-3 text-center table-cell-center">Trạng thái</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {conductItems.map((record) => (
                    <tr key={record.id} className="hover:bg-slate-50/70">
                      <td className="whitespace-nowrap px-4 py-3 font-semibold text-slate-800 text-center table-cell-center">
                        <div className="flex items-center gap-2 justify-center">
                          <span>{conductPeriodLabel(record)}</span>
                          {record.isSummer && <TextLabel className="text-[10px] font-bold text-amber-800">Hè</TextLabel>}
                        </div>
                        {record.isSummer && (
                          <p className="mt-1 max-w-sm whitespace-normal text-[10px] font-normal leading-4 text-amber-700">
                            {record.note}{record.evaluationTerm ? ` Đánh giá trong ${record.evaluationTerm.termCode} ${record.evaluationTerm.yearCode}.` : " Chưa xác định kỳ đánh giá tiếp theo."}
                          </p>
                        )}
                      </td>
                      <td className="px-4 py-3 font-mono text-center table-cell-center">{record.scores.self ?? "—"}</td>
                      <td className="px-4 py-3 font-mono text-center table-cell-center">{record.scores.class ?? "—"}</td>
                      <td className="px-4 py-3 font-mono text-center table-cell-center">{record.scores.department ?? "—"}</td>
                      <td className="px-4 py-3 font-mono font-bold text-slate-900 text-center table-cell-center">{record.isSummer ? record.scores.sourceTemporary ?? "—" : record.scores.recognized ?? "—"}</td>
                      <td className="px-4 py-3 text-center table-cell-center">
                        {record.classification ? (
                          <TextLabel className={`whitespace-nowrap    text-[10px] font-bold ${conductClassificationStyle(record.classification)}`}>
                            {record.classification}
                          </TextLabel>
                        ) : "—"}
                      </td>
                      <td className="px-4 py-3 text-center table-cell-center">
                        <TextLabel className={`whitespace-nowrap    text-[10px] font-bold ${conductApprovalStyle(record.approval.code)}`}>
                          {record.approval.label}
                        </TextLabel>
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

      {/* 3. Decisions Tab */}
      {activeTab === "decisions" && !tabLoading && (
        <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-2xl p-6 shadow-xs space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-base font-bold text-slate-900" style={{ fontFamily: "Be Vietnam Pro, sans-serif" }}>
                Danh sách Quyết định Quản lý
              </h3>
              <p className="text-xs text-slate-500">Các quyết định học vụ, khen thưởng, kỷ luật, cảnh báo học tập</p>
            </div>
            {can("decision.export") && <a
              href={`/api/v1/students/${studentId}/decisions/export`}
              download
              className="px-3.5 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold rounded-xl transition-colors"
            >
              Xuất danh sách →
            </a>}
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="bg-[var(--color-surface2)]/50 border-b border-[var(--color-border)] text-slate-500 uppercase font-semibold text-[11px]">
                  <th className="py-3 px-3 text-center table-cell-center">Số quyết định</th>
                  <th className="py-3 px-3 text-center table-cell-center">Tên quyết định</th>
                  <th className="py-3 px-3 text-center table-cell-center">Ngày ký</th>
                  <th className="py-3 px-3 text-center table-cell-center">Học kỳ áp dụng</th>
                  <th className="py-3 px-3 text-center table-cell-center">Cảnh báo học vụ</th>
                  <th className="py-3 px-3 text-center table-cell-center">Nội dung tóm tắt</th>
                  <th className="py-3 px-3 text-center table-cell-center">Thao tác</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {decisionsData.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="py-8 text-center text-slate-400">
                      {loadIssues.length ? "Chưa tải được quyết định. Hãy bấm Thử tải lại dữ liệu." : "Sinh viên chưa có quyết định xử lý hoặc khen thưởng nào."}
                    </td>
                  </tr>
                ) : (
                  decisionsData.map((d: ApiData) => (
                    <tr key={d.id} className="hover:bg-slate-50">
                      <td className="py-3 px-3 font-mono font-bold text-slate-800 text-center table-cell-center">{d.decisionNumber || d.sDecisionNumber}</td>
                      <td className="py-3 px-3 font-medium text-slate-900 text-center table-cell-center">{d.decisionName || d.sDecisionName}</td>
                      <td className="py-3 px-3 text-slate-500 text-center table-cell-center">{d.signDate ? new Date(d.signDate).toLocaleDateString("vi-VN") : "—"}</td>
                      <td className="py-3 px-3 text-slate-500 text-center table-cell-center">{d.termCode || d.sTermId}</td>
                      <td className="py-3 px-3 text-center table-cell-center">
                        {d.isAcademicWarning ? (
                          <TextLabel className="text-[11px] font-semibold text-red-700">
                            Cảnh báo học vụ
                          </TextLabel>
                        ) : (
                          <TextLabel className="text-[11px] font-semibold text-slate-600">
                            Khác
                          </TextLabel>
                        )}
                      </td>
                      <td className="py-3 px-3 text-slate-600 max-w-xs truncate text-center table-cell-center">{d.reason || d.fullText || d.sFullText || "—"}</td>
                      <td className="py-3 px-3 text-center table-cell-center">
                        <TableAction
                          icon={FileText}
                          label="Xem toàn văn quyết định"
                          tone="emerald"
                          onClick={() => setSelectedDecisionDetail(d)}
                        />
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
      {activeTab === "fee_policies" && !tabLoading && (
        <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-2xl p-6 shadow-xs space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-base font-bold text-slate-900" style={{ fontFamily: "Be Vietnam Pro, sans-serif" }}>
                Chính sách Miễn giảm Học phí
              </h3>
              <p className="text-xs text-slate-500">Đối tượng chính sách, tỷ lệ miễn giảm và quyết định phê duyệt</p>
            </div>
            <div className="flex items-center gap-2">
              {can("fee_policy.create") && <button
                type="button"
                onClick={() => { setFeeError(""); setFeeForm({ feeObjectDicId: "", coefficient: 0.5, decisionNumber: "" }); setShowAddFeeModal(true); }}
                className="px-3.5 py-2 bg-[var(--color-primary)] hover:bg-[var(--color-primary)]/90 text-white text-xs font-semibold rounded-xl transition-colors cursor-pointer shadow-xs"
              >
                + Gán chính sách mới
              </button>}
              {can("fee_policy.export") && <a
                href={`/api/v1/students/${studentId}/fee-policies/export`}
                download
                className="px-3.5 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold rounded-xl transition-colors"
              >
                Xuất danh sách →
              </a>}
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="bg-[var(--color-surface2)]/50 border-b border-[var(--color-border)] text-slate-500 uppercase font-semibold text-[11px]">
                  <th className="py-3 px-3 text-center table-cell-center">Tên chính sách / Đối tượng</th>
                  <th className="py-3 px-3 text-center table-cell-center">Tỷ lệ miễn giảm</th>
                  <th className="py-3 px-3 text-center table-cell-center">Năm học / Học kỳ</th>
                  <th className="py-3 px-3 text-center table-cell-center">Số quyết định</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {feePoliciesData.length === 0 ? (
                  <tr>
                    <td colSpan={4} className="py-8 text-center text-slate-400">
                      {loadIssues.length ? "Chưa tải được chính sách học phí. Hãy bấm Thử tải lại dữ liệu." : "Chưa có chính sách miễn giảm học phí được ghi nhận."}
                    </td>
                  </tr>
                ) : (
                  feePoliciesData.map((f) => (
                    <tr key={f.id} className="hover:bg-slate-50">
                      <td className="py-3 px-3 font-semibold text-slate-900 text-center table-cell-center">{f.policyName || "Chưa cập nhật"}</td>
                      <td className="py-3 px-3 text-center table-cell-center">
                        <TextLabel className="text-emerald-800 font-bold font-mono">
                          {f.coefficientPercent ?? "—"}%
                        </TextLabel>
                      </td>
                      <td className="py-3 px-3 text-slate-500 text-center table-cell-center">{f.termId || "Chưa rõ kỳ"} ({f.yearStudy || "Chưa rõ năm"})</td>
                      <td className="py-3 px-3 font-mono font-medium text-slate-800 text-center table-cell-center">{f.decisionNumber || "—"}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* 5. Registrations Tab */}
      {activeTab === "registrations" && !tabLoading && (
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
                  <th className="py-3 px-3 text-left table-cell-left">Mã học phần</th>
                  <th className="py-3 px-3 text-left table-cell-left">Tên môn học</th>
                  <th className="py-3 px-3 text-center table-cell-center">Số tín chỉ</th>
                  <th className="py-3 px-3 text-center table-cell-center">Năm học / Học kỳ</th>
                  <th className="py-3 px-3 text-center table-cell-center">Thời gian ghi nhận</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {registrationsData.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="py-8 text-center text-slate-400">
                      {loadIssues.length ? "Chưa tải được đăng ký học phần. Hãy bấm Thử tải lại dữ liệu." : "Chưa có dữ liệu đăng ký học phần cho sinh viên này."}
                    </td>
                  </tr>
                ) : (
                  registrationsData.map((r: ApiData) => (
                    <tr key={r.id} className="hover:bg-slate-50">
                      <td className="py-3 px-3 font-mono font-bold text-slate-800 text-left table-cell-left">{r.courseCode}</td>
                      <td className="py-3 px-3 font-medium text-slate-900 text-left table-cell-left">{r.courseName}</td>
                      <td className="py-3 px-3 font-mono text-center table-cell-center">{r.credits} TC</td>
                      <td className="py-3 px-3 text-slate-500 text-center table-cell-center">
                        {r.termCode && r.academicYear ? `${r.termCode} • ${r.academicYear}` : "—"}
                        {r.isSummer && <TextLabel className="ml-2 text-[10px] font-bold text-amber-800">Kỳ phụ</TextLabel>}
                      </td>
                      <td className="py-3 px-3 text-slate-400 text-center table-cell-center">{r.createdAt ? new Date(r.createdAt).toLocaleDateString("vi-VN") : "—"}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Semester transcript tab */}
      {activeTab === "grades" && !tabLoading && (
        <div className="space-y-5">
          {loadedResources.current.has("grades") && loadedResources.current.has("grades/summary") && <StudentProgressDetail
            key={studentId}
            studentId={studentId}
            showStudentHeader={false}
            view="transcript"
            termGradeSummaries={summariesData?.terms || []}
          />}
        </div>
      )}

      {/* 7. TAB CẢNH BÁO HỌC VỤ & CAN THIỆP */}
      {warningWorkspaceOpened && canReadWarnings && (
        <div hidden={activeTab !== "warnings" || tabLoading}>
        <StudentWarningWorkspace
          key={student.id}
          student={{ id: student.id, fullName: sName, studentCode: sCode, classCode: sClass, programCode: sProgram, isInClass: student.isInClass, isSuspended: student.isSuspended, suspension: student.suspension }}
          warning={warningData}
          interventionCase={activeInterventionCase}
          decisions={decisionsData}
          onUpdated={(warning, interventionCase) => { setWarningData(warning); setActiveInterventionCase(interventionCase); }}
        />
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
        busy={feeSubmitting}
        onClose={() => setShowAddFeeModal(false)}
        title="Gán Chính sách Miễn giảm Học phí"
        maxWidth="md"
      >
        {feeError && <p role="alert" className="mb-3 text-xs text-red-700">{feeError}</p>}
        <form
          onSubmit={async (e) => {
            e.preventDefault();
            if (feeSubmitting || !can("fee_policy.create")) return;
            try {
              setFeeError(""); setFeeSubmitting(true);
              const res = await apiFetch(`/api/v1/students/${studentId}/fee-policies`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(feeForm),
              });
              await readApiJson(res);
              if (res.ok) {
                setShowAddFeeModal(false);
                alert("Đã gán chính sách thành công!");
                // Reload fee policies
                setFeePoliciesData(await fetchAllApiItems<ApiData>(`/api/v1/students/${studentId}/fee-policies`));
              } else {
                alert("Lỗi khi lưu chính sách học phí");
              }
            } catch (err) {
              setFeeError(err instanceof Error ? err.message : "Không thể lưu chính sách. Vui lòng thử lại.");
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
              required
              disabled={feeTypesLoading}
              onChange={e => setFeeForm({ ...feeForm, feeObjectDicId: e.target.value })}
              className="w-full bg-white border border-slate-200 rounded-xl px-3 py-2 text-xs text-slate-800"
            >
              <option value="">{feeTypesLoading ? "Đang tải danh mục…" : "Chọn đối tượng chính sách"}</option>
              {feeTypes.map(type => <option key={type.feeObjectDicId} value={type.feeObjectDicId}>{type.feeObjectDicName}</option>)}
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
              disabled={feeSubmitting || feeTypesLoading || !feeForm.feeObjectDicId}
              className="px-5 py-2 bg-[var(--color-primary)] hover:opacity-90 text-white text-xs font-semibold rounded-xl disabled:opacity-50"
            >
              {feeSubmitting ? "Đang lưu..." : "Lưu chính sách"}
            </button>
          </div>
        </form>
      </Modal>

    </div>
  );
}
