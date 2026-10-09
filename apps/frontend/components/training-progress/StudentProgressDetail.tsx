"use client";

import LoadingState from "@/components/ui/LoadingState";

import TextLabel from "@/components/ui/TextLabel";
import React, { useCallback, useEffect, useState } from "react";
import { AlertCircle, ChevronDown, ChevronRight, Layers, RefreshCw } from "lucide-react";
import { apiFetch } from "@/lib/api-client";
import { semesterMilestoneCredits, semesterProgressDisplay } from "@/lib/semester-progress-display";
import { semesterGradeSummary, type StudentTermGradeSummary } from "@/lib/semester-grade-summary";
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
  view?: "progress" | "transcript";
  termGradeSummaries?: StudentTermGradeSummary[];
}

export default function StudentProgressDetail({
  studentId,
  initialData = null,
  onRefresh,
  showStudentHeader = true,
  view = "progress",
  termGradeSummaries = [],
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
      const res = await apiFetch(`/api/v1/students/${encodeURIComponent(studentId)}/training-progress`, { cache: "reload" });
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
    return <LoadingState variant="detail" label="Đang đối chiếu tiến độ và học phần…" />;
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

  const studyingSemesterNos = scheduleProgress.studyingSemesterNos ?? semesters
    .filter(semester => semester.courses.some(course => course.isCurrentlyStudying))
    .map(semester => semester.semesterNo);
  const studyingSemesterLabel = studyingSemesterNos.map(no => semesters.find(semester => semester.semesterNo === no)?.name || `Học kỳ ${no}`).join(", ");

  const benchmarkSemesterNo =
    scheduleProgress.expectedSemesterNo ??
    1;
  const benchmarkYear = scheduleProgress.expectedYear ?? Math.ceil(benchmarkSemesterNo / 2);
  const benchmarkTerm = scheduleProgress.expectedSemester ?? (benchmarkSemesterNo % 2 === 1 ? "HK1" : "HK2");

  const benchmarkLabel =
    scheduleProgress.benchmarkLabel ||
    `Năm ${benchmarkYear} - ${benchmarkTerm} (Học kỳ ${benchmarkSemesterNo})`;

  const effectiveLastCompletedSem =
    scheduleProgress.latestCompletedSemester ??
    Math.max(0, benchmarkSemesterNo - 1);

  // Normalized progress indicators
  const progressStatus = scheduleProgress.progressStatus ?? (scheduleProgress.isOnTrack && !scheduleProgress.isBehind ? "ON_TRACK" : "BEHIND");
  const isOnTrack = progressStatus === "ON_TRACK";
  const isBehind = progressStatus === "BEHIND";

  const { expectedCreditsToDate, earnedCreditsToDate, creditDifference } = semesterMilestoneCredits(semesters, effectiveLastCompletedSem);
  const creditDifferenceText = progressStatus === "UNKNOWN" ? "Chưa đủ dữ liệu" : (
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
      {view === "progress" && <section aria-labelledby="section-progress-summary" className="rounded-2xl border border-slate-200 bg-white p-5 shadow-2xs space-y-4">
        {/* Header row with milestone & status */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 border-b border-slate-100 pb-3.5">
          <div>
            <div className="flex items-center gap-2">
              <h3 id="section-progress-summary" className="text-xs font-bold uppercase tracking-wider text-slate-500">
                Tiến độ đào tạo đến mốc
              </h3>
              <TextLabel className="font-mono text-xs font-bold text-slate-800">
                {effectiveLastCompletedSem != null && effectiveLastCompletedSem > 0
                  ? `Đến hết Học kỳ ${effectiveLastCompletedSem}`
                  : "Chưa có kỳ kết thúc"}
              </TextLabel>
            </div>
            <p className="text-xs text-slate-500 mt-1">
              {student.studyScheduleSource === "REGISTRATION_SEQUENCE" ? `Mốc theo chuỗi đăng ký (tương ứng ${student.studyCohortCode}): `
                : student.studyCohortCode ? `Mốc kế hoạch đang theo học (${student.studyCohortCode}): ` : "Mốc chuẩn của khóa: "}<strong className="text-slate-800 font-semibold">{benchmarkLabel}</strong>
            </p>
            <p className="text-xs text-slate-500 mt-1">
              {studyingSemesterLabel ? <>Đang học các học phần: <strong className="text-slate-800 font-semibold">{studyingSemesterLabel}</strong></> : "Chưa ghi nhận học phần đang học trong kỳ hiện tại."}
            </p>
          </div>

          {/* Status Badges */}
          <div className="flex flex-wrap items-center gap-2">
            {isOnTrack ? (
              <TextLabel className="inline-flex items-center gap-1.5 text-xs font-bold text-emerald-800">

                Đúng tiến độ
              </TextLabel>
            ) : (
              <TextLabel className="inline-flex items-center gap-1.5 text-xs font-bold text-rose-800">

                {progressStatus === "UNKNOWN" ? "Cần đối soát" : "Chậm tiến độ"}
              </TextLabel>
            )}

            {creditDifference > 0 && (
              <TextLabel className="inline-flex items-center gap-1.5 text-xs font-bold text-blue-800">

                Học vượt (+{creditDifference} TC)
              </TextLabel>
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
                    <th className="py-2 px-3 text-left table-cell-left">Mã HP</th>
                    <th className="py-2 px-3 text-left table-cell-left">Tên học phần</th>
                    <th className="py-2 px-2 text-center table-cell-center">TC</th>
                    <th className="py-2 px-3 text-center table-cell-center">Thuộc kỳ</th>
                    <th className="py-2 px-3 text-center table-cell-center">Tình trạng</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-rose-100">
                  {missingRequiredCourses.map((mc) => (
                    <tr key={mc.courseCode} className="hover:bg-rose-50/30">
                      <td className="py-2 px-3 font-mono font-bold text-slate-900 text-left table-cell-left">{mc.courseCode}</td>
                      <td className="py-2 px-3 font-medium text-slate-800 text-left table-cell-left">{mc.courseName}</td>
                      <td className="py-2 px-2 font-mono text-center text-slate-700 table-cell-center">{mc.credits}</td>
                      <td className="py-2 px-3 text-center font-mono text-slate-700 table-cell-center">HK {mc.semesterNo}</td>
                      <td className="py-2 px-3 text-center table-cell-center">
                        <TextLabel className="inline-flex items-center gap-1 text-[11px] font-semibold text-rose-800">
                          {mc.reason}
                        </TextLabel>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </section>}

      {/* ========================================================================= */}
      {/* PHẦN C: TIẾN ĐỘ THEO TỪNG HỌC KỲ                                         */}
      {/* ========================================================================= */}
      <section aria-labelledby="section-semesters" className="space-y-3">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
          <div>
            <h3 id="section-semesters" className="text-sm font-bold uppercase tracking-wider text-slate-600 flex items-center gap-2">
              <Layers size={16} className="text-indigo-600" />
              {view === "transcript" ? "Bảng điểm theo từng học kỳ" : "Phần C: Tiến độ chi tiết theo từng học kỳ"}
            </h3>
            <p className="text-xs text-slate-400 mt-0.5">
              {view === "transcript" ? "Kết quả học phần theo từng năm học và học kỳ của chương trình đào tạo" : "Phân cấp theo từng năm học và học kỳ lộ trình chuẩn của chương trình đào tạo"}
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
            const gradeSummary = view === "transcript" ? semesterGradeSummary(sem, data, termGradeSummaries) : undefined;
            const display = semesterProgressDisplay(sem);
            const semPlannedCredits = display.plannedCredits;
            const semCompPercentage =
              sem.completionPercentage ??
              (semPlannedCredits > 0 ? Math.round((sem.completedCredits / semPlannedCredits) * 100) : 0);

            const isCurrentStudying = studyingSemesterNos.includes(sem.semesterNo);
            const isCurrentPlan = !isCurrentStudying && sem.semesterNo === benchmarkSemesterNo;
            const isFutureSemester = !isCurrentStudying && sem.semesterNo > benchmarkSemesterNo;
            const isPastSemester = !isCurrentStudying && sem.semesterNo < benchmarkSemesterNo;
            const academicCourses = sem.courses.filter(c => !c.isConditional && c.requirementType !== "conditional");
            const isUnregisteredSemester = !isCurrentStudying && academicCourses.length > 0 &&
              academicCourses.every(c => c.attemptCount === 0);
            const semesterLabel = isUnregisteredSemester ? "Chưa đăng ký"
              : isCurrentPlan ? (sem.statusLabel || "Chưa đăng ký") : display.label;

            const isCompletedSemester = isPastSemester && display.isCompleted;

            const currentStudyingCredits = sem.courses
              .filter((c) => c.isCurrentlyStudying && !c.isConditional && c.requirementType !== "conditional")
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
                    <TextLabel className="inline-flex font-mono text-xs font-bold text-slate-800">
                      HK {sem.semesterNo}
                    </TextLabel>
                    <div>
                      <div className="flex items-center gap-2">
                        <strong className="text-sm font-bold text-slate-900">
                          {sem.name || sem.semesterLabel || `Học kỳ ${sem.semesterNo}`}
                        </strong>
                        {isCurrentStudying && (
                          <TextLabel className="text-[10px] font-bold text-blue-800">
                            Đang theo học
                          </TextLabel>
                        )}
                        {isFutureSemester && !isUnregisteredSemester && (
                          <TextLabel className="text-[10px] font-medium text-slate-600">
                            Kế hoạch kỳ sau
                          </TextLabel>
                        )}
                        {(isCurrentPlan || isUnregisteredSemester) && <TextLabel className="text-[10px] font-medium text-slate-600">{semesterLabel}</TextLabel>}
                        {isPastSemester && !isUnregisteredSemester && isCompletedSemester && (
                          <TextLabel className="text-[10px] font-bold text-emerald-800">
                            {display.label}
                          </TextLabel>
                        )}
                        {isPastSemester && !isUnregisteredSemester && !isCompletedSemester && (
                          <TextLabel className="text-[10px] font-bold text-rose-800">
                            {display.label}
                          </TextLabel>
                        )}
                      </div>
                      {isCurrentStudying ? (
                        <span className="text-xs text-blue-700 font-medium">
                          Đang học trong {scheduleProgress.currentTermCode} ({scheduleProgress.currentAcademicYear}) • Kế hoạch: {display.plannedCreditsLabel} TC
                        </span>
                      ) : isFutureSemester && !isUnregisteredSemester ? (
                        <span className="text-xs text-slate-400">
                          Kế hoạch tương lai / Kỳ sau • {sem.courses.length} học phần ({display.plannedCreditsLabel} TC)
                        </span>
                      ) : (
                        <span className="text-xs text-slate-500">
                          {sem.courses.length} học phần • Kế hoạch: {display.plannedCreditsLabel} TC
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
                            Chưa có kết quả kỳ này
                          </div>
                        </>
                      ) : isFutureSemester && !isUnregisteredSemester ? (
                        <>
                          <div className="font-mono text-xs font-bold text-slate-500">
                            {sem.completedCredits} / {display.plannedCreditsLabel} TC
                          </div>
                          <div className="text-[10px] text-slate-400">
                            Kế hoạch kỳ sau
                          </div>
                        </>
                      ) : (
                        <>
                          <div className="font-mono text-xs font-bold text-slate-900">
                            {sem.completedCredits} / {display.plannedCreditsLabel} TC
                          </div>
                          <div
                            className={`text-[10px] ${
                              isCompletedSemester
                                ? "text-emerald-700 font-semibold"
                                : isCurrentPlan || isUnregisteredSemester
                                ? "text-slate-500"
                                : "text-rose-600 font-medium"
                            }`}
                          >
                            {semesterLabel}
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
                              : isFutureSemester || isCurrentPlan || isUnregisteredSemester
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

                    <TextLabel
                      className={`inline-flex items-center gap-1     text-[11px] font-bold ${
                        isCurrentStudying
                          ? "border-blue-200  text-blue-800"
                          : isFutureSemester || isCurrentPlan || isUnregisteredSemester
                          ? "border-slate-200  text-slate-600"
                          : isCompletedSemester
                          ? "border-emerald-200  text-emerald-800"
                          : "border-rose-200  text-rose-800"
                      }`}
                    >
                      {isCurrentStudying ? (
                        <>
                           Đang theo học
                        </>
                      ) : isFutureSemester && !isUnregisteredSemester ? (
                        <>
                           Kỳ sau
                        </>
                      ) : isCompletedSemester ? (
                        <>
                           {semesterLabel}
                        </>
                      ) : (
                        <>
                           {semesterLabel}
                        </>
                      )}
                    </TextLabel>
                  </div>
                </button>

                {/* Accordion Table Body */}
                {isExpanded && (
                  <div className="border-t border-slate-100 px-4 py-3">
                    <div className="overflow-x-auto">
                      <table className="w-full text-left text-xs">
                        <thead>
                          <tr className="border-b border-slate-200 bg-slate-50 text-[10px] font-bold uppercase tracking-wider text-slate-500">
                            <th className="py-2.5 px-3 text-left table-cell-left">Mã HP</th>
                            <th className="py-2.5 px-3 text-left table-cell-left">Tên học phần</th>
                            <th className="py-2.5 px-2 text-center table-cell-center">TC</th>
                            <th className="py-2.5 px-3 text-center table-cell-center">Loại HP</th>
                            <th className="py-2.5 px-3 text-center table-cell-center">Trạng thái</th>
                            <th className="py-2.5 px-2 text-center table-cell-center">Điểm 10</th>
                            <th className="py-2.5 px-2 text-center table-cell-center">Điểm 4</th>
                            <th className="py-2.5 px-2 text-center table-cell-center">Chữ</th>
                            <th className="py-2.5 px-3 text-center table-cell-center">Kỳ hoàn thành</th>
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
                                <td className="py-2.5 px-3 font-mono font-bold text-slate-900 text-left table-cell-left">
                                  {c.courseCode}
                                </td>
                                <td className="py-2.5 px-3 font-medium text-slate-800 text-left table-cell-left">
                                  {c.courseName}
                                </td>
                                <td className="py-2.5 px-2 font-mono text-center text-slate-700 table-cell-center">
                                  {c.credits}
                                </td>
                                <td className="py-2.5 px-3 text-slate-600 text-center table-cell-center">
                                  {c.isConditional || c.requirementType === "conditional" ? (
                                    <TextLabel className="inline-flex text-[10px] font-semibold text-amber-800">
                                      Điều kiện (GDTC/GDQP)
                                    </TextLabel>
                                  ) : c.requirementType === "mandatory" ? (
                                    <span className="font-semibold text-slate-700">Bắt buộc</span>
                                  ) : (
                                    <span className="text-purple-700 font-medium">Tự chọn</span>
                                  )}
                                </td>
                                <td className="py-2.5 px-3 text-center table-cell-center">
                                  <CourseStatusBadge
                                    status={c.status}
                                    timeline={c.timelineCategory ?? null}
                                    isFutureSemester={isFutureSemester}
                                    isCurrentSemester={Boolean(c.isCurrentlyStudying)}
                                    isPastSemester={isPastSemester}
                                    requirementType={c.requirementType}
                                    isConditional={c.isConditional}
                                    isUnregistered={c.attemptCount === 0}
                                  />
                                </td>

                                <td className="py-2.5 px-2 font-mono text-center text-slate-800 table-cell-center">
                                  {c.latestScore10 != null ? c.latestScore10.toFixed(1) : "—"}
                                </td>
                                <td className="py-2.5 px-2 font-mono text-center text-slate-800 table-cell-center">
                                  {c.latestScore4 != null ? c.latestScore4.toFixed(1) : "—"}
                                </td>
                                <td className="py-2.5 px-2 font-mono font-bold text-center text-slate-900 table-cell-center">
                                  {c.latestLetterCode || "—"}
                                </td>
                                <td className="py-2.5 px-3 font-mono text-slate-600 text-center table-cell-center">
                                  {c.passedAcademicYear && c.passedTermCode ? (
                                    <TextLabel className="inline-flex text-[10px] font-bold text-emerald-800">
                                      {c.passedTermCode} ({c.passedAcademicYear})
                                    </TextLabel>
                                  ) : (
                                    "—"
                                  )}
                                </td>
                              </tr>
                            ))
                          )}
                        </tbody>
                        {view === "transcript" && (
                          <tfoot>
                            <tr className="border-t border-slate-200 bg-slate-50/80">
                              <th scope="row" colSpan={2} className="px-3 py-3 text-left font-semibold text-slate-700">
                                Tổng kết học kỳ
                              </th>
                              <td colSpan={7} className="px-3 py-3">
                                <dl className="grid grid-cols-2 gap-x-4 gap-y-3 lg:grid-cols-4">
                                  {[
                                    { label: "Điểm hệ 10", value: gradeSummary?.gpa10 },
                                    { label: "Điểm hệ 4", value: gradeSummary?.gpa4 },
                                    { label: "Điểm hệ 10 tích lũy", value: gradeSummary?.cumulativeGpa10 },
                                    { label: "Điểm hệ 4 tích lũy", value: gradeSummary?.cumulativeGpa4 },
                                  ].map(({ label, value }) => (
                                    <div key={label} className="text-center">
                                      <dt className="text-[11px] font-medium text-slate-500">{label}</dt>
                                      <dd className="mt-1 font-mono text-sm font-bold text-slate-900">
                                        {value != null && Number.isFinite(value) ? value.toFixed(2) : "—"}
                                      </dd>
                                    </div>
                                  ))}
                                </dl>
                              </td>
                            </tr>
                          </tfoot>
                        )}
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
  isUnregistered,
}: {
  status: CourseProgressStatus;
  timeline?: CourseTimelineCategory | null;
  isFutureSemester?: boolean;
  isCurrentSemester?: boolean;
  isPastSemester?: boolean;
  requirementType?: string;
  isConditional?: boolean;
  isUnregistered?: boolean;
}) {
  if (status === "PASSED") {
    return (
      <TextLabel className="inline-flex items-center gap-1 text-[11px] font-bold text-emerald-800">
         {isCurrentSemester ? "Đang học cải thiện (Đã đạt)" : "Đã đạt"}
      </TextLabel>
    );
  }
  if (status === "FAILED") {
    return (
      <TextLabel className="inline-flex items-center gap-1 text-[11px] font-bold text-rose-800">
         Chưa đạt (Rớt)
      </TextLabel>
    );
  }
  if (status === "NO_SCORE") {
    return (
      <TextLabel className="inline-flex items-center gap-1 text-[11px] font-bold text-amber-800">
         {isCurrentSemester ? "Đang học / Chưa có điểm" : "Chưa có điểm"}
      </TextLabel>
    );
  }

  // NOT_COMPLETED
  if (isUnregistered) {
    return (
      <TextLabel className="inline-flex text-[11px] font-medium text-slate-500">
        Chưa đăng ký
      </TextLabel>
    );
  }
  if (isFutureSemester || timeline === "FUTURE") {
    return (
      <TextLabel className="inline-flex items-center gap-1 text-[11px] font-medium text-slate-500">
        Chưa học
      </TextLabel>
    );
  }

  if (isPastSemester) {
    if (isConditional || requirementType === "conditional") {
      return (
        <TextLabel className="inline-flex items-center gap-1 text-[11px] font-medium text-slate-500">
          Chưa học (Điều kiện)
        </TextLabel>
      );
    }
    if (requirementType === "mandatory") {
      return (
        <TextLabel className="inline-flex items-center gap-1 text-[11px] font-bold text-rose-700">
           Nợ chưa học
        </TextLabel>
      );
    }
    return (
      <TextLabel className="inline-flex items-center gap-1 text-[11px] font-medium text-slate-500">
        Không chọn
      </TextLabel>
    );
  }

  return (
    <TextLabel className="inline-flex items-center gap-1 text-[11px] font-medium text-slate-600">
      Chưa đăng ký
    </TextLabel>
  );
}



