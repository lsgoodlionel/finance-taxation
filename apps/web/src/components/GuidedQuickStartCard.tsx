/**
 * guided 新手快速开始卡（K4 场景引导 v3）
 * 白话三件事：完善公司信息 → 传第一张票据 → 问 AI 一个问题。
 * 自带数据加载（/api/setup/status + localStorage 本地标记），供 /home 老板工作台挂载。
 * 仅 guided 模式渲染；三件事全部完成后自动隐藏。
 */
import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Card, Typography } from "antd";
import { RightOutlined } from "@ant-design/icons";
import { getSetupStatus } from "../lib/api";
import {
  buildOnboardingChecklist,
  readGuidedLocalFlags,
  type SetupStatus,
} from "../lib/onboarding-checklist";
import { useWorkspaceMode } from "../lib/workspace-mode";

const { Text } = Typography;

export function GuidedQuickStartCard() {
  const navigate = useNavigate();
  const { mode } = useWorkspaceMode();
  const [setup, setSetup] = useState<SetupStatus | null>(null);

  useEffect(() => {
    if (mode !== "guided") return;
    let cancelled = false;
    getSetupStatus()
      .then((data) => {
        if (!cancelled) setSetup(data);
      })
      .catch(() => {
        // setup 状态拉取失败时仍展示清单（公司信息项按未完成处理）
      });
    return () => {
      cancelled = true;
    };
  }, [mode]);

  if (mode !== "guided") return null;

  const checklist = buildOnboardingChecklist(setup, "guided", readGuidedLocalFlags());
  if (!checklist || checklist.ready) return null;

  return (
    <Card
      title={`🚀 三步上手（${checklist.doneCount}/${checklist.total} 已完成）`}
      style={{ borderRadius: 12 }}
      styles={{ body: { padding: "12px 16px", display: "grid", gap: 10 } }}
    >
      {checklist.items.map((item) => (
        <button
          key={item.key}
          type="button"
          onClick={() => !item.done && navigate(item.actionPath)}
          style={{
            display: "flex", alignItems: "center", gap: 10, padding: "10px 14px",
            borderRadius: 10, border: "1px solid rgba(20,40,60,0.08)", textAlign: "left",
            background: item.done ? "rgba(22,163,74,0.06)" : "#fff",
            cursor: item.done ? "default" : "pointer", opacity: item.done ? 0.75 : 1,
          }}
        >
          <span style={{ fontSize: 16 }}>{item.done ? "✅" : "⬜"}</span>
          <span style={{ flex: 1, minWidth: 0 }}>
            <Text strong={!item.done} delete={item.done} style={{ fontSize: 13 }}>{item.label}</Text>
            {!item.done && (
              <span style={{ display: "block", fontSize: 11, color: "#94a3b8" }}>{item.hint}</span>
            )}
          </span>
          {!item.done && <RightOutlined style={{ color: "#94a3b8", fontSize: 11 }} />}
        </button>
      ))}
    </Card>
  );
}
