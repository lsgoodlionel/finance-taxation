/**
 * 审计日志 changes 字段的渲染。
 *
 * 从 AuditPage.tsx 里搬出来：它有 4 种形状要分支处理（before/after、data、
 * 逐字段 from/to、扁平对象），近 90 行，和页面的状态管理搅在一起看不清主线。
 * 搬出来之后页面只剩「取数 + 组装工作区」，这块也可以单独被测。
 */
import React from "react";

const FIELD_LABELS: Record<string, string> = {
  status: "状态", title: "标题", summary: "摘要", type: "类型",
  amount: "金额", priority: "优先级", name: "名称", description: "描述",
  postedAt: "过账时间", entryCount: "分录条数", period: "账期",
  employeeCount: "员工数", contractType: "合同类型", from: "变更前", to: "变更后"
};

const VALUE_LABELS: Record<string, string> = {
  draft: "草稿", analyzed: "已分析", awaiting_documents: "待资料",
  awaiting_approval: "待审批", blocked: "已阻塞",
  review_required: "待审核", approved: "已审核", posted: "已过账",
  not_started: "待开始", in_progress: "进行中", completed: "已完成",
  pending: "待处理", cancelled: "已取消", archived: "已归档",
  confirmed: "已确认", high: "高", medium: "中", low: "低"
};

const BLOCK_STYLE: React.CSSProperties = { fontSize: "11.5px", lineHeight: 1.7 };
const KEY_STYLE: React.CSSProperties = { color: "#6c7a89" };
const BEFORE_STYLE: React.CSSProperties = { color: "#dc2626" };
const AFTER_STYLE: React.CSSProperties = { color: "#1a7f5a" };
const ARROW_STYLE: React.CSSProperties = { color: "#9aa5b4", margin: "0 4px" };

export function describeAuditField(key: string): string {
  return FIELD_LABELS[key] ?? key;
}

export function formatAuditValue(value: unknown): string {
  if (value === null || value === undefined) return "—";
  const raw = String(value);
  return VALUE_LABELS[raw] ?? raw;
}

function isFromToShape(changes: Record<string, unknown>): boolean {
  const keys = Object.keys(changes);
  return (
    keys.length > 0 &&
    keys.every((key) => {
      const value = changes[key];
      return value !== null && typeof value === "object" && ("from" in (value as object) || "to" in (value as object));
    })
  );
}

function TransitionRow({ label, before, after }: { label: string; before: unknown; after: unknown }) {
  return (
    <div>
      <span style={KEY_STYLE}>{label}：</span>
      <span style={BEFORE_STYLE}>{formatAuditValue(before)}</span>
      <span style={ARROW_STYLE}>→</span>
      <span style={AFTER_STYLE}>{formatAuditValue(after)}</span>
    </div>
  );
}

function PlainRow({ label, value }: { label: string; value: unknown }) {
  return (
    <div>
      <span style={KEY_STYLE}>{label}：</span>
      <span>{formatAuditValue(value)}</span>
    </div>
  );
}

export function AuditChangesView({ changes }: { changes: Record<string, unknown> | null }) {
  if (!changes) return null;

  if ("before" in changes || "after" in changes) {
    const before = (changes.before ?? {}) as Record<string, unknown>;
    const after = (changes.after ?? {}) as Record<string, unknown>;
    const keys = Array.from(new Set([...Object.keys(before), ...Object.keys(after)]));
    return (
      <div style={BLOCK_STYLE}>
        {keys.map((key) => (
          <TransitionRow key={key} label={describeAuditField(key)} before={before[key]} after={after[key]} />
        ))}
      </div>
    );
  }

  if ("data" in changes) {
    const data = (changes.data ?? {}) as Record<string, unknown>;
    return (
      <div style={BLOCK_STYLE}>
        {Object.entries(data).map(([key, value]) => (
          <PlainRow key={key} label={describeAuditField(key)} value={value} />
        ))}
      </div>
    );
  }

  if (isFromToShape(changes)) {
    return (
      <div style={BLOCK_STYLE}>
        {Object.keys(changes).map((key) => {
          const value = changes[key] as Record<string, unknown>;
          return <TransitionRow key={key} label={describeAuditField(key)} before={value.from} after={value.to} />;
        })}
      </div>
    );
  }

  return (
    <div style={BLOCK_STYLE}>
      {Object.keys(changes).map((key) => (
        <PlainRow key={key} label={describeAuditField(key)} value={changes[key]} />
      ))}
    </div>
  );
}

/** 表格/详情面板仍按回调接收渲染函数，这里给一个统一实现，避免两处各写一份。 */
export function renderAuditChanges(changes: Record<string, unknown> | null): React.ReactNode {
  return <AuditChangesView changes={changes} />;
}
