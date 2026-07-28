/**
 * 「添加银行账户」弹窗。
 *
 * 从 BankingPage 抽出来：它是一段独立表单，和「导入流水 / 看流水 / 对账」三步无关，
 * 留在主文件里只是让那个文件更长。表单实例与开关状态仍由 BankingPage 持有。
 */
import React from "react";
import { Col, Form, Input, Modal, Row, Space, Switch } from "antd";
import type { FormInstance } from "antd";
import { BankOutlined } from "@ant-design/icons";

export type BankingAccountModalProps = {
  form: FormInstance;
  open: boolean;
  onSubmit: () => void;
  onCancel: () => void;
};

export function BankingAccountModal({ form, open, onSubmit, onCancel }: BankingAccountModalProps) {
  return (
    <Modal
      title={<Space><BankOutlined />添加银行账户</Space>}
      open={open}
      onOk={onSubmit}
      onCancel={onCancel}
      okText="添加"
      cancelText="取消"
    >
      <Form form={form} layout="vertical" size="middle" style={{ paddingTop: 8 }}>
        <Row gutter={12}>
          <Col span={12}>
            <Form.Item name="bankName" label="银行名称" rules={[{ required: true }]}>
              <Input placeholder="如：招商银行" />
            </Form.Item>
          </Col>
          <Col span={12}>
            <Form.Item name="bankCode" label="联行号（可选）">
              <Input placeholder="12位联行号" />
            </Form.Item>
          </Col>
        </Row>
        <Form.Item name="accountNo" label="银行账号" rules={[{ required: true }]}>
          <Input placeholder="银行账号" />
        </Form.Item>
        <Form.Item name="accountName" label="开户名称" rules={[{ required: true }]}>
          <Input placeholder="与银行开户名一致" />
        </Form.Item>
        <Row gutter={12}>
          <Col span={8}>
            <Form.Item name="isPrimary" label="主账户" valuePropName="checked">
              <Switch />
            </Form.Item>
          </Col>
          <Col span={8}>
            <Form.Item name="isPayroll" label="工资代发" valuePropName="checked">
              <Switch />
            </Form.Item>
          </Col>
        </Row>
        <Form.Item name="notes" label="备注">
          <Input placeholder="可选备注" />
        </Form.Item>
      </Form>
    </Modal>
  );
}
