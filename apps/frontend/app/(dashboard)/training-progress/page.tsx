"use client";

import { useState } from "react";
import { ClipboardCheck, GraduationCap } from "lucide-react";
import Tabs from "@/components/ui/Tabs";
import CompletionProgressTab from "@/components/training-progress/CompletionProgressTab";
import RegistrationProgressTab from "@/components/training-progress/RegistrationProgressTab";

type ActiveTab = "registration" | "completion";

const tabs = [
  { id: "registration", label: "Kiểm tra đăng ký", icon: <ClipboardCheck aria-hidden="true" size={16} /> },
  { id: "completion", label: "Hoàn thành CTĐT", icon: <GraduationCap aria-hidden="true" size={16} /> },
];

export default function TrainingProgressPage() {
  const [activeTab, setActiveTab] = useState<ActiveTab>("registration");

  return (
    <main className="mx-auto max-w-7xl space-y-6 p-4 sm:p-6">
      <header>
        <h1 className="text-2xl font-bold tracking-tight text-slate-950 sm:text-3xl">
          Tiến độ đào tạo
        </h1>
        <p className="mt-1 max-w-3xl text-sm leading-6 text-slate-600">
          Đối chiếu đăng ký theo kỳ và đánh giá mức độ hoàn thành học phần bằng kế hoạch đã khóa, có lịch sử kết quả để truy vết.
        </p>
      </header>

      <Tabs
        tabs={tabs}
        activeTab={activeTab}
        onChange={(tabId) => setActiveTab(tabId as ActiveTab)}
      />

      {activeTab === "registration" ? <RegistrationProgressTab /> : <CompletionProgressTab />}
    </main>
  );
}
