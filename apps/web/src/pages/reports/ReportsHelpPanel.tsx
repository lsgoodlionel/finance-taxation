import React from "react";
import { HelpPanel } from "../../components/ui/HelpPanel";

const THREE_STATEMENTS_GUIDE: readonly (readonly [string, string])[] = [
  ["资产负债表", "回答“某一天公司值多少”：有多少资产、欠多少债、净资产还剩多少"],
  ["利润表", "回答“这段时间经营得怎么样”：收入多少、花了多少、赚了还是亏了"],
  ["现金流量表", "回答“账上现金为什么变多或变少”：经营、投资、筹资各进出了多少现金"]
] as const;

export function ReportsHelpPanel({ open, onClose }: { open: boolean; onClose: () => void }) {
  return (
    <HelpPanel
      open={open}
      title="财务报表中心 · 业务关系与操作说明"
      onClose={onClose}
      relations={(
        <>
          <strong>凭证中心</strong>过账后数据进入<strong>总账中心</strong>，报表中心基于总账自动编制三大报表；报表结果支撑<strong>董事长驾驶舱</strong>的经营判断，并流向<strong>税务申报</strong>、<strong>PDF 导出</strong>和<strong>归档</strong>。
        </>
      )}
      workflowSteps={[
        "选择期间类型（月 / 季 / 年）和具体期间",
        "系统基于总账数据生成三大报表",
        "保存报表快照，留存当期口径",
        "需要对比时选择两个快照生成差异分析",
        "确认无误后导出 PDF、推送申报或归档"
      ]}
      responsibility="这里负责把总账数据编制成对外可用的财务报表，并管理报表快照、期间对比和董事长摘要。报表数字只能通过上游账务修正，本页不直接改数。"
      caution="报表反映的是已过账数据。若发现数字异常，应先回到凭证中心或总账中心核对来源，再重新生成报表；已保存的快照是历史留档，不会随账务修正自动变化。"
    >
      <div>
        <strong>三大报表分别回答什么问题</strong>
        {THREE_STATEMENTS_GUIDE.map(([name, answer]) => (
          <div key={name} style={{ display: "flex", gap: "8px", marginTop: "4px" }}>
            <span style={{ fontWeight: 600, minWidth: "86px" }}>{name}</span>
            <span style={{ color: "#4d5d6c" }}>{answer}</span>
          </div>
        ))}
      </div>
    </HelpPanel>
  );
}
