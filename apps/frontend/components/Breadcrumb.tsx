"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const breadcrumbLabels: Record<string, string> = {
  dashboard: "Tổng quan",
  students: "Sinh viên",
  academics: "Đào tạo",
  rbac: "Phân quyền",
  classes: "Lớp học",
  "academic-years": "Năm học",
  terms: "Học kỳ",
  "training-programs": "Chương trình đào tạo",
  courses: "Học phần",
  "training-progress": "Tiến độ đào tạo",
  "graduation-forecast": "Dự kiến tốt nghiệp",
  "academic-warnings": "Cảnh báo học tập",
  plans: "Kế hoạch đào tạo",
  runs: "Đợt tính toán",
  grades: "Điểm học phần",
  decisions: "Quyết định",
  "fee-policies": "Chính sách học phí",
  reports: "Báo cáo",
  upload: "Nhập dữ liệu",
  settings: "Cấu hình",
};

function getLabel(segment: string, index: number, segments: string[]): string {
  if (breadcrumbLabels[segment]) {
    return breadcrumbLabels[segment];
  }

  // Handle dynamic parameters
  const prevSegment = segments[index - 1];
  if (prevSegment === "students") return "Hồ sơ sinh viên";
  if (prevSegment === "plans") return "Chi tiết kế hoạch";
  if (prevSegment === "runs") return "Kết quả đợt đánh giá";
  if (prevSegment === "training-programs") return "Chi tiết CTĐT";

  // If looks like UUID or ID, shorten it
  if (segment.length > 20) {
    return `${segment.substring(0, 8)}...`;
  }

  return segment;
}

export default function Breadcrumb() {
  const pathname = usePathname();
  const segments = pathname.split("/").filter(Boolean);

  // If on dashboard root or empty, show simple greeting
  if (segments.length === 0 || (segments.length === 1 && segments[0] === "dashboard")) {
    return (
      <nav aria-label="Breadcrumb" className="flex items-center text-xs text-[var(--color-text-secondary)]">
        <span className="flex items-center gap-1.5 font-medium text-[var(--color-text)]" style={{ fontFamily: "Be Vietnam Pro, sans-serif" }}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-[var(--color-primary)]">
            <path d="m3 9 9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>
            <polyline points="9 22 9 12 15 12 15 22"/>
          </svg>
          Tổng quan hệ thống
        </span>
      </nav>
    );
  }

  const items = segments.map((segment, index) => {
    const href = `/${segments.slice(0, index + 1).join("/")}`;
    const label = getLabel(segment, index, segments);
    const isLast = index === segments.length - 1;

    return {
      href,
      label,
      isLast,
    };
  });

  return (
    <nav aria-label="Breadcrumb" className="flex items-center space-x-1.5 text-xs text-[var(--color-text-secondary)] overflow-x-auto scrollbar-hide py-1">
      {/* Home link */}
      <Link
        href="/dashboard"
        className="flex items-center gap-1 text-[var(--color-text-secondary)] hover:text-[var(--color-primary)] transition-colors flex-shrink-0"
        title="Về Tổng quan"
      >
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="m3 9 9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>
          <polyline points="9 22 9 12 15 12 15 22"/>
        </svg>
        <span className="font-medium hidden sm:inline" style={{ fontFamily: "Be Vietnam Pro, sans-serif" }}>Tổng quan</span>
      </Link>

      {items.map((item) => (
        <div key={item.href} className="flex items-center space-x-1.5 flex-shrink-0">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-gray-400">
            <polyline points="9 18 15 12 9 6"/>
          </svg>

          {item.isLast ? (
            <span
              className="font-semibold text-[var(--color-text)] px-1.5 py-0.5 rounded bg-[var(--color-surface2)]"
              style={{ fontFamily: "Be Vietnam Pro, sans-serif" }}
            >
              {item.label}
            </span>
          ) : (
            <Link
              href={item.href}
              className="hover:text-[var(--color-primary)] transition-colors font-medium"
              style={{ fontFamily: "Be Vietnam Pro, sans-serif" }}
            >
              {item.label}
            </Link>
          )}
        </div>
      ))}
    </nav>
  );
}
