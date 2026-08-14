/**
 * 期末外币调汇（V12-D5）。
 *
 * 两段：上面维护汇率，下面按截止日预览差额并生成草稿凭证。合成一个面板是因为
 * 这两件事在时间上紧挨着——调汇前发现缺汇率，得能就地补上，而不是跳去另一个页面
 * 再跳回来。
 */

// `React` 这个默认导入看着冗余（构建走 automatic JSX runtime，用不到它），
// 但**渲染测试需要它**：node --test 下的 tsx 用的是 classic runtime，JSX 会被
// 转成 React.createElement，缺了它渲染时抛 "React is not defined"。
// 有渲染测试的面板都带着它（如 BalanceSheetPanel），删了测试会红。
import React, { useCallback, useEffect, useState } from "react";
import {
  Alert,
  Button,
  Card,
  DatePicker,
  Form,
  Input,
  InputNumber,
  Space,
  Table,
  Tag,
  Typography
} from "antd";
import { ReloadOutlined } from "@ant-design/icons";
import { toast } from "sonner";
import {
  createRevaluationVoucher,
  listExchangeRates,
  previewRevaluation,
  upsertExchangeRate,
  type ExchangeRate,
  type RevaluationPreview
} from "../../lib/api";
import { errorMessage, todayIso } from "../../lib/errors";

const { Text } = Typography;

