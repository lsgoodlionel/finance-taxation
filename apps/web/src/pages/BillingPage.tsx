/**
 * 订阅与计费（P8-C3）：当前套餐 + 用量 + 套餐对比选购 + 支付确认 + 账单。
 */
import { useEffect, useState, useCallback } from "react";
import {
  Row, Col, Card, Button, Tag, Space, Typography, Progress, Segmented, Spin, Modal, Input, Table, Alert,
} from "antd";
import { CrownOutlined, CheckOutlined, ReloadOutlined } from "@ant-design/icons";
import { toast } from "sonner";
import { PageHeader } from "../components/ui/PageHeader";
import {
  listBillingPlans, getSubscription, subscribePlan, confirmBillingPayment, listBillingPayments,
  type BillingPlan, type SubscriptionInfo,
} from "../lib/api";

const { Text, Title } = Typography;

const FEATURE_LABELS: Record<string, string> = {
  events: "经营事项总线", ledger: "总账与凭证", tax_basic: "税务申报", reports: "财务报表",
  reconciliation: "银行对账", payroll_transfer: "工资代发", invoice_verify: "发票验真",
  ai_agents: "AI 财税 Agent", social_security: "社保联动", counterparties: "往来单位画像",
  cash_forecast: "资金前瞻", bank_api: "银行 API 直连", multi_org: "多组织", priority_support: "优先支持",
};

function limitText(v: number): string { return v < 0 ? "不限" : String(v); }

