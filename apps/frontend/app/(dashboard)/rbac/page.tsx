"use client";

import { useState, useEffect, useMemo } from "react";
import { apiFetch } from "@/lib/api-client";
import Tabs from "@/components/ui/Tabs";
import FilterBar from "@/components/ui/FilterBar";
import Modal from "@/components/ui/Modal";
import ConfirmDialog from "@/components/ui/ConfirmDialog";

type RbacTab = "users" | "roles" | "advisors";

export default function RbacPage() {
  const [activeTab, setActiveTab] = useState<RbacTab>("users");
  const [loading, setLoading] = useState(true);

  // Data collections
  const [users, setUsers] = useState<ApiData[]>([]);
  const [roles, setRoles] = useState<ApiData[]>([]);
  const [permissions, setPermissions] = useState<ApiData[]>([]);
  const [advisors, setAdvisors] = useState<ApiData[]>([]);
  const [classes, setClasses] = useState<ApiData[]>([]);
  const [years, setYears] = useState<ApiData[]>([]);

  // Search & filter in tabs
  const [userSearch, setUserSearch] = useState("");
  const [permissionSearch, setPermissionSearch] = useState("");
  const [permissionFilterStatus, setPermissionFilterStatus] = useState<"all" | "selected" | "unselected">("all");

  // Accordion state for Role Permissions
  const [expandedGroups, setExpandedGroups] = useState<Record<string, boolean>>({});

  // Modals state: Users
  const [showAddUserModal, setShowAddUserModal] = useState(false);
  const [userForm, setUserForm] = useState({
    username: "",
    fullName: "",
    email: "",
    password: "",
    roleCodes: ["faculty_board"],
  });
  const [showEditUserModal, setShowEditUserModal] = useState(false);
  const [editingUser, setEditingUser] = useState<ApiData | null>(null);
  const [editUserForm, setEditUserForm] = useState({
    fullName: "",
    email: "",
    isActive: true,
    password: "",
    roleCodes: [] as string[],
  });

  // Modals state: Roles & Permissions
  const [showRolePermissionsModal, setShowRolePermissionsModal] = useState(false);
  const [editingRole, setEditingRole] = useState<ApiData | null>(null);
  const [selectedPermissions, setSelectedPermissions] = useState<string[]>([]);

  // Modals state: Advisor Assignment
  const [showAssignModal, setShowAssignModal] = useState(false);
  const [assignForm, setAssignForm] = useState({ userId: "", classId: "", academicYearId: "", academicTermId: "" });
  const [revokeTarget, setRevokeTarget] = useState<ApiData | null>(null);
  const [actionLoading, setActionLoading] = useState(false);

  // Load all RBAC data
  const loadData = async () => {
    try {
      setLoading(true);
      const [uRes, rRes, pRes, aRes, clRes, yRes] = await Promise.all([
        apiFetch("/api/v1/rbac/users"),
        apiFetch("/api/v1/rbac/roles"),
        apiFetch("/api/v1/rbac/permissions"),
        apiFetch("/api/v1/rbac/advisors"),
        apiFetch("/api/v1/classes"),
        apiFetch("/api/v1/academic-years"),
      ]);

      if (uRes.ok) {
        const uJson = await uRes.json();
        setUsers(Array.isArray(uJson.items) ? uJson.items : Array.isArray(uJson) ? uJson : []);
      }
      if (rRes.ok) {
        const rJson = await rRes.json();
        setRoles(Array.isArray(rJson.items) ? rJson.items : Array.isArray(rJson) ? rJson : []);
      }
      if (pRes.ok) {
        const pJson = await pRes.json();
        setPermissions(Array.isArray(pJson.items) ? pJson.items : Array.isArray(pJson) ? pJson : []);
      }
      if (aRes.ok) {
        const aJson = await aRes.json();
        setAdvisors(Array.isArray(aJson.items) ? aJson.items : Array.isArray(aJson) ? aJson : []);
      }
      if (clRes.ok) {
        const clJson = await clRes.json();
        setClasses(Array.isArray(clJson.items) ? clJson.items : Array.isArray(clJson) ? clJson : []);
      }
      if (yRes.ok) {
        const yJson = await yRes.json();
        setYears(Array.isArray(yJson.items) ? yJson.items : Array.isArray(yJson) ? yJson : []);
      }
    } catch (err) {
      console.error("RBAC load error:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    const timeout = window.setTimeout(() => void loadData(), 0);
    return () => window.clearTimeout(timeout);
  }, []);

  // Handle Create User
  const handleCreateUser = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!userForm.username.trim() || !userForm.fullName.trim() || !userForm.password.trim()) {
      alert("Vui lòng nhập đầy đủ thông tin bắt buộc!");
      return;
    }

    try {
      setActionLoading(true);
      const res = await apiFetch("/api/v1/rbac/users", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(userForm),
      });

      if (res.ok) {
        setShowAddUserModal(false);
        setUserForm({ username: "", fullName: "", email: "", password: "", roleCodes: ["faculty_board"] });
        await loadData();
        alert("Đã tạo người dùng mới thành công!");
      } else {
        const err = await res.json();
        alert(err.error?.message || "Lỗi khi tạo người dùng");
      }
    } finally {
      setActionLoading(false);
    }
  };

  // Handle Update User
  const handleUpdateUser = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingUser) return;
    if (!editUserForm.fullName.trim()) {
      alert("Họ và tên không được để trống!");
      return;
    }

    try {
      setActionLoading(true);
      const payload: ApiData = {
        fullName: editUserForm.fullName.trim(),
        email: editUserForm.email.trim(),
        isActive: editUserForm.isActive,
        roleCodes: editUserForm.roleCodes,
      };
      if (editUserForm.password.trim()) {
        payload.password = editUserForm.password.trim();
      }

      const res = await apiFetch(`/api/v1/rbac/users/${editingUser.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (res.ok) {
        setShowEditUserModal(false);
        setEditingUser(null);
        await loadData();
        alert("Đã cập nhật thông tin người dùng thành công!");
      } else {
        const err = await res.json();
        alert(err.error?.message || "Lỗi khi cập nhật người dùng");
      }
    } catch (err) {
      console.error(err);
      alert("Lỗi kết nối máy chủ");
    } finally {
      setActionLoading(false);
    }
  };

  // Open Edit Role Permissions Modal
  const handleOpenRolePermissions = async (role: ApiData) => {
    setEditingRole(role);
    setPermissionSearch("");
    setPermissionFilterStatus("all");
    try {
      const res = await apiFetch(`/api/v1/rbac/roles/${role.id}/permissions`);
      if (res.ok) {
        const json = await res.json();
        const codes = (json.items || []).map((p: ApiData) => p.code || p.sPermissionCode);
        setSelectedPermissions(codes);
      }
    } catch {
      setSelectedPermissions([]);
    }

    // Default expand all groups
    const initialExpanded: Record<string, boolean> = {};
    permissions.forEach((p) => {
      const resKey = p.resource || p.sResource || "other";
      initialExpanded[resKey] = true;
    });
    setExpandedGroups(initialExpanded);

    setShowRolePermissionsModal(true);
  };

  // Save Role Permissions
  const handleSaveRolePermissions = async () => {
    if (!editingRole) return;
    try {
      setActionLoading(true);
      const res = await apiFetch(`/api/v1/rbac/roles/${editingRole.id}/permissions`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ permissionCodes: selectedPermissions }),
      });

      if (res.ok) {
        setShowRolePermissionsModal(false);
        await loadData();
        alert("Đã cập nhật danh sách quyền cho vai trò!");
      } else {
        alert("Lỗi khi lưu phân quyền");
      }
    } finally {
      setActionLoading(false);
    }
  };

  // Handle Create Advisor Assignment
  const handleCreateAssignment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!assignForm.userId || !assignForm.classId || !assignForm.academicTermId) {
      alert("Vui lòng chọn đầy đủ Cố vấn, Lớp và Học kỳ!");
      return;
    }

    try {
      setActionLoading(true);
      const res = await apiFetch("/api/v1/rbac/advisors", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(assignForm),
      });

      if (res.ok) {
        setShowAssignModal(false);
        await loadData();
        alert("Đã phân công Cố vấn học tập thành công!");
      } else {
        const err = await res.json();
        alert(err.error?.message || "Lỗi khi phân công");
      }
    } finally {
      setActionLoading(false);
    }
  };

  // Handle Revoke Advisor Assignment
  const handleConfirmRevoke = async () => {
    if (!revokeTarget) return;
    try {
      setActionLoading(true);
      const res = await apiFetch(`/api/v1/rbac/advisors/${revokeTarget.id}`, {
        method: "DELETE",
      });
      if (res.ok) {
        setRevokeTarget(null);
        await loadData();
        alert("Đã thu hồi phân công cố vấn!");
      }
    } finally {
      setActionLoading(false);
    }
  };

  // Resource Metadata & Grouping (aligning with SWE system)
  const resourceMetadata: Record<
    string,
    { label: string; icon: string; description: string; color: string }
  > = {
    student: {
      label: "Hồ sơ Sinh viên",
      icon: "M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z",
      description: "Xem, thêm mới, sửa hồ sơ, lý lịch trích ngang, trạng thái học tập",
      color: "text-blue-600 bg-blue-50 border-blue-200",
    },
    grade: {
      label: "Điểm & Bảng điểm",
      icon: "M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z",
      description: "Quản lý bảng điểm học phần, GPA, xếp loại học lực, nợ tín chỉ",
      color: "text-emerald-600 bg-emerald-50 border-emerald-200",
    },
    decision: {
      label: "Quyết định Học vụ",
      icon: "M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z",
      description: "Ban hành, tra cứu quyết định khen thưởng, kỷ luật, buộc thôi học",
      color: "text-amber-600 bg-amber-50 border-amber-200",
    },
    fee_policy: {
      label: "Chính sách Học phí",
      icon: "M17 9V7a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2m2 4h10a2 2 0 002-2v-6a2 2 0 00-2-2H9a2 2 0 00-2 2v6a2 2 0 002 2zm7-5a2 2 0 11-4 0 2 2 0 014 0z",
      description: "Gán diện miễn giảm, gia hạn nộp học phí, quản lý danh mục đối tượng",
      color: "text-purple-600 bg-purple-50 border-purple-200",
    },
    class: {
      label: "Danh mục Lớp học",
      icon: "M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4",
      description: "Quản trị danh sách lớp sinh hoạt, khóa tuyển sinh, sĩ số",
      color: "text-cyan-600 bg-cyan-50 border-cyan-200",
    },
    academic_term: {
      label: "Năm học & Học kỳ",
      icon: "M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z",
      description: "Cấu hình năm học, học kỳ chính/hè, mốc thời gian học vụ",
      color: "text-indigo-600 bg-indigo-50 border-indigo-200",
    },
    progress: {
      label: "Tiến độ Đào tạo & CTĐT",
      icon: "M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4",
      description: "Khung chương trình, kế hoạch mở môn, đánh giá hoàn thành CTĐT",
      color: "text-teal-600 bg-teal-50 border-teal-200",
    },
    academic_warning: {
      label: "Cảnh báo Học tập",
      icon: "M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z",
      description: "Chạy đợt sàng lọc cảnh báo, cấu hình mức độ vi phạm, xuất danh sách",
      color: "text-rose-600 bg-rose-50 border-rose-200",
    },
    user: {
      label: "Quản trị Tài khoản",
      icon: "M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z",
      description: "Tạo mới tài khoản, kích hoạt, khóa người dùng, đổi mật khẩu",
      color: "text-violet-600 bg-violet-50 border-violet-200",
    },
    role: {
      label: "Quản trị Vai trò (RBAC)",
      icon: "M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z",
      description: "Cấu hình vai trò, ma trận quyền hạt nhân, phân định Data Scope",
      color: "text-slate-700 bg-slate-100 border-slate-300",
    },
  };

  const groupedPermissions = useMemo(() => {
    return permissions.reduce((acc: Record<string, ApiData[]>, p) => {
      const res = p.resource || p.sResource || "other";
      if (!acc[res]) acc[res] = [];
      acc[res].push(p);
      return acc;
    }, {});
  }, [permissions]);

  const toggleGroupExpand = (resKey: string) => {
    setExpandedGroups((prev) => ({ ...prev, [resKey]: !prev[resKey] }));
  };

  const expandAllGroups = () => {
    const allExp: Record<string, boolean> = {};
    Object.keys(groupedPermissions).forEach((k) => (allExp[k] = true));
    setExpandedGroups(allExp);
  };

  const collapseAllGroups = () => {
    setExpandedGroups({});
  };

  const termsForAssignYear = years.find((y) => y.id === assignForm.academicYearId)?.terms || [];

  return (
    <div className="p-6 space-y-6 max-w-7xl mx-auto">
      {/* Header & Title */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2.5 flex-wrap mb-1">
            <h1
              className="text-2xl sm:text-3xl font-bold text-slate-900 tracking-tight"
              style={{ fontFamily: "Be Vietnam Pro, sans-serif" }}
            >
              Quản trị Phân quyền & Người dùng (RBAC)
            </h1>
            <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
              Role-Based Access Control v2
            </span>
          </div>
          <p className="text-xs sm:text-sm text-slate-500 max-w-3xl">
            Quản lý tài khoản, cấu hình vai trò, ma trận quyền hạn hạt nhân (granular permissions) và kiểm soát phạm vi dữ liệu (Data Scope) theo đúng quy chuẩn SWE.
          </p>
        </div>

        {/* Dynamic Action Buttons */}
        <div className="flex items-center gap-2 shrink-0">
          {activeTab === "users" && (
            <button
              type="button"
              onClick={() => setShowAddUserModal(true)}
              className="px-4 py-2.5 rounded-xl bg-[var(--color-primary)] hover:opacity-90 text-white text-xs font-semibold shadow-xs flex items-center gap-1.5 cursor-pointer transition-all hover:shadow-md"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                <line x1="12" y1="5" x2="12" y2="19" />
                <line x1="5" y1="12" x2="19" y2="12" />
              </svg>
              <span>Thêm người dùng</span>
            </button>
          )}

          {activeTab === "advisors" && (
            <button
              type="button"
              onClick={() => {
                setAssignForm({
                  userId: users[0]?.id || "",
                  classId: classes[0]?.id || "",
                  academicYearId: years[0]?.id || "",
                  academicTermId: "",
                });
                setShowAssignModal(true);
              }}
              className="px-4 py-2.5 rounded-xl bg-[var(--color-primary)] hover:opacity-90 text-white text-xs font-semibold shadow-xs flex items-center gap-1.5 cursor-pointer transition-all hover:shadow-md"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                <line x1="12" y1="5" x2="12" y2="19" />
                <line x1="5" y1="12" x2="19" y2="12" />
              </svg>
              <span>Tạo phân công CVHT</span>
            </button>
          )}
        </div>
      </div>

      {/* KPI Overview Banner Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3.5">
        <div className="p-3.5 bg-white border border-slate-200/90 rounded-2xl shadow-xs">
          <div className="text-[11px] font-medium text-slate-500 uppercase tracking-wider">Tài khoản người dùng</div>
          <div className="text-2xl font-bold text-slate-900 mt-1" style={{ fontFamily: "Be Vietnam Pro, sans-serif" }}>
            {users.length}
          </div>
          <div className="text-[10px] text-emerald-600 mt-0.5 flex items-center gap-1">
            <span>●</span> {users.filter((u) => u.isActive !== false).length} đang hoạt động
          </div>
        </div>

        <div className="p-3.5 bg-white border border-slate-200/90 rounded-2xl shadow-xs">
          <div className="text-[11px] font-medium text-slate-500 uppercase tracking-wider">Vai trò hệ thống</div>
          <div className="text-2xl font-bold text-slate-900 mt-1" style={{ fontFamily: "Be Vietnam Pro, sans-serif" }}>
            {roles.length}
          </div>
          <div className="text-[10px] text-slate-500 mt-0.5">Faculty, Advisor, Admin...</div>
        </div>

        <div className="p-3.5 bg-white border border-slate-200/90 rounded-2xl shadow-xs">
          <div className="text-[11px] font-medium text-slate-500 uppercase tracking-wider">Cố vấn học tập trực</div>
          <div className="text-2xl font-bold text-slate-900 mt-1" style={{ fontFamily: "Be Vietnam Pro, sans-serif" }}>
            {advisors.length}
          </div>
          <div className="text-[10px] text-blue-600 mt-0.5">Phân công theo Lớp & Học kỳ</div>
        </div>

        <div className="p-3.5 bg-white border border-slate-200/90 rounded-2xl shadow-xs">
          <div className="text-[11px] font-medium text-slate-500 uppercase tracking-wider">Quyền hạn hạt nhân</div>
          <div className="text-2xl font-bold text-slate-900 mt-1" style={{ fontFamily: "Be Vietnam Pro, sans-serif" }}>
            {permissions.length}
          </div>
          <div className="text-[10px] text-purple-600 mt-0.5">Gom theo {Object.keys(groupedPermissions).length} nhóm tài nguyên</div>
        </div>
      </div>

      {/* Tabs */}
      <Tabs
        tabs={[
          { id: "users", label: "Tài khoản Người dùng", badge: users.length },
          { id: "roles", label: "Vai trò & Quyền hạn", badge: roles.length },
          { id: "advisors", label: "Phân công Cố vấn học tập", badge: advisors.length },
        ]}
        activeTab={activeTab}
        onChange={(id) => setActiveTab(id as ApiData)}
      />

      {loading ? (
        <div className="py-20 text-center text-slate-400 text-xs flex flex-col items-center justify-center gap-3">
          <div className="w-8 h-8 border-2 border-[var(--color-primary)] border-t-transparent rounded-full animate-spin" />
          <span>Đang tải cấu hình phân quyền và dữ liệu hệ thống...</span>
        </div>
      ) : (
        <>
          {/* TAB 1: USERS */}
          {activeTab === "users" && (
            <div className="space-y-4">
              <FilterBar
                onReset={() => setUserSearch("")}
                actions={
                  <span className="text-xs text-slate-500 font-medium">
                    Tổng cộng: <strong className="font-semibold text-slate-900">{users.length}</strong> tài khoản
                  </span>
                }
              >
                <div className="relative min-w-[280px]">
                  <input
                    type="text"
                    placeholder="Tìm kiếm tài khoản, tên hoặc email..."
                    value={userSearch}
                    onChange={(e) => setUserSearch(e.target.value)}
                    className="w-full bg-white border border-slate-200 rounded-xl pl-8 pr-3 py-2 text-xs font-medium text-slate-800 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)]"
                  />
                  <svg
                    className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                  </svg>
                </div>
              </FilterBar>

              <div className="bg-white border border-slate-200/90 rounded-2xl shadow-xs overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs">
                    <thead>
                      <tr className="bg-slate-50/80 border-b border-slate-200 text-slate-500 font-semibold uppercase text-[11px]">
                        <th className="py-3.5 px-4">Tên đăng nhập</th>
                        <th className="py-3.5 px-4">Họ và tên</th>
                        <th className="py-3.5 px-4">Email</th>
                        <th className="py-3.5 px-4">Vai trò hệ thống</th>
                        <th className="py-3.5 px-4">Trạng thái</th>
                        <th className="py-3.5 px-4 text-right">Thao tác</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {users
                        .filter((u) =>
                          !userSearch ||
                          (u.username || "").toLowerCase().includes(userSearch.toLowerCase()) ||
                          (u.fullName || "").toLowerCase().includes(userSearch.toLowerCase()) ||
                          (u.email || "").toLowerCase().includes(userSearch.toLowerCase())
                        )
                        .map((u) => {
                          const assignedRoles = (u.roleCodes || (u.roles ? u.roles.map((r: ApiData) => r.code) : ["faculty_board"]));
                          return (
                            <tr key={u.id} className="hover:bg-slate-50/70 transition-colors">
                              <td className="py-3.5 px-4 font-mono font-bold text-slate-900">
                                <div className="flex items-center gap-2">
                                  <div className="w-7 h-7 rounded-full bg-[var(--color-primary-light)] text-[var(--color-primary)] font-bold flex items-center justify-center text-xs shrink-0">
                                    {(u.fullName || u.username || "U")[0].toUpperCase()}
                                  </div>
                                  <span>{u.username}</span>
                                </div>
                              </td>
                              <td className="py-3.5 px-4 font-semibold text-slate-800">{u.fullName}</td>
                              <td className="py-3.5 px-4 text-slate-600">{u.email || "—"}</td>
                              <td className="py-3.5 px-4">
                                <div className="flex items-center gap-1.5 flex-wrap">
                                  {assignedRoles.map((code: string) => (
                                    <span
                                      key={code}
                                      className="px-2.5 py-0.5 rounded-lg text-[10px] font-bold bg-blue-50 text-blue-700 border border-blue-200/80 font-mono"
                                    >
                                      {code}
                                    </span>
                                  ))}
                                </div>
                              </td>
                              <td className="py-3.5 px-4">
                                <span
                                  className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-semibold ${
                                    u.isActive !== false
                                      ? "bg-emerald-50 text-emerald-700 border border-emerald-200"
                                      : "bg-slate-100 text-slate-500 border border-slate-200"
                                  }`}
                                >
                                  <span
                                    className={`w-1.5 h-1.5 rounded-full ${
                                      u.isActive !== false ? "bg-emerald-500" : "bg-slate-400"
                                    }`}
                                  />
                                  {u.isActive !== false ? "Đang hoạt động" : "Đã khóa"}
                                </span>
                              </td>
                              <td className="py-3.5 px-4 text-right">
                                <button
                                  type="button"
                                  onClick={() => {
                                    setEditingUser(u);
                                    setEditUserForm({
                                      fullName: u.fullName,
                                      email: u.email || "",
                                      isActive: u.isActive !== false,
                                      password: "",
                                      roleCodes: assignedRoles,
                                    });
                                    setShowEditUserModal(true);
                                  }}
                                  className="px-3 py-1 text-xs font-semibold text-slate-700 hover:bg-slate-100 border border-slate-200 rounded-lg transition-colors cursor-pointer"
                                >
                                  Sửa tài khoản
                                </button>
                              </td>
                            </tr>
                          );
                        })}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}

          {/* TAB 2: ROLES & DATA SCOPES */}
          {activeTab === "roles" && (
            <div className="space-y-4">
              {/* Data Scope Guide Banner */}
              <div className="bg-gradient-to-r from-slate-900 to-slate-800 text-white rounded-2xl p-4 shadow-xs flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-bold uppercase tracking-wider text-emerald-400">
                      Bảo mật đa tầng
                    </span>
                    <span className="text-[10px] px-2 py-0.5 rounded bg-slate-800 text-slate-300 font-mono">
                      Data Scope Hierarchy
                    </span>
                  </div>
                  <h3 className="text-sm font-semibold" style={{ fontFamily: "Be Vietnam Pro, sans-serif" }}>
                    Cơ chế kiểm soát phạm vi truy cập dữ liệu
                  </h3>
                  <p className="text-xs text-slate-300 max-w-2xl leading-relaxed">
                    Hệ thống tự động áp dụng chính sách dữ liệu: <strong>faculty</strong> (xem dữ liệu toàn khoa), <strong>advisor</strong> (giới hạn theo lớp phân công qua bảng <code>class_advisor_assignments</code>), hoặc <strong>all</strong> (toàn trường).
                  </p>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <div className="px-3 py-2 rounded-xl bg-white/10 backdrop-blur-sm border border-white/10 text-center">
                    <div className="text-[10px] text-slate-400 uppercase">Toàn khoa</div>
                    <div className="text-xs font-mono font-bold text-emerald-300">faculty</div>
                  </div>
                  <div className="px-3 py-2 rounded-xl bg-white/10 backdrop-blur-sm border border-white/10 text-center">
                    <div className="text-[10px] text-slate-400 uppercase">Theo lớp</div>
                    <div className="text-xs font-mono font-bold text-amber-300">advisor</div>
                  </div>
                  <div className="px-3 py-2 rounded-xl bg-white/10 backdrop-blur-sm border border-white/10 text-center">
                    <div className="text-[10px] text-slate-400 uppercase">Toàn quyền</div>
                    <div className="text-xs font-mono font-bold text-cyan-300">all</div>
                  </div>
                </div>
              </div>

              <div className="bg-white border border-slate-200/90 rounded-2xl shadow-xs overflow-hidden">
                <div className="p-4 border-b border-slate-100 flex items-center justify-between">
                  <div>
                    <h3 className="text-sm font-bold text-slate-900" style={{ fontFamily: "Be Vietnam Pro, sans-serif" }}>
                      Danh sách Vai trò Hệ thống ({roles.length})
                    </h3>
                    <p className="text-xs text-slate-500">Phạm vi dữ liệu và cấu hình quyền hạn hạt nhân cho từng vai trò</p>
                  </div>
                </div>

                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs">
                    <thead>
                      <tr className="bg-slate-50/80 border-b border-slate-200 text-slate-500 font-semibold uppercase text-[11px]">
                        <th className="py-3.5 px-4">Mã vai trò</th>
                        <th className="py-3.5 px-4">Tên vai trò</th>
                        <th className="py-3.5 px-4">Phạm vi dữ liệu (Data Scope)</th>
                        <th className="py-3.5 px-4">Số quyền đã cấp</th>
                        <th className="py-3.5 px-4">Trạng thái</th>
                        <th className="py-3.5 px-4 text-right">Cấu hình Quyền</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {roles.map((r) => {
                        const permCount = Array.isArray(r.permissions) ? r.permissions.length : 0;
                        return (
                          <tr key={r.id} className="hover:bg-slate-50/70 transition-colors">
                            <td className="py-3.5 px-4 font-mono font-bold text-slate-900">{r.code}</td>
                            <td className="py-3.5 px-4 font-semibold text-slate-800">{r.name}</td>
                            <td className="py-3.5 px-4">
                              <span
                                className={`px-2.5 py-1 rounded-lg font-mono font-semibold text-[11px] border ${
                                  r.dataScope === "all"
                                    ? "bg-cyan-50 text-cyan-700 border-cyan-200"
                                    : r.dataScope === "advisor"
                                    ? "bg-amber-50 text-amber-700 border-amber-200"
                                    : "bg-slate-100 text-slate-700 border-slate-200"
                                }`}
                              >
                                {r.dataScope || "faculty"}
                              </span>
                            </td>
                            <td className="py-3.5 px-4">
                              <span className="font-semibold text-slate-900">{permCount}</span>
                              <span className="text-slate-400">/{permissions.length} quyền</span>
                            </td>
                            <td className="py-3.5 px-4">
                              <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-emerald-50 text-emerald-800 border border-emerald-200">
                                Hoạt động
                              </span>
                            </td>
                            <td className="py-3.5 px-4 text-right">
                              <button
                                type="button"
                                onClick={() => handleOpenRolePermissions(r)}
                                className="px-3.5 py-1.5 text-xs font-semibold text-[var(--color-primary)] hover:bg-[var(--color-primary-light)] border border-[var(--color-primary)]/40 rounded-xl transition-all cursor-pointer shadow-2xs hover:shadow-xs"
                              >
                                Ma trận Phân quyền →
                              </button>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}

          {/* TAB 3: ADVISORS ASSIGNMENT */}
          {activeTab === "advisors" && (
            <div className="bg-white border border-slate-200/90 rounded-2xl shadow-xs overflow-hidden">
              <div className="p-4 border-b border-slate-100 flex items-center justify-between">
                <div>
                  <h3 className="text-sm font-bold text-slate-900" style={{ fontFamily: "Be Vietnam Pro, sans-serif" }}>
                    Phân công Giảng viên Cố vấn học tập / Chủ nhiệm ({advisors.length})
                  </h3>
                  <p className="text-xs text-slate-500">Giảng viên chỉ có quyền truy cập hồ sơ và điểm số của lớp được phân công</p>
                </div>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead>
                    <tr className="bg-slate-50/80 border-b border-slate-200 text-slate-500 font-semibold uppercase text-[11px]">
                      <th className="py-3.5 px-4">Giảng viên Cố vấn</th>
                      <th className="py-3.5 px-4">Lớp phụ trách</th>
                      <th className="py-3.5 px-4">Học kỳ / Năm học</th>
                      <th className="py-3.5 px-4">Trạng thái</th>
                      <th className="py-3.5 px-4 text-right">Thao tác</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {advisors.length === 0 ? (
                      <tr>
                        <td colSpan={5} className="py-12 text-center text-slate-400">
                          Chưa có phân công cố vấn nào trong hệ thống.
                        </td>
                      </tr>
                    ) : (
                      advisors.map((adv) => (
                        <tr key={adv.id} className="hover:bg-slate-50/70 transition-colors">
                          <td className="py-3.5 px-4 font-semibold text-slate-900">
                            <div>{adv.userFullName || adv.advisorName || adv.user?.fullName || "Giảng viên"}</div>
                            <div className="text-[10px] text-slate-400 font-mono">{adv.userName || adv.user?.username}</div>
                          </td>
                          <td className="py-3.5 px-4 font-mono font-bold text-slate-800">
                            {adv.classCode || adv.classId || adv.class?.classId || "—"}
                          </td>
                          <td className="py-3.5 px-4 text-slate-600">
                            {adv.termCode || "—"} ({adv.academicYear || "Chưa xác định"})
                          </td>
                          <td className="py-3.5 px-4">
                            <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-emerald-50 text-emerald-800 border border-emerald-200">
                              Đang hiệu lực
                            </span>
                          </td>
                          <td className="py-3.5 px-4 text-right">
                            <button
                              type="button"
                              onClick={() => setRevokeTarget(adv)}
                              className="px-2.5 py-1 text-xs font-semibold text-red-600 hover:bg-red-50 border border-red-200 rounded-lg transition-colors cursor-pointer"
                            >
                              Thu hồi
                            </button>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </>
      )}

      {/* Modal: Thêm Người dùng */}
      <Modal isOpen={showAddUserModal} onClose={() => setShowAddUserModal(false)} title="Tạo Người dùng Mới" maxWidth="md">
        <form onSubmit={handleCreateUser} className="space-y-4">
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">Tên đăng nhập <span className="text-red-500">*</span></label>
            <input
              type="text"
              required
              placeholder="advisor_hoa"
              value={userForm.username}
              onChange={(e) => setUserForm({ ...userForm, username: e.target.value })}
              className="w-full bg-white border border-slate-200 rounded-xl px-3 py-2 text-xs font-mono font-bold text-slate-800 focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)]"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">Họ và tên <span className="text-red-500">*</span></label>
            <input
              type="text"
              required
              placeholder="ThS. Nguyễn Thị Hoa"
              value={userForm.fullName}
              onChange={(e) => setUserForm({ ...userForm, fullName: e.target.value })}
              className="w-full bg-white border border-slate-200 rounded-xl px-3 py-2 text-xs font-medium text-slate-800 focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)]"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">Email liên hệ</label>
            <input
              type="email"
              placeholder="hoa.nt@dlu.edu.vn"
              value={userForm.email}
              onChange={(e) => setUserForm({ ...userForm, email: e.target.value })}
              className="w-full bg-white border border-slate-200 rounded-xl px-3 py-2 text-xs font-medium text-slate-800 focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)]"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">Mật khẩu khởi tạo <span className="text-red-500">*</span></label>
            <input
              type="password"
              required
              minLength={6}
              placeholder="••••••••"
              value={userForm.password}
              onChange={(e) => setUserForm({ ...userForm, password: e.target.value })}
              className="w-full bg-white border border-slate-200 rounded-xl px-3 py-2 text-xs font-mono text-slate-800 focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)]"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">Gán vai trò ban đầu</label>
            <div className="grid grid-cols-2 gap-2 mt-1.5">
              {roles.map((r) => {
                const checked = userForm.roleCodes.includes(r.code);
                return (
                  <label
                    key={r.code}
                    className={`flex items-center gap-2 p-2 rounded-xl border text-xs cursor-pointer transition-colors ${
                      checked
                        ? "bg-emerald-50/60 border-emerald-300 text-emerald-900 font-semibold"
                        : "bg-slate-50 border-slate-200 text-slate-700 hover:bg-slate-100"
                    }`}
                  >
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={(e) => {
                        if (e.target.checked) {
                          setUserForm({ ...userForm, roleCodes: [...userForm.roleCodes, r.code] });
                        } else {
                          setUserForm({ ...userForm, roleCodes: userForm.roleCodes.filter((c) => c !== r.code) });
                        }
                      }}
                      className="rounded border-slate-300 text-[var(--color-primary)] focus:ring-[var(--color-primary)]"
                    />
                    <span>{r.name}</span>
                  </label>
                );
              })}
            </div>
          </div>

          <div className="flex items-center justify-end gap-2 pt-4 border-t border-slate-100">
            <button
              type="button"
              onClick={() => setShowAddUserModal(false)}
              className="px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100 rounded-xl cursor-pointer"
            >
              Hủy
            </button>
            <button
              type="submit"
              disabled={actionLoading}
              className="px-4 py-2 text-xs font-semibold text-white bg-[var(--color-primary)] hover:opacity-90 rounded-xl cursor-pointer shadow-xs"
            >
              {actionLoading ? "Đang tạo..." : "Tạo tài khoản"}
            </button>
          </div>
        </form>
      </Modal>

      {/* Modal: Chỉnh sửa Người dùng */}
      {editingUser && (
        <Modal
          isOpen={showEditUserModal}
          onClose={() => {
            setShowEditUserModal(false);
            setEditingUser(null);
          }}
          title={`Sửa Người dùng: ${editingUser.username}`}
          description="Cập nhật họ tên, email, đổi mật khẩu và phân bổ vai trò cho tài khoản"
          maxWidth="md"
        >
          <form onSubmit={handleUpdateUser} className="space-y-4">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Tên đăng nhập</label>
              <input
                type="text"
                disabled
                value={editingUser.username}
                className="w-full bg-slate-100 border border-slate-200 rounded-xl px-3 py-2 text-xs font-mono font-bold text-slate-500 cursor-not-allowed"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Họ và tên <span className="text-red-500">*</span></label>
              <input
                type="text"
                required
                value={editUserForm.fullName}
                onChange={(e) => setEditUserForm({ ...editUserForm, fullName: e.target.value })}
                className="w-full bg-white border border-slate-200 rounded-xl px-3 py-2 text-xs font-medium text-slate-800 focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)]"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Email liên hệ</label>
              <input
                type="email"
                value={editUserForm.email}
                onChange={(e) => setEditUserForm({ ...editUserForm, email: e.target.value })}
                className="w-full bg-white border border-slate-200 rounded-xl px-3 py-2 text-xs font-medium text-slate-800 focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)]"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Đổi mật khẩu mới (để trống nếu không đổi)
              </label>
              <input
                type="password"
                minLength={6}
                placeholder="Nhập mật khẩu mới..."
                value={editUserForm.password}
                onChange={(e) => setEditUserForm({ ...editUserForm, password: e.target.value })}
                className="w-full bg-white border border-slate-200 rounded-xl px-3 py-2 text-xs font-mono text-slate-800 focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)]"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Trạng thái tài khoản</label>
              <label className="flex items-center gap-2.5 p-2.5 rounded-xl border border-slate-200 bg-slate-50 cursor-pointer">
                <input
                  type="checkbox"
                  checked={editUserForm.isActive}
                  onChange={(e) => setEditUserForm({ ...editUserForm, isActive: e.target.checked })}
                  className="rounded border-slate-300 text-[var(--color-primary)] focus:ring-[var(--color-primary)]"
                />
                <div>
                  <span className="text-xs font-bold text-slate-800">Kích hoạt tài khoản</span>
                  <p className="text-[10px] text-slate-500">Tài khoản bị khóa sẽ không thể đăng nhập vào hệ thống</p>
                </div>
              </label>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Danh sách vai trò hệ thống</label>
              <div className="grid grid-cols-2 gap-2 mt-1">
                {roles.map((r) => {
                  const checked = editUserForm.roleCodes.includes(r.code);
                  return (
                    <label
                      key={r.code}
                      className={`flex items-center gap-2 p-2 rounded-xl border text-xs cursor-pointer transition-colors ${
                        checked
                          ? "bg-emerald-50/60 border-emerald-300 text-emerald-900 font-semibold"
                          : "bg-slate-50 border-slate-200 text-slate-700 hover:bg-slate-100"
                      }`}
                    >
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={(e) => {
                          if (e.target.checked) {
                            setEditUserForm({ ...editUserForm, roleCodes: [...editUserForm.roleCodes, r.code] });
                          } else {
                            setEditUserForm({
                              ...editUserForm,
                              roleCodes: editUserForm.roleCodes.filter((c) => c !== r.code),
                            });
                          }
                        }}
                        className="rounded border-slate-300 text-[var(--color-primary)] focus:ring-[var(--color-primary)]"
                      />
                      <span>{r.name}</span>
                    </label>
                  );
                })}
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 pt-4 border-t border-slate-100">
              <button
                type="button"
                onClick={() => {
                  setShowEditUserModal(false);
                  setEditingUser(null);
                }}
                className="px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100 rounded-xl cursor-pointer"
              >
                Hủy
              </button>
              <button
                type="submit"
                disabled={actionLoading}
                className="px-4 py-2 text-xs font-semibold text-white bg-[var(--color-primary)] hover:opacity-90 rounded-xl cursor-pointer shadow-xs"
              >
                {actionLoading ? "Đang lưu..." : "Lưu thay đổi"}
              </button>
            </div>
          </form>
        </Modal>
      )}

      {/* Modal: Chỉnh sửa Quyền Hạt nhân của Vai trò (Hierarchical Permissions Matrix with Accordion) */}
      {editingRole && (
        <Modal
          isOpen={showRolePermissionsModal}
          onClose={() => setShowRolePermissionsModal(false)}
          title={`Phân quyền Vai trò: ${editingRole.name} (${editingRole.code})`}
          description={`Phạm vi dữ liệu: ${editingRole.dataScope || "faculty"}. Lựa chọn quyền hạn hạt nhân theo từng nhóm tài nguyên`}
          maxWidth="4xl"
        >
          <div className="space-y-4">
            {/* Search, Filter Status and Global Actions */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-slate-50 p-3 rounded-2xl border border-slate-200/80">
              <div className="flex items-center gap-2 flex-1">
                <div className="relative flex-1">
                  <input
                    type="text"
                    placeholder="Tìm mã quyền hoặc tên quyền hạn..."
                    value={permissionSearch}
                    onChange={(e) => setPermissionSearch(e.target.value)}
                    className="w-full bg-white border border-slate-200 rounded-xl pl-8 pr-3 py-1.5 text-xs text-slate-800 focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)]"
                  />
                  <svg
                    className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                  </svg>
                </div>

                <select
                  value={permissionFilterStatus}
                  onChange={(e) => setPermissionFilterStatus(e.target.value as ApiData)}
                  className="bg-white border border-slate-200 rounded-xl px-2.5 py-1.5 text-xs font-semibold text-slate-700 focus:outline-none"
                >
                  <option value="all">Tất cả quyền</option>
                  <option value="selected">Đã chọn ({selectedPermissions.length})</option>
                  <option value="unselected">Chưa chọn ({permissions.length - selectedPermissions.length})</option>
                </select>
              </div>

              <div className="flex items-center gap-2 shrink-0">
                <button
                  type="button"
                  onClick={expandAllGroups}
                  className="px-2.5 py-1.5 text-[11px] font-semibold text-slate-600 bg-white hover:bg-slate-100 border border-slate-200 rounded-lg cursor-pointer"
                >
                  Mở tất cả
                </button>
                <button
                  type="button"
                  onClick={collapseAllGroups}
                  className="px-2.5 py-1.5 text-[11px] font-semibold text-slate-600 bg-white hover:bg-slate-100 border border-slate-200 rounded-lg cursor-pointer"
                >
                  Thu gọn
                </button>
                <button
                  type="button"
                  onClick={() => setSelectedPermissions(permissions.map((p) => p.code || p.sPermissionCode))}
                  className="px-2.5 py-1.5 text-[11px] font-semibold text-slate-700 bg-white hover:bg-slate-100 border border-slate-200 rounded-lg cursor-pointer"
                >
                  Chọn tất cả
                </button>
                <button
                  type="button"
                  onClick={() => setSelectedPermissions([])}
                  className="px-2.5 py-1.5 text-[11px] font-semibold text-red-600 bg-white hover:bg-red-50 border border-red-200 rounded-lg cursor-pointer"
                >
                  Bỏ chọn hết
                </button>
              </div>
            </div>

            {/* Accordion List by Resource */}
            <div className="max-h-[460px] overflow-y-auto space-y-3 pr-1 scrollbar-thin">
              {Object.entries(groupedPermissions).map(([resKey, permList]) => {
                const meta = resourceMetadata[resKey] || {
                  label: `Nhóm ${resKey}`,
                  icon: "M4 6h16M4 10h16M4 14h16M4 18h16",
                  description: "Các quyền hạn liên quan đến tài nguyên",
                  color: "text-slate-600 bg-slate-50 border-slate-200",
                };

                const groupCodes = permList.map((p: ApiData) => p.code || p.sPermissionCode);
                const selectedInGroup = groupCodes.filter((c: string) => selectedPermissions.includes(c));
                const isAllGroupSelected = groupCodes.length > 0 && selectedInGroup.length === groupCodes.length;
                const isExpanded = expandedGroups[resKey] ?? true;

                // Apply search and status filter
                const filtered = permList.filter((p: ApiData) => {
                  const code = p.code || p.sPermissionCode || "";
                  const name = p.name || p.sPermissionName || "";
                  const matchesSearch =
                    !permissionSearch ||
                    code.toLowerCase().includes(permissionSearch.toLowerCase()) ||
                    name.toLowerCase().includes(permissionSearch.toLowerCase());

                  if (!matchesSearch) return false;

                  const isChecked = selectedPermissions.includes(code);
                  if (permissionFilterStatus === "selected") return isChecked;
                  if (permissionFilterStatus === "unselected") return !isChecked;
                  return true;
                });

                if (filtered.length === 0 && permissionSearch) return null;

                return (
                  <div
                    key={resKey}
                    className={`border rounded-2xl overflow-hidden transition-all ${
                      isAllGroupSelected
                        ? "border-emerald-200 bg-emerald-50/20"
                        : "border-slate-200/90 bg-white"
                    }`}
                  >
                    {/* Group Header / Collapsible trigger */}
                    <div className="p-3 bg-slate-50/70 border-b border-slate-100 flex items-center justify-between gap-3">
                      <div
                        className="flex items-center gap-2.5 flex-1 cursor-pointer select-none"
                        onClick={() => toggleGroupExpand(resKey)}
                      >
                        <button
                          type="button"
                          className="w-6 h-6 rounded-lg bg-white border border-slate-200 flex items-center justify-center text-slate-500 hover:text-slate-800 transition-transform"
                        >
                          <svg
                            className={`w-3.5 h-3.5 transition-transform duration-200 ${isExpanded ? "rotate-90" : ""}`}
                            fill="none"
                            stroke="currentColor"
                            viewBox="0 0 24 24"
                          >
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M9 5l7 7-7 7" />
                          </svg>
                        </button>

                        <div className={`p-1.5 rounded-lg border shrink-0 ${meta.color}`}>
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d={meta.icon} />
                          </svg>
                        </div>

                        <div>
                          <div className="flex items-center gap-2">
                            <span className="text-xs font-bold text-slate-900">{meta.label}</span>
                            <span className="text-[10px] font-mono text-slate-400">({resKey})</span>
                          </div>
                          <p className="text-[10px] text-slate-500 hidden sm:block">{meta.description}</p>
                        </div>
                      </div>

                      {/* Group Action: Badge and Select/Deselect All */}
                      <div className="flex items-center gap-2 shrink-0">
                        <span
                          className={`px-2.5 py-0.5 rounded-full text-[11px] font-bold ${
                            isAllGroupSelected
                              ? "bg-emerald-100 text-emerald-800"
                              : selectedInGroup.length > 0
                              ? "bg-blue-100 text-blue-800"
                              : "bg-slate-100 text-slate-500"
                          }`}
                        >
                          {selectedInGroup.length}/{groupCodes.length} quyền
                        </span>

                        <button
                          type="button"
                          onClick={() => {
                            if (isAllGroupSelected) {
                              setSelectedPermissions(selectedPermissions.filter((c) => !groupCodes.includes(c)));
                            } else {
                              setSelectedPermissions([...new Set([...selectedPermissions, ...groupCodes])]);
                            }
                          }}
                          className={`px-2.5 py-1 text-[11px] font-semibold rounded-lg border transition-colors cursor-pointer ${
                            isAllGroupSelected
                              ? "bg-white text-slate-700 border-slate-200 hover:bg-slate-100"
                              : "bg-[var(--color-primary-light)] text-[var(--color-primary)] border-[var(--color-primary)]/30 hover:opacity-90"
                          }`}
                        >
                          {isAllGroupSelected ? "Bỏ chọn nhóm" : "Chọn cả nhóm"}
                        </button>
                      </div>
                    </div>

                    {/* Group Body: Permissions grid */}
                    {isExpanded && (
                      <div className="p-3">
                        {filtered.length === 0 ? (
                          <div className="py-3 text-center text-[11px] text-slate-400">
                            Không có quyền nào phù hợp với bộ lọc hiện tại.
                          </div>
                        ) : (
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                            {filtered.map((p: ApiData) => {
                              const code = p.code || p.sPermissionCode;
                              const isChecked = selectedPermissions.includes(code);
                              const action = p.action || p.sAction || code.split(":")[1] || "manage";
                              return (
                                <label
                                  key={code}
                                  className={`flex items-start gap-2.5 p-2.5 rounded-xl border transition-all cursor-pointer select-none ${
                                    isChecked
                                      ? "bg-emerald-50/40 border-emerald-300 shadow-2xs"
                                      : "bg-white border-slate-200 hover:border-slate-300"
                                  }`}
                                >
                                  <input
                                    type="checkbox"
                                    checked={isChecked}
                                    onChange={(e) => {
                                      if (e.target.checked) {
                                        setSelectedPermissions([...selectedPermissions, code]);
                                      } else {
                                        setSelectedPermissions(selectedPermissions.filter((c) => c !== code));
                                      }
                                    }}
                                    className="mt-0.5 rounded border-slate-300 text-[var(--color-primary)] focus:ring-[var(--color-primary)]"
                                  />
                                  <div className="flex-1 min-w-0">
                                    <div className="flex items-center gap-1.5 flex-wrap">
                                      <span className="text-xs font-mono font-bold text-slate-900 truncate">{code}</span>
                                      <span className="px-1.5 py-0.2 rounded text-[9px] font-mono font-semibold bg-slate-100 text-slate-600 uppercase">
                                        {action}
                                      </span>
                                    </div>
                                    <div className="text-[11px] text-slate-600 mt-0.5 leading-tight">
                                      {p.name || p.sPermissionName || code}
                                    </div>
                                  </div>
                                </label>
                              );
                            })}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>

            {/* Modal Footer */}
            <div className="flex items-center justify-between pt-3 border-t border-slate-100">
              <span className="text-xs text-slate-600 font-medium">
                Đã kích hoạt <strong className="text-emerald-700 font-bold">{selectedPermissions.length}</strong> / {permissions.length} quyền hạn hạt nhân
              </span>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setShowRolePermissionsModal(false)}
                  className="px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100 rounded-xl cursor-pointer"
                >
                  Hủy
                </button>
                <button
                  type="button"
                  disabled={actionLoading}
                  onClick={handleSaveRolePermissions}
                  className="px-5 py-2 text-xs font-semibold text-white bg-[var(--color-primary)] hover:opacity-90 rounded-xl cursor-pointer shadow-xs transition-all"
                >
                  {actionLoading ? "Đang lưu cấu hình..." : "Lưu phân quyền"}
                </button>
              </div>
            </div>
          </div>
        </Modal>
      )}

      {/* Modal: Tạo Phân công CVHT */}
      <Modal isOpen={showAssignModal} onClose={() => setShowAssignModal(false)} title="Phân công Cố vấn học tập" maxWidth="md">
        <form onSubmit={handleCreateAssignment} className="space-y-4">
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">Giảng viên cố vấn</label>
            <select
              value={assignForm.userId}
              onChange={(e) => setAssignForm({ ...assignForm, userId: e.target.value })}
              className="w-full bg-white border border-slate-200 rounded-xl px-3 py-2 text-xs font-medium text-slate-800 focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)]"
            >
              {users.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.fullName} ({u.username})
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">Lớp phụ trách</label>
            <select
              value={assignForm.classId}
              onChange={(e) => setAssignForm({ ...assignForm, classId: e.target.value })}
              className="w-full bg-white border border-slate-200 rounded-xl px-3 py-2 text-xs font-medium text-slate-800 focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)]"
            >
              {classes.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.classId} - {c.className}
                </option>
              ))}
            </select>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Năm học</label>
              <select
                value={assignForm.academicYearId}
                onChange={(e) => {
                  setAssignForm({ ...assignForm, academicYearId: e.target.value, academicTermId: "" });
                }}
                className="w-full bg-white border border-slate-200 rounded-xl px-3 py-2 text-xs font-medium text-slate-800 focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)]"
              >
                {years.map((y) => (
                  <option key={y.id} value={y.id}>
                    {y.sYearCode || y.yearCode}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Học kỳ</label>
              <select
                value={assignForm.academicTermId}
                onChange={(e) => setAssignForm({ ...assignForm, academicTermId: e.target.value })}
                className="w-full bg-white border border-slate-200 rounded-xl px-3 py-2 text-xs font-medium text-slate-800 focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)]"
              >
                <option value="">Chọn học kỳ</option>
                {termsForAssignYear.map((t: ApiData) => (
                  <option key={t.id} value={t.id}>
                    {t.sTermCode || t.termCode}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="flex items-center justify-end gap-2 pt-4 border-t border-slate-100">
            <button
              type="button"
              onClick={() => setShowAssignModal(false)}
              className="px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100 rounded-xl cursor-pointer"
            >
              Hủy
            </button>
            <button
              type="submit"
              disabled={actionLoading}
              className="px-4 py-2 text-xs font-semibold text-white bg-[var(--color-primary)] hover:opacity-90 rounded-xl cursor-pointer shadow-xs"
            >
              {actionLoading ? "Đang gán..." : "Tạo phân công"}
            </button>
          </div>
        </form>
      </Modal>

      {/* Confirm Dialog: Thu hồi Phân công CVHT */}
      <ConfirmDialog
        isOpen={Boolean(revokeTarget)}
        onClose={() => setRevokeTarget(null)}
        onConfirm={handleConfirmRevoke}
        loading={actionLoading}
        isDangerous
        title="Xác nhận thu hồi phân công"
        message={`Bạn có chắc chắn muốn thu hồi phân công lớp của cố vấn "${revokeTarget?.userFullName || revokeTarget?.userName}" không?`}
        confirmText="Thu hồi phân công"
      />
    </div>
  );
}
