import React, { type ReactNode } from "react";

/**
 * /audit 的骨架：只剩「页头 + 当前这件事的工作区」两块。
 *
 * 改造前是 5 个平级槽位（页头、全站 10 环节导航条、过滤条、日志表、详情面板）。
 * 全站导航条移除的理由与 /ledger、/tax 一致：它的 done/current 是按当前页在
 * 数组里的下标算的，跟审计数据没有任何关系，本质是第二套主导航——左侧菜单已经
 * 在做同一件事，而且在这一页它还会跟「这个对象走到哪了」的对象级流程条撞脸。
 *
 * 过滤条、日志表、详情面板不再是骨架的槽位：它们同属「查谁改了什么」这一件事，
 * 由该任务的工作区自己组织（切到「验完整性」时它们整体不进 DOM）。
 */
type AuditPageShellProps = {
  header: ReactNode;
  children: ReactNode;
};

export function AuditPageShell({ header, children }: AuditPageShellProps) {
  return (
    <div style={{ display: "grid", gap: "24px" }}>
      <section className="v3-hero-shell">{header}</section>
      {children}
    </div>
  );
}
