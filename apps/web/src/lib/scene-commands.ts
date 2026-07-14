/**
 * 场景动词命令（G6 场景引导 v2）
 * 命令面板中的「场景」分组：用业务语言（而非模块名）一键直达对应流程起点。
 * 目标路由使用 Stage G 合并后的新路由，不指向已被重定向的旧路由。
 */

export interface SceneCommand {
  /** 唯一标识，用于 React key */
  key: string;
  /** 中文名（列表主标题） */
  label: string;
  /** 副标题，说明命令的作用 */
  description: string;
  /** 目标路由（可带 query string） */
  path: string;
  /** 搜索关键词别名，用于模糊匹配（不含 label 本身，label 始终参与匹配） */
  keywords: string[];
}

export const SCENE_COMMANDS: SceneCommand[] = [
  {
    key: "scene-payroll",
    label: "发工资",
    description: "进入工资域，发放本期工资",
    path: "/payroll",
    keywords: ["工资", "发放工资", "薪酬", "算工资", "payroll", "发薪"],
  },
  {
    key: "scene-invoice",
    label: "收到发票 / 录入票据",
    description: "进入票据中心 - 发票页签，录入新收到的发票",
    path: "/bills?tab=invoices",
    keywords: ["发票", "录入发票", "录入票据", "票据", "报销", "invoice", "收票"],
  },
  {
    key: "scene-tax",
    label: "要报税 / 申报",
    description: "进入税务中心，计算税额并生成申报资料",
    path: "/tax",
    keywords: ["报税", "申报", "纳税", "税务", "tax", "缴税"],
  },
  {
    key: "scene-close",
    label: "月底结账",
    description: "进入月末结账流程",
    path: "/close",
    keywords: ["结账", "月末结账", "结转", "月结", "close", "结账清单"],
  },
  {
    key: "scene-export",
    label: "导出资料 / 打印",
    description: "进入导出与归档中心，导出或打印财税资料",
    path: "/export-center",
    keywords: ["导出", "打印", "归档", "导出中心", "资料包", "export", "pdf"],
  },
  {
    key: "scene-new-event",
    label: "记一笔 / 新业务",
    description: "登记新的经营事项，作为财税处理的起点",
    path: "/events",
    keywords: ["记一笔", "新业务", "新增事项", "记账", "录入业务", "event", "经营事项"],
  },
];

/** 场景命令是否匹配搜索词（label / keywords 任一命中即可，忽略大小写）。 */
export function matchSceneCommand(command: SceneCommand, query: string): boolean {
  const term = query.trim().toLowerCase();
  if (term.length === 0) return true;
  if (command.label.toLowerCase().includes(term)) return true;
  return command.keywords.some((kw) => kw.toLowerCase().includes(term));
}

/** 按搜索词过滤场景命令列表。 */
export function filterSceneCommands(query: string): SceneCommand[] {
  return SCENE_COMMANDS.filter((cmd) => matchSceneCommand(cmd, query));
}
