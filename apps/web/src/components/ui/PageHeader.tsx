import React, { type ReactNode } from "react";
import { PageGuideButton } from "./PageGuideButton";

/**
 * 页头。
 *
 * ## V15：本页指南放在这里
 *
 * 第一版把指南按钮放在全局顶栏（面包屑那一行）。用户反馈「合同页右上角没有」
 * ——**他看的是页面标题旁边那一行**，而那才是「每个页面右上角」的自然理解：
 * 这个应用里页面级的操作（刷新、新建、导出）本来就都在那儿。
 *
 * 现在页头自己渲染指南按钮，排在 `actions` 之后（它是辅助，不该抢主操作的位置）。
 *
 * 全局顶栏那个**保留**：有 8 个页面用的是自己的页头而不是这个组件
 * （总账、报表、税务、风险、审计、制度库、AI 助手、工资域），
 * 它们靠顶栏那个兜底。两处都有的页面只会渲染一个——见下面的 `hideGuide`。
 */

type PageHeaderProps = {
  title: string;
  subtitle?: string;
  actions?: ReactNode;
  /**
   * 不显示本页指南按钮。
   *
   * 给「页头之上还有一层壳、壳里已经放了指南」的页面用。
   * 默认显示——**漏显示比多显示糟**：多一个按钮只是冗余，
   * 少一个按钮用户会以为这一页没有指南。
   */
  hideGuide?: boolean;
};

export function PageHeader({ title, subtitle, actions, hideGuide = false }: PageHeaderProps) {
  return (
    <header className="v3-page-header">
      <div>
        <h1>{title}</h1>
        {subtitle ? <p>{subtitle}</p> : null}
      </div>
      {actions || !hideGuide ? (
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          {actions}
          {/* 排在主操作之后：指南是辅助，不该抢「新建」「导出」的位置 */}
          {!hideGuide && <PageGuideButton />}
        </div>
      ) : null}
    </header>
  );
}
