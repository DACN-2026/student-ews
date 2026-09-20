"use client";

import { useState, useEffect, useMemo, useCallback, use } from "react";
import { apiFetch } from "@/lib/api-client";
import { useRouter } from "next/navigation";
import FilterBar from "@/components/ui/FilterBar";
import SlideOverDrawer from "@/components/ui/SlideOverDrawer";
import ConfirmDialog from "@/components/ui/ConfirmDialog";

interface ProgramCourse {
  id: string;
  courseId: string;
  courseCode: string;
  courseName: string;
  credits: number;
  semesterNo: number;
  requirementType: "Bắt Buộc" | "Tự Chọn" | string;
  theoryHours?: number | null;
  practiceHours?: number | null;
  departmentCode?: string | null;
  facultyCode?: string | null;
  note?: string | null;
  yearCode?: string;
  termCode?: string;
  termName?: string;
  academicYearId?: string | null;
  academicTermId?: string | null;
}
interface TrainingProgramDetail {
  id: string;
  programCode: string;
  programName: string;
  majorName?: string;
  degreeLevel?: string;
  studyType?: string;
  status?: string;
  courses: ProgramCourse[];
}

export default function TrainingProgramDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const router = useRouter();
  const resolvedParams = use(params);
  const programId = resolvedParams.id;

  const [program, setProgram] = useState<TrainingProgramDetail | null>(null);
  const [plans, setPlans] = useState<ApiData[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<"curriculum" | "plans">("curriculum");

  // Filters
  const [searchQuery, setSearchQuery] = useState("");
  const [filterType, setFilterType] = useState<string>("all");

  // Drawer Add / Edit
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);
  const [editingCourse, setEditingCourse] = useState<ProgramCourse | null>(null);
  const [submitting, setSubmitting] = useState(false);

  // Form State
  const [formData, setFormData] = useState({
    courseId: "",
    courseCode: "",
    courseName: "",
    semesterNo: 1,
    credits: 3,
    theoryHours: 45,
    practiceHours: 0,
    requirementType: "Bắt Buộc",
    departmentCode: "CNTT",
    facultyCode: "Khoa CNTT",
    note: "",
    academicYearId: "",
    academicTermId: "",
  });

  // Catalog courses for quick pick
  const [catalogCourses, setCatalogCourses] = useState<ApiData[]>([]);
  const [academicYears, setAcademicYears] = useState<ApiData[]>([]);

  // Delete Confirm
  const [deleteTarget, setDeleteTarget] = useState<ProgramCourse | null>(null);
  const [deleteLoading, setDeleteLoading] = useState(false);

  // Load Program Data
  const loadProgramData = useCallback(async () => {
    try {
      setLoading(true);
      const [pRes, plRes, cRes, yRes] = await Promise.all([
        apiFetch(`/api/v1/training-programs/${programId}`),
        apiFetch(`/api/v1/training-progress/plans?trainingProgramId=${programId}`),
        apiFetch(`/api/v1/courses?pageSize=200`),
        apiFetch(`/api/v1/academic-years`),
      ]);

      if (pRes.ok) {
        setProgram(await pRes.json());
      }
      if (plRes.ok) {
        const plJson = await plRes.json();
        setPlans(Array.isArray(plJson.items) ? plJson.items : Array.isArray(plJson) ? plJson : []);
      }
      if (cRes.ok) {
        const cJson = await cRes.json();
        setCatalogCourses(Array.isArray(cJson.items) ? cJson.items : Array.isArray(cJson) ? cJson : []);
      }
      if (yRes.ok) {
        const yJson = await yRes.json();
        const years = Array.isArray(yJson.items) ? yJson.items : Array.isArray(yJson) ? yJson : [];
        setAcademicYears(years);
      }
    } catch (err) {
      console.error("Error loading program details:", err);
    } finally {
      setLoading(false);
    }
  }, [programId]);

  useEffect(() => {
    const timeout = window.setTimeout(() => void loadProgramData(), 0);
    return () => window.clearTimeout(timeout);
  }, [loadProgramData]);

  // Open Drawer for Create
  const handleOpenCreate = () => {
    setEditingCourse(null);
    setFormData({
      courseId: "",
      courseCode: "",
      courseName: "",
      semesterNo: 1,
      credits: 3,
      theoryHours: 45,
      practiceHours: 0,
      requirementType: "Bắt Buộc",
      departmentCode: "CNTT",
      facultyCode: "Khoa CNTT",
      note: "",
      academicYearId: academicYears[0]?.id || "",
      academicTermId: academicYears[0]?.terms?.[0]?.id || "",
    });
    setIsDrawerOpen(true);
  };

  // Open Drawer for Edit
  const handleOpenEdit = (course: ProgramCourse) => {
    setEditingCourse(course);
    const yId = course.academicYearId || academicYears[0]?.id || "";

    setFormData({
      courseId: course.courseId || "",
      courseCode: course.courseCode || "",
      courseName: course.courseName || "",
      semesterNo: course.semesterNo || 1,
      credits: course.credits || 3,
      theoryHours: course.theoryHours ?? 45,
      practiceHours: course.practiceHours ?? 0,
      requirementType: course.requirementType || "Bắt Buộc",
      departmentCode: course.departmentCode || "",
      facultyCode: course.facultyCode || "",
      note: course.note || "",
      academicYearId: yId,
      academicTermId: course.academicTermId || "",
    });
    setIsDrawerOpen(true);
  };

  // Pick course from catalog
  const handlePickCatalogCourse = (courseCode: string) => {
    const item = catalogCourses.find((c) => c.courseCode === courseCode);
    if (item) {
      setFormData((prev) => ({
        ...prev,
        courseId: item.id,
        courseCode: item.courseCode,
        courseName: item.courseName,
      }));
    }
  };

  // Submit Course Form
  const handleSubmitCourse = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.courseCode.trim() || !formData.courseName.trim()) {
      alert("Vui lòng nhập mã và tên học phần!");
      return;
    }

    try {
      setSubmitting(true);
      if (editingCourse) {
        // Update
        const res = await apiFetch(`/api/v1/training-programs/${programId}/courses/${editingCourse.id}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(formData),
        });
        if (res.ok) {
          setIsDrawerOpen(false);
          await loadProgramData();
        } else {
          const err = await res.json();
          alert(err.error?.message || "Lỗi khi cập nhật học phần");
        }
      } else {
        // Create
        const res = await apiFetch(`/api/v1/training-programs/${programId}/courses`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(formData),
        });
        if (res.ok) {
          setIsDrawerOpen(false);
          await loadProgramData();
        } else {
          const err = await res.json();
          alert(err.error?.message || "Lỗi khi thêm học phần");
        }
      }
    } catch (err) {
      console.error(err);
      alert("Lỗi kết nối máy chủ");
    } finally {
      setSubmitting(false);
    }
  };

  // Delete Course
  const handleDeleteCourse = async () => {
    if (!deleteTarget) return;
    try {
      setDeleteLoading(true);
      const res = await apiFetch(`/api/v1/training-programs/${programId}/courses/${deleteTarget.id}`, {
        method: "DELETE",
      });
      if (res.ok) {
        setDeleteTarget(null);
        await loadProgramData();
      } else {
        alert("Lỗi khi xóa học phần");
      }
    } finally {
      setDeleteLoading(false);
    }
  };

  // Filtered courses
  const allCourses = useMemo(() => program?.courses || [], [program?.courses]);
  const filteredCourses = useMemo(() => {
    return allCourses.filter((c) => {
      const matchQuery =
        !searchQuery ||
        c.courseCode.toLowerCase().includes(searchQuery.toLowerCase()) ||
        c.courseName.toLowerCase().includes(searchQuery.toLowerCase()) ||
        (c.departmentCode && c.departmentCode.toLowerCase().includes(searchQuery.toLowerCase()));

      const matchType =
        filterType === "all" ||
        c.requirementType.toLowerCase() === filterType.toLowerCase();

      return matchQuery && matchType;
    });
  }, [allCourses, searchQuery, filterType]);

  // Group by Year and Term
  const groupedCourses = useMemo(() => {
    const map = new Map<string, Map<string, ProgramCourse[]>>();

    filteredCourses.forEach((c) => {
      const year = c.yearCode || `Năm ${Math.ceil(c.semesterNo / 2)}`;
      const term = c.termName || `Học kỳ ${c.semesterNo}`;

      if (!map.has(year)) map.set(year, new Map());
      const termMap = map.get(year)!;
      if (!termMap.has(term)) termMap.set(term, []);
      termMap.get(term)!.push(c);
    });

    return Array.from(map.entries()).map(([year, termMap]) => ({
      year,
      terms: Array.from(termMap.entries()).map(([term, items]) => ({
        term,
        courses: items.sort((a, b) => a.semesterNo - b.semesterNo || a.courseCode.localeCompare(b.courseCode)),
      })),
    }));
  }, [filteredCourses]);

  // Statistics
  const totalCredits = allCourses.reduce((sum, c) => sum + (c.credits || 0), 0);
  const mandatoryCount = allCourses.filter((c) => c.requirementType === "Bắt Buộc").length;
  const electiveCount = allCourses.length - mandatoryCount;
  const mandatoryCredits = allCourses
    .filter((c) => c.requirementType === "Bắt Buộc")
    .reduce((sum, c) => sum + (c.credits || 0), 0);
  const electiveCredits = totalCredits - mandatoryCredits;

  if (loading) {
    return (
      <div className="p-12 text-center text-slate-400">
        <div className="inline-flex items-center gap-2 text-sm font-medium">
          <svg className="animate-spin h-5 w-5 text-[var(--color-primary)]" viewBox="0 0 24 24" fill="none">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
          </svg>
          <span>Đang tải thông tin khung chương trình đào tạo...</span>
        </div>
      </div>
    );
  }

  if (!program) {
    return (
      <div className="p-12 text-center space-y-4">
        <p className="text-slate-500 text-sm">Không tìm thấy thông tin chương trình đào tạo.</p>
        <button
          onClick={() => router.push("/academics")}
          className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold rounded-xl transition-colors cursor-pointer"
        >
          ← Quay lại Đào tạo
        </button>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6 max-w-7xl mx-auto">
      {/* Top Header & Breadcrumb */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="space-y-1">
          <button
            onClick={() => router.push("/academics")}
            className="inline-flex items-center gap-1.5 text-xs font-semibold text-[var(--color-text-secondary)] hover:text-[var(--color-primary)] transition-colors cursor-pointer"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <polyline points="15 18 9 12 15 6" />
            </svg>
            <span>Quay lại Danh mục Đào tạo</span>
          </button>
          <div className="flex items-center gap-3">
            <h1
              className="text-2xl sm:text-3xl font-bold text-slate-900 tracking-tight"
              style={{ fontFamily: "Outfit, sans-serif" }}
            >
              {program.programName}
            </h1>
            <span className="font-mono text-xs font-bold px-2.5 py-1 rounded-lg bg-emerald-50 text-emerald-700 border border-emerald-200/80">
              {program.programCode}
            </span>
            <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full bg-slate-100 text-slate-600 border border-slate-200">
              {program.status === "archived" ? "Lưu trữ" : "Đang áp dụng"}
            </span>
          </div>
          <p className="text-xs text-slate-500">
            Khung chương trình chi tiết & phân bổ học phần theo lộ trình đào tạo
          </p>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={loadProgramData}
            className="inline-flex items-center gap-1.5 px-3 py-2 bg-white border border-slate-200 rounded-xl text-xs font-semibold text-slate-700 hover:bg-slate-50 transition-colors shadow-2xs cursor-pointer"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M21.5 2v6h-6M21.34 15.57a10 10 0 1 1-.57-8.38l5.67-5.67" />
            </svg>
            <span>Làm mới</span>
          </button>

          {activeTab === "curriculum" && (
            <button
              onClick={handleOpenCreate}
              className="inline-flex items-center gap-1.5 px-4 py-2 bg-[var(--color-primary)] hover:bg-[var(--color-primary)]/90 text-white text-xs font-semibold rounded-xl shadow-xs transition-colors cursor-pointer"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                <line x1="12" y1="5" x2="12" y2="19" />
                <line x1="5" y1="12" x2="19" y2="12" />
              </svg>
              <span>Thêm học phần vào CTĐT</span>
            </button>
          )}
        </div>
      </div>

      {/* Program Metadata Card */}
      <div className="bg-white border border-slate-200/90 rounded-2xl p-5 shadow-xs grid grid-cols-2 sm:grid-cols-4 gap-4">
        <div>
          <div className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">Trình độ đào tạo</div>
          <div className="text-sm font-bold text-slate-800 mt-1">{program.degreeLevel || "Đại học chính quy"}</div>
        </div>
        <div>
          <div className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">Chuyên ngành</div>
          <div className="text-sm font-bold text-slate-800 mt-1">{program.majorName || "Công nghệ Thông tin"}</div>
        </div>
        <div>
          <div className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">Hình thức đào tạo</div>
          <div className="text-sm font-bold text-slate-800 mt-1">{program.studyType || "Tập trung tín chỉ"}</div>
        </div>
        <div>
          <div className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">Đơn vị quản lý</div>
          <div className="text-sm font-bold text-slate-800 mt-1">Khoa Công nghệ Thông tin</div>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex items-center gap-2 border-b border-slate-200">
        <button
          onClick={() => setActiveTab("curriculum")}
          className={`flex items-center gap-2 px-4 py-3 text-xs sm:text-sm font-semibold border-b-2 transition-all cursor-pointer ${
            activeTab === "curriculum"
              ? "border-[var(--color-primary)] text-[var(--color-primary)] bg-[var(--color-primary-light)]/40 rounded-t-xl"
              : "border-transparent text-slate-500 hover:text-slate-900"
          }`}
          style={{ fontFamily: "Outfit, sans-serif" }}
        >
          <span>Khung chương trình</span>
          <span className="text-xs px-2 py-0.5 rounded-full bg-slate-100 font-bold text-slate-600">
            {allCourses.length}
          </span>
        </button>

        <button
          onClick={() => setActiveTab("plans")}
          className={`flex items-center gap-2 px-4 py-3 text-xs sm:text-sm font-semibold border-b-2 transition-all cursor-pointer ${
            activeTab === "plans"
              ? "border-[var(--color-primary)] text-[var(--color-primary)] bg-[var(--color-primary-light)]/40 rounded-t-xl"
              : "border-transparent text-slate-500 hover:text-slate-900"
          }`}
          style={{ fontFamily: "Outfit, sans-serif" }}
        >
          <span>Kế hoạch đào tạo áp dụng</span>
          <span className="text-xs px-2 py-0.5 rounded-full bg-slate-100 font-bold text-slate-600">
            {plans.length}
          </span>
        </button>
      </div>

      {/* TAB 1: CURRICULUM */}
      {activeTab === "curriculum" && (
        <div className="space-y-6">
          {/* KPI Summary badges */}
          <div className="flex flex-wrap items-center gap-3">
            <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-xl bg-slate-100 text-slate-700 text-xs font-semibold border border-slate-200">
              <span>Tổng học phần:</span>
              <strong className="font-mono text-slate-900">{allCourses.length} môn</strong>
            </div>
            <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-xl bg-blue-50 text-blue-700 text-xs font-semibold border border-blue-200">
              <span>Tổng tín chỉ:</span>
              <strong className="font-mono text-blue-900">{totalCredits} TC</strong>
            </div>
            <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-xl bg-emerald-50 text-emerald-700 text-xs font-semibold border border-emerald-200">
              <span>Bắt buộc:</span>
              <strong className="font-mono text-emerald-900">
                {mandatoryCount} HP ({mandatoryCredits} TC)
              </strong>
            </div>
            <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-xl bg-amber-50 text-amber-700 text-xs font-semibold border border-amber-200">
              <span>Tự chọn:</span>
              <strong className="font-mono text-amber-900">
                {electiveCount} HP ({electiveCredits} TC)
              </strong>
            </div>
          </div>

          {/* Filter Bar */}
          <FilterBar
            onReset={() => {
              setSearchQuery("");
              setFilterType("all");
            }}
            actions={
              <span className="text-xs text-slate-500 font-medium">
                Hiển thị <strong className="text-slate-800 font-semibold">{filteredCourses.length}</strong> / {allCourses.length} học phần
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

            <select
              value={filterType}
              onChange={(e) => setFilterType(e.target.value)}
              className="bg-white border border-slate-200 rounded-xl px-3 py-2 text-xs font-medium text-slate-800 focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)]"
            >
              <option value="all">Tất cả loại học phần</option>
              <option value="Bắt Buộc">Bắt buộc</option>
              <option value="Tự Chọn">Tự chọn</option>
            </select>
          </FilterBar>

          {/* Grouped Tables by Year and Term */}
          {groupedCourses.length === 0 ? (
            <div className="bg-white border border-slate-200/90 rounded-2xl p-12 text-center text-slate-400">
              <svg className="w-12 h-12 mx-auto text-slate-300 mb-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
              </svg>
              <p className="text-xs font-medium">Chưa có học phần nào phù hợp với bộ lọc.</p>
            </div>
          ) : (
            <div className="space-y-8">
              {groupedCourses.map((group) => (
                <section key={group.year} className="space-y-4">
                  <div className="flex items-center justify-between pb-2 border-b border-slate-200/80">
                    <h2
                      className="text-base font-bold text-slate-900"
                      style={{ fontFamily: "Outfit, sans-serif" }}
                    >
                      {group.year}
                    </h2>
                    <span className="text-xs font-semibold px-2.5 py-0.5 rounded-full bg-slate-100 text-slate-600">
                      {group.terms.reduce((acc, t) => acc + t.courses.length, 0)} học phần
                    </span>
                  </div>

                  <div className="space-y-5">
                    {group.terms.map((termBlock) => {
                      const termCredits = termBlock.courses.reduce((sum, c) => sum + (c.credits || 0), 0);
                      return (
                        <div
                          key={termBlock.term}
                          className="bg-white border border-slate-200/90 rounded-2xl shadow-xs overflow-hidden"
                        >
                          <div className="bg-slate-50/80 px-4 py-3 border-b border-slate-200/80 flex items-center justify-between">
                            <div className="flex items-center gap-2">
                              <span className="text-xs font-bold text-slate-800 font-mono">
                                📌 {termBlock.term}
                              </span>
                              <span className="text-slate-400 text-xs">•</span>
                              <span className="text-xs text-slate-500 font-medium">
                                {termBlock.courses.length} học phần
                              </span>
                            </div>
                            <span className="text-xs font-bold font-mono text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-md border border-emerald-200">
                              Tổng: {termCredits} tín chỉ
                            </span>
                          </div>

                          <div className="overflow-x-auto">
                            <table className="w-full text-left text-xs">
                              <thead>
                                <tr className="border-b border-slate-100 text-slate-500 font-semibold uppercase text-[10px]">
                                  <th className="py-2.5 px-4 w-32">Mã HP</th>
                                  <th className="py-2.5 px-4">Tên học phần</th>
                                  <th className="py-2.5 px-4 w-20 text-center">HK thứ</th>
                                  <th className="py-2.5 px-4 w-20 text-right">Số TC</th>
                                  <th className="py-2.5 px-4 w-28">Loại</th>
                                  <th className="py-2.5 px-4 w-28">LT / TH</th>
                                  <th className="py-2.5 px-4 w-36">Bộ môn</th>
                                  <th className="py-2.5 px-4 w-32 text-right">Thao tác</th>
                                </tr>
                              </thead>
                              <tbody className="divide-y divide-slate-100">
                                {termBlock.courses.map((course) => (
                                  <tr key={course.id} className="hover:bg-slate-50/70 transition-colors">
                                    <td className="py-3 px-4 font-mono font-bold text-slate-900">
                                      {course.courseCode}
                                    </td>
                                    <td className="py-3 px-4">
                                      <div className="font-semibold text-slate-800">{course.courseName}</div>
                                      {course.note && (
                                        <div className="text-[11px] text-slate-400 mt-0.5">{course.note}</div>
                                      )}
                                    </td>
                                    <td className="py-3 px-4 text-center font-mono font-semibold text-slate-700">
                                      HK {course.semesterNo}
                                    </td>
                                    <td className="py-3 px-4 text-right font-mono font-bold text-emerald-600">
                                      {course.credits} TC
                                    </td>
                                    <td className="py-3 px-4">
                                      <span
                                        className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold ${
                                          course.requirementType === "Bắt Buộc"
                                            ? "bg-blue-50 text-blue-700 border border-blue-200"
                                            : "bg-amber-50 text-amber-700 border border-amber-200"
                                        }`}
                                      >
                                        {course.requirementType}
                                      </span>
                                    </td>
                                    <td className="py-3 px-4 text-slate-600 font-mono">
                                      {course.theoryHours ?? 45}h / {course.practiceHours ?? 0}h
                                    </td>
                                    <td className="py-3 px-4 text-slate-600">
                                      {course.departmentCode || "—"}
                                    </td>
                                    <td className="py-3 px-4 text-right space-x-1">
                                      <button
                                        type="button"
                                        onClick={() => handleOpenEdit(course)}
                                        className="p-1.5 text-slate-400 hover:text-[var(--color-primary)] hover:bg-slate-100 rounded-lg transition-colors cursor-pointer"
                                        title="Sửa học phần"
                                      >
                                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                          <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
                                          <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
                                        </svg>
                                      </button>
                                      <button
                                        type="button"
                                        onClick={() => setDeleteTarget(course)}
                                        className="p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors cursor-pointer"
                                        title="Xóa học phần khỏi CTĐT"
                                      >
                                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                          <polyline points="3 6 5 6 21 6" />
                                          <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                                        </svg>
                                      </button>
                                    </td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </section>
              ))}
            </div>
          )}
        </div>
      )}

      {/* TAB 2: PLANS */}
      {activeTab === "plans" && (
        <div className="bg-white border border-slate-200/90 rounded-2xl shadow-xs overflow-hidden">
          <div className="p-4 border-b border-slate-100 flex items-center justify-between">
            <div>
              <h3 className="text-sm font-bold text-slate-900" style={{ fontFamily: "Outfit, sans-serif" }}>
                Kế hoạch Đào tạo áp dụng cho {program.programName} ({plans.length})
              </h3>
              <p className="text-xs text-slate-500">Các đợt mở học phần theo từng khóa sinh viên</p>
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="bg-slate-50/80 border-b border-slate-200 text-slate-500 font-semibold uppercase text-[11px]">
                  <th className="py-3 px-4">Khóa áp dụng</th>
                  <th className="py-3 px-4">Học kỳ / Năm học</th>
                  <th className="py-3 px-4">Lộ trình</th>
                  <th className="py-3 px-4">Phiên bản</th>
                  <th className="py-3 px-4">Trạng thái</th>
                  <th className="py-3 px-4">TC Tự chọn yêu cầu</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {plans.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="py-8 text-center text-slate-400">
                      Chưa có kế hoạch đào tạo nào được tạo riêng cho CTĐT này.
                    </td>
                  </tr>
                ) : (
                  plans.map((pl) => (
                    <tr key={pl.id} className="hover:bg-slate-50/70 transition-colors">
                      <td className="py-3.5 px-4 font-bold text-slate-900">{pl.cohortCode || "Khóa"}</td>
                      <td className="py-3.5 px-4 text-slate-700">{pl.termCode || "HK01"}</td>
                      <td className="py-3.5 px-4 text-slate-600 font-medium">HK {pl.curriculumSemesterNo}</td>
                      <td className="py-3.5 px-4 font-mono">v{pl.version}</td>
                      <td className="py-3.5 px-4">
                        <span
                          className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold ${
                            pl.status === "locked"
                              ? "bg-blue-100 text-blue-800"
                              : pl.status === "archived"
                              ? "bg-slate-100 text-slate-600"
                              : "bg-amber-100 text-amber-800"
                          }`}
                        >
                          {pl.status === "locked" ? "Đã khóa" : pl.status === "archived" ? "Lưu trữ" : "Bản nháp"}
                        </span>
                      </td>
                      <td className="py-3.5 px-4 font-mono font-bold text-slate-800">
                        {pl.requiredElectiveCredits} TC
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* SlideOver Drawer: Add / Edit Course in Program */}
      <SlideOverDrawer
        isOpen={isDrawerOpen}
        onClose={() => setIsDrawerOpen(false)}
        title={editingCourse ? `Sửa học phần ${editingCourse.courseCode}` : "Thêm học phần vào CTĐT"}
        width="lg"
      >
        <form onSubmit={handleSubmitCourse} className="space-y-4">
          {/* Quick pick from catalog */}
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              Chọn nhanh từ Danh mục Học phần (Catalog)
            </label>
            <select
              value={formData.courseCode}
              onChange={(e) => handlePickCatalogCourse(e.target.value)}
              className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs text-slate-800 focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)]"
            >
              <option value="">-- Chọn học phần mẫu hoặc nhập thủ công bên dưới --</option>
              {catalogCourses.map((c) => (
                <option key={c.id} value={c.courseCode}>
                  {c.courseCode} - {c.courseName}
                </option>
              ))}
            </select>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Mã học phần <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                required
                value={formData.courseCode}
                onChange={(e) => setFormData({ ...formData, courseCode: e.target.value })}
                className="w-full bg-white border border-slate-200 rounded-xl px-3 py-2 text-xs font-mono font-bold text-slate-900 focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)]"
                placeholder="VD: 748020101"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Học kỳ thứ (1 - 8) <span className="text-red-500">*</span>
              </label>
              <input
                type="number"
                min={1}
                max={12}
                required
                value={formData.semesterNo}
                onChange={(e) => setFormData({ ...formData, semesterNo: parseInt(e.target.value) || 1 })}
                className="w-full bg-white border border-slate-200 rounded-xl px-3 py-2 text-xs text-slate-900 focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)]"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              Tên học phần <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              required
              value={formData.courseName}
              onChange={(e) => setFormData({ ...formData, courseName: e.target.value })}
              className="w-full bg-white border border-slate-200 rounded-xl px-3 py-2 text-xs font-semibold text-slate-900 focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)]"
              placeholder="VD: Nhập môn Lập trình"
            />
          </div>

          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Số tín chỉ <span className="text-red-500">*</span>
              </label>
              <input
                type="number"
                min={1}
                max={15}
                required
                value={formData.credits}
                onChange={(e) => setFormData({ ...formData, credits: parseInt(e.target.value) || 1 })}
                className="w-full bg-white border border-slate-200 rounded-xl px-3 py-2 text-xs font-mono font-bold text-emerald-600 focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)]"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Giờ lý thuyết</label>
              <input
                type="number"
                min={0}
                value={formData.theoryHours}
                onChange={(e) => setFormData({ ...formData, theoryHours: parseInt(e.target.value) || 0 })}
                className="w-full bg-white border border-slate-200 rounded-xl px-3 py-2 text-xs text-slate-900 focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)]"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Giờ thực hành</label>
              <input
                type="number"
                min={0}
                value={formData.practiceHours}
                onChange={(e) => setFormData({ ...formData, practiceHours: parseInt(e.target.value) || 0 })}
                className="w-full bg-white border border-slate-200 rounded-xl px-3 py-2 text-xs text-slate-900 focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)]"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              Phân loại học phần <span className="text-red-500">*</span>
            </label>
            <div className="flex gap-4">
              <label className="flex items-center gap-2 text-xs font-semibold text-slate-800 cursor-pointer">
                <input
                  type="radio"
                  name="reqType"
                  value="Bắt Buộc"
                  checked={formData.requirementType === "Bắt Buộc"}
                  onChange={() => setFormData({ ...formData, requirementType: "Bắt Buộc" })}
                  className="text-[var(--color-primary)] focus:ring-[var(--color-primary)]"
                />
                <span>Học phần Bắt buộc</span>
              </label>

              <label className="flex items-center gap-2 text-xs font-semibold text-slate-800 cursor-pointer">
                <input
                  type="radio"
                  name="reqType"
                  value="Tự Chọn"
                  checked={formData.requirementType === "Tự Chọn"}
                  onChange={() => setFormData({ ...formData, requirementType: "Tự Chọn" })}
                  className="text-[var(--color-primary)] focus:ring-[var(--color-primary)]"
                />
                <span>Học phần Tự chọn</span>
              </label>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Bộ môn phụ trách</label>
              <input
                type="text"
                value={formData.departmentCode}
                onChange={(e) => setFormData({ ...formData, departmentCode: e.target.value })}
                className="w-full bg-white border border-slate-200 rounded-xl px-3 py-2 text-xs text-slate-900 focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)]"
                placeholder="VD: Kỹ thuật phần mềm"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Khoa phụ trách</label>
              <input
                type="text"
                value={formData.facultyCode}
                onChange={(e) => setFormData({ ...formData, facultyCode: e.target.value })}
                className="w-full bg-white border border-slate-200 rounded-xl px-3 py-2 text-xs text-slate-900 focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)]"
                placeholder="VD: Khoa CNTT"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">Ghi chú môn học</label>
            <textarea
              rows={2}
              value={formData.note}
              onChange={(e) => setFormData({ ...formData, note: e.target.value })}
              className="w-full bg-white border border-slate-200 rounded-xl px-3 py-2 text-xs text-slate-900 focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)]"
              placeholder="VD: Học phần tiên quyết môn Toán rời rạc..."
            />
          </div>

          <div className="pt-3 border-t border-slate-100 flex items-center justify-end gap-2">
            <button
              type="button"
              onClick={() => setIsDrawerOpen(false)}
              className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold rounded-xl transition-colors cursor-pointer"
            >
              Hủy
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="px-5 py-2 bg-[var(--color-primary)] hover:bg-[var(--color-primary)]/90 text-white text-xs font-semibold rounded-xl shadow-xs transition-colors cursor-pointer disabled:opacity-50"
            >
              {submitting ? "Đang lưu..." : editingCourse ? "Lưu thay đổi" : "Thêm vào CTĐT"}
            </button>
          </div>
        </form>
      </SlideOverDrawer>

      {/* Delete Confirm Dialog */}
      <ConfirmDialog
        isOpen={Boolean(deleteTarget)}
        title="Xóa học phần khỏi CTĐT"
        message={`Bạn có chắc chắn muốn xóa học phần ${deleteTarget?.courseCode} - ${deleteTarget?.courseName} khỏi chương trình đào tạo này không?`}
        confirmText={deleteLoading ? "Đang xóa..." : "Xóa học phần"}
        cancelText="Hủy"
        isDangerous
        loading={deleteLoading}
        onConfirm={handleDeleteCourse}
        onClose={() => setDeleteTarget(null)}
      />
    </div>
  );
}
