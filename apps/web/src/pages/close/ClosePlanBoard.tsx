/**
 * 月结编排状态机 — 步骤看板（纯展示组件）。
 * 8 步固定顺序：清理未过账 → 计提折旧 → 权责发生制复核 → 票税一致性核对
 * → 结转损益 → 生成期末快照 → 生成申报底稿 → 归档锁账。
 * 前一步未 done，后续步骤恒为 blocked；in_review 需要人工确认/批准后才能推进。
 */
import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import { Steps, Tag, Space, Typography, Alert, Button } from "antd";
import {
  CheckCircleFilled, ClockCircleFilled, ExclamationCircleFilled,
  MinusCircleOutlined, RightOutlined,
} from "@ant-design/icons";
import { Term } from "../../components/ui/Term";
import { CLOSE_STEP_LINKS } from "./closeStepLinks";
import type { ClosePlanOverall, ClosePlanStepStatus, ClosePlanView } from "./closePlanTypes";

const { Text } = Typography;

/** 8 个结账步骤名词的术语化标题（按 step.key 匹配，未命中时回退后端 label）。 */
const STEP_TERM_TITLES: Record<string, ReactNode> = {
  sweep_unposted: <>清理未<Term k="posting">过账</Term>事项</>,
  depreciation: <><Term k="accrual">计提</Term><Term k="depreciation">折旧</Term></>,
  accrual_review: <><Term k="accrual-basis">权责发生制</Term>调整复核</>,
  tax_consistency: <><Term k="invoice-tax-consistency">票税一致性</Term>核对</>,
  close_income: <Term k="close-income">结转损益</Term>,
  snapshot: <>生成<Term k="period-snapshot">期末财务快照</Term></>,
  filing_draft: <>生成<Term k="working-paper">申报底稿</Term></>,
  archive: <><Term k="archive">归档</Term><Term k="period-lock">锁账</Term></>,
};

const STATUS_META: Record<ClosePlanStepStatus, { color: string; label: string; icon: ReactNode }> = {
  done:      { color: "success",    label: "已完成",   icon: <CheckCircleFilled style={{ color: "#16a34a" }} /> },
  ready:     { color: "processing", label: "可执行",   icon: <ClockCircleFilled style={{ color: "#2563eb" }} /> },
  in_review: { color: "gold",       label: "需人工确认", icon: <ExclamationCircleFilled style={{ color: "#d97706" }} /> },
  blocked:   { color: "default",    label: "未解锁",   icon: <MinusCircleOutlined style={{ color: "#9ca3af" }} /> },
};

const OVERALL_META: Record<ClosePlanOverall, { color: string; label: string; hint: string }> = {
  not_started: { color: "default", label: "尚未开始", hint: "按顺序完成各步，前置未完成则后续步骤锁定。" },
  in_progress: { color: "processing", label: "进行中", hint: "按顺序完成各步，前置未完成则后续步骤锁定。" },
  blocked:     { color: "gold", label: "待人工确认", hint: "存在需人工确认的步骤，处理后才能继续推进。" },
  completed:   { color: "success", label: "已完成", hint: "全部步骤已完成，本期结账流程走完。" },
};

interface ClosePlanBoardProps {
  plan: ClosePlanView;
}

export function ClosePlanBoard({ plan }: ClosePlanBoardProps) {
  const overallMeta = OVERALL_META[plan.overall];
  const currentIdx = plan.steps.findIndex((s) => s.status !== "done");

  return (
    <Space direction="vertical" size={20} style={{ width: "100%" }}>
      <Space align="center" size={12} wrap>
        <Tag color={overallMeta.color} style={{ fontSize: 13, padding: "2px 10px" }}>{overallMeta.label}</Tag>
        <Text type="secondary" style={{ fontSize: 13 }}>{overallMeta.hint}</Text>
      </Space>

      <Steps
        direction="vertical"
        size="small"
        current={currentIdx < 0 ? plan.steps.length : currentIdx}
        items={plan.steps.map((step) => {
          const meta = STATUS_META[step.status];
          const isNext = step.key === plan.nextActionableStep;
          const link = CLOSE_STEP_LINKS[step.key];
          return {
            icon: meta.icon,
            title: (
              <Space>
                <span style={{ fontWeight: isNext ? 600 : 400 }}>{STEP_TERM_TITLES[step.key] ?? step.label}</span>
                <Tag color={meta.color}>{meta.label}</Tag>
                {isNext && <Tag color="blue">下一步</Tag>}
              </Space>
            ),
            description: (
              <Space direction="vertical" size={4} style={{ paddingBottom: 4 }}>
                {step.status === "blocked" && (
                  <Text type="secondary" style={{ fontSize: 12 }}>
                    {step.blockingReason ?? "前置步骤未完成"}
                  </Text>
                )}
                {step.status === "in_review" && (
                  <Alert
                    type="warning"
                    showIcon
                    message={step.blockingReason ?? "需人工确认后才能推进"}
                    style={{ maxWidth: 480 }}
                  />
                )}
                {link && step.status !== "blocked" && step.status !== "done" && (
                  <Link to={link.path}>
                    <Button type="link" size="small" style={{ padding: 0 }}>
                      {link.cta} <RightOutlined />
                    </Button>
                  </Link>
                )}
              </Space>
            ),
          };
        })}
      />
    </Space>
  );
}
