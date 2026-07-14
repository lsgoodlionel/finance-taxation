import { EVENT_TYPE_LABELS as EVENT_TYPE_LABELS_I18N } from "../../lib/i18n";

export const TOKEN_KEY = "finance-taxation-v2-token";
export const STORAGE_KEY = "ft-assistant-history";
export const FLOW_CONTEXT_STORAGE_KEY = `${STORAGE_KEY}:flow-context`;
export const BOSS_ROLES = new Set(["role-chairman", "role-finance-director"]);

export const ROLE_LABELS: Record<string, string> = {
  "role-chairman": "创始人/董事长",
  "role-finance-director": "财务负责人",
  "role-accountant": "会计",
  "role-viewer": "查看者"
};

export const EVENT_TYPE_LABELS = EVENT_TYPE_LABELS_I18N;

export const STAFF_QUICK_PROMPTS = [
  "本月工资已发放，请帮我整理工资相关的财税事项",
  "我们刚签了一笔采购合同，金额50万，请问需要做哪些财税处理？",
  "帮我看一下公司当前的税务风险",
  "有笔销售收款100万进来了，如何入账？",
  "研发费用如何加计扣除？"
];

export const BOSS_QUICK_PROMPTS = [
  "本月资金状况如何？现金够用吗？",
  "我们最大的财务风险是什么？",
  "本月利润估算，与上月比如何？",
  "目前有哪些税要缴？金额多少？",
  "应收账款有多少？有逾期风险吗？"
];
