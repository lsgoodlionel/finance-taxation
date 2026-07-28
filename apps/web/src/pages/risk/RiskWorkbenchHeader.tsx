/**
 * /risk 的页头：只说「你在哪、当前是什么范围、出了什么结果」。
 *
 * 改造前这里塞了四类东西——筛选器、事项搜索框、整改（关闭说明）输入框、
 * 「执行风险检查」按钮——它们分别属于列表、动作和处置工作台，混在一个 header 里
 * 导致用户第一眼要在 6 个控件里找出自己该动哪个。现在各归各位：
 * - 筛选与事项选择、执行风险检查 → RiskFindingsToolbar（列表区）
 * - 关闭说明 → RiskResolutionWorkbench（处置工作台，那里本来就有同一个输入框）
 */
import type { DrilldownState } from "../drilldown";
import { Term } from "../../components/ui/Term";

const PANEL_STYLE = {
  background: "rgba(255,255,255,0.82)",
  borderRadius: "24px",
  border: "1px solid rgba(20,40,60,0.08)",
  padding: "20px 24px"
} as const;

const HELP_BUTTON_STYLE = {
  width: "26px",
  height: "26px",
  borderRadius: "50%",
  border: "1.5px solid rgba(79,142,247,0.6)",
  background: "rgba(79,142,247,0.08)",
  color: "#4f8ef7",
  fontWeight: 700,
  fontSize: "13px",
  cursor: "pointer",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  flexShrink: 0
} as const;

export function resolveRiskContextLabel(navState: DrilldownState): string {
  if (navState.contractId) return `当前合同 ${navState.contractId}`;
  if (navState.businessEventId) return `当前事项 ${navState.businessEventId}`;
  if (navState.riskFindingId) return `当前风险 ${navState.riskFindingId}`;
  return "当前为全局风险工作台";
}

export type RiskWorkbenchHeaderProps = {
  message: string;
  navState: DrilldownState;
  onShowHelp: () => void;
};

export function RiskWorkbenchHeader({ message, navState, onShowHelp }: RiskWorkbenchHeaderProps) {
  return (
    <article style={PANEL_STYLE}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12 }}>
        <div>
          <h2 style={{ margin: 0 }}>
            风险<Term k="reconciliation">勾稽</Term>中心
          </h2>
          <div style={{ marginTop: "6px", color: "#6c7a89", fontSize: "13px" }}>
            {resolveRiskContextLabel(navState)}
          </div>
        </div>
        <button onClick={onShowHelp} title="操作说明" style={HELP_BUTTON_STYLE}>
          ?
        </button>
      </div>
      <p style={{ margin: "10px 0 0", fontSize: "13px", color: "#4b5563" }} role="status">
        {message}
      </p>
    </article>
  );
}
