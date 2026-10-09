"use client";

import React from "react";
import { LoadingIndicator, TableSkeletonRows } from "./LoadingState";

const identityColumns = new Set([
  "student", "studentCode", "studentId", "studentName", "fullName", "courseCode", "courseName",
]);

function columnAlignment<T>(column: Column<T>) {
  const alignment = identityColumns.has(column.key) ? "left" : column.align || "center";
  return `table-cell-${alignment} text-${alignment}`;
}

export interface Column<T> {
  key: string;
  title: React.ReactNode;
  width?: string | number;
  className?: string;
  align?: "left" | "center" | "right";
  render?: (value: ApiData, record: T, index: number) => React.ReactNode;
}
interface DataTableProps<T> {
  columns: Column<T>[];
  data: T[];
  rowKey: (record: T) => string | number;
  loading?: boolean;
  emptyText?: string;
  pagination?: {
    currentPage: number;
    pageSize: number;
    total: number;
    onChange: (page: number) => void;
  };
  rowClassName?: (record: T, index: number) => string;
  onRowClick?: (record: T) => void;
}

export default function DataTable<T extends Record<string, ApiData>>({
  columns,
  data,
  rowKey,
  loading = false,
  emptyText = "Không có dữ liệu hiển thị",
  pagination,
  rowClassName,
  onRowClick,
}: DataTableProps<T>) {
  const totalPages = pagination ? Math.ceil(pagination.total / pagination.pageSize) : 1;

  return (
    <div aria-busy={loading} className="bg-white border border-slate-200/90 rounded-2xl shadow-xs overflow-hidden">
      {loading && data.length > 0 && <div className="border-b border-slate-100 px-4 py-2"><LoadingIndicator label="Đang cập nhật danh sách…" /></div>}
      <div className="overflow-x-auto scrollbar-thin">
        <table className="w-full text-center text-xs border-collapse">
          <thead>
            <tr className="bg-slate-50/80 border-b border-slate-200 text-slate-500 font-semibold uppercase text-[11px] tracking-wider">
              {columns.map((col) => (
                <th
                  key={col.key}
                  style={{ width: col.width }}
                  className={`py-3.5 px-4 font-semibold ${columnAlignment(col)} ${col.className || ""}`}
                >
                  {col.title}
                </th>
              ))}
            </tr>
          </thead>
          <tbody inert={loading && data.length > 0} className="divide-y divide-slate-100">
            {loading && data.length === 0 ? (
              <TableSkeletonRows columns={columns.length} />
            ) : data.length === 0 ? (
              <tr>
                <td
                  colSpan={columns.length}
                  className="py-12 text-center text-slate-400 text-xs font-medium"
                >
                  <div className="flex flex-col items-center justify-center gap-2">
                    <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="text-slate-300">
                      <circle cx="12" cy="12" r="10" />
                      <line x1="12" y1="8" x2="12" y2="12" />
                      <line x1="12" y1="16" x2="12.01" y2="16" />
                    </svg>
                    <span>{emptyText}</span>
                  </div>
                </td>
              </tr>
            ) : (
              data.map((record, index) => {
                const key = rowKey(record);
                const extraClass = rowClassName ? rowClassName(record, index) : "";
                return (
                  <tr
                    key={key}
                    onClick={() => { if (!loading) onRowClick?.(record); }}
                    className={`hover:bg-slate-50/80 transition-colors ${
                      onRowClick ? "cursor-pointer" : ""
                    } ${extraClass}`}
                  >
                    {columns.map((col) => {
                      const val = record[col.key];
                      const rendered = col.render ? col.render(val, record, index) : val ?? "—";
                      return (
                        <td
                          key={`${key}-${col.key}`}
                          className={`py-3.5 px-4 text-slate-700 align-middle ${columnAlignment(col)} ${col.className || ""}`}
                        >
                          {rendered}
                        </td>
                      );
                    })}
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {/* Pagination Bar */}
      {pagination && pagination.total > 0 && (
        <div className="flex flex-col sm:flex-row items-center justify-between gap-3 px-4 py-3 bg-slate-50/60 border-t border-slate-100 text-xs text-slate-500">
          <div>
            Hiển thị{" "}
            <span className="font-semibold text-slate-700">
              {Math.min((pagination.currentPage - 1) * pagination.pageSize + 1, pagination.total)}
            </span>{" "}
            đến{" "}
            <span className="font-semibold text-slate-700">
              {Math.min(pagination.currentPage * pagination.pageSize, pagination.total)}
            </span>{" "}
            trong tổng số <span className="font-semibold text-slate-700">{pagination.total}</span> kết quả
          </div>

          <div className="flex items-center gap-1.5">
            <button
              type="button"
              disabled={pagination.currentPage <= 1}
              onClick={() => pagination.onChange(pagination.currentPage - 1)}
              className="px-2.5 py-1.5 rounded-lg border border-slate-200 bg-white hover:bg-slate-100 disabled:opacity-40 disabled:cursor-not-allowed text-slate-600 transition-colors cursor-pointer"
            >
              Trang trước
            </button>
            <span className="px-2 font-medium text-slate-700">
              {pagination.currentPage} / {totalPages || 1}
            </span>
            <button
              type="button"
              disabled={pagination.currentPage >= totalPages}
              onClick={() => pagination.onChange(pagination.currentPage + 1)}
              className="px-2.5 py-1.5 rounded-lg border border-slate-200 bg-white hover:bg-slate-100 disabled:opacity-40 disabled:cursor-not-allowed text-slate-600 transition-colors cursor-pointer"
            >
              Trang sau
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
