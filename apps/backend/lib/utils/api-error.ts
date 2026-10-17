import { Prisma } from "@prisma/client";
import { errorResponse } from "./api-response";

export class ApiError extends Error {
  constructor(
    message: string,
    readonly code: string,
    readonly status: number
  ) {
    super(message);
  }
}

export async function readJsonBody<T>(request: Request, maxBytes = 1024 * 1024): Promise<T> {
  const declaredLength = Number(request.headers.get("content-length") || 0);
  if (declaredLength > maxBytes) throw new ApiError("Request body is too large", "PAYLOAD_TOO_LARGE", 413);
  const text = await request.text();
  if (new TextEncoder().encode(text).byteLength > maxBytes) {
    throw new ApiError("Request body is too large", "PAYLOAD_TOO_LARGE", 413);
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new ApiError("Request body must be valid JSON", "INVALID_JSON", 400);
  }
  return parsed as T;
}

export async function readJsonObject<T>(request: Request, maxBytes = 1024 * 1024): Promise<T> {
  const parsed = await readJsonBody<unknown>(request, maxBytes);
  if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) throw new ApiError("Request body must be an object", "INVALID_REQUEST", 400);
  return parsed as T;
}

export function apiErrorResponse(error: unknown, fallbackMessage = "Internal server error") {
  if (error instanceof ApiError) return errorResponse(error.message, error.code, error.status);
  if (error instanceof Prisma.PrismaClientKnownRequestError) {
    if (error.code === "P2002") return errorResponse("Resource already exists", "CONFLICT", 409);
    if (error.code === "P2025") return errorResponse("Resource not found", "NOT_FOUND", 404);
    if (error.code === "P2003") return errorResponse("Referenced resource does not exist", "INVALID_REFERENCE", 400);
    if (error.code === "P2023") return errorResponse("Invalid identifier", "INVALID_ID", 400);
  }
  console.error(fallbackMessage, error);
  return errorResponse(fallbackMessage, "INTERNAL_ERROR", 500);
}
