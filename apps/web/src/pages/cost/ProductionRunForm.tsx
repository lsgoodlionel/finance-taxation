/**
 * 录入本期生产（V14-C）。
 *
 * ## 为什么单独一个组件
 *
 * 成本结转页已经有「看分配 + 结转」两件事，再塞一个录入表单会让那个文件
 * 超过 800 行。而这个表单本身也不简单——它要同时管产品、产量、三项料工费
 * 和各自的完工程度。
 *
 * ## 期初在产品不在表单里
 *
 * 它由系统从上期结转结果自动取（`resolveOpeningWip`）。让用户手填等于
 * 让他去翻上个月的结果再抄一遍——抄错了要到毛利异常时才发现，
 * 而那时已经跨了好几个期间。表单上说明这一点，别让人以为漏填了。
 *
 * ## 完工程度的默认值是有讲究的
 *
 * 材料默认 100%（开工即投料），人工与制造费用默认 60%。这不是随手填的
 * 数——用同一个进度分三项会让完工成本被高估，而默认值是多数人不会改的
 * 那一个。
 */

import { useCallback, useEffect, useState } from "react";
import {
  Alert,
  Button,
  DatePicker,
  Form,
  Input,
  InputNumber,
  Modal,
  Select,
  Space,
  Table,
  Tag,
  Typography
} from "antd";
import type { ColumnsType } from "antd/es/table";
import { PlusOutlined } from "@ant-design/icons";
import dayjs, { type Dayjs } from "dayjs";
import { toast } from "sonner";
import { errorMessage } from "../../lib/errors";
import {
  listProducts,
  saveProduct,
  saveProductionRun,
  COST_ELEMENT_LABELS,
  type CostElement,
  type Product
} from "../../lib/api-cost";

const TOTAL_BASIS_POINTS = 10000;

interface DraftCost {
  element: CostElement;
  incurredYuan: number;
  wipCompletionPercent: number;
}

/**
 * 三项的默认完工程度。
 *
 * 材料 100%：开工时一次性投料，做了一半的机器里料是齐的。
 * 人工与制造费用 60%：按加工进度，60% 是常见的期末在制平均水平。
 */
const DEFAULT_COSTS: DraftCost[] = [
  { element: "material", incurredYuan: 0, wipCompletionPercent: 100 },
  { element: "labor", incurredYuan: 0, wipCompletionPercent: 60 },
  { element: "overhead", incurredYuan: 0, wipCompletionPercent: 60 }
];

export interface ProductionRunFormProps {
  open: boolean;
  onClose: () => void;
  onSaved: () => void;
}

