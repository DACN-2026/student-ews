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

  // Active studying semester from scheduleProgress or fallback
  const studyingSemesterNo =
    scheduleProgress.expectedSemesterNo ??
    1;
  const studyingYear = scheduleProgress.expectedYear ?? Math.ceil(studyingSemesterNo / 2);
  const studyingTerm = scheduleProgress.expectedSemester ?? (studyingSemesterNo % 2 === 1 ? "HK1" : "HK2");

  const benchmarkLabel =
    scheduleProgress.benchmarkLabel ||
    `Năm ${studyingYear} - ${studyingTerm} (Học kỳ ${studyingSemesterNo})`;

  const effectiveLastCompletedSem =
    scheduleProgress.latestCompletedSemester ??
    Math.max(0, studyingSemesterNo - 1);

  // Normalized progress indicators
  const progressStatus = scheduleProgress.progressStatus ?? (scheduleProgress.isOnTrack && !scheduleProgress.isBehind ? "ON_TRACK" : "BEHIND");
  const isOnTrack = progressStatus === "ON_TRACK";
  const isBehind = progressStatus === "BEHIND";

  const expectedCreditsToDate = scheduleProgress.expectedCreditsToDate ?? 0;
  const earnedCreditsToDate = scheduleProgress.earnedCreditsToDate ?? completedCredits;
  const creditDifference = scheduleProgress.creditDifference ?? (earnedCreditsToDate - expectedCreditsToDate);
  const creditDifferenceText = scheduleProgress.creditDifferenceText || (
    creditDifference < 0 ? `Chậm ${Math.abs(creditDifference)} TC` : creditDifference > 0 ? `Học vượt +${creditDifference} TC` : "Đúng kế hoạch"
  );

  const missingRequiredCourses = scheduleProgress.missingRequiredCourses ?? [];
  const missingRequiredCount = scheduleProgress.missingRequiredCoursesCount ?? missingRequiredCourses.length;
  const missingRequiredCredits = scheduleProgress.missingRequiredCredits ?? missingRequiredCourses.reduce((sum, c) => sum + c.credits, 0);
  const completedRequiredCount = scheduleProgress.completedRequiredCoursesCount ?? 0;
  const expectedRequiredCount = scheduleProgress.expectedRequiredCoursesCount ?? (completedRequiredCount + missingRequiredCount);

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
      {/* TỔNG QUAN TIẾN ĐỘ ĐẾN MỐC HIỆN TẠI (SUMMARY NGẮN GỌN)                    */}
      {/* ========================================================================= */}
      <section aria-labelledby="section-progress-summary" className="rounded-2xl border border-slate-200 bg-white p-5 shadow-2xs space-y-4">
        {/* Header row with milestone & status */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 border-b border-slate-100 pb-3.5">
          <div>
            <div className="flex items-center gap-2">
              <h3 id="section-progress-summary" className="text-xs font-bold uppercase tracking-wider text-slate-500">
                Tiến độ đào tạo đến mốc
              </h3>
              <span className="rounded-md bg-slate-100 px-2 py-0.5 font-mono text-xs font-bold text-slate-800 border border-slate-200">
                {effectiveLastCompletedSem != null && effectiveLastCompletedSem > 0
                  ? `Đến hết Học kỳ ${effectiveLastCompletedSem}`
                  : "Chưa có kỳ kết thúc"}
              </span>
            </div>
            <p className="text-xs text-slate-500 mt-1">
              Kỳ hiện tại: <strong className="text-slate-800 font-semibold">{benchmarkLabel}</strong> (Đang theo học – chưa dùng để đánh giá tiến độ)
            </p>
          </div>

          {/* Status Badges */}
          <div className="flex flex-wrap items-center gap-2">
            {isOnTrack ? (
              <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-300 bg-emerald-50 px-3.5 py-1 text-xs font-bold text-emerald-800 shadow-2xs">
                <CheckCircle2 size={13} className="text-emerald-600" />
                Đúng tiến độ
              </span>
            ) : (
              <span className="inline-flex items-center gap-1.5 rounded-full border border-rose-300 bg-rose-50 px-3.5 py-1 text-xs font-bold text-rose-800 shadow-2xs">
                <AlertCircle size={13} className="text-rose-600" />
                Chậm tiến độ
              </span>
            )}

            {creditDifference > 0 && (
              <span className="inline-flex items-center gap-1.5 rounded-full border border-blue-300 bg-blue-50 px-3.5 py-1 text-xs font-bold text-blue-800 shadow-2xs">
                <TrendingUp size={13} className="text-blue-600" />
                Học vượt (+{creditDifference} TC)
              </span>
            )}
          </div>
        </div>

        {/* 4 Minimalist Metric Cards */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
          <div className="p-3.5 rounded-xl bg-slate-50/70 border border-slate-200/70">
            <span className="text-[11px] font-semibold text-slate-500 block uppercase tracking-wider">Kế hoạch đến mốc</span>
            <span className="text-xl font-bold font-mono text-slate-900 mt-1 block">{expectedCreditsToDate} TC</span>
          </div>

          <div className="p-3.5 rounded-xl bg-slate-50/70 border border-slate-200/70">
            <span className="text-[11px] font-semibold text-slate-500 block uppercase tracking-wider">Đã đạt đến mốc</span>
            <span className="text-xl font-bold font-mono text-slate-900 mt-1 block">{earnedCreditsToDate} TC</span>
          </div>

          <div className="p-3.5 rounded-xl bg-slate-50/70 border border-slate-200/70">
            <span className="text-[11px] font-semibold text-slate-500 block uppercase tracking-wider">Chênh lệch tín chỉ</span>
            <span className={`text-xl font-bold font-mono mt-1 block ${creditDifference < 0 ? "text-rose-600" : creditDifference > 0 ? "text-blue-700" : "text-emerald-700"}`}>
              {creditDifference < 0 ? `-${Math.abs(creditDifference)} TC` : creditDifference > 0 ? `+${creditDifference} TC` : "0 TC"}
            </span>
          </div>

          <div className="p-3.5 rounded-xl bg-slate-50/70 border border-slate-200/70">
            <span className="text-[11px] font-semibold text-slate-500 block uppercase tracking-wider">HP bắt buộc còn thiếu</span>
            <span className={`text-xl font-bold font-mono mt-1 block ${missingRequiredCount > 0 ? "text-rose-600" : "text-emerald-700"}`}>
              {missingRequiredCount > 0 ? `${missingRequiredCount} môn (${missingRequiredCredits} TC)` : "0 môn (Đạt 100%)"}
            </span>
          </div>
        </div>

        {/* Missing Required Courses Callout Section (if any) */}
        {missingRequiredCourses.length > 0 && (
          <div className="rounded-xl border border-rose-200 bg-rose-50/50 p-4 space-y-2">
            <div className="flex items-center gap-2 text-rose-800">
              <AlertCircle size={15} className="text-rose-600 shrink-0" />
              <h4 className="text-xs font-bold uppercase tracking-wider">
                Học phần bắt buộc chưa hoàn thành thuộc các học kỳ đã qua ({missingRequiredCourses.length} môn)
              </h4>
            </div>
            <p className="text-xs text-rose-700 leading-relaxed">
              Sinh viên chưa hoàn thành các học phần bắt buộc đến hạn được xếp loại <strong>Chậm tiến độ</strong> dù tổng số tín chỉ có thể đủ hoặc vượt.
            </p>
            <div className="overflow-x-auto rounded-lg border border-rose-200 bg-white shadow-2xs">
              <table className="w-full text-left text-xs">
                <thead>
                  <tr className="border-b border-rose-100 bg-rose-50/70 text-[10px] font-bold uppercase tracking-wider text-rose-800">
                    <th className="py-2 px-3">Mã HP</th>
                    <th className="py-2 px-3">Tên học phần</th>
                    <th className="py-2 px-2 text-center">TC</th>
                    <th className="py-2 px-3 text-center">Thuộc kỳ</th>
                    <th className="py-2 px-3">Tình trạng</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-rose-100">
                  {missingRequiredCourses.map((mc) => (
                    <tr key={mc.courseCode} className="hover:bg-rose-50/30">
                      <td className="py-2 px-3 font-mono font-bold text-slate-900">{mc.courseCode}</td>
                      <td className="py-2 px-3 font-medium text-slate-800">{mc.courseName}</td>
                      <td className="py-2 px-2 font-mono text-center text-slate-700">{mc.credits}</td>
                      <td className="py-2 px-3 text-center font-mono text-slate-700">HK {mc.semesterNo}</td>
                      <td className="py-2 px-3">
                        <span className="inline-flex items-center gap-1 rounded bg-rose-100 px-2 py-0.5 text-[11px] font-semibold text-rose-800">
                          {mc.reason}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
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
              className="text-xs font-semibold text-slate-600 hover:text-slate-900 underline underline-offset-2 cursor-pointer"
            >
              Mở tất cả
            </button>
            <span className="text-slate-300">•</span>
            <button
              type="button"
              onClick={collapseAllSemesters}
              className="text-xs font-semibold text-slate-600 hover:text-slate-900 underline underline-offset-2 cursor-pointer"
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

            const isCurrentStudying = sem.timelineType === "CURRENT_STUDYING" || sem.semesterNo === studyingSemesterNo;
            const isFutureSemester = sem.timelineType === "FUTURE_PLANNED" || sem.semesterNo > studyingSemesterNo;
            const isPastSemester = sem.timelineType === "PAST_COMPLETED" || sem.semesterNo < studyingSemesterNo;

            const hasFailedCourses = sem.courses.some((c) => c.status === "FAILED");
            const hasMissingMandatory = isPastSemester && sem.courses.some(
              (c) => c.requirementType === "mandatory" && c.status !== "PASSED"
            );
            const isCompletedSemester = isPastSemester && !hasFailedCourses && !hasMissingMandatory && sem.completedCredits >= semPlannedCredits;
            const isOwedSemester = isPastSemester && (hasFailedCourses || hasMissingMandatory || sem.completedCredits < semPlannedCredits);

            const currentStudyingCredits = sem.courses
              .filter((c) => c.status === "NO_SCORE")
              .reduce((sum, c) => sum + c.credits, 0);

            return (
              <div
                key={sem.semesterNo}
                className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xs transition-all"
              >
                {/* Accordion Header */}
                <button
                  type="button"
                  onClick={() => toggleSemester(sem.semesterNo)}
                  className={`w-full flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 px-4 py-3.5 text-left transition hover:bg-slate-50 cursor-pointer ${
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
                            Đang theo học
                          </span>
                        )}
                        {isFutureSemester && (
                          <span className="rounded-md bg-slate-100 px-2 py-0.5 text-[10px] font-medium text-slate-600">
                            Kế hoạch kỳ sau
                          </span>
                        )}
                        {isPastSemester && isCompletedSemester && (
                          <span className="rounded-md bg-emerald-100 px-2 py-0.5 text-[10px] font-bold text-emerald-800">
                            Đạt kỳ
                          </span>
                        )}
                        {isPastSemester && !isCompletedSemester && (
                          <span className="rounded-md bg-rose-100 px-2 py-0.5 text-[10px] font-bold text-rose-800">
                            {sem.completedCredits < semPlannedCredits 
                              ? `Thiếu ${semPlannedCredits - sem.completedCredits} TC` 
                              : hasFailedCourses 
                                ? "Nợ môn" 
                                : hasMissingMandatory 
                                  ? "Thiếu môn Bắt buộc" 
                                  : "Chưa đạt kỳ"}
                          </span>
                        )}
                      </div>
                      {isCurrentStudying ? (
                        <span className="text-xs text-blue-700 font-medium">
                          Đang theo học – chưa dùng để đánh giá tiến độ • Kế hoạch: {semPlannedCredits} TC
                        </span>
                      ) : isFutureSemester ? (
                        <span className="text-xs text-slate-400">
                          Kế hoạch tương lai / Kỳ sau • {sem.courses.length} học phần ({semPlannedCredits} TC)
                        </span>
                      ) : (
                        <span className="text-xs text-slate-500">
                          {sem.courses.length} học phần • Kế hoạch: {semPlannedCredits} TC
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Right Progress & Status Badges */}
                  <div className="flex items-center gap-4 self-end sm:self-auto">
                    <div className="text-right">
                      {isCurrentStudying ? (
                        <>
                          <div className="font-mono text-xs font-bold text-blue-900">
                            {currentStudyingCredits > 0 ? `${currentStudyingCredits} TC đang học` : "Đang theo học"}
                          </div>
                          <div className="text-[10px] text-blue-600">
                            Chưa tính vào tích lũy
                          </div>
                        </>
                      ) : isFutureSemester ? (
                        <>
                          <div className="font-mono text-xs font-bold text-slate-500">
                            0 / {semPlannedCredits} TC
                          </div>
                          <div className="text-[10px] text-slate-400">
                            Kế hoạch kỳ sau
                          </div>
                        </>
                      ) : (
                        <>
                          <div className="font-mono text-xs font-bold text-slate-900">
                            {sem.completedCredits} / {semPlannedCredits} TC
                          </div>
                          <div
                            className={`text-[10px] ${
                              isCompletedSemester
                                ? "text-emerald-700 font-semibold"
                                : "text-rose-600 font-medium"
                            }`}
                          >
                            {isCompletedSemester
                              ? sem.completedCredits > semPlannedCredits
                                ? `Đạt kỳ (+${sem.completedCredits - semPlannedCredits} TC)`
                                : "Đạt kỳ"
                              : sem.completedCredits < semPlannedCredits
                                ? `Thiếu ${semPlannedCredits - sem.completedCredits} TC`
                                : hasFailedCourses
                                  ? "Nợ môn"
                                  : hasMissingMandatory
                                    ? "Thiếu môn Bắt buộc"
                                    : "Chưa đạt kỳ"}
                          </div>
                        </>
                      )}
                    </div>

                    <div className="w-16 sm:w-24">
                      <div className="h-2 w-full overflow-hidden rounded-full bg-slate-100">
                        <div
                          className={`h-full rounded-full transition-all ${
                            isCurrentStudying
                              ? "bg-blue-400"
                              : isFutureSemester
                              ? "bg-slate-200"
                              : isCompletedSemester
                              ? "bg-emerald-500"
                              : "bg-rose-500"
                          }`}
                          style={{
                            width: isCurrentStudying
                              ? "100%"
                              : isFutureSemester
                              ? "0%"
                              : `${Math.min(100, semCompPercentage)}%`,
                          }}
                        />
                      </div>
                    </div>

                    <span
                      className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-[11px] font-bold ${
                        isCurrentStudying
                          ? "border-blue-200 bg-blue-50 text-blue-800"
                          : isFutureSemester
                          ? "border-slate-200 bg-slate-100 text-slate-600"
                          : isCompletedSemester
                          ? "border-emerald-200 bg-emerald-50 text-emerald-800"
                          : "border-rose-200 bg-rose-50 text-rose-800"
                      }`}
                    >
                      {isCurrentStudying ? (
                        <>
                          <Clock size={12} /> Đang theo học
                        </>
                      ) : isFutureSemester ? (
                        <>
                          <Calendar size={12} /> Kỳ sau
                        </>
                      ) : isCompletedSemester ? (
                        <>
                          <CheckCircle2 size={12} /> Đạt kỳ
                        </>
                      ) : (
                        <>
                          <AlertCircle size={12} /> Thiếu {Math.max(0, semPlannedCredits - sem.completedCredits)} TC
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
                                </td>
                                <td className="py-2.5 px-2 font-mono text-center text-slate-700">
                                  {c.credits}
                                </td>
                                <td className="py-2.5 px-3 text-slate-600">
                                  {c.isConditional || c.requirementType === "conditional" ? (
                                    <span className="inline-flex rounded border border-amber-200 bg-amber-50 px-1.5 py-0.5 text-[10px] font-semibold text-amber-800">
                                      Điều kiện (GDTC/GDQP)
                                    </span>
                                  ) : c.requirementType === "mandatory" ? (
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
                                    isCurrentSemester={isCurrentStudying}
                                    isPastSemester={isPastSemester}
                                    requirementType={c.requirementType}
                                    isConditional={c.isConditional}
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
  isCurrentSemester,
  isPastSemester,
  requirementType,
  isConditional,
}: {
  status: CourseProgressStatus;
  timeline?: CourseTimelineCategory | null;
  isFutureSemester?: boolean;
  isCurrentSemester?: boolean;
  isPastSemester?: boolean;
  requirementType?: string;
  isConditional?: boolean;
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
        <Clock size={11} /> {isCurrentSemester || timeline === "CURRENT" || timeline === "CURRENT_PLAN" ? "Đang học / Chưa có điểm" : "Chưa có điểm"}
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

  if (isPastSemester) {
    if (isConditional || requirementType === "conditional") {
      return (
        <span className="inline-flex items-center gap-1 rounded-md border border-slate-200 bg-slate-50 px-2 py-0.5 text-[11px] font-medium text-slate-500">
          Chưa học (Điều kiện)
        </span>
      );
    }
    if (requirementType === "mandatory") {
      return (
        <span className="inline-flex items-center gap-1 rounded-md border border-rose-300 bg-rose-50 px-2 py-0.5 text-[11px] font-bold text-rose-700">
          <AlertCircle size={11} /> Nợ chưa học
        </span>
      );
    }
    return (
      <span className="inline-flex items-center gap-1 rounded-md border border-slate-200 bg-slate-50 px-2 py-0.5 text-[11px] font-medium text-slate-500">
        Không chọn
      </span>
    );
  }

  return (
    <span className="inline-flex items-center gap-1 rounded-md border border-slate-200 bg-slate-100 px-2 py-0.5 text-[11px] font-medium text-slate-600">
      Chưa đăng ký
    </span>
  );
}



