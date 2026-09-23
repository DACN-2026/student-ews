"use client";

import React, { useCallback, useEffect, useState } from "react";
import {
  AlertCircle,
  Award,
  Calendar,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  Clock,
  Layers,
  RefreshCw,
  TrendingDown,
  TrendingUp,
  XCircle,
} from "lucide-react";
import { apiFetch } from "@/lib/api-client";
import type {
  CourseProgressStatus,
  CourseTimelineCategory,
  StudentTrainingProgressData,
} from "./types";

interface Props {
  studentId?: string;
  initialData?: StudentTrainingProgressData | null;
  onRefresh?: () => void;
  showStudentHeader?: boolean;
}

export default function StudentProgressDetail({
  studentId,
  initialData = null,
  onRefresh,
  showStudentHeader = true,
}: Props) {
  const [fetchedData, setFetchedData] = useState<StudentTrainingProgressData | null>(null);
  const data = initialData || fetchedData;
  const [loading, setLoading] = useState<boolean>(!initialData && Boolean(studentId));
  const [error, setError] = useState<string | null>(null);

  // Semesters accordion expand/collapse state
  const [expandedSemesters, setExpandedSemesters] = useState<Record<number, boolean>>(() => {
    const newExpanded: Record<number, boolean> = {};
    if (initialData) {
      const currentBenchmark =
        initialData.scheduleProgress?.expectedSemesterNo ||
        initialData.scheduleProgress?.currentBenchmarkSemester ||
        1;
      initialData.semesters.forEach((sem) => {
        const isPastDue = sem.isPastDue ?? sem.status === "INCOMPLETE";
        if (sem.semesterNo <= currentBenchmark + 1 || isPastDue) {
          newExpanded[sem.semesterNo] = true;
        }
      });
    }
    return newExpanded;
  });


  const handleManualRefresh = useCallback(async () => {
    if (!studentId) return;
    setLoading(true);
    setError(null);
    try {
      const res = await apiFetch(`/api/v1/students/${encodeURIComponent(studentId)}/training-progress`);
      if (!res.ok) {
        const errJson = await res.json().catch(() => null);
        throw new Error(
          errJson?.error?.message || `Lỗi tải tiến độ đào tạo (${res.status})`
        );
      }
      const json: StudentTrainingProgressData = await res.json();
      setFetchedData(json);

      // Auto expand benchmark & overdue semesters
      const newExpanded: Record<number, boolean> = {};
      const currentBenchmark =
        json.scheduleProgress?.expectedSemesterNo ||
        json.scheduleProgress?.currentBenchmarkSemester ||
        1;
      json.semesters.forEach((sem) => {
        const isPastDue = sem.isPastDue ?? sem.status === "INCOMPLETE";
        if (
          sem.semesterNo <= currentBenchmark + 1 ||
          isPastDue ||
          sem.courses.some((c) => c.status === "FAILED" || c.status === "NO_SCORE")
        ) {
          newExpanded[sem.semesterNo] = true;
        }
      });
      setExpandedSemesters(newExpanded);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Đã có lỗi xảy ra");
    } finally {
      setLoading(false);
    }
  }, [studentId]);

  useEffect(() => {
    if (initialData || !studentId) return;
    let active = true;

    async function run() {
      try {
        const res = await apiFetch(`/api/v1/students/${encodeURIComponent(studentId!)}/training-progress`);
        if (!res.ok) {
          const errJson = await res.json().catch(() => null);
          throw new Error(
            errJson?.error?.message || `Lỗi tải tiến độ đào tạo (${res.status})`
          );
        }
        const json: StudentTrainingProgressData = await res.json();
        if (!active) return;
        setFetchedData(json);

        const newExpanded: Record<number, boolean> = {};
        const currentBenchmark =
          json.scheduleProgress?.expectedSemesterNo ||
          json.scheduleProgress?.currentBenchmarkSemester ||
          1;
        json.semesters.forEach((sem) => {
          const isPastDue = sem.isPastDue ?? sem.status === "INCOMPLETE";
          if (
            sem.semesterNo <= currentBenchmark + 1 ||
            isPastDue ||
            sem.courses.some((c) => c.status === "FAILED" || c.status === "NO_SCORE")
          ) {
            newExpanded[sem.semesterNo] = true;
          }
        });
        setExpandedSemesters(newExpanded);
      } catch (err: unknown) {
        if (!active) return;
        setError(err instanceof Error ? err.message : "Đã có lỗi xảy ra");
      } finally {
        if (active) setLoading(false);
      }
    }

    void run();
    return () => {
      active = false;
    };
  }, [initialData, studentId]);

  const toggleSemester = (semNo: number) => {
    setExpandedSemesters((prev) => ({
      ...prev,
      [semNo]: !prev[semNo],
    }));
  };

  const expandAllSemesters = () => {
    if (!data) return;
    const next: Record<number, boolean> = {};
    data.semesters.forEach((s) => {
      next[s.semesterNo] = true;
    });
    setExpandedSemesters(next);
  };

  const collapseAllSemesters = () => {
    setExpandedSemesters({});
  };

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center p-12 text-slate-500 bg-white rounded-2xl border border-slate-200">
        <RefreshCw className="animate-spin text-lime-600 mb-3" size={28} />
        <p className="text-sm font-medium">Đang tính toán tiến độ đào tạo theo chuẩn CTĐT...</p>
        <span className="text-xs text-slate-400 mt-1">Hệ thống đang đối chiếu học phần và nhóm tự chọn</span>
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-6 rounded-2xl border border-rose-200 bg-rose-50 text-rose-800">
        <div className="flex items-start gap-3">
          <AlertCircle className="shrink-0 mt-0.5 text-rose-600" size={20} />
          <div className="flex-1">
            <h4 className="text-sm font-bold">Không thể tải thông tin tiến độ đào tạo</h4>
            <p className="text-xs mt-1 text-rose-700">{error}</p>
            <button
              type="button"
              onClick={() => void handleManualRefresh()}
              className="mt-3 inline-flex items-center gap-1.5 px-3 py-1.5 bg-rose-600 hover:bg-rose-700 text-white text-xs font-semibold rounded-lg shadow-xs transition"
            >
              <RefreshCw size={12} /> Thử lại
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="p-8 text-center text-slate-400 border border-dashed rounded-2xl">
        Chưa có dữ liệu tiến độ đào tạo của sinh viên.
      </div>
    );
  }

  const { student, curriculum, summary, scheduleProgress, semesters } = data;


  // Normalized summary numbers
  const completedCredits = summary.completedCredits || 0;
  const requiredCredits = summary.requiredCredits;
  const completionPercentage =
    summary.progressPercent != null
      ? summary.progressPercent
      : summary.completionPercentage != null
      ? summary.completionPercentage
      : requiredCredits && requiredCredits > 0
      ? Math.round((completedCredits / requiredCredits) * 100)
      : null;

  const passedCount = summary.completedCourses ?? summary.passedCoursesCount ?? 0;
  const failedCount = summary.failedCourses ?? summary.failedCoursesCount ?? 0;
  const noScoreCount = summary.noScoreCourses ?? summary.noScoreCoursesCount ?? 0;
  const notCompletedCount = summary.notCompletedCourses ?? summary.notCompletedCoursesCount ?? 0;
  const overdueCredits = scheduleProgress.overdueCredits ?? summary.overdueCredits ?? 0;
  const aheadCredits = scheduleProgress.aheadCredits ?? summary.aheadCredits ?? 0;

  // Determine active studying semester from NO_SCORE courses:
  // "Ở học kì mà có nhiều môn 'Chưa có điểm' thì đó là học kì 'đang theo học' của sinh viên đó"
  const semesterWithMostNoScore = [...semesters]
    .map((s) => ({
      semNo: s.semesterNo,
      noScoreCount: s.courses.filter((c) => c.status === "NO_SCORE").length,
    }))
    .filter((x) => x.noScoreCount > 0)
    .sort((a, b) => b.noScoreCount - a.noScoreCount)[0];

  const studyingSemesterNo =
    semesterWithMostNoScore?.semNo ??
    scheduleProgress.expectedSemesterNo ??
    1;
  const studyingYear = Math.ceil(studyingSemesterNo / 2);
  const studyingTerm = studyingSemesterNo % 2 === 1 ? "HK1" : "HK2";

  const benchmarkLabel =
    semesterWithMostNoScore
      ? `Năm ${studyingYear} - ${studyingTerm} (Học kỳ ${studyingSemesterNo})`
      : scheduleProgress.benchmarkLabel ||
        (scheduleProgress.expectedYear && scheduleProgress.expectedSemester
          ? `Năm ${scheduleProgress.expectedYear} - HK${scheduleProgress.expectedSemester} (Học kỳ ${scheduleProgress.expectedSemesterNo})`
          : `Học kỳ ${scheduleProgress.expectedSemesterNo || 1}`);

  const totalFailedCredits = semesters
    .flatMap((s) => s.courses)
    .filter((c) => c.status === "FAILED")
    .reduce((sum, c) => sum + c.credits, 0);

  const isTrulyBehind = totalFailedCredits > 0;

  // Last fully completed semester before studyingSemesterNo with 0 failed courses
  const firstFailedSemNo = semesters
    .filter((s) => s.semesterNo < studyingSemesterNo && s.courses.some((c) => c.status === "FAILED"))
    .map((s) => s.semesterNo)
    .sort((a, b) => a - b)[0];

  const effectiveLastCompletedSem =
    firstFailedSemNo != null
      ? firstFailedSemNo - 1
      : Math.max(0, studyingSemesterNo - 1);

  return (
    <div className="space-y-6">
      {/* Student Top Header Banner (Optional) */}
      {showStudentHeader && (
        <div className="rounded-2xl border border-slate-200 bg-linear-to-r from-slate-900 via-slate-800 to-slate-900 p-5 text-white shadow-xs">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <div className="space-y-1">
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-mono text-xs font-bold uppercase tracking-wider text-lime-400">
                  {student.studentCode}
                </span>
                <span className="text-slate-500">•</span>
                <span className="text-xs text-slate-300">Lớp: {student.className || student.classCode || "—"}</span>
                <span className="text-slate-500">•</span>
                <span className="text-xs text-slate-300">Khóa: {student.cohortCode || "—"}</span>
              </div>
              <h2 className="text-xl font-bold tracking-tight text-white sm:text-2xl">
                {student.fullName}
              </h2>
              <p className="text-xs text-slate-300">
                Chương trình đào tạo:{" "}
                <span className="font-semibold text-white">
                  {curriculum.programName || student.programCode || "Chương trình chuẩn"}
                </span>{" "}
                ({curriculum.programCode || "—"})
              </p>
            </div>

            <div className="flex items-center gap-2 self-start sm:self-auto">
              <button
                type="button"
                onClick={() => {
                  if (onRefresh) onRefresh();
                  else void handleManualRefresh();
                }}
                className="inline-flex items-center gap-1.5 rounded-xl bg-white/10 px-3 py-2 text-xs font-semibold text-white backdrop-blur-xs transition hover:bg-white/20"
                title="Làm mới tiến độ"
              >
                <RefreshCw size={14} />
                Làm mới
              </button>
            </div>
          </div>
        </div>
      )}


      {/* ========================================================================= */}
      {/* PHẦN A: TỔNG QUAN TIẾN ĐỘ                                                 */}
      {/* ========================================================================= */}
      <section aria-labelledby="section-overview" className="space-y-3">
        <div className="flex items-center justify-between">
          <h3 id="section-overview" className="text-sm font-bold uppercase tracking-wider text-slate-600 flex items-center gap-2">
            <Award size={16} className="text-lime-600" />
            Phần A: Tổng quan tiến độ tích lũy
          </h3>
          <span className="text-xs text-slate-400">
            Khung CTĐT: {curriculum.totalCourses} học phần ({curriculum.totalCurriculumCredits ?? curriculum.totalCreditsInCurriculum ?? 0} TC)
          </span>
        </div>

        {/* Big KPI Metric Grid */}
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {/* 1. Tín chỉ hoàn thành / Yêu cầu */}
          <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-2xs">
            <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">
              Tín chỉ hoàn thành
            </span>
            <div className="mt-1.5 flex items-baseline gap-1.5 font-mono">
              <span className="text-2xl font-extrabold text-slate-900">
                {completedCredits}
              </span>
              <span className="text-xs font-medium text-slate-400">
                / {requiredCredits != null ? `${requiredCredits} TC` : "Chưa xác định"}
              </span>
            </div>

            {/* Progress Bar */}
            <div className="mt-3">
              <div className="flex justify-between text-[11px] font-medium text-slate-500 mb-1">
                <span>Tỷ lệ hoàn thành</span>
                <span className="font-mono font-bold text-slate-800">
                  {completionPercentage != null ? `${completionPercentage}%` : "—"}
                </span>
              </div>
              <div className="h-2 w-full overflow-hidden rounded-full bg-slate-100">
                <div
                  className="h-full rounded-full bg-linear-to-r from-lime-500 to-emerald-600 transition-all duration-500"
                  style={{ width: `${Math.min(100, completionPercentage || 0)}%` }}
                />
              </div>
            </div>

            {requiredCredits == null && (
              <p className="mt-2 text-[10px] text-amber-700 italic">
                * Chưa có quy chế tổng tín chỉ CTĐT, hiển thị theo số TC tích lũy thực tế.
              </p>
            )}
          </div>

          {/* 2. Số học phần đã đạt */}
          <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-2xs">
            <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">
              Học phần đã đạt
            </span>
            <div className="mt-1.5 flex items-baseline gap-2 font-mono">
              <span className="text-2xl font-extrabold text-emerald-700">
                {passedCount}
              </span>
              <span className="text-xs font-medium text-slate-400">học phần</span>
            </div>
            <div className="mt-3 flex items-center gap-1.5 text-xs text-emerald-700 font-medium">
              <CheckCircle2 size={14} />
              <span>Đã tích lũy thành công</span>
            </div>
            <span className="text-[10px] text-slate-400 mt-1 block">
              Môn học lại chỉ tính tín chỉ 1 lần duy nhất
            </span>
          </div>

          {/* 3. Số học phần chưa đạt */}
          <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-2xs">
            <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">
              Học phần chưa đạt (Rớt)
            </span>
            <div className="mt-1.5 flex items-baseline gap-2 font-mono">
              <span
                className={`text-2xl font-extrabold ${
                  failedCount > 0 ? "text-rose-600" : "text-slate-800"
                }`}
              >
                {failedCount}
              </span>
              <span className="text-xs font-medium text-slate-400">học phần</span>
            </div>
            <div
              className={`mt-3 flex items-center gap-1.5 text-xs font-medium ${
                failedCount > 0 ? "text-rose-700" : "text-slate-500"
              }`}
            >
              {failedCount > 0 ? (
                <>
                  <XCircle size={14} className="text-rose-500" />
                  <span>Cần đăng ký học lại</span>
                </>
              ) : (
                <>
                  <CheckCircle2 size={14} className="text-slate-400" />
                  <span>Không có môn nợ điểm rớt</span>
                </>
              )}
            </div>
            <span className="text-[10px] text-slate-400 mt-1 block">
              Điểm chữ F hoặc không đạt điều kiện qua môn
            </span>
          </div>

          {/* 4. Số học phần chưa có điểm / chưa hoàn thành */}
          <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-2xs">
            <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">
              Chưa có điểm / Chưa học
            </span>
            <div className="mt-1.5 flex items-baseline gap-2 font-mono">
              <span
                className={`text-2xl font-extrabold ${
                  noScoreCount > 0 ? "text-amber-600" : "text-slate-800"
                }`}
              >
                {noScoreCount}
              </span>
              <span className="text-xs font-medium text-slate-400">
                chưa điểm / {notCompletedCount} chưa học
              </span>
            </div>
            <div className="mt-3 flex items-center gap-1.5 text-xs text-slate-600 font-medium">
              <Clock size={14} className="text-amber-500" />
              <span>
                {noScoreCount > 0
                  ? "Đang chờ cập nhật bảng điểm"
                  : "Đã hoàn thành nhập điểm đầy đủ"}
              </span>
            </div>
            <span className="text-[10px] text-slate-400 mt-1 block">
              Không mặc định &quot;đang học&quot; nếu chưa có điểm
            </span>
          </div>
        </div>
      </section>

      {/* ========================================================================= */}
      {/* PHẦN B: TRẠNG THÁI SO VỚI KẾ HOẠCH                                       */}
      {/* ========================================================================= */}
      <section aria-labelledby="section-schedule" className="rounded-2xl border border-slate-200 bg-white p-5 shadow-2xs space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 border-b border-slate-100 pb-3">
          <div>
            <h3 id="section-schedule" className="text-sm font-bold text-slate-900 flex items-center gap-2">
              <Calendar size={17} className="text-blue-600" />
              Phần B: Trạng thái đối chiếu so với kế hoạch chuẩn (Timeline)
            </h3>
            <p className="text-xs text-slate-500 mt-0.5">
              So khớp với mốc học kỳ dự kiến của khóa sinh viên ({student.cohortCode || "Hiện hành"})
            </p>
          </div>

          {/* Status Badges Group (Supports both Behind and Ahead simultaneously) */}
          <div className="flex flex-wrap items-center gap-2">
            {!isTrulyBehind && (
              <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-300 bg-emerald-50 px-3 py-1 text-xs font-bold text-emerald-800">
                <CheckCircle2 size={14} />
                Đúng tiến độ
              </span>
            )}
            {isTrulyBehind && (
              <span className="inline-flex items-center gap-1.5 rounded-full border border-rose-300 bg-rose-50 px-3 py-1 text-xs font-bold text-rose-800">
                <TrendingDown size={14} />
                Chậm tiến độ ({totalFailedCredits} TC nợ môn)
              </span>
            )}
            {scheduleProgress.isAhead && (
              <span className="inline-flex items-center gap-1.5 rounded-full border border-blue-300 bg-blue-50 px-3 py-1 text-xs font-bold text-blue-800">
                <TrendingUp size={14} />
                Học trước kế hoạch ({aheadCredits} TC kỳ tới)
              </span>
            )}
          </div>
        </div>

        {/* Timeline detail cards */}
        <div className="grid gap-3 sm:grid-cols-3">
          {/* Mốc hiện tại */}
          <div className="rounded-xl bg-slate-50/80 p-3.5 border border-slate-200/80">
            <span className="text-[11px] font-semibold text-slate-500">Mốc kế hoạch chuẩn hiện hành</span>
            <div className="mt-1 font-bold text-sm text-slate-900 flex items-center gap-1.5">
              <span className="inline-flex rounded-md bg-white border border-slate-200 px-2 py-0.5 text-xs font-mono font-bold text-blue-700">
                {benchmarkLabel}
              </span>
            </div>
            <p className="mt-1 text-[11px] text-slate-500 leading-relaxed">
              Dựa trên năm nhập học của khóa và học kỳ đào tạo đang vận hành.
            </p>
          </div>

          {/* Kỳ gần nhất hoàn thành đầy đủ */}
          <div className="rounded-xl bg-slate-50/80 p-3.5 border border-slate-200/80">
            <span className="text-[11px] font-semibold text-slate-500">Kỳ hoàn thành trọn vẹn gần nhất</span>
            <div className="mt-1 font-bold text-sm text-slate-900">
              {effectiveLastCompletedSem != null && effectiveLastCompletedSem > 0 ? (
                <span className="inline-flex items-center gap-1 text-emerald-700 font-mono">
                  <CheckCircle2 size={14} />
                  Học kỳ {effectiveLastCompletedSem}
                </span>
              ) : (
                <span className="text-slate-500 font-normal italic text-xs">
                  Chưa có học kỳ nào đạt trọn vẹn 100%
                </span>
              )}
            </div>
            <p className="mt-1 text-[11px] text-slate-500 leading-relaxed">
              Tất cả môn bắt buộc và chỉ tiêu tự chọn của kỳ đó đều đã hoàn tất.
            </p>
          </div>

          {/* Chi tiết nợ / trước */}
          <div className="rounded-xl bg-slate-50/80 p-3.5 border border-slate-200/80">
            <span className="text-[11px] font-semibold text-slate-500">Biên độ lệch tiến độ</span>
            <div className="mt-1 space-y-1 text-xs">
              <div className="flex justify-between">
                <span className="text-slate-600">Nợ môn (Failed):</span>
                <span className={`font-mono font-bold ${totalFailedCredits > 0 ? "text-rose-600" : "text-slate-700"}`}>
                  {totalFailedCredits} TC
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-600">Học vượt kỳ sau (Ahead):</span>
                <span className={`font-mono font-bold ${aheadCredits > 0 ? "text-blue-600" : "text-slate-700"}`}>
                  {aheadCredits} TC
                </span>
              </div>
            </div>
          </div>
        </div>
      </section>



      {/* ========================================================================= */}
      {/* PHẦN C: TIẾN ĐỘ THEO TỪNG HỌC KỲ                                         */}
      {/* ========================================================================= */}
      <section aria-labelledby="section-semesters" className="space-y-3">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
          <div>
            <h3 id="section-semesters" className="text-sm font-bold uppercase tracking-wider text-slate-600 flex items-center gap-2">
              <Layers size={16} className="text-indigo-600" />
              Phần C: Tiến độ chi tiết theo từng học kỳ
            </h3>
            <p className="text-xs text-slate-400 mt-0.5">
              Phân cấp theo từng năm học và học kỳ lộ trình chuẩn của chương trình đào tạo
            </p>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={expandAllSemesters}
              className="text-xs font-semibold text-slate-600 hover:text-slate-900 underline underline-offset-2"
            >
              Mở tất cả
            </button>
            <span className="text-slate-300">•</span>
            <button
              type="button"
              onClick={collapseAllSemesters}
              className="text-xs font-semibold text-slate-600 hover:text-slate-900 underline underline-offset-2"
            >
              Thu gọn
            </button>
          </div>
        </div>

        <div className="space-y-3">
          {semesters.map((sem) => {
            const isExpanded = expandedSemesters[sem.semesterNo] ?? false;
            const semPlannedCredits = sem.plannedCredits ?? sem.requiredCredits ?? 0;
            const semCompPercentage =
              sem.completionPercentage ??
              (semPlannedCredits > 0 ? Math.round((sem.completedCredits / semPlannedCredits) * 100) : 0);

            const isCurrentStudying = sem.semesterNo === studyingSemesterNo;
            const isFutureSemester = sem.semesterNo > studyingSemesterNo;
            const isPastSemester = sem.semesterNo < studyingSemesterNo;

            const hasFailedCourses = sem.courses.some((c) => c.status === "FAILED");
            const isOwedSemester = isPastSemester && hasFailedCourses;
            const isPassedSemester = isPastSemester && !hasFailedCourses;

            return (
              <div
                key={sem.semesterNo}
                className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xs transition-all"
              >
                {/* Accordion Header */}
                <button
                  type="button"
                  onClick={() => toggleSemester(sem.semesterNo)}
                  className={`w-full flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 px-4 py-3.5 text-left transition hover:bg-slate-50 ${
                    isCurrentStudying ? "bg-blue-50/40" : "bg-white"
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <span className="text-slate-400">
                      {isExpanded ? <ChevronDown size={18} /> : <ChevronRight size={18} />}
                    </span>
                    <span className="inline-flex rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-1 font-mono text-xs font-bold text-slate-800">
                      HK {sem.semesterNo}
                    </span>
                    <div>
                      <div className="flex items-center gap-2">
                        <strong className="text-sm font-bold text-slate-900">
                          {sem.name || sem.semesterLabel || `Học kỳ ${sem.semesterNo}`}
                        </strong>
                        {isCurrentStudying && (
                          <span className="rounded-md bg-blue-100 px-2 py-0.5 text-[10px] font-bold text-blue-800">
                            Kỳ hiện hành
                          </span>
                        )}
                        {isOwedSemester && (
                          <span className="rounded-md bg-rose-100 px-2 py-0.5 text-[10px] font-bold text-rose-800">
                            Chưa hoàn tất
                          </span>
                        )}
                      </div>
                      <span className="text-xs text-slate-500">
                        {sem.courses.length} học phần • Kế hoạch: {semPlannedCredits} TC
                      </span>
                    </div>
                  </div>

                  {/* Right Progress & Status Badges */}
                  <div className="flex items-center gap-4 self-end sm:self-auto">
                    <div className="text-right">
                      <div className="font-mono text-xs font-bold text-slate-900">
                        {sem.completedCredits} / {semPlannedCredits} TC
                      </div>
                      <div className="text-[10px] text-slate-400">
                        Đạt {semCompPercentage}%
                      </div>
                    </div>

                    <div className="w-16 sm:w-24">
                      <div className="h-2 w-full overflow-hidden rounded-full bg-slate-100">
                        <div
                          className={`h-full rounded-full ${
                            isCurrentStudying
                              ? "bg-blue-500"
                              : isFutureSemester
                              ? "bg-slate-300"
                              : isOwedSemester
                              ? "bg-rose-500"
                              : "bg-emerald-500"
                          }`}
                          style={{ width: `${Math.min(100, semCompPercentage)}%` }}
                        />
                      </div>
                    </div>

                    <span
                      className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-[11px] font-bold ${
                        isCurrentStudying
                          ? "border-blue-200 bg-blue-50 text-blue-800"
                          : isFutureSemester
                          ? "border-slate-200 bg-slate-100 text-slate-600"
                          : isOwedSemester
                          ? "border-rose-200 bg-rose-50 text-rose-800"
                          : "border-emerald-200 bg-emerald-50 text-emerald-800"
                      }`}
                    >
                      {isCurrentStudying ? (
                        <>Đang theo học</>
                      ) : isFutureSemester ? (
                        <>Kỳ sau</>
                      ) : isOwedSemester ? (
                        <>
                          <XCircle size={12} /> Nợ môn
                        </>
                      ) : (
                        <>
                          <CheckCircle2 size={12} /> Đạt kỳ
                        </>
                      )}
                    </span>
                  </div>
                </button>

                {/* Accordion Table Body */}
                {isExpanded && (
                  <div className="border-t border-slate-100 px-4 py-3">
                    <div className="overflow-x-auto">
                      <table className="w-full text-left text-xs">
                        <thead>
                          <tr className="border-b border-slate-200 bg-slate-50 text-[10px] font-bold uppercase tracking-wider text-slate-500">
                            <th className="py-2.5 px-3">Mã HP</th>
                            <th className="py-2.5 px-3">Tên học phần</th>
                            <th className="py-2.5 px-2 text-center">TC</th>
                            <th className="py-2.5 px-3">Loại HP</th>
                            <th className="py-2.5 px-3">Trạng thái</th>
                            <th className="py-2.5 px-2 text-center">Điểm 10</th>
                            <th className="py-2.5 px-2 text-center">Điểm 4</th>
                            <th className="py-2.5 px-2 text-center">Chữ</th>
                            <th className="py-2.5 px-3">Kỳ hoàn thành</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                          {sem.courses.length === 0 ? (
                            <tr>
                              <td colSpan={9} className="py-4 text-center text-slate-400">
                                Không có môn học nào trong học kỳ này.
                              </td>
                            </tr>
                          ) : (
                            sem.courses.map((c) => (
                              <tr
                                key={c.courseId || c.courseCode}
                                className={`transition-colors hover:bg-slate-50 ${
                                  c.status === "FAILED"
                                    ? "bg-rose-50/40"
                                    : c.status === "NO_SCORE"
                                    ? "bg-amber-50/40"
                                    : ""
                                }`}
                              >
                                <td className="py-2.5 px-3 font-mono font-bold text-slate-900">
                                  {c.courseCode}
                                </td>
                                <td className="py-2.5 px-3 font-medium text-slate-800">
                                  {c.courseName}
                                  {c.choiceGroupCode && (
                                    <span className="ml-1.5 inline-flex rounded bg-purple-100 px-1.5 py-0.2 text-[9px] font-bold text-purple-800">
                                      TC: {c.choiceGroupCode}
                                    </span>
                                  )}
                                </td>
                                <td className="py-2.5 px-2 font-mono text-center text-slate-700">
                                  {c.credits}
                                </td>
                                <td className="py-2.5 px-3 text-slate-600">
                                  {c.requirementType === "mandatory" ? (
                                    <span className="font-semibold text-slate-700">Bắt buộc</span>
                                  ) : (
                                    <span className="text-purple-700 font-medium">Tự chọn</span>
                                  )}
                                </td>
                                <td className="py-2.5 px-3">
                                  <CourseStatusBadge
                                    status={c.status}
                                    timeline={c.timelineCategory ?? null}
                                    isFutureSemester={isFutureSemester}
                                  />
                                </td>
                                <td className="py-2.5 px-2 font-mono text-center text-slate-800">
                                  {c.latestScore10 != null ? c.latestScore10.toFixed(1) : "—"}
                                </td>
                                <td className="py-2.5 px-2 font-mono text-center text-slate-800">
                                  {c.latestScore4 != null ? c.latestScore4.toFixed(1) : "—"}
                                </td>
                                <td className="py-2.5 px-2 font-mono font-bold text-center text-slate-900">
                                  {c.latestLetterCode || "—"}
                                </td>
                                <td className="py-2.5 px-3 font-mono text-slate-600">
                                  {c.passedAcademicYear && c.passedTermCode ? (
                                    <span className="inline-flex rounded bg-emerald-50 border border-emerald-200 px-1.5 py-0.5 text-[10px] font-bold text-emerald-800">
                                      {c.passedTermCode} ({c.passedAcademicYear})
                                    </span>
                                  ) : (
                                    "—"
                                  )}
                                </td>
                              </tr>
                            ))
                          )}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </section>

    </div>
  );
}

// ============================================================================
// Sub-components
// ============================================================================

function CourseStatusBadge({
  status,
  timeline,
  isFutureSemester,
}: {
  status: CourseProgressStatus;
  timeline?: CourseTimelineCategory | null;
  isFutureSemester?: boolean;
}) {
  if (status === "PASSED") {
    return (
      <span className="inline-flex items-center gap-1 rounded-md border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-[11px] font-bold text-emerald-800">
        <CheckCircle2 size={11} /> Đã đạt
      </span>
    );
  }
  if (status === "FAILED") {
    return (
      <span className="inline-flex items-center gap-1 rounded-md border border-rose-200 bg-rose-50 px-2 py-0.5 text-[11px] font-bold text-rose-800">
        <XCircle size={11} /> Chưa đạt (Rớt)
      </span>
    );
  }
  if (status === "NO_SCORE") {
    return (
      <span className="inline-flex items-center gap-1 rounded-md border border-amber-200 bg-amber-50 px-2 py-0.5 text-[11px] font-bold text-amber-800">
        <Clock size={11} /> Chưa có điểm
      </span>
    );
  }

  // NOT_COMPLETED
  if (isFutureSemester || timeline === "FUTURE") {
    return (
      <span className="inline-flex items-center gap-1 rounded-md border border-slate-200 bg-slate-50 px-2 py-0.5 text-[11px] font-medium text-slate-500">
        Chưa học
      </span>
    );
  }

  return (
    <span className="inline-flex items-center gap-1 rounded-md border border-slate-200 bg-slate-100 px-2 py-0.5 text-[11px] font-medium text-slate-600">
      Chưa đăng ký
    </span>
  );
}


