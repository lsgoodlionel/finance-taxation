/**
 * 「这一笔的明细与历史」——默认收起的只读参考区。
 *
 * 这里放的是**只存在于这条事项上、别的页面查不到**的内容：单据映射（要哪些单据
 * 的计划）、税务映射（税种与处理建议）、凭证草稿的分录、任务树、活动时间轴。
 * 它们改造前各占一节平铺在详情里，和用户此刻要做的判断抢同一屏；但不能删——
 * 删了就再也看不到了，所以收进一个 details，需要时展开。
 *
 * 与 RelatedObjectsPanel 的分工：那边放「别的页面才是正主」的对象（已生成单据、
 * 任务、凭证、税务事项），一律渲染成可跳转的 EntityLink；这边放事项本地明细。
 *
 * 用原生 <details> 而不是 antd Collapse，与 RelatedObjectsPanel 保持一致：
 * 展开/收起的键盘与读屏语义浏览器已经给全了。
 */
import React from "react";
import type { EventDetail } from "../../lib/api";
import {
  useI18n,
  TASK_STATUS_LABELS,
  TASK_PRIORITY_SHORT,
  DOC_STATUS_LABELS,
  DOC_TYPE_LABELS,
  VOUCHER_STATUS_LABELS,
  VOUCHER_TYPE_LABELS,
  TAX_STATUS_LABELS
} from "../../lib/i18n";
import { Term } from "../../components/ui/Term";

const STATUS_BADGE_CLASSES: Record<string, string> = {
  draft: "badge badge-gray",
  awaiting_documents: "badge badge-yellow",
  awaiting_approval: "badge badge-blue",
  analyzed: "badge badge-green",
  blocked: "badge badge-red"
};

function statusBadge(status: string): string {
  return STATUS_BADGE_CLASSES[status] ?? "badge badge-gray";
}

const SUMMARY_STYLE: React.CSSProperties = {
  cursor: "pointer",
  display: "flex",
  alignItems: "center",
  gap: 8,
  fontSize: 13,
  fontWeight: 600,
  color: "#4d5d6c",
  padding: "2px 0"
};

const BODY_STYLE: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))",
  gap: 20,
  marginTop: 14
};

const SECTION_LABEL_STYLE: React.CSSProperties = {
  fontSize: 12,
  fontWeight: 700,
  color: "var(--c-text-muted)",
  letterSpacing: "0.05em",
  marginBottom: 8
};

function RenderTaskTree({ nodes }: { nodes: EventDetail["taskTree"] }) {
  const { t } = useI18n();
  if (!nodes.length) return <p className="text-muted text-sm">当前还没有任务。</p>;
  return (
    <ul style={{ paddingLeft: 20, lineHeight: 1.9, fontSize: 13.5 }}>
      {nodes.map((node) => (
        <li key={node.id}>
          {node.title} · <span className="text-muted">{t(TASK_STATUS_LABELS, node.status)}</span> ·{" "}
          {t(TASK_PRIORITY_SHORT, node.priority)}
          {node.children.length ? <RenderTaskTree nodes={node.children} /> : null}
        </li>
      ))}
    </ul>
  );
}

