import React from "react";
import { Alert, Button, Space, Table, Tag, Typography } from "antd";
import type { ColumnsType } from "antd/es/table";
import { RightOutlined } from "@ant-design/icons";
import type { RndProject, RndProjectSummary } from "@finance-taxation/domain-model";
import {
  RND_STATUS_PRESENTATION,
  buildRndProjectFlow,
  parseAmount,
  summarizeRndFlow,
  type RndFlowProgress
} from "./rnd-tasks";

const { Text } = Typography;

export type RndProjectRow = RndProject & { summary: RndProjectSummary };

const PROGRESS_COLOR: Record<RndFlowProgress["tone"], string> = {
  done: "green",
  blocked: "orange",
  in_progress: "blue"
};

function formatMoney(value: string): string {
  return `¥${parseAmount(value).toLocaleString()}`;
}

interface RndProjectListPanelProps {
  projects: readonly RndProjectRow[];
  selectedProjectId: string | null;
  onSelectProject: (projectId: string) => void;
  /** 选中项目并直接跳到「归集费用」那件事。 */
  onCollectCosts: (projectId: string) => void;
}

export function RndProjectListPanel({
  projects,
  selectedProjectId,
  onSelectProject,
  onCollectCosts
}: RndProjectListPanelProps) {
  const columns: ColumnsType<RndProjectRow> = [
    {
      title: "项目名称",
      dataIndex: "name",
      key: "name",
      render: (name: string, record) => (
        <div>
          <Text strong style={{ fontSize: 13 }}>{name}</Text>
          <div style={{ fontSize: 11, color: "#94a3b8" }}>{record.code}</div>
        </div>
      )
    },
    {
      title: "状态",
      dataIndex: "status",
      key: "status",
      width: 90,
      render: (status: RndProject["status"]) => {
        const presentation = RND_STATUS_PRESENTATION[status];
        return <Tag color={presentation?.color ?? "default"}>{presentation?.label ?? status}</Tag>;
      }
    },
    {
      // 列表的重点从「有多少钱」改成「这一笔走到哪了」：钱的明细在下一件事里看，
      // 在这里先回答「我该动哪个项目」。
      title: "走到哪了",
      key: "progress",
      width: 150,
      render: (_: unknown, record) => {
        const progress = summarizeRndFlow(
          buildRndProjectFlow({
            startedOn: record.startedOn,
            businessEventId: record.businessEventId,
            summary: record.summary
          })
        );
        return <Tag color={PROGRESS_COLOR[progress.tone]}>{progress.text}</Tag>;
      }
    },
    {
      title: "费用化",
      key: "expensed",
      width: 110,
      align: "right",
      render: (_: unknown, record) => (
        <Text style={{ fontFamily: "monospace", fontSize: 12 }}>{formatMoney(record.summary.expenseAmount)}</Text>
      )
    },
    {
      title: "可扣除基数",
      key: "eligible",
      width: 120,
      align: "right",
      render: (_: unknown, record) => (
        <Text strong style={{ fontFamily: "monospace", fontSize: 12, color: "#16a34a" }}>
          {formatMoney(record.summary.superDeductionEligibleBase)}
        </Text>
      )
    },
    {
      title: "操作",
      key: "actions",
      width: 130,
      render: (_: unknown, record) => (
        <Space size={4}>
          <Button size="small" type="link" onClick={() => onSelectProject(record.id)}>
            选中 <RightOutlined />
          </Button>
          <Button size="small" onClick={() => onCollectCosts(record.id)}>
            归集费用
          </Button>
        </Space>
      )
    }
  ];

  if (projects.length === 0) {
    return (
      <Alert
        type="info"
        showIcon
        message="还没有研发项目"
        description="点击右上角「新建研发项目」立项后，才能开始归集费用、形成加计扣除基数。"
      />
    );
  }

  return (
    <Table
      dataSource={projects as RndProjectRow[]}
      columns={columns}
      rowKey="id"
      size="small"
      pagination={{ hideOnSinglePage: true, size: "small" }}
      rowClassName={(record) => (record.id === selectedProjectId ? "ant-table-row-selected" : "")}
      onRow={(record) => ({
        style: { cursor: "pointer" },
        onClick: () => onSelectProject(record.id)
      })}
    />
  );
}
