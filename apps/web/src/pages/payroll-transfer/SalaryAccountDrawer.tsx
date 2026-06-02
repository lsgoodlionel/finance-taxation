/**
 * 工资账号批量维护抽屉（P1-6）
 * 一张表里批量录入/修改员工工资卡号与开户行，保存后代发批次即可正常生成。
 */
import { useEffect, useState } from "react";
import { Drawer, Table, Input, Button, Space, Tag, Typography } from "antd";
import { toast } from "sonner";
import type { Employee } from "@finance-taxation/domain-model";
import { listEmployees, updateSalaryAccounts } from "../../lib/api";

const { Text } = Typography;

type Row = { id: string; name: string; account: string; bank: string };

export function SalaryAccountDrawer({
  open,
  onClose,
  onSaved,
}: {
  open: boolean;
  onClose: () => void;
  onSaved?: () => void;
}) {
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    setLoading(true);
    listEmployees()
      .then((data) => {
        setRows((data.items as Employee[])
          .filter((e) => e.status === "active")
          .map((e) => ({ id: e.id, name: e.name, account: e.salaryAccount ?? "", bank: e.salaryBank ?? "" })));
      })
      .catch((err) => toast.error((err as Error).message))
      .finally(() => setLoading(false));
  }, [open]);

  function edit(id: string, field: "account" | "bank", value: string) {
    setRows((prev) => prev.map((r) => (r.id === id ? { ...r, [field]: value } : r)));
  }

  async function handleSave() {
    setSaving(true);
    try {
      const r = await updateSalaryAccounts(rows.map((x) => ({
        employeeId: x.id, salaryAccount: x.account, salaryBank: x.bank,
      })));
      toast.success(`已更新 ${r.updated} 名员工的工资账号`);
      onSaved?.();
      onClose();
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setSaving(false);
    }
  }

  const missing = rows.filter((r) => !r.account.trim()).length;

  return (
    <Drawer
      title="维护员工工资账号"
      width={620}
      open={open}
      onClose={onClose}
      extra={<Button type="primary" loading={saving} onClick={() => void handleSave()}>保存</Button>}
    >
      <Space direction="vertical" size={12} style={{ width: "100%" }}>
        <Text type="secondary" style={{ fontSize: 12 }}>
          代发批次依据工资卡号生成；缺账号的员工会在批次中被跳过。
          {missing > 0 && <Tag color="orange" style={{ marginLeft: 8 }}>{missing} 人缺账号</Tag>}
        </Text>
        <Table<Row>
          size="small" rowKey="id" dataSource={rows} loading={loading} pagination={false}
          columns={[
            { title: "姓名", dataIndex: "name", width: 100 },
            {
              title: "工资卡号", dataIndex: "account",
              render: (v, r) => (
                <Input size="small" value={v} placeholder="请输入工资卡号"
                  status={!v.trim() ? "warning" : undefined}
                  onChange={(e) => edit(r.id, "account", e.target.value)} />
              ),
            },
            {
              title: "开户行", dataIndex: "bank", width: 160,
              render: (v, r) => (
                <Input size="small" value={v} placeholder="如：招商银行"
                  onChange={(e) => edit(r.id, "bank", e.target.value)} />
              ),
            },
          ]}
        />
      </Space>
    </Drawer>
  );
}
