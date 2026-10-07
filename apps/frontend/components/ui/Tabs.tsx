"use client";

import TextLabel from "@/components/ui/TextLabel";
import React from "react";

export interface TabItem {
  id: string;
  label: string;
  icon?: React.ReactNode;
  badge?: number | string;
}

interface TabsProps {
  tabs: TabItem[];
  activeTab: string;
  onChange: (tabId: string) => void;
  className?: string;
}

export default function Tabs({
  tabs,
  activeTab,
  onChange,
  className = "",
}: TabsProps) {
  return (
    <div
      className={`flex items-center space-x-1.5 border-b border-slate-200/90 overflow-x-auto scrollbar-hide ${className}`}
    >
      {tabs.map((tab) => {
        const isActive = activeTab === tab.id;
        return (
          <button
            key={tab.id}
            type="button"
            onClick={() => onChange(tab.id)}
            className={`flex items-center gap-2 px-4 py-3 text-xs sm:text-sm font-semibold border-b-2 transition-all cursor-pointer whitespace-nowrap ${
              isActive
                ? "border-[var(--color-primary)] text-slate-900 bg-[var(--color-primary-light)]/60 rounded-t-xl"
                : "border-transparent text-slate-500 hover:text-slate-800 hover:border-slate-300"
            }`}
            style={{ fontFamily: "Be Vietnam Pro, sans-serif" }}
          >
            <span>{tab.label}</span>
            {tab.badge !== undefined && (
              <TextLabel
                className={`px-1.5   text-[10px] font-bold ${
                  isActive
                    ? "bg-[var(--color-primary)] text-white"
                    : "bg-slate-100 text-slate-600"
                }`}
              >
                {tab.badge}
              </TextLabel>
            )}
          </button>
        );
      })}
    </div>
  );
}
