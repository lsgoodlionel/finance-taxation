/**
 * 代发批次清单 + 生成入口。
 *
 * V10 收口：原来页面顶部单独占一块的三个 Statistic（代发批次数 / 累计代发金额 /
 * 已代发批次数）并进了这里的表头汇总行。理由是那三个数字讲的就是这张表本身，
 * 分成两块只是让用户先看一遍数字、再往下滚一屏找对应的表。
 * 「维护工资账号」按钮同样并进本卡的工具行——它是「生成批次」的前置条件
 * （没账号的人会被跳过），放在生成按钮旁边才在该用到它的时候被看见。
 */
import { Button, Input, Space, Table, Tag, Typography } from "antd";
import { BankOutlined } from "@ant-design/icons";
import type { PayrollTransferBatch } from "../../lib/api";
import { STATUS_TAG } from "./transfer-status";

const { Text } = Typography;

/** 已走到「钱确实出去了」的状态。 */
const DISBURSED_STATUSES: readonly PayrollTransferBatch["status"][] = ["disbursed", "confirmed"];

export interface TransferBatchListCardProps {
  batches: PayrollTransferBatch[];
  selectedBatchId: string | null;
  genPeriod: string;
  busy: boolean;
  onGenPeriodChange: (value: string) => void;
  onGenerate: () => Promise<void>;
  onSelectBatch: (id: string) => Promise<void>;
  onOpenSalaryAccounts: () => void;
}

export function TransferBatchListCard({
  batches,
  selectedBatchId,
  genPeriod,
  busy,
  onGenPeriodChange,
  onGenerate,
  onSelectBatch,
  onOpenSalaryAccounts
}: TransferBatchListCardProps) {
  const totalAmount = batches.reduce((sum, batch) => sum + Number(batch.total_amount), 0);
  const disbursedCount = batches.filter((batch) => DISBURSED_STATUSES.includes(batch.status)).length;

  return (
    <div className="v3-workbench-card">
      <section className="v3-section-shell">
        <Space direction="vertical" size={16} style={{ width: "100%" }}>
          <Space.Compact style={{ width: "100%" }}>
            <Input addonBefore="期间" value={genPeriod} onChange={e => onGenPeriodChange(e.target.value)} placeholder="YYYY-MM" />
            <Button type="primary" loading={busy} icon={<BankOutlined />} onClick={() => void onGenerate()}>生成代发批次</Button>
            <Button onClick={onOpenSalaryAccounts}>维护工资账号</Button>
          </Space.Compact>
          <Text type="secondary" style={{ fontSize: 12 }}>
            共 {batches.length} 个批次，累计 ¥{totalAmount.toFixed(2)}，其中 {disbursedCount} 个已代发。
          </Text>
          <Table<PayrollTransferBatch>
            size="small" rowKey="id" dataSource={batches} pagination={false}
            onRow={(r) => ({ onClick: () => void onSelectBatch(r.id), style: { cursor: "pointer", background: r.id === selectedBatchId ? "rgba(79,142,247,0.08)" : undefined } })}
            columns={[
              { title: "期间", dataIndex: "payroll_period" },
              { title: "人数", dataIndex: "employee_count", align: "center" },
              { title: "金额", dataIndex: "total_amount", align: "right", render: (v) => `¥${Number(v).toFixed(2)}` },
              { title: "状态", dataIndex: "status", render: (s) => <Tag color={STATUS_TAG[s]?.color}>{STATUS_TAG[s]?.label ?? s}</Tag> },
            ]}
            locale={{ emptyText: "暂无代发批次，输入期间生成" }}
          />
        </Space>
      </section>
    </div>
  );
}
