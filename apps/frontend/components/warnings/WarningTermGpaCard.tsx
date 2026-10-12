import type { ReactNode } from "react";
import type { TermGpaWarningGroup } from "@/lib/student-warning-view";
import { getLegalInfo } from "@/lib/warning-rule-details";

const gpa = (value: number | null) => value === null ? "Chưa có số liệu" : value.toFixed(2);
export default function WarningTermGpaCard({ group, children }: {
  group: TermGpaWarningGroup;
  children?: ReactNode;
}) {
  const { regulatoryBreached, observedValue, regulatoryThreshold, earlyThreshold } = group;
  const earlyTriggered = observedValue !== null && earlyThreshold !== null && observedValue < earlyThreshold;
  return <article aria-label="Điểm trung bình học kỳ (GPA)" className="space-y-3 rounded-xl border border-slate-200 bg-white p-3.5">
    <div className="flex flex-wrap items-start justify-between gap-2">
      <h4 className="text-xs font-semibold text-slate-900">Điểm trung bình học kỳ (GPA)</h4>
      <span className={`text-[10px] font-semibold ${regulatoryBreached ? "text-red-600" : "text-amber-700"}`}>{regulatoryBreached ? "Dưới ngưỡng học vụ" : earlyTriggered ? "Cần chú ý" : "Cần đối chiếu"}</span>
    </div>
    <p className="text-xs leading-relaxed text-slate-600">{observedValue === null ? "Chưa có GPA hợp lệ để đối chiếu các ngưỡng. Cần kiểm tra kết quả học kỳ đã lưu." : regulatoryBreached
      ? `GPA học kỳ ${gpa(observedValue)} đã dưới ngưỡng học vụ ${gpa(regulatoryThreshold)}. Ưu tiên hỗ trợ theo mức nguy cơ cao.`
      : earlyTriggered ? `GPA học kỳ ${gpa(observedValue)} dưới ngưỡng theo dõi sớm ${gpa(earlyThreshold)}; cần hỗ trợ cải thiện kết quả học tập.`
        : `GPA học kỳ ${gpa(observedValue)} được đối chiếu với các ngưỡng trong kết quả đã lưu. Cần xác minh trạng thái đánh giá.`}</p>
    <dl className="grid gap-2.5 text-xs sm:grid-cols-3">
      <div className={`min-w-0 rounded-lg border p-2.5 ${regulatoryBreached ? "border-red-100 bg-red-50/50" : "border-amber-100 bg-amber-50/50"}`}><dt className="text-[11px] text-slate-600">GPA học kỳ · thang 4</dt><dd className={`mt-1 font-mono text-base font-bold ${regulatoryBreached ? "text-red-800" : "text-amber-800"}`}>{gpa(observedValue)}</dd></div>
      <div className="min-w-0 rounded-lg border border-slate-200 bg-slate-50 p-2.5"><dt className="text-[11px] text-slate-600">Theo dõi sớm của hệ thống</dt><dd className="mt-1 font-mono text-sm font-bold text-slate-800">{earlyThreshold === null ? group.earlyReason ? "Chưa xác định" : "Chưa bật" : `< ${gpa(earlyThreshold)}`}</dd></div>
      <div className="min-w-0 rounded-lg border border-slate-200 bg-slate-50 p-2.5"><dt className="text-[11px] text-slate-600">Ngưỡng học vụ · Điều 18</dt><dd className="mt-1 font-mono text-sm font-bold text-slate-800">{regulatoryThreshold === null ? "Chưa xác định" : `< ${gpa(regulatoryThreshold)}`}</dd></div>
    </dl>
    {regulatoryBreached && earlyThreshold !== null && <p className="text-[11px] leading-5 text-slate-500">Cùng một GPA được đối chiếu với hai ngưỡng; hiển thị một lần và ưu tiên ngưỡng học vụ. Đây là thông tin đối chiếu, không thay thế quyết định xử lý học vụ.</p>}
    {children}
    <details className="border-t border-slate-100 pt-2.5 text-[11px]"><summary className="min-h-8 cursor-pointer font-medium text-lime-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-lime-600">Căn cứ và các ngưỡng đối chiếu</summary>
      <div className="mt-2 space-y-3 rounded-lg bg-slate-50 p-3">{[group.regulatoryReason, group.earlyReason].filter(reason => reason !== null).map(reason => {
        const info = getLegalInfo(reason);
        return <div key={reason.reasonCode}><p className="font-semibold text-slate-800">{info.title}</p><p className="mt-1.5 leading-relaxed text-slate-600">{info.summary}</p></div>;
      })}</div>
    </details>
  </article>;
}
