/**
 * V7 Stage K · K2「记一笔」极简录入向导（guided 核心动作，A2 蓝图）。
 * 非财务人员唯一的录入入口：3 步封顶，全程白话，不见科目与借贷。
 * 路由 /quick-entry 由主控接线；本组件可独立渲染与测试（视图见 QuickEntryPageView）。
 */
import React from "react";
import { QuickEntryPageView } from "./QuickEntryPageView";
import { useQuickEntry } from "./useQuickEntry";

export function QuickEntryPage() {
  const controller = useQuickEntry();
  return <QuickEntryPageView controller={controller} />;
}
