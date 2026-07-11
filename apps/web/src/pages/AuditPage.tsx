import { useEffect, useMemo, useState } from "react";
import { useLocation, useNavigate, useSearchParams } from "react-router-dom";
import type { AuditLog } from "@finance-taxation/domain-model";
import { describePageLoadError, listAuditLogs } from "../lib/api";
import { normalizeDrilldownState, resolveAuditContextFromState } from "./drilldown";
import { resolveInitialAuditExpansion } from "./risk-scope";
import { AuditDetailPanel } from "./audit/AuditDetailPanel";
import { AuditFiltersBar } from "./audit/AuditFiltersBar";
import { AuditLogTablePanel } from "./audit/AuditLogTablePanel";
import { AuditPageShell } from "./audit/AuditPageShell";
import { AuditWorkbenchHeader } from "./audit/AuditWorkbenchHeader";
import { readAuditUrlState, writeAuditUrlState } from "./audit/audit-url-state";

const RESOURCE_TYPES = ["", "business_event", "voucher", "document", "contract", "employee", "payroll", "payroll_transfer_batch", "export_job", "tax_item", "risk_finding"];

export function AuditPage() {
  const location = useLocation();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const urlState = useMemo(() => readAuditUrlState(searchParams), [searchParams]);
  const navState = normalizeDrilldownState(location.state);
  const navAuditContext = resolveAuditContextFromState(navState);
  const navResourceType = navAuditContext?.resourceType ?? "";
  const navResourceId = navAuditContext?.resourceId ?? "";
  const [logs, setLogs] = useState<AuditLog[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState("正在加载审计日志...");
  const [resourceType, setResourceType] = useState(urlState.resourceType || navResourceType);
  const [resourceId, setResourceId] = useState(urlState.resourceId || navResourceId);
  const [fromDate, setFromDate] = useState(urlState.from);
  const [toDate, setToDate] = useState(urlState.to);
  const [offset, setOffset] = useState(urlState.offset);
  const [expandedId, setExpandedId] = useState<string | null>(urlState.expandedId || null);
  const [selectedLogId, setSelectedLogId] = useState(urlState.logId);
  const LIMIT = 50;

  useEffect(() => {
    void load(urlState.offset, resourceType, resourceId, fromDate, toDate, urlState.logId, urlState.expandedId);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const next = writeAuditUrlState({
      resourceType,
      resourceId,
      from: fromDate,
      to: toDate,
      offset,
      logId: selectedLogId,
      expandedId: expandedId ?? ""
    });
    if (next.toString() !== searchParams.toString()) {
      setSearchParams(next, { replace: true });
    }
  }, [expandedId, fromDate, offset, resourceId, resourceType, searchParams, selectedLogId, setSearchParams, toDate]);

  async function load(
    off: number,
    rt: string,
    rid: string,
    fd: string,
    td: string,
    logId?: string,
    explicitExpandedId?: string
  ) {
    setLoading(true);
    try {
      const res = await listAuditLogs({
        resourceType: rt || undefined,
        resourceId: rid || undefined,
        from: fd || undefined,
        to: td ? td + "T23:59:59Z" : undefined,
        limit: LIMIT,
        offset: off
      });
      setLogs(res.items);
      const nextExpandedId = explicitExpandedId
        || logId
        || resolveInitialAuditExpansion(
          res.items.map((item) => ({ id: item.id, resourceId: item.resourceId })),
          rid || navResourceId || null
        );
      setExpandedId(nextExpandedId);
      setSelectedLogId(logId || nextExpandedId || "");
      setTotal(res.total);
      setOffset(off);
      setMessage(`${rid ? `当前对象 ${rid}：` : ""}共 ${res.total} 条审计记录`);
    } catch (error) {
      setMessage(describePageLoadError(error));
    } finally {
      setLoading(false);
    }
  }

  function handleSearch() {
    void load(0, resourceType, resourceId, fromDate, toDate, selectedLogId, expandedId ?? "");
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
    <AuditPageShell
      header={<AuditWorkbenchHeader total={total} message={message} navState={navState} />}
      filters={
        <AuditFiltersBar
          resourceTypes={RESOURCE_TYPES}
          resourceType={resourceType}
          resourceId={resourceId}
          fromDate={fromDate}
          toDate={toDate}
          onResourceTypeChange={setResourceType}
          onResourceIdChange={setResourceId}
          onFromDateChange={setFromDate}
          onToDateChange={setToDate}
          onSearch={handleSearch}
          onReset={() => {
            setResourceType("");
            setResourceId("");
            setFromDate("");
            setToDate("");
            setSelectedLogId("");
            setExpandedId(null);
            void load(0, "", "", "", "", "", "");
          }}
        />
      }
      list={
        <AuditLogTablePanel
          logs={logs}
          loading={loading}
          navResourceId={navResourceId}
          expandedId={expandedId}
          selectedLogId={selectedLogId}
          total={total}
          limit={LIMIT}
          offset={offset}
          renderChanges={renderChanges}
          onToggleExpanded={(logId) => setExpandedId((current) => current === logId ? null : logId)}
          onSelectLog={(logId) => setSelectedLogId(logId)}
          onNavigate={(path, state) => navigate(path, { state })}
          onPrevPage={() => void load(Math.max(0, offset - LIMIT), resourceType, resourceId, fromDate, toDate, selectedLogId, expandedId ?? "")}
          onNextPage={() => void load(offset + LIMIT, resourceType, resourceId, fromDate, toDate, selectedLogId, expandedId ?? "")}
        />
      }
      detail={
        <AuditDetailPanel
          log={logs.find((item) => item.id === selectedLogId || item.id === expandedId) ?? null}
          renderChanges={renderChanges}
          onNavigate={(path, state) => navigate(path, { state })}
        />
      }
    />
  );
}
