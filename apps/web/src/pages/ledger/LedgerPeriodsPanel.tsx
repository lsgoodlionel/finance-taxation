import { Modal, Table, Tag, Typography, Button, Input, Space, Alert } from "antd";
import { LockOutlined, UnlockOutlined } from "@ant-design/icons";
import type { ColumnsType } from "antd/es/table";
import { DataTableShell } from "../../components/ui/DataTableShell";
import { EmptyState } from "../../components/ui/EmptyState";
import type { AccountingPeriod } from "../../lib/api";

const { Text } = Typography;

type LedgerPeriodsPanelProps = {
  periods: AccountingPeriod[];
  newPeriod: string;
  periodOp: string | null;
  onNewPeriodChange: (value: string) => void;
  onLockNew: () => void;
  onLock: (period: string) => void;
  onUnlock: (period: string) => void;
};

function confirmLock(period: string, onConfirm: () => void) {
  Modal.confirm({
    title: `锁定会计期间 ${period}`,
    content: (
      <div style={{ lineHeight: 1.7 }}>
        <p>锁账后，该会计期间内的凭证将<strong>无法过账</strong>，防止账期关闭后的数据篡改。</p>
        <p style={{ color: "#dc2626", marginBottom: 0 }}>此操作不可在无授权情况下自动回退，请谨慎确认。</p>
      </div>
    ),
    okText: "确认锁账",
    okButtonProps: { danger: true },
    cancelText: "取消",
    onOk: onConfirm,
  });
}

function confirmUnlock(period: string, onConfirm: () => void) {
  Modal.confirm({
    title: `解锁会计期间 ${period}`,
    content: (
      <div style={{ lineHeight: 1.7 }}>
        <p>解锁后，该会计期间内可以重新过账，存在数据被修改的风险。</p>
        <p style={{ color: "#d97706", marginBottom: 0 }}>建议仅在错误修正时解锁，操作后应及时重新锁账。</p>
      </div>
    ),
    okText: "确认解锁",
    cancelText: "取消",
    onOk: onConfirm,
  });
}

export function LedgerPeriodsPanel(props: LedgerPeriodsPanelProps) {
  const { periods, newPeriod, periodOp, onNewPeriodChange, onLockNew, onLock, onUnlock } = props;

  const columns: ColumnsType<AccountingPeriod> = [
    {
      title: "会计期间",
      dataIndex: "period",
      key: "period",
      render: (v: string) => <Text strong>{v}</Text>,
    },
    {
      title: "状态",
      key: "status",
      render: (_, row) =>
        row.isLocked ? (
          <Tag icon={<LockOutlined />} color="error">已锁账</Tag>
        ) : (
          <Tag icon={<UnlockOutlined />} color="success">未锁账</Tag>
        ),
    },
    {
      title: "锁定时间",
      dataIndex: "lockedAt",
      key: "lockedAt",
      render: (v: string | null) =>
        v ? (
          <Text type="secondary" style={{ fontSize: 12 }}>
            {v.slice(0, 16).replace("T", " ")}
          </Text>
        ) : (
          <Text type="secondary">—</Text>
        ),
    },
    {
      title: "操作人",
      dataIndex: "lockedBy",
      key: "lockedBy",
      render: (v: string | null) => <Text type="secondary">{v ?? "—"}</Text>,
    },
    {
      title: "操作",
      key: "action",
      render: (_, row) =>
        row.isLocked ? (
          <Button
            size="small"
            icon={<UnlockOutlined />}
            loading={periodOp === row.period}
            onClick={() => confirmUnlock(row.period, () => onUnlock(row.period))}
          >
            解锁
          </Button>
        ) : (
          <Button
            size="small"
            danger
            icon={<LockOutlined />}
            loading={periodOp === row.period}
            onClick={() => confirmLock(row.period, () => onLock(row.period))}
          >
            锁账
          </Button>
        ),
    },
  ];

  return (
    <div style={{ display: "grid", gap: 24 }}>
      <DataTableShell
        title="新增锁账期间"
        actions={(
          <span className="v3-banner" data-tone="warning" style={{ padding: "6px 10px", fontSize: "12px" }}>
            待管理期间：{periods.length}
          </span>
        )}
      >
        <div style={{ display: "grid", gap: 12 }}>
          <Alert
            type="warning"
            showIcon
            message="锁账前请确认该期间内的凭证均已复核完毕，锁账后凭证无法过账。"
            style={{ fontSize: 13 }}
          />
          <Space wrap size={10}>
            <Input
              value={newPeriod}
              onChange={(e) => onNewPeriodChange(e.target.value)}
              placeholder="输入期间 YYYY-MM，如 2026-05"
              style={{ width: 220 }}
              status={newPeriod && !/^\d{4}-\d{2}$/.test(newPeriod) ? "error" : undefined}
            />
            <Button
              type="primary"
              danger
              icon={<LockOutlined />}
              disabled={!newPeriod || !/^\d{4}-\d{2}$/.test(newPeriod)}
              loading={periodOp !== null}
              onClick={() => {
                if (newPeriod) {
                  confirmLock(newPeriod, onLockNew);
                }
              }}
            >
              锁定该期间
            </Button>
          </Space>
        </div>
      </DataTableShell>

      <DataTableShell
        title={`期间列表${periods.length > 0 ? `（${periods.length} 个）` : ""}`}
        actions={(
          <span className="v3-banner" data-tone="warning" style={{ padding: "6px 10px", fontSize: "12px" }}>
            已锁账期间：{periods.filter((period) => period.isLocked).length}
          </span>
        )}
      >
        <p className="v3-section-description" style={{ marginBottom: "12px" }}>
          锁账状态会直接影响该期间凭证是否允许继续过账，操作前应先确认影响范围。
        </p>
        {periods.length === 0 ? (
          <EmptyState
            title="暂无已锁定期间"
            description="进入该场景后会加载已存在的期间记录，当前可先新增一个待锁账期间。"
          />
        ) : (
          <Table<AccountingPeriod>
            dataSource={periods}
            columns={columns}
            rowKey="id"
            size="small"
            pagination={false}
            style={{ fontSize: 13 }}
            scroll={{ x: 760 }}
          />
        )}
      </DataTableShell>
    </div>
  );
}
