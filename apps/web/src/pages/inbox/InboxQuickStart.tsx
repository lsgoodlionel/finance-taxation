/**
 * 收件箱 · 快速开始（新手引导清单）。
 *
 * 改造前它是首屏第 2 个平级区块，和「今天要处理什么」抢注意力：对已经上手的
 * 老用户，它讲的是另一件事；对新手，它才是唯一该做的事。
 *
 * 现在的处理：只在还有未完成项时出现，并且收进「今天的状况」这一块里的一行
 * 可折叠区——新手打开就是展开的（还有事没做完），做完最后一项后整块消失。
 */
import React from "react";
import { Row, Col, Typography } from "antd";
import { RightOutlined } from "@ant-design/icons";
import { useNavigate } from "react-router-dom";
import type { OnboardingChecklist } from "../../lib/onboarding-checklist";
import type { WorkspaceMode } from "../../lib/workspace-mode";

const { Text } = Typography;

const SUMMARY_STYLE: React.CSSProperties = {
  cursor: "pointer",
  display: "flex",
  alignItems: "center",
  gap: 8,
  fontSize: 13,
  fontWeight: 600,
  color: "#4d5d6c"
};

const ITEM_STYLE: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 10,
  padding: "10px 14px",
  width: "100%",
  textAlign: "left",
  font: "inherit",
  borderRadius: 10,
  border: "1px solid rgba(20,40,60,0.08)"
};

interface InboxQuickStartProps {
  checklist: OnboardingChecklist;
  mode: WorkspaceMode;
}

export function InboxQuickStart({ checklist, mode }: InboxQuickStartProps) {
  const navigate = useNavigate();

  return (
    <details open data-testid="inbox-quick-start">
      <summary style={SUMMARY_STYLE}>
        <span>🚀 快速开始（{checklist.doneCount}/{checklist.total} 已完成）</span>
        <Text type="secondary" style={{ fontSize: 12, fontWeight: 400 }}>
          {mode === "guided" ? "花几分钟做完这三件事，就能上手了" : "完成基础配置后即可顺畅跑通日常财税"}
        </Text>
      </summary>
      <Row gutter={[12, 12]} style={{ marginTop: 10 }}>
        {checklist.items.map((item) => (
          <Col key={item.key} xs={24} sm={12} lg={8}>
            <button
              type="button"
              disabled={item.done}
              onClick={() => !item.done && navigate(item.actionPath)}
              aria-label={`${item.done ? "已完成" : "待办"}：${item.label}${item.hint ? `，${item.hint}` : ""}`}
              style={{
                ...ITEM_STYLE,
                background: item.done ? "rgba(22,163,74,0.06)" : "#fff",
                cursor: item.done ? "default" : "pointer",
                opacity: item.done ? 0.75 : 1
              }}
            >
              <span aria-hidden="true" style={{ fontSize: 16 }}>{item.done ? "✅" : "⬜"}</span>
              <div style={{ flex: 1, minWidth: 0 }}>
                <Text strong={!item.done} delete={item.done} style={{ fontSize: 13 }}>{item.label}</Text>
                {!item.done && <div style={{ fontSize: 11, color: "#64748b" }}>{item.hint}</div>}
              </div>
              {!item.done && <RightOutlined aria-hidden="true" style={{ color: "#64748b", fontSize: 11 }} />}
            </button>
          </Col>
        ))}
      </Row>
    </details>
  );
}
