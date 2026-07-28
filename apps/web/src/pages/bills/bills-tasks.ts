/**
 * /bills 承载哪三件事（纯逻辑）。
 *
 * 改造前这一页是个纯 Tab 容器：把「单据 / 发票 / 银行」三个**完整页面**原封不动内嵌，
 * 于是容器一份壳、子页再一份壳——用户在同一屏看到两个标题、两条业务链路条，
 * 单据页更是 8 个平级区块起步。
 *
 * 现在容器负责壳层（横幅 / 标题 / 链路条 / 任务切换器），三个子页只提供内容主体。
 * 这么切的前提是三个子页不会被单独访问：App.tsx 里 /documents、/invoices、/banking
 * 已全部 301 到 /bills?tab=，源码里也再无别处引用这三个组件。
 *
 * 深链契约：当前这件事仍写在 ?tab= 上，键名与取值一律不变
 * （tests/e2e/smoke/v7-dual-track.spec.ts 断言 /documents → /bills?tab=documents，
 * lib/scene-commands.ts 也直接指向 /bills?tab=invoices）。
 */
import type { TaskDef } from "../../lib/task-focus";

/** URL 上承载「当前在做哪件事」的查询参数名——沿用既有 ?tab=，不得改名。 */
export const BILLS_TAB_QUERY_KEY = "tab";

export const BILLS_TAB_KEYS = {
  documents: "documents",
  invoices: "invoices",
  banking: "banking"
} as const;

export type BillsTabKey = (typeof BILLS_TAB_KEYS)[keyof typeof BILLS_TAB_KEYS];

export const DEFAULT_BILLS_TAB: BillsTabKey = BILLS_TAB_KEYS.documents;

export function isBillsTabKey(value: string | null | undefined): value is BillsTabKey {
  return typeof value === "string" && Object.prototype.hasOwnProperty.call(BILLS_TAB_KEYS, value);
}

/**
 * 页头标题随当前这件事走：做单据就叫「单据中心」，做发票就叫「发票台账」。
 * 这三个名字原来分别由三个子页各自的 PageHeader 提供，收归容器后不再重复。
 */
const TAB_TITLES: Record<BillsTabKey, string> = {
  [BILLS_TAB_KEYS.documents]: "单据中心",
  [BILLS_TAB_KEYS.invoices]: "发票台账",
  [BILLS_TAB_KEYS.banking]: "银行管理"
};

export function getBillsTabTitle(tab: string): string {
  return isBillsTabKey(tab) ? TAB_TITLES[tab] : TAB_TITLES[DEFAULT_BILLS_TAB];
}

const TASK_DEFS: Record<BillsTabKey, TaskDef> = {
  [BILLS_TAB_KEYS.documents]: {
    key: BILLS_TAB_KEYS.documents,
    label: "单据",
    description: "补齐每一笔业务的原始资料：上传附件、看它挂在哪个事项上，齐了就归档。"
  },
  [BILLS_TAB_KEYS.invoices]: {
    key: BILLS_TAB_KEYS.invoices,
    label: "发票",
    description: "收进来的发票逐张验真、认领到经营事项，再据此生成记账凭证。"
  },
  [BILLS_TAB_KEYS.banking]: {
    key: BILLS_TAB_KEYS.banking,
    label: "银行",
    description: "导入银行流水，和已记的账自动匹配，匹配不上的人工确认。"
  }
};

export function buildBillsTasks(): TaskDef[] {
  return [BILLS_TAB_KEYS.documents, BILLS_TAB_KEYS.invoices, BILLS_TAB_KEYS.banking].map(
    (key) => TASK_DEFS[key]
  );
}