export function LedgerRevaluationPanel() {
  const [rates, setRates] = useState<ExchangeRate[]>([]);
  const [preview, setPreview] = useState<RevaluationPreview | null>(null);
  const [asOfDate, setAsOfDate] = useState<string>(todayIso());
  const [loading, setLoading] = useState(false);
  const [rateForm] = Form.useForm();

  const loadRates = useCallback(async () => {
    try {
      const payload = await listExchangeRates();
      setRates(payload.rates);
    } catch (err) {
      toast.error(errorMessage(err, "汇率加载失败"));
    }
  }, []);

  const loadPreview = useCallback(async (date: string) => {
    setLoading(true);
    try {
      setPreview(await previewRevaluation(date));
    } catch (err) {
      toast.error(errorMessage(err, "调汇预览失败"));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadRates();
    void loadPreview(asOfDate);
    // asOfDate 变化由日期选择器显式触发，不放进依赖——否则每次 setState 都会重拉
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loadRates, loadPreview]);

  const handleSaveRate = useCallback(async () => {
    try {
      const values = await rateForm.validateFields();
      await upsertExchangeRate({
        currency: String(values.currency).toUpperCase(),
        rateDate: values.rateDate?.format?.("YYYY-MM-DD") ?? values.rateDate,
        rate: Number(values.rate),
        note: values.note
      });
      toast.success("汇率已保存；同一天同一币种只保留一条，再录是更新");
      rateForm.resetFields();
      await loadRates();
      await loadPreview(asOfDate);
    } catch (err) {
      if (err && typeof err === "object" && "errorFields" in err) return;
      toast.error(errorMessage(err, "汇率保存失败"));
    }
  }, [rateForm, loadRates, loadPreview, asOfDate]);

  const handleCreateVoucher = useCallback(async () => {
    try {
      const result = await createRevaluationVoucher(asOfDate);
      toast.success(`${result.notice}（${result.lineCount} 行）`);
      await loadPreview(asOfDate);
    } catch (err) {
      toast.error(errorMessage(err, "调汇凭证生成失败"));
    }
  }, [asOfDate, loadPreview]);

  const adjustableCount = (preview?.lines ?? []).filter((line) => line.needsAdjustment).length;
  const hasMissingRates = (preview?.missingRates.length ?? 0) > 0;

  return (
    <Space direction="vertical" size={16} style={{ width: "100%" }}>
      <Alert
        type="info"
        showIcon
        message="调汇只重估外币货币性项目"
        description="外币货币资金、应收应付按资产负债表日汇率重估；预付账款、存货这类以历史成本计量的非货币性项目按准则不调（准则 19 号第十二条）。生成的是草稿凭证，请复核汇率与差额后再过账。"
      />

      <Card size="small" title="汇率维护">
        <Form form={rateForm} layout="inline" style={{ rowGap: 12, flexWrap: "wrap" }}>
          <Form.Item name="currency" rules={[{ required: true, message: "填币种" }]}>
            <Input placeholder="USD" style={{ width: 100 }} maxLength={3} />
          </Form.Item>
          <Form.Item name="rateDate" rules={[{ required: true, message: "选日期" }]}>
            <DatePicker placeholder="汇率日期" />
          </Form.Item>
          <Form.Item name="rate" rules={[{ required: true, message: "填汇率" }]}>
            <InputNumber placeholder="7.180000" min={0} precision={6} style={{ width: 140 }} />
          </Form.Item>
          <Form.Item name="note">
            <Input placeholder="来源说明，如「央行中间价」" style={{ width: 220 }} />
          </Form.Item>
          <Form.Item>
            <Button type="primary" onClick={() => void handleSaveRate()}>
              保存汇率
            </Button>
          </Form.Item>
        </Form>
        <Text type="secondary" style={{ fontSize: 12 }}>
          汇率是「1 外币 = N 人民币」。同一天同一币种只保留一条——录错了就改那一条，
          而不是再录一条让取数靠先后顺序撞运气。
        </Text>

        <Table
          size="small"
          rowKey="id"
          style={{ marginTop: 12 }}
          dataSource={rates}
          pagination={{ pageSize: 5, hideOnSinglePage: true }}
          columns={[
            { title: "币种", dataIndex: "currency", width: 80 },
            { title: "日期", dataIndex: "rateDate", width: 120 },
            { title: "汇率", dataIndex: "rateDisplay", align: "right" as const, width: 120 },
            { title: "来源", dataIndex: "source", width: 100 },
            { title: "备注", dataIndex: "note", ellipsis: true }
          ]}
        />
      </Card>

      <Card
        size="small"
        title="期末调汇"
        extra={
          <Space>
            <DatePicker
              placeholder={asOfDate}
              onChange={(value) => {
                const next = value?.format("YYYY-MM-DD") ?? todayIso();
                setAsOfDate(next);
                void loadPreview(next);
              }}
            />
            <Button icon={<ReloadOutlined />} onClick={() => void loadPreview(asOfDate)}>
              刷新
            </Button>
            <Button
              type="primary"
              disabled={adjustableCount === 0 || hasMissingRates}
              onClick={() => void handleCreateVoucher()}
            >
              生成调汇草稿凭证
            </Button>
          </Space>
        }
      >
        {hasMissingRates ? (
          <Alert
            type="warning"
            showIcon
            style={{ marginBottom: 12 }}
            message={`缺少这些币种的汇率：${preview?.missingRates.join("、")}`}
            description="缺一个币种就整张凭证都不生成——账上出现一部分币种调了、一部分没调，而凭证本身看不出缺了谁，比不调更难查。"
          />
        ) : null}

        <Table
          size="small"
          rowKey={(row) => `${row.accountCode}-${row.currency}`}
          loading={loading}
          dataSource={preview?.lines ?? []}
          pagination={false}
          locale={{ emptyText: `截至 ${asOfDate} 没有外币余额` }}
          columns={[
            { title: "科目", dataIndex: "accountCode", width: 90 },
            { title: "科目名称", dataIndex: "accountName", ellipsis: true },
            { title: "币种", dataIndex: "currency", width: 70 },
            { title: "外币余额", dataIndex: "foreignBalance", align: "right" as const, width: 120 },
            { title: "账面本位币", dataIndex: "baseBookBalance", align: "right" as const, width: 120 },
            { title: "期末汇率", dataIndex: "closingRate", align: "right" as const, width: 110 },
            {
              title: "差额",
              dataIndex: "difference",
              align: "right" as const,
              width: 120,
              render: (value: string | null, row) =>
                value === null ? (
                  <Text type="secondary">—</Text>
                ) : (
                  <Text type={row.isGain ? "success" : "danger"}>{value}</Text>
                )
            },
            {
              title: "状态",
              dataIndex: "needsAdjustment",
              width: 100,
              render: (needs: boolean, row) =>
                needs ? (
                  <Tag color={row.isGain ? "green" : "red"}>{row.isGain ? "汇兑收益" : "汇兑损失"}</Tag>
                ) : (
                  <Tag>不调整</Tag>
                )
            },
            { title: "说明", dataIndex: "reason", ellipsis: true }
          ]}
        />

        {preview ? (
          <Text style={{ display: "block", marginTop: 12 }}>
            截至 {preview.asOfDate}，需调整 {adjustableCount} 项，汇兑净
            {Number(preview.netGainLoss) >= 0 ? "收益" : "损失"}{" "}
            <Text strong>{Math.abs(Number(preview.netGainLoss)).toFixed(2)}</Text> 元。
          </Text>
        ) : null}
      </Card>
    </Space>
  );
}
