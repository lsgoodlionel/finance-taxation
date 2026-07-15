import React from "react";
import { HelpPanel } from "../../components/ui/HelpPanel";

const TAX_ITEM_STATUSES: readonly (readonly [string, string])[] = [
  ["待处理", "事项已生成，尚未处理"],
  ["需关注", "存在潜在风险，需人工复核"],
  ["已申报", "已完成本期申报"],
  ["已逾期", "申报期已过但未完成申报"],
  ["免申报", "本期免于申报（如小规模纳税人等）"]
] as const;

export function TaxHelpModal({ onClose }: { onClose: () => void }) {
  return (
    <HelpPanel
      open
      title="税务中心 · 业务关系与操作说明"
      onClose={onClose}
      relations={(
        <>
          <strong>经营事项页</strong>识别业务并形成税务关注点，<strong>单据中心</strong>和<strong>凭证中心</strong>提供申报依据，<strong>税务中心</strong>负责把这些结果归集为税务事项和申报批次，完成复核、申报和留档。
        </>
      )}
      workflowSteps={[
        "经营事项分析后生成税务事项",
        "单据、凭证、报表为税务处理提供依据",
        "在本页按税种和期间组建申报批次",
        "完成校验、复核、申报、留档",
        "申报结果回流到归档和风险管理"
      ]}
      responsibility="这里负责纳税人口径、税率规则、税务事项、申报批次和税务底稿。也就是把前面业务和账务结果，组织成真正可申报、可复核、可留档的税务资料。"
      caution="如果前面的单据、凭证、事项口径不完整，本页不应直接提交申报，应先回到上游页面补齐依据。"
    >
      <div>
        <strong>税务事项状态</strong>
        {TAX_ITEM_STATUSES.map(([status, description]) => (
          <div key={status} style={{ display: "flex", gap: "8px", marginTop: "4px" }}>
            <span style={{ fontWeight: 600, minWidth: "50px" }}>{status}</span>
            <span style={{ color: "#4d5d6c" }}>{description}</span>
          </div>
        ))}
      </div>
    </HelpPanel>
  );
}
