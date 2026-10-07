"use client";

import type { ComponentPropsWithoutRef } from "react";
import { LoaderCircle, type LucideIcon } from "lucide-react";

const tones = {
  slate: "text-slate-600 hover:bg-slate-100 hover:text-slate-900",
  emerald: "text-emerald-700 hover:bg-emerald-50 hover:text-emerald-800",
  blue: "text-blue-700 hover:bg-blue-50 hover:text-blue-800",
  violet: "text-violet-700 hover:bg-violet-50 hover:text-violet-800",
  red: "text-red-700 hover:bg-red-50 hover:text-red-800",
  lime: "text-lime-800 hover:bg-lime-50 hover:text-lime-900",
};

type TableActionProps = Omit<ComponentPropsWithoutRef<"button">, "children" | "title" | "aria-label"> & {
  label: string;
  icon: LucideIcon;
  tone?: keyof typeof tones;
  loading?: boolean;
};

export default function TableAction({
  label,
  icon: Icon,
  tone = "slate",
  loading = false,
  disabled,
  className = "",
  type = "button",
  ...props
}: TableActionProps) {
  return (
    <button
      {...props}
      type={type}
      title={label}
      aria-label={label}
      aria-busy={loading || undefined}
      disabled={disabled || loading}
      className={`inline-flex size-9 shrink-0 items-center justify-center rounded-lg transition-colors cursor-pointer focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-700 disabled:pointer-events-none disabled:opacity-50 ${tones[tone]} ${className}`}
    >
      {loading ? (
        <LoaderCircle size={18} aria-hidden="true" className="motion-safe:animate-spin" />
      ) : (
        <Icon size={18} aria-hidden="true" />
      )}
    </button>
  );
}
