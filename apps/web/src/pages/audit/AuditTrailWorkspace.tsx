/**
 * 「查谁改了什么」这件事的工作区：筛条件 → 看命中列表 → 看某条的变更明细。
 *
 * 三块之所以留在同一个工作区而不再各占一个页面级槽位：它们是同一件事的三步，
 * 用户的视线在这三块之间来回走。切到「验完整性」时它们整体不进 DOM。
 *
 * 流程条只在**能如实推导**时出现（见 audit-object-flow.ts）：必须指定了具体对象、
 * 该类型有后端强制的顺序、且这个对象的日志全在当前这一屏。三条有一条不满足就
 * 不画——宁可不给，也不给一条会骗人的流程条。
 */
import React from "react";
import type { AuditLog } from "@finance-taxation/domain-model";
import { ObjectFlowBar } from "../../components/ui/ObjectFlowBar";
import { AuditDetailPanel } from "./AuditDetailPanel";
import { AuditFiltersBar } from "./AuditFiltersBar";
import { AuditLogTablePanel } from "./AuditLogTablePanel";
import { buildAuditFlowTitle, buildAuditTrailFlow } from "./audit-object-flow";
import { renderAuditChanges } from "./AuditChangesView";

export interface AuditTrailWorkspaceProps {
  logs: AuditLog[];
  loading: boolean;
  total: number;
  limit: number;
  offset: number;
  navResourceId: string;
  expandedId: string | null;
  selectedLogId: string;
  resourceType: string;
  resourceId: string;
  fromDate: string;
  toDate: string;
  onResourceTypeChange: (value: string) => void;
  onResourceIdChange: (value: string) => void;
  onFromDateChange: (value: string) => void;
  onToDateChange: (value: string) => void;
  onSearch: () => void;
  onReset: () => void;
  onToggleExpanded: (logId: string) => void;
  onSelectLog: (logId: string) => void;
  onNavigate: (path: string, state?: Record<string, string>) => void;
  onPrevPage: () => void;
  onNextPage: () => void;
}

export function AuditTrailWorkspace({
  logs,
  loading,
  total,
  limit,
  offset,
  navResourceId,
  expandedId,
  selectedLogId,
  resourceType,
  resourceId,
  fromDate,
  toDate,
  onResourceTypeChange,
  onResourceIdChange,
  onFromDateChange,
  onToDateChange,
  onSearch,
  onReset,
  onToggleExpanded,
  onSelectLog,
  onNavigate,
  onPrevPage,
  onNextPage
}: AuditTrailWorkspaceProps) {
  const tracedResourceId = resourceId || navResourceId;
  const flow = buildAuditTrailFlow({
    resourceType,
    resourceId: tracedResourceId,
    logs,
    total,
    limit,
    offset
  });

  return (
    <div style={{ display: "grid", gap: "20px" }}>
      <AuditFiltersBar
        resourceType={resourceType}
        resourceId={resourceId}
        fromDate={fromDate}
        toDate={toDate}
        onResourceTypeChange={onResourceTypeChange}
        onResourceIdChange={onResourceIdChange}
        onFromDateChange={onFromDateChange}
        onToDateChange={onToDateChange}
        onSearch={onSearch}
        onReset={onReset}
      />

      {flow ? <ObjectFlowBar flow={flow} title={buildAuditFlowTitle(tracedResourceId)} /> : null}

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "minmax(0, 1.1fr) minmax(320px, 0.9fr)",
          gap: "24px",
          alignItems: "start"
        }}
      >
        <AuditLogTablePanel
          logs={logs}
          loading={loading}
          navResourceId={navResourceId}
          expandedId={expandedId}
          selectedLogId={selectedLogId}
          total={total}
          limit={limit}
          offset={offset}
          renderChanges={renderAuditChanges}
          onToggleExpanded={onToggleExpanded}
          onSelectLog={onSelectLog}
          onNavigate={onNavigate}
          onPrevPage={onPrevPage}
          onNextPage={onNextPage}
        />
        <AuditDetailPanel
          log={logs.find((item) => item.id === selectedLogId || item.id === expandedId) ?? null}
          renderChanges={renderAuditChanges}
          onNavigate={onNavigate}
        />
      </div>
    </div>
  );
}
