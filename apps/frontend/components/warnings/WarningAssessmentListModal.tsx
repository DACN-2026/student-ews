"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import Modal from "@/components/ui/Modal";
import DataTable, { type Column } from "@/components/ui/DataTable";
import LoadingState, { LoadingIndicator } from "@/components/ui/LoadingState";
import { apiFetch } from "@/lib/api-client";
import { useAuthStore } from "@/stores/authStore";

type StudentRow = {
  studentId: string;
  studentCode: string;
  studentName: string;
  classCode: string;
  hasPersistedResult: boolean;
  assessmentIssue: string | null;
  assessmentCategory: "APPROVED_LEAVE" | "LEFT_PROGRAM" | "BEFORE_ADMISSION" | "PENDING";
  assessmentFollowUp: string | null;
};
type StudentList = { items: StudentRow[]; total: number; page: number; pageSize: number };

function AssessmentReason({ row }: { row: StudentRow }) {
  const label = row.assessmentCategory === "APPROVED_LEAVE" ? "Nghỉ được chấp thuận"
    : row.assessmentCategory === "LEFT_PROGRAM" ? "Đã rời lớp"
    : row.assessmentCategory === "BEFORE_ADMISSION" ? "Trước kỳ nhập học" : null;
  return <div className="min-w-44 max-w-lg whitespace-normal leading-5">
    {label && <span className="mb-1 inline-block rounded-md bg-slate-100 px-2 py-0.5 text-[11px] font-semibold text-slate-700">{label}</span>}
    <p>{row.assessmentIssue}</p>
    <p className="mt-1 text-[11px] text-slate-500">{row.assessmentFollowUp || (row.hasPersistedResult ? "Cần bổ sung dữ liệu và đánh giá lại." : "Kiểm tra dữ liệu và phạm vi kỳ đánh giá; đánh giá lại sau khi xác minh.")}</p>
  </div>;
}

