"use client";

export default function ErrorPage({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return <main className="mx-auto max-w-xl space-y-4 p-8" role="alert">
    <h1 className="text-xl font-semibold text-slate-900">Chưa thể tải trang</h1>
    <p className="text-sm text-slate-600">Dịch vụ tạm thời không phản hồi. Kiểm tra kết nối và thử tải lại; nếu lỗi tiếp tục, hãy liên hệ quản trị viên.</p>
    <button type="button" onClick={reset} className="rounded-lg bg-lime-700 px-4 py-2 text-sm font-semibold text-white hover:bg-lime-800 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-lime-700">Thử lại</button>
  </main>;
}
