import { useState } from "react";
import { Button, Tag, Modal, List } from "antd";
import { RobotOutlined } from "@ant-design/icons";
import { toast } from "sonner";
import type { DrilldownState } from "../drilldown";
import { auditReview, type AuditReviewResult } from "../../lib/api";

const RISK_TAG: Record<string, { color: string; label: string }> = {
  high: { color: "error", label: "高风险" },
  medium: { color: "warning", label: "中风险" },
  low: { color: "blue", label: "低风险" },
  clean: { color: "success", label: "未见异常" },
};

function AiAuditButton() {
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<AuditReviewResult | null>(null);
  async function run() {
    setLoading(true);
    try { setResult(await auditReview()); }
    catch (err) { toast.error((err as Error).message); }
    finally { setLoading(false); }
  }
  return (
    <>
      <Button icon={<RobotOutlined />} loading={loading} onClick={() => void run()}>AI 审计勾稽</Button>
      <Modal open={!!result} onCancel={() => setResult(null)} footer={null} title="AI 审计勾稽结果">
        {result && (
          <div style={{ display: "grid", gap: 12 }}>
            <div><Tag color={RISK_TAG[result.riskLevel]?.color}>{RISK_TAG[result.riskLevel]?.label}</Tag></div>
            {result.findings.length > 0 && (
              <List size="small" header="发现" dataSource={result.findings}
                renderItem={(f) => <List.Item>{f}</List.Item>} />
            )}
            <div style={{ color: "#4d5d6c", fontSize: 13 }}>{result.recommendation}</div>
          </div>
        )}
      </Modal>
    </>
  );
}

function panelStyle() {
  return {
    background: "rgba(255,255,255,0.82)",
    borderRadius: "24px",
    border: "1px solid rgba(20,40,60,0.08)",
    padding: "24px"
  } as const;
}

type AuditWorkbenchHeaderProps = {
  total: number;
  message: string;
  navState: DrilldownState;
};

export function AuditWorkbenchHeader({ total, message, navState }: AuditWorkbenchHeaderProps) {
  const context = navState.resourceId ?? navState.riskFindingId ?? navState.businessEventId ?? navState.contractId ?? "全局审计检索";

  return (
    <article style={panelStyle()}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: "16px", flexWrap: "wrap" }}>
        <div>
          <h2 style={{ margin: "0 0 4px", fontSize: "22px" }}>审计日志</h2>
          <div style={{ color: "#6c7a89", fontSize: "13px" }}>{message}</div>
          <div style={{ marginTop: 10 }}><AiAuditButton /></div>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: "12px", minWidth: "320px" }}>
          <div style={{ padding: "12px 14px", borderRadius: "16px", background: "rgba(37,99,235,0.08)" }}>
            <div style={{ fontSize: "12px", color: "#6c7a89" }}>当前上下文</div>
            <div style={{ fontWeight: 700, fontSize: "14px" }}>{context}</div>
          </div>
          <div style={{ padding: "12px 14px", borderRadius: "16px", background: "rgba(16,185,129,0.08)" }}>
            <div style={{ fontSize: "12px", color: "#6c7a89" }}>命中记录</div>
            <div style={{ fontWeight: 700, fontSize: "14px" }}>{total}</div>
          </div>
        </div>
      </div>
    </article>
  );
}
