import { Modal, Table, Tag, Typography, Button, Input, Space, Alert } from "antd";
import { LockOutlined, UnlockOutlined } from "@ant-design/icons";
import type { ColumnsType } from "antd/es/table";
import { DataTableShell } from "../../components/ui/DataTableShell";
import { EmptyState } from "../../components/ui/EmptyState";
import { Term } from "../../components/ui/Term";
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
  /** 结转损益。月结向导「结转损益」这一步就是把人引到这里。 */
  onCloseIncome: (period: string) => void;
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

function confirmCloseIncome(period: string, onConfirm: () => void) {
  Modal.confirm({
    title: `结转 ${period} 的损益`,
    content: (
      <div style={{ lineHeight: 1.7 }}>
        <p>
          把这个月的收入、成本、费用类科目（6xxx）结平到<strong>本年利润</strong>，
          生成一张结转凭证<strong>草稿</strong>——复核过账之后才真的入账。
        </p>
        <p style={{ marginBottom: 0, color: "#6b7280" }}>
          已经结转过的属期再点一次不会重复生成，只会告诉你「已结转」。
        </p>
      </div>
    ),
    okText: "生成结转凭证",
    cancelText: "取消",
    onOk: onConfirm,
  });
}

export function LedgerPeriodsPanel(props: LedgerPeriodsPanelProps) {
  const { periods, newPeriod, periodOp, onNewPeriodChange, onLockNew, onLock, onUnlock, onCloseIncome } =
    props;

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
      render: (_, row) => (
        <Space size={4}>
          {/* 锁了的期间不给结转入口：结转要写分录，写不进去。 */}
          {!row.isLocked && (
            <Button
              size="small"
              loading={periodOp === row.period}
              onClick={() => confirmCloseIncome(row.period, () => onCloseIncome(row.period))}
            >
              结转损益
            </Button>
          )}
          {row.isLocked ? (
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
        )}
        </Space>
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
          <Term k="period-lock">锁账</Term>状态会直接影响该期间<Term k="voucher">凭证</Term>是否允许继续<Term k="posting">过账</Term>，操作前应先确认影响范围。
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
