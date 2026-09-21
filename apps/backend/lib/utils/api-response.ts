import { NextResponse } from "next/server";

export function jsonResponse<T>(data: T, status = 200) {
  return NextResponse.json(data, { status });
}

export function errorResponse(message: string, code = "ERROR", status = 400) {
  return NextResponse.json(
    {
      error: {
        code,
        message,
      },
    },
    { status }
  );
}

export function parsePagination(searchParams: URLSearchParams, maxPageSize = 100) {
  const pageStr = searchParams.get("page");
  const pageSizeStr = searchParams.get("pageSize") || searchParams.get("page_size");

  let page = parseInt(pageStr || "1", 10);
  if (isNaN(page) || page < 1) page = 1;

  let pageSize = parseInt(pageSizeStr || "20", 10);
  if (isNaN(pageSize) || pageSize < 1) pageSize = 20;
  if (pageSize > maxPageSize) pageSize = maxPageSize;

  const skip = (page - 1) * pageSize;
  const take = pageSize;

  return { page, pageSize, skip, take };
}
