import type { ApiRequest } from "../types.js";

export function shouldReadJsonBody(method: string | undefined, contentType: string | undefined, pathname: string): boolean {
  if (!method || !["POST", "PUT", "PATCH"].includes(method)) {
    return false;
  }

  const normalizedContentType = (contentType ?? "").toLowerCase();
  if (normalizedContentType.startsWith("multipart/form-data")) {
    return false;
  }

  if (
    pathname === "/api/banking/statements/import" &&
    (normalizedContentType.startsWith("text/plain") || normalizedContentType.startsWith("text/csv"))
  ) {
    return false;
  }

  return true;
}

export async function readJsonBody<T>(req: ApiRequest): Promise<T | null> {
  const chunks: Buffer[] = [];
  for await (const chunk of req) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  const raw = Buffer.concat(chunks).toString("utf8").trim();
  if (!raw) return null;
  return JSON.parse(raw) as T;
}
