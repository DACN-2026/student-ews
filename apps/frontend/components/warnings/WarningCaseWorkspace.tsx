"use client";

import { useEffect, useState, type RefObject } from "react";
import { apiFetch } from "@/lib/api-client";
import { studentWarningEndpoint } from "@/lib/student-warning-view";
import LoadingState from "@/components/ui/LoadingState";
import StudentWarningWorkspace, { type StudentInterventionCase, type StudentInterventionDetail, type StudentWarningData, type WarningWorkspaceDecision, type WarningWorkspaceStudent } from "./StudentWarningWorkspace";

type Resource = { studentId: string; warning: StudentWarningData; decisions: WarningWorkspaceDecision[] };
export default function WarningCaseWorkspace({ student, detail, onUpdated, onOverlayChange, overlayContainer, interventionRef }: {
  student: WarningWorkspaceStudent; detail: StudentInterventionDetail;
  onUpdated: (warning: StudentWarningData, interventionCase: StudentInterventionCase) => void;
  onOverlayChange: (open: boolean) => void; overlayContainer: () => HTMLElement | null;
  interventionRef: RefObject<HTMLElement | null>;
}) {
  const [resource, setResource] = useState<Resource | null>(null);
  const [failure, setFailure] = useState<{ studentId: string; message: string } | null>(null);
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    void (async () => {
      try {
        const [warningResponse, decisionResponse] = await Promise.all([
          apiFetch(studentWarningEndpoint(student.id), { signal: controller.signal }),
          apiFetch(`/api/v1/students/${encodeURIComponent(student.id)}/decisions`, { signal: controller.signal }),
        ]);
        if (!warningResponse.ok) throw new Error(warningResponse.status === 403 ? "Bạn chưa có quyền xem kết quả cảnh báo của sinh viên này." : "Chưa tải được kết quả cảnh báo chính thức mới nhất.");
        if (!decisionResponse.ok) throw new Error("Chưa tải được các quyết định học vụ của sinh viên.");
        const [warning, decisions] = await Promise.all([warningResponse.json(), decisionResponse.json()]);
        if (!controller.signal.aborted) { setResource({ studentId: student.id, warning, decisions: decisions.items || decisions }); setFailure(null); }
      } catch (error) {
        if (!controller.signal.aborted) setFailure({ studentId: student.id, message: error instanceof Error ? error.message : "Chưa tải được cảnh báo của sinh viên." });
      }
    })();
    return () => controller.abort();
  }, [student.id, attempt]);
  if (failure?.studentId === student.id) return <div role="alert" className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900"><p>{failure.message}</p><button type="button" onClick={() => { setFailure(null); setAttempt(value => value + 1); }} className="mt-3 text-xs font-semibold underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-lime-600">Thử lại</button></div>;
  if (resource?.studentId !== student.id) return <LoadingState variant="detail" label="Đang tải cùng dữ liệu với hồ sơ sinh viên…" />;
  return <StudentWarningWorkspace student={student} warning={resource.warning} decisions={resource.decisions} interventionCase={detail.case}
    initialDetail={detail} layout="drawer" onOverlayChange={onOverlayChange} overlayContainer={overlayContainer} interventionRef={interventionRef}
    onUpdated={(warning, interventionCase) => { setResource(previous => previous ? { ...previous, warning } : previous); onUpdated(warning, interventionCase); }} />;
}
