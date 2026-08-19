/**
 * 期初建账（V15 补的前台入口，后端是 V12-B4）。
 *
 * ## 这是「后端有能力、没入口」里后果最重的一次
 *
 * 三个接口、两个测试文件、细致的错误码，做完之后**一直没有前台入口**。
 * 前面几次是某个功能用不了，这一次是整个系统用不起来——新公司迁进 FT
 * 建不了账，后面所有的记账、报表、结转都建立在一个不存在的起点上。
 *
 * ## 借贷不平不自动补
 *
 * 后端明确不补一条平衡分录，只报差额。这里照做：把差额摆在最显眼的位置，
 * 让人自己找漏了哪一行。**自动补平会造出一笔没人认识的账**，而它会一直
 * 留在账上，直到某次审计问起来。
 *
 * ## 错误码要用出来
 *
 * 建账一次要录几十行。只显示一句「校验失败」等于让人逐行猜——
 * 后端为此专门设计了带载荷的失败码，界面要把它们落到具体的行上。
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Alert,
  Button,
  DatePicker,
  Empty,
  Input,
  InputNumber,
  Popconfirm,
  Skeleton,
  Space,
  Statistic,
  Table,
  Tag,
  Typography
} from "antd";
import type { ColumnsType } from "antd/es/table";
import { DeleteOutlined, PlusOutlined, SaveOutlined } from "@ant-design/icons";
import dayjs, { type Dayjs } from "dayjs";
import { toast } from "sonner";
import { Explain } from "../../components/ui/Explain";
import { Term } from "../../components/ui/Term";
import { errorMessage } from "../../lib/errors";
import { listAccounts } from "../../lib/api";
import {
  OpeningBalanceError,
  createOpeningBalances,
  deleteOpeningBalances,
  getOpeningBalances,
  type OpeningBalanceSummary
} from "../../lib/api-opening-balance";

interface DraftRow {
  key: number;
  accountCode: string;
  debitYuan: number;
  creditYuan: number;
}

/** 元 → 分。整数分再转回字符串交给后端，避免浮点在 numeric(18,2) 上抖。 */
function toAmountString(yuan: number): string {
  return (Math.round((yuan || 0) * 100) / 100).toFixed(2);
}

function newRow(key: number): DraftRow {
  return { key, accountCode: "", debitYuan: 0, creditYuan: 0 };
}

