import React from "react";
import { Alert, Button, Empty, Space, Table, Tag, Typography } from "antd";
import { ExperimentOutlined } from "@ant-design/icons";
import type { RndAccountingTreatment, RndCostLineType } from "@finance-taxation/domain-model";
import type { RndProjectDetail } from "../../lib/api";
import { ACCOUNTING_TREATMENT_LABELS, COST_TYPE_LABELS, useI18n } from "../../lib/i18n";
import { parseAmount } from "./rnd-tasks";

const { Text } = Typography;

type CostLine = RndProjectDetail["costLines"][number];

interface RndCostPanelProps {
  project: RndProjectDetail | null;
  onOpenWizard: () => void;
}

/**
 * 「归集这个项目的研发费用」的工作区。
 *
 * 改造前这一屏是右半边一张「项目详情」卡：8 行 Descriptions（项目名 / 编号 /
 * 开始日期 / 资本化政策 / 费用化 / 资本化 / 加计扣除基数 / 累计工时）+ 政策风险
 * Alert + 政策建议列表，三段挤在一起，而已经归集了哪些费用（costLines）根本没显示，
 * 用户只能看到合计数、看不到构成。现在这件事只讲费用：已归集明细 + 继续归集的入口；
 * 项目属性与基数分别归到 aside 和「核对加计扣除」那件事。
 */
export function RndCostPanel({ project, onOpenWizard }: RndCostPanelProps) {
  const { t } = useI18n();

  if (!project) {
    return (
      <Empty
        image={Empty.PRESENTED_IMAGE_SIMPLE}
        description="先在「挑一个研发项目」里选中一个项目，再回到这里归集费用。"
      />
    );
  }

  const costLines = project.costLines ?? [];
  const expensed = parseAmount(project.summary.expenseAmount);
  const capitalized = parseAmount(project.summary.capitalizedAmount);

  return (
    <Space direction="vertical" size={16} style={{ width: "100%" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12 }}>
        <div>
          <Text strong style={{ fontSize: 14 }}>{project.name}</Text>
          <div style={{ fontSize: 12, color: "#94a3b8" }}>
            {project.code} · 已归集 {costLines.length} 条 · 费用化 ¥{expensed.toLocaleString()} · 资本化 ¥
            {capitalized.toLocaleString()}
          </div>
        </div>
        <Button type="primary" icon={<ExperimentOutlined />} onClick={onOpenWizard}>
          继续归集费用
        </Button>
      </div>

      {/* 费用化 / 资本化的区别直接影响能不能加计扣除，放在录入入口旁边说清楚。 */}
      <Alert
        type="info"
        showIcon
        message="只有费用化部分进加计扣除基数"
        description="资本化部分先形成无形资产、按期摊销，不计入本期加计扣除基数。归集时选错会直接改变可扣除金额。"
      />

      {project.policyReview.conflicts.length > 0 && (
        <Alert
          type="warning"
          showIcon
          message="归集前先处理政策合规风险"
          description={
            <ul style={{ margin: "6px 0 0 16px", padding: 0 }}>
              {project.policyReview.conflicts.map((conflict) => (
                <li key={conflict}>{conflict}</li>
              ))}
            </ul>
          }
        />
      )}

      {costLines.length === 0 ? (
        <Empty
          image={Empty.PRESENTED_IMAGE_SIMPLE}
          description="这个项目还没有归集任何费用，点击「继续归集费用」开始。"
        />
      ) : (
        <Table<CostLine>
          dataSource={costLines}
          rowKey="id"
          size="small"
          pagination={{ hideOnSinglePage: true, size: "small" }}
          columns={[
            {
              title: "类别",
              dataIndex: "costType",
              key: "costType",
              render: (value: string) => t(COST_TYPE_LABELS, value as RndCostLineType)
            },
            {
              title: "会计处理",
              dataIndex: "accountingTreatment",
              key: "accountingTreatment",
              width: 100,
              render: (value: string) => (
                <Tag color={value === "expensed" ? "blue" : "purple"}>
                  {t(ACCOUNTING_TREATMENT_LABELS, value as RndAccountingTreatment)}
                </Tag>
              )
            },
            {
              title: "金额",
              dataIndex: "amount",
              key: "amount",
              width: 120,
              align: "right",
              render: (value: string) => (
                <Text style={{ fontFamily: "monospace", fontSize: 12 }}>
                  ¥{parseAmount(value).toLocaleString()}
                </Text>
              )
            },
            { title: "发生日期", dataIndex: "occurredOn", key: "occurredOn", width: 110 },
            { title: "备注", dataIndex: "notes", key: "notes" }
          ]}
        />
      )}
    </Space>
  );
}
