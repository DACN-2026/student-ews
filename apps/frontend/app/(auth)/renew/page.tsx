"use client";

import { useEffect, useState } from "react";

function safeNextPath(): string {
  const candidate = new URLSearchParams(window.location.search).get("next") || "/dashboard";
  if (!candidate.startsWith("/") || candidate.startsWith("//") || candidate.startsWith("/renew")) {
    return "/dashboard";
  }
  return candidate;
}

export default function RenewSessionPage() {
  const [message, setMessage] = useState("Đang khôi phục phiên đăng nhập…");

  useEffect(() => {
    const next = safeNextPath();
    void fetch("/api/v1/auth/refresh", {
      method: "POST",
      credentials: "same-origin",
      headers: { "X-SMS-Session-Refresh": "1" },
    })
      .then((response) => {
        if (!response.ok) throw new Error("SESSION_EXPIRED");
        window.location.replace(next);
      })
      .catch(() => {
        setMessage("Phiên đăng nhập đã hết hạn. Đang chuyển đến trang đăng nhập…");
        window.location.replace(`/login?next=${encodeURIComponent(next)}`);
      });
  }, []);

  return (
    <main className="grid min-h-screen place-items-center bg-slate-50 px-6">
      <div className="rounded-2xl border border-slate-200 bg-white px-6 py-5 text-center shadow-sm" role="status">
        <div className="mx-auto mb-3 size-7 animate-spin rounded-full border-2 border-slate-200 border-t-emerald-600" aria-hidden="true" />
        <p className="text-sm font-medium text-slate-700">{message}</p>
      </div>
    </main>
  );
}
