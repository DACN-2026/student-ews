import LoadingState from "@/components/ui/LoadingState";

export default function Loading() {
  return <div className="mx-auto max-w-7xl p-4 sm:p-6"><LoadingState variant="page" label="Đang mở giao diện…" /></div>;
}
