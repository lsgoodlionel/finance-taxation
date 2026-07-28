/**
 * 银行三张表的列定义（账户 / 流水 / 对账候选）。
 *
 * 从 BankingPage 抽出来：列定义占了主文件五分之一篇幅，却和页面状态无关——
 * 只有候选表的操作列要回调，用参数传进来即可。
 */
import React from "react";
import { Button, Popconfirm, Space, Tag, Typography } from "antd";
import type { ColumnsType } from "antd/es/table";
import type { BankAccount, BankStatement, ReconciliationCandidate } from "../../lib/api";

const { Text } = Typography;

export const MATCH_STATUS_COLOR: Record<string, string> = {
  unmatched: "warning", auto: "processing", manual: "success", excluded: "default",
};
export const MATCH_STATUS_LABELS: Record<string, string> = {
  unmatched: "未匹配", auto: "自动匹配", manual: "手动匹配", excluded: "已排除",
};

/** 评分到达这个分数就算「高分候选」，用绿色标出来。 */
const HIGH_SCORE_THRESHOLD = 85;

export type CandidateActions = {
  onConfirm: (candidateId: string) => void;
  onReject: (candidateId: string) => void;
};

export function buildAccountColumns(): ColumnsType<BankAccount> {
  return [
    { title: "银行名称", dataIndex: "bank_name", key: "bank" },
    { title: "账号", dataIndex: "account_no", key: "no",
      render: (v: string) => <Text style={{ fontFamily: "monospace", fontSize: 12 }}>{v}</Text> },
    { title: "户名", dataIndex: "account_name", key: "name" },
    { title: "币种", dataIndex: "currency", key: "currency", width: 70 },
    {
      title: "类型", key: "type", width: 130,
      render: (_: unknown, r: BankAccount) => (
        <Space size={4}>
          {r.is_primary && <Tag color="blue" style={{ fontSize: 10 }}>主账户</Tag>}
          {r.is_payroll && <Tag color="green" style={{ fontSize: 10 }}>工资代发</Tag>}
        </Space>
      ),
    },
  ];
}

export function buildStatementColumns(): ColumnsType<BankStatement> {
  return [
    {
      title: "交易日期", dataIndex: "transaction_date", key: "date", width: 110,
      render: (v: string) => <Text style={{ fontSize: 12 }}>{v}</Text>,
    },
    {
      title: "金额", dataIndex: "amount", key: "amount", width: 130, align: "right",
      render: (v: number) => (
        <Text strong style={{ fontSize: 13, color: v >= 0 ? "#16a34a" : "#dc2626", fontFamily: "monospace" }}>
          {v >= 0 ? "+" : ""}{Number(v).toLocaleString("zh-CN", { minimumFractionDigits: 2 })}
        </Text>
      ),
    },
    {
      title: "对方户名", dataIndex: "counterparty_name", key: "name",
      render: (v: string | null) => v || <Text type="secondary">—</Text>,
    },
    {
      title: "摘要", dataIndex: "description", key: "desc",
      render: (v: string | null) => <Text style={{ fontSize: 12 }}>{v ?? "—"}</Text>,
    },
    {
      title: "对账状态", dataIndex: "match_status", key: "match", width: 100,
      filters: ["unmatched", "auto", "manual", "excluded"].map(v => ({ text: MATCH_STATUS_LABELS[v]!, value: v })),
      onFilter: (val, r) => r.match_status === val,
      render: (v: string) => (
        <Tag color={MATCH_STATUS_COLOR[v] ?? "default"} style={{ fontSize: 11 }}>
          {MATCH_STATUS_LABELS[v] ?? v}
        </Tag>
      ),
    },
  ];
}

export function buildCandidateColumns(actions: CandidateActions): ColumnsType<ReconciliationCandidate> {
  return [
    {
      title: "流水日期", dataIndex: "stmt_date", key: "stmt_date", width: 110,
      render: (value: string) => <Text style={{ fontSize: 12 }}>{value}</Text>,
    },
    {
      title: "流水金额", dataIndex: "stmt_amount", key: "stmt_amount", width: 130, align: "right",
      render: (value: string) => {
        const amount = Number(value);
        return (
          <Text strong style={{ color: amount >= 0 ? "#16a34a" : "#dc2626", fontFamily: "monospace" }}>
            {amount >= 0 ? "+" : ""}{amount.toLocaleString("zh-CN", { minimumFractionDigits: 2 })}
          </Text>
        );
      },
    },
    {
      title: "流水摘要", dataIndex: "stmt_desc", key: "stmt_desc",
      render: (value: string | null) => <Text style={{ fontSize: 12 }}>{value ?? "—"}</Text>,
    },
    {
      title: "候选凭证", dataIndex: "voucher_summary", key: "voucher_summary",
      render: (value: string | null) => <Text>{value ?? "未关联凭证"}</Text>,
    },
    {
      title: "评分", dataIndex: "score", key: "score", width: 90,
      render: (value: number) => <Tag color={value >= HIGH_SCORE_THRESHOLD ? "green" : "gold"}>{value}</Tag>,
    },
    {
      title: "命中原因", dataIndex: "match_reasons", key: "match_reasons",
      render: (value: string[] | string) => {
        const items = Array.isArray(value) ? value : [];
        if (!items.length) return <Text type="secondary">—</Text>;
        return <Space size={[4, 4]} wrap>{items.map((item) => <Tag key={item}>{item}</Tag>)}</Space>;
      },
    },
    {
      title: "操作", key: "actions", width: 170,
      render: (_: unknown, record) => (
        <Space>
          <Button size="small" type="primary" onClick={() => actions.onConfirm(record.id)}>确认</Button>
          <Popconfirm
            title="驳回这条候选？"
            okText="驳回"
            cancelText="取消"
            onConfirm={() => actions.onReject(record.id)}
          >
            <Button size="small">驳回</Button>
          </Popconfirm>
        </Space>
      ),
    },
  ];
}

