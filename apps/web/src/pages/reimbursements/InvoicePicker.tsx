/**
 * 发票匹配建议选择器（V14-D）。
 *
 * ## 只给建议，不自动挂
 *
 * V13 把自动匹配列入「明确不做」，理由是「误配代价高于省下的点击」。
 * 那个推理没错，但结论跳步了——**正确的结论是「不做自动挂载」**。
 *
 * 这一屏省掉的是「在几百张票里翻找」，而不是「确认这张对不对」。
 * 所以：候选按相关度排序、得分理由逐条摆出来、用户点一下选中。
 * 没有「分数高于 X 就自动选中」——设阈值就等于自动挂载，绕回原点。
 *
 * ## 得分理由必须显示
 *
 * 「为什么这张排在前面」是用户会问的第一个问题。只给一个分数而不说理由，
 * 用户要么盲从要么全不信，两种都让这个功能白做。
 */

import { useCallback, useEffect, useState } from "react";
import { Alert, Button, Empty, List, Modal, Skeleton, Space, Tag, Typography } from "antd";
import { errorMessage } from "../../lib/errors";
import { Term } from "../../components/ui/Term";
import { Explain } from "../../components/ui/Explain";
import {
  suggestInvoicesForLine,
  type InvoiceMatchSuggestion
} from "../../lib/api-expense-control";

function formatCents(cents: number): string {
  return (cents / 100).toLocaleString("zh-CN", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  });
}

export interface InvoicePickerProps {
  open: boolean;
  /** 报销行金额（分）。 */
  amountCents: number;
  /** 费用发生日 YYYY-MM-DD。 */
  expenseOn: string;
  /** 供应商关键词，取自摘要。空则不参与打分。 */
  keyword?: string | null;
  reimbursementId?: string | null;
  onPick: (invoiceId: string, invoiceNo: string) => void;
  onClose: () => void;
}

export function InvoicePicker({
  open,
  amountCents,
  expenseOn,
  keyword,
  reimbursementId,
  onPick,
  onClose
}: InvoicePickerProps) {
  const [items, setItems] = useState<InvoiceMatchSuggestion[]>([]);
  const [total, setTotal] = useState(0);
  const [truncated, setTruncated] = useState(false);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    if (!open) return;
    setLoading(true);
    setLoadError(null);
    try {
      const data = await suggestInvoicesForLine({
        amountCents,
        expenseOn,
        keyword: keyword?.trim() || null,
        reimbursementId: reimbursementId ?? null
      });
      setItems(data.suggestions);
      setTotal(data.totalCandidates);
      setTruncated(data.truncated);
    } catch (error) {
      // 不静默：加载失败显示成空会被读成「池子里没有票」，
      // 于是用户去手工录一张重复的。
      setLoadError(errorMessage(error, "候选发票加载失败"));
    } finally {
      setLoading(false);
    }
  }, [open, amountCents, expenseOn, keyword, reimbursementId]);

  useEffect(() => {
    void reload();
  }, [reload]);

  return (
    <Modal
      open={open}
      title="选择发票"
      width={720}
      footer={null}
      onCancel={onClose}
      destroyOnClose
    >
      <Space direction="vertical" size={12} style={{ width: "100%" }}>
        <Explain title="按相关度排序，系统不会替你选" storageKey="invoice-picker.intro">
          金额、日期、销方名越接近排得越前。
          <strong>系统不会替你选</strong>
          ——误挂一张票要到对账时才发现，而那时<Term k="voucher">凭证</Term>已经做过了。
          <br />
          已经挂在别的报销单上、或已经入账的票不会出现在这里。
        </Explain>

        {loadError !== null && <Alert type="error" showIcon message={loadError} />}

        {loading ? (
          <Skeleton active paragraph={{ rows: 4 }} />
        ) : items.length === 0 ? (
          <Empty description="发票池里没有可用的进项票">
            <Typography.Text type="secondary">
              可以先到票据中心导入或录入发票，再回来选。
            </Typography.Text>
          </Empty>
        ) : (
          <>
            {/* 截断了要说出来——不说等于假装全看过了 */}
            {truncated && (
              <Typography.Text type="secondary">
                共 {total} 张候选，按相关度显示前 {items.length} 张。找不到的话请缩小金额或日期范围。
              </Typography.Text>
            )}
            <List
              size="small"
              bordered
              dataSource={items}
              renderItem={(item) => (
                <List.Item
                  actions={[
                    <Button
                      key="pick"
                      type="primary"
                      size="small"
                      onClick={() => onPick(item.invoice.id, item.invoice.invoiceNo)}
                    >
                      选它
                    </Button>
                  ]}
                >
                  <List.Item.Meta
                    title={
                      <Space size={6} wrap>
                        <Typography.Text code>{item.invoice.invoiceNo}</Typography.Text>
                        <Typography.Text strong>
                          {formatCents(item.invoice.totalAmountCents)} 元
                        </Typography.Text>
                        <Typography.Text type="secondary">
                          {item.invoice.invoiceDate}
                        </Typography.Text>
                        {item.invoice.verifyStatus === "verified" && (
                          <Tag color="green">已验真</Tag>
                        )}
                      </Space>
                    }
                    description={
                      <Space direction="vertical" size={2}>
                        <Typography.Text type="secondary">
                          {item.invoice.sellerName ?? "销方未填"}
                        </Typography.Text>
                        {/* 得分理由逐条摆出来。只给分数不说理由，
                            用户要么盲从要么全不信。 */}
                        <Space size={4} wrap>
                          {item.reasons.length === 0 ? (
                            <Tag>无匹配项</Tag>
                          ) : (
                            item.reasons.map((reason) => (
                              <Tag key={reason} color="blue">
                                {reason}
                              </Tag>
                            ))
                          )}
                        </Space>
                      </Space>
                    }
                  />
                </List.Item>
              )}
            />
          </>
        )}
      </Space>
    </Modal>
  );
}
