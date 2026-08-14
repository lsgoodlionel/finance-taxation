/**
 * 固定资产台账 · 折旧 · 处置（V12-C1 前端）。
 *
 * 折旧分「预览」与「计提」两步：计提一旦落库会被唯一索引挡住重复执行，
 * 用户在按下之前有权先看清这个月要提多少、哪些资产没提、为什么没提。
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Alert,
  Button,
  Card,
  Divider,
  Form,
  Input,
  InputNumber,
  Modal,
  Select,
  Space,
  Switch,
  Table,
  Tag,
  Typography
} from "antd";
import { PlusOutlined, ReloadOutlined } from "@ant-design/icons";
import { Term } from "../../components/ui/Term";
import { toast } from "sonner";
import { usePeriod } from "../../lib/period-context";
import {
  createFixedAsset,
  disposeFixedAsset,
  listFixedAssets,
  previewDepreciation,
  runDepreciation,
  type DepreciationPreviewItem,
  type DepreciationReason,
  type FixedAsset
} from "../../lib/api";

/**
 * 资产类别，与后端 `tax-depreciation.ts` 的 TAX_MINIMUM_LIFE_YEARS 一一对应
 *（实施条例第六十条）。标签带上法定年限，用户选的时候就能看出税会差异从哪来。
 */
const ASSET_CATEGORY_OPTIONS = [
  { value: "building", label: "房屋、建筑物（税法最低 20 年）" },
  { value: "machinery", label: "机器、机械及其他生产设备（10 年）" },
  { value: "equipment", label: "通用设备（10 年）" },
  { value: "tools", label: "器具、工具（5 年）" },
  { value: "furniture", label: "家具（5 年）" },
  { value: "vehicle", label: "运输工具（飞机火车轮船除外，4 年）" },
  { value: "electronic", label: "电子设备（3 年）" }
];


function errorMessage(err: unknown, fallback: string): string {
  return err instanceof Error ? err.message : fallback;
}

/** 把"为什么没提"翻成人话——只显示代号等于没解释。 */
const REASON_LABELS: Record<DepreciationReason, string> = {
  normal: "本期计提",
  final_trim: "末期扫尾",
  not_started: "尚未起提",
  fully_depreciated: "已提足",
  disposed: "已处置"
};

