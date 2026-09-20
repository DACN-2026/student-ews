import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import DashboardShell from "@/components/DashboardShell";
import { backendOrigin } from "@/lib/backend-origin";

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const [cookieStore, headerStore] = await Promise.all([cookies(), headers()]);
  const accessToken = cookieStore.get("sms_access_token")?.value;
  const requestedPath = headerStore.get("x-sms-request-path") || "/dashboard";
  const renewUrl = `/renew?next=${encodeURIComponent(requestedPath)}`;
  if (!accessToken) redirect(renewUrl);

  const session = await fetch(`${backendOrigin()}/api/v1/auth/me`, {
    headers: { cookie: `sms_access_token=${encodeURIComponent(accessToken)}` },
    cache: "no-store",
    signal: AbortSignal.timeout(10_000),
  });
  if (session.status === 401 || session.status === 403) redirect(renewUrl);
  if (!session.ok) throw new Error("Không thể kết nối dịch vụ xác thực");

  return <DashboardShell>{children}</DashboardShell>;
}
