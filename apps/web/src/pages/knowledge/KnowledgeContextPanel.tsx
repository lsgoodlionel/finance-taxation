import React from "react";
import { KnowledgeSummary } from "./KnowledgeSummary";
import { KnowledgeAside } from "./KnowledgeAside";
import type { KnowledgeSummary as KnowledgeSummaryData } from "./knowledge-helpers";
import type { KnowledgeTaskKey } from "./knowledge-tasks";

type KnowledgeContextPanelProps = {
  task: KnowledgeTaskKey;
  summary: KnowledgeSummaryData;
  /** 最近一次操作的结果反馈（加载完成、保存成功、错误原因等）。 */
  message: string;
};

const NOTE_STYLE = {
  margin: 0,
  fontSize: "13px",
  color: "#6c7a89",
  lineHeight: 1.8
} as const;

const CARD_STYLE = {
  display: "grid",
  gap: "8px",
  padding: "16px 18px",
  borderRadius: "16px",
  border: "1px solid rgba(20,40,60,0.08)",
  background: "rgba(255,255,255,0.7)"
} as const;

/**
 * 当前这件事的只读上下文。
 *
 * 改造前概览统计和「AI 引用说明」是两块常驻区块，不管用户在填表单还是在传文件
 * 都占着屏。现在它们随任务收缩：只有「查阅已有条目」需要看分类分布和启用情况，
 * 另外两件事各自给一句与本步骤相关的提示。
 */
export function KnowledgeContextPanel({ task, summary, message }: KnowledgeContextPanelProps) {
  if (task === "browse") {
    return (
      <>
        <KnowledgeSummary summary={summary} message={message} />
        <KnowledgeAside />
      </>
    );
  }

  if (task === "create") {
    return (
      <div style={CARD_STYLE}>
        <h4 style={{ margin: 0, fontSize: "13px", color: "#6c7a89" }}>写好一条的要点</h4>
        <p style={NOTE_STYLE}>
          标题写成用户会搜的说法（例如「差旅住宿报销标准」），内容尽量保留原文口径，
          标签用于缩小 AI 检索范围。保存后可回到「查阅已有条目」随时停用或修改。
        </p>
        <p style={NOTE_STYLE}>{message}</p>
      </div>
    );
  }

  return (
    <div style={CARD_STYLE}>
      <h4 style={{ margin: 0, fontSize: "13px", color: "#6c7a89" }}>导入是怎么工作的</h4>
      <p style={NOTE_STYLE}>
        文件逐个上传解析，AI 自动识别标题、分类、摘要和标签。解析结果不会自动入库：
        你可以「直接创建」，也可以「填入编辑表单」改完再存。解析失败的文件重新选一次即可。
      </p>
      <p style={NOTE_STYLE}>{message}</p>
    </div>
  );
}
