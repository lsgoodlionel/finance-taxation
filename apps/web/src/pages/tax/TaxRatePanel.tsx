/**
 * 税率主数据与账簿口径增值税底稿（V12-D2 前端）。
 *
 * 两件事放同一屏，是因为它们回答的是同一个问题的两半：
 * 「这个属期该用什么税率」与「按账簿算出来的税是多少」。
 */
import { useCallback, useEffect, useState } from "react";
import { Alert, Button, Card, Descriptions, Radio, Space, Table, Tag, Typography } from "antd";
import { ReloadOutlined } from "@ant-design/icons";
import { toast } from "sonner";
import { Term } from "../../components/ui/Term";
import { usePeriod } from "../../lib/period-context";
import {
  getLedgerVatPaper,
  listTaxRates,
  type LedgerVatPaperView,
  type TaxRateView
} from "../../lib/api";

function errorMessage(err: unknown, fallback: string): string {
  return err instanceof Error ? err.message : fallback;
}

/** 账簿口径底稿里每行的角色名。 */
const ROLE_LABELS: Record<string, string> = {
  output: "销项税额",
  input: "进项税额",
  inputTransferOut: "进项税额转出",
  taxPaid: "已交税金",
  simplified: "简易计税"
};

export function TaxRatePanel() {
  const { period } = usePeriod();
  const [rates, setRates] = useState<TaxRateView[]>([]);
  const [paper, setPaper] = useState<LedgerVatPaperView | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  /** 税率视图：当期有效 vs 全部（含历史档）。 */
  const [scope, setScope] = useState<"current" | "all">("current");

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      // 税率按属期首日取——增值税历次改版都在月初生效，按月的属期不跨改版点
      const on = scope === "current" ? `${period}-01` : undefined;
      const [rateList, ledgerPaper] = await Promise.all([
        listTaxRates("vat", on),
        getLedgerVatPaper(period).catch((err) => {
          // 底稿取不到不该连税率一起看不了——增值税科目没配齐时它会 400
          toast.error(errorMessage(err, "账簿口径底稿加载失败"));
          return null;
        })
      ]);
      setRates(rateList.items);
      setPaper(ledgerPaper);
    } catch (err) {
      const message = errorMessage(err, "加载税率主数据失败");
      setError(message);
      toast.error(message);
    } finally {
      setLoading(false);
    }
  }, [period, scope]);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <div style={{ display: "grid", gap: 16 }}>
      {error ? (
        <Alert
          type="error"
          showIcon
          message="加载税率主数据失败"
          description={error}
          action={<Button size="small" onClick={() => void load()}>重试</Button>}
        />
      ) : null}

      <Card
        title={`增值税税率 · ${scope === "current" ? `${period} 适用` : "全部（含历史档）"}`}
        extra={
          <Space>
            <Radio.Group
              size="small"
              value={scope}
              onChange={(e) => setScope(e.target.value as "current" | "all")}
              optionType="button"
              options={[
                { label: "当期适用", value: "current" },
                { label: "全部沿革", value: "all" }
              ]}
            />
            <Button icon={<ReloadOutlined />} loading={loading} onClick={() => void load()}>
              刷新
            </Button>
          </Space>
        }
        style={{ borderRadius: 12 }}
      >
        <Typography.Paragraph type="secondary">
          税率按业务发生日取，不是取"最新的那档"。增值税基本税率改过两次
          （17%→16%→13%），用今天的税率重算 2018 年的账，每个数都是错的。
          历史档保留在"全部沿革"里，重算旧属期的<Term k="working-paper">底稿</Term>需要它们。
        </Typography.Paragraph>
        <Table
          rowKey="id"
          size="small"
          loading={loading}
          dataSource={rates}
          pagination={{ pageSize: 15, hideOnSinglePage: true }}
          columns={[
            { title: "名称", dataIndex: "name" },
            {
              title: "税率",
              dataIndex: "description",
              width: 200,
              render: (description: string, row: TaxRateView) =>
                row.levyRate !== null && row.levyRate !== row.rate ? (
                  <Tag color="green">{description}</Tag>
                ) : (
                  description
                )
            },
            { title: "适用范围", dataIndex: "applicableScope", ellipsis: true },
            { title: "生效日", dataIndex: "effectiveFrom", width: 110 },
            {
              title: "失效日",
              dataIndex: "effectiveTo",
              width: 110,
              render: (value: string | null) => value ?? <Typography.Text type="secondary">仍有效</Typography.Text>
            },
            {
              title: "来源",
              dataIndex: "isSystem",
              width: 90,
              render: (isSystem: boolean) =>
                isSystem ? <Tag>系统内置</Tag> : <Tag color="blue">公司自定义</Tag>
            }
          ]}
        />
      </Card>

      {paper ? (
        <>
          <Card title={`${period} 账簿口径增值税底稿`} style={{ borderRadius: 12 }}>
            <Descriptions bordered size="small" column={3}>
              <Descriptions.Item label="销项税额">{paper.ledger.outputTax}</Descriptions.Item>
              <Descriptions.Item label="进项税额">{paper.ledger.inputTax}</Descriptions.Item>
              <Descriptions.Item label="进项税额转出">{paper.ledger.inputTransferOut}</Descriptions.Item>
              <Descriptions.Item label="简易计税">{paper.ledger.simplified}</Descriptions.Item>
              <Descriptions.Item label="已交税金">{paper.ledger.taxPaid}</Descriptions.Item>
              <Descriptions.Item label="本期应纳税额">
                <Typography.Text strong>{paper.ledger.payable}</Typography.Text>
              </Descriptions.Item>
            </Descriptions>

            <Alert
              style={{ marginTop: 16 }}
              type={paper.reconciliation.consistent ? "success" : "warning"}
              showIcon
              message={paper.reconciliation.consistent ? "账簿口径与税目口径一致" : "两个口径存在差额"}
              description={
                <div style={{ fontSize: 12 }}>
                  <div>{paper.reconciliation.message}</div>
                  {paper.reconciliation.ledgerPayable ? (
                    <div style={{ marginTop: 6, color: "#64748b" }}>
                      账簿口径 {paper.reconciliation.ledgerPayable}，税目口径{" "}
                      {paper.reconciliation.itemsPayable}，差额 {paper.reconciliation.difference}
                    </div>
                  ) : null}
                </div>
              }
            />

            <Typography.Paragraph type="secondary" style={{ marginTop: 12, marginBottom: 0 }}>
              这张<Term k="working-paper">底稿</Term>直接从<Term k="general-ledger">总账</Term>按
              <Term k="vat">增值税</Term><Term k="account">科目</Term>归集，
              每行可追溯到<Term k="voucher">凭证</Term>——税额是记账那一刻算好并入账的数，
              不是事后用税率重算的，因此账与税必然一致。已交税金单独列示，不冲减应纳税额：
              申报表上这是两行。
            </Typography.Paragraph>
          </Card>

          <Card title="逐笔明细" style={{ borderRadius: 12 }}>
            <Table
              rowKey="entryId"
              size="small"
              dataSource={paper.ledger.lines}
              pagination={{ pageSize: 20, hideOnSinglePage: true }}
              columns={[
                { title: "日期", dataIndex: "entryDate", width: 110 },
                {
                  title: "类别",
                  dataIndex: "role",
                  width: 130,
                  render: (role: string) => ROLE_LABELS[role] ?? role
                },
                { title: "摘要", dataIndex: "summary" },
                { title: "科目", dataIndex: "accountCode", width: 100 },
                { title: "金额", dataIndex: "amount", align: "right" as const, width: 130 },
                { title: "凭证", dataIndex: "voucherId", width: 200, ellipsis: true }
              ]}
              locale={{ emptyText: "本期没有增值税科目的分录。" }}
            />
          </Card>
        </>
      ) : null}
    </div>
  );
}
