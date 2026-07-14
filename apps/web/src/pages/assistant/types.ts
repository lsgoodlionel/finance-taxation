import type { ProcessFlowContext } from "../../features/process-flow/types";

export interface SuggestedEvent {
  type: string;
  title: string;
  amount: number | null;
  currency: string;
  occurredOn: string | null;
  description: string;
}

export interface OcrPreview {
  base64: string;
  mimeType: string;
  previewUrl: string;
  recognizedText: string;
  isPdf: boolean;
  originalFile: File;
}

export interface AssistantFlowContext extends ProcessFlowContext {
  businessEventId?: string;
  eventTitle?: string;
}

export type AssistantViewMode = "boss" | "staff";

export interface AssistantUploadPhase {
  phase: "reading" | "uploading" | "ai";
  pct: number;
}
