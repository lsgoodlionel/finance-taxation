import { useState } from "react";
import { analyzeEvent, createEvent, listDocuments, uploadDocumentFileRaw } from "../../lib/api";
import type { SessionMessage } from "../../lib/useChatSessions";
import { EVENT_TYPE_LABELS } from "./constants";
import { buildAssistantFlowContext } from "./flow-context-utils";
import type { AssistantFlowContext, OcrPreview, SuggestedEvent } from "./types";

interface UseSuggestedEventActionsParams {
  suggestedEvents: SuggestedEvent[];
  setSuggestedEvents: React.Dispatch<React.SetStateAction<SuggestedEvent[]>>;
  setFlowContext: React.Dispatch<React.SetStateAction<AssistantFlowContext | null>>;
  ocrPreview: OcrPreview | null;
  setOcrPreview: (value: OcrPreview | null) => void;
  requestDepartment: string;
  approverRoleLabel: string;
  setMessages: React.Dispatch<React.SetStateAction<SessionMessage[]>>;
  persistMessages: (messages: SessionMessage[]) => void;
  setStatus: (status: string) => void;
}

export function useSuggestedEventActions(params: UseSuggestedEventActionsParams) {
  const {
    suggestedEvents,
    setSuggestedEvents,
    setFlowContext,
    ocrPreview,
    setOcrPreview,
    requestDepartment,
    approverRoleLabel,
    setMessages,
    persistMessages,
    setStatus
  } = params;

  const [creating, setCreating] = useState(false);

  async function handleCreateEvent() {
    if (suggestedEvents.length === 0) return;
    setCreating(true);
    const captured = [...suggestedEvents];
    const capturedOcrPreview = ocrPreview;
    const isMulti = captured.length > 1;
    try {
      const results: { id: string; title: string; amount: number | null; occurredOn: string | null }[] = [];
      for (const ev of captured) {
        const created = await createEvent({
          type: ev.type as Parameters<typeof createEvent>[0]["type"],
          title: ev.title,
          description: ev.description,
          department: requestDepartment,
          occurredOn: ev.occurredOn ?? new Date().toISOString().slice(0, 10),
          amount: ev.amount !== null ? String(ev.amount) : null,
          currency: ev.currency || "CNY",
          source: "ai"
        });
        results.push({ id: created.id, title: ev.title, amount: ev.amount, occurredOn: ev.occurredOn });
      }
      setSuggestedEvents([]);
      setFlowContext(buildAssistantFlowContext({
        id: results[0]?.id,
        type: captured[0]!.type,
        title: captured[0]!.title,
        description: captured[0]!.description
      }));

      // Auto-analyze all created events
      let totalTasks = 0;
      for (const r of results) {
        try {
          const analyzed = await analyzeEvent(r.id);
          totalTasks += analyzed.generatedTasks;
        } catch {
          // analyze failure is non-critical
        }
      }

      // Auto-attach OCR file to all generated documents
      let attachedCount = 0;
      if (capturedOcrPreview?.originalFile) {
        for (const r of results) {
          try {
            const docs = await listDocuments({ businessEventId: r.id });
            for (const doc of docs.items) {
              await uploadDocumentFileRaw(doc.id, capturedOcrPreview.originalFile);
              attachedCount++;
            }
          } catch {
            // attachment is best-effort
          }
        }
        if (capturedOcrPreview.previewUrl) URL.revokeObjectURL(capturedOcrPreview.previewUrl);
        setOcrPreview(null);
      }

      const firstType = EVENT_TYPE_LABELS[captured[0]!.type] ?? captured[0]!.type;
      const summaryLines = results.map((r, i) =>
        `  ${i + 1}. ${r.title}${r.amount != null ? ` ¥${r.amount}` : ""}${r.occurredOn ? ` (${r.occurredOn})` : ""}`
      );

      const attachNote = attachedCount > 0
        ? `**第3步 ✅** 已自动将上传文件作为原始凭证挂载到 **${attachedCount}** 份单据`
        : `**第3步 📎** 原始凭证建议上传：银行电子发票/纸质发票/银行对账单/交易流水（证明扣款事实）`;

      const confirmMsg = [
        `✅ **全流程处理已启动**`,
        ``,
        isMulti
          ? `**第1步 ✅** 已批量创建 **${results.length}** 条[${firstType}]经营事项（按月分拆）：\n${summaryLines.join("\n")}`
          : `**第1步 ✅** 经营事项已创建：[${firstType}] ${results[0]!.title}`,
        `**第2步 ✅** 自动分析完成：共生成 **${totalTasks}** 个执行任务 + ${results.length} 张凭证草稿`,
        attachNote,
        `**第4步 ⏳** 等待${approverRoleLabel}审核确认凭证`,
        ``,
        `**操作导航：**`,
        `• [查看经营事项](/events)`,
        `• [查看待处理任务](/tasks)`,
        `• [审核并过账凭证](/vouchers)`,
        `• [查看单据及附件](/documents)`,
        ``,
        `> 凭证草稿已就绪，请${approverRoleLabel}前往「凭证中心」逐一确认过账。`
      ].join("\n");

      setMessages((prev) => {
        const updated = [...prev, { role: "assistant" as const, content: confirmMsg }];
        persistMessages(updated);
        return updated;
      });
      setStatus(isMulti ? `已批量创建 ${results.length} 条经营事项` : `已创建并自动分析：${captured[0]!.title}`);
    } catch (err) {
      setStatus(err instanceof Error ? err.message : "创建失败");
    } finally {
      setCreating(false);
    }
  }

  return { creating, handleCreateEvent };
}
