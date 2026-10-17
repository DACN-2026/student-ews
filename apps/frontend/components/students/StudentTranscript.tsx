"use client";

import { useState } from "react";
import { displayedCourseOutcome, type DisplayGrade } from "@/lib/student-academic-display";

type Attempt = DisplayGrade & { id: string; courseCode: string; courseName: string; credits: number | null;
  academicYear?: string | null; termCode?: string | null; programCode?: string | null; recognitionCode?: string };
type TermSummary = { academicYear?: string; termCode?: string; programCode?: string; gpa4?: number | null; gpa10?: number | null; cumulativeGpa4?: number | null; creditsEarned?: number | null };
const number = (value: number | string | null | undefined) => value == null ? "—" : Number(value).toLocaleString("vi-VN", { maximumFractionDigits: 2 });
const labels = { passed: "Đạt", failed: "Không đạt", pending: "Chờ kết quả", unknown: "Chưa xác định kết quả" };
const periodKey = (row: { academicYear?: string | null; termCode?: string | null; programCode?: string | null }) => [row.academicYear, row.termCode, row.programCode].join("|");

export default function StudentTranscript({ grades, summaries, unscoped }: { grades: Attempt[]; summaries: TermSummary[]; unscoped: Attempt[] }) {
  const [period, setPeriod] = useState("all");
  const [query, setQuery] = useState("");
  const [outcome, setOutcome] = useState("all");
  const periods = [...new Map([...grades, ...summaries].map(row => [periodKey(row), row])).entries()].sort(([a], [b]) => a.localeCompare(b));
  const matches = (g: Attempt) => (outcome === "all" || displayedCourseOutcome(g) === outcome) && `${g.courseCode} ${g.courseName}`.toLocaleLowerCase("vi").includes(query.trim().toLocaleLowerCase("vi"));
  const visible = grades.filter(g => (period === "all" || periodKey(g) === period) && matches(g)).sort((a, b) => periodKey(a).localeCompare(periodKey(b)) || a.courseCode.localeCompare(b.courseCode));
  const table = (rows: Attempt[], undated = false) => <div className="overflow-x-auto"><table className="w-full text-left text-xs">
    <thead className="border-b bg-slate-50 text-slate-600"><tr>{["Kỳ học / CTĐT", "Mã học phần", "Tên học phần", "TC", "Hệ 10", "Hệ 4", "Điểm chữ / ký hiệu", "Kết quả"].map(label => <th key={label} scope="col" className="px-3 py-3">{label}</th>)}</tr></thead>
    <tbody className="divide-y divide-slate-100">{rows.map(g => <tr key={g.id}>
      <td className="px-3 py-3">{undated ? "Không ghi học kỳ gốc" : `${g.termCode || "Chưa xác định kỳ"} · ${g.academicYear || ""}`}<span className="block text-slate-500">{g.programCode}</span></td>
      <td className="px-3 py-3 font-mono">{g.courseCode}</td><td className="px-3 py-3">{g.courseName}</td><td className="px-3 py-3">{number(g.credits)}</td>
      <td className="px-3 py-3">{number(g.score10)}</td><td className="px-3 py-3">{number(g.score4)}</td>
      <td className="px-3 py-3 font-mono">{[g.specialCode || g.letterCode || g.letterGrade, g.recognitionCode].filter(Boolean).join(" · ") || "—"}</td>
      <td className={`px-3 py-3 ${displayedCourseOutcome(g) === "failed" ? "text-red-700" : displayedCourseOutcome(g) === "passed" ? "text-emerald-700" : "text-slate-600"}`}>{labels[displayedCourseOutcome(g)]}</td>
    </tr>)}{!rows.length && <tr><td colSpan={8} className="px-3 py-6 text-center text-slate-500">Không có lượt học phù hợp bộ lọc.</td></tr>}</tbody>
  </table></div>;
  return <section className="space-y-4 rounded-2xl border border-slate-200 bg-white p-5">
    <div><h3 className="font-semibold text-slate-900">Bảng điểm và lịch sử từng lần học</h3><p className="mt-1 text-xs leading-5 text-slate-500">Hiển thị theo học kỳ do Trường ghi nhận, gồm cả học lại, cải thiện, kỳ hè và môn ngoài chương trình đào tạo (CTĐT). Kết quả đạt ở kỳ sau không thay đổi lịch sử lần học trước. Điểm trung bình (GPA) dùng kết quả tổng hợp của Trường.</p></div>
    <div className="flex flex-wrap gap-3">
      <label className="text-xs">Kỳ học<select className="ml-2 rounded-lg border p-2" value={period} onChange={e => setPeriod(e.target.value)}><option value="all">Tất cả</option>{periods.map(([key, row]) => <option key={key} value={key}>{row.termCode} · {row.academicYear} · {row.programCode}</option>)}</select></label>
      <label className="text-xs">Kết quả<select className="ml-2 rounded-lg border p-2" value={outcome} onChange={e => setOutcome(e.target.value)}><option value="all">Tất cả</option>{Object.entries(labels).map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select></label>
      <label className="text-xs">Tìm học phần<input className="ml-2 rounded-lg border p-2" value={query} onChange={e => setQuery(e.target.value)} /></label>
    </div>
    {table(visible)}
    <p className="text-xs text-slate-500">{visible.length}/{grades.length} lượt học; không cộng các lần học thành tín chỉ tích lũy.</p>
    {summaries.filter(s => period === "all" || periodKey(s) === period).map(s => <div key={periodKey(s)} className="rounded-lg bg-slate-50 p-3 text-xs leading-6"><strong>{s.termCode} · {s.academicYear} · {s.programCode}</strong><p>GPA kỳ: {number(s.gpa4)} / 4 · {number(s.gpa10)} / 10; GPA tích lũy: {number(s.cumulativeGpa4)} / 4; tín chỉ đạt do Trường tổng hợp: {number(s.creditsEarned)}.</p></div>)}
    {unscoped.length > 0 && <details className="rounded-lg border border-blue-100 p-3"><summary className="cursor-pointer text-sm font-semibold">Học phần chuyển/miễn và kết quả không ghi học kỳ gốc ({unscoped.length})</summary><p className="my-3 text-xs leading-5 text-slate-500">Ký hiệu và kết quả được giữ theo ghi nhận của Trường. Thời điểm công nhận tín chỉ được trình bày trong Tiến độ học tập. Các kết quả này không được tự gán vào một học kỳ hoặc dùng để tính lại GPA.</p>{table(unscoped.filter(matches), true)}</details>}
  </section>;
}