export function FixedAssetsPanel() {
  const { period } = usePeriod();
  const [assets, setAssets] = useState<FixedAsset[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [preview, setPreview] = useState<{ total: string; items: DepreciationPreviewItem[] } | null>(null);
  const [previewing, setPreviewing] = useState(false);
  const [running, setRunning] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const [disposeTarget, setDisposeTarget] = useState<FixedAsset | null>(null);
  const [createForm] = Form.useForm();
  const [disposeForm] = Form.useForm();

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await listFixedAssets();
      setAssets(res.items);
    } catch (err) {
      const message = errorMessage(err, "加载固定资产台账失败");
      setError(message);
      toast.error(message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  // 切换会计期间后原有预览是上一期的数字，留着会误导
  useEffect(() => {
    setPreview(null);
  }, [period]);

  const handlePreview = useCallback(async () => {
    setPreviewing(true);
    try {
      const res = await previewDepreciation(period);
      setPreview({ total: res.totalAmount, items: res.items });
    } catch (err) {
      toast.error(errorMessage(err, "折旧预览失败"));
    } finally {
      setPreviewing(false);
    }
  }, [period]);

  const handleRun = useCallback(async () => {
    setRunning(true);
    try {
      const res = await runDepreciation(period);
      toast.success(`已生成 ${period} 折旧草稿凭证，合计 ${res.totalAmount}，待审核过账`);
      setPreview(null);
      await load();
    } catch (err) {
      toast.error(errorMessage(err, "计提折旧失败"));
    } finally {
      setRunning(false);
    }
  }, [period, load]);

  const handleCreate = useCallback(async () => {
    try {
      const values = await createForm.validateFields();
      await createFixedAsset({
        ...values,
        originalCost: String(values.originalCost),
        salvageValue: String(values.salvageValue ?? 0)
      });
      toast.success("固定资产已建卡；按准则本月增加的资产从下月起计提折旧");
      setCreateOpen(false);
      createForm.resetFields();
      await load();
    } catch (err) {
      if (err && typeof err === "object" && "errorFields" in err) return;
      toast.error(errorMessage(err, "建卡失败"));
    }
  }, [createForm, load]);

  const handleDispose = useCallback(async () => {
    if (!disposeTarget) return;
    try {
      const values = await disposeForm.validateFields();
      const res = await disposeFixedAsset(disposeTarget.id, {
        disposedOn: values.disposedOn,
        proceeds: values.proceeds == null ? null : String(values.proceeds),
        proceedsAccountCode: values.proceedsAccountCode || null
      });
      const gainText =
        res.gain == null
          ? "价款未定，净值已挂固定资产清理"
          : Number(res.gain) >= 0
            ? `处置收益 ${res.gain}`
            : `处置损失 ${res.gain}`;
      toast.success(`已生成处置草稿凭证：净值 ${res.netBookValue}，${gainText}`);
      setDisposeTarget(null);
      disposeForm.resetFields();
      await load();
    } catch (err) {
      if (err && typeof err === "object" && "errorFields" in err) return;
      toast.error(errorMessage(err, "处置失败"));
    }
  }, [disposeTarget, disposeForm, load]);

  const columns = useMemo(
    () => [
      { title: "编号", dataIndex: "assetNo", width: 120 },
      { title: "名称", dataIndex: "name" },
      { title: "购置日期", dataIndex: "acquiredOn", width: 120 },
      { title: "原值", dataIndex: "originalCost", align: "right" as const, width: 120 },
      { title: "净残值", dataIndex: "salvageValue", align: "right" as const, width: 110 },
      { title: "使用月数", dataIndex: "usefulLifeMonths", align: "right" as const, width: 100 },
      { title: "起提期间", dataIndex: "depreciationStartPeriod", width: 110 },
      { title: "费用科目", dataIndex: "expenseAccountCode", width: 110 },
      {
        title: "状态",
        dataIndex: "status",
        width: 110,
        render: (status: FixedAsset["status"], row: FixedAsset) =>
          status === "disposed" ? (
            <Tag color="default">已处置 {row.disposedOn}</Tag>
          ) : (
            <Tag color="green">在用</Tag>
          )
      },
      {
        title: "操作",
        width: 90,
        render: (_: unknown, row: FixedAsset) =>
          row.status === "in_use" ? (
            <Button size="small" onClick={() => setDisposeTarget(row)}>
              处置
            </Button>
          ) : null
      }
    ],
    []
  );

  return (
    <div style={{ display: "grid", gap: 16 }}>
      {error ? (
        <Alert
          type="error"
          showIcon
          message="加载固定资产台账失败"
          description={error}
          action={<Button size="small" onClick={() => void load()}>重试</Button>}
        />
      ) : null}

      <Card
        title={`${period} 折旧计提`}
        extra={
          <Space>
            <Button icon={<ReloadOutlined />} loading={previewing} onClick={() => void handlePreview()}>
              预览本期折旧
            </Button>
            <Button
              type="primary"
              loading={running}
              disabled={!preview || preview.items.every((item) => Number(item.amount) === 0)}
              onClick={() => void handleRun()}
            >
              计提并生成草稿凭证
            </Button>
          </Space>
        }
        style={{ borderRadius: 12 }}
      >
        {!preview ? (
          <Typography.Paragraph type="secondary" style={{ margin: 0 }}>
            先预览再<Term k="accrual">计提</Term>：计提一旦落库会被唯一索引挡住重复执行，
            预览可以先看清本期要提多少、哪些资产没提、为什么没提。生成的是草稿
            <Term k="voucher">凭证</Term>，仍需审核<Term k="posting">过账</Term>才进
            <Term k="general-ledger">总账</Term>。
          </Typography.Paragraph>
        ) : (
          <div style={{ display: "grid", gap: 12 }}>
            <Typography.Text strong>本期应提合计：{preview.total}</Typography.Text>
            <Table
              rowKey="assetId"
              size="small"
              pagination={false}
              dataSource={preview.items}
              columns={[
                { title: "编号", dataIndex: "assetNo", width: 120 },
                { title: "名称", dataIndex: "assetName" },
                { title: "本期折旧", dataIndex: "amount", align: "right" as const, width: 120 },
                {
                  title: "说明",
                  dataIndex: "reason",
                  width: 120,
                  render: (reason: DepreciationReason) => REASON_LABELS[reason] ?? reason
                },
                { title: "费用科目", dataIndex: "expenseAccountCode", width: 110 }
              ]}
            />
          </div>
        )}
      </Card>

      <Card
        title="固定资产台账"
        extra={
          <Button type="primary" icon={<PlusOutlined />} onClick={() => setCreateOpen(true)}>
            新增资产
          </Button>
        }
        style={{ borderRadius: 12 }}
      >
        <Table
          rowKey="id"
          size="small"
          loading={loading}
          dataSource={assets}
          columns={columns}
          pagination={{ pageSize: 20, hideOnSinglePage: true }}
          locale={{ emptyText: "还没有固定资产。新增后系统会从购置次月起按直线法计提折旧。" }}
        />
      </Card>

      <Modal
        open={createOpen}
        title="新增固定资产"
        okText="建卡"
        onOk={() => void handleCreate()}
        onCancel={() => setCreateOpen(false)}
        destroyOnClose
      >
        <Form form={createForm} layout="vertical" preserve={false}>
          <Form.Item name="assetNo" label="资产编号" rules={[{ required: true, message: "请填写资产编号" }]}>
            <Input placeholder="FA-0001" />
          </Form.Item>
          <Form.Item name="name" label="资产名称" rules={[{ required: true, message: "请填写资产名称" }]}>
            <Input placeholder="服务器一批" />
          </Form.Item>
          <Form.Item
            name="acquiredOn"
            label="购置日期"
            rules={[{ required: true, pattern: /^\d{4}-\d{2}-\d{2}$/, message: "格式 YYYY-MM-DD" }]}
            extra="按准则，当月增加的固定资产当月不提折旧，从下月起计提。"
          >
            <Input placeholder="2026-01-15" />
          </Form.Item>
          <Form.Item name="originalCost" label="入账原值" rules={[{ required: true, message: "请填写原值" }]}>
            <InputNumber style={{ width: "100%" }} min={0.01} precision={2} />
          </Form.Item>
          <Form.Item name="salvageValue" label="预计净残值" initialValue={0}>
            <InputNumber style={{ width: "100%" }} min={0} precision={2} />
          </Form.Item>
          <Form.Item
            name="usefulLifeMonths"
            label="预计使用月数"
            rules={[{ required: true, message: "请填写使用月数" }]}
          >
            <InputNumber style={{ width: "100%" }} min={1} precision={0} placeholder="60" />
          </Form.Item>
          <Form.Item
            name="expenseAccountCode"
            label="折旧费用科目"
            rules={[{ required: true, message: "请填写费用科目" }]}
            extra="管理用设备填 660202（管理费用-折旧），车间设备应填制造费用科目。"
          >
            <Input placeholder="660202" />
          </Form.Item>

          <Form.Item
            name="category"
            label="资产类别"
            initialValue="equipment"
            extra="决定税法最低折旧年限（实施条例第六十条），填错会让纳税调整算错。"
          >
            <Select options={ASSET_CATEGORY_OPTIONS} />
          </Form.Item>

          <Divider plain style={{ marginTop: 8 }}>
            税务处理（可留空）
          </Divider>
          <Alert
            type="info"
            showIcon
            style={{ marginBottom: 16 }}
            message="这一段只影响纳税调整，不改变账簿折旧"
            description="账上每月提多少仍按上面的会计年限走；这里填的是税法口径，差额进《资产折旧、摊销及纳税调整明细表》。留空即「按会计口径、不加速、不选一次性扣除」。"
          />

          <Form.Item
            name="taxCategory"
            label="税法分类"
            extra="与会计分类不同时才填。留空则用上面的资产类别。"
          >
            <Select allowClear placeholder="默认同资产类别" options={ASSET_CATEGORY_OPTIONS} />
          </Form.Item>

          <Form.Item
            name="taxDepreciationMethod"
            label="税法折旧方法"
            initialValue="straight_line"
            extra="加速折旧需满足技术进步、产品更新换代较快或常年强震动高腐蚀等条件（实施条例第九十八条），由企业自行判断并留存备查资料。"
          >
            <Select
              options={[
                { value: "straight_line", label: "直线法（不加速）" },
                { value: "double_declining", label: "双倍余额递减法" },
                { value: "sum_of_years", label: "年数总和法" }
              ]}
            />
          </Form.Item>

          <Form.Item
            name="taxLifeMonthsOverride"
            label="缩短后的税法年限（月）"
            extra="不得低于法定最低年限的 60%。留空表示不缩短。"
          >
            <InputNumber style={{ width: "100%" }} min={1} precision={0} placeholder="留空即不缩短" />
          </Form.Item>

          <Form.Item
            name="electsOneTimeDeduction"
            label="选择一次性扣除"
            valuePropName="checked"
            initialValue={false}
            extra="限单价不超过 500 万元的设备器具，房屋建筑物不适用（财税〔2018〕54 号及后续延期公告）。这是企业的选择，可以放弃。"
          >
            <Switch />
          </Form.Item>
        </Form>
      </Modal>

      <Modal
        open={disposeTarget !== null}
        title={disposeTarget ? `处置 ${disposeTarget.assetNo} ${disposeTarget.name}` : "处置"}
        okText="生成处置草稿凭证"
        onOk={() => void handleDispose()}
        onCancel={() => setDisposeTarget(null)}
        destroyOnClose
      >
        <Alert
          type="info"
          showIcon
          style={{ marginBottom: 16 }}
          message="处置前需先完成当月折旧计提"
          description="按准则，当月减少的固定资产当月照提折旧。若当月折旧还没计提，处置会被拒绝——否则累计折旧少一个月，处置损益跟着算错。"
        />
        <Form form={disposeForm} layout="vertical" preserve={false}>
          <Form.Item
            name="disposedOn"
            label="处置日期"
            rules={[{ required: true, pattern: /^\d{4}-\d{2}-\d{2}$/, message: "格式 YYYY-MM-DD" }]}
          >
            <Input placeholder="2026-06-20" />
          </Form.Item>
          <Form.Item
            name="proceeds"
            label="处置价款"
            extra="留空表示价款未定，净值先挂固定资产清理（1606），收到款后再做第二张凭证结转损益。"
          >
            <InputNumber style={{ width: "100%" }} min={0} precision={2} />
          </Form.Item>
          <Form.Item
            name="proceedsAccountCode"
            label="收款科目"
            extra="填了价款就必须指定收款科目，如 1002 银行存款。"
          >
            <Input placeholder="1002" />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
}
