/**
 * 发票录入的三个弹窗：手动录入 / OCR 识别 / 导入数电票。
 *
 * 从 InvoicesPage 抽出来的原因有两个：
 * 1) 那个文件已经 500+ 行，弹窗是三段互不相干的表单，抽走后主文件只剩「看台账」这件事；
 * 2) 弹窗是「录入」这条支线，和台账主视图不属于同一件事，放一起读起来也乱。
 * 状态仍由 InvoicesPage 持有——弹窗提交后要刷新台账，状态留在一处才不会分叉。
 */
import React from "react";
import { Alert, Col, DatePicker, Form, Input, Modal, Row, Select, Space, Upload } from "antd";
import type { FormInstance } from "antd";
import { AuditOutlined, CameraOutlined, ImportOutlined } from "@ant-design/icons";
import type { RcFile } from "antd/es/upload";
import { INV_TYPE_LABELS } from "./invoice-labels";

export type InvoiceEntryModalsProps = {
  /** 手动录入表单实例；OCR 识别结果也回填到它上面。 */
  form: FormInstance;
  entry: {
    open: boolean;
    /** OCR 预填过时给一条提示，让用户知道字段不是自己敲的。 */
    prefilledByOcr: boolean;
    onSubmit: () => void;
    onCancel: () => void;
  };
  ocr: {
    open: boolean;
    text: string;
    loading: boolean;
    onTextChange: (value: string) => void;
    onUploadImage: (file: RcFile) => boolean | Promise<boolean>;
    onSubmit: () => void;
    onCancel: () => void;
  };
  eInvoice: {
    open: boolean;
    text: string;
    loading: boolean;
    errors: string[] | null;
    onTextChange: (value: string) => void;
    onSubmit: () => void;
    onCancel: () => void;
  };
};

const E_INVOICE_PLACEHOLDER = [
  "{",
  '  "invoiceNumber": "25332000000012345678",',
  '  "issueDate": "2026-07-10",',
  '  "sellerTaxNo": "91330000MA2XXXXXXX",',
  '  "buyerTaxNo": "91330000MA2YYYYYYY",',
  '  "amount": 1000.00,',
  '  "tax": 130.00,',
  '  "total": 1130.00,',
  '  "direction": "input"',
  "}"
].join("\n");

