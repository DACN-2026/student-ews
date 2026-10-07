import type { ComponentPropsWithoutRef } from "react";

const surfaceTextColors: Record<string, string> = {
  amber: "text-amber-700", blue: "text-blue-700", emerald: "text-emerald-700",
  green: "text-green-700", lime: "text-lime-700", orange: "text-orange-700",
  red: "text-red-700", rose: "text-rose-700", slate: "text-slate-700",
  sky: "text-sky-700", violet: "text-violet-700", yellow: "text-yellow-700",
};

// Share text-only presentation across status labels and inline table actions.
// Existing status palettes can still supply their text color without their surface.
export function plainTextClasses(className = "") {
  const tokens = className.split(/\s+/).filter(Boolean);
  const solidColor = tokens.find((token) => /^bg-[a-z]+-\d+$/.test(token))?.split("-")[1];
  return tokens
    .filter((token) => !/^(?:(?:hover|active|focus):)?(?:bg-|border(?:-|$)|rounded(?:-|$)|shadow(?:-|$)|ring(?:-|$)|p[xytrbl]?-[\d\[])/.test(token))
    .map((token) => token === "text-white"
      ? solidColor ? surfaceTextColors[solidColor] || "text-slate-700" : "text-inherit"
      : token === "text-[var(--color-primary)]" ? "text-emerald-700" : token)
    .join(" ");
}

export default function TextLabel({ className, ...props }: ComponentPropsWithoutRef<"span">) {
  return <span {...props} className={plainTextClasses(className)} />;
}
