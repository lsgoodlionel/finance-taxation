/**
 * 银行存款余额调节表（路由 /banking/reconciliation，V12-C3 前端）。
 *
 * 不做成 /bills?tab=banking 的第四个页签：它是月结流程里的一个**步骤**，
 * 由月结向导的「银行对账」直接跳来，也需要能单独深链给审计看。
 */
import { useCallback, useState } from "react";
import {
  Alert,
  Button,
  Card,
  Checkbox,
  Descriptions,
  Form,
  Input,
  InputNumber,
  Result,
  Select,
  Space,
  Table,
  Tag,
  Typography
} from "antd";
import { useEffect } from "react";
import { toast } from "sonner";
import { PageHeader } from "../../components/ui/PageHeader";
import { ProPageBanner } from "../../components/ui/ProPageBanner";
import {
  closeBankReconciliation,
  getBalanceReconciliation,
  listBankAccounts,
  type BalanceReconciliationView,
  type ReconciliationItemView
} from "../../lib/api";

function errorMessage(err: unknown, fallback: string): string {
  return err instanceof Error ? err.message : fallback;
}

/** 四类未达账项的中文名，严格按会计口径（前者是记账方，后者是未入账方）。 */
const ITEM_TYPE_LABELS: Record<ReconciliationItemView["itemType"], string> = {
  book_only_receipt: "企业已收、银行未收（在途存款）",
  book_only_payment: "企业已付、银行未付（未兑付支票）",
  bank_only_receipt: "银行已收、企业未收（如代收利息）",
  bank_only_payment: "银行已付、企业未付（如银行扣费）"
};

interface BankAccountOption {
  id: string;
  bankName: string;
  accountNo: string;
}

