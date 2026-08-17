/**
 * 业财合规审核结果面板（V13-D5）。
 *
 * 与 `risk/engine.ts` 的风险清单同构：一条一行，带级别、说明与「哪一行出的问题」。
 *
 * ## 级别的呈现要让人一眼分得清「必须改」与「知道就行」
 *
 * - `block` 红色 + 「必须处理」——提交会被拒
 * - `escalate` 橙色 + 「需加签」——能提交，但会多一级审批
 * - `warn` 黄色 + 「提示」——能提交，审批人会看到
 *
 * 三者混在一起用同一个图标，用户会把 block 当成可以忽略的提示，
 * 然后在提交时撞墙。
 */

import React from "react";
import { Alert, List, Space, Tag, Typography } from "antd";
import {
  CheckCircleOutlined,
  CloseCircleOutlined,
  ExclamationCircleOutlined,
  WarningOutlined
} from "@ant-design/icons";
import type { AuditFinding, AuditOutcome, ControlLevel } from "../../lib/api-expense-control";

const LEVEL_META: Record<
  ControlLevel,
  { color: string; label: string; alertType: "success" | "info" | "warning" | "error"; icon: React.ReactNode }
> = {
  ok: {
    color: "green",
    label: "通过",
    alertType: "success",
    icon: <CheckCircleOutlined />
  },
  warn: {
    color: "gold",
    label: "提示",
    alertType: "warning",
    icon: <WarningOutlined />
  },
  escalate: {
    color: "orange",
    label: "需加签",
    alertType: "warning",
    icon: <ExclamationCircleOutlined />
  },
  block: {
    color: "red",
    label: "必须处理",
    alertType: "error",
    icon: <CloseCircleOutlined />
  }
};

/** 总体结论的一句话，说清楚「能不能提交」。 */
function summarize(level: ControlLevel, count: number): { message: string; description: string } {
  if (level === "ok") {
    return { message: "审核通过", description: "没有发现合规问题，可以提交。" };
  }
  if (level === "block") {
    return {
      message: `有 ${count} 项需要处理才能提交`,
      description: "红色的项必须改掉——提交会被拒绝。"
    };
  }
  if (level === "escalate") {
    return {
      message: "可以提交，但会多一级审批",
      description: "存在超标项，按制度需要额外一级审批人点头。"
    };
  }
  return {
    message: "可以提交，审批人会看到这些提示",
    description: "这些不阻断提交，但会随单据一起呈现给审批人。"
  };
}

export interface AuditPanelProps {
  outcome: AuditOutcome;
  /** 行 id → 行的展示名（如「住宿两晚」），让用户知道是哪一行。 */
  lineLabels?: Readonly<Record<string, string>>;
}

export function AuditPanel({ outcome, lineLabels }: AuditPanelProps) {
  const meta = LEVEL_META[outcome.level];
  const summary = summarize(outcome.level, outcome.findings.filter((f) => f.level === "block").length);

  return (
    <div>
      <Alert
        type={meta.alertType}
        showIcon
        message={summary.message}
        description={summary.description}
        style={{ marginBottom: outcome.findings.length > 0 ? 12 : 0 }}
      />

      {outcome.findings.length > 0 && (
        <List<AuditFinding>
          size="small"
          bordered
          dataSource={outcome.findings}
          renderItem={(finding) => {
            const itemMeta = LEVEL_META[finding.level];
            return (
              <List.Item>
                <Space align="start">
                  <Tag color={itemMeta.color} icon={itemMeta.icon}>
                    {itemMeta.label}
                  </Tag>
                  <div>
                    <Typography.Text>{finding.message}</Typography.Text>
                    {finding.lineId && lineLabels?.[finding.lineId] && (
                      // 一张单十几行时，只说「超标了」用户不知道改哪一行。
                      <Typography.Text type="secondary" style={{ marginLeft: 8, fontSize: 12 }}>
                        （{lineLabels[finding.lineId]}）
                      </Typography.Text>
                    )}
                  </div>
                </Space>
              </List.Item>
            );
          }}
        />
      )}
    </div>
  );
}
