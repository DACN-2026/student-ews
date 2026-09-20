"use client";

import { useState, useEffect, useCallback } from "react";
import { apiFetch } from "@/lib/api-client";
import { useRouter } from "next/navigation";
import FilterBar from "@/components/ui/FilterBar";
import DataTable, { Column } from "@/components/ui/DataTable";
import Modal from "@/components/ui/Modal";
import ConfirmDialog from "@/components/ui/ConfirmDialog";
import WarningBadge, { type WarningLevel } from "@/components/WarningBadge";

interface StudentItem {
  id: string;
  studentId: string;
  studentCode: string;
  fullName: string;
  firstName?: string;
  lastName?: string;
  birthDate?: string;
  gender?: string;
  classId?: string;
  className?: string;
  classRoleId?: number;
  cohortCode?: string;
  programCode?: string;
  studyProgramId?: string;
  isInClass?: boolean;
  birthPlace?: string;
  permanentResidence?: string;
  warningLevel?: WarningLevel;
}
export default function StudentsPage() {
  const router = useRouter();

  // Student list & pagination
  const [students, setStudents] = useState<StudentItem[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [pageSize] = useState(20);

  // Filters
  const [search, setSearch] = useState("");
  const [filterClass, setFilterClass] = useState("all");
  const [filterGender, setFilterGender] = useState("all");
  const [filterInClass, setFilterInClass] = useState("all");
  const [filterWarning, setFilterWarning] = useState("all");

  // Options
  const [classList, setClassList] = useState<ApiData[]>([]);
  const [programList, setProgramList] = useState<ApiData[]>([]);

  // Modals state
  const [showAddModal, setShowAddModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [editingStudent, setEditingStudent] = useState<StudentItem | null>(null);
  const [studentToDelete, setStudentToDelete] = useState<StudentItem | null>(null);
  const [deleteLoading, setDeleteLoading] = useState(false);

  // Add / Edit Form State
  const [formData, setFormData] = useState({
    studentId: "",
    firstName: "",
    lastName: "",
    birthDate: "2003-01-01",
    gender: "Nam",
    classStudentId: "",
    studyProgramId: "",
    classRoleId: 0,
    isInClass: true,
    birthPlace: "",
    permanentResidence: "",
  });
  const [formSubmitting, setFormSubmitting] = useState(false);

  // Import / Export JSON
  const [showImportModal, setShowImportModal] = useState(false);
  const [importJson, setImportJson] = useState("");
  const [importLoading, setImportLoading] = useState(false);
  const [importResult, setImportResult] = useState<{ total: number; imported: number; errors?: string[] } | null>(null);

  // Load options
  useEffect(() => {
    async function loadOptions() {
      try {
        const [cRes, pRes] = await Promise.all([
          apiFetch("/api/v1/classes"),
          apiFetch("/api/v1/training-programs"),
        ]);
        if (cRes.ok) {
          const cJson = await cRes.json();
          setClassList(Array.isArray(cJson.items) ? cJson.items : Array.isArray(cJson) ? cJson : []);
        }
        if (pRes.ok) {
          const pJson = await pRes.json();
          setProgramList(Array.isArray(pJson.items) ? pJson.items : Array.isArray(pJson) ? pJson : []);
        }
      } catch (err) {
        console.error("Error loading options:", err);
      }
    }
    loadOptions();
  }, []);

  // Fetch student list
  const fetchStudents = useCallback(async () => {
    try {
      setLoading(true);
      const params = new URLSearchParams({
        page: page.toString(),
        pageSize: pageSize.toString(),
      });
      if (search.trim()) params.set("search", search.trim());
      if (filterClass !== "all") params.set("classStudentId", filterClass);
      if (filterGender !== "all") params.set("gender", filterGender);
      if (filterInClass !== "all") params.set("isInClass", filterInClass === "true" ? "true" : "false");
      if (filterWarning !== "all") params.set("warningLevel", filterWarning);

      const res = await apiFetch(`/api/v1/students?${params.toString()}`);
      if (res.ok) {
        const json = await res.json();
        const items = (json.items || []).map((s: ApiData) => ({
          id: s.id,
          studentId: s.studentId || s.studentCode || s.sStudentId || s.id,
          studentCode: s.studentCode || s.studentId || s.sStudentId || s.id,
          fullName: s.sFullName || s.fullName || `${s.sFirstName || ""} ${s.sLastName || ""}`.trim() || "Sinh viên",
          firstName: s.sFirstName || s.firstName || "",
          lastName: s.sLastName || s.lastName || "",
          birthDate: s.dBirthDate ? new Date(s.dBirthDate).toISOString().split("T")[0] : s.birthDate || "2003-01-01",
          gender: s.sGender || s.gender || "Nam",
          classId: s.sClassStudentId || s.classId || "",
          className: s.sClassStudentId || s.className || "Chưa xếp lớp",
          classRoleId: s.nClassRoleId ?? s.classRoleId ?? 0,
          cohortCode: s.cohortCode || s.sCohortCode || "",
          programCode: s.studyProgramId || s.sStudyProgramId || "",
          studyProgramId: s.studyProgramId || s.sStudyProgramId || "",
          isInClass: s.bIsInClass !== undefined ? s.bIsInClass : s.isInClass !== undefined ? s.isInClass : true,
          birthPlace: s.birthPlace || s.sBirthPlace || "",
          permanentResidence: s.permanentResidence || s.sPermanentResidence || "",
          warningLevel: (s.warningLevel || "green") as WarningLevel,
        }));
        setStudents(items);
        setTotal(json.total || items.length);
      }
    } catch (err) {
      console.error("Fetch students error:", err);
    } finally {
      setLoading(false);
    }
  }, [page, pageSize, search, filterClass, filterGender, filterInClass, filterWarning]);

  useEffect(() => {
    const timeout = window.setTimeout(() => void fetchStudents(), 0);
    return () => window.clearTimeout(timeout);
  }, [fetchStudents]);

  // Handle Create Student
  const handleCreateStudent = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.studentId.trim() || !formData.firstName.trim() || !formData.lastName.trim()) {
      alert("Vui lòng điền đầy đủ Mã sinh viên, Họ đệm và Tên!");
      return;
    }

    try {
      setFormSubmitting(true);
      const res = await apiFetch("/api/v1/students", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(formData),
      });

      if (res.ok) {
        setShowAddModal(false);
        setFormData({
          studentId: "",
          firstName: "",
          lastName: "",
          birthDate: "2003-01-01",
          gender: "Nam",
          classStudentId: "",
          studyProgramId: "",
          classRoleId: 0,
          isInClass: true,
          birthPlace: "",
          permanentResidence: "",
        });
        await fetchStudents();
        alert("Thêm sinh viên mới thành công!");
      } else {
        const err = await res.json();
        alert(err.error?.message || "Lỗi khi thêm sinh viên");
      }
    } catch (err: ApiData) {
      alert(err.message || "Lỗi kết nối");
    } finally {
      setFormSubmitting(false);
    }
  };

  // Open Edit Modal
  const handleOpenEdit = (st: StudentItem) => {
    setEditingStudent(st);
    setFormData({
      studentId: st.studentId,
      firstName: st.firstName || st.fullName.split(" ").slice(0, -1).join(" ") || "",
      lastName: st.lastName || st.fullName.split(" ").slice(-1)[0] || "",
      birthDate: st.birthDate || "2003-01-01",
      gender: st.gender || "Nam",
      classStudentId: st.classId || "",
      studyProgramId: st.studyProgramId || "",
      classRoleId: st.classRoleId ?? 0,
      isInClass: st.isInClass ?? true,
      birthPlace: st.birthPlace || "",
      permanentResidence: st.permanentResidence || "",
    });
    setShowEditModal(true);
  };

  // Handle Update Student
  const handleUpdateStudent = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingStudent) return;

    try {
      setFormSubmitting(true);
      const res = await apiFetch(`/api/v1/students/${editingStudent.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(formData),
      });

      if (res.ok) {
        setShowEditModal(false);
        setEditingStudent(null);
        await fetchStudents();
        alert("Cập nhật thông tin sinh viên thành công!");
      } else {
        const err = await res.json();
        alert(err.error?.message || "Lỗi khi cập nhật");
      }
    } catch (err: ApiData) {
      alert(err.message || "Lỗi kết nối");
    } finally {
      setFormSubmitting(false);
    }
  };

  // Handle Soft Delete Student
  const handleConfirmDelete = async () => {
    if (!studentToDelete) return;
    try {
      setDeleteLoading(true);
      const res = await apiFetch(`/api/v1/students/${studentToDelete.id}`, {
        method: "DELETE",
      });
      if (res.ok) {
        setStudentToDelete(null);
        await fetchStudents();
        alert("Đã xóa sinh viên vào lưu trữ thành công!");
      } else {
        const err = await res.json();
        alert(err.error?.message || "Lỗi khi xóa sinh viên");
      }
    } finally {
      setDeleteLoading(false);
    }
  };

  // Handle Export
  const handleExport = async () => {
    try {
      const res = await apiFetch("/api/v1/students/export");
      if (res.ok) {
        const blob = await res.blob();
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `Danh_sach_sinh_vien_${new Date().toISOString().split("T")[0]}.json`;
        document.body.appendChild(a);
        a.click();
        a.remove();
      }
    } catch {
      alert("Lỗi khi xuất danh sách sinh viên");
    }
  };

  // Handle Import
  const handleImport = async () => {
    try {
      setImportLoading(true);
      let parsed = [];
      try {
        parsed = JSON.parse(importJson);
      } catch {
        alert("Định dạng JSON không hợp lệ!");
        return;
      }

      const res = await apiFetch("/api/v1/students/import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(parsed),
      });

      const json = await res.json();
      if (res.ok) {
        setImportResult(json);
        fetchStudents();
      } else {
        alert(json.error?.message || "Lỗi khi import");
      }
    } catch (err: ApiData) {
      alert(err.message || "Lỗi xử lý import");
    } finally {
      setImportLoading(false);
    }
  };

  // Table Columns
  const columns: Column<StudentItem>[] = [
    {
      key: "studentCode",
      title: "Mã sinh viên",
      width: 140,
      render: (_, r) => (
        <span className="font-mono font-bold text-slate-900 hover:text-[var(--color-primary)] transition-colors">
          {r.studentCode}
        </span>
      ),
    },
    {
      key: "fullName",
      title: "Họ và tên",
      render: (_, r) => (
        <div>
          <div className="font-semibold text-slate-800">{r.fullName}</div>
          {r.classRoleId === 1 && (
            <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-bold bg-blue-50 text-blue-700 border border-blue-200 mt-0.5">
              Lớp trưởng
            </span>
          )}
        </div>
      ),
    },
    {
      key: "birthDate",
      title: "Ngày sinh",
      width: 120,
      render: (v) => <span className="text-slate-600">{v || "—"}</span>,
    },
    {
      key: "gender",
      title: "Giới tính",
      width: 100,
      render: (v) => (
        <span className="px-2 py-0.5 rounded-md bg-slate-100 text-slate-700 font-medium text-[11px]">
          {v || "—"}
        </span>
      ),
    },
    {
      key: "className",
      title: "Lớp",
      width: 130,
      render: (v) => (
        <span className="font-semibold text-slate-800 bg-slate-50 px-2 py-1 rounded-lg border border-slate-200">
          {v || "Chưa xếp lớp"}
        </span>
      ),
    },
    {
      key: "isInClass",
      title: "Trạng thái",
      width: 120,
      render: (v) => (
        <span
          className={`inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-semibold ${
            v
              ? "bg-emerald-100 text-emerald-800 border border-emerald-200"
              : "bg-slate-100 text-slate-500 border border-slate-200"
          }`}
        >
          {v ? "Trong lớp" : "Đã rời lớp"}
        </span>
      ),
    },
    {
      key: "warningLevel",
      title: "Mức cảnh báo",
      width: 140,
      render: (v) => <WarningBadge level={v || "green"} />,
    },
    {
      key: "actions",
      title: "Thao tác",
      width: 180,
      align: "right",
      render: (_, r) => (
        <div className="flex items-center justify-end gap-1.5" onClick={(e) => e.stopPropagation()}>
          <button
            type="button"
            onClick={() => router.push(`/students/${r.id}`)}
            className="px-2.5 py-1 rounded-lg text-xs font-semibold text-[var(--color-primary)] hover:bg-[var(--color-primary-light)] transition-colors border border-[var(--color-primary)]/40 cursor-pointer"
          >
            Hồ sơ
          </button>
          <button
            type="button"
            onClick={() => handleOpenEdit(r)}
            className="p-1 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-lg transition-colors cursor-pointer"
            title="Sửa thông tin"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
              <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
            </svg>
          </button>
          <button
            type="button"
            onClick={() => setStudentToDelete(r)}
            className="p-1 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors cursor-pointer"
            title="Xóa sinh viên"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <polyline points="3 6 5 6 21 6" />
              <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
            </svg>
          </button>
        </div>
      ),
    },
  ];

  return (
    <div className="p-6 space-y-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1
            className="text-2xl sm:text-3xl font-bold text-slate-900 tracking-tight"
            style={{ fontFamily: "Outfit, sans-serif" }}
          >
            Quản trị Hồ sơ Sinh viên
          </h1>
          <p className="text-xs sm:text-sm text-slate-500 mt-0.5">
            Quản lý hồ sơ, lớp sinh viên, tra cứu bảng điểm và cập nhật thông tin nhân thân
          </p>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          <button
            type="button"
            onClick={() => setShowImportModal(true)}
            className="px-3.5 py-2 text-xs font-semibold text-slate-700 bg-white hover:bg-slate-50 border border-slate-200 rounded-xl transition-colors shadow-xs flex items-center gap-1.5 cursor-pointer"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
              <polyline points="17 8 12 3 7 8" />
              <line x1="12" y1="3" x2="12" y2="15" />
            </svg>
            <span>Import JSON</span>
          </button>

          <button
            type="button"
            onClick={handleExport}
            className="px-3.5 py-2 text-xs font-semibold text-slate-700 bg-white hover:bg-slate-50 border border-slate-200 rounded-xl transition-colors shadow-xs flex items-center gap-1.5 cursor-pointer"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
              <polyline points="7 10 12 15 17 10" />
              <line x1="12" y1="15" x2="12" y2="3" />
            </svg>
            <span>Xuất JSON</span>
          </button>

          <button
            type="button"
            onClick={() => {
              setFormData({
                studentId: "",
                firstName: "",
                lastName: "",
                birthDate: "2003-01-01",
                gender: "Nam",
                classStudentId: classList[0]?.classId || "",
                studyProgramId: programList[0]?.programCode || "",
                classRoleId: 0,
                isInClass: true,
                birthPlace: "",
                permanentResidence: "",
              });
              setShowAddModal(true);
            }}
            className="px-4 py-2 rounded-xl bg-[var(--color-primary)] hover:opacity-90 text-white text-xs font-semibold shadow-xs transition-opacity flex items-center gap-1.5 cursor-pointer"
          >
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <line x1="12" y1="5" x2="12" y2="19" />
              <line x1="5" y1="12" x2="19" y2="12" />
            </svg>
            <span>Thêm sinh viên</span>
          </button>
        </div>
      </div>

      {/* Filter Bar */}
      <FilterBar
        onReset={() => {
          setSearch("");
          setFilterClass("all");
          setFilterGender("all");
          setFilterInClass("all");
          setFilterWarning("all");
          setPage(1);
        }}
        actions={
          <span className="text-xs text-slate-500 font-medium">
            Tổng cộng: <strong className="font-semibold text-slate-900">{total}</strong> sinh viên
          </span>
        }
      >
        {/* Search */}
        <div className="relative min-w-[200px] flex-1">
          <svg
            className="absolute left-3 top-2.5 h-3.5 w-3.5 text-slate-400"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
          >
            <circle cx="11" cy="11" r="8" />
            <line x1="21" y1="21" x2="16.65" y2="16.65" />
          </svg>
          <input
            type="text"
            placeholder="Tìm theo MSSV hoặc họ tên..."
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(1);
            }}
            className="w-full bg-white border border-slate-200 rounded-xl pl-8 pr-3 py-2 text-xs font-medium text-slate-800 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)]"
          />
        </div>

        {/* Filter Class */}
        <select
          value={filterClass}
          onChange={(e) => {
            setFilterClass(e.target.value);
            setPage(1);
          }}
          className="bg-white border border-slate-200 rounded-xl px-3 py-2 text-xs font-medium text-slate-700 focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)]"
        >
          <option value="all">Tất cả lớp</option>
          {classList.map((c) => (
            <option key={c.id} value={c.classId}>
              {c.classId} - {c.className}
            </option>
          ))}
        </select>

        {/* Filter Gender */}
        <select
          value={filterGender}
          onChange={(e) => {
            setFilterGender(e.target.value);
            setPage(1);
          }}
          className="bg-white border border-slate-200 rounded-xl px-3 py-2 text-xs font-medium text-slate-700 focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)]"
        >
          <option value="all">Tất cả giới tính</option>
          <option value="Nam">Nam</option>
          <option value="Nữ">Nữ</option>
        </select>

        {/* Filter InClass */}
        <select
          value={filterInClass}
          onChange={(e) => {
            setFilterInClass(e.target.value);
            setPage(1);
          }}
          className="bg-white border border-slate-200 rounded-xl px-3 py-2 text-xs font-medium text-slate-700 focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)]"
        >
          <option value="all">Tất cả trạng thái</option>
          <option value="true">Đang trong lớp</option>
          <option value="false">Đã rời lớp</option>
        </select>

        {/* Warning Level Filter */}
        <select
          value={filterWarning}
          onChange={(e) => {
            setFilterWarning(e.target.value);
            setPage(1);
          }}
          className="bg-white border border-slate-200 rounded-xl px-3 py-2 text-xs font-semibold text-slate-700 focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)]"
        >
          <option value="all">Tất cả mức cảnh báo</option>
          <option value="red">🔴 Nguy cơ cao (Đỏ)</option>
          <option value="yellow">🟡 Cần lưu ý (Vàng)</option>
          <option value="green">🟢 Bình thường</option>
        </select>
      </FilterBar>

      {/* Students Data Table */}
      <DataTable
        columns={columns}
        data={students}
        rowKey={(st) => st.id}
        loading={loading}
        onRowClick={(st) => router.push(`/students/${st.id}`)}
        pagination={{
          currentPage: page,
          pageSize,
          total,
          onChange: (p) => setPage(p),
        }}
      />

      {/* Modal: Thêm sinh viên mới */}
      <Modal
        isOpen={showAddModal}
        onClose={() => setShowAddModal(false)}
        title="Thêm Sinh viên Mới"
        description="Nhập thông tin hồ sơ sinh viên vào hệ thống quản lý đào tạo"
        maxWidth="2xl"
      >
        <form onSubmit={handleCreateStudent} className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Mã sinh viên <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                required
                placeholder="2111234"
                value={formData.studentId}
                onChange={(e) => setFormData({ ...formData, studentId: e.target.value })}
                className="w-full bg-white border border-slate-200 rounded-xl px-3 py-2 text-xs font-medium text-slate-800 focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)] font-mono"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Ngày sinh <span className="text-red-500">*</span>
              </label>
              <input
                type="date"
                required
                value={formData.birthDate}
                onChange={(e) => setFormData({ ...formData, birthDate: e.target.value })}
                className="w-full bg-white border border-slate-200 rounded-xl px-3 py-2 text-xs font-medium text-slate-800 focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)]"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Họ và tên đệm <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                required
                placeholder="Nguyễn Văn"
                value={formData.firstName}
                onChange={(e) => setFormData({ ...formData, firstName: e.target.value })}
                className="w-full bg-white border border-slate-200 rounded-xl px-3 py-2 text-xs font-medium text-slate-800 focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)]"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Tên sinh viên <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                required
                placeholder="An"
                value={formData.lastName}
                onChange={(e) => setFormData({ ...formData, lastName: e.target.value })}
                className="w-full bg-white border border-slate-200 rounded-xl px-3 py-2 text-xs font-medium text-slate-800 focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)]"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Giới tính
              </label>
              <select
                value={formData.gender}
                onChange={(e) => setFormData({ ...formData, gender: e.target.value })}
                className="w-full bg-white border border-slate-200 rounded-xl px-3 py-2 text-xs font-medium text-slate-800 focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)]"
              >
                <option value="Nam">Nam</option>
                <option value="Nữ">Nữ</option>
              </select>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Lớp sinh viên
              </label>
              <select
                value={formData.classStudentId}
                onChange={(e) => setFormData({ ...formData, classStudentId: e.target.value })}
                className="w-full bg-white border border-slate-200 rounded-xl px-3 py-2 text-xs font-medium text-slate-800 focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)]"
              >
                <option value="">Chưa xếp lớp</option>
                {classList.map((c) => (
                  <option key={c.id} value={c.classId}>
                    {c.classId} - {c.className}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Chương trình đào tạo
              </label>
              <select
                value={formData.studyProgramId}
                onChange={(e) => setFormData({ ...formData, studyProgramId: e.target.value })}
                className="w-full bg-white border border-slate-200 rounded-xl px-3 py-2 text-xs font-medium text-slate-800 focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)]"
              >
                <option value="">Chọn CTĐT</option>
                {programList.map((p) => (
                  <option key={p.id} value={p.programCode}>
                    {p.programCode} - {p.programName}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Vai trò trong lớp
              </label>
              <select
                value={formData.classRoleId}
                onChange={(e) => setFormData({ ...formData, classRoleId: Number(e.target.value) })}
                className="w-full bg-white border border-slate-200 rounded-xl px-3 py-2 text-xs font-medium text-slate-800 focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)]"
              >
                <option value={0}>Thành viên lớp</option>
                <option value={1}>Lớp trưởng</option>
              </select>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Nơi sinh
              </label>
              <input
                type="text"
                placeholder="Lâm Đồng"
                value={formData.birthPlace}
                onChange={(e) => setFormData({ ...formData, birthPlace: e.target.value })}
                className="w-full bg-white border border-slate-200 rounded-xl px-3 py-2 text-xs font-medium text-slate-800 focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)]"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Hộ khẩu thường trú
              </label>
              <input
                type="text"
                placeholder="Đà Lạt, Lâm Đồng"
                value={formData.permanentResidence}
                onChange={(e) => setFormData({ ...formData, permanentResidence: e.target.value })}
                className="w-full bg-white border border-slate-200 rounded-xl px-3 py-2 text-xs font-medium text-slate-800 focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)]"
              />
            </div>
          </div>

          <div className="flex items-center gap-2 pt-2">
            <input
              type="checkbox"
              id="isInClassCheck"
              checked={formData.isInClass}
              onChange={(e) => setFormData({ ...formData, isInClass: e.target.checked })}
              className="rounded border-slate-300 text-[var(--color-primary)] focus:ring-[var(--color-primary)]"
            />
            <label htmlFor="isInClassCheck" className="text-xs font-medium text-slate-700 cursor-pointer">
              Đang học trong lớp (chưa thôi học / chuyển trường)
            </label>
          </div>

          <div className="flex items-center justify-end gap-2 pt-4 border-t border-slate-100">
            <button
              type="button"
              onClick={() => setShowAddModal(false)}
              className="px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100 rounded-xl transition-colors cursor-pointer"
            >
              Hủy
            </button>
            <button
              type="submit"
              disabled={formSubmitting}
              className="px-4 py-2 text-xs font-semibold text-white bg-[var(--color-primary)] hover:opacity-90 rounded-xl transition-opacity flex items-center gap-1.5 cursor-pointer"
            >
              {formSubmitting ? "Đang lưu..." : "Lưu sinh viên"}
            </button>
          </div>
        </form>
      </Modal>

      {/* Modal: Sửa sinh viên */}
      <Modal
        isOpen={showEditModal}
        onClose={() => setShowEditModal(false)}
        title={`Chỉnh sửa Sinh viên: ${formData.studentId}`}
        description="Cập nhật thông tin nhân thân và học vụ của sinh viên"
        maxWidth="2xl"
      >
        <form onSubmit={handleUpdateStudent} className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Họ và tên đệm
              </label>
              <input
                type="text"
                required
                value={formData.firstName}
                onChange={(e) => setFormData({ ...formData, firstName: e.target.value })}
                className="w-full bg-white border border-slate-200 rounded-xl px-3 py-2 text-xs font-medium text-slate-800 focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)]"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Tên sinh viên
              </label>
              <input
                type="text"
                required
                value={formData.lastName}
                onChange={(e) => setFormData({ ...formData, lastName: e.target.value })}
                className="w-full bg-white border border-slate-200 rounded-xl px-3 py-2 text-xs font-medium text-slate-800 focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)]"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Ngày sinh
              </label>
              <input
                type="date"
                required
                value={formData.birthDate}
                onChange={(e) => setFormData({ ...formData, birthDate: e.target.value })}
                className="w-full bg-white border border-slate-200 rounded-xl px-3 py-2 text-xs font-medium text-slate-800 focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)]"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Giới tính
              </label>
              <select
                value={formData.gender}
                onChange={(e) => setFormData({ ...formData, gender: e.target.value })}
                className="w-full bg-white border border-slate-200 rounded-xl px-3 py-2 text-xs font-medium text-slate-800 focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)]"
              >
                <option value="Nam">Nam</option>
                <option value="Nữ">Nữ</option>
              </select>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Lớp sinh viên
              </label>
              <select
                value={formData.classStudentId}
                onChange={(e) => setFormData({ ...formData, classStudentId: e.target.value })}
                className="w-full bg-white border border-slate-200 rounded-xl px-3 py-2 text-xs font-medium text-slate-800 focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)]"
              >
                <option value="">Chưa xếp lớp</option>
                {classList.map((c) => (
                  <option key={c.id} value={c.classId}>
                    {c.classId} - {c.className}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Vai trò trong lớp
              </label>
              <select
                value={formData.classRoleId}
                onChange={(e) => setFormData({ ...formData, classRoleId: Number(e.target.value) })}
                className="w-full bg-white border border-slate-200 rounded-xl px-3 py-2 text-xs font-medium text-slate-800 focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)]"
              >
                <option value={0}>Thành viên lớp</option>
                <option value={1}>Lớp trưởng</option>
              </select>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Nơi sinh
              </label>
              <input
                type="text"
                value={formData.birthPlace}
                onChange={(e) => setFormData({ ...formData, birthPlace: e.target.value })}
                className="w-full bg-white border border-slate-200 rounded-xl px-3 py-2 text-xs font-medium text-slate-800 focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)]"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Hộ khẩu thường trú
              </label>
              <input
                type="text"
                value={formData.permanentResidence}
                onChange={(e) => setFormData({ ...formData, permanentResidence: e.target.value })}
                className="w-full bg-white border border-slate-200 rounded-xl px-3 py-2 text-xs font-medium text-slate-800 focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)]"
              />
            </div>
          </div>

          <div className="flex items-center gap-2 pt-2">
            <input
              type="checkbox"
              id="editInClassCheck"
              checked={formData.isInClass}
              onChange={(e) => setFormData({ ...formData, isInClass: e.target.checked })}
              className="rounded border-slate-300 text-[var(--color-primary)] focus:ring-[var(--color-primary)]"
            />
            <label htmlFor="editInClassCheck" className="text-xs font-medium text-slate-700 cursor-pointer">
              Đang học trong lớp (chưa thôi học / chuyển trường)
            </label>
          </div>

          <div className="flex items-center justify-end gap-2 pt-4 border-t border-slate-100">
            <button
              type="button"
              onClick={() => setShowEditModal(false)}
              className="px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100 rounded-xl transition-colors cursor-pointer"
            >
              Hủy
            </button>
            <button
              type="submit"
              disabled={formSubmitting}
              className="px-4 py-2 text-xs font-semibold text-white bg-[var(--color-primary)] hover:opacity-90 rounded-xl transition-opacity flex items-center gap-1.5 cursor-pointer"
            >
              {formSubmitting ? "Đang lưu..." : "Cập nhật"}
            </button>
          </div>
        </form>
      </Modal>

      {/* Confirm Soft Delete Dialog */}
      <ConfirmDialog
        isOpen={Boolean(studentToDelete)}
        onClose={() => setStudentToDelete(null)}
        onConfirm={handleConfirmDelete}
        loading={deleteLoading}
        isDangerous
        title="Xác nhận xóa sinh viên"
        message={
          <>
            Bạn có chắc chắn muốn xóa sinh viên{" "}
            <strong className="font-bold text-slate-900">{studentToDelete?.fullName}</strong> (
            {studentToDelete?.studentCode}) không? Dữ liệu sinh viên sẽ được chuyển vào trạng thái lưu trữ mềm (Soft
            Delete).
          </>
        }
        confirmText="Xóa sinh viên"
      />

      {/* Modal: Import JSON */}
      <Modal
        isOpen={showImportModal}
        onClose={() => {
          setShowImportModal(false);
          setImportResult(null);
        }}
        title="Nhập Danh sách Sinh viên từ file JSON"
        description="Dán dữ liệu mảng JSON các đối tượng sinh viên theo định dạng chuẩn của trường"
        maxWidth="2xl"
      >
        <div className="space-y-4">
          <textarea
            rows={10}
            placeholder={`[
  {
    "studentId": "2111234",
    "firstName": "Nguyễn Văn",
    "lastName": "An",
    "birthDate": "2003-05-12",
    "gender": "Nam",
    "classStudentId": "CTK45A",
    "studyProgramId": "7480201"
  }
]`}
            value={importJson}
            onChange={(e) => setImportJson(e.target.value)}
            className="w-full bg-slate-50 border border-slate-200 rounded-xl p-3 text-xs font-mono text-slate-800 focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)]"
          />

          {importResult && (
            <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-xl text-xs text-emerald-800">
              Đã xử lý xong: Thành công{" "}
              <strong>{importResult.imported}</strong> / {importResult.total} bản ghi.
            </div>
          )}

          <div className="flex items-center justify-end gap-2">
            <button
              type="button"
              onClick={() => setShowImportModal(false)}
              className="px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100 rounded-xl transition-colors cursor-pointer"
            >
              Đóng
            </button>
            <button
              type="button"
              disabled={importLoading || !importJson.trim()}
              onClick={handleImport}
              className="px-4 py-2 text-xs font-semibold text-white bg-[var(--color-primary)] hover:opacity-90 rounded-xl transition-opacity flex items-center gap-1.5 cursor-pointer"
            >
              {importLoading ? "Đang import..." : "Bắt đầu Import"}
            </button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