export function ProductionRunForm({ open, onClose, onSaved }: ProductionRunFormProps) {
  const [products, setProducts] = useState<Product[]>([]);
  const [productId, setProductId] = useState<string | undefined>();
  const [period, setPeriod] = useState<Dayjs>(dayjs());
  const [finishedQuantity, setFinishedQuantity] = useState(0);
  const [endingWipQuantity, setEndingWipQuantity] = useState(0);
  const [note, setNote] = useState("");
  const [costs, setCosts] = useState<DraftCost[]>(DEFAULT_COSTS);
  const [saving, setSaving] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [creatingProduct, setCreatingProduct] = useState(false);
  const [productForm] = Form.useForm<{ code: string; name: string; unit: string }>();

  const reloadProducts = useCallback(async () => {
    if (!open) return;
    setLoadError(null);
    try {
      const data = await listProducts();
      setProducts(data.items);
      setProductId((prev) => prev ?? data.items[0]?.id);
    } catch (error) {
      // 不静默：产品列表加载失败显示成空，用户会以为要先建产品，
      // 于是建出一堆重复的。
      setLoadError(errorMessage(error, "产品档案加载失败"));
    }
  }, [open]);

  useEffect(() => {
    void reloadProducts();
  }, [reloadProducts]);

  const handleCreateProduct = async (values: { code: string; name: string; unit: string }) => {
    try {
      const result = await saveProduct({
        code: values.code.trim(),
        name: values.name.trim(),
        unit: values.unit?.trim() || "台"
      });
      toast.success("产品已保存");
      setCreatingProduct(false);
      productForm.resetFields();
      await reloadProducts();
      setProductId(result.product.id);
    } catch (error) {
      toast.error(errorMessage(error, "保存失败"));
    }
  };

  const handleSave = async () => {
    if (!productId) {
      toast.error("请先选择产品");
      return;
    }
    if (finishedQuantity === 0 && endingWipQuantity === 0) {
      // 既没有完工也没有在产品，成本没有去处——服务端也会拒，
      // 但在这里拦能说人话。
      toast.error("完工数量与在产品数量不能都是零");
      return;
    }

    setSaving(true);
    try {
      await saveProductionRun({
        productId,
        period: period.format("YYYY-MM"),
        finishedQuantity,
        endingWipQuantity,
        note: note.trim() || null,
        costs: costs.map((cost) => ({
          element: cost.element,
          incurredCents: Math.round(cost.incurredYuan * 100),
          wipCompletionBp: Math.round(
            (cost.wipCompletionPercent / 100) * TOTAL_BASIS_POINTS
          )
        }))
      });
      toast.success("已保存。期初在产品由系统从上期结果自动接上");
      onSaved();
      onClose();
      // 下次打开是一张干净的表——留着上次的数会让人误以为已经填过了。
      setFinishedQuantity(0);
      setEndingWipQuantity(0);
      setNote("");
      setCosts(DEFAULT_COSTS);
    } catch (error) {
      toast.error(errorMessage(error, "保存失败"));
    } finally {
      setSaving(false);
    }
  };

  const costColumns: ColumnsType<DraftCost> = [
    {
      title: "成本项",
      dataIndex: "element",
      width: 110,
      render: (element: CostElement) => COST_ELEMENT_LABELS[element]
    },
    {
      title: "本期归集（元）",
      dataIndex: "incurredYuan",
      width: 180,
      render: (value: number, row) => (
        <InputNumber
          style={{ width: "100%" }}
          min={0}
          precision={2}
          value={value}
          onChange={(next) =>
            setCosts((prev) =>
              prev.map((item) =>
                item.element === row.element ? { ...item, incurredYuan: next ?? 0 } : item
              )
            )
          }
        />
      )
    },
    {
      title: "在产品完工程度",
      dataIndex: "wipCompletionPercent",
      render: (value: number, row) => (
        <Space>
          <InputNumber
            style={{ width: 110 }}
            min={0}
            max={100}
            precision={0}
            addonAfter="%"
            value={value}
            onChange={(next) =>
              setCosts((prev) =>
                prev.map((item) =>
                  item.element === row.element
                    ? { ...item, wipCompletionPercent: next ?? 0 }
                    : item
                )
              )
            }
          />
          {row.element === "material" && value === 100 && (
            <Tag color="blue">开工即投料</Tag>
          )}
          {row.element === "material" && value !== 100 && (
            // 这是最容易出错的一项，改动了就提醒一句。
            <Typography.Text type="warning" style={{ fontSize: 12 }}>
              材料通常是 100%
            </Typography.Text>
          )}
        </Space>
      )
    }
  ];

  return (
    <>
      <Modal
        open={open}
        title="录入本期生产"
        width={720}
        okText="保存"
        cancelText="取消"
        confirmLoading={saving}
        onCancel={onClose}
        onOk={() => void handleSave()}
      >
        <Space direction="vertical" size={16} style={{ width: "100%" }}>
          {loadError !== null && <Alert type="error" showIcon message={loadError} />}

          <Form layout="vertical">
            <Space align="start" wrap>
              <Form.Item label="产品" required style={{ marginBottom: 0 }}>
                <Space.Compact>
                  <Select
                    style={{ width: 280 }}
                    placeholder="选择产品"
                    value={productId}
                    onChange={setProductId}
                    options={products.map((product) => ({
                      value: product.id,
                      label: `${product.code} ${product.name}`
                    }))}
                  />
                  <Button icon={<PlusOutlined />} onClick={() => setCreatingProduct(true)}>
                    新建
                  </Button>
                </Space.Compact>
              </Form.Item>

              <Form.Item label="期间" required style={{ marginBottom: 0 }}>
                <DatePicker
                  picker="month"
                  allowClear={false}
                  value={period}
                  onChange={(value) => value && setPeriod(value)}
                />
              </Form.Item>
            </Space>

            <Space align="start" wrap style={{ marginTop: 16 }}>
              <Form.Item label="本期完工入库" style={{ marginBottom: 0 }}>
                <InputNumber
                  style={{ width: 160 }}
                  min={0}
                  precision={0}
                  value={finishedQuantity}
                  onChange={(value) => setFinishedQuantity(value ?? 0)}
                />
              </Form.Item>
              <Form.Item
                label="期末在产品"
                style={{ marginBottom: 0 }}
                extra="按吨/米计量的请先换算成最小单位——约当产量要求整数"
              >
                <InputNumber
                  style={{ width: 160 }}
                  min={0}
                  precision={0}
                  value={endingWipQuantity}
                  onChange={(value) => setEndingWipQuantity(value ?? 0)}
                />
              </Form.Item>
            </Space>
          </Form>

          <div>
            <Typography.Title level={5} style={{ marginBottom: 4 }}>
              本期归集的料工费
            </Typography.Title>
            <Typography.Paragraph type="secondary" style={{ fontSize: 12 }}>
              三项的完工程度不一样：
              <strong>材料通常 100%</strong>
              （开工时一次性投料），人工与制造费用按加工进度。用同一个进度分三项会让在产品的
              约当量变小，完工产品反而多分到成本。
            </Typography.Paragraph>
            <Table<DraftCost>
              rowKey="element"
              size="small"
              pagination={false}
              dataSource={costs}
              columns={costColumns}
            />
          </div>

          <Alert
            type="info"
            showIcon
            message="期初在产品不用填"
            description="上期结转后留在生产成本的那部分，由系统自动接上——手填等于去翻上个月的结果再抄一遍，抄错了要到毛利异常时才发现。"
          />

          <Form.Item label="备注" style={{ marginBottom: 0 }}>
            <Input.TextArea
              rows={2}
              maxLength={200}
              showCount
              value={note}
              onChange={(e) => setNote(e.target.value)}
            />
          </Form.Item>
        </Space>
      </Modal>

      <Modal
        open={creatingProduct}
        title="新建产品"
        okText="保存"
        cancelText="取消"
        onCancel={() => setCreatingProduct(false)}
        onOk={() => productForm.submit()}
      >
        <Form
          form={productForm}
          layout="vertical"
          initialValues={{ unit: "台" }}
          onFinish={(values) => void handleCreateProduct(values)}
        >
          <Form.Item name="code" label="产品编码" rules={[{ required: true }]}>
            <Input placeholder="如 SRV-2U-A" maxLength={40} />
          </Form.Item>
          <Form.Item name="name" label="产品名称" rules={[{ required: true }]}>
            <Input placeholder="如 双路机架式服务器 2U" maxLength={80} />
          </Form.Item>
          <Form.Item
            name="unit"
            label="计量单位"
            extra="约当产量要求数量是整数，按吨/米计量的请用最小单位"
          >
            <Input maxLength={10} />
          </Form.Item>
        </Form>
      </Modal>
    </>
  );
}
