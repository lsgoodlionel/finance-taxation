/**
 * 外部系统对接设置面板
 * 嵌入 SettingsPage「外部对接」Tab
 *
 * 功能：
 *   - 显示当前发票验真服务商及连接状态
 *   - 切换服务商（local / etax / baiwang / nuonuo / custom）
 *   - 填写 API Key / Secret / AppId / Endpoint
 *   - 测试连接（显示真实响应结果）
 *   - 显示发票验真统计（已验/未验/不合规）
 */
import { useState, useEffect, useCallback } from "react";
import {
  Card, Form, Select, Input, Button, Space, Alert, Tag, Descriptions, Typography,
  Row, Col, Statistic, Divider, Tooltip, Spin,
} from "antd";
import {
  CheckCircleOutlined, CloseCircleOutlined, QuestionCircleOutlined,
  ApiOutlined, SafetyOutlined, LinkOutlined, ExperimentOutlined,
} from "@ant-design/icons";
import { toast } from "sonner";
import {
  listIntegrationConfigs, upsertIntegrationConfig, testIntegrationConfig,
  listInvoices,
  type IntegrationConfig, type IntegrationProviderMeta,
} from "../../lib/api";

const { Text, Link } = Typography;

const PLACEHOLDER_MASKED = "••••••••";

interface IntegrationSettingsTabProps {
  companyId?: string;
}

