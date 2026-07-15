/**
 * 「记一笔」专用 API 补充：lib/api.ts 没有暴露 /api/assistant/ocr 的客户端函数
 * （assistant 页用页内 XHR 实现），按 api.ts 的 request 惯例在本目录补一个，
 * 不改动共享的 lib/api.ts。
 */
import { API_BASE_URL, getStoredToken } from "../../lib/api";

const OCR_TIMEOUT_MS = 180000;
export const MAX_RECEIPT_FILE_BYTES = 20 * 1024 * 1024;

/** File → 纯 base64（去掉 dataURL 前缀）+ mimeType。 */
export function readFileAsBase64(file: File): Promise<{ base64: string; mimeType: string }> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = reader.result;
      if (typeof dataUrl !== "string") {
        reject(new Error("文件读取失败，请重试或改用文字描述"));
        return;
      }
      const commaIndex = dataUrl.indexOf(",");
      const base64 = dataUrl.slice(commaIndex + 1);
      const mimeType =
        file.type === "application/pdf"
          ? "application/pdf"
          : dataUrl.slice(5, commaIndex).split(";")[0] || "image/jpeg";
      resolve({ base64, mimeType });
    };
    reader.onerror = () => reject(new Error("文件读取失败，请重试或改用文字描述"));
    reader.readAsDataURL(file);
  });
}

/**
 * 调用现有 /api/assistant/ocr（支持图片与 PDF），返回识别出的票据文字。
 * AI 未配置（503）或识别失败时抛出带白话说明的错误，由页面引导改用文字描述。
 */
export async function recognizeReceiptText(base64: string, mimeType: string): Promise<string> {
  const token = getStoredToken();
  const headers = new Headers({ "Content-Type": "application/json" });
  if (token) {
    headers.set("Authorization", `Bearer ${token}`);
  }

  let response: Response;
  try {
    response = await fetch(`${API_BASE_URL}/api/assistant/ocr`, {
      method: "POST",
      headers,
      body: JSON.stringify({ imageBase64: base64, mimeType }),
      signal: AbortSignal.timeout(OCR_TIMEOUT_MS)
    });
  } catch (error) {
    const reason = error instanceof Error && error.name === "TimeoutError" ? "识别超时" : "网络连接失败";
    throw new Error(`${reason}，可以稍后重试，或改用下方「打字描述」`);
  }

  const payload = (await response.json().catch(() => null)) as { text?: string; error?: string } | null;
  if (!response.ok || !payload?.text) {
    const detail = payload?.error ?? `识别服务返回 ${response.status}`;
    throw new Error(`票据识别没成功（${detail}）。可以改用下方「打字描述」，或跳过识别手动填写`);
  }
  return payload.text;
}
