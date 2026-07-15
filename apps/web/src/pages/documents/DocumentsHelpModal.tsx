import React from "react";
import { HelpPanel } from "../../components/ui/HelpPanel";

export function DocumentsHelpModal({ onClose }: { onClose: () => void }) {
  return (
    <HelpPanel
      open
      title="单据中心 · 业务关系与操作说明"
      onClose={onClose}
      relations={(
        <>
          <strong>任务中心</strong>负责告诉谁去做、先做什么；<strong>单据中心</strong>负责沉淀原始资料、业务单据和附件；<strong>凭证中心</strong>负责把单据转成正式会计凭证并过账。标准顺序通常是：<strong>事项分析 → 任务分发 → 单据补齐 → 凭证审核过账</strong>。
        </>
      )}
      workflowSteps={[
        "AI 财税秘书或经营事项页识别业务，自动生成任务",
        "任务中心分配给财务、业务、行政或税务岗位执行",
        "单据中心补齐发票、回单、审批单、附件索引等资料",
        "凭证中心根据单据生成和审核记账凭证",
        "过账后进入总账、报表、税务和归档流程"
      ]}
      responsibility="这里重点管理“原始业务资料是否齐全”。包括发票、付款凭证、合同、审批单、附件索引、验收或招待说明等。单据完整，凭证才有依据，税务和审计才可追溯。"
      operations="1. 在左侧选择单据；2. 在右侧查看正式单据内容；3. 上传附件；4. 下载已归档附件；5. 单据资料完整后执行归档。"
      caution="如果单据缺资料，不建议直接推进凭证过账。应先回到任务中心或事项页补齐责任人和附件要求。"
    />
  );
}
