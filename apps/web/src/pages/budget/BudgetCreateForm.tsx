/**
 * 立预算表单（V13-A2）。
 *
 * 三个维度（期间 / 部门 / 科目）+ 金额 + 控制策略。后两个维度留空即「全公司」
 * 「不限科目」，表单上写明这一点——留空在这里是**明确的选择**而不是漏填。
 */

import React, { useState } from "react";
import { Button, DatePicker, Form, Input, InputNumber, Radio, Select, Space, Typography } from "antd";
import type { Dayjs } from "dayjs";
import type {
  BudgetControlPolicy,
  BudgetPeriodType,
  CreateBudgetBody
} from "../../lib/api-expense-control";

export interface CostCenterOption {
  id: string;
  name: string;
}

export interface BudgetCreateFormProps {
  costCenters: readonly CostCenterOption[];
  submitting?: boolean;
  onSubmit: (body: CreateBudgetBody) => void;
}

interface FormValues {
  periodType: BudgetPeriodType;
  period: Dayjs;
  costCenterId?: string;
  accountCode?: string;
  amountYuan: number;
  controlPolicy: BudgetControlPolicy;
  note?: string;
}

/** DatePicker 的 picker 模式与期间类型一一对应。 */
const PICKER_BY_TYPE: Record<BudgetPeriodType, "month" | "quarter" | "year"> = {
  month: "month",
  quarter: "quarter",
  year: "year"
};

/**
 * Dayjs → 期间键。
 *
 * 三种格式与后端 `budgets_period_key_matches_type` 的 CHECK 约束一致：
 * `2026-06` / `2026-Q2` / `2026`。格式对不上会被库直接拒——在这里拼对，
 * 比让用户撞一个「violates check constraint」的错误强得多。
 */
function toPeriodKey(periodType: BudgetPeriodType, value: Dayjs): string {
  if (periodType === "month") return value.format("YYYY-MM");
  if (periodType === "quarter") {
    // 不用 `value.quarter()`：那需要 dayjs 的 quarterOfYear 插件，而本仓库
    // 没有引入。为一次除法引一个全局插件，会让「哪些 dayjs 方法可用」变成
    // 一个要查配置才知道的问题。month() 是 0-based，所以整除 3 再加 1。
    return `${value.format("YYYY")}-Q${Math.floor(value.month() / 3) + 1}`;
  }
  return value.format("YYYY");
}

export function BudgetCreateForm({ costCenters, submitting, onSubmit }: BudgetCreateFormProps) {
  const [form] = Form.useForm<FormValues>();
  const [periodType, setPeriodType] = useState<BudgetPeriodType>("month");

  const handleFinish = (values: FormValues) => {
    onSubmit({
      periodType: values.periodType,
      periodKey: toPeriodKey(values.periodType, values.period),
      costCenterId: values.costCenterId ?? null,
      accountCode: values.accountCode?.trim() || null,
      // 表单收元，接口收分。在这里换算并取整——把小数分留给后端会被
      // 「必须是整数分」直接拒掉，而用户看不懂那句话。
      amountCents: Math.round(values.amountYuan * 100),
      controlPolicy: values.controlPolicy,
      note: values.note?.trim() || null
    });
  };

  return (
    <Form<FormValues>
      form={form}
      layout="vertical"
      initialValues={{ periodType: "month", controlPolicy: "warn" }}
      onFinish={handleFinish}
    >
      <Form.Item name="periodType" label="预算周期">
        <Radio.Group
          onChange={(e) => {
            setPeriodType(e.target.value as BudgetPeriodType);
            // 周期一变，已选的期间就不再适用（月份选择器选的值不能当季度用）。
            form.setFieldValue("period", undefined);
          }}
          options={[
            { label: "月度", value: "month" },
            { label: "季度", value: "quarter" },
            { label: "年度", value: "year" }
          ]}
          optionType="button"
        />
      </Form.Item>

      <Form.Item name="period" label="期间" rules={[{ required: true, message: "请选择期间" }]}>
        <DatePicker picker={PICKER_BY_TYPE[periodType]} style={{ width: "100%" }} />
      </Form.Item>

      <Form.Item
        name="costCenterId"
        label="部门"
        extra="留空即全公司预算，管住所有部门的支出"
      >
        <Select
          allowClear
          placeholder="全公司"
          options={costCenters.map((item) => ({ label: item.name, value: item.id }))}
        />
      </Form.Item>

      <Form.Item
        name="accountCode"
        label="科目"
        extra="按前缀匹配。填 6602 会管住管理费用下的全部明细；留空则不限科目"
      >
        <Input placeholder="不限科目" allowClear />
      </Form.Item>

      <Form.Item
        name="amountYuan"
        label="预算金额（元）"
        rules={[{ required: true, message: "请填写预算金额" }]}
      >
        <InputNumber min={0} precision={2} style={{ width: "100%" }} />
      </Form.Item>

      <Form.Item name="controlPolicy" label="超支时">
        <Radio.Group
          options={[
            { label: "提示（仍可提交）", value: "warn" },
            { label: "拦截（不许提交）", value: "block" }
          ]}
        />
      </Form.Item>
      <Typography.Paragraph type="secondary" style={{ fontSize: 12, marginTop: -12 }}>
        建议先用「提示」跑一段时间。预算第一次立很难立准，一上来就拦会让大量
        正常单据提不上来。
      </Typography.Paragraph>

      <Form.Item name="note" label="备注">
        <Input.TextArea rows={2} maxLength={200} showCount />
      </Form.Item>

      <Space>
        <Button type="primary" htmlType="submit" loading={submitting}>
          立预算
        </Button>
        <Button onClick={() => form.resetFields()}>重填</Button>
      </Space>
    </Form>
  );
}
