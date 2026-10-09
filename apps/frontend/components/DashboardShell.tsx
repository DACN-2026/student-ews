"use client";

import { useState, useEffect } from "react";
import Sidebar from "@/components/Sidebar";
import Header from "@/components/Header";
import Breadcrumb from "@/components/Breadcrumb";
import ToastContainer from "@/components/ui/Toast";
import { useAuthStore } from "@/stores/authStore";
import LoadingState from "@/components/ui/LoadingState";
import NetworkActivity from "@/components/ui/NetworkActivity";

export default function DashboardShell({
  children,
}: {
  children: React.ReactNode;
}) {
  const { bootstrap, status } = useAuthStore();
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);

  useEffect(() => {
    bootstrap();
  }, [bootstrap]);

  return (
    <div className="flex h-screen bg-[var(--color-bg)] overflow-hidden relative">
      <ToastContainer />
      {/* Mobile Backdrop */}
      {mobileOpen && (
        <div
          onClick={() => setMobileOpen(false)}
          className="fixed inset-0 bg-slate-900/40 backdrop-blur-xs z-30 md:hidden transition-opacity"
        />
      )}

      {/* Sidebar Container (Responsive) */}
      <div
        className={`fixed md:relative inset-y-0 left-0 z-40 md:z-20 transition-transform duration-200 ease-in-out ${
          mobileOpen ? "translate-x-0" : "-translate-x-full md:translate-x-0"
        }`}
      >
        <Sidebar
          collapsed={collapsed}
          onToggle={() => setCollapsed((v) => !v)}
          onCloseMobile={() => setMobileOpen(false)}
        />
      </div>

      {/* Main Column */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        {/* Top Header */}
        <Header onMenuToggle={() => setMobileOpen((v) => !v)} />

        {/* Breadcrumb Bar */}
        <div className="bg-[var(--color-surface)]/80 backdrop-blur-xs border-b border-[var(--color-border)] px-4 sm:px-6 py-2">
          <Breadcrumb />
        </div>

        {/* Content Body */}
        <div className="relative min-h-0 flex-1">
          <NetworkActivity />
        <main className="h-full overflow-y-auto bg-[var(--color-bg)]">
          {status === "idle" || status === "loading" ? <div className="mx-auto max-w-7xl p-4 sm:p-6"><LoadingState variant="page" label="Đang tải phiên làm việc…" /></div> : children}
        </main>
        </div>
      </div>
    </div>
  );
}
