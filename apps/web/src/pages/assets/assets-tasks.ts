/**
 * /assets 承载哪三件事（纯逻辑）。
 *
 * 与 /bills 同一套约定：容器出壳层，一次只有一件事进 DOM，当前这件事写在 ?tab= 上。
 *
 * 为什么这三件事同页：它们都是「总账之外、但直接产出总账凭证」的台账型工作——
 * 固定资产按月产折旧凭证、定期凭证按月产草稿、往来核销维护应收应付的逐笔状态。
 * 各自单开一个导航项会把侧栏从 17 项撑到 20 项，而这三件事在时间上高度同步：
 * 都在月结前后做。
 */
import type { TaskDef } from "../../lib/task-focus";

export const ASSETS_TAB_QUERY_KEY = "tab";

export const ASSETS_TAB_KEYS = {
  fixedAssets: "fixed-assets",
  aging: "aging",
  recurring: "recurring"
} as const;

export type AssetsTabKey = (typeof ASSETS_TAB_KEYS)[keyof typeof ASSETS_TAB_KEYS];

export const DEFAULT_ASSETS_TAB: AssetsTabKey = ASSETS_TAB_KEYS.fixedAssets;

export function isAssetsTabKey(value: string | null | undefined): value is AssetsTabKey {
  return (
    typeof value === "string" &&
    (Object.values(ASSETS_TAB_KEYS) as string[]).includes(value)
  );
}

const TAB_TITLES: Record<AssetsTabKey, string> = {
  [ASSETS_TAB_KEYS.fixedAssets]: "固定资产台账",
  [ASSETS_TAB_KEYS.aging]: "往来账龄与核销",
  [ASSETS_TAB_KEYS.recurring]: "定期凭证模板"
};

export function getAssetsTabTitle(tab: string): string {
  return isAssetsTabKey(tab) ? TAB_TITLES[tab] : TAB_TITLES[DEFAULT_ASSETS_TAB];
}

const TASK_DEFS: Record<AssetsTabKey, TaskDef> = {
  [ASSETS_TAB_KEYS.fixedAssets]: {
    key: ASSETS_TAB_KEYS.fixedAssets,
    label: "固定资产",
    description: "登记设备等固定资产，每月按直线法计提折旧，处置时算清损益。"
  },
  [ASSETS_TAB_KEYS.aging]: {
    key: ASSETS_TAB_KEYS.aging,
    label: "往来账龄",
    description: "看清每家客户欠了多久、哪几笔超了账期，收到款逐笔核销。"
  },
  [ASSETS_TAB_KEYS.recurring]: {
    key: ASSETS_TAB_KEYS.recurring,
    label: "定期凭证",
    description: "房租、摊销这类每月固定发生的凭证做成模板，每期一键生成草稿。"
  }
};

export function buildAssetsTasks(): TaskDef[] {
  return [
    ASSETS_TAB_KEYS.fixedAssets,
    ASSETS_TAB_KEYS.aging,
    ASSETS_TAB_KEYS.recurring
  ].map((key) => TASK_DEFS[key]);
}
