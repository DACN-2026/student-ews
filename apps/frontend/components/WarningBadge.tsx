export type WarningLevel = "red" | "yellow" | "green" | "insufficient";

const config = {
  red: { label: "Nguy cơ cao", text: "text-red-700" },
  yellow: { label: "Cần lưu ý", text: "text-yellow-700" },
  green: { label: "Bình thường", text: "text-green-700" },
  insufficient: { label: "Chưa đủ dữ liệu", text: "text-slate-700" },
};

export default function WarningBadge({ level, short = false, label }: { level: WarningLevel; short?: boolean; label?: string }) {
  const c = config[level] || config.green;
  return (
    <span className={`text-xs font-medium ${c.text}`}>
      {short ? level.charAt(0).toUpperCase() + level.slice(1) : label || c.label}
    </span>
  );
}
