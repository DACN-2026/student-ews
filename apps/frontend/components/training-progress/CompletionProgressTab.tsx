"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  CircleAlert,
  ClipboardCheck,
  Database,
  Eye,
  FileCheck2,
  GraduationCap,
  Inbox,
  LoaderCircle,
  Play,
  RefreshCw,
  SearchCheck,
  XCircle,
} from "lucide-react";
import { apiFetch } from "@/lib/api-client";
import { useAuthStore } from "@/stores/authStore";
import Modal from "@/components/ui/Modal";
import SlideOverDrawer from "@/components/ui/SlideOverDrawer";
import { toast } from "@/components/ui/Toast";
import type {
  AcademicYearOption,
  CohortOption,
  CompletionPreview,
  CompletionRun,
  CompletionStudentResult,
  ListResponse,
  ProgramOption,
} from "./types";
import { formatDateTime, responseError, shortRunId } from "./types";

const PAGE_SIZE = 10;

interface CompletionStudentDetail extends CompletionStudentResult {
  studentUuid: string;
  className?: string | null;
  plans: Array<{
    id: string;
    planId: string;
    planVersion: number;
    curriculumSemesterNo: number;
    isDue: boolean;
    isPass: boolean;
    requiredElectiveCredits: number;
    passedElectiveCredits: number;
    missingElectiveCredits: number;
    pendingResultCourses: number;
    courses: Array<{
      courseId: string;
      courseCode: string;
      courseName: string;
      credits: number;
      requirementType: string;
      isRegistrationRequired: boolean;
      passed: boolean;
      pendingResult: boolean;
      evidenceAcademicYear?: string | null;
      evidenceTermCode?: string | null;
    }>;
  }>;
}

const completionStatus = {
  completed: { label: "Đủ yêu cầu học phần", className: "border-emerald-200 bg-emerald-50 text-emerald-700" },
  incomplete: { label: "Chưa đủ yêu cầu", className: "border-red-200 bg-red-50 text-red-700" },
  cannot_determine: { label: "Chưa thể kết luận", className: "border-slate-200 bg-slate-100 text-slate-700" },
} as const;

