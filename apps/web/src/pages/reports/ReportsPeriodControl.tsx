/**
 * 报表期间控件（紧凑版，挂在页头动作区）。
 *
 * 改造前它是侧栏一整张「期间上下文」卡片（含期间类型 / 年 / 月 / 季 / 更新按钮 /
 * 快照数量统计），和「选看哪张表」「做快照对比」「打包导出」并排堆着。
 * 期间不是这一页要办的一件事，而是四件事共用的上下文，因此收进页头一行。
 *
 * 为什么不直接用顶栏的全局会计期间选择器：那个只到「月」，
 * 而本页要按月 / 季 / 年三种口径出表，且换期间需要显式「更新报表」再拉数，
 * 全局选择器覆盖不了，去掉会丢功能。
 */
import React from "react";
import type { ReportsPeriodState } from "./report-types";

export type ReportsPeriodControlProps = ReportsPeriodState & {
  onPeriodTypeChange: (value: ReportsPeriodState["periodType"]) => void;
  onYearChange: (value: number) => void;
  onMonthChange: (value: number) => void;
  onQuarterChange: (value: number) => void;
  onReload: () => void;
};

const DEFAULT_YEAR = 2026;

const FIELD_STYLE: React.CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  gap: 6,
  fontSize: 12,
  color: "#6c7a89"
};

const NUMBER_INPUT_STYLE: React.CSSProperties = { width: 72 };

export function ReportsPeriodControl({
  periodType,
  year,
  month,
  quarter,
  onPeriodTypeChange,
  onYearChange,
  onMonthChange,
  onQuarterChange,
  onReload
}: ReportsPeriodControlProps) {
  return (
    <div
      role="group"
      aria-label="报表期间"
      style={{ display: "inline-flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}
    >
      <label style={FIELD_STYLE}>
        期间
        <select
          aria-label="期间类型"
          value={periodType}
          onChange={(event) => onPeriodTypeChange(event.target.value as ReportsPeriodState["periodType"])}
        >
          <option value="month">月度</option>
          <option value="quarter">季度</option>
          <option value="year">年度</option>
        </select>
      </label>
      <input
        type="number"
        aria-label="年份"
        value={year}
        style={NUMBER_INPUT_STYLE}
        onChange={(event) => onYearChange(Number(event.target.value || DEFAULT_YEAR))}
      />
      {periodType === "month" ? (
        <input
          type="number"
          aria-label="月份"
          min={1}
          max={12}
          value={month}
          style={NUMBER_INPUT_STYLE}
          onChange={(event) => onMonthChange(Number(event.target.value || 1))}
        />
      ) : null}
      {periodType === "quarter" ? (
        <input
          type="number"
          aria-label="季度"
          min={1}
          max={4}
          value={quarter}
          style={NUMBER_INPUT_STYLE}
          onChange={(event) => onQuarterChange(Number(event.target.value || 1))}
        />
      ) : null}
      <button className="btn btn-primary" onClick={onReload}>
        更新报表
      </button>
    </div>
  );
}
