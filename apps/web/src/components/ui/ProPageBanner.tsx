/**
 * guided「这是财务专业页面」兜底横幅（V8 车道 C）
 *
 * 背景：guided（老板/员工）用户可以通过 ⌘K 场景命令、深链、通知跳转等方式落到尚未分轨的
 * 财务专业页（总账 / 税务 / 结账 / 风险 …）。逐页做双轨成本极高，先用统一横幅兜底：
 * 告诉用户「你没走错，这页确实是给财务看的」，并给出两个明确出口。
 *
 * 仅 guided 模式渲染；pro 模式与 Provider 之外（安全回退 pro）一律返回 null。
 */
import React from "react";
import { Button, Typography } from "antd";
import { useNavigate } from "react-router-dom";
import { InfoCircleOutlined } from "@ant-design/icons";
import { useWorkspaceMode } from "../../lib/workspace-mode";

const { Text } = Typography;

/** 默认返回落点：guided 用户的主工作台。 */
const DEFAULT_BACK_TO = "/home";
/** 「问 AI」出口固定指向 AI 助手页。 */
const ASSISTANT_PATH = "/assistant";
/** 所有专业页共用的一句安抚语（避免老板以为自己操作错了）。 */
const REASSURANCE_TEXT = "看不懂是正常的：这页平时由财务同事操作，您一般不需要在这里改动什么。";

export interface ProPageBannerProps {
  /** 当前页的名字，如「总账中心」，用于「这是财务专业页面 · 总账中心」 */
  pageName: string;
  /** 白话解释这页在做什么、老板通常不需要在这里操作什么（每页应各写各的） */
  plain: string;
  /** 「回今天」的目标路由，缺省 /home */
  backTo?: string;
}

/** 横幅内容（不含模式判断），便于独立测试与复用。 */
export function ProPageBannerContent({ pageName, plain, backTo = DEFAULT_BACK_TO }: ProPageBannerProps) {
  const navigate = useNavigate();
  return (
    <div
      role="note"
      aria-label="专业页面提示"
      style={{
        display: "flex",
        flexWrap: "wrap",
        alignItems: "center",
        justifyContent: "space-between",
        gap: 12,
        padding: "12px 16px",
        borderRadius: 12,
        marginBottom: 16,
        border: "1px solid rgba(217,119,6,0.22)",
        background: "rgba(217,119,6,0.06)",
      }}
    >
      <div style={{ display: "flex", alignItems: "flex-start", gap: 8, flex: "1 1 260px", minWidth: 0 }}>
        <InfoCircleOutlined aria-hidden style={{ color: "#d97706", fontSize: 14, marginTop: 4 }} />
        <div style={{ display: "grid", gap: 4, minWidth: 0 }}>
          <Text strong style={{ fontSize: 13 }}>{`这是财务专业页面 · ${pageName}`}</Text>
          <Text type="secondary" style={{ fontSize: 12 }}>{plain}</Text>
          <Text type="secondary" style={{ fontSize: 12 }}>{REASSURANCE_TEXT}</Text>
        </div>
      </div>
      <span style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
        <Button size="small" onClick={() => navigate(backTo)}>
          回今天
        </Button>
        <Button size="small" onClick={() => navigate(ASSISTANT_PATH)}>
          问 AI
        </Button>
      </span>
    </div>
  );
}

/** guided 模式才渲染的专业页兜底横幅；pro 模式返回 null。 */
export function ProPageBanner(props: ProPageBannerProps) {
  const { mode } = useWorkspaceMode();
  if (mode !== "guided") return null;
  return <ProPageBannerContent {...props} />;
}
