import { useRef, useState } from "react";
import { API_BASE_URL, refreshSession } from "../../lib/api";
import { TOKEN_KEY } from "./constants";
import type { AssistantUploadPhase, OcrPreview } from "./types";

interface UseOcrUploadParams {
  ocrPreview: OcrPreview | null;
  setOcrPreview: (value: OcrPreview | null) => void;
  setInput: (value: string) => void;
  setStatus: (status: string) => void;
  fileInputRef: React.RefObject<HTMLInputElement>;
}

function xhrPost(url: string, token: string, body: string, onUploadPct: (pct: number) => void): Promise<{ status: number; data: unknown }> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("POST", url);
    xhr.setRequestHeader("Content-Type", "application/json");
    xhr.setRequestHeader("Authorization", `Bearer ${token}`);
    xhr.timeout = 180000;
    xhr.upload.onprogress = (e) => { if (e.lengthComputable) onUploadPct(Math.round(e.loaded / e.total * 100)); };
    xhr.upload.onload = () => onUploadPct(100);
    xhr.onload = () => {
      try { resolve({ status: xhr.status, data: JSON.parse(xhr.responseText) }); }
      catch { resolve({ status: xhr.status, data: { error: xhr.responseText } }); }
    };
    xhr.onerror = () => reject(new Error("网络连接失败"));
    xhr.ontimeout = () => reject(new Error("请求超时（3分钟），请检查网络或 AI 配置后重试"));
    xhr.send(body);
  });
}

export function useOcrUpload(params: UseOcrUploadParams) {
  const { ocrPreview, setOcrPreview, setInput, setStatus, fileInputRef } = params;

  const [ocrLoading, setOcrLoading] = useState(false);
  const [uploadPhase, setUploadPhase] = useState<AssistantUploadPhase | null>(null);
  const aiProgressRef = useRef<ReturnType<typeof setInterval> | null>(null);

  function clearAiProgress() {
    if (aiProgressRef.current) { clearInterval(aiProgressRef.current); aiProgressRef.current = null; }
    setUploadPhase(null);
  }

  function startAiProgressSimulation() {
    setUploadPhase({ phase: "ai", pct: 0 });
    aiProgressRef.current = setInterval(() => {
      setUploadPhase((prev) => {
        if (!prev || prev.phase !== "ai") return prev;
        const next = prev.pct + 1;
        return next >= 90 ? { phase: "ai", pct: 90 } : { phase: "ai", pct: next };
      });
    }, 400);
  }

  async function handleImageFile(file: File) {
    const isPdf = file.type === "application/pdf";
    if (file.size > 20 * 1024 * 1024) {
      setStatus("文件过大（最大 20MB）");
      return;
    }
    setOcrLoading(true);
    setUploadPhase({ phase: "reading", pct: 0 });
    setStatus(`正在读取${isPdf ? " PDF" : "图片"}文件...`);

    const objectUrl = isPdf ? "" : URL.createObjectURL(file);

    const reader = new FileReader();
    reader.onprogress = (e) => {
      if (e.lengthComputable) setUploadPhase({ phase: "reading", pct: Math.round(e.loaded / e.total * 100) });
    };
    reader.readAsDataURL(file);

    reader.onload = async () => {
      try {
        const dataUrl = reader.result as string;
        const commaIdx = dataUrl.indexOf(",");
        const base64 = dataUrl.slice(commaIdx + 1);
        const mimeType = isPdf ? "application/pdf" : (dataUrl.slice(5, commaIdx).split(";")[0] ?? "image/jpeg");
        const body = JSON.stringify({ imageBase64: base64, mimeType });

        setUploadPhase({ phase: "uploading", pct: 0 });
        setStatus("正在上传文件...");

        let token = window.localStorage.getItem(TOKEN_KEY) ?? "";
        let result = await xhrPost(`${API_BASE_URL}/api/assistant/ocr`, token, body,
          (pct) => setUploadPhase({ phase: "uploading", pct })
        );

        if (result.status === 401) {
          try {
            await refreshSession();
            token = window.localStorage.getItem(TOKEN_KEY) ?? "";
            setUploadPhase({ phase: "uploading", pct: 0 });
            result = await xhrPost(`${API_BASE_URL}/api/assistant/ocr`, token, body,
              (pct) => setUploadPhase({ phase: "uploading", pct })
            );
          } catch { /* fall through */ }
        }

        startAiProgressSimulation();
        setStatus(`AI 正在识别${isPdf ? " PDF" : "图片"}凭证...`);

        const data = result.data as { text?: string; error?: string };
        if (data.error || !data.text) throw new Error(data.error ?? "识别失败");

        clearAiProgress();
        setOcrPreview({ base64, mimeType, previewUrl: objectUrl, recognizedText: data.text, isPdf, originalFile: file });
        setInput(`【${isPdf ? "PDF凭证" : "图片凭证"}识别结果】\n${data.text}\n\n请根据以上凭证信息，给出财税处理建议。`);
        setStatus("识别完成，请确认内容后发送");
      } catch (err) {
        clearAiProgress();
        if (objectUrl) URL.revokeObjectURL(objectUrl);
        setStatus(err instanceof Error ? err.message : "文件识别失败");
      } finally {
        setOcrLoading(false);
        if (fileInputRef.current) fileInputRef.current.value = "";
      }
    };
    reader.onerror = () => {
      clearAiProgress();
      if (objectUrl) URL.revokeObjectURL(objectUrl);
      setStatus("文件读取失败");
      setOcrLoading(false);
    };
  }

  function clearOcrPreview() {
    clearAiProgress();
    if (ocrPreview?.previewUrl) URL.revokeObjectURL(ocrPreview.previewUrl);
    setOcrPreview(null);
    setInput("");
  }

  return { ocrLoading, uploadPhase, handleImageFile, clearOcrPreview };
}
