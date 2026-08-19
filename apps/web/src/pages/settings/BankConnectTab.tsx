/**
 * 银企直连配置（V14-A）。
 *
 * ## 证书密码不回显
 *
 * 编辑时密码框留空 = 保持原密码，而不是清空。这一条在接口、store、
 * 数据库三层都做了（`coalesce`），因为「改个备注把证书密码清掉」
 * 表现出来是「昨天还能连今天连不上」，排查要绕一大圈。
 *
 * ## 「已保存」与「已接入」是两件事
 *
 * 用户可以先选好银行、把证书和协议信息填进去，而适配器实现晚一步到位。
 * 配置卡上分别标出来——只显示一个「未连接」会让人以为是自己填错了。
 */

import { useCallback, useEffect, useState } from "react";
import {
  Alert,
  Badge,
  Button,
  Card,
  Descriptions,
  Empty,
  Form,
  Input,
  Modal,
  Popconfirm,
  Select,
  Skeleton,
  Space,
  Switch,
  Tag,
  Typography
} from "antd";
import { PlusOutlined, ThunderboltOutlined, WalletOutlined } from "@ant-design/icons";
import { toast } from "sonner";
import { errorMessage } from "../../lib/errors";
import { Explain } from "../../components/ui/Explain";
import {
  deleteBankConnectConfig,
  getBankConnectBalance,
  listBankConnectConfigs,
  saveBankConnectConfig,
  testBankConnectConfig,
  type BankConnectConfig,
  type BankProviderMeta
} from "../../lib/api-bank-connect";

interface FormValues {
  provider: string;
  displayName: string;
  payerAccount: string;
  customerNo: string;
  endpoint: string;
  signAlgorithm: "RSA" | "SM2";
  certRef: string;
  certPassword?: string;
  certFingerprint?: string;
  certExpiresOn?: string;
  enabled: boolean;
  note?: string;
}

