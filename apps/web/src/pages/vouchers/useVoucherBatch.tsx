import { useMemo, useState } from "react";
import { Modal, Typography } from "antd";
import { toast } from "sonner";
import type { Voucher } from "@finance-taxation/domain-model";
import { approveVoucher, postVoucher, validateVoucher } from "../../lib/api";
import { buildValidationHints } from "./validation-hints";
import {
  formatVoucherCode,
  runSequentialBatch,
  splitBatchTargets,
  voucherAmount,
  type BatchItemResult,
} from "./voucher-actions";

const { Text } = Typography;

export interface VoucherBatchProgress {
  label: string;
  done: number;
  total: number;
}

interface UseVoucherBatchOptions {
  vouchers: Voucher[];
  /** 批量结束后刷新列表/详情。 */
  onCompleted: () => Promise<void>;
}

function renderResultList(results: BatchItemResult[]) {
  const succeeded = results.filter((result) => result.ok);
  const failed = results.filter((result) => !result.ok);
  return (
    <div style={{ fontSize: 12, display: "grid", gap: 6 }}>
      {succeeded.length > 0 && (
        <div>
          <Text strong>成功（{succeeded.length} 张）：</Text>
          <div>{succeeded.map((result) => formatVoucherCode(result.id)).join("、")}</div>
        </div>
      )}
      {failed.length > 0 && (
        <div>
          <Text strong type="danger">失败（{failed.length} 张）：</Text>
          {failed.map((result) => (
            <div key={result.id}>{formatVoucherCode(result.id)}：{result.message}</div>
          ))}
        </div>
      )}
    </div>
  );
}

/** 批量审核 worker：先借贷校验，通过才审核；失败原因带修复建议。 */
async function approveWithValidation(voucher: Voucher): Promise<void> {
  const result = await validateVoucher(voucher.id);
  if (!result.valid) {
    const firstHint = buildValidationHints({ ...result, lines: voucher.lines })[0];
    throw new Error(firstHint ? `校验未通过：${firstHint.problem}` : "借贷校验未通过");
  }
  await approveVoucher(voucher.id);
}

/**
 * V7 L2 批量操作：勾选集合、顺序批量审核 / 过账（进度 n/m、单条失败不中断、
 * 结束汇总成功/失败清单，失败项保留勾选便于修正后重试）。
 */
export function useVoucherBatch({ vouchers, onCompleted }: UseVoucherBatchOptions) {
  const [checkedIds, setCheckedIds] = useState<string[]>([]);
  const [running, setRunning] = useState(false);
  const [progress, setProgress] = useState<VoucherBatchProgress | null>(null);

  const targets = useMemo(() => splitBatchTargets(vouchers, checkedIds), [vouchers, checkedIds]);

  function toggleChecked(id: string) {
    setCheckedIds((current) =>
      current.includes(id) ? current.filter((checked) => checked !== id) : [...current, id]
    );
  }

  function replaceChecked(ids: readonly string[]) {
    setCheckedIds([...ids]);
  }

  function clearChecked() {
    setCheckedIds([]);
  }

  async function executeBatch(
    label: string,
    items: readonly Voucher[],
    worker: (voucher: Voucher) => Promise<void>,
    buildSuccessToast: (count: number) => string
  ) {
    setRunning(true);
    setProgress({ label, done: 0, total: items.length });
    try {
      const results = await runSequentialBatch(items, worker, ({ done, total }) =>
        setProgress({ label, done, total })
      );
      const failed = results.filter((result) => !result.ok);
      const succeededCount = results.length - failed.length;
      // 失败项保留勾选，修正后可直接重试
      setCheckedIds(failed.map((result) => result.id));
      await onCompleted();
      const summaryModal = failed.length === 0 ? Modal.success : Modal.warning;
      summaryModal({
        title: failed.length === 0
          ? `${label}完成：成功 ${succeededCount} 张`
          : `${label}完成：成功 ${succeededCount} 张，失败 ${failed.length} 张`,
        width: 480,
        content: renderResultList(results),
      });
      if (succeededCount > 0) {
        toast.success(buildSuccessToast(succeededCount));
      } else {
        toast.error(`${label}未成功，请根据失败原因修正后重试`);
      }
    } catch (error) {
      toast.error((error as Error).message);
    } finally {
      setRunning(false);
      setProgress(null);
    }
  }

  function startBatchApprove() {
    if (running || targets.approvable.length === 0) return;
    void executeBatch(
      "批量审核",
      targets.approvable,
      approveWithValidation,
      (count) => `已审核 ${count} 张凭证`
    );
  }

  function startBatchPost() {
    if (running || targets.postable.length === 0) return;
    const postable = targets.postable;
    const totalAmount = postable.reduce((sum, voucher) => sum + voucherAmount(voucher), 0);
    // 过账影响总账和报表：必须二次确认，列出凭证号与合计金额
    Modal.confirm({
      title: `确认批量过账 ${postable.length} 张凭证？`,
      width: 480,
      okText: "确认过账",
      cancelText: "取消",
      content: (
        <div style={{ fontSize: 12, display: "grid", gap: 6 }}>
          <div>过账后将正式记入总账，影响总账和财务报表，不能直接修改：</div>
          <ul style={{ margin: 0, paddingLeft: 18 }}>
            {postable.map((voucher) => (
              <li key={voucher.id}>
                {formatVoucherCode(voucher.id)} · {voucher.summary} · ¥{voucherAmount(voucher).toFixed(2)}
              </li>
            ))}
          </ul>
          <Text strong>合计金额：¥{totalAmount.toFixed(2)}</Text>
        </div>
      ),
      onOk: () =>
        executeBatch(
          "批量过账",
          postable,
          async (voucher) => {
            await postVoucher(voucher.id);
          },
          (count) => `已过账 ${count} 张凭证，将影响总账和报表`
        ),
    });
  }

  return {
    checkedIds,
    running,
    progress,
    approvableCount: targets.approvable.length,
    postableCount: targets.postable.length,
    toggleChecked,
    replaceChecked,
    clearChecked,
    startBatchApprove,
    startBatchPost,
  };
}
