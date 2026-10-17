import { ChevronRight, Clock3 } from "lucide-react";
import type { StudentTrainingProgressData } from "@/components/training-progress/types";

type Props = {
  label?: string;
  context?: StudentTrainingProgressData["assessmentContext"];
  pendingRegistrations?: NonNullable<StudentTrainingProgressData["courseStatus"]>["pendingRegistrations"];
  recognizedCourses?: NonNullable<StudentTrainingProgressData["reconciliation"]>["recognizedCourses"];
  historicalWarning?: boolean;
};

export default function TranscriptContext({ label = "Thông tin bổ sung cho bảng điểm", context, pendingRegistrations = [], recognizedCourses = [], historicalWarning = false }: Props) {
  if (!context && !pendingRegistrations.length && !recognizedCourses.length) return null;

  return <section aria-label={label} className="divide-y divide-slate-100 overflow-hidden rounded-xl border border-slate-200 bg-white text-xs text-slate-700">
    {context && <div className="bg-slate-50/70 px-4 py-2.5">
      <div className="flex flex-wrap items-center justify-between gap-x-5 gap-y-1.5 leading-5">
        <p><span className="text-slate-500">Mốc tính tiến độ: </span><span className="font-medium text-slate-800">{context.boundary === "END_OF_TERM" ? "Hết" : "Trước"} {context.termCode} ({context.academicYear})</span></p>
        <p className="text-slate-500">CTĐT <span className="font-medium text-slate-700">{context.programCode}</span></p>
      </div>
      {historicalWarning && <p className="mt-1 text-[11px] leading-5 text-slate-500">Kết quả học lại hoặc bù môn ở kỳ sau không được tính vào mốc cảnh báo này.</p>}
    </div>}

    {pendingRegistrations.length > 0 && <div className="space-y-2 px-4 py-3">
      <h3 className="flex items-center gap-2 font-semibold text-sky-800"><Clock3 size={14} aria-hidden="true" className="shrink-0" />Học phần khác mã đang chờ kết quả <span className="font-mono tabular-nums">({pendingRegistrations.length})</span></h3>
      <ul className="space-y-1.5 leading-5">{pendingRegistrations.map((item, index) => <li key={`${item.courseCode}:${item.academicYear}:${item.termCode}:${index}`} className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5 break-words">
        <span className="font-mono font-semibold text-slate-800">{item.courseCode}</span>
        {item.courseName && <span className="min-w-0 text-slate-800">{item.courseName}</span>}
        <span className="text-slate-500">· {item.credits ?? "—"} TC · {item.termCode || "Chưa xác định kỳ"} ({item.academicYear || "Chưa xác định năm"})</span>
      </li>)}</ul>
      <p className="text-[11px] leading-5 text-slate-500">Chưa cộng tín chỉ đã đạt hoặc quy đổi sang học phần trong chương trình đào tạo.</p>
    </div>}

    {recognizedCourses.length > 0 && <details className="group">
      <summary className="flex cursor-pointer list-none items-center gap-2 px-4 py-2.5 leading-5 transition-colors hover:bg-slate-50 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-lime-600 [&::-webkit-details-marker]:hidden">
        <ChevronRight size={14} aria-hidden="true" className="shrink-0 text-slate-400 transition-transform group-open:rotate-90 motion-reduce:transition-none" />
        <span className="min-w-0 flex-1 font-medium">Học phần chuyển/miễn đã được Trường công nhận <span className="font-mono tabular-nums">({recognizedCourses.length})</span></span>
        <span className="shrink-0 text-[11px] text-slate-500"><span className="group-open:hidden">Xem chi tiết</span><span className="hidden group-open:inline">Thu gọn</span></span>
      </summary>
      <div className="space-y-3 px-4 pb-3 pt-1">
        <p className="max-w-3xl text-[11px] leading-5 text-slate-500">Tín chỉ chuyển trường hoặc chuyển ngành được tính từ thời điểm tiếp nhận. Học phần được miễn (M) không ghi học kỳ gốc chỉ được xác nhận ở kết quả hiện tại, không dùng để thay đổi tiến độ các kỳ trước. GPA giữ theo kết quả của Trường.</p>
        <ul className="grid gap-2 sm:grid-cols-2">{recognizedCourses.map((course, index) => <li key={`${course.courseCode}:${course.academicYear}:${course.termCode}:${index}`} className="min-w-0 rounded-md bg-slate-50 px-3 py-2 leading-5">
          <p className="flex flex-wrap items-baseline gap-x-2"><span className="font-mono font-semibold text-slate-800">{course.courseCode}</span><span className="text-slate-500">{course.credits} TC</span></p>
          <p className="text-[11px] text-slate-500">{course.kind === "UNDATED_CERTIFICATE" ? "Được miễn học (M); không ghi học kỳ gốc" : `Công nhận từ ${course.termCode} (${course.academicYear})`}</p>
        </li>)}</ul>
      </div>
    </details>}
  </section>;
}