export function BillingPage() {
  const [plans, setPlans] = useState<BillingPlan[]>([]);
  const [sub, setSub] = useState<SubscriptionInfo | null>(null);
  const [payments, setPayments] = useState<Awaited<ReturnType<typeof listBillingPayments>>["items"]>([]);
  const [cycle, setCycle] = useState<"monthly" | "yearly">("monthly");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [payModal, setPayModal] = useState<{ paymentId: string; amount: number } | null>(null);
  const [reference, setReference] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [p, s, pay] = await Promise.all([listBillingPlans(), getSubscription(), listBillingPayments()]);
      setPlans(p.items); setSub(s); setPayments(pay.items);
    } catch (err) { toast.error((err as Error).message); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { void load(); }, [load]);

  async function handleSubscribe(planCode: string) {
    setBusy(true);
    try {
      const r = await subscribePlan(planCode, cycle);
      if (r.activated) { toast.success("套餐已生效"); await load(); }
      else if (r.paymentId) { setPayModal({ paymentId: r.paymentId, amount: r.amount }); await load(); }
    } catch (err) { toast.error((err as Error).message); }
    finally { setBusy(false); }
  }

  async function handleConfirm() {
    if (!payModal) return;
    setBusy(true);
    try {
      await confirmBillingPayment(payModal.paymentId, reference);
      toast.success("支付已确认，订阅已激活");
      setPayModal(null); setReference("");
      await load();
    } catch (err) { toast.error((err as Error).message); }
    finally { setBusy(false); }
  }

  if (loading) return <div style={{ padding: 40, textAlign: "center" }}><Spin /></div>;

  const currentCode = sub?.subscription.planCode;

  return (
    <div style={{ display: "grid", gap: 24 }}>
      <section className="v3-hero-shell">
        <PageHeader title="订阅与计费" subtitle="选择适合企业规模的套餐，按月或按年订阅，支持对公转账与在线支付。"
          actions={<Space>
            <Segmented value={cycle} onChange={(v) => setCycle(v as "monthly" | "yearly")}
              options={[{ label: "按月", value: "monthly" }, { label: "按年(省2月)", value: "yearly" }]} />
            <Button icon={<ReloadOutlined />} onClick={() => void load()}>刷新</Button>
          </Space>} />
      </section>

      {/* 当前订阅与用量 */}
      {sub?.plan && (
        <section className="v3-section-shell" data-tone="accent">
          <Space style={{ justifyContent: "space-between", width: "100%", flexWrap: "wrap" }} align="start">
            <Space direction="vertical" size={2}>
              <Space><CrownOutlined style={{ color: "#d97706" }} /><Text strong style={{ fontSize: 16 }}>{sub.plan.name}</Text>
                <Tag color={sub.subscription.status === "active" ? "success" : sub.subscription.status === "trialing" ? "blue" : "error"}>
                  {sub.subscription.status === "active" ? "生效中" : sub.subscription.status === "trialing" ? "试用中" : sub.subscription.status}
                </Tag></Space>
              <Text type="secondary" style={{ fontSize: 12 }}>当前周期至 {sub.subscription.currentPeriodEnd?.slice(0, 10)}</Text>
            </Space>
            <Row gutter={16} style={{ minWidth: 360 }}>
              {sub.quotas && Object.entries({ seats: "用户席位", employees: "员工数", aiCallsPerMonth: "AI 调用/月", bankAccounts: "银行账户" }).map(([k, label]) => {
                const q = sub.quotas![k];
                if (!q) return null;
                return (
                  <Col key={k} span={12} style={{ marginBottom: 8 }}>
                    <Text style={{ fontSize: 12 }}>{label}：{q.used}/{limitText(q.limit)}</Text>
                    <Progress percent={q.limit < 0 ? 0 : Math.min(100, Math.round((q.used / Math.max(1, q.limit)) * 100))}
                      size="small" status={q.exceeded ? "exception" : "active"} showInfo={false} />
                  </Col>
                );
              })}
            </Row>
          </Space>
        </section>
      )}

      {/* 套餐对比 */}
      <Row gutter={[16, 16]}>
        {plans.map((p) => {
          const isCurrent = p.code === currentCode;
          const price = cycle === "yearly" ? p.priceYearly : p.priceMonthly;
          return (
            <Col key={p.code} xs={24} sm={12} lg={6}>
              <Card style={{ borderRadius: 12, border: isCurrent ? "2px solid #2563eb" : undefined, height: "100%" }}>
                <Space direction="vertical" size={8} style={{ width: "100%" }}>
                  <Title level={5} style={{ margin: 0 }}>{p.name}{isCurrent && <Tag color="blue" style={{ marginLeft: 8 }}>当前</Tag>}</Title>
                  <div><Text style={{ fontSize: 26, fontWeight: 700 }}>¥{price}</Text><Text type="secondary">/{cycle === "yearly" ? "年" : "月"}</Text></div>
                  <Text type="secondary" style={{ fontSize: 12, minHeight: 32, display: "block" }}>{p.highlight}</Text>
                  <div style={{ fontSize: 12, color: "#64748b" }}>
                    席位 {limitText(p.limits.seats)} · 员工 {limitText(p.limits.employees)} · AI {limitText(p.limits.aiCallsPerMonth)}/月 · 银行 {limitText(p.limits.bankAccounts)}
                  </div>
                  <div style={{ display: "grid", gap: 3 }}>
                    {p.features.slice(0, 8).map((f) => (
                      <Text key={f} style={{ fontSize: 12 }}><CheckOutlined style={{ color: "#16a34a", marginRight: 6 }} />{FEATURE_LABELS[f] ?? f}</Text>
                    ))}
                  </div>
                  <Button type={isCurrent ? "default" : "primary"} block disabled={isCurrent || busy}
                    onClick={() => void handleSubscribe(p.code)}>
                    {isCurrent ? "当前套餐" : price === 0 ? "切换到免费版" : "选购"}
                  </Button>
                </Space>
              </Card>
            </Col>
          );
        })}
      </Row>

      {/* 账单记录 */}
      <section className="v3-section-shell">
        <Text strong>账单记录</Text>
        <Table size="small" rowKey="id" style={{ marginTop: 8 }} dataSource={payments} pagination={{ pageSize: 10, hideOnSinglePage: true }}
          columns={[
            { title: "套餐", dataIndex: "plan_code" },
            { title: "周期", dataIndex: "billing_cycle", render: (v) => v === "yearly" ? "年付" : "月付" },
            { title: "金额", dataIndex: "amount", align: "right", render: (v) => `¥${Number(v).toFixed(2)}` },
            { title: "方式", dataIndex: "method", render: (v) => ({ offline: "对公转账", alipay: "支付宝", wechat: "微信" }[v as string] ?? v) },
            { title: "状态", dataIndex: "status", render: (v) => <Tag color={v === "paid" ? "success" : v === "pending" ? "warning" : "error"}>{v === "paid" ? "已支付" : v === "pending" ? "待支付" : "失败"}</Tag> },
            { title: "时间", dataIndex: "created_at", render: (v) => String(v).slice(0, 10) },
          ]}
          locale={{ emptyText: "暂无账单" }} />
      </section>

      <Modal open={!!payModal} title="确认支付" onOk={() => void handleConfirm()} onCancel={() => setPayModal(null)}
        okText="确认已支付" cancelText="取消" confirmLoading={busy}>
        <Alert type="info" showIcon style={{ marginBottom: 12 }}
          message={`应付金额 ¥${payModal?.amount.toFixed(2)}`}
          description="请通过对公转账或在线支付完成付款，填写转账流水号/支付凭据后点击「确认已支付」。线下支付需财务核对到账。" />
        <Input placeholder="转账流水号 / 支付凭据" value={reference} onChange={(e) => setReference(e.target.value)} />
      </Modal>
    </div>
  );
}