export function BankConnectTab() {
  const [items, setItems] = useState<BankConnectConfig[]>([]);
  const [providers, setProviders] = useState<BankProviderMeta[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [editing, setEditing] = useState<BankConnectConfig | null>(null);
  const [creating, setCreating] = useState(false);
  const [saving, setSaving] = useState(false);
  const [testingId, setTestingId] = useState<string | null>(null);
  const [balances, setBalances] = useState<Record<string, string>>({});
  const [form] = Form.useForm<FormValues>();

  const reload = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const data = await listBankConnectConfigs();
      setItems(data.items);
      setProviders(data.providers);
    } catch (error) {
      // 不静默：加载失败显示成空会被读成「还没配过」，于是有人再配一遍，
      // 而付款账号唯一约束会在保存时才报错。
      setLoadError(errorMessage(error, "银企配置加载失败"));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void reload();
  }, [reload]);

  const openEditor = (config: BankConnectConfig | null) => {
    setEditing(config);
    setCreating(true);
    if (config) {
      form.setFieldsValue({
        provider: config.provider,
        displayName: config.displayName,
        payerAccount: config.payerAccount,
        customerNo: config.customerNo,
        endpoint: config.endpoint,
        signAlgorithm: config.signAlgorithm,
        certRef: config.certRef,
        // 密码字段永远留空——回显意味着密码原文经过一次网络传输。
        certPassword: undefined,
        certFingerprint: config.certFingerprint ?? undefined,
        certExpiresOn: config.certExpiresOn ?? undefined,
        enabled: config.enabled,
        note: config.note ?? undefined
      });
    } else {
      form.resetFields();
      form.setFieldsValue({ signAlgorithm: "RSA", enabled: false });
    }
  };

  const handleSave = async (values: FormValues) => {
    setSaving(true);
    try {
      await saveBankConnectConfig({
        id: editing?.id,
        provider: values.provider,
        displayName: values.displayName?.trim() || values.provider,
        payerAccount: values.payerAccount.trim(),
        customerNo: values.customerNo?.trim() ?? "",
        endpoint: values.endpoint?.trim() ?? "",
        signAlgorithm: values.signAlgorithm,
        certRef: values.certRef?.trim() ?? "",
        // 空串不传：留空表示保持原密码。
        certPassword: values.certPassword?.trim() || undefined,
        certFingerprint: values.certFingerprint?.trim() || null,
        certExpiresOn: values.certExpiresOn?.trim() || null,
        enabled: values.enabled,
        note: values.note?.trim() || null
      });
      toast.success("配置已保存");
      setCreating(false);
      setEditing(null);
      await reload();
    } catch (error) {
      toast.error(errorMessage(error, "保存失败"));
    } finally {
      setSaving(false);
    }
  };

  const handleTest = async (config: BankConnectConfig) => {
    setTestingId(config.id);
    try {
      const result = await testBankConnectConfig(config.id);
      if (result.ok) {
        toast.success(result.message);
      } else {
        toast.warning(result.message);
      }
    } catch (error) {
      toast.error(errorMessage(error, "测试失败"));
    } finally {
      setTestingId(null);
      await reload();
    }
  };

  const handleBalance = async (config: BankConnectConfig) => {
    try {
      const result = await getBankConnectBalance(config.id);
      setBalances((prev) => ({
        ...prev,
        [config.id]: `${(result.availableCents / 100).toLocaleString("zh-CN", {
          minimumFractionDigits: 2
        })} ${result.currency}`
      }));
    } catch (error) {
      toast.error(errorMessage(error, "余额查询失败"));
    }
  };

  const handleDelete = async (config: BankConnectConfig) => {
    try {
      await deleteBankConnectConfig(config.id);
      toast.success("已删除");
      await reload();
    } catch (error) {
      // 有指令引用时数据库会拦下——那是对的，提示原文透给用户。
      toast.error(errorMessage(error, "删除失败"));
    }
  };

  const selectedProvider = providers.find((item) => item.id === form.getFieldValue("provider"));

  return (
    <div style={{ display: "grid", gap: 16 }}>
      {/* V15：这段说明第一次看有用，第二次之后一直挡着配置卡片。折起来。 */}
      <Explain title="框架已就位，未接真实银行——点开看这意味着什么" storageKey="bank-connect.intro">
        证书与协议信息可以现在就填，付款指令的生成、提交、状态回写整条链路都能走通——
        走的是<Typography.Text code>演示适配器</Typography.Text>
        。真实银行的报文实现留给有对接需求时接入，接入后这里的配置无需改动。
        <br />
        证书内容不存进系统，这里填的是证书<strong>路径或密钥库别名</strong>；密码保存后永不回显。
      </Explain>

      {loadError && <Alert type="error" showIcon message={loadError} />}

      {loading ? (
        <Skeleton active paragraph={{ rows: 4 }} />
      ) : items.length === 0 ? (
        <Empty description="还没有银企配置">
          <Button type="primary" icon={<PlusOutlined />} onClick={() => openEditor(null)}>
            添加第一个付款账号
          </Button>
        </Empty>
      ) : (
        <Space direction="vertical" size={12} style={{ width: "100%" }}>
          {items.map((config) => (
            <Card
              key={config.id}
              size="small"
              title={
                <Space>
                  <span>{config.displayName}</span>
                  <Typography.Text code>{config.payerAccount}</Typography.Text>
                  {config.enabled ? (
                    <Tag color="success">已启用</Tag>
                  ) : (
                    <Tag>未启用</Tag>
                  )}
                  {/* 「已保存」与「已接入」分开显示——只写「未连接」会让人以为填错了 */}
                  {config.isProviderAvailable ? (
                    <Tag color="blue">适配器已接入</Tag>
                  ) : (
                    <Tag color="warning">适配器尚未接入</Tag>
                  )}
                </Space>
              }
              extra={
                <Space size={4}>
                  <Button
                    size="small"
                    icon={<ThunderboltOutlined />}
                    loading={testingId === config.id}
                    onClick={() => void handleTest(config)}
                  >
                    测试连接
                  </Button>
                  <Button
                    size="small"
                    icon={<WalletOutlined />}
                    disabled={!config.isProviderAvailable}
                    onClick={() => void handleBalance(config)}
                  >
                    查余额
                  </Button>
                  <Button size="small" onClick={() => openEditor(config)}>
                    编辑
                  </Button>
                  <Popconfirm
                    title="删除这个银企配置？"
                    description="已提交过指令的配置删不掉——那会让指令查不出是从哪个户发出去的。"
                    onConfirm={() => void handleDelete(config)}
                  >
                    <Button size="small" danger>
                      删除
                    </Button>
                  </Popconfirm>
                </Space>
              }
            >
              <Descriptions size="small" column={2}>
                <Descriptions.Item label="银行">
                  {providers.find((item) => item.id === config.provider)?.name ?? config.provider}
                </Descriptions.Item>
                <Descriptions.Item label="签名算法">{config.signAlgorithm}</Descriptions.Item>
                <Descriptions.Item label="客户号">{config.customerNo || "—"}</Descriptions.Item>
                <Descriptions.Item label="接口地址">{config.endpoint || "—"}</Descriptions.Item>
                <Descriptions.Item label="证书">
                  {config.certRef || <Typography.Text type="warning">未填</Typography.Text>}
                  {config.hasCertPassword ? (
                    <Tag style={{ marginLeft: 8 }}>密码已设</Tag>
                  ) : (
                    <Tag color="warning" style={{ marginLeft: 8 }}>
                      密码未设
                    </Tag>
                  )}
                </Descriptions.Item>
                <Descriptions.Item label="证书有效期">
                  {config.certExpiresOn ?? "—"}
                </Descriptions.Item>
                <Descriptions.Item label="上次测试" span={2}>
                  {config.lastTestAt === null ? (
                    <Typography.Text type="secondary">从未测试</Typography.Text>
                  ) : (
                    <Space>
                      <Badge status={config.lastTestOk ? "success" : "error"} />
                      <span>{config.lastTestMsg}</span>
                      <Typography.Text type="secondary">
                        {new Date(config.lastTestAt).toLocaleString("zh-CN")}
                      </Typography.Text>
                    </Space>
                  )}
                </Descriptions.Item>
                {balances[config.id] !== undefined && (
                  <Descriptions.Item label="可用余额" span={2}>
                    <Typography.Text strong>{balances[config.id]}</Typography.Text>
                  </Descriptions.Item>
                )}
              </Descriptions>
            </Card>
          ))}
          <Button icon={<PlusOutlined />} onClick={() => openEditor(null)}>
            添加付款账号
          </Button>
        </Space>
      )}

      <Modal
        open={creating}
        title={editing ? "编辑银企配置" : "添加银企配置"}
        okText="保存"
        cancelText="取消"
        width={640}
        confirmLoading={saving}
        onCancel={() => {
          setCreating(false);
          setEditing(null);
        }}
        onOk={() => form.submit()}
      >
        <Form<FormValues>
          form={form}
          layout="vertical"
          onFinish={(values) => void handleSave(values)}
        >
          <Form.Item name="provider" label="银行" rules={[{ required: true, message: "请选择银行" }]}>
            <Select
              placeholder="选择银行"
              onChange={(value: string) => {
                const meta = providers.find((item) => item.id === value);
                if (meta) form.setFieldsValue({ signAlgorithm: meta.defaultSignAlgorithm });
              }}
              options={providers.map((item) => ({ value: item.id, label: item.name }))}
            />
          </Form.Item>

          {selectedProvider && (
            <Alert
              type="info"
              showIcon
              style={{ marginBottom: 16 }}
              message={selectedProvider.certHint}
            />
          )}

          <Space align="start" style={{ width: "100%" }}>
            <Form.Item name="displayName" label="显示名称" extra="给自己看的，如「工行主账户」">
              <Input style={{ width: 220 }} maxLength={40} />
            </Form.Item>
            <Form.Item
              name="payerAccount"
              label="付款账号"
              rules={[{ required: true, message: "请填写付款账号" }]}
              extra="一个账号一条配置"
            >
              <Input style={{ width: 260 }} maxLength={32} />
            </Form.Item>
          </Space>

          <Space align="start" style={{ width: "100%" }}>
            <Form.Item name="customerNo" label="客户号" extra="银行分配的企业客户编号">
              <Input style={{ width: 220 }} maxLength={64} />
            </Form.Item>
            <Form.Item name="signAlgorithm" label="签名算法">
              <Select
                style={{ width: 120 }}
                options={[
                  { value: "RSA", label: "RSA" },
                  { value: "SM2", label: "SM2（国密）" }
                ]}
              />
            </Form.Item>
          </Space>

          <Form.Item name="endpoint" label="接口地址" extra="必须是 https 开头的完整地址">
            <Input placeholder="https://" maxLength={200} />
          </Form.Item>

          <Form.Item
            name="certRef"
            label="证书路径或别名"
            extra="填路径或密钥库别名，不要粘贴证书内容——证书内容不存进系统"
          >
            <Input placeholder="/certs/company.pfx" maxLength={200} />
          </Form.Item>

          <Form.Item
            name="certPassword"
            label="证书密码"
            extra={
              editing?.hasCertPassword
                ? "已设置。留空表示保持原密码不变"
                : "保存后不再回显"
            }
          >
            <Input.Password
              placeholder={editing?.hasCertPassword ? "留空则不修改" : ""}
              maxLength={100}
              autoComplete="new-password"
            />
          </Form.Item>

          <Space align="start" style={{ width: "100%" }}>
            <Form.Item name="certFingerprint" label="证书指纹" extra="便于核对是哪一张证书">
              <Input style={{ width: 260 }} maxLength={100} />
            </Form.Item>
            <Form.Item name="certExpiresOn" label="证书到期日" extra="YYYY-MM-DD">
              <Input style={{ width: 160 }} placeholder="2030-12-31" maxLength={10} />
            </Form.Item>
          </Space>

          <Form.Item
            name="enabled"
            label="启用"
            valuePropName="checked"
            extra="未启用的配置不能提交付款指令"
          >
            <Switch />
          </Form.Item>

          <Form.Item name="note" label="备注">
            <Input.TextArea rows={2} maxLength={200} showCount />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
}
