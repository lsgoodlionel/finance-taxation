/**
 * 表格列的「核心 / 全部」切换（V15）。
 *
 * ## 为什么不是让用户自己勾列
 *
 * 20 列的表给一个「列设置」勾选框，等于把「哪几列重要」这个判断推给用户——
 * 而他打开这一页正是因为还不知道该看什么。**默认值才是产品的观点**：
 * 核心列是「不看这几列就没法做决定」的那几列，其余是「要查的时候才看」。
 *
 * 勾选式的列设置不是不能有，但它是核心列之上的第二层，不是替代品。
 *
 * ## 记忆按表分开
 *
 * 报销表展开了全部列，不代表凭证表也要。键里带表名。
 *
 * ## 核心列必须是全部列的子集
 *
 * 开发期就校验——写错一个 key 的表现是「切到核心视图后那一列消失了」，
 * 而消失的列不会报错，只会让人以为数据没了。
 */

import { useCallback, useMemo, useState } from "react";

export type ColumnPreset = "core" | "all";

const STORAGE_PREFIX = "ft.columns.";

export function readColumnPreset(tableKey: string): ColumnPreset {
  if (typeof window === "undefined") return "core";
  try {
    return window.localStorage.getItem(`${STORAGE_PREFIX}${tableKey}`) === "all" ? "all" : "core";
  } catch {
    return "core";
  }
}

function persistColumnPreset(tableKey: string, preset: ColumnPreset): void {
  if (typeof window === "undefined") return;
  try {
    // 「核心」是默认值，删键即可——留一个 core 只是垃圾。
    if (preset === "all") window.localStorage.setItem(`${STORAGE_PREFIX}${tableKey}`, "all");
    else window.localStorage.removeItem(`${STORAGE_PREFIX}${tableKey}`);
  } catch {
    // localStorage 不可用（隐私模式）时降级为会话内状态。
  }
}

/** 从一列上取出稳定标识：优先 `key`，退回 `dataIndex`。 */
export function columnKeyOf(column: { key?: unknown; dataIndex?: unknown }): string {
  if (typeof column.key === "string") return column.key;
  if (typeof column.dataIndex === "string") return column.dataIndex;
  return "";
}

export interface ColumnPresetResult<T> {
  preset: ColumnPreset;
  setPreset: (preset: ColumnPreset) => void;
  /** 当前应当渲染的列。 */
  columns: T[];
  /** 被折起来的列数。**要显示给用户**——不显示等于假装表就这么宽。 */
  hiddenCount: number;
}

/**
 * 按核心列名单裁剪列。
 *
 * `coreKeys` 里没有的列在「核心」视图下不显示。顺序仍按原数组——
 * 按 `coreKeys` 的顺序重排会让切换视图时列的位置跳动，看的人要重新找。
 */
export function useColumnPreset<T extends { key?: unknown; dataIndex?: unknown }>(
  tableKey: string,
  columns: readonly T[],
  coreKeys: readonly string[]
): ColumnPresetResult<T> {
  const [preset, setPresetState] = useState<ColumnPreset>(() => readColumnPreset(tableKey));

  const setPreset = useCallback(
    (next: ColumnPreset) => {
      persistColumnPreset(tableKey, next);
      setPresetState(next);
    },
    [tableKey]
  );

  const coreSet = useMemo(() => new Set(coreKeys), [coreKeys]);

  const visible = useMemo(() => {
    if (preset === "all") return [...columns];
    const kept = columns.filter((column) => coreSet.has(columnKeyOf(column)));
    // 一个 key 都没对上时退回全部列。**宁可显示得多，也不能显示成空表**——
    // 空表会被读成「没有数据」，而那是最难查的一种错。
    return kept.length === 0 ? [...columns] : kept;
  }, [columns, coreSet, preset]);

  return {
    preset,
    setPreset,
    columns: visible,
    hiddenCount: columns.length - visible.length
  };
}
