/**
 * 增值税期末结转（V15 补的前台入口，后端是 V12-B8）。
 *
 * ## 每月必做
 *
 * 月末把「应交税费—应交增值税」的各专栏轧平，该缴的转到「未交增值税」。
 * 不做的后果不是报错，是应交增值税科目上的专栏一直累计——报表上的
 * 应交税费**是几个月的和**，报税时对不上。
 *
 * ## 五种结论里有三种「什么都不用做」
 *
 * 留抵、轧平、不适用——这三种后端明确返回 200 且不生成凭证。
 * **界面必须把它们讲成正常结果**，讲成失败会让人反复点，
 * 或者去找一个根本不存在的问题。
 *
 * 后端已经给了一句给会计看的解释（`reason`），直接展示，不自己再编一套说法。
 */

import { useCallback, useEffect, useState } from "react";
import { Alert, Button, DatePicker, Descriptions, Skeleton, Space, Table, Tag, Typography } from "antd";
import dayjs, { type Dayjs } from "dayjs";
import { toast } from "sonner";
import { Explain } from "../../components/ui/Explain";
import { Term } from "../../components/ui/Term";
import { errorMessage } from "../../lib/errors";
import {
  createVatSettlementVoucher,
  previewVatSettlement,
  type VatSettlementLine,
  type VatSettlementOutcome,
  type VatSettlementPlan
} from "../../lib/api-vat-settlement";

/**
 * 五种结论的呈现。
 *
 * **三种「什么都不用做」用的是 info/success 而不是 warning**——
 * 留抵和轧平是正常的经营结果，给它们一个黄色感叹号会让人以为出了问题。
 */
const OUTCOME_META: Record<
  VatSettlementOutcome,
  { label: string; tone: "success" | "info" | "warning"; needsVoucher: boolean }
> = {
  payable: { label: "本期应缴", tone: "warning", needsVoucher: true },
  overpaid: { label: "本期多缴，需转出", tone: "warning", needsVoucher: true },
  credit_carried: { label: "留抵，不结转", tone: "info", needsVoucher: false },
  balanced: { label: "已轧平，无需结转", tone: "success", needsVoucher: false },
  not_applicable: { label: "不适用", tone: "info", needsVoucher: false }
};

export function VatSettlementPanel() {
  const [period, setPeriod] = useState<Dayjs>(dayjs().subtract(1, "month"));
  const [plan, setPlan] = useState<VatSettlementPlan | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);

  const periodLabel = period.format("YYYY-MM");

  const reload = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      setPlan(await previewVatSettlement(periodLabel));
    } catch (error) {
      // 不静默：加载失败显示成「无需结转」会让人跳过这一步，
      // 而跳过的后果要到报税时才被发现。
      setLoadError(errorMessage(error, "增值税结转试算失败"));
      setPlan(null);
    } finally {
      setLoading(false);
    }
  }, [periodLabel]);

  useEffect(() => {
    void reload();
  }, [reload]);

  const handleCreate = async () => {
    setCreating(true);
    try {
      const result = await createVatSettlementVoucher(periodLabel);
      toast.success(
        result.voucherId === null
          ? result.reason
          : `已生成结转凭证草稿，待复核过账`
      );
      await reload();
    } catch (error) {
      // 后端的两种拒绝（本期已结转、往期草稿未过账）原文透给用户——
      // 第二种尤其重要：往期草稿没过账时结本期会把两个月的税并成一张。
      toast.error(errorMessage(error, "生成结转凭证失败"));
    } finally {
      setCreating(false);
    }
  };

  const columns = [
    { title: "摘要", dataIndex: "summary" as const },
    { title: "科目", dataIndex: "accountCode" as const, width: 110 },
    { title: "科目名称", dataIndex: "accountName" as const, width: 200 },
    { title: "借方", dataIndex: "debit" as const, align: "right" as const, width: 130 },
    { title: "贷方", dataIndex: "credit" as const, align: "right" as const, width: 130 }
  ];

  const meta = plan === null ? null : OUTCOME_META[plan.outcome];

  return (
    <div>
      <Explain title="这一步在做什么、不做会怎样" storageKey="tax.vat-settlement-intro">
        月末把「应交税费—应交<Term k="vat">增值税</Term>」的各专栏轧平，
        该缴的转到「未交增值税」。
        <br />
        <strong>不做的后果不是报错</strong>
        ——应交增值税<Term k="account">科目</Term>上的专栏会一直累计，
        报表上的应交税费变成几个月的和，
        报税时对不上。
        <br />
        留抵、轧平、不适用这三种情况**本来就不该生成
        <Term k="voucher">凭证</Term>**，那是正常结果不是失败。
      </Explain>

      <Space style={{ marginBottom: 12 }} wrap>
        <span>结转期间</span>
        <DatePicker
          picker="month"
          allowClear={false}
          value={period}
          onChange={(value) => value && setPeriod(value)}
        />
        <Typography.Text type="secondary" style={{ fontSize: 12 }}>
          默认是上个月——月末结转通常在次月初做
        </Typography.Text>
      </Space>

      {loadError !== null && (
        <Alert type="error" showIcon message={loadError} style={{ marginBottom: 12 }} />
      )}

      {loading ? (
        <Skeleton active paragraph={{ rows: 4 }} />
      ) : plan === null || meta === null ? null : (
        <>
          <Alert
            type={meta.tone}
            showIcon
            style={{ marginBottom: 12 }}
            message={`${periodLabel}：${meta.label}`}
            // 后端已经写好一句给会计看的解释，直接用，不自己再编一套说法。
            description={plan.reason}
          />

          <Descriptions size="small" column={2} bordered style={{ marginBottom: 12 }}>
            <Descriptions.Item label="应交未交">{plan.payableAmount}</Descriptions.Item>
            <Descriptions.Item label="多交转出">{plan.overpaidAmount}</Descriptions.Item>
            <Descriptions.Item label="留抵税额">{plan.creditCarriedForward}</Descriptions.Item>
            <Descriptions.Item label="预交转入">{plan.prepaidTransferred}</Descriptions.Item>
          </Descriptions>

          {plan.existingVoucherId != null && (
            <Alert
              type="info"
              showIcon
              style={{ marginBottom: 12 }}
              message={`本期已有结转凭证：${plan.existingVoucherId}`}
              description={`状态 ${plan.existingVoucherStatus ?? "未知"}。已存在时不会再生成第二张。`}
            />
          )}

          {plan.lines.length > 0 ? (
            <>
              <Table<VatSettlementLine>
                rowKey={(row) => `${row.accountCode}-${row.debit}-${row.credit}`}
                size="small"
                pagination={false}
                dataSource={plan.lines}
                columns={columns}
              />
              <Button
                type="primary"
                style={{ marginTop: 12 }}
                loading={creating}
                disabled={plan.existingVoucherId != null}
                onClick={() => void handleCreate()}
              >
                {plan.existingVoucherId != null ? "本期已结转" : "生成结转凭证草稿"}
              </Button>
            </>
          ) : (
            // 三种「什么都不用做」讲成正常结果，不给按钮也不报错。
            <Tag color={meta.tone === "success" ? "success" : "default"}>
              本期不需要生成凭证
            </Tag>
          )}
        </>
      )}
    </div>
  );
}
