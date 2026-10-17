type Registration = {
  courseCode?: string | null;
  courseName?: string | null;
  credits?: number | null;
  academicYear?: string | null;
  termCode?: string | null;
};

export default function PendingRegistrations({ items = [] }: { items?: Registration[] }) {
  if (!items.length) return null;
  return <section className="rounded-xl border border-sky-100 bg-sky-50/50 p-4 text-xs text-slate-700">
    <h3 className="font-semibold text-sky-900">Học phần đăng ký khác mã đang chờ kết quả ({items.length})</h3>
    <p className="mt-1 leading-5">Giữ mã và kỳ đăng ký thực tế, kể cả học ghép với khóa khác. Chưa cộng tín chỉ đạt hoặc quy đổi sang học phần trong CTĐT.</p>
    <ul className="mt-3 space-y-2">{items.map((item, index) => <li key={`${item.courseCode}:${item.academicYear}:${item.termCode}:${index}`}>
      <span className="font-mono font-semibold">{item.courseCode}</span> · {item.courseName} · {item.credits ?? "—"} TC · {item.termCode || "Chưa xác định kỳ"} ({item.academicYear || "Chưa xác định năm"}) · <span className="font-medium text-sky-800">Chờ kết quả</span>
    </li>)}</ul>
  </section>;
}
