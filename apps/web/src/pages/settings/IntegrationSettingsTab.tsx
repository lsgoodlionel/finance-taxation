/**
 * 外部系统对接设置面板
 * 嵌入 SettingsPage「外部对接」Tab
 *
 * 支持多对接类型（顶部切换）：
 *   - invoice_verify 发票验真（local / etax / baiwang / nuonuo / custom）
 *   - bank_api       银行直连（manual / cmb / ccb / custom）
 *   - notification   企业通知（none / feishu / wework）—— 凭证字段标签按类型自适应
 *
 * 通用能力：切换服务商、填写 API Key / Secret / AppId / Endpoint、测试连接、查看状态。
 */
import { useState, useEffect, useCallback } from "react";
import {
  Card, Form, Select, Input, Button, Space, Alert, Tag, Typography,
  Row, Col, Statistic, Divider, Tooltip, Spin, Segmented,
} from "antd";
import {
  CheckCircleOutlined, CloseCircleOutlined, QuestionCircleOutlined,
  ApiOutlined, SafetyOutlined, LinkOutlined, ExperimentOutlined, BankOutlined,
  NotificationOutlined,
} from "@ant-design/icons";
import { toast } from "sonner";
import {
  listIntegrationConfigs, upsertIntegrationConfig, testIntegrationConfig,
  listInvoices,
  type IntegrationConfig, type IntegrationProviderMeta,
} from "../../lib/api";

const { Text, Link } = Typography;

const PLACEHOLDER_MASKED = "••••••••";

type ConfigType = "invoice_verify" | "bank_api" | "notification";

interface ConfigTypeMeta {
  label: string;
  defaultProvider: string;
  title: string;
  endpointPlaceholder: string;
  endpointHint: string;
}

const CONFIG_TYPE_META: Record<ConfigType, ConfigTypeMeta> = {
  invoice_verify: {
    label: "发票验真",
    defaultProvider: "local",
    title: "发票验真服务商配置",
    endpointPlaceholder: "https://your-api.example.com/invoice/verify",
    endpointHint: "POST 接口，规范：{invoiceCode,invoiceNo,invoiceDate,totalAmount} → {valid:bool,message:string}",
  },
  bank_api: {
    label: "银行直连",
    defaultProvider: "manual",
    title: "银行 API 直连配置",
    endpointPlaceholder: "https://api.bank.example.com/enterprise",
    endpointHint: "POST 接口：流水 {accountNo,dateFrom,dateTo}→{statements:[...]}；代发 {lines:[...]}→{ok,ref}",
  },
  notification: {
    label: "企业通知",
    defaultProvider: "none",
    title: "企业通知渠道配置",
    endpointPlaceholder: "https://open.feishu.cn/open-apis/...",
    endpointHint: "自定义通知渠道的回调/推送地址（飞书/企业微信官方渠道通常无需填写）",
  },
};

/** 凭证字段（apiKey / apiSecret / appId）在不同对接类型下的标签与说明文案 */
interface CredentialFieldLabel {
  text: string;
  tooltip: string;
}

const NOTIFICATION_FIELD_LABELS: Record<"apiKey" | "apiSecret" | "appId", CredentialFieldLabel> = {
  appId:     { text: "App ID",     tooltip: "飞书 / 企业微信开放平台的应用 App ID" },
  apiSecret: { text: "App Secret", tooltip: "与 App ID 配套的应用密钥，用于换取访问令牌" },
  apiKey:    { text: "默认接收人（open_id/user_id）", tooltip: "测试消息与默认通知的接收人 open_id 或 user_id" },
};

const DEFAULT_FIELD_LABELS: Record<"apiKey" | "apiSecret" | "appId", CredentialFieldLabel> = {
  apiKey:    { text: "API Key",           tooltip: "服务商提供的 API 密钥 / 接入令牌" },
  apiSecret: { text: "API Secret",        tooltip: "与 API Key 配套的密钥，用于请求签名" },
  appId:     { text: "App ID / 应用编号", tooltip: "开放平台应用管理中的 appId" },
};

function getCredentialFieldLabel(configType: ConfigType, field: "apiKey" | "apiSecret" | "appId"): CredentialFieldLabel {
  return configType === "notification" ? NOTIFICATION_FIELD_LABELS[field] : DEFAULT_FIELD_LABELS[field];
}

interface IntegrationSettingsTabProps {
  companyId?: string;
}

