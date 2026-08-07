import type { Voucher } from "@finance-taxation/domain-model";

/**
 * 凭证字号 —— 《会计基础工作规范》第五十一条要求记账凭证连续编号。
 *
 * 此前 vouchers 表没有任何编号列，主键是各路径规则不同的拼接字符串
 * （`tpl-voucher-${Date.now()}` / `vch-rev-...` / `vch-close-...`），
 * 唯一「像凭证号」的东西在打印 PDF 时临时算出且不落库。系统因此无法回答
 * 「6 月共有多少张凭证」「记-2026-06-0037 在哪里」这类账证核对、审计抽凭、
 * 税务稽查的基本问题。
 */

/** 中式记账凭证的四个字。 */
export type VoucherWord = "记" | "收" | "付" | "转";

/**
 * 凭证类型到凭证字的映射。
 *
 * 中式凭证按资金流向分收/付，其余一律记账凭证。「转」字传统上用于转账凭证，
 * 在只分收付记三类的账套里不产生 —— 保留在类型里是因为期末结转将来可能单独用它，
 * 但**当前没有任何路径产出「转」**，别指望在数据里见到。
 */
export function resolveVoucherWord(voucherType: Voucher["voucherType"] | "closing"): VoucherWord {
  switch (voucherType) {
    case "receipt":
      return "收";
    case "payment":
      return "付";
    default:
      return "记";
  }
}

/** 从会计日期取会计期间。凭证按月重新起编，期间是编号的一部分。 */
export function resolvePeriod(accountingDate: string): string {
  return accountingDate.slice(0, 7);
}

/**
 * 格式化成人能读的凭证号，如 `记-2026-06-0037`。
 *
 * 序号补零到 4 位：中小企业月凭证量极少超过 9999 张，超了也只是位数变长不会出错。
 */
export function formatVoucherNumber(word: VoucherWord, period: string, seq: number): string {
  return `${word}-${period}-${String(seq).padStart(4, "0")}`;
}

/**
 * 解析凭证号回三个组成部分。解析不出来返回 null（而不是抛错或猜）。
 *
 * 存在的意义是让「按凭证号搜索」这类入口能把用户输入的字符串还原成查询条件。
 */
export function parseVoucherNumber(
  input: string
): { word: VoucherWord; period: string; seq: number } | null {
  const match = /^(记|收|付|转)-(\d{4}-\d{2})-(\d+)$/.exec(input.trim());
  if (!match) return null;
  const seq = Number(match[3]);
  if (!Number.isInteger(seq) || seq <= 0) return null;
  return { word: match[1] as VoucherWord, period: match[2]!, seq };
}