export default function CompletionProgressTab() {
  const { can } = useAuthStore();
  const [runs, setRuns] = useState<CompletionRun[]>([]);
  const [cohorts, setCohorts] = useState<CohortOption[]>([]);
  const [programs, setPrograms] = useState<ProgramOption[]>([]);
  const [years, setYears] = useState<AcademicYearOption[]>([]);
  const [cohortId, setCohortId] = useState("");
  const [programId, setProgramId] = useState("");
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");
  const [selectedRun, setSelectedRun] = useState<CompletionRun | null>(null);
  const [students, setStudents] = useState<CompletionStudentResult[]>([]);
  const [studentsLoading, setStudentsLoading] = useState(false);
  const [studentStatus, setStudentStatus] = useState("");
  const [selectedStudent, setSelectedStudent] = useState<CompletionStudentDetail | null>(null);
  const [studentLoading, setStudentLoading] = useState(false);
  const [showRunModal, setShowRunModal] = useState(false);
  const [runForm, setRunForm] = useState({ cohortId: "", programId: "", yearId: "", termId: "" });
  const [preview, setPreview] = useState<CompletionPreview | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [runLoading, setRunLoading] = useState(false);

  const queryString = useMemo(() => {
    const query = new URLSearchParams({ page: String(page), pageSize: String(PAGE_SIZE), evaluationMode: "standard" });
    if (cohortId) query.set("cohortId", cohortId);
    if (programId) query.set("trainingProgramId", programId);
    return query.toString();
  }, [cohortId, page, programId]);

  const loadCatalogs = useCallback(async () => {
    const [cohortResponse, programResponse, yearResponse] = await Promise.all([
      apiFetch("/api/v1/cohorts?pageSize=100"),
      apiFetch("/api/v1/training-programs?pageSize=100"),
      apiFetch("/api/v1/academic-years?pageSize=100"),
    ]);
    if (cohortResponse.ok) setCohorts(((await cohortResponse.json()) as ListResponse<CohortOption>).items || []);
    if (programResponse.ok) setPrograms(((await programResponse.json()) as ListResponse<ProgramOption>).items || []);
    if (yearResponse.ok) setYears(((await yearResponse.json()) as ListResponse<AcademicYearOption>).items || []);
  }, []);

  const loadRuns = useCallback(async (quiet = false) => {
    if (quiet) setRefreshing(true);
    else setLoading(true);
    setError("");
    try {
      const response = await apiFetch(`/api/v1/training-progress/completion-runs?${queryString}`);
      if (!response.ok) throw new Error(await responseError(response, "Không thể tải các đợt đánh giá hoàn thành."));
      const data = await response.json() as ListResponse<CompletionRun>;
      setRuns(data.items || []);
      setTotal(data.total || 0);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Không thể tải các đợt đánh giá hoàn thành.");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [queryString]);

  useEffect(() => {
    const timeout = window.setTimeout(() => {
      void loadCatalogs().catch(() => setError("Không thể tải danh mục đào tạo."));
    }, 0);
    return () => window.clearTimeout(timeout);
  }, [loadCatalogs]);

  useEffect(() => {
    const timeout = window.setTimeout(() => void loadRuns(), 0);
    return () => window.clearTimeout(timeout);
  }, [loadRuns]);

  const terms = years.find((year) => year.id === runForm.yearId)?.terms || [];
  const pageCount = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const visibleStudents = students.filter((student) => !studentStatus || student.programCompletionStatus === studentStatus);

  const openRun = async (run: CompletionRun) => {
    setSelectedRun(run);
    setStudents([]);
    setStudentStatus("");
    setStudentsLoading(true);
    try {
      const response = await apiFetch(`/api/v1/training-progress/completion-runs/${run.id}/students?pageSize=100`);
      if (!response.ok) throw new Error(await responseError(response, "Không thể tải danh sách sinh viên."));
      const data = await response.json() as ListResponse<CompletionStudentResult>;
      setStudents(data.items || []);
    } catch (cause) {
      toast.error(cause instanceof Error ? cause.message : "Không thể tải danh sách sinh viên.");
    } finally {
      setStudentsLoading(false);
    }
  };

  const openStudent = async (studentId: string) => {
    if (!selectedRun) return;
    setStudentLoading(true);
    try {
      const response = await apiFetch(`/api/v1/training-progress/completion-runs/${selectedRun.id}/students/${studentId}`);
      if (!response.ok) throw new Error(await responseError(response, "Không thể tải cây yêu cầu của sinh viên."));
      setSelectedStudent(await response.json() as CompletionStudentDetail);
    } catch (cause) {
      toast.error(cause instanceof Error ? cause.message : "Không thể tải cây yêu cầu của sinh viên.");
    } finally {
      setStudentLoading(false);
    }
  };

  const openCreateModal = () => {
    const defaultYear = years.find((year) => year.isCurrent) || years[0];
    const defaultTerm = defaultYear?.terms.find((term) => term.isCurrent) || defaultYear?.terms[0];
    setRunForm({
      cohortId: cohorts[0]?.id || "",
      programId: programs[0]?.id || "",
      yearId: defaultYear?.id || "",
      termId: defaultTerm?.id || "",
    });
    setPreview(null);
    setShowRunModal(true);
  };

  const requestPreview = async () => {
    if (!runForm.cohortId || !runForm.programId || !runForm.termId) return;
    setPreviewLoading(true);
    setPreview(null);
    try {
      const response = await apiFetch("/api/v1/training-progress/completion-runs/preview", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          cohortId: runForm.cohortId,
          trainingProgramId: runForm.programId,
          assessmentAcademicTermId: runForm.termId,
          evaluationMode: "standard",
        }),
      });
      if (!response.ok) throw new Error(await responseError(response, "Không thể kiểm tra dữ liệu trước khi chạy."));
      setPreview(await response.json() as CompletionPreview);
    } catch (cause) {
      toast.error(cause instanceof Error ? cause.message : "Không thể kiểm tra dữ liệu trước khi chạy.");
    } finally {
      setPreviewLoading(false);
    }
  };

  const createRun = async () => {
    if (!preview?.canRun) return;
    setRunLoading(true);
    try {
      const response = await apiFetch("/api/v1/training-progress/completion-runs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          cohortId: runForm.cohortId,
          trainingProgramId: runForm.programId,
          assessmentAcademicTermId: runForm.termId,
          evaluationMode: "standard",
        }),
      });
      if (!response.ok) throw new Error(await responseError(response, "Không thể chạy đánh giá hoàn thành."));
      toast.success("Đã hoàn tất đánh giá yêu cầu học phần CTĐT.");
      setShowRunModal(false);
      await loadRuns(true);
    } catch (cause) {
      toast.error(cause instanceof Error ? cause.message : "Không thể chạy đánh giá hoàn thành.");
    } finally {
      setRunLoading(false);
    }
  };

  return (
    <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm" aria-labelledby="completion-heading">
      <div className="flex flex-col gap-4 border-b border-slate-100 p-5 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h2 id="completion-heading" className="text-base font-bold text-slate-950">Hoàn thành chương trình đào tạo</h2>
          <p className="mt-1 max-w-3xl text-xs leading-5 text-slate-500">
            Đối chiếu bằng chứng học phần đã đạt với các kế hoạch hiện hành đến kỳ đánh giá. Kết quả chưa thay thế quyết định công nhận tốt nghiệp.
          </p>
        </div>
        <div className="flex gap-2">
          <button type="button" onClick={() => void loadRuns(true)} disabled={refreshing} className="inline-flex h-9 items-center gap-2 rounded-lg border border-slate-200 px-3 text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-60">
            <RefreshCw size={14} className={refreshing ? "animate-spin" : ""} />Làm mới
          </button>
          {can("progress.calculate") && (
            <button type="button" onClick={openCreateModal} className="inline-flex h-9 items-center gap-2 rounded-lg bg-[var(--color-primary)] px-3 text-xs font-bold text-slate-950 transition hover:brightness-95 active:translate-y-px">
              <Play size={14} />Chạy đánh giá
            </button>
          )}
        </div>
      </div>

      <div className="space-y-4 p-5">
        <div className="grid gap-3 md:grid-cols-[minmax(0,220px)_minmax(0,320px)_auto] md:items-end">
          <div>
            <label htmlFor="completion-cohort" className="mb-1.5 block text-xs font-semibold text-slate-700">Khóa</label>
            <select id="completion-cohort" value={cohortId} onChange={(event) => { setCohortId(event.target.value); setPage(1); }} className="h-10 w-full rounded-xl border border-slate-200 bg-white px-3 text-xs font-medium text-slate-800 outline-none focus:border-lime-600 focus:ring-2 focus:ring-lime-100">
              <option value="">Tất cả khóa</option>
              {cohorts.map((cohort) => <option key={cohort.id} value={cohort.id}>{cohort.cohortCode}</option>)}
            </select>
          </div>
          <div>
            <label htmlFor="completion-program" className="mb-1.5 block text-xs font-semibold text-slate-700">Chương trình đào tạo</label>
            <select id="completion-program" value={programId} onChange={(event) => { setProgramId(event.target.value); setPage(1); }} className="h-10 w-full rounded-xl border border-slate-200 bg-white px-3 text-xs font-medium text-slate-800 outline-none focus:border-lime-600 focus:ring-2 focus:ring-lime-100">
              <option value="">Tất cả chương trình</option>
              {programs.map((program) => <option key={program.id} value={program.id}>{program.programCode} - {program.programName}</option>)}
            </select>
          </div>
          <button type="button" onClick={() => { setCohortId(""); setProgramId(""); setPage(1); }} className="h-10 w-fit rounded-xl border border-slate-200 px-4 text-xs font-semibold text-slate-700 hover:bg-slate-50">Đặt lại</button>
        </div>
        <div className="flex flex-wrap gap-2 text-[11px] font-semibold">
          <span className="rounded-md border border-slate-200 bg-slate-100 px-2.5 py-1 text-slate-700">{total} đợt đánh giá</span>
          <span className="rounded-md border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-emerald-700">{runs.reduce((sum, run) => sum + run.completedStudents, 0)} SV đủ yêu cầu trong trang</span>
          <span className="rounded-md border border-amber-200 bg-amber-50 px-2.5 py-1 text-amber-700">{runs.reduce((sum, run) => sum + run.pendingResultStudents, 0)} SV chờ kết quả trong trang</span>
          <span className="rounded-md border border-red-200 bg-red-50 px-2.5 py-1 text-red-700">{runs.reduce((sum, run) => sum + run.incompleteStudents, 0)} SV chưa đủ trong trang</span>
        </div>
      </div>

      {error ? (
        <div className="m-5 mt-0 flex items-center justify-between gap-4 rounded-xl border border-red-200 bg-red-50 p-4 text-xs text-red-800" role="alert">
          <span className="flex items-center gap-2"><CircleAlert size={16} />{error}</span>
          <button type="button" onClick={() => void loadRuns()} className="font-bold underline underline-offset-2">Thử lại</button>
        </div>
      ) : (
        <div className="overflow-x-auto border-t border-slate-100">
          <table className="w-full min-w-[1040px] text-left text-xs">
            <thead className="bg-slate-50 text-[11px] font-semibold uppercase tracking-wide text-slate-500"><tr><th className="px-4 py-3">Mốc đánh giá</th><th className="px-4 py-3">Khóa / CTĐT</th><th className="px-4 py-3 text-center">Tổng SV</th><th className="px-4 py-3">Đủ yêu cầu</th><th className="px-4 py-3">Chờ kết quả</th><th className="px-4 py-3">Chưa đủ</th><th className="px-4 py-3">Trạng thái</th><th className="px-4 py-3 text-right">Chi tiết</th></tr></thead>
            <tbody className="divide-y divide-slate-100">
              {loading ? Array.from({ length: 5 }).map((_, index) => <tr key={index} className="animate-pulse">{Array.from({ length: 8 }).map((__, cell) => <td key={cell} className="px-4 py-4"><div className="h-4 rounded bg-slate-100" /></td>)}</tr>) : runs.length === 0 ? (
                <tr><td colSpan={8} className="px-4 py-16 text-center"><Inbox size={36} className="mx-auto text-slate-300" /><p className="mt-3 font-semibold text-slate-600">Chưa có đợt đánh giá phù hợp</p><p className="mt-1 text-slate-400">Chọn phạm vi và chạy preview trước khi tạo đợt đánh giá.</p></td></tr>
              ) : runs.map((run) => (
                <tr key={run.id} className="hover:bg-slate-50/70">
                  <td className="px-4 py-3.5"><p className="font-bold text-slate-900">{run.assessmentAcademicYear || "Chưa xác định"}</p><p className="mt-0.5 text-slate-500">{run.assessmentTermName || run.assessmentTermCode || "Chưa xác định"}</p><p className="mt-1 font-mono text-[10px] text-slate-400">{shortRunId(run.id)}</p></td>
                  <td className="px-4 py-3.5"><p className="font-semibold text-slate-800">{run.cohortCode || "Chưa có mã khóa"}</p><p className="mt-0.5 max-w-60 truncate text-slate-500">{run.programName || run.programCode || "Chưa có CTĐT"}</p></td>
                  <td className="px-4 py-3.5 text-center font-mono text-base font-bold text-slate-800">{run.totalStudents}</td>
                  <td className="px-4 py-3.5"><ResultCount value={run.completedStudents} total={run.totalStudents} tone="success" /></td>
                  <td className="px-4 py-3.5"><ResultCount value={run.pendingResultStudents} total={run.totalStudents} tone="warning" /></td>
                  <td className="px-4 py-3.5"><ResultCount value={run.incompleteStudents} total={run.totalStudents} tone="danger" /></td>
                  <td className="px-4 py-3.5"><span className={`rounded-md border px-2 py-1 text-[11px] font-semibold ${run.status === "completed" ? "border-emerald-200 bg-emerald-50 text-emerald-700" : run.status === "failed" ? "border-red-200 bg-red-50 text-red-700" : "border-blue-200 bg-blue-50 text-blue-700"}`}>{run.status === "completed" ? "Hoàn tất" : run.status === "failed" ? "Thất bại" : "Đang chạy"}</span></td>
                  <td className="px-4 py-3.5 text-right"><button type="button" onClick={() => void openRun(run)} className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-2 font-semibold text-slate-700 hover:bg-slate-50"><Eye size={14} />Xem kết quả</button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {!loading && !error && total > 0 && (
        <div className="flex items-center justify-between border-t border-slate-100 px-5 py-3 text-xs text-slate-500">
          <span>Trang {page}/{pageCount}, tổng {total} đợt đánh giá</span>
          <div className="flex gap-1"><button type="button" aria-label="Trang trước" disabled={page <= 1} onClick={() => setPage((value) => value - 1)} className="rounded-lg border border-slate-200 p-2 hover:bg-slate-50 disabled:opacity-40"><ChevronLeft size={14} /></button><button type="button" aria-label="Trang sau" disabled={page >= pageCount} onClick={() => setPage((value) => value + 1)} className="rounded-lg border border-slate-200 p-2 hover:bg-slate-50 disabled:opacity-40"><ChevronRight size={14} /></button></div>
        </div>
      )}

      <SlideOverDrawer isOpen={Boolean(selectedRun)} onClose={() => setSelectedRun(null)} title="Kết quả hoàn thành CTĐT" subtitle={selectedRun ? `${shortRunId(selectedRun.id)} | ${selectedRun.cohortCode || "Khóa"} | ${selectedRun.assessmentAcademicYear || "Năm học"} ${selectedRun.assessmentTermCode || ""}` : undefined} width="5xl">
        {selectedRun && (
          <div className="space-y-6">
            <div className="grid gap-3 sm:grid-cols-4">
              <Metric label="Tổng sinh viên" value={selectedRun.totalStudents} icon={<Database size={15} />} />
              <Metric label="Đủ yêu cầu" value={selectedRun.completedStudents} tone="success" icon={<CheckCircle2 size={15} />} />
              <Metric label="Chưa đủ" value={selectedRun.incompleteStudents} tone="danger" icon={<XCircle size={15} />} />
              <Metric label="Chưa kết luận" value={selectedRun.cannotDetermineStudents} tone="warning" icon={<AlertTriangle size={15} />} />
            </div>
            <div className="rounded-xl border border-blue-200 bg-blue-50 p-4 text-xs leading-5 text-blue-900">
              <strong>Phạm vi kết luận:</strong> {selectedRun.evaluationScope === "program_completion" ? "Đối chiếu toàn bộ kế hoạch đã mô hình hóa." : "Đối chiếu mốc tiến độ đến kỳ đánh giá."} Kết quả này chưa bao gồm đầy đủ điều kiện hành chính và không phải quyết định tốt nghiệp.
            </div>
            <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
              <div><h3 className="text-sm font-bold text-slate-900">Danh sách sinh viên</h3><p className="mt-0.5 text-xs text-slate-500">Run lúc {formatDateTime(selectedRun.startedAt)}</p></div>
              <select value={studentStatus} onChange={(event) => setStudentStatus(event.target.value)} className="h-9 rounded-lg border border-slate-200 bg-white px-3 text-xs font-medium text-slate-700"><option value="">Tất cả trạng thái</option><option value="completed">Đủ yêu cầu học phần</option><option value="incomplete">Chưa đủ yêu cầu</option><option value="cannot_determine">Chưa thể kết luận</option></select>
            </div>
            <div className="overflow-hidden rounded-xl border border-slate-200"><div className="max-h-[500px] overflow-auto"><table className="w-full min-w-[820px] text-left text-xs"><thead className="sticky top-0 bg-slate-50 text-[11px] uppercase text-slate-500"><tr><th className="px-3 py-2.5">Sinh viên</th><th className="px-3 py-2.5">Kết luận</th><th className="px-3 py-2.5">GPA tích lũy</th><th className="px-3 py-2.5">Yêu cầu học phần</th><th className="px-3 py-2.5 text-right">Chi tiết</th></tr></thead><tbody className="divide-y divide-slate-100">
              {studentsLoading ? <tr><td colSpan={5} className="px-3 py-12 text-center text-slate-500"><LoaderCircle size={16} className="mr-2 inline animate-spin" />Đang tải kết quả...</td></tr> : visibleStudents.length ? visibleStudents.map((student) => {
                const meta = completionStatus[student.programCompletionStatus as keyof typeof completionStatus] || completionStatus.cannot_determine;
                return <tr key={student.studentId} className="hover:bg-slate-50"><td className="px-3 py-3"><p className="font-semibold text-slate-900">{student.studentName}</p><p className="mt-0.5 font-mono text-[10px] text-slate-400">{student.studentId}{student.classId ? ` | ${student.classId}` : ""}</p></td><td className="px-3 py-3"><span className={`rounded-md border px-2 py-1 text-[10px] font-bold ${meta.className}`}>{meta.label}</span>{student.pendingResultCourses > 0 && <p className="mt-1 text-[10px] font-semibold text-amber-700">{student.pendingResultCourses} học phần chờ kết quả</p>}</td><td className="px-3 py-3 font-mono text-slate-700"><p>Hệ 4: <strong>{student.cumulativeGpa4 == null ? "Chưa có" : student.cumulativeGpa4.toFixed(2)}</strong></p><p className="mt-0.5 text-[10px] text-slate-400">Hệ 10: {student.cumulativeGpa10 == null ? "Chưa có" : student.cumulativeGpa10.toFixed(2)}</p></td><td className="px-3 py-3 text-slate-700"><p>{student.allPlansPassed}/{student.allPlansTotal} kế hoạch đạt</p>{(student.missingMandatoryCourses > 0 || student.missingElectiveCredits > 0) && <p className="mt-1 text-[10px] font-semibold text-red-700">Thiếu {student.missingMandatoryCourses} HP bắt buộc, {student.missingElectiveCredits} TC tự chọn</p>}</td><td className="px-3 py-3 text-right"><button type="button" onClick={() => void openStudent(student.studentId)} className="inline-flex items-center gap-1 rounded-lg px-2.5 py-1.5 font-semibold text-blue-700 hover:bg-blue-50"><FileCheck2 size={14} />Cây yêu cầu</button></td></tr>;
              }) : <tr><td colSpan={5} className="px-3 py-12 text-center text-slate-400">Không có sinh viên trong bộ lọc này.</td></tr>}
            </tbody></table></div></div>
          </div>
        )}
      </SlideOverDrawer>

      <Modal isOpen={showRunModal} onClose={() => !runLoading && setShowRunModal(false)} title="Chạy đánh giá hoàn thành CTĐT" description="Chọn phạm vi, kiểm tra dữ liệu rồi mới tạo run bất biến." maxWidth="2xl">
        <div className="space-y-5">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Khóa" id="new-completion-cohort"><select id="new-completion-cohort" value={runForm.cohortId} onChange={(event) => { setRunForm((value) => ({ ...value, cohortId: event.target.value })); setPreview(null); }} className="h-10 w-full rounded-xl border border-slate-200 bg-white px-3 text-xs font-medium"><option value="">Chọn khóa</option>{cohorts.map((cohort) => <option key={cohort.id} value={cohort.id}>{cohort.cohortCode} - {cohort.cohortName}</option>)}</select></Field>
            <Field label="Chương trình đào tạo" id="new-completion-program"><select id="new-completion-program" value={runForm.programId} onChange={(event) => { setRunForm((value) => ({ ...value, programId: event.target.value })); setPreview(null); }} className="h-10 w-full rounded-xl border border-slate-200 bg-white px-3 text-xs font-medium"><option value="">Chọn CTĐT</option>{programs.map((program) => <option key={program.id} value={program.id}>{program.programCode} - {program.programName}</option>)}</select></Field>
            <Field label="Năm học đánh giá" id="new-completion-year"><select id="new-completion-year" value={runForm.yearId} onChange={(event) => { const year = years.find((item) => item.id === event.target.value); setRunForm((value) => ({ ...value, yearId: event.target.value, termId: year?.terms[0]?.id || "" })); setPreview(null); }} className="h-10 w-full rounded-xl border border-slate-200 bg-white px-3 text-xs font-medium"><option value="">Chọn năm học</option>{years.map((year) => <option key={year.id} value={year.id}>{year.yearCode}</option>)}</select></Field>
            <Field label="Học kỳ đánh giá" id="new-completion-term"><select id="new-completion-term" value={runForm.termId} onChange={(event) => { setRunForm((value) => ({ ...value, termId: event.target.value })); setPreview(null); }} className="h-10 w-full rounded-xl border border-slate-200 bg-white px-3 text-xs font-medium"><option value="">Chọn học kỳ</option>{terms.map((term) => <option key={term.id} value={term.id}>{term.termName || term.termCode}{term.isSummer ? " (kỳ phụ)" : ""}</option>)}</select></Field>
          </div>
          <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
            <div className="flex items-center justify-between gap-3"><div><p className="text-xs font-bold text-slate-800">Kiểm tra điều kiện trước khi chạy</p><p className="mt-1 text-[11px] text-slate-500">Kiểm tra kế hoạch hiện hành, độ bao phủ và phạm vi sinh viên.</p></div><button type="button" onClick={() => void requestPreview()} disabled={previewLoading || !runForm.cohortId || !runForm.programId || !runForm.termId} className="inline-flex h-9 shrink-0 items-center gap-2 rounded-lg border border-slate-300 bg-white px-3 text-xs font-bold text-slate-700 hover:bg-slate-50 disabled:opacity-50">{previewLoading ? <LoaderCircle size={14} className="animate-spin" /> : <SearchCheck size={14} />}Kiểm tra</button></div>
            {preview && <PreviewPanel preview={preview} />}
          </div>
          <div className="flex justify-end gap-2 border-t border-slate-100 pt-4"><button type="button" onClick={() => setShowRunModal(false)} disabled={runLoading} className="rounded-xl px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100">Hủy</button><button type="button" onClick={() => void createRun()} disabled={runLoading || !preview?.canRun} className="inline-flex items-center gap-2 rounded-xl bg-[var(--color-primary)] px-4 py-2 text-xs font-bold text-slate-950 hover:brightness-95 disabled:cursor-not-allowed disabled:opacity-50">{runLoading ? <LoaderCircle size={14} className="animate-spin" /> : <Play size={14} />}Bắt đầu đánh giá</button></div>
        </div>
      </Modal>

      <Modal isOpen={Boolean(selectedStudent) || studentLoading} onClose={() => setSelectedStudent(null)} title={selectedStudent ? `Cây yêu cầu: ${selectedStudent.studentName}` : "Cây yêu cầu CTĐT"} description={selectedStudent ? `${selectedStudent.studentId} | ${selectedStudent.className || selectedStudent.classId || "Chưa có lớp"}` : "Đang tải dữ liệu"} maxWidth="4xl">
        {studentLoading && !selectedStudent ? <div className="flex min-h-48 items-center justify-center gap-2 text-sm text-slate-500"><LoaderCircle size={18} className="animate-spin" />Đang tải cây yêu cầu...</div> : selectedStudent && <RequirementTree student={selectedStudent} />}
      </Modal>
    </section>
  );
}

function ResultCount({ value, total, tone }: { value: number; total: number; tone: "success" | "warning" | "danger" }) {
  const colors = { success: "bg-emerald-50 text-emerald-700 border-emerald-200", warning: "bg-amber-50 text-amber-700 border-amber-200", danger: "bg-red-50 text-red-700 border-red-200" };
  return <span className={`inline-flex rounded-md border px-2 py-1 font-mono font-bold ${colors[tone]}`}>{value} <span className="ml-1 font-sans font-medium opacity-70">({total ? Math.round(value / total * 100) : 0}%)</span></span>;
}

function Metric({ label, value, tone = "neutral", icon }: { label: string; value: number; tone?: "neutral" | "success" | "danger" | "warning"; icon: React.ReactNode }) {
  const colors = { neutral: "border-slate-200 bg-white text-slate-900", success: "border-emerald-200 bg-emerald-50 text-emerald-800", danger: "border-red-200 bg-red-50 text-red-800", warning: "border-amber-200 bg-amber-50 text-amber-800" };
  return <div className={`rounded-xl border p-3 ${colors[tone]}`}><div className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wide opacity-70">{icon}{label}</div><div className="mt-1 font-mono text-xl font-bold">{value}</div></div>;
}

function Field({ label, id, children }: { label: string; id: string; children: React.ReactNode }) {
  return <div><label htmlFor={id} className="mb-1.5 block text-xs font-semibold text-slate-700">{label}</label>{children}</div>;
}

function PreviewPanel({ preview }: { preview: CompletionPreview }) {
  return <div className="mt-4 space-y-3 border-t border-slate-200 pt-4">
    {preview.summary && <div className="grid grid-cols-3 gap-2"><SmallStat label="Sinh viên" value={preview.summary.studentCount} /><SmallStat label="Kế hoạch đến hạn" value={preview.summary.duePlanCount} /><SmallStat label="Tổng kế hoạch" value={preview.summary.planCount} /></div>}
    {preview.canRun ? <p className="flex items-center gap-2 text-xs font-bold text-emerald-700"><CheckCircle2 size={15} />Dữ liệu đủ điều kiện tạo run.</p> : <p className="flex items-center gap-2 text-xs font-bold text-red-700"><XCircle size={15} />Chưa thể tạo run. Cần xử lý các lỗi bên dưới.</p>}
    {preview.blockers.map((item) => <div key={item.code} className="rounded-lg border border-red-200 bg-red-50 p-2.5 text-xs text-red-800"><strong>{item.code}:</strong> {item.message}</div>)}
    {preview.warnings.map((item) => <div key={item.code} className="rounded-lg border border-amber-200 bg-amber-50 p-2.5 text-xs text-amber-800"><strong>{item.code}:</strong> {item.message}{item.details?.length ? <ul className="mt-1 list-disc pl-4">{item.details.map((detail) => <li key={detail}>{detail}</li>)}</ul> : null}</div>)}
  </div>;
}

function SmallStat({ label, value }: { label: string; value: number }) {
  return <div className="rounded-lg border border-slate-200 bg-white p-2 text-center"><div className="font-mono text-base font-bold text-slate-900">{value}</div><div className="text-[10px] text-slate-500">{label}</div></div>;
}

function RequirementTree({ student }: { student: CompletionStudentDetail }) {
  return <div className="space-y-4">
    <div className="grid gap-3 sm:grid-cols-4"><Metric label="Kế hoạch đạt" value={student.allPlansPassed} icon={<ClipboardCheck size={15} />} /><Metric label="Kế hoạch tổng" value={student.allPlansTotal} icon={<Database size={15} />} /><Metric label="Thiếu bắt buộc" value={student.missingMandatoryCourses} tone={student.missingMandatoryCourses ? "danger" : "success"} icon={<FileCheck2 size={15} />} /><Metric label="Thiếu TC tự chọn" value={student.missingElectiveCredits} tone={student.missingElectiveCredits ? "warning" : "success"} icon={<GraduationCap size={15} />} /></div>
    <div className="space-y-3">{student.plans.map((plan) => <section key={plan.id} className="overflow-hidden rounded-xl border border-slate-200"><header className="flex items-center justify-between bg-slate-50 px-4 py-3"><div><h4 className="text-xs font-bold text-slate-900">Học kỳ lộ trình {plan.curriculumSemesterNo}</h4><p className="mt-0.5 text-[10px] text-slate-500">Snapshot v{plan.planVersion}{plan.isDue ? " | Đã đến hạn" : " | Chưa đến hạn"}</p></div><span className={`rounded-md border px-2 py-1 text-[10px] font-bold ${plan.isPass ? "border-emerald-200 bg-emerald-50 text-emerald-700" : "border-red-200 bg-red-50 text-red-700"}`}>{plan.isPass ? "Đạt yêu cầu" : "Chưa đạt"}</span></header><div className="divide-y divide-slate-100">{plan.courses.map((course) => <div key={course.courseId} className="grid gap-2 px-4 py-3 text-xs sm:grid-cols-[minmax(0,1fr)_100px_140px]"><div><p className="font-semibold text-slate-800">{course.courseCode} - {course.courseName}</p><p className="mt-0.5 text-[10px] text-slate-400">{course.credits} tín chỉ | {course.requirementType === "mandatory" ? "Bắt buộc" : "Tự chọn"}</p></div><div className="text-slate-500">{course.evidenceAcademicYear ? `${course.evidenceAcademicYear} ${course.evidenceTermCode || ""}` : "Chưa có bằng chứng"}</div><div>{course.pendingResult ? <span className="text-amber-700">Chờ kết quả</span> : course.passed ? <span className="inline-flex items-center gap-1 text-emerald-700"><CheckCircle2 size={13} />Đã đạt</span> : <span className="inline-flex items-center gap-1 text-red-700"><XCircle size={13} />Chưa đạt</span>}</div></div>)}</div></section>)}</div>
  </div>;
}