export function InvoiceEntryModals({ form, entry, ocr, eInvoice }: InvoiceEntryModalsProps) {
  return (
    <>
      <Modal
        title={<Space><AuditOutlined />录入发票</Space>}
        open={entry.open}
        onOk={entry.onSubmit}
        onCancel={entry.onCancel}
        okText="保存"
        cancelText="取消"
        width={580}
      >
        {entry.prefilledByOcr && (
          <Alert type="success" showIcon message="OCR 识别结果已预填，请核对后保存" style={{ marginBottom: 12 }} />
        )}
        <Form form={form} layout="vertical" size="small" style={{ paddingTop: 8 }}>
          <Row gutter={12}>
            <Col span={8}>
              <Form.Item name="direction" label="发票方向" initialValue="input">
                <Select options={[{ value: "input", label: "进项" }, { value: "output", label: "销项" }]} />
              </Form.Item>
            </Col>
            <Col span={8}>
              <Form.Item name="invoiceType" label="发票类型" initialValue="vat_special">
                <Select options={Object.entries(INV_TYPE_LABELS).map(([value, label]) => ({ value, label }))} />
              </Form.Item>
            </Col>
            <Col span={8}>
              <Form.Item name="invoiceDate" label="开票日期" rules={[{ required: true }]}>
                <DatePicker style={{ width: "100%" }} />
              </Form.Item>
            </Col>
          </Row>
          <Row gutter={12}>
            <Col span={12}>
              <Form.Item name="invoiceCode" label="发票代码">
                <Input placeholder="10位或12位" />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item name="invoiceNo" label="发票号码" rules={[{ required: true }]}>
                <Input placeholder="8位数字" />
              </Form.Item>
            </Col>
          </Row>
          <Form.Item name="sellerName" label="销售方名称" rules={[{ required: true }]}>
            <Input placeholder="开票单位名称" />
          </Form.Item>
          <Row gutter={12}>
            <Col span={12}>
              <Form.Item name="sellerTaxNo" label="销售方税号">
                <Input placeholder="纳税人识别号" />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item name="buyerName" label="购买方名称">
                <Input placeholder="本公司名称" />
              </Form.Item>
            </Col>
          </Row>
          <Row gutter={12}>
            <Col span={8}>
              <Form.Item name="amount" label="不含税金额">
                <Input prefix="¥" placeholder="0.00" />
              </Form.Item>
            </Col>
            <Col span={8}>
              <Form.Item name="taxAmount" label="税额">
                <Input prefix="¥" placeholder="0.00" />
              </Form.Item>
            </Col>
            <Col span={8}>
              <Form.Item name="taxRate" label="税率">
                <Input suffix="%" placeholder="13" />
              </Form.Item>
            </Col>
          </Row>
          <Form.Item name="businessEventId" label="关联事项 ID（可选）">
            <Input placeholder="粘贴经营事项 ID" />
          </Form.Item>
        </Form>
      </Modal>

      <Modal
        title={<Space><CameraOutlined />OCR 发票识别</Space>}
        open={ocr.open}
        onOk={ocr.onSubmit}
        onCancel={ocr.onCancel}
        okText="识别"
        cancelText="取消"
        confirmLoading={ocr.loading}
        width={520}
      >
        <Alert type="info" showIcon style={{ marginBottom: 12 }}
          message="方法一：上传发票图片（JPG/PNG）；方法二：粘贴发票文字内容" />
        <Upload.Dragger accept=".jpg,.jpeg,.png" showUploadList={false}
          beforeUpload={ocr.onUploadImage} style={{ marginBottom: 12 }}>
          <div style={{ padding: "12px 0" }}>
            <CameraOutlined style={{ fontSize: 24, color: "#2563eb", marginBottom: 6 }} />
            <p style={{ fontSize: 13, margin: 0 }}>点击或拖拽发票图片</p>
          </div>
        </Upload.Dragger>
        <Input.TextArea
          value={ocr.text}
          onChange={(event) => ocr.onTextChange(event.target.value)}
          placeholder="或粘贴发票文字内容（发票代码、号码、金额、开票日期、购销双方名称等）"
          rows={5}
          style={{ fontSize: 12 }}
        />
      </Modal>

      <Modal
        title={<Space><ImportOutlined />导入数电票</Space>}
        open={eInvoice.open}
        onOk={eInvoice.onSubmit}
        onCancel={eInvoice.onCancel}
        okText="解析并导入"
        cancelText="取消"
        confirmLoading={eInvoice.loading}
        width={560}
      >
        <Alert type="info" showIcon style={{ marginBottom: 12 }}
          message="粘贴数电票结构化 JSON，字段包含 invoiceNumber、issueDate、sellerTaxNo、buyerTaxNo、amount、tax、total，direction 可选（input 进项 / output 销项）" />
        <Input.TextArea
          value={eInvoice.text}
          onChange={(event) => eInvoice.onTextChange(event.target.value)}
          placeholder={E_INVOICE_PLACEHOLDER}
          rows={10}
          style={{ fontSize: 12, fontFamily: "monospace" }}
        />
        {eInvoice.errors && (
          <Alert
            type="error"
            showIcon
            style={{ marginTop: 12 }}
            message="数电票校验未通过"
            description={(
              <ul style={{ margin: 0, paddingLeft: 18 }}>
                {eInvoice.errors.map((error) => <li key={error}>{error}</li>)}
              </ul>
            )}
          />
        )}
      </Modal>
    </>
  );
}
