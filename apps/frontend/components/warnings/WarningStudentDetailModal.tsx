"use client";

import LoadingState from "@/components/ui/LoadingState";

import { useEffect, useState } from "react";
import dynamic from "next/dynamic";
import Modal from "@/components/ui/Modal";
import { apiFetch } from "@/lib/api-client";
import type { AdditionalRequirement, Forecast, StudentGrade, StudentInfo } from "@/components/graduation/ForecastDetail";

const ForecastDetail = dynamic(() => import("@/components/graduation/ForecastDetail"), { loading: () => <LoadingState variant="detail" /> });
const StudentProgressDetail = dynamic(() => import("@/components/training-progress/StudentProgressDetail"), { loading: () => <LoadingState variant="detail" /> });
type GraduationDetail = { student: StudentInfo & { reasons?: { code: string; result: string; message: string }[] }; forecast: Forecast; grades?: StudentGrade[]; requirements?: AdditionalRequirement[] };
export type WarningStudentDetailTarget = { kind: "graduation" | "progress"; evaluationId?: string; warningResultId?: string; periodLabel?: string };

export default function WarningStudentDetailModal({ target, student, onClose }: {
  target: WarningStudentDetailTarget;
  student: { id: string; fullName: string | null; studentCode: string | null; classCode: string | null; programCode: string | null };
  onClose: () => void;
}) {
  const [detail, setDetail] = useState<GraduationDetail | null>(null);
  const [error, setError] = useState("");
  const [attempt, setAttempt] = useState(0);
  const [progressView, setProgressView] = useState<"assessment" | "current">("assessment");
  useEffect(() => {
    if (target.kind !== "graduation" || !target.evaluationId) return;
    const controller = new AbortController();
    void (async () => {
      try {
        const response = await apiFetch(`/api/v1/graduation-evaluations/${encodeURIComponent(target.evaluationId!)}/students/${encodeURIComponent(student.id)}`, { signal: controller.signal });
        if (!response.ok) throw new Error(response.status === 403 ? "Bạn chưa có quyền xem chi tiết Dự kiến tốt nghiệp của sinh viên này." : "Chưa tải được chi tiết Dự kiến tốt nghiệp.");
        const result: GraduationDetail = await response.json();
        if (!controller.signal.aborted) setDetail(result);
      } catch (failure) {
        if (!controller.signal.aborted) setError(failure instanceof Error ? failure.message : "Chưa tải được chi tiết.");
      }
    })();
    return () => controller.abort();
  }, [target.kind, target.evaluationId, student.id, attempt]);
  const grades = (detail?.grades || []).filter((grade) => !String(grade.courseCode || grade.sCurriculumId || "").toUpperCase().startsWith("SHCD") && !String(grade.courseName || grade.sCourseName || "").toLowerCase().includes("sinh hoạt công dân"));
  return <Modal isOpen onClose={onClose} maxWidth="6xl"
    title={`${target.kind === "graduation" ? "Dự kiến tốt nghiệp" : "Tiến độ học tập"} • ${student.fullName || student.studentCode}`}
    description={<div className="flex flex-wrap gap-x-2 gap-y-1"><strong className="font-mono">{student.studentCode}</strong><span>• Lớp: {student.classCode || "—"}</span><span>• CTĐT: {student.programCode || "—"}</span>{detail?.student.assessmentAcademicYear && <span>• Mốc xét tốt nghiệp: {detail.student.assessmentTermCode} · {detail.student.assessmentAcademicYear}</span>}</div>}
    footer={<button type="button" onClick={onClose} className="rounded-lg bg-slate-900 px-4 py-2 text-xs font-semibold text-white hover:bg-slate-800 cursor-pointer focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-lime-600">Đóng</button>}
  >
    {target.kind === "progress" ? <div className="space-y-4">
      {target.warningResultId && <div className="flex flex-wrap items-center gap-2 text-xs" aria-label="Mốc đối chiếu tiến độ"><button type="button" aria-pressed={progressView === "assessment"} onClick={() => setProgressView("assessment")} className="rounded-lg border border-slate-300 px-3 py-2 font-semibold aria-pressed:bg-slate-900 aria-pressed:text-white focus-visible:outline-2 focus-visible:outline-lime-600">Kỳ cảnh báo{target.periodLabel ? `: ${target.periodLabel}` : ""}</button><button type="button" aria-pressed={progressView === "current"} onClick={() => setProgressView("current")} className="rounded-lg border border-slate-300 px-3 py-2 font-semibold aria-pressed:bg-slate-900 aria-pressed:text-white focus-visible:outline-2 focus-visible:outline-lime-600">Tiến độ hiện tại</button></div>}
      <StudentProgressDetail key={`${student.id}:${progressView}:${target.warningResultId || ""}`} studentId={student.id} warningResultId={progressView === "assessment" ? target.warningResultId : undefined} showStudentHeader={false} />
    </div>
      : !target.evaluationId ? <p className="text-sm text-slate-600">Sinh viên chưa có kết quả Dự kiến tốt nghiệp để xem chi tiết.</p>
      : error ? <div role="alert" className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900"><p>{error}</p><button type="button" onClick={() => { setError(""); setAttempt((value) => value + 1); }} className="mt-2 font-semibold underline cursor-pointer">Thử lại</button></div>
      : !detail ? <LoadingState variant="detail" label="Đang tải chi tiết Dự kiến tốt nghiệp…" />
      : <ForecastDetail forecast={detail.forecast} student={detail.student} programCode={detail.student.sProgramCode || undefined} finalStatus={detail.student.finalStatus || undefined} reasons={detail.student.reasons || []} additionalRequirements={detail.requirements || []} grades={grades} initialTab="action" />}
  </Modal>;
}
