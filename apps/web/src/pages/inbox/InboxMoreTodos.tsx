/**
 * 收件箱 · 其他模块待办（默认收起）。
 *
 * 改造前这是一堵和四张主卡并排的卡片墙，每类一张大卡，铺满小半屏。
 * 核对后确认它**不是**主卡的重复：后端 /api/inbox 去掉两类任务条目后，
 * 剩下的是待分析事项、待验真发票、待上传附件、待过账凭证、未匹配银行流水，
 * 分别属于 /events /invoices /documents /vouchers /banking——四张主卡一个都不覆盖。
 * 所以不能删，但也不该和「今天要处理的」抢首屏：改成默认收起的一行，
 * 展开是紧凑清单，每条仍可点进对应模块。
 */
import React from "react";
import { Typography } from "antd";
import { RightOutlined } from "@ant-design/icons";
import { useNavigate } from "react-router-dom";
import type { InboxItem } from "../../lib/api";

const { Text } = Typography;

const SHELL_STYLE: React.CSSProperties = { padding: "12px 16px", display: "block" };

const SUMMARY_STYLE: React.CSSProperties = {
  cursor: "pointer",
  display: "flex",
  alignItems: "center",
  gap: 8,
  fontSize: 13,
  fontWeight: 600,
  color: "#4d5d6c"
};

const COUNT_STYLE: React.CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  minWidth: 20,
  height: 20,
  padding: "0 6px",
  borderRadius: 999,
  background: "rgba(20,40,60,0.08)",
  color: "#4d5d6c",
  fontSize: 12,
  fontWeight: 700
};

const ROW_STYLE: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 10,
  width: "100%",
  padding: "8px 12px",
  textAlign: "left",
  font: "inherit",
  fontSize: 13,
  background: "#fff",
  borderRadius: 8,
  border: "1px solid rgba(20,40,60,0.08)",
  cursor: "pointer"
};

interface InboxMoreTodosProps {
  items: readonly InboxItem[];
}

export function InboxMoreTodos({ items }: InboxMoreTodosProps) {
  const navigate = useNavigate();

  if (items.length === 0) {
    return null;
  }

  const total = items.reduce((sum, item) => sum + item.count, 0);

  return (
    <details className="v3-section-shell" data-tone="muted" style={SHELL_STYLE} data-testid="inbox-more-todos">
      <summary style={SUMMARY_STYLE}>
        <span>📌 其他模块待办</span>
        <span style={COUNT_STYLE}>{total}</span>
        <Text type="secondary" style={{ fontSize: 12, fontWeight: 400 }}>
          分布在 {items.length} 个模块，需要时展开逐个处理
        </Text>
      </summary>
      <ul style={{ listStyle: "none", margin: "12px 0 0", padding: 0, display: "grid", gap: 8 }}>
        {items.map((item) => (
          <li key={item.key}>
            <button
              type="button"
              onClick={() => navigate(item.actionPath)}
              aria-label={`${item.label} ${item.count} 项，${item.hint}，前往处理`}
              style={{
                ...ROW_STYLE,
                borderLeft: `3px solid ${item.tone === "warning" ? "#dc2626" : "#2563eb"}`
              }}
            >
              <Text strong style={{ fontSize: 13 }}>{item.label}</Text>
              <Text
                type={item.tone === "warning" ? "danger" : "secondary"}
                style={{ fontSize: 12 }}
              >
                {item.count}
              </Text>
              <Text type="secondary" style={{ flex: 1, minWidth: 0, fontSize: 12 }}>{item.hint}</Text>
              <RightOutlined aria-hidden="true" style={{ color: "#64748b", fontSize: 11 }} />
            </button>
          </li>
        ))}
      </ul>
    </details>
  );
}
