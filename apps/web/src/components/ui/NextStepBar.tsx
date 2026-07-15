/**
 * guided「下一步」引导条（K4 场景引导 v3）
 * 挂在页面内容尾部：白话说明当前状态 + 建议的下一步动作按钮。
 * 例：「票已上传 → 下一步：等财务入账（无需您操作）」。
 * 仅 guided 模式渲染（pro 返回 null）；移动端按钮自动换行。
 */
import React from "react";
import { Button, Typography } from "antd";
import { useNavigate } from "react-router-dom";
import { RightOutlined } from "@ant-design/icons";
import { useWorkspaceMode } from "../../lib/workspace-mode";

const { Text } = Typography;

export interface NextStepAction {
  /** 白话动作名，如「看进展」 */
  label: string;
  /** 点击跳转的目标路由 */
  path: string;
  /** 一句话说明这个动作（展示在按钮下方/悬浮提示） */
  hint?: string;
}

export interface NextStepBarProps {
  /** 白话描述当前状态，如「事项已记录」 */
  current: string;
  /** 建议的下一步动作（可为多个） */
  next: NextStepAction[];
}

/** 引导条内容（不含模式判断），便于独立测试与复用。 */
export function NextStepBarContent({ current, next }: NextStepBarProps) {
  const navigate = useNavigate();
  return (
    <div
      role="note"
      aria-label="下一步建议"
      style={{
        display: "flex", flexWrap: "wrap", alignItems: "center", gap: 10,
        padding: "12px 16px", borderRadius: 12, marginTop: 16,
        border: "1px solid rgba(37,99,235,0.15)", background: "rgba(37,99,235,0.04)",
      }}
    >
      <Text strong style={{ fontSize: 13 }}>{current}</Text>
      {next.length > 0 && (
        <>
          <RightOutlined style={{ fontSize: 10, color: "#94a3b8" }} />
          <Text type="secondary" style={{ fontSize: 12 }}>下一步：</Text>
          <span style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
            {next.map((action) => (
              <Button
                key={`${action.label}-${action.path}`}
                size="small"
                title={action.hint}
                onClick={() => navigate(action.path)}
              >
                {action.label}
              </Button>
            ))}
          </span>
        </>
      )}
    </div>
  );
}

/** guided 模式才渲染的「下一步」条；pro 模式返回 null。 */
export function NextStepBar(props: NextStepBarProps) {
  const { mode } = useWorkspaceMode();
  if (mode !== "guided") return null;
  return <NextStepBarContent {...props} />;
}
