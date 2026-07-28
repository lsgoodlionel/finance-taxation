import React from "react";
import { HelpPanel } from "../../components/ui/HelpPanel";
import { Term } from "../../components/ui/Term";

/**
 * 凭证中心的说明抽屉。
 * 从 VouchersPage 拆出来：它只在点「操作说明」时才打开，不属于页面主流程，
 * 留在页面文件里只会把主流程淹没在一屏说明文案里。
 */
export function VouchersHelpPanel({ open, onClose }: { open: boolean; onClose: () => void }) {
  return (
    <HelpPanel
      open={open}
      title="凭证中心 · 业务关系与操作说明"
      onClose={onClose}
      relations={(
        <>
          <strong>经营事项页</strong>定义业务背景，<strong>单据中心</strong>提供发票、回单等原始依据；<strong><Term k="voucher">凭证</Term>中心</strong>把它们转成正式会计凭证并<Term k="posting">过账</Term>；过账结果流向<strong><Term k="general-ledger">总账</Term>中心</strong>和<strong>财务报表</strong>。标准链路：事项 / 单据 → 凭证 → 总账 / 报表。
        </>
      )}
      workflowSteps={[
        "按模板或从事项生成借贷凭证草稿",
        "执行借贷校验，确认借方合计等于贷方合计",
        "复核无误后审核凭证",
        "审核通过后执行过账，正式记入总账",
        "过账结果进入报表、税务和归档流程"
      ]}
      responsibility="这里负责管理借贷凭证的完整生命周期：草稿 → 校验 → 审核 → 过账。凭证是账本和报表的直接来源，摘要、科目和金额都在本页确定。"
      operations="常见操作包括：按模板生成凭证、选择凭证查看分录明细、执行借贷校验、审核凭证、执行过账、修改摘要，以及跳转到关联的事项、单据、税务和总账页面。"
      caution="过账是正式记账动作：过账后凭证将影响总账和财务报表，不能直接修改。发现错误需要通过冲销凭证或在总账中心反结账处理。"
    />
  );
}
