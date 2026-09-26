"use client";

import { Fragment, useState, useEffect } from "react";
import { apiFetch } from "@/lib/api-client";
import { useRouter } from "next/navigation";
import Tabs, { TabItem } from "@/components/ui/Tabs";
import FilterBar from "@/components/ui/FilterBar";
import Modal from "@/components/ui/Modal";
import ConfirmDialog from "@/components/ui/ConfirmDialog";
import ForbiddenState from "@/components/ui/ForbiddenState";
import { useAuthStore } from "@/stores/authStore";

type AcademicsTab = "years" | "terms" | "courses" | "programs" | "cohorts" | "classes" | "plans";

export default function AcademicsPage() {
  const { user, can, status } = useAuthStore();
  const isClassAdvisor = user?.role === "CLASS_ADVISOR";
  const isFacultyBoard = user?.role === "FACULTY_BOARD";

  const scopeBadgeText = isClassAdvisor
    ? "GVCN / CVHT • Chỉ xem"
    : isFacultyBoard
    ? `Ban chủ nhiệm Khoa • ${user?.facultyCode ? `Khoa ${user.facultyCode}` : "Phạm vi Khoa"}`
    : null;
  const configuredSummerTermCode = process.env.NEXT_PUBLIC_SUMMER_TERM_CODE?.trim() || "";
  const configuredSummerTermOrder = Number(process.env.NEXT_PUBLIC_SUMMER_TERM_ORDER || "");
  const [activeTab, setActiveTab] = useState<AcademicsTab>("years");
  const [loading, setLoading] = useState(true);

  // Data collections
  const [years, setYears] = useState<ApiData[]>([]);
  const [selectedYearId, setSelectedYearId] = useState<string>("");
  const [terms, setTerms] = useState<ApiData[]>([]);
  const [programs, setPrograms] = useState<ApiData[]>([]);
  const [courses, setCourses] = useState<ApiData[]>([]);
  const [classes, setClasses] = useState<ApiData[]>([]);
  const [cohorts, setCohorts] = useState<ApiData[]>([]);
  const [plans, setPlans] = useState<ApiData[]>([]);

  // Search in tabs
  const [searchQuery, setSearchQuery] = useState("");

  // Modals state
  const [showYearModal, setShowYearModal] = useState(false);
  const [yearForm, setYearForm] = useState({ yearCode: "", startDate: "", endDate: "", status: "open", isCurrent: false });

  const [showTermModal, setShowTermModal] = useState(false);
  const [termForm, setTermForm] = useState({ termCode: "HK01", termName: "Học kỳ 1", termOrder: 1, isSummer: false, status: "open", isCurrent: false });

  const [showCourseModal, setShowCourseModal] = useState(false);
  const [courseForm, setCourseForm] = useState({ courseCode: "", courseName: "", credits: 3, theoryHours: 45, practiceHours: 0 });

  const [showCohortModal, setShowCohortModal] = useState(false);
  const [cohortForm, setCohortForm] = useState({ cohortCode: "", cohortName: "" });

  const [showClassModal, setShowClassModal] = useState(false);
  const [classForm, setClassForm] = useState({ classId: "", className: "", cohortId: "" });

  // Delete dialog state
  const [deleteTarget, setDeleteTarget] = useState<{ type: string; id: string; name: string } | null>(null);
  const [deleteLoading, setDeleteLoading] = useState(false);

  // Router and Plan Detail & Editor State
  const router = useRouter();
  const [showPlanCoursesModal, setShowPlanCoursesModal] = useState(false);
  const [selectedPlanDetail, setSelectedPlanDetail] = useState<ApiData | null>(null);
  const [planCoursesLoading, setPlanCoursesLoading] = useState(false);

  const [showPlanEditorModal, setShowPlanEditorModal] = useState(false);
  const [planEditorForm, setPlanEditorForm] = useState({
    cohortId: "",
    trainingProgramId: "",
    academicYearId: "",
    academicTermId: "",
    curriculumSemesterNo: 1,
    requiredElectiveCredits: 0,
    isProgramFinal: false,
  });
  const [programCoursesForPlan, setProgramCoursesForPlan] = useState<ApiData[]>([]);
  const [selectedPlanCourses, setSelectedPlanCourses] = useState<
    Record<string, { requirementType: string; choiceGroupCode: string; isRegistrationRequired: boolean }>
  >({});
  const [planSubmitting, setPlanSubmitting] = useState(false);

  // Load all initial academic data
  useEffect(() => {
    async function loadData() {
      try {
        setLoading(true);
        const [yRes, pRes, cRes, clRes, coRes, plRes] = await Promise.all([
          apiFetch("/api/v1/academic-years"),
          apiFetch("/api/v1/training-programs"),
          apiFetch("/api/v1/courses"),
          apiFetch("/api/v1/classes"),
          apiFetch("/api/v1/cohorts"),
          apiFetch("/api/v1/training-progress/plans"),
        ]);

        if (yRes.ok) {
          const yData = await yRes.json();
          const items = Array.isArray(yData.items) ? yData.items : Array.isArray(yData) ? yData : [];
          setYears(items);
          if (items.length > 0) setSelectedYearId((current) => current || items[0].id);
        }
        if (pRes.ok) {
          const pJson = await pRes.json();
          setPrograms(Array.isArray(pJson.items) ? pJson.items : Array.isArray(pJson) ? pJson : []);
        }
        if (cRes.ok) {
          const cJson = await cRes.json();
          setCourses(Array.isArray(cJson.items) ? cJson.items : Array.isArray(cJson) ? cJson : []);
        }
        if (clRes.ok) {
          const clJson = await clRes.json();
          setClasses(Array.isArray(clJson.items) ? clJson.items : Array.isArray(clJson) ? clJson : []);
        }
        if (coRes.ok) {
          const coJson = await coRes.json();
          setCohorts(Array.isArray(coJson.items) ? coJson.items : Array.isArray(coJson) ? coJson : []);
        }
        if (plRes.ok) {
          const plJson = await plRes.json();
          setPlans(Array.isArray(plJson.items) ? plJson.items : Array.isArray(plJson) ? plJson : []);
        }
      } catch (err) {
        console.error("Academics load error:", err);
      } finally {
        setLoading(false);
      }
    }
    void loadData();
  }, []);

  // When selectedYearId changes, load terms for that year
  useEffect(() => {
    if (!selectedYearId) return;
    async function loadTerms() {
      try {
        const res = await apiFetch(`/api/v1/academic-years/${selectedYearId}/terms`);
        if (res.ok) {
          const json = await res.json();
          setTerms(json.items || json || []);
        }
      } catch (err) {
        console.error("Error loading terms:", err);
      }
    }
    loadTerms();
  }, [selectedYearId]);

  // Tab definitions
  const tabs: TabItem[] = [
    { id: "years", label: "Năm học", badge: years.length },
    { id: "terms", label: "Học kỳ", badge: terms.length },
    { id: "courses", label: "Danh mục Học phần", badge: courses.length },
    { id: "programs", label: "Chương trình đào tạo", badge: programs.length },
    { id: "cohorts", label: "Khóa sinh viên", badge: cohorts.length },
    { id: "classes", label: "Lớp học", badge: classes.length },
    { id: "plans", label: "Kế hoạch đào tạo", badge: plans.length },
  ];

  // Create Year
  const handleCreateYear = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!yearForm.yearCode) return;
    try {
      const res = await apiFetch("/api/v1/academic-years", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(yearForm),
      });
      if (res.ok) {
        setShowYearModal(false);
        setYearForm({ yearCode: "", startDate: "", endDate: "", status: "open", isCurrent: false });
        // Reload years
        const yRes = await apiFetch("/api/v1/academic-years");
        if (yRes.ok) setYears(await yRes.json());
        alert("Đã thêm năm học thành công!");
      }
    } catch {
      alert("Lỗi khi thêm năm học");
    }
  };

  // Create Term
  const handleCreateTerm = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedYearId) return;
    try {
      const res = await apiFetch(`/api/v1/academic-years/${selectedYearId}/terms`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(termForm),
      });
      if (res.ok) {
        setShowTermModal(false);
        const tRes = await apiFetch(`/api/v1/academic-years/${selectedYearId}/terms`);
        if (tRes.ok) {
          const json = await tRes.json();
          setTerms(json.items || json || []);
        }
        alert("Đã thêm học kỳ thành công!");
      }
    } catch {
      alert("Lỗi khi thêm học kỳ");
    }
  };

  // Create Course
  const handleCreateCourse = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!courseForm.courseCode || !courseForm.courseName) return;
    try {
      const res = await apiFetch("/api/v1/courses", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(courseForm),
      });
      if (res.ok) {
        setShowCourseModal(false);
        const cRes = await apiFetch("/api/v1/courses");
        if (cRes.ok) setCourses(await cRes.json());
        alert("Đã thêm học phần thành công!");
      }
    } catch {
      alert("Lỗi khi thêm học phần");
    }
  };

  // Create Cohort
  const handleCreateCohort = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!cohortForm.cohortCode) return;
    try {
      const res = await apiFetch("/api/v1/cohorts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(cohortForm),
      });
      if (res.ok) {
        setShowCohortModal(false);
        const coRes = await apiFetch("/api/v1/cohorts");
        if (coRes.ok) setCohorts(await coRes.json());
        alert("Đã thêm khóa mới thành công!");
      }
    } catch {
      alert("Lỗi khi thêm khóa");
    }
  };

  // Create Class
  const handleCreateClass = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!classForm.classId || !classForm.className) return;
    try {
      const res = await apiFetch("/api/v1/classes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(classForm),
      });
      if (res.ok) {
        setShowClassModal(false);
        const clRes = await apiFetch("/api/v1/classes");
        if (clRes.ok) setClasses(await clRes.json());
        alert("Đã thêm lớp thành công!");
      }
    } catch {
      alert("Lỗi khi thêm lớp");
    }
  };

  // Delete Action
  const handleConfirmDelete = async () => {
    if (!deleteTarget) return;
    try {
      setDeleteLoading(true);
      const res = await apiFetch(`/api/v1/${deleteTarget.type}/${deleteTarget.id}`, {
        method: "DELETE",
      });
      if (res.ok) {
        setDeleteTarget(null);
        window.location.reload();
      } else {
        alert("Lỗi khi xóa dữ liệu");
      }
    } finally {
      setDeleteLoading(false);
    }
  };

  // Plan view courses
  const handleViewPlanCourses = async (planId: string) => {
    try {
      setPlanCoursesLoading(true);
      setShowPlanCoursesModal(true);
      const res = await apiFetch(`/api/v1/training-progress/plans/${planId}`);
      if (res.ok) {
        setSelectedPlanDetail(await res.json());
      } else {
        alert("Lỗi khi tải chi tiết kế hoạch đào tạo");
      }
    } finally {
      setPlanCoursesLoading(false);
    }
  };

  // Plan open editor
  const handleOpenPlanEditor = async () => {
    const defaultCohort = cohorts[0]?.id || "";
    const defaultProgram = programs[0]?.id || "";
    const defaultYear = years[0]?.id || "";
    const defaultTerm = years[0]?.terms?.find((term: ApiData) => !term.isSummer)?.id || "";

    setPlanEditorForm({
      cohortId: defaultCohort,
      trainingProgramId: defaultProgram,
      academicYearId: defaultYear,
      academicTermId: defaultTerm,
      curriculumSemesterNo: 1,
      requiredElectiveCredits: 0,
      isProgramFinal: false,
    });
    setSelectedPlanCourses({});
    setShowPlanEditorModal(true);

    if (defaultProgram) {
      try {
        const res = await apiFetch(`/api/v1/training-programs/${defaultProgram}/courses`);
        if (res.ok) {
          const json = await res.json();
          const items = Array.isArray(json.items) ? json.items : Array.isArray(json) ? json : [];
          setProgramCoursesForPlan(items);
          const initSelected: Record<string, ApiData> = {};
          items.forEach((c: ApiData) => {
            if (c.semesterNo === 1) {
              initSelected[c.courseId] = {
                requirementType: c.requirementType === "Tự Chọn" ? "elective" : "mandatory",
                choiceGroupCode: "",
                isRegistrationRequired: c.requirementType === "Bắt Buộc",
              };
            }
          });
          setSelectedPlanCourses(initSelected);
        }
      } catch (err) {
        console.error(err);
      }
    }
  };

  const handlePlanProgramChange = async (progId: string) => {
    setPlanEditorForm((prev) => ({ ...prev, trainingProgramId: progId }));
    try {
      const res = await apiFetch(`/api/v1/training-programs/${progId}/courses`);
      if (res.ok) {
        const json = await res.json();
        const items = Array.isArray(json.items) ? json.items : Array.isArray(json) ? json : [];
        setProgramCoursesForPlan(items);
        setSelectedPlanCourses({});
      }
    } catch (err) {
      console.error(err);
    }
  };

  const handleTogglePlanCourse = (c: ApiData) => {
    setSelectedPlanCourses((prev) => {
      const next = { ...prev };
      if (next[c.courseId]) {
        delete next[c.courseId];
      } else {
        next[c.courseId] = {
          requirementType: c.requirementType === "Tự Chọn" ? "elective" : "mandatory",
          choiceGroupCode: "",
          isRegistrationRequired: c.requirementType === "Bắt Buộc",
        };
      }
      return next;
    });
  };

  const handleSavePlan = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!planEditorForm.cohortId || !planEditorForm.academicTermId) {
      alert("Vui lòng chọn Khóa và Học kỳ áp dụng!");
      return;
    }

    const courseIds = Object.entries(selectedPlanCourses).map(([courseId, cfg]) => {
      const orig = programCoursesForPlan.find((p) => p.courseId === courseId);
      return {
        courseId,
        courseCode: orig?.courseCode,
        courseName: orig?.courseName,
        credits: orig?.credits || 3,
        requirementType: cfg.requirementType,
        choiceGroupCode: cfg.choiceGroupCode || undefined,
        isRegistrationRequired: cfg.isRegistrationRequired,
      };
    });

    try {
      setPlanSubmitting(true);
      const res = await apiFetch("/api/v1/training-progress/plans", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          cohortId: planEditorForm.cohortId,
          trainingProgramId: planEditorForm.trainingProgramId,
          academicTermId: planEditorForm.academicTermId,
          curriculumSemesterNo: Number(planEditorForm.curriculumSemesterNo),
          requiredElectiveCredits: Number(planEditorForm.requiredElectiveCredits),
          isProgramFinal: planEditorForm.isProgramFinal,
          courseIds,
        }),
      });

      if (res.ok) {
        setShowPlanEditorModal(false);
        alert("Đã tạo kế hoạch đào tạo thành công!");
        const plRes = await apiFetch("/api/v1/training-progress/plans");
        if (plRes.ok) {
          const plJson = await plRes.json();
          setPlans(Array.isArray(plJson.items) ? plJson.items : Array.isArray(plJson) ? plJson : []);
        }
      } else {
        const err = await res.json();
        alert(err.error?.message || "Lỗi khi tạo kế hoạch đào tạo");
      }
    } catch (err) {
      console.error(err);
      alert("Lỗi kết nối máy chủ");
    } finally {
      setPlanSubmitting(false);
    }
  };

  const handleLockPlan = async (planId: string) => {
    if (!confirm("Khóa kế hoạch đào tạo? Sau khi khóa, kế hoạch sẽ trở thành căn cứ tính toán tiến độ.")) return;
    try {
      const res = await apiFetch(`/api/v1/training-progress/plans/${planId}/lock`, { method: "POST" });
      if (res.ok) {
        alert("Đã khóa kế hoạch đào tạo thành công!");
        const plRes = await apiFetch("/api/v1/training-progress/plans");
        if (plRes.ok) {
          const plJson = await plRes.json();
          setPlans(Array.isArray(plJson.items) ? plJson.items : Array.isArray(plJson) ? plJson : []);
        }
      } else {
        const err = await res.json();
        alert(err.error?.message || "Lỗi khi khóa kế hoạch");
      }
    } catch (err) {
      console.error(err);
    }
  };

  const handleActivatePlan = async (planId: string) => {
    try {
      const res = await apiFetch(`/api/v1/training-progress/plans/${planId}/activate`, { method: "POST" });
      if (res.ok) {
        alert("Đã kích hoạt kế hoạch hiện hành!");
        const plRes = await apiFetch("/api/v1/training-progress/plans");
        if (plRes.ok) {
          const plJson = await plRes.json();
          setPlans(Array.isArray(plJson.items) ? plJson.items : Array.isArray(plJson) ? plJson : []);
        }
      }
    } catch (err) {
      console.error(err);
    }
  };

  const handleArchivePlan = async (planId: string) => {
    if (!confirm("Lưu trữ kế hoạch này?")) return;
    try {
      const res = await apiFetch(`/api/v1/training-progress/plans/${planId}/archive`, { method: "POST" });
      if (res.ok) {
        alert("Đã chuyển kế hoạch vào lưu trữ!");
        const plRes = await apiFetch("/api/v1/training-progress/plans");
        if (plRes.ok) {
          const plJson = await plRes.json();
          setPlans(Array.isArray(plJson.items) ? plJson.items : Array.isArray(plJson) ? plJson : []);
        }
      }
    } catch (err) {
      console.error(err);
    }
  };

  if (status !== "loading" && status !== "idle" && !can(["academic_term.manage", "class.manage", "progress.read", "progress.plan.manage"])) {
    return <ForbiddenState requiredPermission="progress.read" />;
  }

  return (
    <div className="p-6 space-y-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 flex-wrap">
            <h1
              className="text-2xl sm:text-3xl font-bold text-slate-900 tracking-tight"
              style={{ fontFamily: "Be Vietnam Pro, sans-serif" }}
            >
              Quản trị Đào tạo & Khung Chương trình
            </h1>
            {scopeBadgeText && (
              <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-emerald-50 text-emerald-700 border border-emerald-200">
                {scopeBadgeText}
              </span>
            )}
          </div>
          <p className="text-xs sm:text-sm text-slate-500 mt-0.5">
            Quản lý cơ cấu năm học, học kỳ, khung CTĐT, học phần, khóa và lớp sinh viên
          </p>
        </div>

        {/* Action button corresponding to active tab */}
        <div>
          {activeTab === "years" && can("academic_term.manage") && (
            <button
              type="button"
              onClick={() => setShowYearModal(true)}
              className="px-4 py-2 rounded-xl bg-[var(--color-primary)] hover:opacity-90 text-white text-xs font-semibold shadow-xs flex items-center gap-1.5 cursor-pointer"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                <line x1="12" y1="5" x2="12" y2="19" />
                <line x1="5" y1="12" x2="19" y2="12" />
              </svg>
              <span>Thêm năm học</span>
            </button>
          )}

          {activeTab === "terms" && can("academic_term.manage") && (
            <button
              type="button"
              onClick={() => setShowTermModal(true)}
              disabled={!selectedYearId}
              className="px-4 py-2 rounded-xl bg-[var(--color-primary)] hover:opacity-90 disabled:opacity-40 text-white text-xs font-semibold shadow-xs flex items-center gap-1.5 cursor-pointer"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                <line x1="12" y1="5" x2="12" y2="19" />
                <line x1="5" y1="12" x2="19" y2="12" />
              </svg>
              <span>Thêm học kỳ</span>
            </button>
          )}

          {activeTab === "courses" && can("academic_term.manage") && (
            <button
              type="button"
              onClick={() => setShowCourseModal(true)}
              className="px-4 py-2 rounded-xl bg-[var(--color-primary)] hover:opacity-90 text-white text-xs font-semibold shadow-xs flex items-center gap-1.5 cursor-pointer"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                <line x1="12" y1="5" x2="12" y2="19" />
                <line x1="5" y1="12" x2="19" y2="12" />
              </svg>
              <span>Thêm học phần</span>
            </button>
          )}

          {activeTab === "cohorts" && can("class.manage") && (
            <button
              type="button"
              onClick={() => setShowCohortModal(true)}
              className="px-4 py-2 rounded-xl bg-[var(--color-primary)] hover:opacity-90 text-white text-xs font-semibold shadow-xs flex items-center gap-1.5 cursor-pointer"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                <line x1="12" y1="5" x2="12" y2="19" />
                <line x1="5" y1="12" x2="19" y2="12" />
              </svg>
              <span>Thêm khóa học</span>
            </button>
          )}

          {activeTab === "classes" && can("class.manage") && (
            <button
              type="button"
              onClick={() => setShowClassModal(true)}
              className="px-4 py-2 rounded-xl bg-[var(--color-primary)] hover:opacity-90 text-white text-xs font-semibold shadow-xs flex items-center gap-1.5 cursor-pointer"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                <line x1="12" y1="5" x2="12" y2="19" />
                <line x1="5" y1="12" x2="19" y2="12" />
              </svg>
              <span>Thêm lớp học</span>
            </button>
          )}
        </div>
      </div>

      {/* 7 Tabs Bar */}
      <Tabs tabs={tabs} activeTab={activeTab} onChange={(id) => setActiveTab(id as AcademicsTab)} />

      {/* Loading state */}
      {loading ? (
        <div className="py-16 text-center text-slate-400 text-xs font-medium">
          <svg className="animate-spin h-6 w-6 text-[var(--color-primary)] mx-auto mb-2" viewBox="0 0 24 24" fill="none">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
          </svg>
          <span>Đang tải danh mục đào tạo...</span>
        </div>
      ) : (
        <>
          {/* TAB 1: NĂM HỌC (Years) */}
          {activeTab === "years" && (
            <div className="bg-white border border-slate-200/90 rounded-2xl shadow-xs overflow-hidden">
              <div className="p-4 border-b border-slate-100 flex items-center justify-between">
                <h3 className="text-sm font-bold text-slate-900" style={{ fontFamily: "Be Vietnam Pro, sans-serif" }}>
                  Danh sách Năm học ({years.length})
                </h3>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead>
                    <tr className="bg-slate-50/80 border-b border-slate-200 text-slate-500 font-semibold uppercase text-[11px]">
                      <th className="py-3 px-4">Mã năm học</th>
                      <th className="py-3 px-4">Trạng thái</th>
                      <th className="py-3 px-4">Năm hiện tại</th>
                      <th className="py-3 px-4">Thời gian</th>
                      <th className="py-3 px-4 text-right">Thao tác</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {years.map((y) => (
                      <tr key={y.id} className="hover:bg-slate-50/70 transition-colors">
                        <td className="py-3.5 px-4 font-bold font-mono text-slate-900">{y.sYearCode || y.yearCode}</td>
                        <td className="py-3.5 px-4">
                          <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-semibold ${y.status === "open" ? "bg-emerald-100 text-emerald-800" : "bg-slate-100 text-slate-600"
                            }`}>
                            {y.status === "open" ? "Đang mở" : "Đã đóng"}
                          </span>
                        </td>
                        <td className="py-3.5 px-4">
                          {y.isCurrent ? (
                            <span className="inline-flex items-center px-2 py-0.5 rounded-md text-[11px] font-bold bg-blue-50 text-blue-700 border border-blue-200">
                              Đang dùng
                            </span>
                          ) : (
                            <span className="text-slate-400">—</span>
                          )}
                        </td>
                        <td className="py-3.5 px-4 text-slate-500">
                          {y.startDate ? new Date(y.startDate).toLocaleDateString("vi-VN") : "—"} đến{" "}
                          {y.endDate ? new Date(y.endDate).toLocaleDateString("vi-VN") : "—"}
                        </td>
                        <td className="py-3.5 px-4 text-right">
                          {can("academic_term.manage") && (
                            <button
                              type="button"
                              onClick={() => setDeleteTarget({ type: "academic-years", id: y.id, name: y.sYearCode || y.yearCode })}
                              className="p-1 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors cursor-pointer"
                              title="Xóa năm học"
                            >
                              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                <polyline points="3 6 5 6 21 6" />
                                <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                              </svg>
                            </button>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* TAB 2: HỌC KỲ (Terms) */}
          {activeTab === "terms" && (
            <div className="space-y-4">
              <FilterBar
                actions={
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-slate-500 font-semibold">Chọn năm học:</span>
                    <select
                      value={selectedYearId}
                      onChange={(e) => setSelectedYearId(e.target.value)}
                      className="bg-white border border-slate-200 rounded-xl px-3 py-1.5 text-xs font-semibold text-slate-800"
                    >
                      {years.map((y) => (
                        <option key={y.id} value={y.id}>
                          {y.sYearCode || y.yearCode}
                        </option>
                      ))}
                    </select>
                  </div>
                }
              >
                <span className="text-xs font-bold text-slate-800">Học kỳ theo năm học được chọn</span>
              </FilterBar>

              <div className="bg-white border border-slate-200/90 rounded-2xl shadow-xs overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs">
                    <thead>
                      <tr className="bg-slate-50/80 border-b border-slate-200 text-slate-500 font-semibold uppercase text-[11px]">
                        <th className="py-3 px-4">Mã kỳ</th>
                        <th className="py-3 px-4">Tên học kỳ</th>
                        <th className="py-3 px-4">Thứ tự</th>
                        <th className="py-3 px-4">Kỳ hè</th>
                        <th className="py-3 px-4">Hiện tại</th>
                        <th className="py-3 px-4">Trạng thái</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {terms.length === 0 ? (
                        <tr>
                          <td colSpan={6} className="py-8 text-center text-slate-400">
                            Năm học này chưa có học kỳ nào được thiết lập.
                          </td>
                        </tr>
                      ) : (
                        terms.map((t, index) => (
                          <Fragment key={t.id}>
                            {(index === 0 || Boolean(terms[index - 1]?.isSummer) !== Boolean(t.isSummer)) && (
                              <tr className={t.isSummer ? "bg-amber-50/70" : "bg-slate-50/70"}>
                                <td colSpan={6} className={`px-4 py-2 text-[10px] font-bold uppercase tracking-wider ${t.isSummer ? "text-amber-800" : "text-slate-500"}`}>
                                  {t.isSummer ? "Kỳ phụ" : "Học kỳ chính"}
                                </td>
                              </tr>
                            )}
                            <tr className="hover:bg-slate-50/70 transition-colors">
                              <td className="py-3.5 px-4 font-bold font-mono text-slate-900">{t.sTermCode || t.termCode}</td>
                              <td className="py-3.5 px-4 font-semibold text-slate-800">{t.sTermName || t.termName}</td>
                              <td className="py-3.5 px-4 text-slate-600">{t.sTermOrder || t.termOrder}</td>
                              <td className="py-3.5 px-4">
                                {t.bIsSummer || t.isSummer ? (
                                  <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-amber-50 text-amber-700 border border-amber-200">
                                    Học kỳ hè
                                  </span>
                                ) : (
                                  <span className="text-slate-400">Chính</span>
                                )}
                              </td>
                              <td className="py-3.5 px-4">
                                {t.isCurrent ? (
                                  <span className="px-2 py-0.5 rounded-md text-[11px] font-bold bg-blue-50 text-blue-700 border border-blue-200">
                                    Đang dùng
                                  </span>
                                ) : (
                                  <span className="text-slate-400">—</span>
                                )}
                              </td>
                              <td className="py-3.5 px-4">
                                <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-semibold bg-emerald-100 text-emerald-800">
                                  {t.status || "Đang mở"}
                                </span>
                              </td>
                            </tr>
                          </Fragment>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}

          {/* TAB 3: HỌC PHẦN (Courses) */}
          {activeTab === "courses" && (
            <div className="space-y-4">
              <FilterBar
                onReset={() => setSearchQuery("")}
                actions={
                  <span className="text-xs text-slate-500 font-medium">
                    Tổng cộng: <strong className="font-semibold text-slate-900">{courses.length}</strong> học phần
                  </span>
                }
              >
                <input
                  type="text"
                  placeholder="Tìm theo mã hoặc tên học phần..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="bg-white border border-slate-200 rounded-xl px-3 py-2 text-xs font-medium text-slate-800 placeholder:text-slate-400 min-w-[240px] focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)]"
                />
              </FilterBar>

              <div className="bg-white border border-slate-200/90 rounded-2xl shadow-xs overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs">
                    <thead>
                      <tr className="bg-slate-50/80 border-b border-slate-200 text-slate-500 font-semibold uppercase text-[11px]">
                        <th className="py-3 px-4">Mã HP</th>
                        <th className="py-3 px-4">Tên học phần</th>
                        <th className="py-3 px-4">Số tín chỉ</th>
                        <th className="py-3 px-4">Lý thuyết / Thực hành</th>
                        <th className="py-3 px-4">Học phần tiên quyết</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {courses
                        .filter((c) =>
                          !searchQuery ||
                          (c.sCourseId || c.courseCode || "").toLowerCase().includes(searchQuery.toLowerCase()) ||
                          (c.sCourseName || c.courseName || "").toLowerCase().includes(searchQuery.toLowerCase())
                        )
                        .map((c) => (
                          <tr key={c.id} className="hover:bg-slate-50/70 transition-colors">
                            <td className="py-3.5 px-4 font-mono font-bold text-slate-900">
                              {c.sCourseId || c.courseCode}
                            </td>
                            <td className="py-3.5 px-4 font-semibold text-slate-800">
                              {c.sCourseName || c.courseName}
                            </td>
                            <td className="py-3.5 px-4 font-mono font-bold text-emerald-600">
                              {c.nCredits || c.credits} TC
                            </td>
                            <td className="py-3.5 px-4 text-slate-600">
                              {c.nTheoryHours ?? 45} LT / {c.nPracticeHours ?? 0} TH
                            </td>
                            <td className="py-3.5 px-4 text-slate-400">
                              {c.prerequisites ? c.prerequisites.join(", ") : "Không có"}
                            </td>
                          </tr>
                        ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}

          {/* TAB 4: CHƯƠNG TRÌNH ĐÀO TẠO (Programs) */}
          {activeTab === "programs" && (
            <div className="bg-white border border-slate-200/90 rounded-2xl shadow-xs overflow-hidden">
              <div className="p-4 border-b border-slate-100 flex items-center justify-between">
                <h3 className="text-sm font-bold text-slate-900" style={{ fontFamily: "Be Vietnam Pro, sans-serif" }}>
                  Chương trình Đào tạo Đại học ({programs.length})
                </h3>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead>
                    <tr className="bg-slate-50/80 border-b border-slate-200 text-slate-500 font-semibold uppercase text-[11px]">
                      <th className="py-3 px-4">Mã CTĐT</th>
                      <th className="py-3 px-4">Tên chương trình</th>
                      <th className="py-3 px-4">Ngành đào tạo</th>
                      <th className="py-3 px-4">Bậc / Hệ đào tạo</th>
                      <th className="py-3 px-4">Số học phần</th>
                      <th className="py-3 px-4 text-right">Chi tiết</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {programs.map((p) => (
                      <tr key={p.id} className="hover:bg-slate-50/70 transition-colors">
                        <td className="py-3.5 px-4 font-mono font-bold text-slate-900">{p.programCode}</td>
                        <td className="py-3.5 px-4 font-semibold text-slate-800">{p.programName}</td>
                        <td className="py-3.5 px-4 text-slate-600">{p.majorName || "Công nghệ Thông tin"}</td>
                        <td className="py-3.5 px-4 text-slate-600">
                          {p.degreeLevel || "Đại học"} • {p.studyType || "Chính quy"}
                        </td>
                        <td className="py-3.5 px-4 font-mono font-bold text-blue-600">{p.courseCount || 42} học phần</td>
                        <td className="py-3.5 px-4 text-right">
                          <button
                            type="button"
                            onClick={() => router.push(`/academics/training-programs/${p.id}`)}
                            className="inline-flex items-center gap-1 px-3 py-1 text-xs font-bold text-[var(--color-primary)] hover:bg-emerald-50 rounded-lg transition-colors cursor-pointer"
                          >
                            <span>Xem khung môn</span>
                            <span>→</span>
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* TAB 5: KHÓA SINH VIÊN (Cohorts) */}
          {activeTab === "cohorts" && (
            <div className="bg-white border border-slate-200/90 rounded-2xl shadow-xs overflow-hidden">
              <div className="p-4 border-b border-slate-100 flex items-center justify-between">
                <h3 className="text-sm font-bold text-slate-900" style={{ fontFamily: "Be Vietnam Pro, sans-serif" }}>
                  Khóa Sinh viên ({cohorts.length})
                </h3>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead>
                    <tr className="bg-slate-50/80 border-b border-slate-200 text-slate-500 font-semibold uppercase text-[11px]">
                      <th className="py-3 px-4">Mã khóa</th>
                      <th className="py-3 px-4">Tên khóa</th>
                      <th className="py-3 px-4">Thời gian tạo</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {cohorts.map((c) => (
                      <tr key={c.id} className="hover:bg-slate-50/70 transition-colors">
                        <td className="py-3.5 px-4 font-mono font-bold text-slate-900">{c.cohortCode}</td>
                        <td className="py-3.5 px-4 font-semibold text-slate-800">{c.cohortName}</td>
                        <td className="py-3.5 px-4 text-slate-400">
                          {c.createdAt ? new Date(c.createdAt).toLocaleDateString("vi-VN") : "—"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* TAB 6: LỚP HỌC (Classes) */}
          {activeTab === "classes" && (
            <div className="bg-white border border-slate-200/90 rounded-2xl shadow-xs overflow-hidden">
              <div className="p-4 border-b border-slate-100 flex items-center justify-between">
                <h3 className="text-sm font-bold text-slate-900" style={{ fontFamily: "Be Vietnam Pro, sans-serif" }}>
                  Danh sách Lớp sinh viên ({classes.length})
                </h3>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead>
                    <tr className="bg-slate-50/80 border-b border-slate-200 text-slate-500 font-semibold uppercase text-[11px]">
                      <th className="py-3 px-4">Mã lớp</th>
                      <th className="py-3 px-4">Tên lớp</th>
                      <th className="py-3 px-4">Khóa trực thuộc</th>
                      <th className="py-3 px-4 text-right">Thao tác</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {classes.map((c) => (
                      <tr key={c.id} className="hover:bg-slate-50/70 transition-colors">
                        <td className="py-3.5 px-4 font-mono font-bold text-slate-900">{c.classId}</td>
                        <td className="py-3.5 px-4 font-semibold text-slate-800">{c.className}</td>
                        <td className="py-3.5 px-4">
                          <span className="px-2 py-0.5 rounded font-mono font-semibold bg-slate-100 text-slate-700">
                            {cohorts.find((co) => co.id === c.cohortId)?.cohortCode || "Chưa gán"}
                          </span>
                        </td>
                        <td className="py-3.5 px-4 text-right">
                          {can("class.manage") && (
                            <button
                              type="button"
                              onClick={() => setDeleteTarget({ type: "classes", id: c.id, name: c.classId })}
                              className="p-1 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors cursor-pointer"
                              title="Xóa lớp học"
                            >
                              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                <polyline points="3 6 5 6 21 6" />
                                <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                              </svg>
                            </button>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* TAB 7: KẾ HOẠCH ĐÀO TẠO (Plans) */}
          {activeTab === "plans" && (
            <div className="bg-white border border-slate-200/90 rounded-2xl shadow-xs overflow-hidden">
              <div className="p-4 border-b border-slate-100 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div>
                  <h3 className="text-sm font-bold text-slate-900" style={{ fontFamily: "Be Vietnam Pro, sans-serif" }}>
                    Kế hoạch Đào tạo theo Học kỳ ({plans.length})
                  </h3>
                  <p className="text-xs text-slate-500">
                    Kế hoạch mở môn và chỉ tiêu tín chỉ để đối soát tiến độ sinh viên
                  </p>
                </div>
                {can("progress.plan.manage") && (
                  <button
                    type="button"
                    onClick={handleOpenPlanEditor}
                    className="inline-flex items-center gap-1.5 px-3.5 py-2 bg-[var(--color-primary)] hover:bg-[var(--color-primary)]/90 text-white text-xs font-semibold rounded-xl shadow-xs transition-colors cursor-pointer"
                  >
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                      <line x1="12" y1="5" x2="12" y2="19" />
                      <line x1="5" y1="12" x2="19" y2="12" />
                    </svg>
                    <span>Tạo Kế hoạch mới</span>
                  </button>
                )}
              </div>

              <div className="flex flex-col">
                {[
                  { key: 'locked', title: 'Đã khóa', data: plans.filter((p: ApiData) => p.status === 'locked') },
                  { key: 'draft', title: 'Bản nháp', data: plans.filter((p: ApiData) => p.status === 'draft') },
                  { key: 'archived', title: 'Lưu trữ', data: plans.filter((p: ApiData) => p.status === 'archived') }
                ].map(group => (
                  <div key={group.key} className="border-t border-slate-100 first:border-0">
                    <div className="px-4 py-2.5 bg-slate-50/50 flex items-center justify-between">
                      <span className="text-[11px] font-bold text-slate-700 uppercase tracking-wide">{group.title} ({group.data.length})</span>
                    </div>
                    {group.data.length === 0 ? (
                      <div className="py-6 text-center text-slate-400 text-xs">
                        Không có kế hoạch nào.
                      </div>
                    ) : (
                      <div className="overflow-x-auto">
                        <table className="w-full text-left text-xs">
                          <thead>
                            <tr className="bg-slate-50/30 border-y border-slate-100 text-slate-500 font-semibold uppercase text-[10px]">
                              <th className="py-2.5 px-4">Khóa / CTĐT</th>
                              <th className="py-2.5 px-4">Học kỳ / Năm học</th>
                              <th className="py-2.5 px-4 text-center">Lộ trình</th>
                              <th className="py-2.5 px-4 text-center">Phiên bản</th>
                              <th className="py-2.5 px-4">Trạng thái</th>
                              <th className="py-2.5 px-4 text-right">Thao tác</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-100">
                            {[...group.data].sort((a, b) => {
                              const c1 = a.cohortCode || "";
                              const c2 = b.cohortCode || "";
                              if (c1 !== c2) return c2.localeCompare(c1);
                              const p1 = a.programCode || "";
                              const p2 = b.programCode || "";
                              if (p1 !== p2) return p1.localeCompare(p2);
                              return (a.curriculumSemesterNo || 0) - (b.curriculumSemesterNo || 0);
                            }).map((pl: ApiData) => (
                              <tr key={pl.id} className="hover:bg-slate-50/70 transition-colors">
                                <td className="py-3 px-4 font-bold text-slate-900">
                                  <div>{pl.cohortCode || "Khóa"}</div>
                                  <div className="text-[10px] text-slate-400 font-mono">{pl.programCode || "CTĐT"}</div>
                                </td>
                                <td className="py-3 px-4 text-slate-700 font-medium">
                                  <div>{pl.termCode || "HK01"}</div>
                                  <div className="text-[10px] text-slate-400">{pl.academicYearCode || ""}</div>
                                </td>
                                <td className="py-3 px-4 text-center font-mono font-bold text-slate-800">
                                  HK {pl.curriculumSemesterNo}
                                </td>
                                <td className="py-3 px-4 text-center font-mono">
                                  v{pl.version || 1}
                                </td>
                                <td className="py-3 px-4">
                                  <div className="flex flex-wrap items-center gap-1.5">
                                    <span
                                      className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold ${pl.status === "locked"
                                        ? "bg-blue-50 text-blue-700 border border-blue-200"
                                        : pl.status === "archived"
                                          ? "bg-slate-100 text-slate-600 border border-slate-200"
                                          : "bg-amber-50 text-amber-700 border border-amber-200"
                                        }`}
                                    >
                                      {pl.status === "locked" ? "Đã khóa" : pl.status === "archived" ? "Lưu trữ" : "Bản nháp"}
                                    </span>
                                    {pl.isCurrent && (
                                      <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[9px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">
                                        Hiện hành
                                      </span>
                                    )}
                                  </div>
                                </td>
                                <td className="py-3 px-4 text-right space-x-1 whitespace-nowrap">
                                  <button
                                    type="button"
                                    onClick={() => handleViewPlanCourses(pl.id)}
                                    className="px-2 py-1 text-[11px] font-semibold text-blue-600 hover:bg-blue-50 rounded-md transition-colors cursor-pointer"
                                    title="Xem chi tiết học phần kế hoạch"
                                  >
                                    Xem học phần
                                  </button>
                                  {can("progress.plan.manage") && pl.status === "draft" && (
                                    <button
                                      type="button"
                                      onClick={() => handleLockPlan(pl.id)}
                                      className="px-2 py-1 text-[11px] font-semibold text-emerald-700 hover:bg-emerald-50 rounded-md transition-colors cursor-pointer"
                                      title="Khóa kế hoạch để tính toán"
                                    >
                                      Khóa
                                    </button>
                                  )}
                                  {can("progress.plan.manage") && pl.status === "locked" && !pl.isCurrent && (
                                    <button
                                      type="button"
                                      onClick={() => handleActivatePlan(pl.id)}
                                      className="px-2 py-1 text-[11px] font-semibold text-purple-700 hover:bg-purple-50 rounded-md transition-colors cursor-pointer"
                                      title="Kích hoạt làm kế hoạch hiện hành"
                                    >
                                      Kích hoạt
                                    </button>
                                  )}
                                  {can("progress.plan.manage") && pl.status !== "archived" && (
                                    <button
                                      type="button"
                                      onClick={() => handleArchivePlan(pl.id)}
                                      className="px-2 py-1 text-[11px] font-semibold text-slate-500 hover:bg-slate-100 rounded-md transition-colors cursor-pointer"
                                      title="Lưu trữ kế hoạch"
                                    >
                                      Lưu trữ
                                    </button>
                                  )}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}
        </>
      )}

      {/* Modal: Thêm Năm học */}
      <Modal isOpen={showYearModal} onClose={() => setShowYearModal(false)} title="Thêm Năm học Mới" maxWidth="md">
        <form onSubmit={handleCreateYear} className="space-y-4">
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">Mã năm học (YYYY-YYYY)</label>
            <input
              type="text"
              required
              placeholder="2025-2026"
              value={yearForm.yearCode}
              onChange={(e) => setYearForm({ ...yearForm, yearCode: e.target.value })}
              className="w-full bg-white border border-slate-200 rounded-xl px-3 py-2 text-xs font-mono font-bold text-slate-800 focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)]"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Từ ngày</label>
              <input
                type="date"
                value={yearForm.startDate}
                onChange={(e) => setYearForm({ ...yearForm, startDate: e.target.value })}
                className="w-full bg-white border border-slate-200 rounded-xl px-3 py-2 text-xs font-medium text-slate-800"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Đến ngày</label>
              <input
                type="date"
                value={yearForm.endDate}
                onChange={(e) => setYearForm({ ...yearForm, endDate: e.target.value })}
                className="w-full bg-white border border-slate-200 rounded-xl px-3 py-2 text-xs font-medium text-slate-800"
              />
            </div>
          </div>

          <div className="flex items-center gap-2 pt-2">
            <input
              type="checkbox"
              id="yearCurrentCheck"
              checked={yearForm.isCurrent}
              onChange={(e) => setYearForm({ ...yearForm, isCurrent: e.target.checked })}
              className="rounded border-slate-300 text-[var(--color-primary)] focus:ring-[var(--color-primary)]"
            />
            <label htmlFor="yearCurrentCheck" className="text-xs font-medium text-slate-700 cursor-pointer">
              Đặt làm Năm học hiện tại
            </label>
          </div>

          <div className="flex items-center justify-end gap-2 pt-4 border-t border-slate-100">
            <button
              type="button"
              onClick={() => setShowYearModal(false)}
              className="px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100 rounded-xl"
            >
              Hủy
            </button>
            <button
              type="submit"
              className="px-4 py-2 text-xs font-semibold text-white bg-[var(--color-primary)] hover:opacity-90 rounded-xl"
            >
              Lưu năm học
            </button>
          </div>
        </form>
      </Modal>

      {/* Modal: Thêm Học kỳ */}
      <Modal isOpen={showTermModal} onClose={() => setShowTermModal(false)} title="Thêm Học kỳ" maxWidth="md">
        <form onSubmit={handleCreateTerm} className="space-y-4">
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">Mã học kỳ</label>
            <input
              list="academic-term-code-suggestions"
              value={termForm.termCode}
              onChange={(e) => setTermForm({ ...termForm, termCode: e.target.value })}
              className="w-full bg-white border border-slate-200 rounded-xl px-3 py-2 text-xs font-medium text-slate-800 font-mono"
            />
            <datalist id="academic-term-code-suggestions">
              <option value="HK01" />
              <option value="HK02" />
              {configuredSummerTermCode && <option value={configuredSummerTermCode} />}
            </datalist>
            <p className="mt-1 text-[10px] text-slate-500">Mã kỳ không quyết định kỳ hè; dùng cờ Kỳ hè bên dưới.</p>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">Tên học kỳ</label>
            <input
              type="text"
              required
              value={termForm.termName}
              onChange={(e) => setTermForm({ ...termForm, termName: e.target.value })}
              className="w-full bg-white border border-slate-200 rounded-xl px-3 py-2 text-xs font-medium text-slate-800"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Thứ tự kỳ</label>
              <input
                type="number"
                min={1}
                value={termForm.termOrder}
                onChange={(e) => setTermForm({ ...termForm, termOrder: Number(e.target.value) })}
                className="w-full bg-white border border-slate-200 rounded-xl px-3 py-2 text-xs font-medium text-slate-800"
              />
            </div>
            <div className="flex items-center gap-2 pt-6">
              <input
                type="checkbox"
                id="isSummerCheck"
                checked={termForm.isSummer}
                onChange={(e) => {
                  const isSummer = e.target.checked;
                  setTermForm({
                    ...termForm,
                    isSummer,
                    ...(isSummer && configuredSummerTermCode ? { termCode: configuredSummerTermCode } : {}),
                    ...(isSummer && Number.isInteger(configuredSummerTermOrder) && configuredSummerTermOrder > 0
                      ? { termOrder: configuredSummerTermOrder }
                      : {}),
                  });
                }}
                className="rounded border-slate-300 text-[var(--color-primary)]"
              />
              <label htmlFor="isSummerCheck" className="text-xs font-medium text-slate-700 cursor-pointer">
                Học kỳ hè
              </label>
            </div>
          </div>

          <div className="flex items-start gap-2 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5">
            <input
              type="checkbox"
              id="termCurrentCheck"
              checked={termForm.isCurrent}
              onChange={(e) => setTermForm({ ...termForm, isCurrent: e.target.checked })}
              className="mt-0.5 rounded border-slate-300 text-[var(--color-primary)]"
            />
            <label htmlFor="termCurrentCheck" className="text-xs font-medium text-slate-700 cursor-pointer">
              Đặt làm kỳ vận hành hiện tại
              <span className="mt-0.5 block text-[10px] font-normal text-slate-500">Kỳ hè có thể là kỳ hiện tại nhưng không tự trở thành kỳ báo cáo hoặc xếp hạng mặc định.</span>
            </label>
          </div>

          <div className="flex items-center justify-end gap-2 pt-4 border-t border-slate-100">
            <button
              type="button"
              onClick={() => setShowTermModal(false)}
              className="px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100 rounded-xl"
            >
              Hủy
            </button>
            <button
              type="submit"
              className="px-4 py-2 text-xs font-semibold text-white bg-[var(--color-primary)] hover:opacity-90 rounded-xl"
            >
              Lưu học kỳ
            </button>
          </div>
        </form>
      </Modal>

      {/* Modal: Thêm Học phần */}
      <Modal isOpen={showCourseModal} onClose={() => setShowCourseModal(false)} title="Thêm Học phần Mới" maxWidth="md">
        <form onSubmit={handleCreateCourse} className="space-y-4">
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">Mã học phần</label>
            <input
              type="text"
              required
              placeholder="IT4102"
              value={courseForm.courseCode}
              onChange={(e) => setCourseForm({ ...courseForm, courseCode: e.target.value })}
              className="w-full bg-white border border-slate-200 rounded-xl px-3 py-2 text-xs font-mono font-bold text-slate-800 uppercase"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">Tên môn học</label>
            <input
              type="text"
              required
              placeholder="Nhập môn Trí tuệ Nhân tạo"
              value={courseForm.courseName}
              onChange={(e) => setCourseForm({ ...courseForm, courseName: e.target.value })}
              className="w-full bg-white border border-slate-200 rounded-xl px-3 py-2 text-xs font-medium text-slate-800"
            />
          </div>

          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Số tín chỉ</label>
              <input
                type="number"
                min={1}
                max={10}
                value={courseForm.credits}
                onChange={(e) => setCourseForm({ ...courseForm, credits: Number(e.target.value) })}
                className="w-full bg-white border border-slate-200 rounded-xl px-3 py-2 text-xs font-mono font-bold text-slate-800"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Tiết LT</label>
              <input
                type="number"
                value={courseForm.theoryHours}
                onChange={(e) => setCourseForm({ ...courseForm, theoryHours: Number(e.target.value) })}
                className="w-full bg-white border border-slate-200 rounded-xl px-3 py-2 text-xs font-medium text-slate-800"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Tiết TH</label>
              <input
                type="number"
                value={courseForm.practiceHours}
                onChange={(e) => setCourseForm({ ...courseForm, practiceHours: Number(e.target.value) })}
                className="w-full bg-white border border-slate-200 rounded-xl px-3 py-2 text-xs font-medium text-slate-800"
              />
            </div>
          </div>

          <div className="flex items-center justify-end gap-2 pt-4 border-t border-slate-100">
            <button
              type="button"
              onClick={() => setShowCourseModal(false)}
              className="px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100 rounded-xl"
            >
              Hủy
            </button>
            <button
              type="submit"
              className="px-4 py-2 text-xs font-semibold text-white bg-[var(--color-primary)] hover:opacity-90 rounded-xl"
            >
              Lưu môn học
            </button>
          </div>
        </form>
      </Modal>

      {/* Modal: Thêm Khóa */}
      <Modal isOpen={showCohortModal} onClose={() => setShowCohortModal(false)} title="Thêm Khóa Sinh viên" maxWidth="md">
        <form onSubmit={handleCreateCohort} className="space-y-4">
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">Mã khóa (VD: K49)</label>
            <input
              type="text"
              required
              placeholder="K49"
              value={cohortForm.cohortCode}
              onChange={(e) => setCohortForm({ ...cohortForm, cohortCode: e.target.value })}
              className="w-full bg-white border border-slate-200 rounded-xl px-3 py-2 text-xs font-mono font-bold text-slate-800"
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">Tên khóa</label>
            <input
              type="text"
              required
              placeholder="Khóa 49"
              value={cohortForm.cohortName}
              onChange={(e) => setCohortForm({ ...cohortForm, cohortName: e.target.value })}
              className="w-full bg-white border border-slate-200 rounded-xl px-3 py-2 text-xs font-medium text-slate-800"
            />
          </div>
          <div className="flex items-center justify-end gap-2 pt-4 border-t border-slate-100">
            <button
              type="button"
              onClick={() => setShowCohortModal(false)}
              className="px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100 rounded-xl"
            >
              Hủy
            </button>
            <button
              type="submit"
              className="px-4 py-2 text-xs font-semibold text-white bg-[var(--color-primary)] hover:opacity-90 rounded-xl"
            >
              Lưu khóa
            </button>
          </div>
        </form>
      </Modal>

      {/* Modal: Thêm Lớp */}
      <Modal isOpen={showClassModal} onClose={() => setShowClassModal(false)} title="Thêm Lớp học Mới" maxWidth="md">
        <form onSubmit={handleCreateClass} className="space-y-4">
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">Mã lớp</label>
            <input
              type="text"
              required
              placeholder="CTK49A"
              value={classForm.classId}
              onChange={(e) => setClassForm({ ...classForm, classId: e.target.value })}
              className="w-full bg-white border border-slate-200 rounded-xl px-3 py-2 text-xs font-mono font-bold text-slate-800"
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">Tên lớp</label>
            <input
              type="text"
              required
              placeholder="Công nghệ Thông tin K49 A"
              value={classForm.className}
              onChange={(e) => setClassForm({ ...classForm, className: e.target.value })}
              className="w-full bg-white border border-slate-200 rounded-xl px-3 py-2 text-xs font-medium text-slate-800"
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">Khóa trực thuộc</label>
            <select
              value={classForm.cohortId}
              onChange={(e) => setClassForm({ ...classForm, cohortId: e.target.value })}
              className="w-full bg-white border border-slate-200 rounded-xl px-3 py-2 text-xs font-medium text-slate-800"
            >
              <option value="">Chưa gán khóa</option>
              {cohorts.map((co) => (
                <option key={co.id} value={co.id}>
                  {co.cohortCode} - {co.cohortName}
                </option>
              ))}
            </select>
          </div>
          <div className="flex items-center justify-end gap-2 pt-4 border-t border-slate-100">
            <button
              type="button"
              onClick={() => setShowClassModal(false)}
              className="px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100 rounded-xl"
            >
              Hủy
            </button>
            <button
              type="submit"
              className="px-4 py-2 text-xs font-semibold text-white bg-[var(--color-primary)] hover:opacity-90 rounded-xl"
            >
              Lưu lớp học
            </button>
          </div>
        </form>
      </Modal>

      {/* Modal: Xem Chi tiết Học phần trong Kế hoạch (PlanCoursesModal) */}
      <Modal
        isOpen={showPlanCoursesModal}
        onClose={() => setShowPlanCoursesModal(false)}
        title="Chi tiết Học phần Kế hoạch Đào tạo"
        maxWidth="2xl"
      >
        {planCoursesLoading ? (
          <div className="p-8 text-center text-slate-400 text-xs">Đang tải dữ liệu học phần...</div>
        ) : selectedPlanDetail ? (
          <div className="space-y-4">
            {/* Meta Context */}
            <div className="bg-slate-50 p-4 rounded-xl border border-slate-200 grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
              <div>
                <span className="text-slate-400 block text-[10px] uppercase font-bold">Khóa / CTĐT</span>
                <span className="font-bold text-slate-800">
                  {selectedPlanDetail.cohortCode} • {selectedPlanDetail.programCode}
                </span>
              </div>
              <div>
                <span className="text-slate-400 block text-[10px] uppercase font-bold">Học kỳ lộ trình</span>
                <span className="font-bold text-slate-800">HK {selectedPlanDetail.curriculumSemesterNo}</span>
              </div>
              <div>
                <span className="text-slate-400 block text-[10px] uppercase font-bold">Phiên bản</span>
                <span className="font-mono font-bold text-slate-800">v{selectedPlanDetail.version}</span>
              </div>
              <div>
                <span className="text-slate-400 block text-[10px] uppercase font-bold">Trạng thái</span>
                <span className="font-bold text-emerald-700">
                  {selectedPlanDetail.status === "locked" ? "Đã khóa" : selectedPlanDetail.status}
                </span>
              </div>
            </div>

            {/* Stats */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-center">
              <div className="bg-slate-100/70 p-3 rounded-xl border border-slate-200/80">
                <div className="text-[10px] uppercase font-bold text-slate-400">Tổng học phần</div>
                <div className="text-lg font-bold font-mono text-slate-800">
                  {selectedPlanDetail.courses?.length || 0} HP
                </div>
              </div>
              <div className="bg-blue-50/70 p-3 rounded-xl border border-blue-200/80">
                <div className="text-[10px] uppercase font-bold text-blue-500">TC các học phần</div>
                <div className="text-lg font-bold font-mono text-blue-700">
                  {selectedPlanDetail.courses?.reduce((s: number, c: ApiData) => s + (c.credits || 0), 0) || 0} TC
                </div>
              </div>
              <div className="bg-emerald-50/70 p-3 rounded-xl border border-emerald-200/80">
                <div className="text-[10px] uppercase font-bold text-emerald-500">Bắt buộc</div>
                <div className="text-lg font-bold font-mono text-emerald-700">
                  {selectedPlanDetail.courses?.filter((c: ApiData) => c.requirementType === "mandatory").length || 0} HP
                </div>
              </div>
              <div className="bg-amber-50/70 p-3 rounded-xl border border-amber-200/80">
                <div className="text-[10px] uppercase font-bold text-amber-500">Tự chọn yêu cầu</div>
                <div className="text-lg font-bold font-mono text-amber-700">
                  &ge; {selectedPlanDetail.requiredElectiveCredits || 0} TC
                </div>
              </div>
            </div>

            {/* Courses Table */}
            <div className="border border-slate-200 rounded-xl overflow-hidden max-h-72 overflow-y-auto">
              <table className="w-full text-left text-xs">
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-200 text-slate-500 font-semibold text-[10px] uppercase">
                    <th className="py-2.5 px-3">Mã HP</th>
                    <th className="py-2.5 px-3">Tên học phần</th>
                    <th className="py-2.5 px-3 text-right">Số TC</th>
                    <th className="py-2.5 px-3">Nhóm môn</th>
                    <th className="py-2.5 px-3">Đăng ký</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {selectedPlanDetail.courses?.map((c: ApiData) => (
                    <tr key={c.id || c.courseId} className="hover:bg-slate-50/60">
                      <td className="py-2 px-3 font-mono font-bold text-slate-800">{c.courseCode}</td>
                      <td className="py-2 px-3 font-medium text-slate-800">{c.courseName}</td>
                      <td className="py-2 px-3 text-right font-mono font-bold text-emerald-600">
                        {c.credits} TC
                      </td>
                      <td className="py-2 px-3">
                        <span
                          className={`inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-bold ${c.requirementType === "mandatory"
                            ? "bg-blue-50 text-blue-700"
                            : "bg-amber-50 text-amber-700"
                            }`}
                        >
                          {c.requirementType === "mandatory" ? "Bắt buộc" : "Tự chọn"}
                        </span>
                      </td>
                      <td className="py-2 px-3">
                        {c.isRegistrationRequired ? (
                          <span className="text-[10px] font-bold text-blue-600 bg-blue-50 px-1.5 py-0.5 rounded">
                            Bắt buộc
                          </span>
                        ) : (
                          <span className="text-[10px] text-slate-500">{c.choiceGroupCode ? "Chọn trong nhóm" : "Tùy chọn"}</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="flex justify-end pt-3 border-t border-slate-100">
              <button
                type="button"
                onClick={() => setShowPlanCoursesModal(false)}
                className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold rounded-xl"
              >
                Đóng
              </button>
            </div>
          </div>
        ) : null}
      </Modal>

      {/* Modal: Tạo Kế hoạch Đào tạo mới (PlanEditorModal) */}
      <Modal
        isOpen={showPlanEditorModal}
        onClose={() => setShowPlanEditorModal(false)}
        title="Tạo Kế hoạch Đào tạo mới (Học kỳ)"
        maxWidth="2xl"
      >
        <form onSubmit={handleSavePlan} className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Khóa sinh viên <span className="text-red-500">*</span>
              </label>
              <select
                required
                value={planEditorForm.cohortId}
                onChange={(e) => setPlanEditorForm({ ...planEditorForm, cohortId: e.target.value })}
                className="w-full bg-white border border-slate-200 rounded-xl px-3 py-2 text-xs font-medium text-slate-800"
              >
                {cohorts.map((co) => (
                  <option key={co.id} value={co.id}>
                    {co.cohortCode} - {co.cohortName}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Chương trình đào tạo <span className="text-red-500">*</span>
              </label>
              <select
                required
                value={planEditorForm.trainingProgramId}
                onChange={(e) => handlePlanProgramChange(e.target.value)}
                className="w-full bg-white border border-slate-200 rounded-xl px-3 py-2 text-xs font-medium text-slate-800"
              >
                {programs.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.programCode} - {p.programName}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Học kỳ áp dụng <span className="text-red-500">*</span>
              </label>
              <select
                required
                value={planEditorForm.academicTermId}
                onChange={(e) => setPlanEditorForm({ ...planEditorForm, academicTermId: e.target.value })}
                className="w-full bg-white border border-slate-200 rounded-xl px-3 py-2 text-xs font-medium text-slate-800"
              >
                {terms.filter((t) => !t.isSummer).map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.termCode} - {t.termName}
                  </option>
                ))}
              </select>
              <p className="mt-1 text-[10px] text-slate-500">Kỳ hè không có milestone hoặc kế hoạch đào tạo riêng.</p>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Học kỳ lộ trình (1 - 8) <span className="text-red-500">*</span>
              </label>
              <input
                type="number"
                min={1}
                max={12}
                required
                value={planEditorForm.curriculumSemesterNo}
                onChange={(e) =>
                  setPlanEditorForm({ ...planEditorForm, curriculumSemesterNo: parseInt(e.target.value) || 1 })
                }
                className="w-full bg-white border border-slate-200 rounded-xl px-3 py-2 text-xs text-slate-800"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                TC tự chọn yêu cầu
              </label>
              <input
                type="number"
                min={0}
                max={30}
                value={planEditorForm.requiredElectiveCredits}
                onChange={(e) =>
                  setPlanEditorForm({ ...planEditorForm, requiredElectiveCredits: parseInt(e.target.value) || 0 })
                }
                className="w-full bg-white border border-slate-200 rounded-xl px-3 py-2 text-xs text-slate-800"
              />
            </div>
          </div>

          <div className="flex items-center gap-2">
            <input
              type="checkbox"
              id="isFinal"
              checked={planEditorForm.isProgramFinal}
              onChange={(e) => setPlanEditorForm({ ...planEditorForm, isProgramFinal: e.target.checked })}
              className="rounded text-[var(--color-primary)]"
            />
            <label htmlFor="isFinal" className="text-xs font-semibold text-slate-700 cursor-pointer">
              Đánh dấu là Kế hoạch cuối cùng của CTĐT (Kế hoạch hoàn thành tốt nghiệp)
            </label>
          </div>

          {/* Course Pick list from Program */}
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="block text-xs font-semibold text-slate-700">
                Chọn học phần mở trong kế hoạch này ({Object.keys(selectedPlanCourses).length} đã chọn)
              </label>
              <span className="text-[11px] text-slate-400">
                Lấy từ CTĐT {programs.find((p) => p.id === planEditorForm.trainingProgramId)?.programCode}
              </span>
            </div>

            <div className="border border-slate-200 rounded-xl max-h-56 overflow-y-auto divide-y divide-slate-100">
              {programCoursesForPlan.length === 0 ? (
                <div className="p-4 text-center text-xs text-slate-400">
                  CTĐT chưa có học phần nào. Hãy thêm học phần vào CTĐT trước.
                </div>
              ) : (
                programCoursesForPlan.map((c) => {
                  const isChecked = Boolean(selectedPlanCourses[c.courseId]);
                  const cfg = selectedPlanCourses[c.courseId] || {
                    requirementType: c.requirementType === "Tự Chọn" ? "elective" : "mandatory",
                    choiceGroupCode: "",
                    isRegistrationRequired: c.requirementType === "Bắt Buộc",
                  };
                  return (
                    <div
                      key={c.id || c.courseId}
                      className={`p-2.5 flex items-center justify-between text-xs gap-2 ${isChecked ? "bg-emerald-50/40" : "hover:bg-slate-50"
                        }`}
                    >
                      <div className="flex items-center gap-2 flex-1">
                        <input
                          type="checkbox"
                          checked={isChecked}
                          onChange={() => handleTogglePlanCourse(c)}
                          className="rounded text-[var(--color-primary)]"
                        />
                        <div>
                          <span className="font-mono font-bold text-slate-900 mr-2">{c.courseCode}</span>
                          <span className="font-semibold text-slate-800">{c.courseName}</span>
                          <span className="text-emerald-700 font-mono font-bold ml-2">({c.credits} TC)</span>
                        </div>
                      </div>

                      {isChecked && (
                        <div className="flex items-center gap-2">
                          <select
                            value={cfg.requirementType}
                            onChange={(e) =>
                              setSelectedPlanCourses((prev) => ({
                                ...prev,
                                [c.courseId]: { ...cfg, requirementType: e.target.value },
                              }))
                            }
                            className="bg-white border border-slate-200 rounded px-2 py-1 text-[11px]"
                          >
                            <option value="mandatory">Bắt buộc</option>
                            <option value="elective">Tự chọn</option>
                          </select>

                          <input
                            type="text"
                            placeholder="Nhóm chọn (VD: NHOM1)"
                            value={cfg.choiceGroupCode}
                            onChange={(e) =>
                              setSelectedPlanCourses((prev) => ({
                                ...prev,
                                [c.courseId]: { ...cfg, choiceGroupCode: e.target.value },
                              }))
                            }
                            className="w-28 bg-white border border-slate-200 rounded px-2 py-1 text-[11px] font-mono"
                          />
                        </div>
                      )}
                    </div>
                  );
                })
              )}
            </div>
          </div>

          <div className="flex justify-end gap-2 pt-4 border-t border-slate-100">
            <button
              type="button"
              onClick={() => setShowPlanEditorModal(false)}
              className="px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100 rounded-xl"
            >
              Hủy
            </button>
            <button
              type="submit"
              disabled={planSubmitting}
              className="px-5 py-2 text-xs font-semibold text-white bg-[var(--color-primary)] hover:opacity-90 rounded-xl disabled:opacity-50"
            >
              {planSubmitting ? "Đang tạo..." : "Lưu Kế hoạch Đào tạo"}
            </button>
          </div>
        </form>
      </Modal>

      {/* Confirm Delete Dialog */}
      <ConfirmDialog
        isOpen={Boolean(deleteTarget)}
        onClose={() => setDeleteTarget(null)}
        onConfirm={handleConfirmDelete}
        loading={deleteLoading}
        isDangerous
        title="Xác nhận xóa"
        message={`Bạn có chắc chắn muốn xóa mục "${deleteTarget?.name}" không? Thao tác này sẽ cập nhật trạng thái lưu trữ.`}
        confirmText="Xác nhận xóa"
      />
    </div>
  );
}
