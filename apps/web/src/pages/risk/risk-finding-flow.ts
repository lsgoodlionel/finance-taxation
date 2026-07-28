/**
 * 「这条风险走到哪了」。
 *
 * 替换掉改造前那块 ProcessFlowStageSection——它的 currentNodeId 是写死的
 * "ai_precheck"，无论用户选中哪条风险都显示同一个位置，对当前这条风险毫无意义，
 * 留着就是在骗用户。
 *
 * 这里的每一步都来自真实字段：风险发现本身（存在即已发现）、finding.status
 * （open / resolved / dismissed）、以及关闭复盘记录（RiskClosureRecord）。
 * 数据只够支撑三步，那就只画三步。
 */
import type { RiskClosureRecord, RiskFinding } from "@finance-taxation/domain-model";
import { buildObjectFlow, type FlowRelatedObject, type ObjectFlow } from "../../lib/object-flow";

export interface RiskFindingFlowInput {
  finding: RiskFinding | null;
  closureRecords: readonly RiskClosureRecord[];
}

/** 风险的生命周期：发现 → 回上游整改 → 关闭并留痕。 */
export function buildRiskFindingFlow({ finding, closureRecords }: RiskFindingFlowInput): ObjectFlow {
  if (!finding) {
    return { steps: [], nextStepKey: null, overall: "done" };
  }

  const isClosed = finding.status !== "open";
  const hasClosureRecord = closureRecords.some((record) => record.findingId === finding.id);
  const eventLink: FlowRelatedObject[] = finding.businessEventId
    ? [{ kind: "business_event", id: finding.businessEventId, label: finding.businessEventId }]
    : [];

  return buildObjectFlow([
    {
      key: "detected",
      label: "系统发现",
      done: true,
      related: eventLink,
      owner: "风险规则引擎"
    },
    {
      key: "remediate",
      label: "回上游整改",
      done: isClosed,
      // 高危且还没人动过 → 明确说出它在等谁，别让它静静躺在列表里
      blockedReason: !isClosed && finding.severity === "high" ? "高危风险仍未整改，需要尽快处理" : null,
      related: eventLink,
      owner: "业务与财务"
    },
    {
      key: "closed",
      label: "关闭并留痕",
      done: isClosed && hasClosureRecord,
      related: [{ kind: "risk_finding", id: finding.id, label: finding.title }],
      owner: "财务复核"
    }
  ]);
}
