import { BookOpen, ExternalLink, Download, FileText } from "lucide-react";
import { REGULATION_DOCUMENT, warningNumber, type WarningConfiguration } from "@/lib/early-warning-configuration";

const documentLink = "inline-flex min-h-10 items-center justify-center gap-2 rounded-lg px-3 py-2 text-sm font-semibold transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-lime-700";

export function WarningRegulationDocument() {
  return <section aria-labelledby="regulation-document-title" className="flex flex-col gap-4 rounded-xl border border-slate-200 bg-white p-4 sm:flex-row sm:items-center sm:justify-between sm:p-5">
    <div className="flex items-start gap-3">
      <span className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-lime-50 text-lime-800"><FileText size={21} aria-hidden="true" /></span>
      <div><h2 id="regulation-document-title" className="text-sm font-semibold text-slate-900">Quy chế đào tạo trình độ đại học</h2>
        <p className="mt-1 text-xs leading-5 text-slate-600">Trường Đại học Đà Lạt · Quyết định số 600/QĐ-ĐHĐL</p>
        <p className="mt-1 text-xs text-slate-500">PDF · {REGULATION_DOCUMENT.pages} trang · {new Intl.NumberFormat("vi-VN", { maximumFractionDigits: 1 }).format(REGULATION_DOCUMENT.bytes / 1_048_576)} MB</p>
        <p className="mt-1 text-xs leading-5 text-slate-500">Điều 18 quy định ngưỡng cảnh báo học vụ. Mở tài liệu để đối chiếu khi đặt ngưỡng hỗ trợ sớm.</p>
      </div>
    </div>
    <div className="flex shrink-0 flex-wrap gap-2">
      <a href={REGULATION_DOCUMENT.articleHref} target="_blank" rel="noopener noreferrer" className={`${documentLink} border border-slate-200 text-slate-700 hover:bg-slate-50`} aria-label="Xem Điều 18 trong Quy chế đào tạo (PDF, mở tab mới)"><ExternalLink size={16} aria-hidden="true" />Xem Điều 18</a>
      <a href={REGULATION_DOCUMENT.href} download={REGULATION_DOCUMENT.downloadName} className={`${documentLink} border border-lime-200 bg-lime-50 text-lime-800 hover:bg-lime-100`}><Download size={16} aria-hidden="true" />Tải quy chế <span className="text-xs font-normal">PDF</span></a>
    </div>
  </section>;
}

export default function WarningPolicyReference({ regulatory }: { regulatory: WarningConfiguration["regulatory"] }) {
  return <aside className="space-y-5 xl:sticky xl:top-6 xl:self-start" aria-label="Hướng dẫn và ngưỡng quy chế">
    <section className="overflow-hidden rounded-xl border border-slate-200 bg-white" aria-labelledby="regulatory-thresholds-title">
      <div className="border-b border-slate-100 p-5"><p className="mb-2 flex items-center gap-2 text-xs font-semibold text-slate-500"><BookOpen size={15} aria-hidden="true" />Tài liệu đối chiếu</p>
        <h2 id="regulatory-thresholds-title" className="font-semibold text-slate-900">Ngưỡng học vụ trong quy chế</h2>
        <p className="mt-2 text-xs leading-5 text-slate-600">Các mốc theo Điều 18 được giữ cố định. Bạn đang cấu hình ngưỡng theo dõi sớm ở bên cạnh.</p>
      </div>
      <dl className="divide-y divide-slate-100 px-5 text-sm">
        <div className="py-4"><dt className="text-xs text-slate-500">Tỷ lệ tín chỉ không đạt trong kỳ</dt><dd className="mt-1 font-semibold tabular-nums text-slate-900">Trên {warningNumber(regulatory.failedCreditRatio.value * 100)}%</dd></div>
        <div className="py-4"><dt className="text-xs text-slate-500">Tín chỉ nợ tích lũy</dt><dd className="mt-1 font-semibold tabular-nums text-slate-900">Trên {warningNumber(regulatory.accumulatedDebtCredits.value)} tín chỉ</dd></div>
        <div className="py-4"><dt className="text-xs text-slate-500">GPA học kỳ · thang 4</dt><dd className="mt-2 space-y-1.5 text-xs text-slate-700"><div className="flex justify-between gap-3"><span>Kỳ đầu của khóa học</span><strong className="tabular-nums">Dưới {warningNumber(regulatory.termGpa.firstSemesterBelow)}</strong></div><div className="flex justify-between gap-3"><span>Các kỳ tiếp theo</span><strong className="tabular-nums">Dưới {warningNumber(regulatory.termGpa.subsequentSemesterBelow)}</strong></div></dd></div>
        <div className="py-4"><dt className="text-xs text-slate-500">GPA tích lũy · thang 4</dt><dd className="mt-2 space-y-1.5 text-xs text-slate-700">{regulatory.cumulativeGpaByYear.map((year, index, years) => <div key={year.yearLevel} className="flex justify-between gap-3"><span>{index === years.length - 1 ? `Trình độ năm ${year.yearLevel} trở lên` : `Trình độ năm ${year.yearLevel}`}</span><strong className="tabular-nums">Dưới {warningNumber(year.gpa4Below)}</strong></div>)}</dd></div>
      </dl>
      <div className="border-t border-slate-100 px-5 py-4"><a href={REGULATION_DOCUMENT.articleHref} target="_blank" rel="noopener noreferrer" className="inline-flex min-h-8 items-center gap-2 text-xs font-semibold text-lime-800 underline-offset-4 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-lime-700" aria-label="Đọc nội dung đầy đủ Điều 18 (PDF, mở tab mới)">Đọc nội dung đầy đủ Điều 18<ExternalLink size={13} aria-hidden="true" /></a><p className="mt-1 text-xs leading-5 text-slate-500">Trang 21–22 của quy chế (trang 25–26 trong PDF).</p></div>
    </section>
    <section className="px-1 text-xs leading-5 text-slate-600" aria-labelledby="assessment-principles-title"><h2 id="assessment-principles-title" className="mb-3 text-sm font-semibold text-slate-900">Cách hệ thống áp dụng</h2>
      <ul className="space-y-3"><li><strong className="font-medium text-slate-800">Xét học kỳ chính trước.</strong> GPA là điểm trung bình học tập; TC là tín chỉ. Trình độ năm học được xác định từ tín chỉ đã tích lũy.</li>
        <li><strong className="font-medium text-slate-800">Ưu tiên mức nguy cơ cao nhất.</strong> Một sinh viên có thể có nhiều tín hiệu cần hỗ trợ.</li>
        <li><strong className="font-medium text-slate-800">Phân biệt chờ kết quả, không đăng ký và vắng thi (VT).</strong> Giữ điểm trung bình (GPA) do Trường cung cấp. Với học phần VT, sử dụng kết quả đạt hoặc không đạt do Trường ghi nhận. Kỳ không đăng ký học phần không được tự coi là có GPA bằng 0.</li>
        <li><strong className="font-medium text-slate-800">Đối chiếu quyết định nghỉ học.</strong> Hồ sơ đang nghỉ tạm thời được đóng băng đến khi quyết định học lại có hiệu lực; hồ sơ đã rời lớp được giữ để tra cứu lịch sử.</li>
      </ul>
    </section>
  </aside>;
}
