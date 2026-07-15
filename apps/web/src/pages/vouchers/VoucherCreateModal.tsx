import { Modal, Form, Select, Input, Typography, Alert, Space } from "antd";
import { PlusOutlined } from "@ant-design/icons";
import type { VoucherTemplate } from "../../lib/api";
import { VALIDATION_GUIDE_ITEMS } from "./validation-hints";

const { Text } = Typography;

interface VoucherCreateForm {
  templateKey: string;
  businessEventId: string;
  amount: string;
  summary: string;
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
          <span>按模板生成凭证</span>
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
          name="amount"
          label="金额"
          rules={[
            { required: true, message: "请输入金额" },
            { pattern: /^\d+(\.\d{1,2})?$/, message: "请输入有效金额" },
          ]}
        >
          <Input prefix="¥" placeholder="0.00" />
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
