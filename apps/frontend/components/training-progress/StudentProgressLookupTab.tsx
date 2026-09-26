"use client";

import React, { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  AlertCircle,
  ArrowRight,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Clock,
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
import { useAuthStore } from "@/stores/authStore";
import StudentProgressDetail from "./StudentProgressDetail";
import type {
  CohortOption,
  DepartmentProgressOverviewResult,
  DepartmentProgressStudentItem,
  ListResponse,
} from "./types";

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

export default function StudentProgressLookupTab() {
  const { user } = useAuthStore();
  const isClassAdvisor = user?.role === "CLASS_ADVISOR";

  // Filters State
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedCohort, setSelectedCohort] = useState("");
  const [selectedClass, setSelectedClass] = useState("");
  const [selectedProgram, setSelectedProgram] = useState("");
  const [selectedStatus, setSelectedStatus] = useState<"ALL" | "ON_TRACK" | "BEHIND">("ALL");

  // Pagination State
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(1);

  // Catalogs
  const [cohorts, setCohorts] = useState<CohortOption[]>([]);
  const [classes, setClasses] = useState<ClassOption[]>([]);
  const [programs, setPrograms] = useState<ProgramOption[]>([]);

  // Department KPI & Student list state
  const [kpi, setKpi] = useState({
    totalStudents: 0,
    onTrackCount: 0,
    behindCount: 0,
    onTrackPercentage: 0,
    behindPercentage: 0,
    avgDeficitCredits: 0,
  });
  const [students, setStudents] = useState<DepartmentProgressStudentItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [searched, setSearched] = useState(false);

  // Selected student for detail view
  const [selectedStudent, setSelectedStudent] = useState<DepartmentProgressStudentItem | null>(null);

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

  // Main overview fetch function
  const fetchOverview = useCallback(
    async (
      targetPage = page,
      targetSize = pageSize,
      term = searchTerm,
      cohort = selectedCohort,
      classId = selectedClass,
      program = selectedProgram,
      status = selectedStatus
    ) => {
      setLoading(true);
      try {
        const query = new URLSearchParams();
        query.set("page", String(targetPage));
        query.set("pageSize", String(targetSize));

        if (term.trim()) query.set("search", term.trim());
        if (cohort) query.set("cohortId", cohort);
        if (classId) query.set("classStudentId", classId);
        if (program) query.set("studyProgramId", program);
        if (status && status !== "ALL") query.set("status", status);

        const res = await apiFetch(`/api/v1/training-progress/overview?${query.toString()}`);
        if (res.ok) {
          const data: DepartmentProgressOverviewResult = await res.json();
          setKpi(
            data.kpi || {
              totalStudents: 0,
              onTrackCount: 0,
              behindCount: 0,
              onTrackPercentage: 0,
              behindPercentage: 0,
              avgDeficitCredits: 0,
            }
          );
          setStudents(data.items || []);
          setTotal(data.pagination?.total ?? (data.items?.length || 0));
          setTotalPages(data.pagination?.totalPages ?? 1);
          setPage(data.pagination?.page ?? targetPage);
        } else {
          setStudents([]);
          setTotal(0);
          setTotalPages(1);
        }
      } catch (err) {
        console.error("Failed to fetch department training progress overview", err);
        setStudents([]);
        setTotal(0);
        setTotalPages(1);
      } finally {
        setLoading(false);
      }
    },
    [page, pageSize, searchTerm, selectedCohort, selectedClass, selectedProgram, selectedStatus]
  );

  // Initial load
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void fetchOverview(1, pageSize, "", "", "", "", "ALL");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setSearched(true);
    void fetchOverview(1, pageSize, searchTerm, selectedCohort, selectedClass, selectedProgram, selectedStatus);
  };

  const handleResetFilters = () => {
    setSearchTerm("");
    setSelectedCohort("");
    setSelectedClass("");
    setSelectedProgram("");
    setSelectedStatus("ALL");
    setSearched(false);
    void fetchOverview(1, pageSize, "", "", "", "", "ALL");
  };

  const handleCohortChange = (cohortId: string) => {
    setSelectedCohort(cohortId);
    setSelectedClass(""); // Reset class selection when cohort changes
    void fetchOverview(1, pageSize, searchTerm, cohortId, "", selectedProgram, selectedStatus);
  };

  const handleClassChange = (classCode: string) => {
    setSelectedClass(classCode);
    void fetchOverview(1, pageSize, searchTerm, selectedCohort, classCode, selectedProgram, selectedStatus);
  };

  const handleProgramChange = (progCode: string) => {
    setSelectedProgram(progCode);
    void fetchOverview(1, pageSize, searchTerm, selectedCohort, selectedClass, progCode, selectedStatus);
  };

  const handleStatusChange = (status: "ALL" | "ON_TRACK" | "BEHIND") => {
    setSelectedStatus(status);
    void fetchOverview(1, pageSize, searchTerm, selectedCohort, selectedClass, selectedProgram, status);
  };

  const handlePageChange = (newPage: number) => {
    if (newPage >= 1 && newPage <= totalPages && newPage !== page) {
      void fetchOverview(newPage, pageSize, searchTerm, selectedCohort, selectedClass, selectedProgram, selectedStatus);
      window.scrollTo({ top: 220, behavior: "smooth" });
    }
  };

  const handlePageSizeChange = (newSize: number) => {
    setPageSize(newSize);
    void fetchOverview(1, newSize, searchTerm, selectedCohort, selectedClass, selectedProgram, selectedStatus);
  };

  // Calculate items display bounds
  const startItem = total > 0 ? (page - 1) * pageSize + 1 : 0;
  const endItem = Math.min(page * pageSize, total);

  // Active filters count
  const hasActiveFilters = Boolean(
    searchTerm.trim() || selectedCohort || selectedClass || selectedProgram || selectedStatus !== "ALL"
  );

  return (
    <div className="space-y-6">
      {/* Department KPI Overview Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Total Students */}
        <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-2xs">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-500">Tổng sinh viên</span>
            <Users size={16} className="text-slate-400" />
          </div>
          <div className="mt-2.5 flex items-baseline gap-2">
            <span className="text-2xl font-bold font-mono text-slate-900">
              {kpi.totalStudents.toLocaleString("vi-VN")}
            </span>
            <span className="text-xs text-slate-400">sinh viên</span>
          </div>
          <div className="mt-2 text-[11px] text-slate-500">
            Phạm vi đang theo dõi
          </div>
        </div>

        {/* On Track */}
        <div
          onClick={() => handleStatusChange(selectedStatus === "ON_TRACK" ? "ALL" : "ON_TRACK")}
          className={`rounded-2xl border p-4 shadow-2xs transition cursor-pointer ${
            selectedStatus === "ON_TRACK"
              ? "border-emerald-400 bg-emerald-50/40 ring-2 ring-emerald-200"
              : "border-slate-200 bg-white hover:border-emerald-300"
          }`}
          title="Bấm để lọc danh sách Đúng tiến độ"
        >
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-500">Đúng tiến độ</span>
            <CheckCircle2 size={16} className="text-emerald-600" />
          </div>
          <div className="mt-2.5 flex items-baseline justify-between gap-1">
            <span className="text-2xl font-bold font-mono text-emerald-700">
              {kpi.onTrackCount.toLocaleString("vi-VN")}
            </span>
            <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">
              {kpi.onTrackPercentage}%
            </span>
          </div>
          <div className="mt-2 text-[11px] text-slate-500 flex items-center justify-between">
            <span>Đạt chuẩn mốc đào tạo</span>
            {selectedStatus === "ON_TRACK" && (
              <span className="text-emerald-700 font-semibold">Đang lọc</span>
            )}
          </div>
        </div>

        {/* Behind Schedule */}
        <div
          onClick={() => handleStatusChange(selectedStatus === "BEHIND" ? "ALL" : "BEHIND")}
          className={`rounded-2xl border p-4 shadow-2xs transition cursor-pointer ${
            selectedStatus === "BEHIND"
              ? "border-rose-400 bg-rose-50/40 ring-2 ring-rose-200"
              : "border-slate-200 bg-white hover:border-rose-300"
          }`}
          title="Bấm để lọc danh sách Chậm tiến độ"
        >
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-500">Chậm tiến độ</span>
            <AlertCircle size={16} className="text-rose-600" />
          </div>
          <div className="mt-2.5 flex items-baseline justify-between gap-1">
            <span className="text-2xl font-bold font-mono text-rose-600">
              {kpi.behindCount.toLocaleString("vi-VN")}
            </span>
            <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-bold bg-rose-50 text-rose-700 border border-rose-200">
              {kpi.behindPercentage}%
            </span>
          </div>
          <div className="mt-2 text-[11px] text-slate-500 flex items-center justify-between">
            <span>Còn thiếu yêu cầu kỳ kết thúc</span>
            {selectedStatus === "BEHIND" && (
              <span className="text-rose-700 font-semibold">Đang lọc</span>
            )}
          </div>
        </div>

        {/* Average Deficit Credits */}
        <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-2xs">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-500">TC thiếu trung bình</span>
            <Clock size={16} className="text-slate-400" />
          </div>
          <div className="mt-2.5 flex items-baseline gap-2">
            <span className={`text-2xl font-bold font-mono ${kpi.avgDeficitCredits > 0 ? "text-rose-600" : "text-slate-700"}`}>
              {kpi.avgDeficitCredits > 0 ? `-${kpi.avgDeficitCredits}` : "0"}
            </span>
            <span className="text-xs text-slate-400">tín chỉ</span>
          </div>
          <div className="mt-2 text-[11px] text-slate-500">
            {kpi.behindCount > 0 ? `Tính trên ${kpi.behindCount} SV chậm` : "Không có SV chậm"}
          </div>
        </div>
      </div>

      {/* Distribution visual progress bar */}
      {kpi.totalStudents > 0 && (
        <div className="rounded-2xl border border-slate-200 bg-white px-4 py-3 shadow-2xs">
          <div className="flex items-center justify-between text-xs text-slate-600 mb-1.5 font-medium">
            <span className="flex items-center gap-1.5">
              <span className="h-2 w-2 rounded-full bg-emerald-500" />
              Đúng tiến độ: <strong className="text-slate-900">{kpi.onTrackCount}</strong> ({kpi.onTrackPercentage}%)
            </span>
            <span className="flex items-center gap-1.5">
              <span className="h-2 w-2 rounded-full bg-rose-500" />
              Chậm tiến độ: <strong className="text-slate-900">{kpi.behindCount}</strong> ({kpi.behindPercentage}%)
            </span>
          </div>
          <div className="h-2 w-full overflow-hidden rounded-full bg-slate-100 flex">
            <div
              className="bg-emerald-500 transition-all duration-500"
              style={{ width: `${kpi.onTrackPercentage}%` }}
              title={`Đúng tiến độ: ${kpi.onTrackPercentage}%`}
            />
            <div
              className="bg-rose-500 transition-all duration-500"
              style={{ width: `${kpi.behindPercentage}%` }}
              title={`Chậm tiến độ: ${kpi.behindPercentage}%`}
            />
          </div>
        </div>
      )}

      {/* Search & Filter Bar */}
      <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-2xs">
        <form onSubmit={handleSearchSubmit} className="space-y-3">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-12 gap-3 items-center">
            {/* Search text (MSSV / Họ tên) - 4 cols */}
            <div className="relative sm:col-span-2 lg:col-span-4">
              <Search
                size={16}
                className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400"
              />
              <input
                type="text"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder="Tìm kiếm MSSV hoặc Họ tên..."
                className="w-full h-10 rounded-xl border border-slate-200 bg-slate-50/70 pl-10 pr-9 text-xs font-medium text-slate-800 placeholder-slate-400 outline-none focus:border-emerald-600 focus:bg-white focus:ring-2 focus:ring-emerald-100 transition"
              />
              {searchTerm && (
                <button
                  type="button"
                  onClick={() => {
                    setSearchTerm("");
                    void fetchOverview(1, pageSize, "", selectedCohort, selectedClass, selectedProgram, selectedStatus);
                  }}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 cursor-pointer"
                >
                  <X size={14} />
                </button>
              )}
            </div>

            {/* Cohort filter - 2 cols */}
            <div className="lg:col-span-2">
              <select
                value={selectedCohort}
                onChange={(e) => handleCohortChange(e.target.value)}
                className="w-full h-10 rounded-xl border border-slate-200 bg-slate-50/70 px-3 text-xs font-medium text-slate-800 outline-none focus:border-emerald-600 focus:bg-white focus:ring-2 focus:ring-emerald-100 transition"
              >
                <option value="">Tất cả các khóa</option>
                {cohorts.map((c) => (
                  <option key={c.id} value={c.id}>
                    Khóa {c.cohortCode} {c.cohortName ? `(${c.cohortName.split("(")[1] || c.cohortName}` : ""}
                  </option>
                ))}
              </select>
            </div>

            {/* Class filter - 2 cols */}
            <div className="lg:col-span-2">
              {isClassAdvisor || classes.length <= 1 ? (
                <div className="w-full h-10 rounded-xl border border-slate-200 bg-slate-100 px-3 text-xs font-semibold text-slate-700 flex items-center gap-1.5">
                  <span className="text-slate-400 font-normal">Lớp:</span>
                  <span className="truncate">{classes[0]?.className || classes[0]?.classId || user?.className || "Lớp phụ trách"}</span>
                </div>
              ) : (
                <select
                  value={selectedClass}
                  onChange={(e) => handleClassChange(e.target.value)}
                  className="w-full h-10 rounded-xl border border-slate-200 bg-slate-50/70 px-3 text-xs font-medium text-slate-800 outline-none focus:border-emerald-600 focus:bg-white focus:ring-2 focus:ring-emerald-100 transition"
                >
                  <option value="">Tất cả các lớp</option>
                  {filteredClasses.map((cls) => (
                    <option key={cls.id || cls.classId} value={cls.classId}>
                      {cls.className || cls.classId} {cls.studentCount ? `(${cls.studentCount} SV)` : ""}
                    </option>
                  ))}
                </select>
              )}
            </div>

            {/* Program filter - 2 cols */}
            <div className="lg:col-span-2">
              <select
                value={selectedProgram}
                onChange={(e) => handleProgramChange(e.target.value)}
                className="w-full h-10 rounded-xl border border-slate-200 bg-slate-50/70 px-3 text-xs font-medium text-slate-800 outline-none focus:border-emerald-600 focus:bg-white focus:ring-2 focus:ring-emerald-100 transition"
              >
                <option value="">Tất cả CTĐT</option>
                {programs.map((p) => (
                  <option key={p.id || p.programCode} value={p.programCode}>
                    {p.programCode} {p.programName ? `- ${p.programName}` : ""}
                  </option>
                ))}
              </select>
            </div>

            {/* Status filter - 2 cols */}
            <div className="lg:col-span-2">
              <select
                value={selectedStatus}
                onChange={(e) => handleStatusChange(e.target.value as "ALL" | "ON_TRACK" | "BEHIND")}
                className="w-full h-10 rounded-xl border border-slate-200 bg-slate-50/70 px-3 text-xs font-medium text-slate-800 outline-none focus:border-emerald-600 focus:bg-white focus:ring-2 focus:ring-emerald-100 transition"
              >
                <option value="ALL">Tất cả trạng thái</option>
                <option value="ON_TRACK">Đúng tiến độ</option>
                <option value="BEHIND">Chậm tiến độ</option>
              </select>
            </div>
          </div>

          {/* Action Row & Active Badges */}
          <div className="flex flex-wrap items-center justify-between gap-2 pt-1 border-t border-slate-100">
            {/* Active filter badges */}
            <div className="flex flex-wrap items-center gap-1.5 text-xs text-slate-500">
              {hasActiveFilters ? (
                <>
                  <span className="flex items-center gap-1 font-semibold text-slate-600 mr-1">
                    <Filter size={12} />
                    Lọc:
                  </span>
                  {searchTerm && (
                    <span className="inline-flex items-center gap-1 rounded-md bg-emerald-50 px-2 py-0.5 font-medium text-emerald-800 border border-emerald-200">
                      Từ khóa: &quot;{searchTerm}&quot;
                      <button
                        type="button"
                        onClick={() => {
                          setSearchTerm("");
                          void fetchOverview(1, pageSize, "", selectedCohort, selectedClass, selectedProgram, selectedStatus);
                        }}
                      >
                        <X size={12} className="hover:text-emerald-950 cursor-pointer" />
                      </button>
                    </span>
                  )}
                  {selectedCohort && (
                    <span className="inline-flex items-center gap-1 rounded-md bg-blue-50 px-2 py-0.5 font-medium text-blue-800 border border-blue-200">
                      Khóa: {cohorts.find((c) => c.id === selectedCohort)?.cohortCode || selectedCohort}
                      <button type="button" onClick={() => handleCohortChange("")}>
                        <X size={12} className="hover:text-blue-950 cursor-pointer" />
                      </button>
                    </span>
                  )}
                  {selectedClass && (
                    <span className="inline-flex items-center gap-1 rounded-md bg-purple-50 px-2 py-0.5 font-medium text-purple-800 border border-purple-200">
                      Lớp: {selectedClass}
                      <button type="button" onClick={() => handleClassChange("")}>
                        <X size={12} className="hover:text-purple-950 cursor-pointer" />
                      </button>
                    </span>
                  )}
                  {selectedProgram && (
                    <span className="inline-flex items-center gap-1 rounded-md bg-amber-50 px-2 py-0.5 font-medium text-amber-800 border border-amber-200">
                      CTĐT: {selectedProgram}
                      <button type="button" onClick={() => handleProgramChange("")}>
                        <X size={12} className="hover:text-amber-950 cursor-pointer" />
                      </button>
                    </span>
                  )}
                  {selectedStatus !== "ALL" && (
                    <span
                      className={`inline-flex items-center gap-1 rounded-md px-2 py-0.5 font-medium border ${
                        selectedStatus === "ON_TRACK"
                          ? "bg-emerald-50 text-emerald-800 border-emerald-200"
                          : "bg-rose-50 text-rose-800 border-rose-200"
                      }`}
                    >
                      Trạng thái: {selectedStatus === "ON_TRACK" ? "Đúng tiến độ" : "Chậm tiến độ"}
                      <button type="button" onClick={() => handleStatusChange("ALL")}>
                        <X size={12} className="hover:opacity-75 cursor-pointer" />
                      </button>
                    </span>
                  )}
                </>
              ) : (
                <span className="text-[11px] text-slate-400">Chưa áp dụng bộ lọc nào</span>
              )}
            </div>

            {/* Buttons */}
            <div className="flex items-center gap-2 ml-auto">
              {hasActiveFilters && (
                <button
                  type="button"
                  onClick={handleResetFilters}
                  title="Đặt lại toàn bộ bộ lọc"
                  className="inline-flex h-9 items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 text-xs font-semibold text-slate-600 hover:bg-slate-50 hover:text-slate-900 cursor-pointer transition"
                >
                  <RotateCcw size={13} />
                  <span>Đặt lại</span>
                </button>
              )}

              <button
                type="submit"
                disabled={loading}
                className="inline-flex h-9 items-center justify-center gap-2 rounded-xl bg-slate-900 px-4 text-xs font-bold text-white transition hover:bg-slate-800 disabled:opacity-50 shadow-2xs cursor-pointer"
              >
                {loading ? <RefreshCw size={13} className="animate-spin text-emerald-400" /> : <Search size={13} />}
                <span>Tìm kiếm</span>
              </button>
            </div>
          </div>
        </form>
      </div>

      {/* Main Content: Selected Student Detail View OR Full Students Overview Table */}
      {selectedStudent ? (
        <div className="space-y-4">
          {/* Active Student Bar with Back & Full Profile Actions */}
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-2xs">
            <div className="flex items-center gap-3.5">
              <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-slate-900 text-white font-bold font-mono text-sm shadow-2xs">
                {selectedStudent.studentId.slice(-3)}
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h3 className="text-base font-bold text-slate-900">
                    {selectedStudent.fullName}
                  </h3>
                  <span className="rounded-md bg-slate-100 px-2 py-0.5 font-mono text-xs font-bold text-slate-800 border border-slate-200">
                    {selectedStudent.studentId}
                  </span>
                  {selectedStudent.progressStatus === "ON_TRACK" ? (
                    <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200">
                      <CheckCircle2 size={11} className="text-emerald-600" />
                      Đúng tiến độ
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-rose-50 text-rose-700 border border-rose-200">
                      <AlertCircle size={11} className="text-rose-600" />
                      Chậm {selectedStudent.creditDifferenceText.replace("-", "")}
                    </span>
                  )}
                </div>
                <p className="text-xs text-slate-500 mt-1 flex flex-wrap items-center gap-x-2">
                  <span>
                    Lớp: <strong className="text-slate-700 font-semibold">{selectedStudent.className || "—"}</strong>
                  </span>
                  <span>•</span>
                  <span>
                    Khóa: <strong className="text-slate-700 font-semibold">{selectedStudent.cohortCode || "—"}</strong>
                  </span>
                  {selectedStudent.programCode && (
                    <>
                      <span>•</span>
                      <span>
                        CTĐT: <strong className="text-slate-700 font-semibold">{selectedStudent.programCode}</strong>
                      </span>
                    </>
                  )}
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <Link
                href={`/students/${encodeURIComponent(selectedStudent.id)}`}
                className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-700 hover:text-slate-900 bg-white border border-slate-200 rounded-xl px-3.5 py-2 shadow-2xs hover:bg-slate-50 transition"
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
        /* Students Overview Table */
        <div className="rounded-2xl border border-slate-200 bg-white shadow-2xs overflow-hidden">
          {/* Header of the table with summary and page size selector */}
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 border-b border-slate-100 p-4 bg-slate-50/50">
            <div>
              <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                <Users size={16} className="text-emerald-600" />
                Danh sách tiến độ sinh viên
              </h3>
              <p className="text-xs text-slate-500 mt-0.5">
                {total > 0
                  ? `Hiển thị ${startItem} - ${endItem} trong tổng số ${total} sinh viên theo bộ lọc`
                  : "Không có sinh viên nào phù hợp với điều kiện lọc"}
              </p>
            </div>

            <div className="flex items-center gap-3">
              <div className="flex items-center gap-1 text-xs text-slate-500">
                <span>Hiển thị:</span>
                <select
                  value={pageSize}
                  onChange={(e) => handlePageSizeChange(Number(e.target.value))}
                  className="rounded-lg border border-slate-200 bg-white px-2 py-1 text-xs font-medium text-slate-700 outline-none focus:border-emerald-600 cursor-pointer"
                >
                  <option value={20}>20 / trang</option>
                  <option value={50}>50 / trang</option>
                  <option value={100}>100 / trang</option>
                </select>
              </div>

              <span className="rounded-full bg-slate-100 px-3 py-1 font-mono text-xs font-bold text-slate-700 border border-slate-200">
                {total} SV
              </span>
            </div>
          </div>

          {/* Table or Empty/Loading States */}
          {loading ? (
            <div className="flex flex-col items-center justify-center p-14 text-slate-400">
              <RefreshCw size={24} className="animate-spin text-emerald-600 mb-2.5" />
              <span className="text-xs font-semibold text-slate-600">Đang tải và đánh giá tiến độ sinh viên...</span>
              <span className="text-[11px] text-slate-400 mt-0.5">Hệ thống đang đối soát dữ liệu với chuẩn CTĐT</span>
            </div>
          ) : students.length === 0 ? (
            <div className="p-14 text-center text-slate-400">
              <User size={38} className="mx-auto text-slate-300 mb-2.5" />
              <p className="text-sm font-semibold text-slate-700">
                {hasActiveFilters ? "Không tìm thấy sinh viên nào phù hợp với bộ lọc" : "Chưa có sinh viên nào trong danh sách"}
              </p>
              <p className="text-xs text-slate-400 mt-1 max-w-sm mx-auto">
                Hãy thử nới lỏng bộ lọc hoặc bấm &quot;Đặt lại&quot; để xem toàn bộ sinh viên trong Khoa.
              </p>
              {hasActiveFilters && (
                <button
                  type="button"
                  onClick={handleResetFilters}
                  className="mt-4 inline-flex items-center gap-1.5 text-xs font-bold text-emerald-700 hover:text-emerald-900 bg-emerald-50 border border-emerald-200 rounded-xl px-3.5 py-2 transition cursor-pointer"
                >
                  <RotateCcw size={13} />
                  <span>Xóa bộ lọc để xem tất cả</span>
                </button>
              )}
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b border-slate-200 bg-slate-50/80 text-[11px] font-bold text-slate-600 uppercase tracking-wider">
                    <th className="py-3 px-3.5 whitespace-nowrap">MSSV</th>
                    <th className="py-3 px-3.5 whitespace-nowrap">Họ và tên</th>
                    <th className="py-3 px-3 whitespace-nowrap">Khóa / Lớp</th>
                    <th className="py-3 px-3 whitespace-nowrap">Mốc đánh giá</th>
                    <th className="py-3 px-3 text-right whitespace-nowrap">TC kế hoạch</th>
                    <th className="py-3 px-3 text-right whitespace-nowrap">TC đã đạt</th>
                    <th className="py-3 px-3 text-right whitespace-nowrap">Chênh lệch</th>
                    <th className="py-3 px-3 text-center whitespace-nowrap">HP bắt buộc thiếu</th>
                    <th className="py-3 px-3 text-center whitespace-nowrap">Trạng thái</th>
                    <th className="py-3 px-3.5 text-center whitespace-nowrap">Thao tác</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 text-xs">
                  {students.map((st) => {
                    const isOnTrack = st.progressStatus === "ON_TRACK";
                    return (
                      <tr
                        key={st.id}
                        onClick={() => setSelectedStudent(st)}
                        className="hover:bg-slate-50/80 transition cursor-pointer group"
                      >
                        {/* MSSV */}
                        <td className="py-3 px-3.5 whitespace-nowrap font-mono font-bold text-slate-800">
                          {st.studentId}
                        </td>

                        {/* Full Name */}
                        <td className="py-3 px-3.5 whitespace-nowrap">
                          <span className="font-semibold text-slate-900 group-hover:text-emerald-700 transition">
                            {st.fullName}
                          </span>
                        </td>

                        {/* Cohort / Class */}
                        <td className="py-3 px-3 whitespace-nowrap text-slate-600">
                          <span>{st.cohortCode || "—"}</span>
                          <span className="text-slate-300 mx-1">/</span>
                          <span className="font-medium text-slate-800">{st.className || "—"}</span>
                        </td>

                        {/* Benchmark Label */}
                        <td className="py-3 px-3 whitespace-nowrap text-slate-600">
                          <span className="inline-flex items-center gap-1">
                            <Clock size={12} className="text-slate-400" />
                            <span>{st.benchmarkLabel}</span>
                          </span>
                        </td>

                        {/* Expected Credits */}
                        <td className="py-3 px-3 text-right whitespace-nowrap font-mono text-slate-600">
                          {st.expectedCredits} TC
                        </td>

                        {/* Earned Credits */}
                        <td className="py-3 px-3 text-right whitespace-nowrap font-mono font-bold text-slate-900">
                          {st.earnedCredits} TC
                        </td>

                        {/* Credit Difference */}
                        <td className="py-3 px-3 text-right whitespace-nowrap font-mono font-bold">
                          {st.creditDifference < 0 ? (
                            <span className="text-rose-600">{st.creditDifferenceText}</span>
                          ) : (
                            <span className="text-emerald-600">
                              {st.creditDifference > 0 ? `+${st.creditDifference} TC` : "0 TC"}
                            </span>
                          )}
                        </td>

                        {/* Missing Required Courses */}
                        <td className="py-3 px-3 text-center whitespace-nowrap">
                          {st.missingRequiredCoursesCount > 0 ? (
                            <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-bold bg-rose-50 text-rose-700 border border-rose-200">
                              Thiếu {st.missingRequiredCoursesCount} HP
                            </span>
                          ) : (
                            <span className="text-slate-400 font-mono">0</span>
                          )}
                        </td>

                        {/* Status */}
                        <td className="py-3 px-3 text-center whitespace-nowrap">
                          {isOnTrack ? (
                            <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200">
                              <CheckCircle2 size={12} className="text-emerald-600" />
                              <span>Đúng tiến độ</span>
                            </span>
                          ) : (
                            <span
                              className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold bg-rose-50 text-rose-700 border border-rose-200"
                              title={st.statusReason}
                            >
                              <AlertCircle size={12} className="text-rose-600" />
                              <span>Chậm tiến độ</span>
                            </span>
                          )}
                        </td>

                        {/* Action */}
                        <td className="py-3 px-3.5 text-center whitespace-nowrap" onClick={(e) => e.stopPropagation()}>
                          <button
                            type="button"
                            onClick={() => setSelectedStudent(st)}
                            className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg border border-slate-200 bg-white text-xs font-semibold text-slate-700 hover:border-emerald-300 hover:bg-emerald-50 hover:text-emerald-800 transition cursor-pointer shadow-2xs"
                          >
                            <span>Chi tiết</span>
                            <ChevronRight size={13} />
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}

          {/* Full Pagination Controls */}
          {totalPages > 1 && (
            <div className="flex flex-col sm:flex-row items-center justify-between gap-3 border-t border-slate-100 p-4 bg-slate-50/50">
              <div className="text-xs text-slate-500">
                Trang <strong className="font-semibold text-slate-800">{page}</strong> trên tổng số{" "}
                <strong className="font-semibold text-slate-800">{totalPages}</strong> trang
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
