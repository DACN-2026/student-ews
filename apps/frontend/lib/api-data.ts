import { apiFetch } from "./api-client";

export interface ListResponse<T> { items: T[]; total: number; page: number; pageSize: number }

export async function readApiJson<T>(response: Response): Promise<T> {
  const data = await response.json().catch(() => null);
  if (!response.ok) throw new Error(data?.error?.message || `Không thể tải/lưu dữ liệu (HTTP ${response.status}). Vui lòng thử lại.`);
  if (data === null) throw new Error("Máy chủ trả dữ liệu không hợp lệ. Vui lòng thử lại.");
  return data as T;
}

export function listItems<T>(data: ListResponse<T> | T[]): T[] {
  if (Array.isArray(data)) return data;
  if (data && Array.isArray(data.items)) return data.items;
  throw new Error("Danh sách trả về không đúng định dạng. Vui lòng tải lại.");
}

/** For small catalogs/options only. Respect the server page-size cap and fail
 * the whole load if any page fails, instead of showing an incomplete catalog. */
export async function fetchAllApiItems<T>(path: string, init?: RequestInit): Promise<T[]> {
  const [pathname, search = ""] = path.split("?");
  const query = new URLSearchParams(search);
  query.set("pageSize", "100");
  const items: T[] = [];
  for (let page = 1; ; page += 1) {
    query.set("page", String(page));
    const data = await readApiJson<ListResponse<T> | T[]>(await apiFetch(`${pathname}?${query}`, init));
    const batch = listItems(data);
    items.push(...batch);
    if (Array.isArray(data) || !Number.isFinite(data.total) || items.length >= data.total) return items;
    if (!batch.length) throw new Error("Danh mục chưa tải đủ dữ liệu. Vui lòng thử lại.");
  }
}
