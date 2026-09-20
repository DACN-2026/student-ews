"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useAuthStore } from "@/stores/authStore";

export default function LoginPage() {
  const router = useRouter();
  const { login } = useAuthStore();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const handleRealLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);
    setLoading(true);

    try {
      await login({ username, password });
      router.push("/dashboard");
    } catch (err: unknown) {
      setErrorMessage(err instanceof Error ? err.message : "Tên đăng nhập hoặc mật khẩu không chính xác");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-[var(--color-bg)] relative overflow-hidden p-4">
      {/* Background decoration */}
      <div className="absolute -top-40 -right-40 w-96 h-96 bg-[var(--color-primary)]/10 rounded-full blur-3xl pointer-events-none" />
      <div className="absolute -bottom-40 -left-40 w-96 h-96 bg-lime-400/10 rounded-full blur-3xl pointer-events-none" />

      {/* Background grid */}
      <div
        className="absolute inset-0 opacity-[0.02] pointer-events-none"
        style={{
          backgroundImage:
            "linear-gradient(rgba(0,0,0,0.1) 1px, transparent 1px), linear-gradient(90deg, rgba(0,0,0,0.1) 1px, transparent 1px)",
          backgroundSize: "32px 32px",
        }}
      />

      <div className="relative z-10 w-full max-w-md">
        {/* Header Branding */}
        <div className="text-center mb-8">
          <div
            className="w-16 h-16 rounded-2xl bg-gradient-to-tr from-[var(--color-primary)] to-lime-500 flex items-center justify-center text-white text-2xl font-black mx-auto mb-4 shadow-lg shadow-[var(--color-primary)]/20"
            style={{ fontFamily: "Be Vietnam Pro, sans-serif" }}
          >
            DLU
          </div>
          <h1
            className="text-2xl sm:text-3xl font-bold text-[var(--color-text)] tracking-tight"
            style={{ fontFamily: "Be Vietnam Pro, sans-serif" }}
          >
            HỆ THỐNG CẢNH BÁO
          </h1>
          <p className="text-sm font-medium text-[var(--color-text-secondary)] mt-1">
            Theo dõi Học vụ & Tiến độ Đào tạo Sinh viên
          </p>
          <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 mt-2 rounded-full bg-[var(--color-primary-light)] text-[var(--color-primary)] text-xs font-semibold">
            <span>Khoa Công nghệ Thông tin</span>
            <span>•</span>
            <span>Trường Đại học Đà Lạt</span>
          </div>
        </div>

        {/* Login Card */}
        <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-2xl p-7 shadow-xl shadow-slate-200/50">
          <h2
            className="text-[var(--color-text)] font-semibold text-lg mb-5"
            style={{ fontFamily: "Be Vietnam Pro, sans-serif" }}
          >
            Đăng nhập tài khoản
          </h2>

          {errorMessage && (
            <div className="mb-4 p-3 rounded-xl bg-red-50 border border-red-200 text-red-700 text-xs font-medium flex items-center gap-2">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <circle cx="12" cy="12" r="10" />
                <line x1="12" y1="8" x2="12" y2="12" />
                <line x1="12" y1="16" x2="12.01" y2="16" />
              </svg>
              <span>{errorMessage}</span>
            </div>
          )}

          <form onSubmit={handleRealLogin} className="space-y-4">
            <div>
              <label className="text-xs text-[var(--color-text-secondary)] font-semibold uppercase tracking-wider block mb-1.5">
                Tên đăng nhập
              </label>
              <div className="relative">
                <input
                  type="text"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  required
                  className="w-full pl-10 pr-4 py-2.5 bg-[var(--color-surface2)]/40 border border-[var(--color-border)] rounded-xl text-[var(--color-text)] text-sm focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)] focus:bg-white transition-all font-mono"
                  placeholder="admin"
                />
                <span className="absolute left-3.5 top-3 text-gray-400">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
                    <circle cx="12" cy="7" r="4" />
                  </svg>
                </span>
              </div>
            </div>

            <div>
              <label className="text-xs text-[var(--color-text-secondary)] font-semibold uppercase tracking-wider block mb-1.5">
                Mật khẩu
              </label>
              <div className="relative">
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  className="w-full pl-10 pr-4 py-2.5 bg-[var(--color-surface2)]/40 border border-[var(--color-border)] rounded-xl text-[var(--color-text)] text-sm focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)] focus:bg-white transition-all"
                  placeholder="••••••••"
                />
                <span className="absolute left-3.5 top-3 text-gray-400">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
                    <path d="M7 11V7a5 5 0 0 1 10 0v4" />
                  </svg>
                </span>
              </div>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full py-3 bg-[var(--color-primary)] hover:bg-[#81b234] text-white font-semibold rounded-xl text-sm transition-all shadow-md shadow-[var(--color-primary)]/20 cursor-pointer disabled:opacity-50 mt-1 flex items-center justify-center gap-2"
              style={{ fontFamily: "Be Vietnam Pro, sans-serif" }}
            >
              {loading ? (
                <>
                  <svg className="animate-spin h-4 w-4 text-white" viewBox="0 0 24 24" fill="none">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                  </svg>
                  <span>Đang xác thực...</span>
                </>
              ) : (
                <span>Đăng nhập hệ thống</span>
              )}
            </button>
          </form>

        </div>
      </div>
    </div>
  );
}
