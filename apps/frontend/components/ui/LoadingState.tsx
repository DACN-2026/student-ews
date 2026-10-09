import type { CSSProperties } from "react";
import { LoaderCircle } from "lucide-react";

export function Skeleton({ className = "", style }: { className?: string; style?: CSSProperties }) {
  return <div aria-hidden="true" className={`loading-skeleton rounded-md ${className}`} style={style} />;
}
export function LoadingIndicator({ label = "Đang tải dữ liệu…", className = "" }: { label?: string; className?: string }) {
  return <span role="status" aria-live="polite" className={`inline-flex items-center gap-2 text-xs font-medium text-slate-500 ${className}`}><LoaderCircle size={15} aria-hidden="true" className="shrink-0 motion-safe:animate-spin text-lime-600" />{label}</span>;
}
export function TableSkeletonRows({ columns, rows = 5, label = "Đang tải danh sách…" }: { columns: number; rows?: number; label?: string }) {
  return <>{Array.from({ length: rows }, (_, row) => <tr key={row} aria-hidden={row > 0 || undefined}>
    {Array.from({ length: columns }, (_, column) => <td key={column} className="px-4 py-4">{row === 0 && column === 0 && <span role="status" className="sr-only">{label}</span>}<Skeleton className={`h-3.5 ${column === 0 ? "w-3/4" : "w-2/3"}`} /></td>)}
  </tr>)}</>;
}
export default function LoadingState({ variant = "table", label = "Đang tải dữ liệu…", rows = 5 }: { variant?: "page" | "table" | "detail" | "cards" | "chart"; label?: string; rows?: number }) {
  return <section role="status" aria-live="polite" aria-label={label} data-loading-state={variant} className="space-y-4">
    <span className="sr-only">{label}</span>
    {variant === "page" && <div className="space-y-3"><Skeleton className="h-6 w-56 max-w-full" /><Skeleton className="h-3 w-80 max-w-full" /><Skeleton className="h-10 w-full" /></div>}
    {(variant === "page" || variant === "detail" || variant === "cards") && <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">{Array.from({ length: 3 }, (_, i) => <div key={i} className="rounded-xl border border-slate-200 bg-white p-4 space-y-3"><Skeleton className="h-3 w-2/3" /><Skeleton className="h-6 w-1/3" /><Skeleton className="h-3 w-4/5" /></div>)}</div>}
    {variant === "chart" ? <div className="flex h-64 items-end justify-around gap-3 rounded-xl border border-slate-200 bg-white px-6 pt-10 pb-5">{[45, 70, 55, 85, 65, 95].map((height, i) => <Skeleton key={i} className="w-full" style={{ height: `${height}%` }} />)}</div> : variant !== "cards" && <div className="rounded-xl border border-slate-200 bg-white overflow-hidden"><div className="border-b border-slate-100 bg-slate-50 px-4 py-3"><Skeleton className="h-3.5 w-1/3" /></div>{Array.from({ length: rows }, (_, i) => <div key={i} className="flex gap-6 border-b border-slate-100 last:border-0 p-4"><Skeleton className="h-3.5 w-1/5" /><Skeleton className="h-3.5 flex-1" /><Skeleton className="h-3.5 w-1/6" /></div>)}</div>}
  </section>;
}
