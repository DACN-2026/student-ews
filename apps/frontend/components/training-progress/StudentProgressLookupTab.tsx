"use client";

import React, { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  ArrowRight,
  ChevronLeft,
  ChevronRight,
  Filter,
  GraduationCap,
  RefreshCw,
  RotateCcw,
  Search,
  User,
  Users,
  X,
} from "lucide-react";
import { apiFetch } from "@/lib/api-client";
import StudentProgressDetail from "./StudentProgressDetail";
import type { CohortOption, ListResponse } from "./types";

interface ClassOption {
  id: string;
  classId: string;
  className: string;
  cohortId?: string | null;
  cohortCode?: string | null;
  studentCount?: number;
}

interface ProgramOption {
  id: string;
  programCode: string;
  programName: string;
}

interface StudentItem {
  id: string;
  studentId: string;
  studentCode?: string;
  fullName: string;
  className?: string | null;
  cohortCode?: string | null;
  programCode?: string | null;
}

export default function StudentProgressLookupTab() {
  // Filters State
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedCohort, setSelectedCohort] = useState("");
  const [selectedClass, setSelectedClass] = useState("");
  const [selectedProgram, setSelectedProgram] = useState("");

  // Pagination State
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(1);

  // Catalogs
  const [cohorts, setCohorts] = useState<CohortOption[]>([]);
  const [classes, setClasses] = useState<ClassOption[]>([]);
  const [programs, setPrograms] = useState<ProgramOption[]>([]);

  // Students list state
  const [students, setStudents] = useState<StudentItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [searched, setSearched] = useState(false);

  // Selected student for detail view
  const [selectedStudent, setSelectedStudent] = useState<StudentItem | null>(null);

  // Load catalogs on mount
  useEffect(() => {
    async function loadCatalogs() {
      try {
        const [cohortRes, classRes, programRes] = await Promise.all([
          apiFetch("/api/v1/cohorts?pageSize=50"),
          apiFetch("/api/v1/classes?pageSize=100"),
          apiFetch("/api/v1/training-programs?pageSize=100"),
        ]);

        if (cohortRes.ok) {
          const data: ListResponse<CohortOption> = await cohortRes.json();
          setCohorts(data.items || []);
        }
        if (classRes.ok) {
          const data = await classRes.json();
          setClasses(data.items || []);
        }
        if (programRes.ok) {
          const data = await programRes.json();
          setPrograms(data.items || []);
        }
      } catch (err) {
        console.error("Failed to load catalogs", err);
      }
    }
    void loadCatalogs();
  }, []);

  // Filter available classes when cohort changes
  const filteredClasses = useMemo(() => {
    if (!selectedCohort) return classes;
    return classes.filter((c) => c.cohortId === selectedCohort);
  }, [classes, selectedCohort]);

  // Main fetch function with explicit parameters
  const fetchStudents = useCallback(
    async (targetPage = page, targetSize = pageSize, term = searchTerm, cohort = selectedCohort, classId = selectedClass, program = selectedProgram) => {
      setLoading(true);
      try {
        const query = new URLSearchParams();
        query.set("page", String(targetPage));
        query.set("pageSize", String(targetSize));

        if (term.trim()) {
          query.set("search", term.trim());
        }
        if (cohort) {
          query.set("cohortId", cohort);
        }
        if (classId) {
          query.set("classStudentId", classId);
        }
        if (program) {
          query.set("studyProgramId", program);
        }

        const res = await apiFetch(`/api/v1/students?${query.toString()}`);
        if (res.ok) {
          const data = await res.json();
          const items: StudentItem[] = (data.items || []).map((s: Record<string, unknown>) => {
            const cohortObj = s.cohort as Record<string, unknown> | undefined;
            const progObj = s.program as Record<string, unknown> | undefined;
            return {
              id: String(s.id),
              studentId: String(s.studentCode || s.sStudentId || s.studentId || ""),
              fullName: String(s.fullName || s.sFullName || ""),
              className: s.className ? String(s.className) : s.classId ? String(s.classId) : s.sClassStudentId ? String(s.sClassStudentId) : null,
              cohortCode: s.cohortCode ? String(s.cohortCode) : cohortObj?.sCohortCode ? String(cohortObj.sCohortCode) : null,
              programCode: s.studyProgramId ? String(s.studyProgramId) : s.programCode ? String(s.programCode) : progObj?.sProgramCode ? String(progObj.sProgramCode) : null,
            };
          });

          setStudents(items);
          setTotal(Number(data.total) || items.length);
          setTotalPages(Number(data.totalPages) || Math.ceil((Number(data.total) || items.length) / targetSize) || 1);
          setPage(targetPage);

          // If exact match search returns 1 result and user hasn't selected yet, auto select
          if (items.length === 1 && term.trim() && !selectedStudent) {
            setSelectedStudent(items[0]);
          }
        } else {
          setStudents([]);
          setTotal(0);
          setTotalPages(1);
        }
      } catch (err) {
        console.error("Fetch students error", err);
        setStudents([]);
        setTotal(0);
        setTotalPages(1);
      } finally {
        setLoading(false);
      }
    },
    [page, pageSize, searchTerm, selectedCohort, selectedClass, selectedProgram, selectedStudent]
  );

  // Initial load
  useEffect(() => {
    void fetchStudents(1, pageSize, "", "", "", "");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setSearched(true);
    void fetchStudents(1, pageSize, searchTerm, selectedCohort, selectedClass, selectedProgram);
  };

  const handleResetFilters = () => {
    setSearchTerm("");
    setSelectedCohort("");
    setSelectedClass("");
    setSelectedProgram("");
    setSearched(false);
    void fetchStudents(1, pageSize, "", "", "", "");
  };

  const handleCohortChange = (cohortId: string) => {
    setSelectedCohort(cohortId);
    setSelectedClass(""); // Reset class selection when cohort changes
    void fetchStudents(1, pageSize, searchTerm, cohortId, "", selectedProgram);
  };

  const handleClassChange = (classCode: string) => {
    setSelectedClass(classCode);
    void fetchStudents(1, pageSize, searchTerm, selectedCohort, classCode, selectedProgram);
  };

  const handleProgramChange = (progCode: string) => {
    setSelectedProgram(progCode);
    void fetchStudents(1, pageSize, searchTerm, selectedCohort, selectedClass, progCode);
  };

  const handlePageChange = (newPage: number) => {
    if (newPage >= 1 && newPage <= totalPages && newPage !== page) {
      void fetchStudents(newPage, pageSize, searchTerm, selectedCohort, selectedClass, selectedProgram);
      window.scrollTo({ top: 160, behavior: "smooth" });
    }
  };

  const handlePageSizeChange = (newSize: number) => {
    setPageSize(newSize);
    void fetchStudents(1, newSize, searchTerm, selectedCohort, selectedClass, selectedProgram);
  };

  // Calculate items display bounds
  const startItem = total > 0 ? (page - 1) * pageSize + 1 : 0;
  const endItem = Math.min(page * pageSize, total);

  // Active filters count
  const hasActiveFilters = Boolean(searchTerm.trim() || selectedCohort || selectedClass || selectedProgram);

  return (
    <div className="space-y-6">
      {/* Top Search & Filter Control Bar */}
      <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-xs">
        <form onSubmit={handleSearchSubmit} className="space-y-3">
          <div className="flex flex-col lg:flex-row items-stretch lg:items-center gap-3">
            {/* Text search */}
            <div className="relative flex-1">
              <Search
                size={16}
                className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400"
              />
              <input
                type="text"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder="Nhập Mã số sinh viên (MSSV) hoặc Họ và tên..."
                className="w-full h-10 rounded-xl border border-slate-200 bg-slate-50/70 pl-10 pr-9 text-xs font-medium text-slate-800 placeholder-slate-400 outline-none focus:border-lime-600 focus:bg-white focus:ring-2 focus:ring-lime-100 transition"
              />
              {searchTerm && (
                <button
                  type="button"
                  onClick={() => {
                    setSearchTerm("");
                    void fetchStudents(1, pageSize, "", selectedCohort, selectedClass, selectedProgram);
                  }}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 cursor-pointer"
                >
                  <X size={14} />
                </button>
              )}
            </div>

            {/* Cohort filter */}
            <div className="w-full sm:w-48">
              <select
                value={selectedCohort}
                onChange={(e) => handleCohortChange(e.target.value)}
                className="w-full h-10 rounded-xl border border-slate-200 bg-slate-50/70 px-3 text-xs font-medium text-slate-800 outline-none focus:border-lime-600 focus:bg-white focus:ring-2 focus:ring-lime-100 transition"
              >
                <option value="">Tất cả các khóa</option>
                {cohorts.map((c) => (
                  <option key={c.id} value={c.id}>
                    Khóa {c.cohortCode} {c.cohortName ? `(${c.cohortName.split("(")[1] || c.cohortName}` : ""}
                  </option>
                ))}
              </select>
            </div>

            {/* Class filter */}
            <div className="w-full sm:w-44">
              <select
                value={selectedClass}
                onChange={(e) => handleClassChange(e.target.value)}
                className="w-full h-10 rounded-xl border border-slate-200 bg-slate-50/70 px-3 text-xs font-medium text-slate-800 outline-none focus:border-lime-600 focus:bg-white focus:ring-2 focus:ring-lime-100 transition"
              >
                <option value="">Tất cả các lớp</option>
                {filteredClasses.map((cls) => (
                  <option key={cls.id || cls.classId} value={cls.classId}>
                    {cls.className || cls.classId} {cls.studentCount ? `(${cls.studentCount} SV)` : ""}
                  </option>
                ))}
              </select>
            </div>

            {/* Program filter */}
            <div className="w-full sm:w-48">
              <select
                value={selectedProgram}
                onChange={(e) => handleProgramChange(e.target.value)}
                className="w-full h-10 rounded-xl border border-slate-200 bg-slate-50/70 px-3 text-xs font-medium text-slate-800 outline-none focus:border-lime-600 focus:bg-white focus:ring-2 focus:ring-lime-100 transition"
              >
                <option value="">Tất cả CTĐT</option>
                {programs.map((p) => (
                  <option key={p.id || p.programCode} value={p.programCode}>
                    {p.programCode} {p.programName ? `- ${p.programName}` : ""}
                  </option>
                ))}
              </select>
            </div>

            {/* Action Buttons */}
            <div className="flex items-center gap-2">
              <button
                type="submit"
                disabled={loading}
                className="inline-flex h-10 items-center justify-center gap-2 rounded-xl bg-slate-900 px-4 text-xs font-bold text-white transition hover:bg-slate-800 disabled:opacity-50 shadow-xs cursor-pointer"
              >
                {loading ? <RefreshCw size={14} className="animate-spin text-lime-400" /> : <Search size={14} />}
                <span>Tìm kiếm</span>
              </button>

              {hasActiveFilters && (
                <button
                  type="button"
                  onClick={handleResetFilters}
                  title="Đặt lại toàn bộ bộ lọc"
                  className="inline-flex h-10 w-10 items-center justify-center rounded-xl border border-slate-200 bg-slate-50 text-slate-600 transition hover:bg-slate-100 hover:text-slate-900 cursor-pointer"
                >
                  <RotateCcw size={14} />
                </button>
              )}
            </div>
          </div>

          {/* Active Filter Badges */}
          {hasActiveFilters && (
            <div className="flex flex-wrap items-center gap-2 pt-1 text-xs text-slate-500">
              <span className="flex items-center gap-1 font-semibold text-slate-600">
                <Filter size={12} />
                Đang lọc:
              </span>
              {searchTerm && (
                <span className="inline-flex items-center gap-1 rounded-md bg-lime-50 px-2 py-0.5 font-medium text-lime-800 border border-lime-200">
                  Từ khóa: &quot;{searchTerm}&quot;
                  <button type="button" onClick={() => { setSearchTerm(""); void fetchStudents(1, pageSize, "", selectedCohort, selectedClass, selectedProgram); }}>
                    <X size={12} className="hover:text-lime-950" />
                  </button>
                </span>
              )}
              {selectedCohort && (
                <span className="inline-flex items-center gap-1 rounded-md bg-blue-50 px-2 py-0.5 font-medium text-blue-800 border border-blue-200">
                  Khóa: {cohorts.find(c => c.id === selectedCohort)?.cohortCode || selectedCohort}
                  <button type="button" onClick={() => handleCohortChange("")}>
                    <X size={12} className="hover:text-blue-950" />
                  </button>
                </span>
              )}
              {selectedClass && (
                <span className="inline-flex items-center gap-1 rounded-md bg-purple-50 px-2 py-0.5 font-medium text-purple-800 border border-purple-200">
                  Lớp: {selectedClass}
                  <button type="button" onClick={() => handleClassChange("")}>
                    <X size={12} className="hover:text-purple-950" />
                  </button>
                </span>
              )}
              {selectedProgram && (
                <span className="inline-flex items-center gap-1 rounded-md bg-amber-50 px-2 py-0.5 font-medium text-amber-800 border border-amber-200">
                  CTĐT: {selectedProgram}
                  <button type="button" onClick={() => handleProgramChange("")}>
                    <X size={12} className="hover:text-amber-950" />
                  </button>
                </span>
              )}
            </div>
          )}
        </form>
      </div>

      {/* Main Content Layout: Selected Student Detail View OR Full Students List */}
      {selectedStudent ? (
        <div className="space-y-4">
          {/* Active Student Bar with Back & Full Profile Actions */}
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 rounded-2xl border border-blue-200 bg-blue-50/70 p-4 shadow-xs">
            <div className="flex items-center gap-3.5">
              <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-blue-600 text-white font-bold font-mono text-sm shadow-xs">
                {selectedStudent.studentId.slice(-3)}
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h3 className="text-base font-bold text-slate-900">
                    {selectedStudent.fullName}
                  </h3>
                  <span className="rounded bg-white px-2 py-0.5 font-mono text-xs font-bold text-blue-700 border border-blue-200 shadow-2xs">
                    {selectedStudent.studentId}
                  </span>
                </div>
                <p className="text-xs text-slate-500 mt-0.5 flex flex-wrap items-center gap-x-2">
                  <span>Lớp: <strong className="text-slate-700 font-semibold">{selectedStudent.className || "—"}</strong></span>
                  <span>•</span>
                  <span>Khóa: <strong className="text-slate-700 font-semibold">{selectedStudent.cohortCode || "—"}</strong></span>
                  {selectedStudent.programCode && (
                    <>
                      <span>•</span>
                      <span>CTĐT: <strong className="text-slate-700 font-semibold">{selectedStudent.programCode}</strong></span>
                    </>
                  )}
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <Link
                href={`/students/${encodeURIComponent(selectedStudent.id)}`}
                className="inline-flex items-center gap-1.5 text-xs font-semibold text-blue-700 hover:text-blue-900 bg-white border border-blue-200 rounded-xl px-3.5 py-2 shadow-2xs hover:bg-blue-50 transition"
              >
                <span>Hồ sơ sinh viên</span>
                <ArrowRight size={13} />
              </Link>

              <button
                type="button"
                onClick={() => setSelectedStudent(null)}
                className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-700 hover:text-slate-900 bg-white border border-slate-200 rounded-xl px-3.5 py-2 shadow-2xs hover:bg-slate-50 transition cursor-pointer"
              >
                <ChevronLeft size={14} />
                <span>Quay lại danh sách</span>
              </button>
            </div>
          </div>

          {/* Student Progress Detail View */}
          <StudentProgressDetail
            studentId={selectedStudent.id}
            showStudentHeader={false}
          />
        </div>
      ) : (
        /* Students List Selection */
        <div className="rounded-2xl border border-slate-200 bg-white shadow-xs overflow-hidden">
          {/* Header of the list with counts and page size selector */}
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 border-b border-slate-100 p-4 bg-slate-50/40">
            <div>
              <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                <Users size={16} className="text-lime-600" />
                Kết quả tìm kiếm sinh viên
              </h3>
              <p className="text-xs text-slate-500 mt-0.5">
                {total > 0
                  ? `Đang hiển thị ${startItem} - ${endItem} trong tổng số ${total} sinh viên`
                  : "Chọn một sinh viên để tra cứu tiến độ đào tạo theo khung CTĐT"}
              </p>
            </div>

            <div className="flex items-center gap-3">
              <div className="flex items-center gap-1 text-xs text-slate-500">
                <span>Hiển thị:</span>
                <select
                  value={pageSize}
                  onChange={(e) => handlePageSizeChange(Number(e.target.value))}
                  className="rounded-lg border border-slate-200 bg-white px-2 py-1 text-xs font-medium text-slate-700 outline-none focus:border-lime-600"
                >
                  <option value={20}>20 / trang</option>
                  <option value={50}>50 / trang</option>
                  <option value={100}>100 / trang</option>
                </select>
              </div>

              <span className="rounded-full bg-slate-100 px-3 py-1 font-mono text-xs font-bold text-slate-700 border border-slate-200">
                {total} sinh viên
              </span>
            </div>
          </div>

          {/* Body Content */}
          {loading ? (
            <div className="flex flex-col items-center justify-center p-14 text-slate-400">
              <RefreshCw size={24} className="animate-spin text-lime-600 mb-2.5" />
              <span className="text-xs font-semibold text-slate-600">Đang tải danh sách sinh viên...</span>
              <span className="text-[11px] text-slate-400 mt-0.5">Vui lòng chờ trong giây lát</span>
            </div>
          ) : students.length === 0 ? (
            <div className="p-14 text-center text-slate-400">
              <User size={38} className="mx-auto text-slate-300 mb-2.5" />
              <p className="text-sm font-semibold text-slate-700">
                {searched || hasActiveFilters ? "Không tìm thấy sinh viên nào phù hợp với bộ lọc" : "Chưa có sinh viên nào trong danh sách"}
              </p>
              <p className="text-xs text-slate-400 mt-1 max-w-sm mx-auto">
                Hãy thử kiểm tra lại từ khóa tìm kiếm, hoặc chọn &quot;Đặt lại&quot; để hiển thị toàn bộ sinh viên trong hệ thống.
              </p>
              {hasActiveFilters && (
                <button
                  type="button"
                  onClick={handleResetFilters}
                  className="mt-4 inline-flex items-center gap-1.5 text-xs font-bold text-lime-700 hover:text-lime-900 bg-lime-50 border border-lime-200 rounded-xl px-3.5 py-2 transition"
                >
                  <RotateCcw size={13} />
                  <span>Xóa bộ lọc để xem tất cả</span>
                </button>
              )}
            </div>
          ) : (
            <div className="divide-y divide-slate-100">
              {students.map((stud, idx) => {
                const globalIndex = (page - 1) * pageSize + idx + 1;
                return (
                  <div
                    key={stud.id}
                    onClick={() => setSelectedStudent(stud)}
                    className="flex items-center justify-between p-4 transition hover:bg-slate-50/80 cursor-pointer group"
                  >
                    <div className="flex items-center gap-3.5">
                      {/* Order Index & Student Code Preview */}
                      <div className="flex flex-col items-center justify-center h-10 w-10 shrink-0 rounded-xl bg-slate-100 text-slate-700 font-bold font-mono text-xs group-hover:bg-lime-100 group-hover:text-lime-900 transition">
                        <span className="text-[11px]">{stud.studentId.slice(-3)}</span>
                        <span className="text-[9px] font-normal text-slate-400 group-hover:text-lime-700">#{globalIndex}</span>
                      </div>

                      <div>
                        <div className="flex items-center gap-2">
                          <strong className="text-sm font-bold text-slate-900 group-hover:text-lime-900 transition">
                            {stud.fullName}
                          </strong>
                          <span className="rounded bg-slate-100 px-2 py-0.5 font-mono text-xs font-bold text-slate-700 group-hover:bg-white border border-slate-200">
                            {stud.studentId}
                          </span>
                        </div>

                        <div className="flex flex-wrap items-center gap-x-2 text-xs text-slate-500 mt-1">
                          <span>
                            Lớp: <span className="font-semibold text-slate-700">{stud.className || "—"}</span>
                          </span>
                          <span>•</span>
                          <span>
                            Khóa: <span className="font-semibold text-slate-700">{stud.cohortCode || "—"}</span>
                          </span>
                          {stud.programCode && (
                            <>
                              <span>•</span>
                              <span className="inline-flex items-center gap-1">
                                <GraduationCap size={13} className="text-slate-400" />
                                <span className="font-semibold text-slate-700">{stud.programCode}</span>
                              </span>
                            </>
                          )}
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center gap-2 text-xs font-semibold text-slate-500 group-hover:text-lime-700 group-hover:translate-x-0.5 transition">
                      <span className="hidden sm:inline">Xem chi tiết tiến độ</span>
                      <ChevronRight size={16} />
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* Full Pagination Controls */}
          {totalPages > 1 && (
            <div className="flex flex-col sm:flex-row items-center justify-between gap-3 border-t border-slate-100 p-4 bg-slate-50/50">
              <div className="text-xs text-slate-500">
                Trang <strong className="font-semibold text-slate-800">{page}</strong> trên tổng số <strong className="font-semibold text-slate-800">{totalPages}</strong> trang
              </div>

              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  onClick={() => handlePageChange(page - 1)}
                  disabled={page <= 1 || loading}
                  className="inline-flex h-8 items-center gap-1 rounded-lg border border-slate-200 bg-white px-3 text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-40 transition cursor-pointer"
                >
                  <ChevronLeft size={14} />
                  <span>Trang trước</span>
                </button>

                {/* Page number indicators */}
                <div className="hidden md:flex items-center gap-1">
                  {Array.from({ length: totalPages }, (_, i) => i + 1)
                    .filter((p) => p === 1 || p === totalPages || Math.abs(p - page) <= 2)
                    .reduce<Array<number | string>>((acc, p, idx, arr) => {
                      if (idx > 0 && p - (arr[idx - 1] as number) > 1) {
                        acc.push("...");
                      }
                      acc.push(p);
                      return acc;
                    }, [])
                    .map((item, i) =>
                      typeof item === "string" ? (
                        <span key={`dots-${i}`} className="px-1.5 text-xs text-slate-400">
                          ...
                        </span>
                      ) : (
                        <button
                          key={item}
                          type="button"
                          onClick={() => handlePageChange(item)}
                          className={`h-8 min-w-8 rounded-lg px-2 text-xs font-bold transition cursor-pointer ${
                            item === page
                              ? "bg-slate-900 text-white"
                              : "border border-slate-200 bg-white text-slate-700 hover:bg-slate-50"
                          }`}
                        >
                          {item}
                        </button>
                      )
                    )}
                </div>

                <button
                  type="button"
                  onClick={() => handlePageChange(page + 1)}
                  disabled={page >= totalPages || loading}
                  className="inline-flex h-8 items-center gap-1 rounded-lg border border-slate-200 bg-white px-3 text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-40 transition cursor-pointer"
                >
                  <span>Trang sau</span>
                  <ChevronRight size={14} />
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
