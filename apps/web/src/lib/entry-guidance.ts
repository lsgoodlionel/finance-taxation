export const APP_ENTRY_GUIDANCE =
  "先从 AI 财税助手或经营事项总线进入，再推进任务、单据、凭证、税务与导出。";

export const LOGIN_GATE_SUBTITLE = `企业财税工作台 · ${APP_ENTRY_GUIDANCE}`;

export const SIDEBAR_BRAND_SUBTITLE = APP_ENTRY_GUIDANCE;

export const ASSISTANT_ENTRY_SUBTITLE =
  "标准入口一：先提问或上传资料，确认分析结果后生成事项，再进入任务、单据、凭证与税务流程。";

export const EVENTS_ENTRY_SUBTITLE =
  "标准入口二：登记业务并执行 AI 分析，再驱动任务、单据、凭证、税务与风险联动。";

export const CHAIRMAN_DASHBOARD_SUBTITLE =
  "用于经营与财税总览，不替代 AI 财税助手和经营事项总线这两个主入口。";

export const RESULT_PAGE_GUIDANCE =
  "结果页：承接主入口已生成的事项、任务、单据、凭证或税务结果，适合查看、复核与导出，不建议作为业务起点。";

export function buildResultPageSubtitle(pageName: string) {
  return `${pageName} · ${RESULT_PAGE_GUIDANCE}`;
}

export const LEGACY_ENTRY_ALIASES = {
  "boss-qa": "/assistant"
} as const;
