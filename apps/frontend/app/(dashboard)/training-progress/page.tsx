"use client";

import { useState } from "react";
import { ClipboardCheck, GraduationCap } from "lucide-react";
import Tabs from "@/components/ui/Tabs";
import CompletionProgressTab from "@/components/training-progress/CompletionProgressTab";
import RegistrationProgressTab from "@/components/training-progress/RegistrationProgressTab";

type ActiveTab = "registration" | "completion";

const tabs = [
  {
    id: "registration",
    label: "Kiểm tra đăng ký môn học theo kỳ",
    icon: <ClipboardCheck aria-hidden="true" size={16} />,
  },
  {
    id: "completion",
    label: "Tiến độ tích lũy toàn khóa",
    icon: <GraduationCap aria-hidden="true" size={16} />,
  },
];

export default function TrainingProgressPage() {
  const [activeTab, setActiveTab] = useState<ActiveTab>("registration");

  return (
    <main className="mx-auto max-w-7xl space-y-6 p-4 sm:p-6">
      {/* Clean page header without heavy boxing */}
      <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="flex items-center gap-2">
            <span className="inline-flex items-center rounded-md bg-lime-100 px-2 py-0.5 text-xs font-bold text-lime-800">
              Phân hệ Học vụ & Đào tạo
            </span>
            <span className="text-xs text-slate-400">•</span>
            <span className="text-xs text-slate-500">Đại học Đà Lạt</span>
          </div>
          <h1 className="mt-1.5 text-2xl font-bold tracking-tight text-slate-900 sm:text-3xl">
            Theo dõi Tiến độ Đào tạo
          </h1>
          <p className="mt-1 text-sm text-slate-500">
            Rà soát học phần sinh viên đăng ký theo từng học kỳ và đánh giá điều kiện tích lũy toàn khóa.
          </p>
        </div>
      </div>

      {/* Clean Tab Bar */}
      <div className="border-b border-slate-200">
        <Tabs
          tabs={tabs}
          activeTab={activeTab}
          onChange={(tabId) => setActiveTab(tabId as ActiveTab)}
        />
      </div>

      {/* Active Tab View */}
      {activeTab === "registration" ? <RegistrationProgressTab /> : <CompletionProgressTab />}
    </main>
  );
}
