"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import { getNetworkActivity, getServerNetworkActivity, subscribeNetworkActivity } from "@/lib/network-activity";

export default function NetworkActivity() {
  const pending = useSyncExternalStore(subscribeNetworkActivity, getNetworkActivity, getServerNetworkActivity);
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    const timer = window.setTimeout(() => setVisible(pending > 0), pending > 0 ? 180 : 0);
    return () => window.clearTimeout(timer);
  }, [pending]);
  if (!visible) return null;
  return <div role="status" aria-live="polite" aria-label="Đang tải dữ liệu" className="pointer-events-none absolute inset-x-0 top-0 z-20 h-0.5 overflow-hidden bg-lime-100"><div className="loading-progress h-full w-1/3 bg-lime-600" /><span className="sr-only">Đang tải dữ liệu…</span></div>;
}
