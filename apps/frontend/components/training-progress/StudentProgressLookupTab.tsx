"use client";

import TableAction from "@/components/ui/TableAction";
import TextLabel from "@/components/ui/TextLabel";
import Modal from "@/components/ui/Modal";
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { AlertCircle, ArrowRight, CheckCircle2, ChevronLeft, ChevronRight, Clock, Filter, RefreshCw, RotateCcw, Search, User, Users, X, Eye } from "lucide-react";
import { apiFetch } from "@/lib/api-client";
import { useAuthStore } from "@/stores/authStore";
import dynamic from "next/dynamic";
const StudentProgressDetail = dynamic(() => import("./StudentProgressDetail"), { loading: () => <p role="status" className="p-6 text-sm text-slate-500">Đang tải chi tiết tiến độ...</p> });
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
  const [kpi, setKpi] = useState<DepartmentProgressOverviewResult["kpi"]>({
    totalStudents: 0,
    onTrackCount: 0,
    behindCount: 0,
    onTrackPercentage: 0,
    behindPercentage: 0,
    avgDeficitCredits: 0,
  });
  const [kpiReady, setKpiReady] = useState(false);
  const [summaryLoading, setSummaryLoading] = useState(false);
  const [overviewError, setOverviewError] = useState("");
  const [summaryError, setSummaryError] = useState("");
  const pageRequest = useRef<AbortController | null>(null);
  const summaryRequest = useRef<AbortController | null>(null);
  const appliedQuery = useRef(new URLSearchParams());
  const summaryScope = useRef<string | null>(null);
  const summaryReady = useRef(false);
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

  // A page change keeps the scope statistics; a filter change invalidates them.
  const loadSummary = useCallback(async (source = appliedQuery.current) => {
    summaryRequest.current?.abort();
    const controller = new AbortController();
    summaryRequest.current = controller;
    const scope = summaryScope.current;
    setSummaryLoading(true);
    setSummaryError("");
    try {
      const query = new URLSearchParams(source);
      query.delete("status");
      query.set("mode", "summary");
      const response = await apiFetch(`/api/v1/training-progress/overview?${query}`, { signal: controller.signal });
      if (!response.ok) throw new Error("Không thể tải thống kê. Vui lòng thử lại.");
      const data: DepartmentProgressOverviewResult = await response.json();
      if (!data.kpi || data.kpiComplete !== true) throw new Error("Chưa nhận được thống kê đầy đủ. Vui lòng thử lại.");
      if (controller.signal.aborted || summaryScope.current !== scope) return;
      summaryReady.current = true;
      setKpi(data.kpi);
      setKpiReady(true);
    } catch (error) {
      if (!controller.signal.aborted) setSummaryError(error instanceof Error ? error.message : "Không thể tải thống kê.");
    } finally {
      if (!controller.signal.aborted) {
        summaryRequest.current = null;
        setSummaryLoading(false);
      }
    }
  }, []);

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
      pageRequest.current?.abort();
      const controller = new AbortController();
      pageRequest.current = controller;
      setOverviewError("");
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

        const scopeQuery = new URLSearchParams(query);
        scopeQuery.delete("page");
        scopeQuery.delete("pageSize");
        scopeQuery.delete("status");
        const scope = scopeQuery.toString();
        if (summaryScope.current !== scope) {
          summaryRequest.current?.abort();
          summaryRequest.current = null;
          summaryScope.current = scope;
          summaryReady.current = false;
          setKpiReady(false);
          setSummaryLoading(false);
          setSummaryError("");
          setKpi((previous) => ({ ...previous, totalStudents: 0 }));
        }
        appliedQuery.current = new URLSearchParams(query);
        const res = await apiFetch(`/api/v1/training-progress/overview?${query.toString()}`, { signal: controller.signal });
        if (res.ok) {
          const data: DepartmentProgressOverviewResult = await res.json();
          if (controller.signal.aborted) return;
          if (data.kpiComplete === true) {
            summaryRequest.current?.abort();
            summaryRequest.current = null;
            summaryReady.current = true;
            setKpi(data.kpi);
            setKpiReady(true);
            setSummaryLoading(false);
            setSummaryError("");
          } else if (!summaryReady.current) {
            setKpi((previous) => ({ ...previous, totalStudents: data.kpi.totalStudents }));
            if (!summaryRequest.current) void loadSummary(query);
          }
          setStudents(data.items || []);
          setTotal(data.pagination?.total ?? (data.items?.length || 0));
          setTotalPages(data.pagination?.totalPages ?? 1);
          setPage(data.pagination?.page ?? targetPage);
        } else {
          setOverviewError("Không thể tải tiến độ. Vui lòng thử lại.");
          setStudents([]);
          setTotal(0);
          setTotalPages(1);
        }
      } catch (err) {
        if (controller.signal.aborted) return;
        setOverviewError("Không thể tải tiến độ. Vui lòng thử lại.");
        console.error("Failed to fetch department training progress overview", err);
        setStudents([]);
        setTotal(0);
        setTotalPages(1);
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    },
    [page, pageSize, searchTerm, selectedCohort, selectedClass, selectedProgram, selectedStatus, loadSummary]
  );

  // Initial load
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void fetchOverview(1, pageSize, "", "", "", "", "ALL");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => () => {
    pageRequest.current?.abort();
    summaryRequest.current?.abort();
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

  const unknownCount = kpi.unknownCount ?? Math.max(0, kpi.totalStudents - kpi.onTrackCount - kpi.behindCount);
  const progressDistribution = [
    { label: "Đúng tiến độ", count: kpi.onTrackCount, color: "bg-emerald-500" },
    { label: "Chậm tiến độ", count: kpi.behindCount, color: "bg-rose-500" },
    { label: "Cần đối soát", count: unknownCount, color: "bg-amber-500" },
  ].map(group => ({ ...group, percentage: kpi.totalStudents > 0 ? group.count / kpi.totalStudents * 100 : 0 }));

  // Calculate items display bounds
  const startItem = total > 0 ? (page - 1) * pageSize + 1 : 0;
  const endItem = Math.min(page * pageSize, total);

  // Active filters count
  const hasActiveFilters = Boolean(
    searchTerm.trim() || selectedCohort || selectedClass || selectedProgram || selectedStatus !== "ALL"
  );

  return (
    <div className="space-y-6">
      {overviewError && <p role="alert" className="text-sm text-rose-700">{overviewError}</p>}
      {!kpiReady && (
        <div role={summaryError ? "alert" : "status"} className="flex items-center justify-between gap-3 text-xs text-slate-500">
          <span>{summaryError || (summaryLoading ? "Đang tính thống kê toàn phạm vi..." : "Đang tải dữ liệu thống kê...")}</span>
          {summaryError && (
            <button type="button" onClick={() => void loadSummary()} disabled={loading || summaryLoading}
              className="rounded-lg border border-slate-200 bg-white px-3 py-2 font-semibold disabled:opacity-50">
              Thử lại thống kê
            </button>
          )}
        </div>
      )}
      {/* Department KPI Overview Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
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
              {kpiReady ? kpi.onTrackCount.toLocaleString("vi-VN") : "—"}
            </span>
            <TextLabel className="inline-flex items-center text-xs font-bold text-emerald-700">
              {kpiReady ? `${kpi.onTrackPercentage}%` : "—"}
            </TextLabel>
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
              {kpiReady ? kpi.behindCount.toLocaleString("vi-VN") : "—"}
            </span>
            <TextLabel className="inline-flex items-center text-xs font-bold text-rose-700">
              {kpiReady ? `${kpi.behindPercentage}%` : "—"}
            </TextLabel>
          </div>
          <div className="mt-2 text-[11px] text-slate-500 flex items-center justify-between">
            <span>Còn thiếu yêu cầu kỳ kết thúc</span>
            {selectedStatus === "BEHIND" && (
              <span className="text-rose-700 font-semibold">Đang lọc</span>
            )}
          </div>
        </div>


      </div>

      {/* Distribution includes every assessment status; widths use unrounded counts. */}
      {kpiReady && kpi.totalStudents > 0 && (
        <div className="rounded-2xl border border-slate-200 bg-white px-4 py-3 shadow-2xs">
          <div className="mb-1.5 flex flex-wrap items-center justify-between gap-x-4 gap-y-2 text-xs font-medium text-slate-600">
            {progressDistribution.filter(group => group.count > 0).map(group => (
              <span key={group.label} className="flex items-center gap-1.5">
                <span className={`h-2 w-2 rounded-full ${group.color}`} />
                {group.label}: <strong className="text-slate-900">{group.count}</strong> ({group.percentage.toLocaleString("vi-VN", { maximumFractionDigits: 1 })}%)
              </span>
            ))}
          </div>
          <div
            role="img"
            aria-label={progressDistribution.map(group => `${group.label}: ${group.count} sinh viên`).join(", ")}
            className="flex h-2 w-full overflow-hidden rounded-full bg-slate-100"
          >
            {progressDistribution.map(group => (
              <div
                key={group.label}
                className={`${group.color} transition-all duration-500`}
                style={{ width: `${group.percentage}%` }}
                title={`${group.label}: ${group.count} sinh viên`}
              />
            ))}
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
                    <TextLabel className="inline-flex items-center gap-1 font-medium text-emerald-800">
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
                    </TextLabel>
                  )}
                  {selectedCohort && (
                    <TextLabel className="inline-flex items-center gap-1 font-medium text-blue-800">
                      Khóa: {cohorts.find((c) => c.id === selectedCohort)?.cohortCode || selectedCohort}
                      <button type="button" onClick={() => handleCohortChange("")}>
                        <X size={12} className="hover:text-blue-950 cursor-pointer" />
                      </button>
                    </TextLabel>
                  )}
                  {selectedClass && (
                    <TextLabel className="inline-flex items-center gap-1 font-medium text-purple-800">
                      Lớp: {selectedClass}
                      <button type="button" onClick={() => handleClassChange("")}>
                        <X size={12} className="hover:text-purple-950 cursor-pointer" />
                      </button>
                    </TextLabel>
                  )}
                  {selectedProgram && (
                    <TextLabel className="inline-flex items-center gap-1 font-medium text-amber-800">
                      CTĐT: {selectedProgram}
                      <button type="button" onClick={() => handleProgramChange("")}>
                        <X size={12} className="hover:text-amber-950 cursor-pointer" />
                      </button>
                    </TextLabel>
                  )}
                  {selectedStatus !== "ALL" && (
                    <TextLabel
                      className={`inline-flex items-center gap-1    font-medium  ${
                        selectedStatus === "ON_TRACK"
                          ? "bg-emerald-50 text-emerald-800 "
                          : "bg-rose-50 text-rose-800 "
                      }`}
                    >
                      Trạng thái: {selectedStatus === "ON_TRACK" ? "Đúng tiến độ" : "Chậm tiến độ"}
                      <button type="button" onClick={() => handleStatusChange("ALL")}>
                        <X size={12} className="hover:opacity-75 cursor-pointer" />
                      </button>
                    </TextLabel>
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

      {/* Keep the list mounted while student details are open. */}
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

            <TextLabel className="font-mono text-xs font-bold text-slate-700">
              {total} SV
            </TextLabel>
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
                  <th className="py-3 px-3.5 whitespace-nowrap text-left table-cell-left">MSSV</th>
                  <th className="py-3 px-3.5 whitespace-nowrap text-left table-cell-left">Họ và tên</th>
                  <th className="py-3 px-3 whitespace-nowrap text-center table-cell-center">Khóa / Lớp</th>
                  <th className="py-3 px-3 whitespace-nowrap text-center table-cell-center">Mốc đánh giá</th>
                  <th className="py-3 px-3 text-center whitespace-nowrap table-cell-center">TC kế hoạch</th>
                  <th className="py-3 px-3 text-center whitespace-nowrap table-cell-center">TC đã đạt</th>
                  <th className="py-3 px-3 text-center whitespace-nowrap table-cell-center">Chênh lệch</th>
                  <th className="py-3 px-3 text-center whitespace-nowrap table-cell-center">HP bắt buộc thiếu</th>
                  <th className="py-3 px-3 text-center whitespace-nowrap table-cell-center">Trạng thái</th>
                  <th className="py-3 px-3.5 text-center whitespace-nowrap table-cell-center">Thao tác</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-xs">
                {students.map((st) => {
                  const isOnTrack = st.progressStatus === "ON_TRACK";
                  return (
                    <tr
                      key={st.id}
                      onClick={() => setSelectedStudent(st)}
                      tabIndex={0}
                      aria-haspopup="dialog"
                      onKeyDown={(event) => {
                        if (event.target === event.currentTarget && (event.key === "Enter" || event.key === " ")) {
                          event.preventDefault();
                          setSelectedStudent(st);
                        }
                      }}
                      className="hover:bg-slate-50/80 transition cursor-pointer group focus-visible:outline-2 focus-visible:outline-emerald-700"
                    >
                      {/* MSSV */}
                      <td className="py-3 px-3.5 whitespace-nowrap font-mono font-bold text-slate-800 text-left table-cell-left">
                        {st.studentId}
                      </td>

                      {/* Full Name */}
                      <td className="py-3 px-3.5 whitespace-nowrap text-left table-cell-left">
                        <span className="font-semibold text-slate-900 group-hover:text-emerald-700 transition">
                          {st.fullName}
                        </span>
                      </td>

                      {/* Cohort / Class */}
                      <td className="py-3 px-3 whitespace-nowrap text-slate-600 text-center table-cell-center">
                        <span>{st.cohortCode || "—"}</span>
                        <span className="text-slate-300 mx-1">/</span>
                        <span className="font-medium text-slate-800">{st.className || "—"}</span>
                      </td>

                      {/* Benchmark Label */}
                      <td className="py-3 px-3 whitespace-nowrap text-slate-600 text-center table-cell-center">
                        <span className="inline-flex items-center gap-1">
                          <Clock size={12} className="text-slate-400" />
                          <span>{st.benchmarkLabel}</span>
                        </span>
                      </td>

                      {/* Expected Credits */}
                      <td className="py-3 px-3 text-center whitespace-nowrap font-mono text-slate-600 table-cell-center">
                        {st.expectedCredits} TC
                      </td>

                      {/* Earned Credits */}
                      <td className="py-3 px-3 text-center whitespace-nowrap font-mono font-bold text-slate-900 table-cell-center">
                        {st.earnedCredits} TC
                      </td>

                      {/* Credit Difference */}
                      <td className="py-3 px-3 text-center whitespace-nowrap font-mono font-bold table-cell-center">
                        {st.creditDifference < 0 ? (
                          <span className="text-rose-600">{st.creditDifferenceText}</span>
                        ) : (
                          <span className="text-emerald-600">
                            {st.creditDifference > 0 ? `+${st.creditDifference} TC` : "0 TC"}
                          </span>
                        )}
                      </td>

                      {/* Missing Required Courses */}
                      <td className="py-3 px-3 text-center whitespace-nowrap table-cell-center">
                        {st.missingRequiredCoursesCount > 0 ? (
                          <TextLabel className="inline-flex items-center text-[11px] font-bold text-rose-700">
                            Thiếu {st.missingRequiredCoursesCount} HP
                          </TextLabel>
                        ) : (
                          <span className="text-slate-400 font-mono">0</span>
                        )}
                      </td>

                      {/* Status */}
                      <td className="py-3 px-3 text-center whitespace-nowrap table-cell-center">
                        {isOnTrack ? (
                          <TextLabel className="inline-flex items-center gap-1 text-xs font-semibold text-emerald-700">

                            <span>Đúng tiến độ</span>
                          </TextLabel>
                        ) : (
                          <TextLabel
                            className="inline-flex items-center gap-1 text-xs font-semibold text-rose-700"
                            title={st.statusReason}
                          >

                            <span>{st.progressStatus === "UNKNOWN" ? "Cần đối soát" : "Chậm tiến độ"}</span>
                          </TextLabel>
                        )}
                      </td>

                      {/* Action */}
                      <td className="py-3 px-3.5 text-center whitespace-nowrap table-cell-center" onClick={(e) => e.stopPropagation()}>
                        <TableAction
                          icon={Eye}
                          label="Chi tiết"
                          aria-haspopup="dialog"
                          onClick={() => setSelectedStudent(st)}
                        />
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

      {selectedStudent && (
        <Modal
          isOpen
          onClose={() => setSelectedStudent(null)}
          title={`Tiến độ học tập • ${selectedStudent.fullName}`}
          description={
            <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
              <span className="font-mono font-semibold text-slate-700">{selectedStudent.studentId}</span>
              <span>•</span>
              <span>Lớp: {selectedStudent.className || "—"}</span>
              <span>•</span>
              <span>Khóa: {selectedStudent.cohortCode || "—"}</span>
              {selectedStudent.studyCohortCode && (
                <><span>•</span><span>{selectedStudent.studyScheduleSource === "REGISTRATION_SEQUENCE" ? "Mốc học tương ứng: " : "Học theo: "}{selectedStudent.studyCohortCode}</span></>
              )}
              {selectedStudent.programCode && (
                <><span>•</span><span>CTĐT: {selectedStudent.programCode}</span></>
              )}
            </div>
          }
          maxWidth="6xl"
          footer={
            <>
              <Link
                href={`/students/${encodeURIComponent(selectedStudent.id)}`}
                className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3.5 py-2 text-xs font-semibold text-slate-700 transition hover:bg-slate-50"
              >
                <span>Hồ sơ sinh viên</span>
                <ArrowRight size={13} />
              </Link>
              <button
                type="button"
                onClick={() => setSelectedStudent(null)}
                className="rounded-xl bg-slate-900 px-4 py-2 text-xs font-semibold text-white transition hover:bg-slate-800"
              >
                Đóng
              </button>
            </>
          }
        >
          <StudentProgressDetail
            key={selectedStudent.id}
            studentId={selectedStudent.id}
            showStudentHeader={false}
          />
        </Modal>
      )}
    </div>
  );
}
