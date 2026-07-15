/**
 * 「记一笔」编排 Hook：串起 3 步的数据流。
 * 1 说清楚：票据 OCR（/api/assistant/ocr → /api/invoices/ocr）或白话解析（本地正则 + AI 增强）
 * 2 确认：白话草稿内联编辑 + 缺发票提醒
 * 3 完成：createEvent → analyzeEvent（拆任务/单据）→ 票据附件上传 → 尽力生成 AI 分录草稿
 */
import { useCallback, useMemo, useState } from "react";
import {
  analyzeEvent,
  createEvent,
  generateCloseDrafts,
  getEventDetail,
  ocrInvoice,
  uploadDocumentFile
} from "../../lib/api";
import { MAX_RECEIPT_FILE_BYTES, readFileAsBase64, recognizeReceiptText } from "./api-helpers";
import {
  applyParsedToDraft,
  buildEventPayload,
  buildMissingItems,
  isInvoiceMissing,
  pickAttachmentTargetDocument
} from "./entry-rules";
import { mergeParsedFields, parseDescription, parseOcrExtracted } from "./parse-description";
import { canSubmit } from "./wizard-state";
import type {
  ParsedFields,
  ParseSource,
  QuickDraft,
  QuickEntryController,
  QuickEntryResult,
  QuickEntryStepKey,
  QuickInputMode
} from "./types";

const OCR_NOTE_MAX_LENGTH = 300;

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

function buildEmptyDraft(): QuickDraft {
  return { type: "", amount: "", occurredOn: "", counterparty: "", department: "", note: "" };
}

function getErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    if (error.message === "AUTH_REQUIRED") return "登录已过期，请重新登录后再试";
    return error.message;
  }
  return "出了点问题，请稍后重试";
}

/** 白话文本 → 解析（本地正则打底 + 后端 AI 尽力增强，AI 不可用自动降级）。 */
async function parseWithAiEnhancement(
  text: string
): Promise<{ parsed: ParsedFields; source: ParseSource }> {
  const local = parseDescription(text, new Date());
  try {
    const result = await ocrInvoice({ text });
    return { parsed: mergeParsedFields(parseOcrExtracted(result.extracted), local), source: "ai" };
  } catch {
    return { parsed: local, source: "local" };
  }
}

