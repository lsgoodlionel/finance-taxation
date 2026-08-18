/**
 * 发起申请表单（V13-B8）。
 *
 * 四种申请类型（出差/采购/用款/其他）共用一张表单，用类型切换而不是四个页面——
 * 字段差别只在文案上，做成四份必然漂移。
 */

import React from "react";
import { Alert, Button, DatePicker, Form, Input, InputNumber, Radio, Select, Space } from "antd";
import type { Dayjs } from "dayjs";
import type { RequestType } from "../../lib/api-expense-control";
import { REQUEST_TYPE_LABELS } from "./request-view";

export interface CostCenterOption {
  id: string;
  name: string;
}

export interface RequestCreateFormProps {
  costCenters: readonly CostCenterOption[];
  submitting?: boolean;
  onSubmit: (body: {
    requestType: RequestType;
    title: string;
    purpose: string;
    amountCents: number;
    costCenterId: string | null;
    accountCode: string | null;
    expectedDate: string;
    note: string | null;
  }) => void;
}

interface FormValues {
  requestType: RequestType;
  title: string;
  purpose: string;
  amountYuan: number;
  costCenterId?: string;
  accountCode?: string;
  expectedDate: Dayjs;
  note?: string;
}

export function RequestCreateForm({ costCenters, submitting, onSubmit }: RequestCreateFormProps) {
  const [form] = Form.useForm<FormValues>();

  return (
    <Form<FormValues>
      form={form}
      layout="vertical"
      initialValues={{ requestType: "travel" }}
      onFinish={(values) =>
        onSubmit({
          requestType: values.requestType,
          title: values.title.trim(),
          purpose: values.purpose?.trim() ?? "",
          // 表单收元、接口收分。在这里换算并取整——把小数分留给后端会被
          // 「必须是整数分」直接拒掉，而用户看不懂那句话。
          amountCents: Math.round(values.amountYuan * 100),
          costCenterId: values.costCenterId ?? null,
          accountCode: values.accountCode?.trim() || null,
          expectedDate: values.expectedDate.format("YYYY-MM-DD"),
          note: values.note?.trim() || null
        })
      }
    >
      <Form.Item name="requestType" label="申请类型">
        <Radio.Group
          optionType="button"
          options={(Object.keys(REQUEST_TYPE_LABELS) as RequestType[]).map((type) => ({
            label: REQUEST_TYPE_LABELS[type],
            value: type
          }))}
        />
      </Form.Item>

      <Form.Item
        name="title"
        label="事由标题"
        rules={[{ required: true, message: "请填写标题" }]}
      >
        <Input placeholder="例如：去上海参加客户验收" maxLength={60} />
      </Form.Item>

      <Form.Item
        name="purpose"
        label="详细事由"
        extra="审批人主要看这一段决定批不批，写清楚能省掉一轮来回"
      >
        <Input.TextArea rows={3} maxLength={300} showCount />
      </Form.Item>

      <Form.Item
        name="amountYuan"
        label="预计金额（元）"
        rules={[{ required: true, message: "请填写预计金额" }]}
      >
        <InputNumber min={0} precision={2} style={{ width: "100%" }} />
      </Form.Item>

      <Form.Item
        name="expectedDate"
        label="预计发生日"
        rules={[{ required: true, message: "请选择预计发生日" }]}
        extra="预算按这个日期归期：12 月底申请次年 1 月的差旅，占的是次年预算"
      >
        <DatePicker style={{ width: "100%" }} />
      </Form.Item>

      <Form.Item name="costCenterId" label="费用归属部门">
        <Select
          allowClear
          placeholder="未指定"
          options={costCenters.map((item) => ({ label: item.name, value: item.id }))}
        />
      </Form.Item>

      <Form.Item
        name="accountCode"
        label="费用科目"
        extra="填了才能做预算校验。还没想好可以留空，之后补"
      >
        <Input placeholder="例如 660203" allowClear />
      </Form.Item>

      <Alert
        type="info"
        showIcon
        style={{ marginBottom: 16 }}
        message="提交后不能再改内容"
        description="审批中还能改金额，等于审批人批的和最终生效的不是一个东西。要改请先撤回。"
      />

      <Form.Item name="note" label="备注">
        <Input.TextArea rows={2} maxLength={200} showCount />
      </Form.Item>

      <Space>
        <Button type="primary" htmlType="submit" loading={submitting}>
          保存为草稿
        </Button>
        <Button onClick={() => form.resetFields()}>重填</Button>
      </Space>
    </Form>
  );
}
