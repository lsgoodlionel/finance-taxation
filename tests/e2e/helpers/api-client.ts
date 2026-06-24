const DEFAULT_API_URL = process.env.V4_API_URL ?? "http://127.0.0.1:33100";

interface LoginResponse {
  accessToken: string;
  refreshToken: string;
}

export interface TestApiClient {
  login(username: string, password: string): Promise<string>;
  get<T>(path: string, token: string): Promise<T>;
  post<T>(path: string, token: string, body?: unknown): Promise<T>;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isRetryableFetchError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return (
    message.includes("fetch failed") ||
    message.includes("ECONNREFUSED") ||
    message.includes("SocketError") ||
    message.includes("other side closed")
  );
}

async function parsePayload(response: Response): Promise<unknown> {
  const text = await response.text();
  if (!text) {
    return null;
  }

  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

function buildErrorMessage(status: number, method: string, path: string, payload: unknown): string {
  const details =
    payload && typeof payload === "object" && "error" in payload && typeof payload.error === "string"
      ? payload.error
      : typeof payload === "string" && payload.trim() !== ""
        ? payload
        : `HTTP ${status}`;
  return `V4_API_${status}: ${method} ${path}: ${details}`;
}

export function createTestApiClient(baseUrl = DEFAULT_API_URL): TestApiClient {
  const apiBase = baseUrl.replace(/\/$/, "");

  async function request<T>(method: string, path: string, token?: string, body?: unknown): Promise<T> {
    const headers = new Headers({ "Content-Type": "application/json" });
    if (token) {
      headers.set("Authorization", `Bearer ${token}`);
    }
    let response: Response | null = null;
    let attempt = 0;
    let lastError: unknown = null;

    while (attempt < 3) {
      try {
        response = await fetch(`${apiBase}${path}`, {
          method,
          headers,
          body: body === undefined ? undefined : JSON.stringify(body)
        });
        break;
      } catch (error) {
        lastError = error;
        attempt += 1;
        if (attempt >= 3 || !isRetryableFetchError(error)) {
          throw error;
        }
        await sleep(300 * attempt);
      }
    }
    if (!response) {
      throw lastError instanceof Error ? lastError : new Error("fetch failed");
    }
    const payload = await parsePayload(response);

    if (!response.ok) {
      throw new Error(buildErrorMessage(response.status, method, path, payload));
    }

    return payload as T;
  }

  return {
    async login(username: string, password: string) {
      const payload = await request<LoginResponse>("POST", "/api/auth/login", undefined, {
        username,
        password
      });
      return payload.accessToken;
    },
    get(path, token) {
      return request("GET", path, token);
    },
    post(path, token, body) {
      return request("POST", path, token, body);
    }
  };
}

export const testApiClient = createTestApiClient();