function DocumentMappings({ items }: { items: EventDetail["documentMappings"] }) {
  const { t } = useI18n();
  if (!items.length) return <p className="text-muted text-sm">暂无单据映射</p>;
  return (
    <table className="data-table">
      <thead>
        <tr>
          <th>类型</th>
          <th>单据</th>
          <th>状态</th>
          <th>部门</th>
        </tr>
      </thead>
      <tbody>
        {items.map((item) => (
          <tr key={item.id}>
            <td>{t(DOC_TYPE_LABELS, item.documentType)}</td>
            <td>
              <div>{item.title}</div>
              {item.notes ? <div className="text-muted text-sm mt-4">{item.notes}</div> : null}
            </td>
            <td>
              <span className={statusBadge(item.status)}>{t(DOC_STATUS_LABELS, item.status)}</span>
            </td>
            <td>{item.ownerDepartment}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function TaxMappings({ items }: { items: EventDetail["taxMappings"] }) {
  const { t } = useI18n();
  if (!items.length) return <p className="text-muted text-sm">暂无税务映射</p>;
  return (
    <table className="data-table">
      <thead>
        <tr>
          <th>税种</th>
          <th>处理建议</th>
          <th>状态</th>
          <th>申报属期</th>
        </tr>
      </thead>
      <tbody>
        {items.map((item) => (
          <tr key={item.id}>
            <td>{item.taxType}</td>
            <td>
              <div>{item.treatment}</div>
              {item.basis ? <div className="text-muted text-sm mt-4">{item.basis}</div> : null}
            </td>
            <td>
              <span className={statusBadge(item.status)}>{t(TAX_STATUS_LABELS, item.status)}</span>
            </td>
            <td>{item.filingPeriod}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function VoucherDrafts({ items }: { items: EventDetail["voucherDrafts"] }) {
  const { t } = useI18n();
  if (!items.length) {
    return (
      <p className="text-muted text-sm">
        暂无<Term k="voucher">凭证</Term>草稿
      </p>
    );
  }
  return (
    <div style={{ display: "grid", gap: 12 }}>
      {items.map((draft) => (
        <div
          key={draft.id}
          style={{ border: "1px solid var(--c-border)", borderRadius: "var(--r-md)", padding: 12 }}
        >
          <div className="flex-row" style={{ marginBottom: 8 }}>
            <span style={{ fontWeight: 600, fontSize: 13.5 }}>{draft.summary}</span>
            <span className={statusBadge(draft.status)}>{t(VOUCHER_STATUS_LABELS, draft.status)}</span>
            <span className="badge badge-gray">{t(VOUCHER_TYPE_LABELS, draft.voucherType)}</span>
          </div>
          <table className="data-table">
            <thead>
              <tr>
                <th>摘要</th>
                <th>
                  <Term k="account">科目</Term>
                </th>
                <th>
                  <Term k="debit">借方</Term>
                </th>
                <th>
                  <Term k="credit">贷方</Term>
                </th>
              </tr>
            </thead>
            <tbody>
              {draft.lines.map((line) => (
                <tr key={line.id}>
                  <td>{line.summary}</td>
                  <td>
                    {line.accountCode} {line.accountName}
                  </td>
                  <td>{line.debit}</td>
                  <td>{line.credit}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ))}
    </div>
  );
}

function ActivityTimeline({ items }: { items: EventDetail["activities"] }) {
  if (!items.length) return <p className="text-muted text-sm">暂无活动记录</p>;
  return (
    <div style={{ display: "grid", gap: 8 }}>
      {items.map((activity) => (
        <div
          key={activity.id}
          style={{ fontSize: 13, lineHeight: 1.7, borderLeft: "2px solid var(--c-border)", paddingLeft: 12 }}
        >
          <span className="text-muted">
            {activity.createdAt?.slice(0, 16)} · {activity.actorName}
          </span>
          <div>{activity.summary}</div>
        </div>
      ))}
    </div>
  );
}

export interface EventReferenceDetailsProps {
  detail: EventDetail;
}

export function EventReferenceDetails({ detail }: EventReferenceDetailsProps) {
  return (
    <details className="v3-section-shell" data-tone="muted" style={{ padding: "12px 16px", display: "block" }}>
      <summary style={SUMMARY_STYLE}>
        <span>这一笔的明细与历史</span>
        <span className="text-muted text-sm">
          单据映射 · 税务映射 · 草稿<Term k="journal-entry">分录</Term> · 任务树 · 活动记录
        </span>
      </summary>
      <div style={BODY_STYLE}>
        <div>
          <div style={SECTION_LABEL_STYLE}>单据映射</div>
          <DocumentMappings items={detail.documentMappings} />
        </div>
        <div>
          <div style={SECTION_LABEL_STYLE}>税务映射</div>
          <TaxMappings items={detail.taxMappings} />
        </div>
        <div>
          <div style={SECTION_LABEL_STYLE}>
            <Term k="voucher">凭证</Term>草稿
          </div>
          <VoucherDrafts items={detail.voucherDrafts} />
        </div>
        <div>
          <div style={SECTION_LABEL_STYLE}>任务树</div>
          <RenderTaskTree nodes={detail.taskTree} />
        </div>
        <div>
          <div style={SECTION_LABEL_STYLE}>活动时间轴</div>
          <ActivityTimeline items={detail.activities} />
        </div>
      </div>
    </details>
  );
}