export function IntegrationSettingsTab(_props: IntegrationSettingsTabProps) {
  const [configType, setConfigType] = useState<ConfigType>("invoice_verify");
  const [config, setConfig]       = useState<IntegrationConfig | null>(null);
  const [providers, setProviders] = useState<IntegrationProviderMeta[]>([]);
  const [loading, setLoading]     = useState(true);
  const [saving, setSaving]       = useState(false);
  const [testing, setTesting]     = useState(false);
  const [testResult, setTestResult] = useState<{ ok: boolean; message: string } | null>(null);
  const [invoiceStats, setInvoiceStats] = useState({ pending: 0, verified: 0, invalid: 0, total: 0 });
  const [form] = Form.useForm();

  const typeMeta = CONFIG_TYPE_META[configType];

  const load = useCallback(async (type: ConfigType) => {
    setLoading(true);
    setTestResult(null);
    try {
      const cfgData = await listIntegrationConfigs();
      const current = cfgData.items.find(i => i.configType === type) ?? null;
      setConfig(current);
      setProviders(cfgData.providers[type] ?? []);

      // 发票验真统计仅在发票类型下加载
      if (type === "invoice_verify") {
        const [invData, pendingR, verifiedR, invalidR] = await Promise.all([
          listInvoices({ pageSize: 1 }).catch(() => ({ total: 0, items: [] })),
          listInvoices({ verifyStatus: "pending",  pageSize: 1 }).catch(() => ({ total: 0, items: [] })),
          listInvoices({ verifyStatus: "verified", pageSize: 1 }).catch(() => ({ total: 0, items: [] })),
          listInvoices({ verifyStatus: "invalid",  pageSize: 1 }).catch(() => ({ total: 0, items: [] })),
        ]);
        setInvoiceStats({ pending: pendingR.total, verified: verifiedR.total, invalid: invalidR.total, total: invData.total });
      }

      form.setFieldsValue({
        provider:    current?.provider ?? CONFIG_TYPE_META[type].defaultProvider,
        endpointUrl: current?.endpointUrl ?? "",
        enabled:     current?.enabled ?? true,
        apiKey:      "", apiSecret: "", appId: "",
      });
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setLoading(false);
    }
  }, [form]);

  useEffect(() => { void load(configType); }, [load, configType]);

  async function handleSave() {
    const values = await form.validateFields();
    setSaving(true);
    setTestResult(null);
    try {
      const payload = {
        provider:    values.provider as string,
        endpointUrl: values.endpointUrl || undefined,
        enabled:     values.enabled ?? true,
        ...(values.apiKey    && !values.apiKey.includes("•")    ? { apiKey:    values.apiKey    } : {}),
        ...(values.apiSecret && !values.apiSecret.includes("•") ? { apiSecret: values.apiSecret } : {}),
        ...(values.appId     && !values.appId.includes("•")     ? { appId:     values.appId     } : {}),
      };
      await upsertIntegrationConfig(configType, payload);
      toast.success("对接配置已保存");
      await load(configType);
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
      const result = await testIntegrationConfig(configType);
      setTestResult({ ok: result.ok, message: result.message });
      if (result.ok) toast.success(`测试成功：${result.message}`);
      else toast.error(`测试失败：${result.message}`);
      await load(configType);
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setTesting(false);
    }
  }

  const selectedProvider = Form.useWatch("provider", form) as string ?? typeMeta.defaultProvider;
  const meta = providers.find(p => p.id === selectedProvider);

  if (loading) return <div style={{ padding: 40, textAlign: "center" }}><Spin /></div>;

  return (
    <Space direction="vertical" size={20} style={{ width: "100%" }}>
      {/* 对接类型切换 */}
      <Segmented
        value={configType}
        onChange={(v) => setConfigType(v as ConfigType)}
        options={[
          { label: <Space><SafetyOutlined />发票验真</Space>, value: "invoice_verify" },
          { label: <Space><BankOutlined />银行直连</Space>, value: "bank_api" },
          { label: <Space><NotificationOutlined />企业通知</Space>, value: "notification" },
        ]}
      />

      {/* 发票验真统计（仅发票类型）*/}
      {configType === "invoice_verify" && (
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
      )}

      {/* 银行直连能力说明（仅银行类型）*/}
      {configType === "bank_api" && (
        <Alert
          type="info" showIcon icon={<BankOutlined />}
          message="银行 API 直连"
          description="配置后可自动拉取银行流水并触发对账，以及通过 API 推送工资代发指令。未配置（手工模式）时继续使用 CSV 流水导入与网银上传代发文件。"
        />
      )}

      {/* 企业通知能力说明（仅通知类型）*/}
      {configType === "notification" && (
        <Alert
          type="info" showIcon icon={<NotificationOutlined />}
          message="企业通知渠道"
          description="飞书：填 App ID + App Secret + 默认接收人；测试将验证鉴权连通。企业微信连通测试待实现。"
        />
      )}

      {/* 当前对接状态 */}
      {config && (
        <Alert
          type={config.lastTestOk === true ? "success" : config.lastTestOk === false ? "error" : "info"}
          showIcon
          icon={config.lastTestOk === true ? <CheckCircleOutlined /> :
                config.lastTestOk === false ? <CloseCircleOutlined /> : <ApiOutlined />}
          message={`当前使用：${providers.find(p => p.id === config.provider)?.name ?? config.provider} · ${
            config.lastTestOk === true ? "上次测试通过" : config.lastTestOk === false ? "上次测试失败" : "尚未测试"
          }`}
          description={config.lastTestMsg && (
            <Text type="secondary" style={{ fontSize: 12 }}>{config.lastTestAt?.slice(0, 16).replace("T", " ")} — {config.lastTestMsg}</Text>
          )}
        />
      )}

      {/* 配置表单 */}
      <Card
        title={<Space><ApiOutlined style={{ color: "#7c3aed" }} /><Text strong>{typeMeta.title}</Text></Space>}
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
          <Form.Item name="provider" label="服务商" rules={[{ required: true }]}>
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

          {meta?.requiresApiKey && (
            <Form.Item name="apiKey" label={
              <Space><span>{getCredentialFieldLabel(configType, "apiKey").text}</span>
                <Tooltip title={getCredentialFieldLabel(configType, "apiKey").tooltip}>
                  <QuestionCircleOutlined style={{ color: "#94a3b8" }} />
                </Tooltip>
              </Space>
            }>
              <Input.Password placeholder={config?.apiKey ? PLACEHOLDER_MASKED : `请输入${getCredentialFieldLabel(configType, "apiKey").text}`} style={{ maxWidth: 360 }} autoComplete="off" />
            </Form.Item>
          )}

          {meta?.requiresApiSecret && (
            <Form.Item name="apiSecret" label={
              <Space><span>{getCredentialFieldLabel(configType, "apiSecret").text}</span>
                <Tooltip title={getCredentialFieldLabel(configType, "apiSecret").tooltip}>
                  <QuestionCircleOutlined style={{ color: "#94a3b8" }} />
                </Tooltip>
              </Space>
            }>
              <Input.Password placeholder={config?.apiSecret ? PLACEHOLDER_MASKED : `请输入${getCredentialFieldLabel(configType, "apiSecret").text}`} style={{ maxWidth: 360 }} autoComplete="off" />
            </Form.Item>
          )}

          {meta?.requiresAppId && (
            <Form.Item name="appId" label={
              <Space><span>{getCredentialFieldLabel(configType, "appId").text}</span>
                <Tooltip title={getCredentialFieldLabel(configType, "appId").tooltip}>
                  <QuestionCircleOutlined style={{ color: "#94a3b8" }} />
                </Tooltip>
              </Space>
            }>
              <Input placeholder={config?.appId ? PLACEHOLDER_MASKED : `请输入${getCredentialFieldLabel(configType, "appId").text}`} style={{ maxWidth: 360 }} autoComplete="off" />
            </Form.Item>
          )}

          {meta?.requiresEndpoint && (
            <Form.Item name="endpointUrl" label={
              <Space><span>接口地址（Endpoint URL）</span>
                <Tooltip title={typeMeta.endpointHint}>
                  <QuestionCircleOutlined style={{ color: "#94a3b8" }} />
                </Tooltip>
              </Space>
            } rules={[{ type: "url", message: "请输入完整的 HTTPS URL" }]}>
              <Input placeholder={typeMeta.endpointPlaceholder} style={{ maxWidth: 480 }} />
            </Form.Item>
          )}
        </Form>

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
        <Text type="secondary" style={{ fontSize: 12 }}>
          {configType === "invoice_verify" &&
            "提示：local 本地规则无需联网；接入国税/百望/诺诺需对应平台凭证。敏感字段保存后以掩码显示，留空则保留原值。"}
          {configType === "bank_api" &&
            "提示：manual 手工模式无需配置；招行/建行直连需企业网银证书与开放平台签约。敏感字段保存后以掩码显示，留空则保留原值。"}
          {configType === "notification" &&
            "提示：none 表示不启用通知渠道；飞书需在开放平台创建企业自建应用获取 App ID / Secret。敏感字段保存后以掩码显示，留空则保留原值。"}
        </Text>
      </Card>
    </Space>
  );
}