export function BankReconciliationPage() {
  const [accounts, setAccounts] = useState<BankAccountOption[]>([]);
  const [view, setView] = useState<BalanceReconciliationView | null>(null);
  const [loading, setLoading] = useState(false);
  const [closing, setClosing] = useState(false);
  const [closedId, setClosedId] = useState<string | null>(null);
  const [acknowledge, setAcknowledge] = useState(false);
  const [form] = Form.useForm();

  useEffect(() => {
    void (async () => {
      try {
        const res = await listBankAccounts();
        setAccounts(res.items.map((item: any) => ({
          id: item.id,
          bankName: item.bankName ?? item.bank_name,
          accountNo: item.accountNo ?? item.account_no
        })));
      } catch (err) {
        toast.error(errorMessage(err, "加载银行账户失败"));
      }
    })();
  }, []);

  const handlePreview = useCallback(async () => {
    try {
      const values = await form.validateFields();
      setLoading(true);
      setClosedId(null);
      const res = await getBalanceReconciliation(
        values.bankAccountId,
        values.asOf,
        String(values.statementBalance)
      );
      setView(res);
    } catch (err) {
      if (err && typeof err === "object" && "errorFields" in err) return;
      toast.error(errorMessage(err, "生成余额调节表失败"));
    } finally {
      setLoading(false);
    }
  }, [form]);

  const handleClose = useCallback(async () => {
    try {
      const values = await form.validateFields();
      setClosing(true);
      const res = await closeBankReconciliation({
        bankAccountId: values.bankAccountId,
        asOf: values.asOf,
        statementBalance: String(values.statementBalance),
        notes: values.notes || undefined,
        acknowledgeDifference: acknowledge
      });
      setClosedId(res.reconciliationId);
      setView(res);
      toast.success("对账已封存，未达账项一并冻结留档");
    } catch (err) {
      if (err && typeof err === "object" && "errorFields" in err) return;
      toast.error(errorMessage(err, "封存失败"));
    } finally {
      setClosing(false);
    }
  }, [form, acknowledge]);

  return (
    <div style={{ display: "grid", gap: 20 }}>
      <ProPageBanner
        pageName="银行余额调节表"
        plain="核对银行说的余额和账上记的余额差在哪：多半是时间差（月底存的支票银行下月才入账），把这些列清楚，两边就该对得上。"
      />
      <PageHeader
        title="银行存款余额调节表"
        subtitle="匹配流水只回答「这笔对应哪张凭证」；调节表回答「银行和账面差在哪、差额能不能解释清楚」。"
      />

      <Card style={{ borderRadius: 12 }}>
        <Form form={form} layout="inline" style={{ rowGap: 12 }}>
          <Form.Item
            name="bankAccountId"
            label="银行账户"
            rules={[{ required: true, message: "请选择银行账户" }]}
          >
            <Select
              style={{ minWidth: 240 }}
              placeholder="选择账户"
              options={accounts.map((account) => ({
                value: account.id,
                label: `${account.bankName} ${account.accountNo}`
              }))}
            />
          </Form.Item>
          <Form.Item
            name="asOf"
            label="截止日"
            rules={[{ required: true, pattern: /^\d{4}-\d{2}-\d{2}$/, message: "格式 YYYY-MM-DD" }]}
          >
            <Input placeholder="2026-06-30" style={{ width: 150 }} />
          </Form.Item>
          <Form.Item
            name="statementBalance"
            label="对账单余额"
            rules={[{ required: true, message: "请从银行对账单抄入余额" }]}
            tooltip="这是外部事实，系统无从推算，必须从银行对账单上抄。"
          >
            <InputNumber style={{ width: 180 }} precision={2} />
          </Form.Item>
          <Form.Item>
            <Button type="primary" loading={loading} onClick={() => void handlePreview()}>
              生成调节表
            </Button>
          </Form.Item>
        </Form>
      </Card>

      {view?.sharedAccountWarning ? (
        <Alert type="warning" showIcon message="账面余额拆不到单个账户" description={view.sharedAccountWarning} />
      ) : null}

      {closedId ? (
        <Card style={{ borderRadius: 12 }}>
          <Result
            status="success"
            title="对账已封存"
            subTitle={`结论与当时的未达账项已一并冻结（${closedId}）。后续再导入的流水不会改变这份表。`}
          />
        </Card>
      ) : null}

      {view ? (
        <>
          <Card
            title="调节过程"
            style={{ borderRadius: 12 }}
            extra={
              view.balanced ? (
                <Tag color="green">调节后两侧相等</Tag>
              ) : (
                <Tag color="red">差额 {view.difference}</Tag>
              )
            }
          >
            <Descriptions bordered size="small" column={2}>
              <Descriptions.Item label="银行对账单余额">{view.statementBalance}</Descriptions.Item>
              <Descriptions.Item label="企业账面余额">{view.bookBalance}</Descriptions.Item>
              <Descriptions.Item label="加：企业已收、银行未收">
                {view.subtotals.bookOnlyReceipt}
              </Descriptions.Item>
              <Descriptions.Item label="加：银行已收、企业未收">
                {view.subtotals.bankOnlyReceipt}
              </Descriptions.Item>
              <Descriptions.Item label="减：企业已付、银行未付">
                {view.subtotals.bookOnlyPayment}
              </Descriptions.Item>
              <Descriptions.Item label="减：银行已付、企业未付">
                {view.subtotals.bankOnlyPayment}
              </Descriptions.Item>
              <Descriptions.Item label="调节后银行余额">
                <Typography.Text strong>{view.adjustedStatementBalance}</Typography.Text>
              </Descriptions.Item>
              <Descriptions.Item label="调节后账面余额">
                <Typography.Text strong>{view.adjustedBookBalance}</Typography.Text>
              </Descriptions.Item>
            </Descriptions>

            <Alert
              style={{ marginTop: 16 }}
              type={view.balanced ? "success" : "warning"}
              showIcon
              message={view.message}
            />

            <Typography.Paragraph type="secondary" style={{ marginTop: 12, marginBottom: 0 }}>
              两侧的加减方向是交叉的：银行侧调的是企业已记而银行未记的，账面侧调的是银行已记而
              企业未记的。系统不会自动补平差额——差额本身就是对账要发现的东西。
            </Typography.Paragraph>
          </Card>

          <Card title="未达账项明细" style={{ borderRadius: 12 }}>
            <Table
              rowKey={(row) => `${row.itemType}-${row.sourceId ?? row.occurredOn}-${row.amount}`}
              size="small"
              dataSource={view.items}
              pagination={{ pageSize: 20, hideOnSinglePage: true }}
              columns={[
                { title: "日期", dataIndex: "occurredOn", width: 110 },
                {
                  title: "类别",
                  dataIndex: "itemType",
                  width: 280,
                  render: (type: ReconciliationItemView["itemType"]) => ITEM_TYPE_LABELS[type] ?? type
                },
                { title: "摘要", dataIndex: "description" },
                { title: "金额", dataIndex: "amount", align: "right" as const, width: 130 }
              ]}
              locale={{ emptyText: "没有未达账项——银行与账面的记录完全同步。" }}
            />
          </Card>

          <Card title="封存对账结论" style={{ borderRadius: 12 }}>
            <Space direction="vertical" style={{ width: "100%" }} size={12}>
              <Form form={form} layout="vertical">
                <Form.Item name="notes" label="备注">
                  <Input.TextArea rows={2} placeholder="如：6 月对账，差额系某笔手续费回单未到" />
                </Form.Item>
              </Form>
              {!view.balanced ? (
                <Checkbox checked={acknowledge} onChange={(e) => setAcknowledge(e.target.checked)}>
                  我确认这个差额暂时无法解释，已在备注中说明原因
                </Checkbox>
              ) : null}
              <Typography.Text type="secondary">
                封存会把当时的未达账项一并冻结——三个月后复查，看到的必须是当时那份表，
                而不是用现在的流水重算出来的。
              </Typography.Text>
              <Button
                type="primary"
                loading={closing}
                disabled={!view.balanced && !acknowledge}
                onClick={() => void handleClose()}
              >
                封存本期对账
              </Button>
            </Space>
          </Card>
        </>
      ) : null}
    </div>
  );
}
