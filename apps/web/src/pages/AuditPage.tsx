import { useEffect, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import type { AuditLog } from "@finance-taxation/domain-model";
import { listAuditLogs } from "../lib/api";
import { resolveAuditLogTarget } from "./drilldown";

const RESOURCE_TYPE_LABELS: Record<string, string> = {
  business_event: "经营事项",
  voucher: "凭证",
  document: "单据",
  contract: "合同",
  employee: "员工",
  payroll: "工资",
  tax_item: "税务事项",
  risk_finding: "风险发现"
};

const ACTION_LABELS: Record<string, string> = {
  create: "创建",
  update: "更新",
  update_status: "状态变更",
  delete: "删除",
  approve: "审核",
  post: "过账",
  archive: "归档",
  close: "关闭",
  compute: "计算工资",
  confirm: "确认工资",
  analyze: "AI 分析"
};

function panelStyle() {
  return {
    background: "rgba(255,255,255,0.82)",
    borderRadius: "24px",
    border: "1px solid rgba(20,40,60,0.08)",
    padding: "24px"
  } as const;
}

const cell: React.CSSProperties = {
  borderBottom: "1px solid rgba(20,40,60,0.08)",
  padding: "10px 8px",
  textAlign: "left",
  verticalAlign: "top",
  fontSize: "13px"
};

const RESOURCE_TYPES = [
  "", "business_event", "voucher", "document", "contract", "employee", "payroll", "tax_item", "risk_finding"
];

export function AuditPage() {
  const location = useLocation();
  const navigate = useNavigate();
  const navState = (location.state as { resourceType?: string; resourceId?: string } | null) ?? null;
  const navResourceType = navState?.resourceType ?? "";
  const navResourceId = navState?.resourceId ?? "";
  const [logs, setLogs] = useState<AuditLog[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState("正在加载审计日志...");
  const [resourceType, setResourceType] = useState("");
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const [offset, setOffset] = useState(0);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const LIMIT = 50;

  useEffect(() => {
    if (navResourceType) {
      setResourceType(navResourceType);
    }
    void load(0, navResourceType || resourceType, fromDate, toDate, navResourceId || undefined);
  }, []);

  async function load(off: number, rt: string, fd: string, td: string, resourceId?: string) {
    setLoading(true);
    try {
      const res = await listAuditLogs({
        resourceType: rt || undefined,
        resourceId: resourceId || undefined,
        from: fd || undefined,
        to: td ? td + "T23:59:59Z" : undefined,
        limit: LIMIT,
        offset: off
      });
      setLogs(res.items);
      setTotal(res.total);
      setOffset(off);
      setMessage(`${resourceId ? `当前对象 ${resourceId}：` : ""}共 ${res.total} 条审计记录`);
    } catch {
      setMessage("加载失败，请检查后端连接。");
    } finally {
      setLoading(false);
    }
  }

  function handleSearch() {
    load(0, resourceType, fromDate, toDate, navResourceId || undefined);
  }

  function fmtDate(iso: string) {
    return iso ? new Date(iso).toLocaleString("zh-CN", { timeZone: "Asia/Shanghai" }) : "-";
  }

  function actionTag(action: string) {
    const colorMap: Record<string, string> = {
      create: "#1a7f5a",
      approve: "#1a7f5a",
      confirm: "#1a7f5a",
      post: "#2563eb",
      compute: "#2563eb",
      analyze: "#7c3aed",
      update: "#d97706",
      update_status: "#d97706",
      close: "#dc2626",
      archive: "#6c7a89",
      delete: "#dc2626"
    };
    return (
      <span style={{
        fontSize: "11px",
        padding: "2px 8px",
        borderRadius: "4px",
        background: `${colorMap[action] ?? "#6c7a89"}18`,
        color: colorMap[action] ?? "#6c7a89",
        fontWeight: 500,
        whiteSpace: "nowrap" as const
      }}>
        {ACTION_LABELS[action] ?? action}
      </span>
    );
  }

  function renderChanges(changes: Record<string, unknown> | null) {
    if (!changes) return null;

    const fieldLabel: Record<string, string> = {
      status: "状态", title: "标题", summary: "摘要", type: "类型",
      amount: "金额", priority: "优先级", name: "名称", description: "描述",
      postedAt: "过账时间", entryCount: "分录条数", period: "账期",
      employeeCount: "员工数", contractType: "合同类型", from: "变更前", to: "变更后"
    };
    const valueLabel: Record<string, string> = {
      draft: "草稿", analyzed: "已分析", awaiting_documents: "待资料",
      awaiting_approval: "待审批", blocked: "已阻塞",
      review_required: "待审核", approved: "已审核", posted: "已过账",
      not_started: "待开始", in_progress: "进行中", completed: "已完成",
      pending: "待处理", cancelled: "已取消", archived: "已归档",
      confirmed: "已确认", high: "高", medium: "中", low: "低"
    };

    function fmt(v: unknown): string {
      if (v === null || v === undefined) return "—";
      const s = String(v);
      return valueLabel[s] ?? s;
    }

    // Format: { before: {...}, after: {...} }
    if ("before" in changes || "after" in changes) {
      const before = (changes.before ?? {}) as Record<string, unknown>;
      const after = (changes.after ?? {}) as Record<string, unknown>;
      const keys = Array.from(new Set([...Object.keys(before), ...Object.keys(after)]));
      return (
        <div style={{ fontSize: "11.5px", lineHeight: 1.7 }}>
          {keys.map((k) => (
            <div key={k}>
              <span style={{ color: "#6c7a89" }}>{fieldLabel[k] ?? k}：</span>
              <span style={{ color: "#dc2626" }}>{fmt(before[k])}</span>
              <span style={{ color: "#9aa5b4", margin: "0 4px" }}>→</span>
              <span style={{ color: "#1a7f5a" }}>{fmt(after[k])}</span>
            </div>
          ))}
        </div>
      );
    }

    // Format: { data: {...} }
    if ("data" in changes) {
      const data = changes.data as Record<string, unknown>;
      return (
        <div style={{ fontSize: "11.5px", lineHeight: 1.7 }}>
          {Object.entries(data).map(([k, v]) => (
            <div key={k}>
              <span style={{ color: "#6c7a89" }}>{fieldLabel[k] ?? k}：</span>
              <span>{fmt(v)}</span>
            </div>
          ))}
        </div>
      );
    }

    // Format: { fieldName: { from: "...", to: "..." } }  e.g. task status change
    const keys = Object.keys(changes);
    const isFromToFormat = keys.length > 0 && keys.every((k) => {
      const v = changes[k];
      return v !== null && typeof v === "object" && ("from" in (v as object) || "to" in (v as object));
    });
    if (isFromToFormat) {
      return (
        <div style={{ fontSize: "11.5px", lineHeight: 1.7 }}>
          {keys.map((k) => {
            const v = changes[k] as Record<string, unknown>;
            return (
              <div key={k}>
                <span style={{ color: "#6c7a89" }}>{fieldLabel[k] ?? k}：</span>
                <span style={{ color: "#dc2626" }}>{fmt(v.from)}</span>
                <span style={{ color: "#9aa5b4", margin: "0 4px" }}>→</span>
                <span style={{ color: "#1a7f5a" }}>{fmt(v.to)}</span>
              </div>
            );
          })}
        </div>
      );
    }

    // Generic flat key-value fallback
    return (
      <div style={{ fontSize: "11.5px", lineHeight: 1.7 }}>
        {keys.map((k) => (
          <div key={k}>
            <span style={{ color: "#6c7a89" }}>{fieldLabel[k] ?? k}：</span>
            <span>{fmt(changes[k])}</span>
          </div>
        ))}
      </div>
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "24px" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <div>
          <h2 style={{ margin: "0 0 4px", fontSize: "22px" }}>审计日志</h2>
          <div style={{ color: "#6c7a89", fontSize: "13px" }}>{message}</div>
        </div>
      </div>

      {/* 过滤栏 */}
      <div style={{ ...panelStyle(), display: "flex", gap: "12px", alignItems: "flex-end", flexWrap: "wrap" }}>
        <label style={{ display: "flex", flexDirection: "column", gap: "4px", fontSize: "13px" }}>
          操作对象
          <select
            value={resourceType}
            onChange={(e) => setResourceType(e.target.value)}
            style={{ fontSize: "13px", padding: "6px 10px", borderRadius: "8px", border: "1px solid rgba(20,40,60,0.15)" }}
          >
            {RESOURCE_TYPES.map((rt) => (
              <option key={rt} value={rt}>{rt ? (RESOURCE_TYPE_LABELS[rt] ?? rt) : "全部类型"}</option>
            ))}
          </select>
        </label>
        <label style={{ display: "flex", flexDirection: "column", gap: "4px", fontSize: "13px" }}>
          开始日期
          <input
            type="date"
            value={fromDate}
            onChange={(e) => setFromDate(e.target.value)}
            style={{ fontSize: "13px", padding: "6px 10px", borderRadius: "8px", border: "1px solid rgba(20,40,60,0.15)" }}
          />
        </label>
        <label style={{ display: "flex", flexDirection: "column", gap: "4px", fontSize: "13px" }}>
          结束日期
          <input
            type="date"
            value={toDate}
            onChange={(e) => setToDate(e.target.value)}
            style={{ fontSize: "13px", padding: "6px 10px", borderRadius: "8px", border: "1px solid rgba(20,40,60,0.15)" }}
          />
        </label>
        <button
          onClick={handleSearch}
          style={{
            padding: "8px 20px", borderRadius: "8px", border: "none",
            background: "#1e2a37", color: "#fff", fontSize: "13px", cursor: "pointer"
          }}
        >
          查询
        </button>
        {(resourceType || fromDate || toDate) && (
          <button
            onClick={() => { setResourceType(""); setFromDate(""); setToDate(""); load(0, "", "", ""); }}
            style={{
              padding: "8px 16px", borderRadius: "8px", border: "1px solid rgba(20,40,60,0.15)",
              background: "none", color: "#6c7a89", fontSize: "13px", cursor: "pointer"
            }}
          >
            清除过滤
          </button>
        )}
      </div>

      {navResourceId && (
        <div style={{ ...panelStyle(), padding: "12px 16px", fontSize: "13px", color: "#2563eb", background: "rgba(37,99,235,0.08)", border: "1px solid rgba(37,99,235,0.16)" }}>
          当前按对象 <strong>{navResourceId}</strong> 恢复审计上下文。
        </div>
      )}

      {/* 日志表格 */}
      <div style={panelStyle()}>
        {loading ? (
          <div style={{ textAlign: "center", color: "#aab5c0", padding: "40px" }}>加载中...</div>
        ) : logs.length === 0 ? (
          <div style={{ textAlign: "center", color: "#aab5c0", padding: "40px" }}>暂无审计记录</div>
        ) : (
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr style={{ color: "#6c7a89", fontSize: "12px", letterSpacing: "0.04em" }}>
                {["时间", "操作人", "操作类型", "对象类型", "对象标签", "变更详情", "跳转"].map((h) => (
                  <th key={h} style={{ ...cell, fontWeight: 500 }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {logs.map((log) => {
                const isExpanded = expandedId === log.id;
                const hasChanges = !!log.changes;
                const target = resolveAuditLogTarget(log);
                return (
                  <tr key={log.id}>
                    <td style={{ ...cell, whiteSpace: "nowrap" as const, color: "#6c7a89" }}>
                      {fmtDate(log.createdAt)}
                    </td>
                    <td style={cell}>{log.userName ?? log.userId ?? "-"}</td>
                    <td style={cell}>{actionTag(log.action)}</td>
                    <td style={cell}>{RESOURCE_TYPE_LABELS[log.resourceType] ?? log.resourceType}</td>
                    <td style={{ ...cell, background: navResourceId === log.resourceId ? "rgba(37,99,235,0.06)" : "transparent" }}>
                      <div style={{ maxWidth: "240px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" as const }}>
                        {log.resourceLabel ?? log.resourceId ?? "-"}
                      </div>
                    </td>
                    <td style={cell}>
                      {hasChanges ? (
                        <button
                          onClick={() => setExpandedId(isExpanded ? null : log.id)}
                          style={{ fontSize: "11px", padding: "2px 8px", borderRadius: "4px", border: "1px solid rgba(20,40,60,0.15)", background: "none", cursor: "pointer" }}
                        >
                          {isExpanded ? "收起" : "查看变更"}
                        </button>
                      ) : (
                        <span style={{ color: "#aab5c0" }}>-</span>
                      )}
                      {isExpanded && (
                        <div style={{ marginTop: "6px", padding: "8px", background: "rgba(20,40,60,0.04)", borderRadius: "6px", maxWidth: "300px" }}>
                          {renderChanges(log.changes)}
                        </div>
                      )}
                    </td>
                    <td style={cell}>
                      {target ? (
                        <button
                          onClick={() => navigate(target.path, { state: target.state })}
                          style={{ fontSize: "11px", padding: "4px 10px", borderRadius: "4px", border: "1px solid rgba(20,40,60,0.15)", background: "none", cursor: "pointer" }}
                        >
                          {target.label}
                        </button>
                      ) : (
                        <span style={{ color: "#aab5c0" }}>-</span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}

        {/* 分页 */}
        {total > LIMIT && (
          <div style={{ display: "flex", gap: "8px", marginTop: "16px", justifyContent: "center", alignItems: "center", fontSize: "13px" }}>
            <button
              disabled={offset === 0}
              onClick={() => load(Math.max(0, offset - LIMIT), resourceType, fromDate, toDate)}
              style={{ padding: "6px 16px", borderRadius: "8px", border: "1px solid rgba(20,40,60,0.15)", background: "none", cursor: offset === 0 ? "default" : "pointer", color: offset === 0 ? "#aab5c0" : "#1e2a37" }}
            >
              上一页
            </button>
            <span style={{ color: "#6c7a89" }}>{offset + 1} – {Math.min(offset + LIMIT, total)} / {total}</span>
            <button
              disabled={offset + LIMIT >= total}
              onClick={() => load(offset + LIMIT, resourceType, fromDate, toDate)}
              style={{ padding: "6px 16px", borderRadius: "8px", border: "1px solid rgba(20,40,60,0.15)", background: "none", cursor: offset + LIMIT >= total ? "default" : "pointer", color: offset + LIMIT >= total ? "#aab5c0" : "#1e2a37" }}
            >
              下一页
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
