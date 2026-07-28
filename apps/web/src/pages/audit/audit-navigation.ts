/**
 * 审计日志「跳转」按钮的目标修正。
 *
 * pages/drilldown.ts 的 resolveAuditLogTarget 为每条日志算一个回跳目标，但其中
 * 两条是**假链接**——点了等于什么都没发生。逐个核对每个目标页真的读不读
 * location.state 之后确认：
 *
 * 1. business_event → `/events` + state{businessEventId}。EventsPage 用
 *    `useQueryState("event")` 选中事项，**完全不读 location.state**（源码里连
 *    useLocation 都没有）。所以点「查看事项」只是跳到事项总线首屏，用户还得自己
 *    再找一遍那条事项。components/ui/EntityLink 早就发现并处理了同一个坑
 *    （它给 business_event 配了 queryKey: "event"），只是回跳这条路径没跟上。
 *    修法一致：把 id 带成查询参数，state 一并保留。
 *
 * 2. export_job → `/pdf-export` → 重定向到 `/export-center`。ExportCenterPage
 *    整个组件不读 location.state（Tabs 用的是 defaultActiveKey，连当前 tab 都不受
 *    URL 控制），drilldown.ts 里那段 extractExportScene 算出来的 scene 没有任何人
 *    消费——是死代码。这里不假装能定位到那一条导出任务，只把文案改成它真正能做到
 *    的事：打开导出与归档中心。要真正定位到具体任务，得先让 ExportCenterPage 支持
 *    从 URL 选中历史记录（已在报告里作为跨车道需求提出）。
 *
 * 其余目标逐个验过，都真的会读 state：voucher（VouchersPage）、
 * document（/documents 重定向保留 state → DocumentsPage）、contract（ContractsPage）、
 * tax_item（tax/useTaxWorkspace）、risk_finding（RiskPage）、
 * employee / payroll / payroll_transfer_batch（PayrollDomainPage）。
 */
import type { AuditLog } from "@finance-taxation/domain-model";
import { resolveAuditLogTarget, type DrilldownTarget } from "../drilldown";

/** EventsPage 选中事项用的查询参数名（对齐 EntityLink 的 ENTITY_ROUTES）。 */
const EVENTS_QUERY_KEY = "event";

export function resolveAuditNavigationTarget(log: AuditLog): DrilldownTarget | null {
  const target = resolveAuditLogTarget(log);
  if (!target || !log.resourceId) {
    return target;
  }

  if (log.resourceType === "business_event") {
    return {
      ...target,
      path: `${target.path}?${EVENTS_QUERY_KEY}=${encodeURIComponent(log.resourceId)}`
    };
  }

  if (log.resourceType === "export_job") {
    return { ...target, label: "打开导出与归档中心" };
  }

  return target;
}
