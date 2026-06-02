import type { Task, TaxItem, Voucher } from "@finance-taxation/domain-model";
import { shortId } from "./documents-helpers";

type DocumentRelationsPanelProps = {
  tasks: (Task & { isOverdue?: boolean })[];
  taxItems: TaxItem[];
  vouchers: Voucher[];
  onViewTasks: () => void;
  onViewTax: () => void;
  onViewVouchers: () => void;
};

const cardStyle = { border: "1px solid rgba(20,40,60,0.08)", borderRadius: "10px", padding: "12px 14px" } as const;
const headerRow = { display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "8px" } as const;
const linkBtn = { color: "#2563eb", background: "none", border: "none", cursor: "pointer", fontSize: "12px", padding: 0 } as const;
const listStyle = { margin: 0, paddingLeft: "18px", lineHeight: 1.8, fontSize: "12.5px" } as const;
const emptyStyle = { color: "#9aa5b4", fontSize: "12px" } as const;

export function DocumentRelationsPanel({
  tasks,
  taxItems,
  vouchers,
  onViewTasks,
  onViewTax,
  onViewVouchers
}: DocumentRelationsPanelProps) {
  return (
    <div style={{ display: "grid", gap: "12px" }}>
      <div style={cardStyle}>
        <div style={headerRow}>
          <h4 style={{ margin: 0, fontSize: "13.5px" }}>关联任务</h4>
          <button onClick={onViewTasks} style={linkBtn}>查看任务中心</button>
        </div>
        {tasks.length > 0 ? (
          <ul style={listStyle}>
            {tasks.map((task) => (
              <li key={task.id}>{task.title}｜{task.assigneeDepartment || "未分配"}｜{task.status}</li>
            ))}
          </ul>
        ) : (
          <div style={emptyStyle}>暂无关联任务</div>
        )}
      </div>

      <div style={cardStyle}>
        <div style={headerRow}>
          <h4 style={{ margin: 0, fontSize: "13.5px" }}>关联税务事项</h4>
          <button onClick={onViewTax} style={linkBtn}>查看税务中心</button>
        </div>
        {taxItems.length > 0 ? (
          <ul style={listStyle}>
            {taxItems.map((item) => (
              <li key={item.id}>{item.taxType}｜{item.filingPeriod}｜{item.treatment}</li>
            ))}
          </ul>
        ) : (
          <div style={emptyStyle}>暂无关联税务事项</div>
        )}
      </div>

      <div style={cardStyle}>
        <div style={headerRow}>
          <h4 style={{ margin: 0, fontSize: "13.5px" }}>关联凭证</h4>
          <button onClick={onViewVouchers} style={linkBtn}>查看凭证中心</button>
        </div>
        {vouchers.length > 0 ? (
          <ul style={listStyle}>
            {vouchers.map((voucher) => (
              <li key={voucher.id}>V-{shortId(voucher.id)}｜{voucher.summary}｜{voucher.status}</li>
            ))}
          </ul>
        ) : (
          <div style={emptyStyle}>暂无关联凭证</div>
        )}
      </div>
    </div>
  );
}
