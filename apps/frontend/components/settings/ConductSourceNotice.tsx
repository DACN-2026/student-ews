import { Check, Info } from "lucide-react";

export default function ConductSourceNotice({ available }: { available: boolean }) {
  const Icon = available ? Check : Info;
  return <div id="conduct-source-notice" className={`mb-3 flex items-start gap-2 rounded-lg px-3 py-3 text-xs leading-5 ${available ? "bg-lime-50 text-lime-900" : "bg-slate-50 text-slate-600"}`}>
    <Icon size={16} aria-hidden="true" className="mt-0.5 shrink-0" />
    <div>
      <p className="font-semibold">{available ? "Sử dụng điểm rèn luyện đã được công nhận" : "Chưa thể bật tiêu chí rèn luyện"}</p>
      <p className="mt-1">{available
        ? "Hệ thống sử dụng nguồn điểm đã được xác nhận. Bạn chỉ cần chọn tiêu chí và đặt ngưỡng điểm."
        : "Chưa xác định được điểm đã được công nhận từ nguồn dữ liệu đào tạo. Cần đơn vị quản lý rèn luyện xác nhận trước khi sử dụng. Bạn vẫn có thể cấu hình và lưu các tiêu chí học tập."}</p>
    </div>
  </div>;
}