export default function WarningAssessmentListModal({ academicTermId, periodLabel, onClose }: { academicTermId: string; periodLabel: string; onClose: () => void }) {
  const [data, setData] = useState<StudentList | null>(null);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [retry, setRetry] = useState(0);
  const canReadStudent = useAuthStore((state) => state.can("student.read"));

  useEffect(() => {
    const timer = setTimeout(() => { setQuery(search.trim()); setPage(1); }, 300);
    return () => clearTimeout(timer);
  }, [search]);

  useEffect(() => {
    const controller = new AbortController();
    void (async () => {
      await Promise.resolve();
      if (controller.signal.aborted) return;
      setLoading(true);
      setError("");
      const params = new URLSearchParams({ academicTermId, assessmentStatus: "unassessed", page: String(page), pageSize: "20" });
      if (query) params.set("search", query);
      try {
        const response = await apiFetch(`/api/v1/reports/academic-warnings?${params}`, { signal: controller.signal });
        if (!response.ok) throw new Error(response.status === 403 ? "Bạn không có quyền xem danh sách này." : "Không thể tải danh sách sinh viên.");
        const nextData: StudentList = await response.json();
        if (!controller.signal.aborted) setData(nextData);
      } catch (cause) {
        if (!controller.signal.aborted) setError(cause instanceof Error ? cause.message : "Không thể tải danh sách sinh viên.");
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    })();
    return () => controller.abort();
  }, [academicTermId, page, query, retry]);

  const columns: Column<StudentRow>[] = [
    { key: "studentName", title: "Sinh viên", align: "left", render: (_, row) => <div className="min-w-36"><p className="font-semibold text-slate-900">{row.studentName}</p><p className="mt-1 font-mono text-slate-500">{row.studentCode} · {row.classCode}</p></div> },
    { key: "assessmentIssue", title: "Lý do không phân mức", align: "left", render: (_, row) => <AssessmentReason row={row} /> },
    ...(canReadStudent ? [{ key: "profile", title: "Chi tiết", render: (_: ApiData, row: StudentRow) => <Link href={`/students/${row.studentId}`} className="whitespace-nowrap font-semibold text-[var(--color-primary)] hover:underline">Hồ sơ sinh viên →</Link> } satisfies Column<StudentRow>] : []),
  ];

  return <Modal isOpen onClose={onClose} title="Sinh viên không phân mức trong kỳ" description={periodLabel} maxWidth="4xl" footer={<button type="button" onClick={onClose} className="rounded-xl bg-slate-900 px-4 py-2 text-xs font-semibold text-white cursor-pointer">Đóng</button>}>
    <div className="space-y-4">
      <p className="text-xs leading-5 text-slate-600">Danh sách gồm sinh viên nghỉ được chấp thuận hoặc ngoài phạm vi kỳ đánh giá, và sinh viên chưa đủ dữ liệu để phân mức. Xem lý do và hướng xử lý của từng hồ sơ. Nghỉ tạm thời / bảo lưu vẫn giữ sinh viên trong lớp; theo dõi thời hạn và việc trở lại học.</p>
      <div className="flex flex-wrap items-center justify-between gap-3"><p className="text-xs font-semibold text-slate-700">{data ? `${data.total} sinh viên${query ? " khớp tìm kiếm" : ""}` : "Đang tải danh sách…"}</p><input value={search} onChange={(event) => setSearch(event.target.value)} type="search" aria-label="Tìm sinh viên chưa được phân loại" placeholder="Tìm MSSV hoặc tên…" className="w-full sm:w-64 rounded-xl border border-slate-200 px-3 py-2 text-xs focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)]" /></div>
      {error ? <div role="alert" className="rounded-xl border border-red-200 bg-red-50 p-4 text-xs text-red-800">{error}<button type="button" onClick={() => setRetry((value) => value + 1)} className="ml-3 font-semibold underline cursor-pointer">Thử lại</button></div> : <>
        <div className="hidden sm:block"><DataTable columns={columns} data={data?.items || []} rowKey={(row) => row.studentId} loading={loading} emptyText="Không có sinh viên phù hợp." pagination={data ? { currentPage: page, pageSize: 20, total: data.total, onChange: setPage } : undefined} /></div>
        <div className="sm:hidden space-y-3" aria-busy={loading}>
          {loading && !data ? <LoadingState variant="cards" label="Đang tải danh sách sinh viên…" /> : <>
            {loading && <LoadingIndicator label="Đang cập nhật danh sách…" />}
            <ul inert={loading} className="space-y-3">{data?.items.map((row) => <li key={row.studentId} className="rounded-xl border border-slate-200 p-3 text-xs leading-5">
              <p className="font-semibold text-slate-900">{row.studentName}</p><p className="font-mono text-slate-500">{row.studentCode} · {row.classCode}</p>
              <div className="mt-2"><AssessmentReason row={row} /></div>
              {canReadStudent && <Link href={`/students/${row.studentId}`} className="mt-2 inline-block font-semibold text-[var(--color-primary)] hover:underline">Hồ sơ sinh viên →</Link>}
            </li>)}</ul>
            {data?.total === 0 && <p className="py-6 text-center text-xs text-slate-500">Không có sinh viên phù hợp.</p>}
            {data && data.total > 20 && <div className="flex items-center justify-between gap-2 text-xs"><button type="button" disabled={loading || page <= 1} onClick={() => setPage((value) => value - 1)} className="rounded-lg border border-slate-200 px-3 py-2 disabled:opacity-40 cursor-pointer">Trang trước</button><span>{page} / {Math.ceil(data.total / 20)}</span><button type="button" disabled={loading || page >= Math.ceil(data.total / 20)} onClick={() => setPage((value) => value + 1)} className="rounded-lg border border-slate-200 px-3 py-2 disabled:opacity-40 cursor-pointer">Trang sau</button></div>}
          </>}
        </div>
      </>}
    </div>
  </Modal>;
}
