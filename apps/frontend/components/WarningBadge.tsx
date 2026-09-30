export type WarningLevel = "red" | "yellow" | "green" | "partial" | "insufficient";

const config = {
  red: { label: "Nguy cơ cao", bg: "bg-red-100", text: "text-red-700", border: "border-red-200", dot: "bg-red-500" },
  yellow: { label: "Cần lưu ý", bg: "bg-yellow-100", text: "text-yellow-700", border: "border-yellow-200", dot: "bg-yellow-500" },
  green: { label: "Bình thường", bg: "bg-green-100", text: "text-green-700", border: "border-green-200", dot: "bg-green-500" },
  partial: { label: "Đã đánh giá một phần", bg: "bg-blue-100", text: "text-blue-700", border: "border-blue-200", dot: "bg-blue-500" },
  insufficient: { label: "Chưa đủ dữ liệu", bg: "bg-slate-100", text: "text-slate-700", border: "border-slate-200", dot: "bg-slate-400" },
};

export default function WarningBadge({ level, short = false, label }: { level: WarningLevel; short?: boolean; label?: string }) {
  const c = config[level] || config.green;
  return (
    <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs font-medium border ${c.bg} ${c.text} ${c.border}`}>
      <span className={`w-1.5 h-1.5 rounded-full ${c.dot}`}></span>
      {short ? level.charAt(0).toUpperCase() + level.slice(1) : label || c.label}
    </span>
  );
}

export function WarningDot({ level }: { level: WarningLevel }) {
  const colors = { red: "bg-red-500", yellow: "bg-yellow-400", green: "bg-green-500", partial: "bg-blue-500", insufficient: "bg-slate-400" };
  return <span className={`inline-block w-2.5 h-2.5 rounded-full ${colors[level] || colors.green}`}></span>;
}
