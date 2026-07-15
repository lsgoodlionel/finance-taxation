/**
 * 场景动词命令（K4 场景引导 v3）
 * 命令面板中的「场景」分组：用业务语言（而非模块名）一键直达对应流程起点。
 * V7 双轨：
 * - guided 视角以老板/员工口吻命名（记一笔 / 传票据 / 查一笔钱去哪了…），副标题用白话；
 * - pro 视角追加纯财务动词（结转损益 / 锁账 / 出申报底稿…）；
 * - modes 缺省 = 两种模式都展示。
 */
import type { WorkspaceMode } from "./workspace-mode";

export interface SceneCommand {
  /** 唯一标识，用于 React key */
  key: string;
  /** 中文名（列表主标题） */
  label: string;
  /** 副标题，说明命令的作用 */
  description: string;
  /** guided 模式下的白话副标题（缺省复用 description） */
  guidedDescription?: string;
  /** 目标路由（可带 query string） */
  path: string;
  /** 搜索关键词别名，用于模糊匹配（不含 label 本身，label 始终参与匹配） */
  keywords: string[];
  /** 可见模式；缺省 = guided 与 pro 均展示 */
  modes?: WorkspaceMode[];
}

export const SCENE_COMMANDS: SceneCommand[] = [
  // ── guided 视角：老板/员工口吻的业务动词 ──────────────────────────────────
  {
    key: "scene-quick-entry",
    label: "记一笔",
    description: "花了钱、收了钱、发生了新业务，拍张照或说一句话就能记下来",
    path: "/quick-entry",
    keywords: ["记一笔", "记账", "新业务", "花钱", "收钱", "录入", "quick"],
    modes: ["guided"],
  },
  {
    key: "scene-upload-bill",
    label: "传票据",
    description: "把发票、收据、银行回单拍照传上来，财务会接手处理",
    path: "/bills",
    keywords: ["传票据", "上传", "拍照", "票据", "收据", "回单", "upload"],
    modes: ["guided"],
  },
  {
    key: "scene-trace-money",
    label: "查一笔钱去哪了",
    description: "按时间顺序翻流水账，看每一笔钱的来龙去脉",
    path: "/ledger?ledgerTab=journal",
    keywords: ["查钱", "钱去哪了", "流水", "序时账", "查一笔", "去向", "journal"],
    modes: ["guided"],
  },
  {
    key: "scene-reimburse",
    label: "给员工报销",
    description: "员工垫付的钱，记一笔报销，后续由财务跟进处理",
    path: "/quick-entry",
    keywords: ["报销", "员工报销", "垫付", "差旅", "reimburse"],
    modes: ["guided"],
  },
  {
    key: "scene-customer-invoice",
    label: "客户要发票",
    description: "客户要开发票，去发票页签处理开票相关事宜",
    path: "/bills?tab=invoices",
    keywords: ["开发票", "开票", "客户发票", "销项", "要发票"],
    modes: ["guided"],
  },
  {
    key: "scene-business-overview",
    label: "看经营情况",
    description: "赚了多少、现金还剩多少、有没有风险，一屏看懂",
    path: "/dashboard/chairman",
    keywords: ["经营情况", "赚了多少", "驾驶舱", "经营报告", "老板看板", "dashboard"],
    modes: ["guided"],
  },
  // ── 双轨共用的高频场景 ───────────────────────────────────────────────────
  {
    key: "scene-payroll",
    label: "发工资",
    description: "进入工资域，发放本期工资",
    guidedDescription: "到点发工资了，进工资页面把这个月的工资发出去",
    path: "/payroll",
    keywords: ["工资", "发放工资", "薪酬", "算工资", "payroll", "发薪"],
  },
  {
    key: "scene-invoice",
    label: "收到发票 / 录入票据",
    description: "进入票据中心 - 发票页签，录入新收到的发票",
    guidedDescription: "收到的发票传上来，系统自动识别登记",
    path: "/bills?tab=invoices",
    keywords: ["发票", "录入发票", "录入票据", "票据", "invoice", "收票"],
  },
  {
    key: "scene-tax",
    label: "要报税 / 申报",
    description: "进入税务中心，计算税额并生成申报资料",
    guidedDescription: "该报税了，进税务页面看要交多少、怎么报",
    path: "/tax",
    keywords: ["报税", "申报", "纳税", "税务", "tax", "缴税"],
  },
  {
    key: "scene-close",
    label: "月底结账",
    description: "进入月末结账流程",
    guidedDescription: "月底了，把这个月的账整理收尾",
    path: "/close",
    keywords: ["结账", "月末结账", "月结", "close", "结账清单"],
  },
  {
    key: "scene-export",
    label: "导出资料 / 打印",
    description: "进入导出与归档中心，导出或打印财税资料",
    guidedDescription: "要给银行、老板或税务局的资料，一键导出打印",
    path: "/export-center",
    keywords: ["导出", "打印", "归档", "导出中心", "资料包", "export", "pdf"],
  },
  {
    key: "scene-ask-ai",
    label: "问 AI",
    description: "打开 AI 助手，检索政策、解读数据、生成草稿",
    guidedDescription: "有任何财税问题，用大白话直接问",
    path: "/assistant",
    keywords: ["问ai", "ai", "助手", "提问", "问问题", "assistant"],
  },
  // ── pro 视角：纯财务动词 ─────────────────────────────────────────────────
  {
    key: "scene-new-event",
    label: "登记经营事项",
    description: "在事项总线登记新的经营事项，作为财税处理的起点",
    path: "/events",
    keywords: ["记一笔", "新业务", "新增事项", "经营事项", "event", "事项总线"],
    modes: ["pro"],
  },
  {
    key: "scene-carryover",
    label: "结转损益",
    description: "进入月末结账流程，执行损益结转",
    path: "/close",
    keywords: ["结转", "损益结转", "期末结转", "carryover"],
    modes: ["pro"],
  },
  {
    key: "scene-lock-period",
    label: "锁账 / 期间管理",
    description: "进入账簿 - 期间页签，锁定已结账期间",
    path: "/ledger?ledgerTab=periods",
    keywords: ["锁账", "期间", "锁定期间", "关账", "period"],
    modes: ["pro"],
  },
  {
    key: "scene-tax-workpaper",
    label: "出申报底稿",
    description: "进入税务中心，生成本期申报底稿",
    path: "/tax",
    keywords: ["底稿", "申报底稿", "税务底稿", "workpaper"],
    modes: ["pro"],
  },
];

/** 命令在指定模式下是否可见（未声明 modes = 两种模式都可见）。 */
export function isCommandVisibleInMode(command: SceneCommand, mode: WorkspaceMode): boolean {
  return !command.modes || command.modes.includes(mode);
}

/** 取命令在指定模式下的副标题：guided 优先用白话版。 */
export function sceneCommandDescription(command: SceneCommand, mode: WorkspaceMode): string {
  if (mode === "guided" && command.guidedDescription) return command.guidedDescription;
  return command.description;
}

/** 场景命令是否匹配搜索词（label / keywords 任一命中即可，忽略大小写）。 */
export function matchSceneCommand(command: SceneCommand, query: string): boolean {
  const term = query.trim().toLowerCase();
  if (term.length === 0) return true;
  if (command.label.toLowerCase().includes(term)) return true;
  return command.keywords.some((kw) => kw.toLowerCase().includes(term));
}

/** 按搜索词过滤场景命令列表；传入 mode 时同时按模式过滤。 */
export function filterSceneCommands(query: string, mode?: WorkspaceMode): SceneCommand[] {
  return SCENE_COMMANDS.filter(
    (cmd) => matchSceneCommand(cmd, query) && (mode === undefined || isCommandVisibleInMode(cmd, mode))
  );
}