export function IntegrationSettingsTab(_props: IntegrationSettingsTabProps) {
  const [config, setConfig]       = useState<IntegrationConfig | null>(null);
  const [providers, setProviders] = useState<IntegrationProviderMeta[]>([]);
  const [loading, setLoading]     = useState(true);
  const [saving, setSaving]       = useState(false);
  const [testing, setTesting]     = useState(false);
  const [testResult, setTestResult] = useState<{ ok: boolean; message: string } | null>(null);
  const [invoiceStats, setInvoiceStats] = useState({ pending: 0, verified: 0, invalid: 0, total: 0 });
  const [form] = Form.useForm();

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [cfgData, invData] = await Promise.all([
        listIntegrationConfigs(),
        listInvoices({ pageSize: 1 }).catch(() => ({ total: 0, items: [] })),
      ]);
      const invoiceCfg = cfgData.items.find(i => i.configType === "invoice_verify");
      setConfig(invoiceCfg ?? null);
      setProviders(cfgData.providers.invoice_verify ?? []);

      // 取验真统计（近期）
      const [pendingR, verifiedR, invalidR] = await Promise.all([
        listInvoices({ verifyStatus: "pending",  pageSize: 1 }).catch(() => ({ total: 0, items: [] })),
        listInvoices({ verifyStatus: "verified", pageSize: 1 }).catch(() => ({ total: 0, items: [] })),
        listInvoices({ verifyStatus: "invalid",  pageSize: 1 }).catch(() => ({ total: 0, items: [] })),
      ]);
      setInvoiceStats({
        pending:  pendingR.total,
        verified: verifiedR.total,
        invalid:  invalidR.total,
        total:    invData.total,
      });

      if (invoiceCfg) {
        form.setFieldsValue({
          provider:    invoiceCfg.provider,
          endpointUrl: invoiceCfg.endpointUrl ?? "",
          enabled:     invoiceCfg.enabled,
          // 不回填脱敏字段
        });
      } else {
        form.setFieldsValue({ provider: "local", enabled: true });
      }
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setLoading(false);
    }
  }, [form]);

  useEffect(() => { void load(); }, [load]);

  async function handleSave() {
    const values = await form.validateFields();
    setSaving(true);
    setTestResult(null);
    try {
      const payload = {
        provider:    values.provider as string,
        endpointUrl: values.endpointUrl || undefined,
        enabled:     values.enabled ?? true,
        // 仅当用户输入了非脱敏值时才更新
        ...(values.apiKey    && !values.apiKey.includes("•")    ? { apiKey:    values.apiKey    } : {}),
        ...(values.apiSecret && !values.apiSecret.includes("•") ? { apiSecret: values.apiSecret } : {}),
        ...(values.appId     && !values.appId.includes("•")     ? { appId:     values.appId     } : {}),
      };
      await upsertIntegrationConfig("invoice_verify", payload);
      toast.success("对接配置已保存");
      await load();
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setSaving(false);
    }
  }

  async function handleTest() {
    setTesting(true);
    setTestResult(null);
    try {
      const result = await testIntegrationConfig("invoice_verify");
      setTestResult({ ok: result.ok, message: result.message });
      if (result.ok) toast.success(`测试成功：${result.message}`);
      else toast.error(`测试失败：${result.message}`);
      await load(); // 刷新 lastTestOk
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setTesting(false);
    }
  }

  const selectedProvider = Form.useWatch("provider", form) as string ?? "local";
  const meta = providers.find(p => p.id === selectedProvider);

  if (loading) return <div style={{ padding: 40, textAlign: "center" }}><Spin /></div>;

  return (
    <Space direction="vertical" size={20} style={{ width: "100%" }}>
      {/* 发票验真统计 */}
      <Card
        size="small"
        title={<Space><SafetyOutlined style={{ color: "#2563eb" }} /><Text strong>发票验真统计</Text></Space>}
        style={{ borderRadius: 10 }}
      >
        <Row gutter={[16, 8]}>
          {[
            { label: "发票总数", value: invoiceStats.total, color: "#475569" },
            { label: "待验真",   value: invoiceStats.pending,  color: invoiceStats.pending > 0 ? "#d97706" : "#64748b" },
            { label: "已验真",   value: invoiceStats.verified, color: "#16a34a" },
            { label: "不合规",   value: invoiceStats.invalid,  color: invoiceStats.invalid > 0 ? "#dc2626" : "#64748b" },
          ].map(s => (
            <Col key={s.label} span={6}>
              <Statistic title={s.label} value={s.value} valueStyle={{ fontSize: 18, color: s.color }} />
            </Col>
          ))}
        </Row>
        {invoiceStats.invalid > 0 && (
          <Alert type="error" showIcon style={{ marginTop: 12 }}
            message={`${invoiceStats.invalid} 张发票验真不合规，存在税务风险，请在「发票台账」中处理`} />
        )}
      </Card>

      {/* 当前对接状态 */}
      {config && (
        <Alert
          type={config.lastTestOk === true ? "success" : config.lastTestOk === false ? "error" : "info"}
          showIcon
          icon={config.lastTestOk === true ? <CheckCircleOutlined /> :
                config.lastTestOk === false ? <CloseCircleOutlined /> : <ApiOutlined />}
          message={
            config.lastTestOk === true  ? `当前使用：${providers.find(p => p.id === config.provider)?.name ?? config.provider} · 上次测试通过` :
            config.lastTestOk === false ? `当前使用：${providers.find(p => p.id === config.provider)?.name ?? config.provider} · 上次测试失败` :
            `当前使用：${providers.find(p => p.id === config.provider)?.name ?? config.provider} · 尚未测试`
          }
          description={config.lastTestMsg && (
            <Text type="secondary" style={{ fontSize: 12 }}>{config.lastTestAt?.slice(0, 16).replace("T", " ")} — {config.lastTestMsg}</Text>
          )}
        />
      )}

      {/* 配置表单 */}
      <Card
        title={<Space><ApiOutlined style={{ color: "#7c3aed" }} /><Text strong>发票验真服务商配置</Text></Space>}
        style={{ borderRadius: 10 }}
        extra={
          <Space>
            <Button size="small" icon={<ExperimentOutlined />} loading={testing} onClick={() => void handleTest()}>
              测试连接
            </Button>
            <Button size="small" type="primary" loading={saving} onClick={() => void handleSave()}>
              保存设置
            </Button>
          </Space>
        }
      >
        <Form form={form} layout="vertical" size="middle">
          {/* 服务商选择 */}
          <Form.Item name="provider" label="验真服务商" rules={[{ required: true }]}>
            <Select
              options={providers.map(p => ({
                value: p.id,
                label: (
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <span>{p.name}</span>
                    <Tag style={{ fontSize: 10, marginLeft: 8 }}>{p.freeQuota}</Tag>
                  </div>
                ),
              }))}
              optionLabelProp="label"
              style={{ maxWidth: 360 }}
              onChange={() => setTestResult(null)}
            />
          </Form.Item>

          {/* 服务商说明卡片 */}
          {meta && (
            <div style={{
              padding: "12px 16px", borderRadius: 8, marginBottom: 16,
              background: "#f8fafc", border: "1px solid #e2e8f0",
            }}>
              <Text style={{ fontSize: 13 }}>{meta.description}</Text>
              {meta.docsUrl && (
                <div style={{ marginTop: 6 }}>
                  <Link href={meta.docsUrl} target="_blank" style={{ fontSize: 12 }}>
                    <LinkOutlined style={{ marginRight: 4 }} />查看接口文档
                  </Link>
                </div>
              )}
            </div>
          )}

          {/* 动态字段 */}
          {meta?.requiresApiKey && (
            <Form.Item
              name="apiKey"
              label={
                <Space>
                  <span>API Key</span>
                  <Tooltip title={
                    selectedProvider === "etax_nsrsbh" ? "国税平台颁发的企业接入令牌" :
                    selectedProvider === "baiwang"     ? "百望云开放平台 → 应用管理 → API Key" :
                    selectedProvider === "nuonuo"      ? "诺诺开放平台 → 应用详情 → Access Token" :
                    "服务商提供的 API 密钥"
                  }>
                    <QuestionCircleOutlined style={{ color: "#94a3b8" }} />
                  </Tooltip>
                </Space>
              }
            >
              <Input.Password
                placeholder={config?.apiKey ? PLACEHOLDER_MASKED : "请输入 API Key"}
                style={{ maxWidth: 360 }}
                autoComplete="off"
              />
            </Form.Item>
          )}

          {meta?.requiresApiSecret && (
            <Form.Item
              name="apiSecret"
              label={
                <Space>
                  <span>{selectedProvider === "nuonuo" ? "Secret / Token Secret" : "API Secret"}</span>
                  <Tooltip title="与 API Key 配套的密钥，用于请求签名">
                    <QuestionCircleOutlined style={{ color: "#94a3b8" }} />
                  </Tooltip>
                </Space>
              }
            >
              <Input.Password
                placeholder={config?.apiSecret ? PLACEHOLDER_MASKED : "请输入 API Secret"}
                style={{ maxWidth: 360 }}
                autoComplete="off"
              />
            </Form.Item>
          )}

          {meta?.requiresAppId && (
            <Form.Item
              name="appId"
              label={
                <Space>
                  <span>App ID / 应用编号</span>
                  <Tooltip title="百望云开放平台 → 应用管理中的 appId">
                    <QuestionCircleOutlined style={{ color: "#94a3b8" }} />
                  </Tooltip>
                </Space>
              }
            >
              <Input
                placeholder={config?.appId ? PLACEHOLDER_MASKED : "请输入 App ID"}
                style={{ maxWidth: 360 }}
                autoComplete="off"
              />
            </Form.Item>
          )}

          {meta?.requiresEndpoint && (
            <Form.Item
              name="endpointUrl"
              label={
                <Space>
                  <span>接口地址（Endpoint URL）</span>
                  <Tooltip title="POST 接口地址，规范：{invoiceCode,invoiceNo,invoiceDate,totalAmount} → {valid:bool,message:string}">
                    <QuestionCircleOutlined style={{ color: "#94a3b8" }} />
                  </Tooltip>
                </Space>
              }
              rules={[{ type: "url", message: "请输入完整的 HTTPS URL" }]}
            >
              <Input placeholder="https://your-api.example.com/invoice/verify" style={{ maxWidth: 480 }} />
            </Form.Item>
          )}
        </Form>

        {/* 测试结果 */}
        {testResult && (
          <Alert
            type={testResult.ok ? "success" : "error"}
            showIcon
            icon={testResult.ok ? <CheckCircleOutlined /> : <CloseCircleOutlined />}
            message={testResult.ok ? "连接测试成功" : "连接测试失败"}
            description={testResult.message}
            style={{ marginTop: 12, borderRadius: 8 }}
          />
        )}

        <Divider style={{ margin: "16px 0" }} />

        {/* 各服务商快速指引 */}
        <div>
          <Text type="secondary" style={{ fontSize: 12, display: "block", marginBottom: 8 }}>
            各服务商接入指引
          </Text>
          <Descriptions size="small" column={1} style={{ fontSize: 12 }}>
            <Descriptions.Item label={<Text style={{ fontSize: 11 }}>本地规则</Text>}>
              <Text type="secondary" style={{ fontSize: 11 }}>无需配置，基于格式规则验证发票号码、代码、日期、金额。不联网，不消耗配额。</Text>
            </Descriptions.Item>
            <Descriptions.Item label={<Text style={{ fontSize: 11 }}>国税平台</Text>}>
              <Text type="secondary" style={{ fontSize: 11 }}>登录全国电子税务局 → 申请企业接口 → 获取 token，每天免费100次。适合小批量验真。</Text>
            </Descriptions.Item>
            <Descriptions.Item label={<Text style={{ fontSize: 11 }}>百望云</Text>}>
              <Text type="secondary" style={{ fontSize: 11 }}>注册百望开发者账号 → 创建应用 → 获取 apiKey + appId，商业付费，支持批量、实时、附图验真。</Text>
            </Descriptions.Item>
            <Descriptions.Item label={<Text style={{ fontSize: 11 }}>诺诺网</Text>}>
              <Text type="secondary" style={{ fontSize: 11 }}>注册诺诺开放平台 → 创建应用 → 获取 accessToken + secret，适合已使用诺诺开票的企业。</Text>
            </Descriptions.Item>
          </Descriptions>
        </div>
      </Card>
    </Space>
  );
}
