import { Button, Input, Space, Table, Tag } from "antd";
import { BankOutlined } from "@ant-design/icons";
import type { PayrollTransferBatch } from "../../lib/api";
import { STATUS_TAG } from "./transfer-status";

export interface TransferBatchListCardProps {
  batches: PayrollTransferBatch[];
  selectedBatchId: string | null;
  genPeriod: string;
  busy: boolean;
  onGenPeriodChange: (value: string) => void;
  onGenerate: () => Promise<void>;
  onSelectBatch: (id: string) => Promise<void>;
}

export function TransferBatchListCard({
  batches,
  selectedBatchId,
  genPeriod,
  busy,
  onGenPeriodChange,
  onGenerate,
  onSelectBatch
}: TransferBatchListCardProps) {
  return (
    <div className="v3-workbench-card">
      <section className="v3-section-shell">
        <Space direction="vertical" size={16} style={{ width: "100%" }}>
          <Space.Compact style={{ width: "100%" }}>
            <Input addonBefore="期间" value={genPeriod} onChange={e => onGenPeriodChange(e.target.value)} placeholder="YYYY-MM" />
            <Button type="primary" loading={busy} icon={<BankOutlined />} onClick={() => void onGenerate()}>生成代发批次</Button>
          </Space.Compact>
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