export function useQuickEntry(): QuickEntryController {
  const [step, setStep] = useState<QuickEntryStepKey>("describe");
  const [mode, setMode] = useState<QuickInputMode>("upload");
  const [textInput, setTextInput] = useState("");
  const [receiptFile, setReceiptFile] = useState<File | null>(null);
  const [parsing, setParsing] = useState(false);
  const [parseError, setParseError] = useState<string | null>(null);
  const [parseSource, setParseSource] = useState<ParseSource | null>(null);
  const [draft, setDraft] = useState<QuickDraft>(buildEmptyDraft);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [result, setResult] = useState<QuickEntryResult | null>(null);

  const hasAttachment = receiptFile !== null;
  const missingItems = useMemo(
    () => buildMissingItems(draft.type, hasAttachment),
    [draft.type, hasAttachment]
  );

  const enterConfirm = useCallback((nextDraft: QuickDraft, source: ParseSource) => {
    setDraft({ ...nextDraft, occurredOn: nextDraft.occurredOn || todayIso() });
    setParseSource(source);
    setParseError(null);
    setStep("confirm");
  }, []);

  /** 第 1 步 · 上传/拍照票据：OCR 识别文字 → AI 结构化 → 进确认。失败保留文件并给降级出口。 */
  const analyzeReceipt = useCallback(
    async (file: File) => {
      if (file.size > MAX_RECEIPT_FILE_BYTES) {
        setParseError("文件太大了（最大 20MB），请换一张或改用文字描述");
        return;
      }
      setReceiptFile(file);
      setParsing(true);
      setParseError(null);
      try {
        const { base64, mimeType } = await readFileAsBase64(file);
        const recognizedText = await recognizeReceiptText(base64, mimeType);
        const { parsed, source } = await parseWithAiEnhancement(recognizedText);
        const note = `票据识别摘要：${recognizedText.slice(0, OCR_NOTE_MAX_LENGTH)}`;
        const withTypeFallback = { ...parsed, type: parsed.type ?? "expense" };
        enterConfirm(applyParsedToDraft({ ...buildEmptyDraft(), note }, withTypeFallback), source);
      } catch (error) {
        setParseError(getErrorMessage(error));
      } finally {
        setParsing(false);
      }
    },
    [enterConfirm]
  );

  /** 第 1 步 · 一句白话：本地解析永远可用，AI 可用时增强。 */
  const analyzeText = useCallback(async () => {
    const text = textInput.trim();
    if (!text) {
      setParseError("先用一句话说说发生了什么，比如「昨天请客户吃饭花了 800」");
      return;
    }
    setParsing(true);
    setParseError(null);
    try {
      const { parsed, source } = await parseWithAiEnhancement(text);
      enterConfirm(applyParsedToDraft({ ...buildEmptyDraft(), note: text }, parsed), source);
    } catch (error) {
      setParseError(getErrorMessage(error));
    } finally {
      setParsing(false);
    }
  }, [enterConfirm, textInput]);

  /** 降级出口：识别失败或不想识别时，直接手填进确认页。 */
  const skipToManualConfirm = useCallback(() => {
    const note = textInput.trim() || (receiptFile ? `票据文件：${receiptFile.name}` : "");
    enterConfirm({ ...buildEmptyDraft(), note }, "manual");
  }, [enterConfirm, receiptFile, textInput]);

  const updateDraft = useCallback((patch: Partial<QuickDraft>) => {
    setDraft((prev) => ({ ...prev, ...patch }));
  }, []);

  const removeReceiptFile = useCallback(() => {
    setReceiptFile(null);
  }, []);

  const goBackToDescribe = useCallback(() => {
    setSubmitError(null);
    setStep("describe");
  }, []);

  /** 第 3 步 · 提交：失败保留已填内容可重试；附件上传与分析失败均不阻塞主流程。 */
  const submit = useCallback(async () => {
    if (submitting || !canSubmit(draft)) return;
    setSubmitting(true);
    setSubmitError(null);
    try {
      const created = await createEvent(buildEventPayload(draft, hasAttachment));

      let taskCount = 0;
      try {
        const analysis = await analyzeEvent(created.id);
        taskCount = analysis.generatedTasks;
      } catch {
        // 拆解失败不阻塞：事项已落库，财务可在事项页手动触发分析
      }

      let uploadWarning: string | null = null;
      if (receiptFile) {
        try {
          const detail = await getEventDetail(created.id);
          const target = pickAttachmentTargetDocument(detail.generatedDocuments);
          if (target) {
            await uploadDocumentFile(target.id, receiptFile);
          } else {
            uploadWarning = "票据已识别，但这条事项暂时没有可挂的单据，稍后可在单据中心补传";
          }
        } catch {
          uploadWarning = "票据附件上传没成功，稍后可在单据中心重新上传";
        }
      }

      // 尽力而为：为当期生成 AI 分录草稿进财务队列（无权限/失败静默容忍）
      void generateCloseDrafts(draft.occurredOn.slice(0, 7)).catch(() => undefined);

      setResult({
        eventId: created.id,
        taskCount,
        missingInvoice: isInvoiceMissing(draft.type, hasAttachment),
        uploadWarning
      });
      setStep("done");
    } catch (error) {
      setSubmitError(getErrorMessage(error));
    } finally {
      setSubmitting(false);
    }
  }, [draft, hasAttachment, receiptFile, submitting]);

  /** 完成页「再记一笔」：整体重置。 */
  const reset = useCallback(() => {
    setStep("describe");
    setMode("upload");
    setTextInput("");
    setReceiptFile(null);
    setParsing(false);
    setParseError(null);
    setParseSource(null);
    setDraft(buildEmptyDraft());
    setSubmitting(false);
    setSubmitError(null);
    setResult(null);
  }, []);

  return {
    step,
    mode,
    setMode,
    textInput,
    setTextInput,
    receiptFile,
    parsing,
    parseError,
    parseSource,
    draft,
    updateDraft,
    missingItems,
    hasAttachment,
    submitting,
    submitError,
    result,
    analyzeReceipt,
    analyzeText,
    skipToManualConfirm,
    removeReceiptFile,
    goBackToDescribe,
    submit,
    reset
  };
}
