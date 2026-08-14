import { Modal, Form, Select, Input, Typography, Alert, Space } from "antd";
import { PlusOutlined } from "@ant-design/icons";
import { useEffect, useState } from "react";
import type { CostCenter, VoucherTemplate } from "../../lib/api";
import { listCostCenters } from "../../lib/api";
import { VALIDATION_GUIDE_ITEMS } from "./validation-hints";
import { Term } from "../../components/ui/Term";

const { Text } = Typography;

interface VoucherCreateForm {
  templateKey: string;
  businessEventId: string;
  amount: string;
  summary: string;
  /** 外币业务（V12-D5）。留空即人民币。 */
  currency?: string;
  /** 成本中心（V12-D1）。留空则费用落进部门报表的「未指定」分组。 */
  costCenterId?: string;
}

interface VoucherCreateModalProps {
  open: boolean;
  templates: VoucherTemplate[];
  initialEventId?: string;
  creating: boolean;
  onSubmit: (form: VoucherCreateForm) => Promise<void>;
  onClose: () => void;
}

export function VoucherCreateModal({
  open, templates, initialEventId, creating, onSubmit, onClose,
}: VoucherCreateModalProps) {
  const [form] = Form.useForm<VoucherCreateForm>();
  const [costCenters, setCostCenters] = useState<CostCenter[]>([]);

  // 只在弹窗打开时拉：成本中心清单不常变，没必要跟着页面一起加载。
  useEffect(() => {
    if (!open) return;
    void listCostCenters()
      .then((payload) => setCostCenters(payload.items))
      // 拉不到就让选择器空着——它是可选维度，不该因此挡住建凭证。
      .catch(() => setCostCenters([]));
  }, [open]);

  function handleOk() {
    void form.validateFields().then((values) => {
      void onSubmit(values);
    });
  }

  return (
    <Modal
      title={
        <Space>
          <PlusOutlined />
          <span>按模板生成<Term k="voucher">凭证</Term></span>
        </Space>
      }
      open={open}
      onOk={handleOk}
      onCancel={onClose}
      okText="生成凭证"
      cancelText="取消"
      confirmLoading={creating}
      width={480}
      afterOpenChange={visible => {
        if (visible) {
          form.setFieldsValue({ businessEventId: initialEventId ?? "", templateKey: "sales" });
        }
      }}
    >
      <Alert
        type="info"
        showIcon
        message="选择凭证模板，系统将按模板生成标准分录草稿，您可在详情区修改摘要后审核过账。"
        style={{ marginBottom: 16, borderRadius: 8 }}
      />
      <Form form={form} layout="vertical" size="middle">
        <Form.Item
          name="templateKey"
          label="凭证模板"
          rules={[{ required: true, message: "请选择模板" }]}
        >
          <Select placeholder="选择模板">
            {templates.map(t => (
              <Select.Option key={t.key} value={t.key}>
                {t.label}
              </Select.Option>
            ))}
          </Select>
        </Form.Item>
        <Form.Item
          name="businessEventId"
          label={<span>关联事项编号 <Text type="secondary" style={{ fontSize: 11 }}>(可选)</Text></span>}
        >
          <Input placeholder="粘贴或输入事项 ID" />
        </Form.Item>
        <Form.Item
          name="currency"
          label={<span>币种 <Text type="secondary" style={{ fontSize: 11 }}>(外币业务才填)</Text></span>}
          extra="填了就按业务发生日的汇率折算成人民币入账；汇率在总账「做期末外币调汇」里维护。留空即人民币业务。"
        >
          <Input placeholder="留空 = 人民币；外币填 USD、EUR 等三字母码" maxLength={3} />
        </Form.Item>
        <Form.Item
          name="amount"
          label="金额"
          extra="填了币种时这里是原币金额，不是折算后的人民币金额。"
          rules={[
            { required: true, message: "请输入金额" },
            { pattern: /^\d+(\.\d{1,2})?$/, message: "请输入有效金额" },
          ]}
        >
          <Input placeholder="0.00" />
        </Form.Item>
        <Form.Item
          name="costCenterId"
          label={<span>成本中心 <Text type="secondary" style={{ fontSize: 11 }}>(可选)</Text></span>}
          extra="只贴给费用类科目；银行存款、应交税费这些不属于任何部门的行不会带上它。留空则该笔费用落进部门报表的「未指定」分组。"
        >
          <Select
            allowClear
            placeholder={costCenters.length === 0 ? "还没有成本中心，先去经营报告里新建" : "留空 = 不指定"}
            options={costCenters.map((item) => ({
              value: item.id,
              label: `${item.code} ${item.name}`
            }))}
          />
        </Form.Item>
        <Form.Item name="summary" label={<span>摘要 <Text type="secondary" style={{ fontSize: 11 }}>(可选)</Text></span>}>
          <Input placeholder="凭证摘要，留空则使用模板默认摘要" />
        </Form.Item>
      </Form>
      <div
        style={{
          borderRadius: 8,
          background: "#f8fafc",
          border: "1px solid #e2e8f0",
          padding: "8px 12px",
          fontSize: 12,
          color: "#64748b",
          lineHeight: 1.8,
        }}
      >
        <Text strong style={{ fontSize: 12, color: "#475569" }}>生成后借贷校验不过怎么办：</Text>
        {VALIDATION_GUIDE_ITEMS.map(item => (
          <div key={item.problem}>· {item.problem}：{item.advice}</div>
        ))}
      </div>
    </Modal>
  );
}
