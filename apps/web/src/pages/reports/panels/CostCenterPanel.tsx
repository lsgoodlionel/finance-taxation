/**
 * 部门费用报表（V12-D1 前端）。
 *
 * 成本中心的建档也放在这里：用户是在看「哪个部门花了多少」时才发现少一个
 * 成本中心的，让他为此跳去另一个页面再跳回来，多半就不建了——于是费用继续
 * 堆在「未指定」里。
 */
import { useCallback, useEffect, useState } from "react";
import { Alert, Button, Card, Form, Input, Modal, Space, Table, Tag, Typography } from "antd";
import { PlusOutlined, ReloadOutlined } from "@ant-design/icons";
import { toast } from "sonner";
import { Term } from "../../../components/ui/Term";
import { usePeriod } from "../../../lib/period-context";
import {
  createCostCenter,
  getCostCenterReport,
  listCostCenters,
  type CostCenter,
  type CostCenterReportRow
} from "../../../lib/api";
import { errorMessage } from "../../../lib/errors";

export function CostCenterPanel() {
  const { period } = usePeriod();
  const [rows, setRows] = useState<CostCenterReportRow[]>([]);
  const [total, setTotal] = useState("0.00");
  const [unassigned, setUnassigned] = useState("0.00");
  const [notice, setNotice] = useState<string | null>(null);
  const [centers, setCenters] = useState<CostCenter[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [form] = Form.useForm();

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [report, centerList] = await Promise.all([
        getCostCenterReport(period),
        listCostCenters()
      ]);
      setRows(report.rows);
      setTotal(report.total);
      setUnassigned(report.unassigned);
      setNotice(report.unassignedNotice);
      setCenters(centerList.items);
    } catch (err) {
      const message = errorMessage(err, "加载部门费用报表失败");
      setError(message);
      toast.error(message);
    } finally {
      setLoading(false);
    }
  }, [period]);

  useEffect(() => {
    void load();
  }, [load]);

  const handleCreate = useCallback(async () => {
    try {
      const values = await form.validateFields();
      await createCostCenter(values);
      toast.success(`成本中心「${values.name}」已建立，可在录凭证时选用`);
      setCreateOpen(false);
      form.resetFields();
      await load();
    } catch (err) {
      if (err && typeof err === "object" && "errorFields" in err) return;
      toast.error(errorMessage(err, "新建成本中心失败"));
    }
  }, [form, load]);

  return (
    <div style={{ display: "grid", gap: 16 }}>
      {error ? (
        <Alert
          type="error"
          showIcon
          message="加载部门费用报表失败"
          description={error}
          action={<Button size="small" onClick={() => void load()}>重试</Button>}
        />
      ) : null}

      {/* 未指定的提示由后端按阈值给出，前端不重复判断比例 */}
      {notice ? (
        <Alert
          type={notice.includes("不足以支撑分析") ? "warning" : "info"}
          showIcon
          message="有费用未归口到成本中心"
          description={notice}
        />
      ) : null}

      <Card
        title={`${period} 部门费用`}
        extra={
          <Space>
            <Button icon={<ReloadOutlined />} loading={loading} onClick={() => void load()}>
              刷新
            </Button>
            <Button type="primary" icon={<PlusOutlined />} onClick={() => setCreateOpen(true)}>
              新建成本中心
            </Button>
          </Space>
        }
        style={{ borderRadius: 12 }}
      >
        <Space size={48} wrap style={{ marginBottom: 16 }}>
          <div>
            <Typography.Text type="secondary">本期费用合计</Typography.Text>
            <div style={{ fontSize: 24, fontWeight: 600 }}>{total}</div>
          </div>
          <div>
            <Typography.Text type="secondary">其中未指定成本中心</Typography.Text>
            <div
              style={{
                fontSize: 24,
                fontWeight: 600,
                color: Number(unassigned) > 0 ? "#cf1322" : undefined
              }}
            >
              {unassigned}
            </div>
          </div>
        </Space>

        <Typography.Paragraph type="secondary" style={{ marginBottom: 16 }}>
          费用按<Term k="voucher">凭证</Term>上填写的成本中心归集。未指定的单独列一行——既不丢弃（丢了各部门
          合计就对不上总额）也不按比例摊派（那会让一笔无人认领的费用变成每个部门都要背
          的数字）。<Term k="close-income">结转损益</Term>产生的<Term k="journal-entry">分录</Term>不计入本期费用。
        </Typography.Paragraph>

        <Table
          rowKey={(row) => row.costCenterId ?? "__unassigned__"}
          size="small"
          loading={loading}
          dataSource={rows}
          pagination={{ pageSize: 20, hideOnSinglePage: true }}
          expandable={{
            expandedRowRender: (row) => (
              <Table
                rowKey="accountCode"
                size="small"
                pagination={false}
                dataSource={row.accounts}
                columns={[
                  { title: "科目", dataIndex: "accountCode", width: 120 },
                  { title: "科目名称", dataIndex: "accountName" },
                  { title: "金额", dataIndex: "amount", align: "right" as const, width: 140 }
                ]}
              />
            )
          }}
          columns={[
            {
              title: "成本中心",
              dataIndex: "costCenterName",
              render: (name: string, row: CostCenterReportRow) =>
                row.costCenterId === null ? <Tag color="orange">{name}</Tag> : name
            },
            { title: "费用合计", dataIndex: "total", align: "right" as const, width: 140 },
            {
              title: "占比",
              dataIndex: "share",
              align: "right" as const,
              width: 100,
              render: (share: number) => `${(share * 100).toFixed(1)}%`
            },
            {
              title: "科目数",
              width: 90,
              align: "right" as const,
              render: (_: unknown, row: CostCenterReportRow) => row.accounts.length
            }
          ]}
          locale={{
            emptyText:
              centers.length === 0
                ? "还没有成本中心。新建后在录凭证时选择，费用就能按部门归集。"
                : "本期没有费用发生额。"
          }}
        />
      </Card>

      <Modal
        open={createOpen}
        title="新建成本中心"
        okText="建立"
        onOk={() => void handleCreate()}
        onCancel={() => setCreateOpen(false)}
        destroyOnClose
      >
        <Form form={form} layout="vertical" preserve={false}>
          <Form.Item
            name="code"
            label="编码"
            rules={[{ required: true, message: "请填写编码" }]}
            extra="编码一旦使用就不会被回收——停用的成本中心仍占用它，历史分录还指着它。"
          >
            <Input placeholder="CC-SALES" />
          </Form.Item>
          <Form.Item name="name" label="名称" rules={[{ required: true, message: "请填写名称" }]}>
            <Input placeholder="销售部" />
          </Form.Item>
          <Form.Item name="notes" label="备注">
            <Input.TextArea rows={2} placeholder="如：含华东、华南两个区域" />
          </Form.Item>
          <Typography.Text type="secondary">
            成本中心是核算口径，与组织架构里的部门不必一一对应：可以更细（一个部门下的
            多条产品线），也可以更粗（几个部门合成一个归集口径）。
          </Typography.Text>
        </Form>
      </Modal>
    </div>
  );
}