export function OpeningBalancePanel() {
  const [existing, setExisting] = useState<OpeningBalanceSummary | null>(null);
  const [accounts, setAccounts] = useState<Array<{ code: string; name: string }>>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const [openingDate, setOpeningDate] = useState<Dayjs>(dayjs().startOf("month"));
  const [rows, setRows] = useState<DraftRow[]>([newRow(1), newRow(2)]);

  /** 上次提交的失败载荷。用来把错误落到具体的行上。 */
  const [failure, setFailure] = useState<
    { message: string; offendingCodes: string[]; difference: string | null } | null
  >(null);

  const reload = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const [data, accountData] = await Promise.all([
        getOpeningBalances(),
        // 只取叶子科目：汇总科目不能挂余额，后端的科目闸门会拒。
        // 在下拉里就不给，比让人选了再被拒好。
        listAccounts({ leafOnly: true }).catch(() => ({ items: [] as never[] }))
      ]);
      setExisting(data.openingBalances);
      setAccounts(
        (accountData.items as Array<{ code: string; name: string }>).map((item) => ({
          code: item.code,
          name: item.name
        }))
      );
    } catch (error) {
      // 不静默：加载失败显示成「还没建账」，用户会再建一次，
      // 而后端的唯一约束会在提交时才报错。
      setLoadError(errorMessage(error, "期初余额加载失败"));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void reload();
  }, [reload]);

  const totals = useMemo(() => {
    const debit = rows.reduce((sum, row) => sum + Math.round((row.debitYuan || 0) * 100), 0);
    const credit = rows.reduce((sum, row) => sum + Math.round((row.creditYuan || 0) * 100), 0);
    return { debit, credit, difference: debit - credit };
  }, [rows]);

  const accountNameOf = useCallback(
    (code: string) => accounts.find((item) => item.code === code)?.name ?? "",
    [accounts]
  );

  const handleSave = async () => {
    const filled = rows.filter((row) => row.accountCode.trim() !== "");
    if (filled.length === 0) {
      toast.error("至少要录一行");
      return;
    }
    if (totals.difference !== 0) {
      // 后端也会拒，但在这里拦能立刻指出差额——不用等一次往返。
      toast.error(`借贷不平，差 ${(Math.abs(totals.difference) / 100).toFixed(2)} 元`);
      return;
    }

    setSaving(true);
    setFailure(null);
    try {
      await createOpeningBalances({
        openingDate: openingDate.format("YYYY-MM-DD"),
        lines: filled.map((row) => ({
          accountCode: row.accountCode.trim(),
          debit: toAmountString(row.debitYuan),
          credit: toAmountString(row.creditYuan)
        }))
      });
      toast.success("期初余额已入账");
      await reload();
    } catch (error) {
      if (error instanceof OpeningBalanceError) {
        const f = error.failure;
        setFailure({
          message: f.error,
          offendingCodes: "offendingCodes" in f ? f.offendingCodes : [],
          difference: "difference" in f ? f.difference : null
        });
      } else {
        toast.error(errorMessage(error, "建账失败"));
      }
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    try {
      await deleteOpeningBalances();
      toast.success("已撤销，可以重录");
      await reload();
    } catch (error) {
      // 已有业务分录时后端会拒——那些分录建立在期初之上，撤销会让它们失去基础。
      toast.error(errorMessage(error, "撤销失败"));
    }
  };

  const draftColumns: ColumnsType<DraftRow> = [
    {
      title: "科目",
      dataIndex: "accountCode",
      width: 260,
      render: (value: string, row) => {
        const bad = failure?.offendingCodes.includes(value) ?? false;
        return (
          <Space direction="vertical" size={0} style={{ width: "100%" }}>
            <Input
              size="small"
              status={bad ? "error" : undefined}
              placeholder="科目编码，如 1002"
              value={value}
              list="opening-balance-accounts"
              onChange={(e) =>
                setRows((prev) =>
                  prev.map((item) =>
                    item.key === row.key ? { ...item, accountCode: e.target.value } : item
                  )
                )
              }
            />
            {value !== "" && (
              <Typography.Text type={bad ? "danger" : "secondary"} style={{ fontSize: 12 }}>
                {accountNameOf(value) || "未知科目"}
              </Typography.Text>
            )}
          </Space>
        );
      }
    },
    {
      title: "借方（元）",
      dataIndex: "debitYuan",
      width: 160,
      render: (value: number, row) => (
        <InputNumber
          size="small"
          style={{ width: "100%" }}
          min={0}
          precision={2}
          value={value}
          onChange={(next) =>
            setRows((prev) =>
              prev.map((item) =>
                // 一行只能有一个方向。填了借方就把贷方清零，
                // 两边都有值的行在会计上没有意义，后端也会算进合计。
                item.key === row.key ? { ...item, debitYuan: next ?? 0, creditYuan: 0 } : item
              )
            )
          }
        />
      )
    },
    {
      title: "贷方（元）",
      dataIndex: "creditYuan",
      width: 160,
      render: (value: number, row) => (
        <InputNumber
          size="small"
          style={{ width: "100%" }}
          min={0}
          precision={2}
          value={value}
          onChange={(next) =>
            setRows((prev) =>
              prev.map((item) =>
                item.key === row.key ? { ...item, creditYuan: next ?? 0, debitYuan: 0 } : item
              )
            )
          }
        />
      )
    },
    {
      title: "",
      key: "remove",
      width: 50,
      render: (_, row) => (
        <Button
          size="small"
          type="text"
          danger
          icon={<DeleteOutlined />}
          disabled={rows.length === 1}
          onClick={() => setRows((prev) => prev.filter((item) => item.key !== row.key))}
        />
      )
    }
  ];

  if (loading) return <Skeleton active paragraph={{ rows: 5 }} />;

  return (
    <div>
      {loadError !== null && (
        <Alert type="error" showIcon message={loadError} style={{ marginBottom: 12 }} />
      )}

      <Explain title="期初建账是什么、为什么要先做" storageKey="ledger.opening-intro">
        把公司**开始用这套系统之前**的账面余额一次性录进来——银行有多少钱、
        欠供应商多少、库存值多少。之后所有的账都建立在这个起点上。
        <br />
        录进去会生成一张<Term k="voucher">凭证</Term>，
        <strong>借贷必须相等</strong>。差额不会被自动补平——补平会造出一笔没人认识的账，
        而它会一直留在账上直到某次审计问起来。
        <br />
        损益类<Term k="account">科目</Term>与「本年利润」不能录期初：它们表达的是一段时间内发生了什么，
        而建账基准日之前的经营成果已经沉淀在未分配利润里了。
      </Explain>

      {existing !== null ? (
        <>
          <Alert
            type="success"
            showIcon
            style={{ marginBottom: 12 }}
            message={`已于 ${existing.openingDate} 建账，共 ${existing.lineCount} 行`}
            description={
              <Space size="large">
                <span>借方合计 {existing.totalDebit}</span>
                <span>贷方合计 {existing.totalCredit}</span>
              </Space>
            }
            action={
              <Popconfirm
                title="撤销期初建账？"
                description="已经有业务分录时撤不掉——那些分录建立在期初之上。"
                onConfirm={() => void handleDelete()}
              >
                <Button size="small" danger>
                  撤销重录
                </Button>
              </Popconfirm>
            }
          />
          <Table
            rowKey={(row) => `${row.accountCode}-${row.debit}-${row.credit}`}
            size="small"
            pagination={false}
            dataSource={existing.lines}
            columns={[
              { title: "科目", dataIndex: "accountCode", width: 120 },
              { title: "名称", dataIndex: "accountName" },
              { title: "借方", dataIndex: "debit", align: "right", width: 140 },
              { title: "贷方", dataIndex: "credit", align: "right", width: 140 }
            ]}
          />
        </>
      ) : (
        <>
          {failure !== null && (
            <Alert
              type="error"
              showIcon
              style={{ marginBottom: 12 }}
              message="建账没有通过校验"
              description={
                <>
                  <div>{failure.message}</div>
                  {failure.offendingCodes.length > 0 && (
                    <div style={{ marginTop: 4 }}>
                      出问题的科目：
                      {failure.offendingCodes.map((code) => (
                        <Tag color="red" key={code}>
                          {code}
                        </Tag>
                      ))}
                      <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                        （上面对应的行已标红）
                      </Typography.Text>
                    </div>
                  )}
                </>
              }
            />
          )}

          <Space style={{ marginBottom: 12 }} wrap>
            <span>建账基准日</span>
            <DatePicker
              allowClear={false}
              value={openingDate}
              onChange={(value) => value && setOpeningDate(value)}
            />
            <Typography.Text type="secondary" style={{ fontSize: 12 }}>
              通常是启用系统那个月的 1 号
            </Typography.Text>
          </Space>

          {/* 科目编码的输入建议。用原生 datalist 而不是 Select——
              建账要录几十行，键盘连续输入比每行点开一个下拉快得多。 */}
          <datalist id="opening-balance-accounts">
            {accounts.map((account) => (
              <option key={account.code} value={account.code}>
                {account.name}
              </option>
            ))}
          </datalist>

          {rows.length === 0 ? (
            <Empty description="还没有录入任何行" />
          ) : (
            <Table<DraftRow>
              rowKey="key"
              size="small"
              pagination={false}
              dataSource={rows}
              columns={draftColumns}
              footer={() => (
                <Space style={{ width: "100%", justifyContent: "space-between" }} wrap>
                  <Button
                    size="small"
                    icon={<PlusOutlined />}
                    onClick={() =>
                      setRows((prev) => [...prev, newRow(Math.max(0, ...prev.map((r) => r.key)) + 1)])
                    }
                  >
                    加一行
                  </Button>

                  <Space size="large">
                    <Statistic
                      title="借方合计"
                      value={totals.debit / 100}
                      precision={2}
                      valueStyle={{ fontSize: 16 }}
                    />
                    <Statistic
                      title="贷方合计"
                      value={totals.credit / 100}
                      precision={2}
                      valueStyle={{ fontSize: 16 }}
                    />
                    {/* 差额摆在最显眼的位置——它是建账时唯一要盯的那个数 */}
                    <Statistic
                      title="差额"
                      value={totals.difference / 100}
                      precision={2}
                      valueStyle={{
                        fontSize: 16,
                        color: totals.difference === 0 ? "#52c41a" : "#cf1322"
                      }}
                    />
                  </Space>
                </Space>
              )}
            />
          )}

          <Button
            type="primary"
            icon={<SaveOutlined />}
            loading={saving}
            style={{ marginTop: 12 }}
            disabled={totals.difference !== 0}
            onClick={() => void handleSave()}
          >
            {totals.difference === 0
              ? "确认建账"
              : `借贷差 ${(Math.abs(totals.difference) / 100).toFixed(2)} 元，不能建账`}
          </Button>
        </>
      )}
    </div>
  );
}
