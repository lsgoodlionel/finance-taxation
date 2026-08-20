/**
 * 导航到不了、但深链与页内跳转能到的页面（V15）。
 *
 * ## 这些页面为什么不在左侧栏
 *
 * 各有各的理由：`/close` 是月末的一次性流程（从总账或首页进）、
 * `/invoices` 与 `/counterparties` 是旧路由（已重定向到合并后的页面）、
 * `/pdf-export` 与 `/archive-package` 是从别的页面点进来的动作页。
 *
 * **但用户到得了就该有指南**——上一轮护栏的口径只算左侧导航，
 * 于是这 11 个页面一个都没覆盖，而用户报的正是「很多页面没有指南」。
 */

import type { PageGuide } from "./types";

export const SECONDARY_GUIDES: readonly PageGuide[] = [
  {
    route: "/",
    title: "首页",
    audience: "所有人",
    purpose: "登录后的落地页，按你的角色跳到最合适的工作台。",
    steps: ["登录后自动跳转，不需要任何操作"],
    flow: "财务角色 → 我的一天；非财务角色 → 今天",
    related: ["/home", "/inbox"]
  },
  {
    route: "/close",
    title: "月末结账",
    audience: "会计、财务负责人",
    permission: "ledger.post",
    purpose: "按 11 个步骤走完月末该做的事，每一步做完打钩，漏了哪一步一眼可见。",
    prerequisites: [
      "本月的业务单据都已录入（报销、付款、发票）",
      "工资已计算并确认"
    ],
    steps: [
      "清理未过账凭证——草稿不进报表，留着会让本月数字偏低",
      "工资确认与社保关账",
      "计提折旧（资产与往来页）",
      "制造业：做成本结转（在结转损益之前）",
      "银行对账，把流水与账面逐笔对上",
      "权责发生制复核：该计提的费用有没有漏",
      "票税一致性检查",
      "增值税期末结转",
      "结转损益（收入费用 → 本年利润）",
      "看试算平衡，平了再出报表",
      "生成期末快照与申报底稿，最后锁账"
    ],
    fields: [
      {
        name: "结账期间",
        meaning: "要结哪个月。",
        note: "**按顺序结**——上个月没结完不能结这个月，否则期初数接不上。"
      }
    ],
    caution: [
      "**锁账之后该期间不能再过账**——发现错账只能解锁（留审计记录）或在下期红冲",
      "十二个月都结完之后才能做年度结转"
    ],
    pitfalls: [
      {
        symptom: "某一步一直打不了钩",
        cause: "那一步的前置条件没满足，比如还有未过账的凭证。",
        fix: "点那一步会跳到对应页面，把待处理的清掉再回来。"
      }
    ],
    flow: "日常记账 → 月末 11 步 → 锁账 → 出报表与申报",
    related: ["/vouchers", "/ledger", "/tax", "/reports", "/cost-carryover"]
  },
  {
    route: "/invoices",
    title: "发票管理（旧路由）",
    audience: "会计",
    purpose: "已合并到「票据中心」，这个地址会自动跳过去。",
    steps: ["打开后自动跳到票据中心，旧书签仍然可用"],
    flow: "旧书签仍然可用",
    related: ["/bills"]
  },
  {
    route: "/counterparties",
    title: "往来单位（旧路由）",
    audience: "业务、财务",
    purpose: "已合并到「合同与往来」的往来单位标签页，这个地址会自动跳过去。",
    steps: ["打开后自动跳到合同与往来，旧书签仍然可用"],
    flow: "旧书签仍然可用",
    related: ["/contracts"]
  },
  {
    route: "/banking",
    title: "银行账户与流水",
    audience: "出纳",
    permission: "banking.manage",
    purpose: "管银行账户档案、导入流水、发起对账。",
    prerequisites: ["会计科目表里有对应的银行存款明细科目"],
    steps: [
      "建银行账户：填开户行、账号、对应科目",
      "导入流水（CSV 或银行 API）",
      "去银行余额调节表逐笔对账"
    ],
    fields: [
      {
        name: "对应科目",
        meaning: "这个银行账户在账上用哪个科目。",
        note: "**一个账户对一个明细科目**。多个账户共用一个科目会让余额调节表分不清是哪个户的钱。"
      }
    ],
    flow: "账户档案 → 流水导入 → 余额调节表 → 封存",
    related: ["/banking/reconciliation", "/payments", "/vouchers"]
  },
  {
    route: "/payroll/transfer",
    title: "代发与社保",
    audience: "人事、出纳",
    permission: "payroll.manage",
    purpose: "生成工资代发文件、跟踪发放状态、管社保公积金申报。",
    prerequisites: ["本期工资已在工资管理里计算并确认"],
    steps: ["选期间，确认代发名单", "生成代发文件", "网银上传后回来标记已发放"],
    caution: ["标记已发放会生成付款凭证——没真发就标记会让账上钱少了而实际还在"],
    flow: "工资计算 → 确认 → 代发文件 → 发放 → 付款凭证",
    related: ["/payroll", "/vouchers", "/tax"]
  },
  {
    route: "/pdf-export",
    title: "PDF 导出",
    audience: "会计、审计",
    permission: "documents.view",
    purpose: "把凭证、报表、工资表导成 PDF 存档或打印。",
    steps: [
      "选要导的类型与会计期间",
      "点预览看排版对不对",
      "在打印对话框里选「另存为 PDF」"
    ],
    flow: "各模块数据 → 打印友好的 HTML → 浏览器出 PDF",
    related: ["/export-center", "/vouchers", "/reports"]
  },
  {
    route: "/archive-package",
    title: "归档资料包",
    audience: "会计、审计",
    permission: "documents.view",
    purpose: "把一个期间的凭证、报表、单据打成一个包，供审计或备查。",
    prerequisites: ["该期间已锁账（未锁账的数据还会变，打包没有意义）"],
    steps: [
      "选期间与要包含的内容（凭证 / 报表 / 单据附件）",
      "点生成，大的期间要等一会",
      "生成完点下载"
    ],
    flow: "锁账 → 打包 → 归档",
    related: ["/export-center", "/audit", "/ledger"]
  },
  {
    route: "/boss-qa",
    title: "老板专线",
    audience: "管理层",
    permission: "dashboard.view",
    purpose: "用白话问经营问题，答案基于公司真实数据，不用懂会计术语。",
    steps: ["直接用白话提问，例如「这个月钱够发工资吗」", "答案里的数字可以点进去看明细"],
    caution: ["回答基于**已过账**的数据，月中问会偏保守"],
    flow: "只读，不改任何数据",
    related: ["/assistant", "/dashboard/chairman"]
  },
  {
    route: "/billing",
    title: "订阅与计费",
    audience: "管理员",
    permission: "settings.manage",
    purpose: "看当前套餐、用量与账单。",
    steps: ["查看当前套餐的用量与剩余额度", "需要更多额度时联系管理员升级套餐"],
    flow: "系统用量统计 → 本页",
    related: ["/settings"]
  },
  {
    route: "/feedback",
    title: "问题反馈",
    audience: "所有人",
    purpose: "把用着不顺的地方反馈给管理员或开发。",
    steps: ["描述问题，能附截图更好", "提交后可以在列表里看处理进度"],
    flow: "反馈 → 管理员处理",
    related: ["/knowledge"]
  }
];
