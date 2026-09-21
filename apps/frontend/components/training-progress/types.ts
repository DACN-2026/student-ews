export interface ListResponse<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
}

export interface CohortOption {
  id: string;
  cohortCode: string;
  cohortName?: string | null;
}

export interface ProgramOption {
  id: string;
  programCode: string;
  programName: string;
}

export interface AcademicTermOption {
  id: string;
  academicYearId: string;
  termCode: string;
  termName: string;
  termOrder: number;
  isSummer: boolean;
  isCurrent: boolean;
}

export interface AcademicYearOption {
  id: string;
  yearCode: string;
  isCurrent: boolean;
  terms: AcademicTermOption[];
}

export interface AcademicContext {
  academicYearId: string;
  academicYearCode?: string;
  academicTermId: string;
  termCode?: string;
  termName?: string;
  isActive: boolean;
  isSummer: boolean;
}

export interface ProgressPlan {
  id: string;
  cohortId: string;
  cohortCode?: string;
  cohortName?: string;
  trainingProgramId: string;
  programCode?: string;
  programName?: string;
  academicYearId: string;
  academicYearCode?: string;
  academicTermId: string;
  termCode?: string;
  termName?: string;
  isSummer: boolean;
  curriculumSemesterNo: number;
  version: number;
  status: string;
  isCurrent: boolean;
  isProgramFinal: boolean;
  requiredElectiveCredits: number;
  runCount: number;
  createdAt: string;
  updatedAt: string;
}

export interface RegistrationRun {
  id: string;
  planId: string;
  planVersion: number;
  status: string;
  totalStudents: number;
  passStudents: number;
  failStudents: number;
  dataErrorStudents: number;
  offeringCount: number;
  sourceSnapshotHash?: string | null;
  sourceCapturedAt?: string | null;
  startedAt: string;
  completedAt?: string | null;
  cohortId: string;
  cohortCode?: string;
  cohortName?: string;
  trainingProgramId: string;
  programCode?: string;
  programName?: string;
  academicYearId: string;
  academicYearCode?: string;
  academicTermId: string;
  termCode?: string;
  termName?: string;
  curriculumSemesterNo: number;
}

export interface RegistrationStudentResult {
  id: string;
  studentId: string;
  studentName: string;
  className?: string | null;
  mandatory: {
    requiredCourses: number;
    registeredCourses: number;
    requiredCredits: number;
    registeredCredits: number;
  };
  elective: {
    requiredCredits: number;
    registeredCredits: number;
    isEnough: boolean;
  };
  requiredElectives: {
    requiredCourses: number;
    registeredCourses: number;
  };
  outsidePlanCredits: number;
  missingCredits: number;
  status: string;
}

export interface StudentCourseItem {
  courseCode: string;
  courseName: string;
  credits: number;
  group: string; // "mandatory" | "elective" | "outside_plan"
  choiceGroupCode?: string | null;
  isRegistrationRequired: boolean;
  registrationStatus: string; // "registered" | "missing"
}

export interface StudentCourseDetail {
  studentId: string;
  studentName: string;
  className?: string | null;
  cohortCode?: string | null;
  status: string;
  mandatory: {
    requiredCourses: number;
    registeredCourses: number;
    requiredCredits: number;
    registeredCredits: number;
  };
  elective: {
    requiredCredits: number;
    registeredCredits: number;
  };
  outsidePlanCourses: number;
  outsidePlanCredits: number;
  missingCredits: number;
  courses: StudentCourseItem[];
}

export interface CompletionRun {
  id: string;
  cohortId: string;
  cohortCode?: string;
  cohortName?: string;
  trainingProgramId: string;
  programCode?: string;
  programName?: string;
  assessmentAcademicTermId: string;
  assessmentAcademicYear?: string;
  assessmentTermCode?: string;
  assessmentTermName?: string;
  status: string;
  evaluationMode: string;
  evaluationScope: string;
  publicationStatus: string;
  totalStudents: number;
  completedStudents: number;
  incompleteStudents: number;
  cannotDetermineStudents: number;
  onTrackStudents: number;
  behindScheduleStudents: number;
  pendingResultStudents: number;
  noDuePlanStudents: number;
  dataErrorStudents: number;
  startedAt: string;
  completedAt?: string | null;
}

export interface CompletionStudentResult {
  studentId: string;
  studentName: string;
  classId?: string | null;
  programCode?: string | null;
  duePlansTotal: number;
  duePlansPassed: number;
  allPlansTotal: number;
  allPlansPassed: number;
  missingMandatoryCourses: number;
  missingRequiredElectiveCourses: number;
  missingElectiveCredits: number;
  cumulativeGpa10?: number | null;
  cumulativeGpa4?: number | null;
  scheduleStatus: string;
  programCompletionStatus: string;
  dataErrorReason?: string | null;
  pendingResultCourses: number;
}

export interface CompletionPreview {
  valid: boolean;
  canRun: boolean;
  scope: null | {
    cohortCode: string;
    programCode: string;
    assessmentAcademicYear: string;
    assessmentTermCode: string;
    evaluationScope: string;
    maxCurriculumSemesterNo: number;
    programFinalReached: boolean;
  };
  summary: null | {
    studentCount: number;
    planCount: number;
    duePlanCount: number;
    coverageValid: boolean;
    evaluationScope: string;
  };
  blockers: Array<{ code: string; message: string }>;
  warnings: Array<{ code: string; message: string; details?: string[] }>;
}

