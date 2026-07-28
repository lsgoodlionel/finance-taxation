/**
 * 「验日志有没有被动过」这件事的工作区。
 *
 * 改造前这块是页头里的一个按钮 + 一个小标签：点完之后，「审计链在第 37 条断裂」
 * 和「审计链完整」长得一样大、在同一个位置一闪而过。断裂意味着有人绕过应用直接
 * 改过或删过审计记录——这是这套系统能给出的最严重的结论之一，不该长成一个标签。
 *
 * 现在它是一件独立的事：说清楚在验什么、验完是什么结论、结论意味着什么、下一步
 * 该做什么。AI 勾稽同属「按一下出结论」，一并收到这里，不再在页头抢位置。
 */
import React from "react";
import { Button, List, Tag } from "antd";
import { RobotOutlined, SafetyCertificateOutlined } from "@ant-design/icons";
import type { AuditChainVerification, AuditReviewResult } from "../../lib/api";
import { Term } from "../../components/ui/Term";

const PANEL_STYLE: React.CSSProperties = {
  background: "rgba(255,255,255,0.82)",
  borderRadius: "24px",
  border: "1px solid rgba(20,40,60,0.08)",
  padding: "24px",
  display: "grid",
  gap: "14px"
};

const HINT_STYLE: React.CSSProperties = {
  margin: 0,
  color: "#5c6b7a",
  fontSize: "13px",
  lineHeight: 1.75
};

const VERDICT_STYLE: React.CSSProperties = {
  padding: "12px 16px",
  borderRadius: "12px",
  fontSize: "13px",
  lineHeight: 1.75
};

const RISK_TAG: Record<string, { color: string; label: string }> = {
  high: { color: "error", label: "高风险" },
  medium: { color: "warning", label: "中风险" },
  low: { color: "blue", label: "低风险" },
  clean: { color: "success", label: "未见异常" }
};

export interface AuditIntegrityPanelProps {
  chainVerifying: boolean;
  chainResult: AuditChainVerification | null;
  onVerifyChain: () => void;
  reviewLoading: boolean;
  reviewResult: AuditReviewResult | null;
  onRunReview: () => void;
}

function ChainVerdict({ result }: { result: AuditChainVerification }) {
  if (result.valid) {
    return (
      <div style={{ ...VERDICT_STYLE, background: "rgba(22,163,74,0.10)", color: "#15803d" }} role="status">
        <strong>审计链完整</strong>，共 {result.total} 条记录首尾相连，没有发现事后改动或删除的痕迹。
      </div>
    );
  }
  return (
    <div style={{ ...VERDICT_STYLE, background: "rgba(220,38,38,0.10)", color: "#b91c1c" }} role="alert">
      <strong>审计链在第 {result.brokenAt} 条断裂</strong>（共 {result.total} 条）。这说明第 {result.brokenAt} 条
      记录之后有人绕过系统直接改动或删除过审计数据。请立刻保留数据库现场，从第 {result.brokenAt} 条的时间点
      开始核对业务单据，并联系系统管理员排查数据库直连权限。
    </div>
  );
}

export function AuditIntegrityPanel({
  chainVerifying,
  chainResult,
  onVerifyChain,
  reviewLoading,
  reviewResult,
  onRunReview
}: AuditIntegrityPanelProps) {
  return (
    <div style={{ display: "grid", gap: "16px" }}>
      <article style={PANEL_STYLE}>
        <h3 style={{ margin: 0, fontSize: "16px" }}>校验审计链</h3>
        <p style={HINT_STYLE}>
          每条审计记录都按写入顺序算了一个哈希，并把上一条的哈希算进自己的哈希里。只要有人事后改动或删除
          任何一条，它之后的链就对不上。这个校验不看具体改了什么，只回答一件事：<strong>这份日志本身还能不能信</strong>。
        </p>
        <div>
          <Button
            type="primary"
            icon={<SafetyCertificateOutlined />}
            loading={chainVerifying}
            onClick={onVerifyChain}
          >
            校验完整性
          </Button>
        </div>
        {chainResult ? <ChainVerdict result={chainResult} /> : null}
      </article>

      <article style={PANEL_STYLE}>
        <h3 style={{ margin: 0, fontSize: "16px" }}>让 AI 通查一遍账务<Term k="reconciliation">勾稽</Term></h3>
        <p style={HINT_STYLE}>
          与上面的校验是两件事：链校验查的是「日志有没有被动过」，这里查的是「账本身对不对得上」——
          由 AI 把单据、<Term k="voucher">凭证</Term>、报表之间做一次交叉核对，给出风险等级和发现清单。
          结论供人工复核，不构成审计意见。
        </p>
        <div>
          <Button icon={<RobotOutlined />} loading={reviewLoading} onClick={onRunReview}>
            AI 审计勾稽
          </Button>
        </div>
        {reviewResult ? (
          <div style={{ display: "grid", gap: "10px" }}>
            <div>
              <Tag color={RISK_TAG[reviewResult.riskLevel]?.color}>
                {RISK_TAG[reviewResult.riskLevel]?.label ?? reviewResult.riskLevel}
              </Tag>
            </div>
            {reviewResult.findings.length > 0 ? (
              <List
                size="small"
                header="发现"
                dataSource={reviewResult.findings}
                renderItem={(finding) => <List.Item>{finding}</List.Item>}
              />
            ) : (
              <div style={{ color: "#6c7a89", fontSize: "13px" }}>本次通查没有发现异常。</div>
            )}
            <div style={{ color: "#4d5d6c", fontSize: "13px" }}>{reviewResult.recommendation}</div>
          </div>
        ) : null}
      </article>
    </div>
  );
}