export async function responseError(response: Response, fallback: string) {
  const payload = await response.json().catch(() => null);
  return payload?.error?.message || fallback;
}

export function formatDateTime(value?: string | null) {
  if (!value) return "Chưa có";
  return new Intl.DateTimeFormat("vi-VN", {
    dateStyle: "short",
    timeStyle: "short",
    timeZone: "Asia/Ho_Chi_Minh",
  }).format(new Date(value));
}

export function shortRunId(id: string) {
  return `RUN-${id.slice(0, 8).toUpperCase()}`;
}

export type CourseProgressStatus = "PASSED" | "FAILED" | "NO_SCORE" | "NOT_COMPLETED";
export type CourseTimelineCategory = "PAST_DUE" | "CURRENT_PLAN" | "FUTURE" | "AHEAD";

export interface StudentProgressCourseItem {
  courseId: string;
  courseCode: string;
  courseName: string;
  credits: number;
  requirementType: string;
  semesterNo: number;
  choiceGroupCode?: string | null;
  status: CourseProgressStatus;
  timelineCategory?: CourseTimelineCategory | null;
  attemptCount?: number;
  latestScore10?: number | null;
  latestScore4?: number | null;
  latestLetterCode?: string | null;
  passedAcademicYear?: string | null;
  passedTermCode?: string | null;
}

export interface StudentProgressElectiveGroup {
  code: string;
  groupCode: string;
  groupName?: string;
  requiredCredits: number | null;
  passedCredits?: number;
  earnedCredits?: number;
  creditedCredits: number | null;
  remainingCredits: number | null;
  extraCredits: number;
  status: "PASS" | "FAIL" | "UNKNOWN" | "SUFFICIENT" | "DEFICIENT" | "UNKNOWN_REQUIREMENT";
  courses: StudentProgressCourseItem[];
}

export interface StudentProgressAttentionItem {
  courseCode: string;
  courseName?: string | null;
  credits?: number | null;
  reason?: string;
  status?: string;
  semesterNo?: number | null;
  attemptCount?: number;
  latestScore10?: number | null;
  latestLetterCode?: string | null;
  score10?: number | null;
  letterCode?: string | null;
}

export interface StudentProgressSemesterItem {
  semesterNo: number;
  yearStudy: number;
  termNo: number;
  name: string;
  semesterLabel?: string;
  yearLabel?: string;
  requiredCredits: number;
  plannedCredits?: number;
  completedCredits: number;
  remainingCredits?: number;
  completionPercentage?: number;
  completedCourses?: number;
  failedCourses?: number;
  noScoreCourses?: number;
  notCompletedCourses?: number;
  status?: string;
  isFullyCompleted?: boolean;
  isPastDue?: boolean;
  isCurrentBenchmark?: boolean;
  isFuture?: boolean;
  courses: StudentProgressCourseItem[];
}

export interface StudentTrainingProgressData {
  student: {
    id: string;
    studentCode: string;
    fullName: string;
    classCode?: string | null;
    className?: string | null;
    cohortCode?: string | null;
    programCode?: string | null;
  };
  curriculum: {
    programId?: string | null;
    programCode: string | null;
    programName?: string | null;
    totalCourses: number;
    totalCurriculumCredits?: number;
    totalCreditsInCurriculum?: number;
  };
  summary: {
    requiredCredits: number | null;
    completedCredits: number;
    remainingCredits?: number | null;
    progressPercent?: number | null;
    completionPercentage?: number | null;
    completedCourses?: number;
    passedCoursesCount?: number;
    failedCourses?: number;
    failedCoursesCount?: number;
    noScoreCourses?: number;
    noScoreCoursesCount?: number;
    notCompletedCourses?: number;
    notCompletedCoursesCount?: number;
    unmatchedCoursesCount?: number;
    overdueCredits?: number;
    aheadCredits?: number;
    currentCredits?: number;
  };
  scheduleProgress: {
    currentAcademicYear?: string;
    currentTermCode?: string;
    expectedYear?: number;
    expectedSemester?: number;
    expectedSemesterNo?: number;
    currentBenchmarkSemester?: number | null;
    benchmarkLabel?: string;
    lastCompletedSemester?: number;
    lastFullyCompletedSemester?: number | null;
    progressGap?: number;
    isOnTrack: boolean;
    isBehind: boolean;
    isAhead: boolean;
    overdueCredits?: number;
    currentPlanCredits?: number;
    aheadCredits?: number;
    tags?: Array<"ON_TRACK" | "BEHIND" | "AHEAD">;
  };
  semesters: StudentProgressSemesterItem[];
  courseStatus?: {
    passed: StudentProgressCourseItem[];
    failed: StudentProgressCourseItem[];
    noScore: StudentProgressCourseItem[];
    notCompleted: StudentProgressCourseItem[];
    pastDue: StudentProgressCourseItem[];
    future: StudentProgressCourseItem[];
    unmatched: StudentProgressAttentionItem[];
  };
  attentionCourses?: {
    failedCourses: StudentProgressAttentionItem[];
    noScoreCourses: StudentProgressAttentionItem[];
    pastDueCourses: StudentProgressAttentionItem[];
    unmatchedCourses: StudentProgressAttentionItem[];
  };
  electiveGroups: StudentProgressElectiveGroup[];
  warnings: Array<{ code: string; message: string }>;
}

